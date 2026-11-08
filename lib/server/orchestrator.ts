/**
 * One chapter relay pass (design §2.4, §2.6; task T-15).
 * Fixed order outline -> style -> continuation -> continuity. A chapter is accepted
 * only on APPROVED plus the server length check. Events are emitted through `emit`
 * so the SSE route (T-16) and tests share one code path.
 */
import "server-only";
import {
  MAX_RETRIES,
  parseContinuityOutput,
  type AcceptedChapter,
  type AgentName,
  type ContinuityFailure,
  type ContinuityResult,
  type ErrorCode,
  type ForeshadowingTransition,
  type RelayReceipt,
  type RestartPoint,
} from "@/lib/pipeline-types";
import type { CharacterStatus, ForeshadowingStatus, StoryBible } from "@/lib/story-bible";
import type { StyleProfile } from "@/lib/style-profile";
import { countUnits, LANGUAGE_LIMITS } from "@/lib/text-units";
import { checkOutline, checkStyle } from "./agent-output";
import type { AgentDefinitions } from "./agent-loader";
import type { ModelClient, Tier } from "./model-client";
import {
  buildMessages,
  CONTINUITY_SCHEMA,
  OUTLINE_SCHEMA,
  OUTPUT_CAPS,
  parseJsonText,
  STYLE_SCHEMA,
  type OutlineOutput,
  type PassContext,
  type StyleOutput,
} from "./prompts";

export type PassEvent =
  | { event: "run-start"; data: { runId: string; chapterNumber: number; retryCount: number } }
  | { event: "agent-start"; data: { runId: string; agent: AgentName; chapterNumber: number } }
  | { event: "agent-complete"; data: { runId: string; agent: AgentName; output: unknown } }
  | { event: "continuity"; data: { runId: string } & ContinuityResult }
  | { event: "chapter-accepted"; data: { runId: string; chapterNumber: number; wordCount: number; chapter: AcceptedChapter } }
  | { event: "relay-receipt"; data: RelayReceipt }
  | { event: "error"; data: { runId: string; code: ErrorCode; message: string; retryable: boolean } }
  | { event: "done"; data: { runId: string; status: "approved" | "vetoed" | "failed" | "interrupted"; nextAction: string | null } };

export type PassInput = {
  runId: string;
  chapterNumber: 1 | 2 | 3;
  retryCount: number;
  restartAt: RestartPoint;
  styleProfile: StyleProfile;
  bible: StoryBible;
  acceptedChapters: AcceptedChapter[];
  foreshadowingState: Record<string, ForeshadowingStatus>;
  /** Last accepted character statuses from the continuity ledger. */
  characterStatuses?: Record<string, CharacterStatus>;
  vetoNotes?: ContinuityFailure[];
  /** Validated checkpoints from the vetoed pass, used for a continuation restart. */
  checkpoints?: { outline?: unknown; style?: unknown };
};

export type PassDeps = {
  client: ModelClient;
  definitions: AgentDefinitions;
  emit: (e: PassEvent) => void;
  signal?: AbortSignal;
};

const TIER: Record<AgentName, Tier> = { outline: "standard", style: "standard", continuation: "standard", continuity: "premium" };

class PassError extends Error {
  constructor(public code: ErrorCode, public safeMessage: string) {
    super(code);
  }
}

const RETRYABLE: Partial<Record<ErrorCode, boolean>> = {
  "schema-mismatch": true, "model-refusal": true, "word-limit": true, "provider-unavailable": true, interrupted: true,
};

function titleFromDraft(draft: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(draft);
  return (m?.[1] ?? fallback).trim().slice(0, 200);
}

