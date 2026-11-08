/**
 * Client session model (requirements REQ-21, design §2.7, task T-04).
 * Pure helpers: create, derive the continuity ledger, serialise, and restore with
 * validation. React state is the active session; localStorage only restores it.
 */
import {
  MAX_RETRIES,
  SESSION_VERSION,
  type AcceptedChapter,
  type ContinuityLedger,
  type Session,
} from "./pipeline-types";
import type { StoryBible } from "./story-bible";
import { parseStyleProfile } from "./style-profile";

export const SESSION_STORAGE_KEY = "spectre-scribe:session:v1";

export function createEmptySession(): Session {
  return {
    version: SESSION_VERSION,
    styleProfile: null,
    bible: null,
    acceptedChapters: [],
    continuityLedger: { characterStatuses: {}, foreshadowing: {} },
    retryCounters: {},
    pipelineStatus: "idle",
  };
}

/**
 * The ledger after the accepted chapters: character states from the beat sheet of
 * the last accepted chapter, foreshadowing from the bible plus every accepted
 * receipt's transitions in order. It is derived data, never a bible mutation.
 */
export function deriveLedger(bible: StoryBible, accepted: readonly AcceptedChapter[]): ContinuityLedger {
  const characterStatuses: ContinuityLedger["characterStatuses"] = {};
  for (const c of bible.characters) characterStatuses[c.id] = c.status;
  const foreshadowing: ContinuityLedger["foreshadowing"] = {};
  for (const f of bible.foreshadowing) foreshadowing[f.id] = f.status;

  const ordered = [...accepted].sort((a, b) => a.chapterNumber - b.chapterNumber);
  for (const ch of ordered) {
    const beat = bible.beatSheet.find((b) => b.chapterNumber === ch.chapterNumber);
    if (beat) Object.assign(characterStatuses, beat.characterStates);
    for (const t of ch.relayReceipt.foreshadowingTransitions) {
      if (t.id in foreshadowing) foreshadowing[t.id] = t.to;
    }
  }
  return { characterStatuses, foreshadowing };
}

export function serialiseSession(session: Session): string {
  return JSON.stringify(session);
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

function isAcceptedChapter(v: unknown): v is AcceptedChapter {
  if (!isRecord(v)) return false;
  return (
    [1, 2, 3].includes(v.chapterNumber as number) &&
    typeof v.title === "string" &&
    typeof v.prose === "string" &&
    Number.isInteger(v.wordCount) &&
    (v.wordCount as number) >= 0 &&
    isRecord(v.relayReceipt) &&
    Array.isArray((v.relayReceipt as Rec).foreshadowingTransitions)
  );
}

/** A bible in the session may be half-filled while the user edits; check its shape only. */
function isBibleShape(v: unknown): v is StoryBible {
  if (!isRecord(v)) return false;
  return (
    ["genre", "tone", "logline", "synopsis"].every((k) => typeof v[k] === "string") &&
    isRecord(v.setting) &&
    ["characters", "foreshadowing", "timeline", "beatSheet"].every((k) => Array.isArray(v[k]))
  );
}

export type RestoreResult = { session: Session; notice: null | "restored" | "discarded-invalid" | "discarded-version" };

/** Restores a stored session. Invalid or incompatible data is discarded with a notice. */
export function restoreSession(raw: string | null): RestoreResult {
  if (raw === null || raw === "") return { session: createEmptySession(), notice: null };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { session: createEmptySession(), notice: "discarded-invalid" };
  }
  if (!isRecord(data)) return { session: createEmptySession(), notice: "discarded-invalid" };
  if (data.version !== SESSION_VERSION) return { session: createEmptySession(), notice: "discarded-version" };

  const fail = { session: createEmptySession(), notice: "discarded-invalid" as const };
  let styleProfile: Session["styleProfile"] = null;
  if (data.styleProfile !== null) {
    const p = parseStyleProfile(data.styleProfile);
    if (!p.ok) return fail;
    styleProfile = p.value;
  }
  if (data.bible !== null && !isBibleShape(data.bible)) return fail;
  const chapters = data.acceptedChapters;
  if (!Array.isArray(chapters) || chapters.length > 3 || !chapters.every(isAcceptedChapter)) return fail;
  const numbers = chapters.map((c) => c.chapterNumber);
  if (numbers.some((n, i) => n !== i + 1)) return fail; // chapters are 1..k in order
  const counters = data.retryCounters;
  if (!isRecord(counters) || !Object.values(counters).every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_RETRIES)) {
    return fail;
  }
  const status = data.pipelineStatus;
  if (!["idle", "running", "awaiting-retry", "complete"].includes(status as string)) return fail;

  const bible = (data.bible as StoryBible | null) ?? null;
  const session: Session = {
    version: SESSION_VERSION,
    styleProfile,
    bible: bible ? structuredClone(bible) : null,
    acceptedChapters: structuredClone(chapters),
    continuityLedger: bible ? deriveLedger(bible, chapters) : { characterStatuses: {}, foreshadowing: {} },
    retryCounters: structuredClone(counters) as Session["retryCounters"],
    // A run cannot survive a reload; it becomes a resumable/interrupted state.
    pipelineStatus: status === "running" ? "awaiting-retry" : (status as Session["pipelineStatus"]),
  };
  return { session, notice: "restored" };
}
