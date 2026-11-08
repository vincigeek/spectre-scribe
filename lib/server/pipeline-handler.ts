/**
 * POST /api/pipeline/stream logic (design §2.1, §2.6; api-streaming.md; T-16).
 * Validates a complete request before any model call, then streams one chapter
 * pass as typed SSE events. Dependencies are injectable for tests.
 */
import "server-only";
import { MAX_RETRIES, type AcceptedChapter, type ContinuityFailure } from "@/lib/pipeline-types";
import { formatSse, KEEP_ALIVE } from "@/lib/sse";
import { parseStoryBible, type ForeshadowingStatus } from "@/lib/story-bible";
import { parseStyleProfile } from "@/lib/style-profile";
import { countUnits } from "@/lib/text-units";
import { loadAgentDefinitions, type AgentDefinitions } from "./agent-loader";
import { loadModelConfig } from "./config";
import { refusalResponse, sharedLiveGate, type LiveGate } from "./live-gate";
import { createModelClient, type ModelClient } from "./model-client";
import { runChapterPass, type PassInput } from "./orchestrator";

export const MAX_PIPELINE_BODY_BYTES = 512 * 1024;
export const ROUTE_DEADLINE_MS = 110_000;
export const KEEP_ALIVE_MS = 15_000;

export type HandlerDeps = {
  getClient?: () => ModelClient | null;
  getDefinitions?: () => Promise<AgentDefinitions | null>;
  /** null disables the gate (tests only). */
  gate?: LiveGate | null;
  keepAliveMs?: number;
  deadlineMs?: number;
};

const JSON_HEADERS = { "Cache-Control": "no-store" };
const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Content-Type-Options": "nosniff",
  "X-Accel-Buffering": "no",
};

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status, headers: JSON_HEADERS });
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const ALLOWED = ["runId", "chapterNumber", "retryCount", "restartAt", "styleProfile", "bible", "acceptedChapters", "continuityLedger", "vetoNotes", "checkpoints"];
const FS: readonly ForeshadowingStatus[] = ["open", "paidOff", "deferred"];

export type ParsedRequest = { ok: true; input: PassInput } | { ok: false; message: string };

