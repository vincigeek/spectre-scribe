/**
 * Shared pipeline and session data shapes (design §2.10, task T-03).
 * Browser and server both import this file. No Node-only imports.
 */
import type { CharacterStatus, ForeshadowingStatus, StoryBible } from "./story-bible";
import type { StyleProfile } from "./style-profile";

export type AgentName = "outline" | "style" | "continuation" | "continuity";
export const AGENT_ORDER: readonly AgentName[] = ["outline", "style", "continuation", "continuity"];
export type RestartPoint = "outline" | "continuation";
export const MAX_RETRIES = 3;

export type CheckId = "A" | "B" | "C" | "ARC";

export type ContinuityFailure = {
  checkId: CheckId;
  bibleField: string;
  violation: string;
  fix: string;
};

export type ContinuityResult = {
  status: "APPROVED" | "VETO";
  failures: ContinuityFailure[];
};

export type ForeshadowingTransition = {
  id: string;
  from: ForeshadowingStatus;
  to: ForeshadowingStatus;
};

export type RelayReceipt = {
  runId: string;
  chapterNumber: number;
  retryCount: number;
  steps: Array<{ agent: AgentName; summary: string; changes: string[] }>;
  foreshadowingTransitions: ForeshadowingTransition[];
  continuity: ContinuityResult;
};

export type AcceptedChapter = {
  chapterNumber: 1 | 2 | 3;
  title: string;
  prose: string;
  wordCount: number;
  relayReceipt: RelayReceipt;
};

export type PipelineStatus = "running" | "approved" | "vetoed" | "interrupted" | "failed";
export type NextAction = "retry" | "next-chapter" | "edit-bible" | "new-session" | null;

export type PipelineRun = {
  runId: string;
  chapterNumber: 1 | 2 | 3;
  retryCount: number;
  currentAgent: AgentName | null;
  status: PipelineStatus;
  nextAction: NextAction;
};

export type ContinuityLedger = {
  characterStatuses: Record<string, CharacterStatus>;
  foreshadowing: Record<string, ForeshadowingStatus>;
};

export const SESSION_VERSION = 1;

export type Session = {
  version: number;
  styleProfile: StyleProfile | null;
  bible: StoryBible | null;
  acceptedChapters: AcceptedChapter[];
  continuityLedger: ContinuityLedger;
  retryCounters: Record<number, number>;
  pipelineStatus: "idle" | "running" | "awaiting-retry" | "complete";
};

export const ERROR_CODES = {
  "config-missing": { retryable: false, message: "The server is not configured for live runs." },
  "provider-auth": { retryable: false, message: "The model service refused the server's credentials." },
  "provider-rate-limited": { retryable: false, message: "The model service is busy. Try again later." },
  "provider-unavailable": { retryable: true, message: "The model service did not answer. Start a new run." },
  "bad-request": { retryable: false, message: "The request was not valid." },
  "schema-mismatch": { retryable: true, message: "An agent returned output in the wrong shape." },
  "model-refusal": { retryable: true, message: "The model refused this request." },
  "word-limit": { retryable: true, message: "The draft was over the chapter limit." },
  "retry-exhausted": { retryable: false, message: "This chapter used all 3 retries. Edit the bible or start a new session." },
  interrupted: { retryable: true, message: "The run was interrupted." },
  "access-required": { retryable: false, message: "Live mode needs a demo access code." },
  "rate-limited": { retryable: true, message: "Too many live requests. Wait and try again." },
  "live-unavailable": { retryable: false, message: "Live mode is off. Watch a recorded run instead." },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ERROR_CODES, v);
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown, max = 2000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

export type Parsed<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/**
 * Parses the continuity agent's JSON (agents/continuity.md). APPROVED must carry no
 * failures; VETO must carry at least one complete failure. Anything else is a
 * schema mismatch, never an implicit approval.
 */
export function parseContinuityOutput(input: unknown, chapterNumber: number): Parsed<ContinuityResult> {
  const issues: string[] = [];
  if (!isRecord(input)) return { ok: false, issues: ["must be an object"] };
  if (input.chapterNumber !== chapterNumber) issues.push(`chapterNumber must be ${chapterNumber}`);
  if (input.status !== "APPROVED" && input.status !== "VETO") issues.push("status must be APPROVED or VETO");
  if (!Array.isArray(input.failures)) issues.push("failures must be a list");
  const failures: ContinuityFailure[] = [];
  if (Array.isArray(input.failures)) {
    input.failures.forEach((f, i) => {
      if (!isRecord(f)) return issues.push(`failures[${i}] must be an object`);
      if (!["A", "B", "C", "ARC"].includes(f.checkId as string)) issues.push(`failures[${i}].checkId is invalid`);
      for (const k of ["bibleField", "violation", "fix"]) if (!nonEmpty(f[k])) issues.push(`failures[${i}].${k} is required`);
      failures.push({ checkId: f.checkId as CheckId, bibleField: String(f.bibleField), violation: String(f.violation), fix: String(f.fix) });
    });
    if (input.status === "APPROVED" && failures.length > 0) issues.push("APPROVED must have no failures");
    if (input.status === "VETO" && failures.length === 0) issues.push("VETO needs at least one failure");
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: { status: input.status as ContinuityResult["status"], failures } };
}
