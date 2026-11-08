/**
 * Replay files: schema, recorder, and playback schedule (requirements REQ-33,
 * design §2.14, task T-33). Pure and shared; the player component feeds the
 * scheduled events into the same reducer as a live run, with no model call.
 */
import type { RestartPoint } from "./pipeline-types";
import type { StoryBible } from "./story-bible";
import { parseStoryBible } from "./story-bible";
import { parseStyleProfile, type StyleProfile } from "./style-profile";

export type ReplayEvent = { tMs: number; event: string; data: unknown };
export type ReplayPass = { chapterNumber: 1 | 2 | 3; retryCount: number; restartPoint: RestartPoint; events: ReplayEvent[] };

export type ReplayFile = {
  kind: "spectre-scribe-replay";
  version: 1;
  recordedAt: string;
  appVersion: string;
  language: "en" | "zh";
  models: { standard: string; premium: string };
  styleProfile: StyleProfile;
  bible: StoryBible;
  passes: ReplayPass[];
};

export const REPLAY_EVENTS = new Set(["run-start", "agent-start", "agent-delta", "agent-complete", "continuity", "chapter-accepted", "relay-receipt", "error", "done"]);
export const DELTA_BUCKET_MS = 100;
export const PASS_GAP_MS = 1500;

/** Keys that must never be stored in a replay (REQ-33a). */
const FORBIDDEN_KEYS = new Set([
  "sampleText", "sample", "prompt", "prompts", "messages", "apiKey", "authorization", "headers",
  "usage", "raw", "rawResponse", "providerResponse", "request", "ip", "ipHash", "accessCode",
]);

/** Deep copy that drops forbidden keys at any depth. */
export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!FORBIDDEN_KEYS.has(k)) out[k] = scrub(v);
    return out;
  }
  return value;
}

function hasForbidden(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbidden);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([k, v]) => FORBIDDEN_KEYS.has(k) || hasForbidden(v));
  }
  return false;
}

/**
 * Records one pass. `agent-delta` text within one 100 ms bucket is merged into a
 * single event to keep the file small.
 */
export function createPassRecorder(meta: Omit<ReplayPass, "events">, now: () => number = Date.now) {
  const start = now();
  const events: ReplayEvent[] = [];
  return {
    add(event: string, data: unknown) {
      if (!REPLAY_EVENTS.has(event)) return;
      const tMs = Math.max(0, now() - start);
      const last = events[events.length - 1];
      if (event === "agent-delta" && last?.event === "agent-delta") {
        const a = last.data as { agent?: string; text?: string };
        const b = data as { agent?: string; text?: string };
        if (a.agent === b.agent && Math.floor(last.tMs / DELTA_BUCKET_MS) === Math.floor(tMs / DELTA_BUCKET_MS)) {
          a.text = `${a.text ?? ""}${b.text ?? ""}`;
          return;
        }
      }
      events.push({ tMs, event, data: scrub(structuredClone(data)) });
    },
    finish(): ReplayPass {
      return { ...meta, events: events.slice() };
    },
  };
}

export type BuildResult = { ok: true; file: ReplayFile } | { ok: false; reason: string };

/** Builds a replay; refuses a run without an accepted chapter 1, 2, and 3. */
export function buildReplayFile(input: Omit<ReplayFile, "kind" | "version" | "passes"> & { passes: ReplayPass[] }): BuildResult {
  const accepted = new Set(
    input.passes.flatMap((p) => p.events.filter((e) => e.event === "chapter-accepted").map(() => p.chapterNumber)),
  );
  for (const n of [1, 2, 3] as const) if (!accepted.has(n)) return { ok: false, reason: `chapter ${n} was not accepted` };
  const file: ReplayFile = { kind: "spectre-scribe-replay", version: 1, ...input, passes: input.passes };
  return { ok: true, file: scrub(file) as ReplayFile };
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

export type ParseResult = { ok: true; file: ReplayFile } | { ok: false; issues: string[] };

/** Validates an untrusted replay file with the shared schemas. */
export function parseReplayFile(input: unknown): ParseResult {
  const issues: string[] = [];
  if (!isRecord(input)) return { ok: false, issues: ["replay must be an object"] };
  if (input.kind !== "spectre-scribe-replay" || input.version !== 1) issues.push("unsupported replay kind or version");
  if (typeof input.recordedAt !== "string" || Number.isNaN(Date.parse(input.recordedAt))) issues.push("recordedAt must be an ISO date");
  if (typeof input.appVersion !== "string") issues.push("appVersion is required");
  if (input.language !== "en" && input.language !== "zh") issues.push("language must be en or zh");
  const m = input.models;
  if (!isRecord(m) || typeof m.standard !== "string" || typeof m.premium !== "string") issues.push("models must name standard and premium");
  const p = parseStyleProfile(input.styleProfile);
  if (!p.ok) issues.push("styleProfile is invalid");
  else if (p.value.language !== input.language) issues.push("styleProfile language does not match");
  if (p.ok && !parseStoryBible(input.bible, p.value.language).ok) issues.push("bible is invalid");
  if (!Array.isArray(input.passes) || input.passes.length === 0) issues.push("passes must be a non-empty list");
  else {
    input.passes.forEach((pass, i) => {
      if (!isRecord(pass) || ![1, 2, 3].includes(pass.chapterNumber as number) || !Array.isArray(pass.events)) {
        return issues.push(`passes[${i}] is invalid`);
      }
      let last = -1;
      for (const e of pass.events as unknown[]) {
        if (!isRecord(e) || typeof e.tMs !== "number" || e.tMs < last || !REPLAY_EVENTS.has(e.event as string)) {
          issues.push(`passes[${i}] has an invalid event`);
          break;
        }
        last = e.tMs;
      }
    });
  }
  if (hasForbidden(input)) issues.push("replay contains forbidden data");
  return issues.length ? { ok: false, issues } : { ok: true, file: structuredClone(input) as ReplayFile };
}

export type ScheduledEvent = { atMs: number; passIndex: number; event: string; data: unknown };

/**
 * Flattens passes into one timeline at the given speed. Gaps between passes are
 * shrunk to PASS_GAP_MS. `skip` puts every event at time 0.
 */
export function replaySchedule(file: ReplayFile, speed: 1 | 2 | "skip"): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  let offset = 0;
  file.passes.forEach((pass, passIndex) => {
    let end = 0;
    for (const e of pass.events) {
      const at = speed === "skip" ? 0 : offset + e.tMs / speed;
      out.push({ atMs: Math.round(at), passIndex, event: e.event, data: e.data });
      end = e.tMs;
    }
    if (speed !== "skip") offset += end / speed + PASS_GAP_MS;
  });
  return out;
}

export function replayDurationMs(file: ReplayFile, speed: 1 | 2): number {
  const s = replaySchedule(file, speed);
  return s.length ? s[s.length - 1]!.atMs : 0;
}