export function parsePipelineRequest(body: unknown): ParsedRequest {
  const bad = (message: string): ParsedRequest => ({ ok: false, message });
  if (!isRecord(body)) return bad("The request must be a JSON object.");
  if (Object.keys(body).some((k) => !ALLOWED.includes(k))) return bad("The request has unknown fields.");
  if (typeof body.runId !== "string" || !/^[\w-]{1,64}$/.test(body.runId)) return bad("runId is invalid.");
  if (![1, 2, 3].includes(body.chapterNumber as number)) return bad("chapterNumber must be 1, 2, or 3.");
  const chapterNumber = body.chapterNumber as 1 | 2 | 3;
  if (!Number.isInteger(body.retryCount) || (body.retryCount as number) < 0 || (body.retryCount as number) > MAX_RETRIES) {
    return bad(`retryCount must be 0 to ${MAX_RETRIES}.`);
  }
  const retryCount = body.retryCount as number;
  if (body.restartAt !== "outline" && body.restartAt !== "continuation") return bad("restartAt must be outline or continuation.");

  const p = parseStyleProfile(body.styleProfile);
  if (!p.ok) return bad("The style profile is invalid.");
  const b = parseStoryBible(body.bible, p.value.language);
  if (!b.ok) return bad("The story bible is invalid.");

  const chapters = body.acceptedChapters;
  if (!Array.isArray(chapters) || chapters.length !== chapterNumber - 1) return bad("acceptedChapters must hold every earlier chapter.");
  const accepted: AcceptedChapter[] = [];
  for (const [i, c] of chapters.entries()) {
    if (!isRecord(c) || c.chapterNumber !== i + 1 || typeof c.prose !== "string" || typeof c.title !== "string") return bad("An accepted chapter is invalid.");
    if (countUnits(c.prose, p.value.language) > (p.value.language === "zh" ? 1500 : 800)) return bad("An accepted chapter is over the limit.");
    accepted.push(structuredClone(c) as AcceptedChapter);
  }

  const ledger = body.continuityLedger;
  if (!isRecord(ledger) || !isRecord(ledger.foreshadowing)) return bad("continuityLedger is invalid.");
  const fsIds = new Set(b.value.foreshadowing.map((f) => f.id));
  const foreshadowingState: Record<string, ForeshadowingStatus> = {};
  for (const f of b.value.foreshadowing) foreshadowingState[f.id] = f.status;
  for (const [id, s] of Object.entries(ledger.foreshadowing)) {
    if (!fsIds.has(id) || !FS.includes(s as ForeshadowingStatus)) return bad("continuityLedger is invalid.");
    foreshadowingState[id] = s as ForeshadowingStatus;
  }

  let vetoNotes: ContinuityFailure[] | undefined;
  if (body.vetoNotes !== undefined) {
    if (!Array.isArray(body.vetoNotes) || body.vetoNotes.length > 20) return bad("vetoNotes is invalid.");
    for (const n of body.vetoNotes) {
      if (!isRecord(n) || !["A", "B", "C", "ARC"].includes(n.checkId as string) || ["bibleField", "violation", "fix"].some((k) => typeof n[k] !== "string")) {
        return bad("vetoNotes is invalid.");
      }
    }
    vetoNotes = structuredClone(body.vetoNotes) as ContinuityFailure[];
  }
  if (body.checkpoints !== undefined && !isRecord(body.checkpoints)) return bad("checkpoints is invalid.");

  return {
    ok: true,
    input: {
      runId: body.runId, chapterNumber, retryCount, restartAt: body.restartAt, styleProfile: p.value, bible: b.value,
      acceptedChapters: accepted, foreshadowingState, vetoNotes,
      checkpoints: body.checkpoints ? structuredClone(body.checkpoints) as PassInput["checkpoints"] : undefined,
    },
  };
}

function defaultClient(): ModelClient | null {
  const c = loadModelConfig();
  return c.ok ? createModelClient(c.config) : null;
}
async function defaultDefinitions(): Promise<AgentDefinitions | null> {
  const r = await loadAgentDefinitions();
  return r.ok ? r.definitions : null;
}

export async function handlePipelineRequest(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return jsonError(415, "bad-request", "Send the request as JSON.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_PIPELINE_BODY_BYTES) return jsonError(413, "bad-request", "The request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "bad-request", "The request is not valid JSON.");
  }
  const parsed = parsePipelineRequest(body);
  if (!parsed.ok) return jsonError(400, "bad-request", parsed.message);

  const gate = deps.gate === undefined ? sharedLiveGate() : deps.gate;
  let release = async () => undefined as void;
  if (gate) {
    const g = await gate.check(request, "pass");
    if (!g.ok) return refusalResponse(g.refusal);
    release = g.release;
  }

  const client = (deps.getClient ?? defaultClient)();
  const definitions = await (deps.getDefinitions ?? defaultDefinitions)();
  if (!client || !definitions) {
    await release();
    return jsonError(503, "config-missing", "The server is not configured for live runs.");
  }

  const deadline = AbortSignal.timeout(deps.deadlineMs ?? ROUTE_DEADLINE_MS);
  const signal = AbortSignal.any([request.signal, deadline]);
  const encoder = new TextEncoder();
  let seq = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (s: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          open = false;
        }
      };
      const timer = setInterval(() => write(KEEP_ALIVE), deps.keepAliveMs ?? KEEP_ALIVE_MS);
      try {
        await runChapterPass(parsed.input, { client, definitions, signal, emit: (e) => write(formatSse(++seq, e.event, e.data)) });
      } finally {
        clearInterval(timer);
        open = false;
        await release();
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