/** Runs one pass. Never throws; always ends with a `done` event. */
export async function runChapterPass(input: PassInput, deps: PassDeps): Promise<void> {
  const { runId, chapterNumber, retryCount, styleProfile, bible } = input;
  const lang = styleProfile.language;
  const limits = LANGUAGE_LIMITS[lang];
  const caps = OUTPUT_CAPS[lang];
  const emit = deps.emit;

  if (retryCount > MAX_RETRIES) {
    emit({ event: "error", data: { runId, code: "retry-exhausted", message: "This chapter used all 3 retries.", retryable: false } });
    emit({ event: "done", data: { runId, status: "failed", nextAction: "edit-bible" } });
    return;
  }

  emit({ event: "run-start", data: { runId, chapterNumber, retryCount } });
  const ctx: PassContext = {
    chapterNumber, styleProfile, bible, acceptedChapters: input.acceptedChapters,
    vetoNotes: retryCount > 0 ? input.vetoNotes : undefined,
    ledger: { characterStatuses: { ...(input.characterStatuses ?? {}) }, foreshadowing: { ...input.foreshadowingState } },
  };
  const openBefore = new Set(Object.entries(input.foreshadowingState).filter(([, s]) => s !== "paidOff").map(([id]) => id));
  const deadBefore = new Set<string>(Object.entries(input.characterStatuses ?? {}).filter(([, s]) => s === "dead").map(([id]) => id));
  for (const b of bible.beatSheet) {
    if (b.chapterNumber < chapterNumber) for (const [id, s] of Object.entries(b.characterStates)) if (s === "dead") deadBefore.add(id);
  }

  async function call(agent: AgentName, schema?: { name: string; schema: Record<string, unknown> }): Promise<string> {
    if (deps.signal?.aborted) throw new PassError("interrupted", "The run was interrupted.");
    emit({ event: "agent-start", data: { runId, agent, chapterNumber } });
    const r = await deps.client.chat({
      tier: TIER[agent], messages: buildMessages(agent, deps.definitions[agent], ctx), maxTokens: caps[agent], jsonSchema: schema, signal: deps.signal,
    });
    if (!r.ok) throw new PassError(r.code, `The ${agent} agent call failed.`);
    return r.content;
  }

  try {
    // Continuation restart reuses validated checkpoints; otherwise start at outline.
    let outline: OutlineOutput | undefined;
    let style: StyleOutput | undefined;
    if (input.restartAt === "continuation" && input.checkpoints) {
      const o = checkOutline(input.checkpoints.outline, chapterNumber, bible, openBefore, deadBefore);
      const s = checkStyle(input.checkpoints.style, chapterNumber, lang, limits.styleAnchorMax);
      if (o.ok && s.ok) { outline = o.value; style = s.value; }
    }
    if (!outline || !style) {
      const o = checkOutline(parseJsonText(await call("outline", { name: "outline", schema: OUTLINE_SCHEMA })), chapterNumber, bible, openBefore, deadBefore);
      if (!o.ok) throw new PassError("schema-mismatch", "The outline did not pass the server checks.");
      outline = o.value;
      emit({ event: "agent-complete", data: { runId, agent: "outline", output: outline } });
      ctx.outline = outline;
      const s = checkStyle(parseJsonText(await call("style", { name: "style", schema: STYLE_SCHEMA })), chapterNumber, lang, limits.styleAnchorMax);
      if (!s.ok) throw new PassError("schema-mismatch", "The style anchor did not pass the server checks.");
      style = s.value;
      emit({ event: "agent-complete", data: { runId, agent: "style", output: style } });
    }
    ctx.outline = outline;
    ctx.style = style;

    const draft = (await call("continuation")).trim();
    const wordCount = countUnits(draft, lang);
    if (wordCount > limits.chapterMax) throw new PassError("word-limit", `The draft has ${wordCount} ${limits.unitLabel}; the limit is ${limits.chapterMax}.`);
    emit({ event: "agent-complete", data: { runId, agent: "continuation", output: { draft, wordCount } } });
    ctx.draft = draft;

    const c = parseContinuityOutput(parseJsonText(await call("continuity", { name: "continuity", schema: CONTINUITY_SCHEMA })), chapterNumber);
    if (!c.ok) throw new PassError("schema-mismatch", "The continuity verdict was not valid.");
    const continuity = c.value;
    emit({ event: "continuity", data: { runId, ...continuity } });

    const transitions: ForeshadowingTransition[] = [];
    for (const b of outline.beats) {
      for (const id of b.foreshadowingPaidOff) {
        const from = input.foreshadowingState[id];
        if (from && from !== "paidOff" && !transitions.some((t) => t.id === id)) transitions.push({ id, from, to: "paidOff" });
      }
    }
    const receipt: RelayReceipt = {
      runId, chapterNumber, retryCount,
      steps: receiptSteps(lang, outline, style, wordCount, continuity, limits.unitLabel),
      foreshadowingTransitions: continuity.status === "APPROVED" ? transitions : [],
      continuity,
    };

    if (continuity.status === "APPROVED") {
      const chapter: AcceptedChapter = { chapterNumber, title: titleFromDraft(draft, bible.beatSheet.find((b) => b.chapterNumber === chapterNumber)?.title ?? `Chapter ${chapterNumber}`), prose: draft, wordCount, relayReceipt: receipt };
      emit({ event: "chapter-accepted", data: { runId, chapterNumber, wordCount, chapter } });
      emit({ event: "relay-receipt", data: receipt });
      emit({ event: "done", data: { runId, status: "approved", nextAction: chapterNumber < 3 ? "next-chapter" : null } });
    } else {
      emit({ event: "relay-receipt", data: receipt });
      emit({ event: "done", data: { runId, status: "vetoed", nextAction: retryCount < MAX_RETRIES ? "retry" : "edit-bible" } });
    }
  } catch (err) {
    const code: ErrorCode = err instanceof PassError ? err.code : "provider-unavailable";
    const message = err instanceof PassError ? err.safeMessage : "The run failed.";
    const interrupted = code === "interrupted";
    emit({ event: "error", data: { runId, code, message, retryable: Boolean(RETRYABLE[code]) && retryCount < MAX_RETRIES } });
    emit({ event: "done", data: { runId, status: interrupted ? "interrupted" : "failed", nextAction: retryCount < MAX_RETRIES ? "retry" : "edit-bible" } });
  }
}

/** Receipt text from fixed per-language templates (design §2.6). */
function receiptSteps(lang: "en" | "zh", outline: OutlineOutput, style: StyleOutput, words: number, c: ContinuityResult, unit: string): RelayReceipt["steps"] {
  const zh = lang === "zh";
  const verdict = c.status === "APPROVED"
    ? (zh ? "连续性检查通过。" : "Continuity approved the draft.")
    : (zh ? `连续性检查否决，${c.failures.length} 项问题。` : `Continuity vetoed the draft with ${c.failures.length} failure(s).`);
  return [
    { agent: "outline", summary: zh ? `列出 ${outline.beats.length} 个节拍。` : `Planned ${outline.beats.length} beats.`, changes: outline.beats.map((b) => b.title) },
    { agent: "style", summary: zh ? "生成风格锚点。" : "Wrote the style anchor.", changes: style.notes.slice(0, 5) },
    { agent: "continuation", summary: zh ? `写出草稿，${words} ${unit}。` : `Wrote the draft, ${words} ${unit}.`, changes: [`${words} ${unit}`] },
    { agent: "continuity", summary: verdict, changes: c.failures.map((f) => `${f.checkId}: ${f.violation}`) },
  ];
}
