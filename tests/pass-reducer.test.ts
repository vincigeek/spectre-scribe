import { describe, expect, it } from "vitest";
import { EMPTY_PASS, passReducer, type PassAction, type PassView } from "@/lib/pass-reducer";
import { acceptedChapter } from "./fixtures-bible";

const ev = (event: string, data: unknown): PassAction => ({ type: "event", event, data });
const run = (actions: PassAction[], start: PassView = EMPTY_PASS) => actions.reduce(passReducer, start);
const startRun = ev("run-start", { runId: "r1", chapterNumber: 1, retryCount: 0 });
const approved = ev("continuity", { runId: "r1", status: "APPROVED", failures: [] });

describe("passReducer (T-21, T-22)", () => {
  it("tracks a full approved pass", () => {
    const s = run([
      startRun,
      ev("agent-start", { runId: "r1", agent: "outline" }),
      ev("agent-complete", { runId: "r1", agent: "outline", output: { beats: [] } }),
      ev("agent-delta", { runId: "r1", agent: "continuation", text: "Par" }),
      ev("agent-delta", { runId: "r1", agent: "continuation", text: "tial" }),
      ev("agent-complete", { runId: "r1", agent: "continuation", output: { draft: "Final.", wordCount: 1 } }),
      approved,
      ev("chapter-accepted", { runId: "r1", chapter: acceptedChapter(1) }),
      ev("relay-receipt", { runId: "r1", steps: [], foreshadowingTransitions: [], continuity: { status: "APPROVED", failures: [] } }),
      ev("done", { runId: "r1", status: "approved", nextAction: "next-chapter" }),
    ]);
    expect(s).toMatchObject({ status: "approved", draft: "Final.", wordCount: 1, nextAction: "next-chapter", currentAgent: null });
    expect(s.accepted?.chapterNumber).toBe(1);
    expect(s.completedAgents).toEqual(["outline", "continuation", "continuity"]);
  });
  it("never accepts a chapter without an APPROVED verdict", () => {
    const s = run([startRun, ev("continuity", { status: "VETO", failures: [{ checkId: "A" }] }), ev("chapter-accepted", { chapter: acceptedChapter(1) }), ev("done", { status: "approved" })]);
    expect(s.accepted).toBeNull();
    expect(s.status).toBe("failed");
  });
  it("ignores a chapter-accepted for the wrong chapter or with bad shape", () => {
    expect(run([startRun, approved, ev("chapter-accepted", { chapter: acceptedChapter(2) })]).accepted).toBeNull();
    expect(run([startRun, approved, ev("chapter-accepted", { chapter: { chapterNumber: 1 } })]).accepted).toBeNull();
  });
  it("records a veto and an error", () => {
    const s = run([startRun, ev("continuity", { status: "VETO", failures: [{ checkId: "B", bibleField: "timeline", violation: "v", fix: "f" }] }), ev("done", { status: "vetoed", nextAction: "retry" })]);
    expect(s).toMatchObject({ status: "vetoed", nextAction: "retry", continuity: { status: "VETO" } });
    const e = run([startRun, ev("error", { code: "word-limit", message: "too long", retryable: true }), ev("done", { status: "failed" })]);
    expect(e.error).toEqual({ code: "word-limit", message: "too long", retryable: true });
  });
  it("ignores unknown events and events from another run", () => {
    const s = run([startRun, ev("mystery", {}), ev("agent-delta", { runId: "other", agent: "continuation", text: "x" })]);
    expect(s.draft).toBe("");
  });
  it("marks a running pass interrupted and resets", () => {
    const s = run([startRun, { type: "interrupted" }]);
    expect(s.status).toBe("interrupted");
    expect(passReducer(s, { type: "reset" })).toEqual(EMPTY_PASS);
  });
});
