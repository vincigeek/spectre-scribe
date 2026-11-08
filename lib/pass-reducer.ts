/**
 * Client reducer for one chapter pass (design §2.6, §2.7; T-21, T-22, T-33).
 * Live runs and replays feed the same events through this reducer. A chapter is
 * taken only from a validated `chapter-accepted` event, never from a delta.
 */
import type { AcceptedChapter, AgentName, ContinuityResult, ErrorCode, RelayReceipt } from "./pipeline-types";
import { isErrorCode } from "./pipeline-types";

export type PassView = {
  runId: string | null;
  chapterNumber: number | null;
  retryCount: number;
  status: "idle" | "running" | "approved" | "vetoed" | "failed" | "interrupted";
  currentAgent: AgentName | null;
  completedAgents: AgentName[];
  outline: unknown;
  style: unknown;
  draft: string;
  wordCount: number | null;
  continuity: ContinuityResult | null;
  receipt: RelayReceipt | null;
  accepted: AcceptedChapter | null;
  error: { code: ErrorCode; message: string; retryable: boolean } | null;
  nextAction: string | null;
};

export const EMPTY_PASS: PassView = {
  runId: null, chapterNumber: null, retryCount: 0, status: "idle", currentAgent: null, completedAgents: [],
  outline: null, style: null, draft: "", wordCount: null, continuity: null, receipt: null, accepted: null, error: null, nextAction: null,
};

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const AGENTS: readonly string[] = ["outline", "style", "continuation", "continuity"];

function isAccepted(v: unknown, chapterNumber: number | null): v is AcceptedChapter {
  return isRecord(v) && v.chapterNumber === chapterNumber && typeof v.prose === "string" && typeof v.title === "string"
    && Number.isInteger(v.wordCount) && isRecord(v.relayReceipt);
}

export type PassAction = { type: "event"; event: string; data: unknown } | { type: "reset" } | { type: "interrupted" };

export function passReducer(state: PassView, action: PassAction): PassView {
  if (action.type === "reset") return EMPTY_PASS;
  if (action.type === "interrupted") {
    return state.status === "running"
      ? { ...state, status: "interrupted", currentAgent: null, error: { code: "interrupted", message: "The run was interrupted.", retryable: true } }
      : state;
  }
  const d = isRecord(action.data) ? action.data : {};
  // Ignore events for another run once one has started.
  if (action.event !== "run-start" && state.runId && typeof d.runId === "string" && d.runId !== state.runId) return state;

  switch (action.event) {
    case "run-start":
      return { ...EMPTY_PASS, runId: String(d.runId ?? ""), chapterNumber: Number(d.chapterNumber), retryCount: Number(d.retryCount ?? 0), status: "running" };
    case "agent-start":
      return AGENTS.includes(d.agent as string) ? { ...state, currentAgent: d.agent as AgentName } : state;
    case "agent-delta":
      return d.agent === "continuation" && typeof d.text === "string" ? { ...state, draft: state.draft + d.text } : state;
    case "agent-complete": {
      if (!AGENTS.includes(d.agent as string)) return state;
      const agent = d.agent as AgentName;
      const next = { ...state, completedAgents: [...state.completedAgents.filter((a) => a !== agent), agent] };
      if (agent === "outline") next.outline = d.output;
      if (agent === "style") next.style = d.output;
      if (agent === "continuation" && isRecord(d.output) && typeof d.output.draft === "string") {
        next.draft = d.output.draft;
        next.wordCount = Number(d.output.wordCount);
      }
      return next;
    }
    case "continuity":
      if (d.status !== "APPROVED" && d.status !== "VETO") return state;
      return { ...state, currentAgent: null, completedAgents: [...new Set([...state.completedAgents, "continuity" as const])], continuity: { status: d.status, failures: Array.isArray(d.failures) ? (d.failures as ContinuityResult["failures"]) : [] } };
    case "chapter-accepted":
      // Only a full validated event with an APPROVED verdict creates a chapter.
      return isAccepted(d.chapter, state.chapterNumber) && state.continuity?.status === "APPROVED" ? { ...state, accepted: structuredClone(d.chapter) } : state;
    case "relay-receipt":
      return isRecord(d) && Array.isArray(d.steps) ? { ...state, receipt: structuredClone(d) as unknown as RelayReceipt } : state;
    case "error":
      return { ...state, error: { code: isErrorCode(d.code) ? d.code : "provider-unavailable", message: String(d.message ?? "The run failed."), retryable: Boolean(d.retryable) } };
    case "done": {
      const s = d.status;
      const status = s === "approved" && state.accepted ? "approved" : s === "vetoed" ? "vetoed" : s === "interrupted" ? "interrupted" : s === "approved" ? "failed" : "failed";
      return { ...state, status, currentAgent: null, nextAction: typeof d.nextAction === "string" ? d.nextAction : null };
    }
    default:
      return state; // unknown events are ignored
  }
}
