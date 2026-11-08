/**
 * T-17 and T-20 coverage gaps found in the 2026-11-08 audit: retries to approval,
 * retry cap, read-only context in every call, Check A (dead character), Check B
 * (timeline veto), deferred items, final payoff, and "never rewrites the draft".
 */
import { describe, expect, it } from "vitest";
import type { AgentDefinitions } from "@/lib/server/agent-loader";
import type { ChatRequest, ChatResult, ModelClient } from "@/lib/server/model-client";
import { runChapterPass, type PassEvent, type PassInput } from "@/lib/server/orchestrator";
import { profileToTargets } from "@/lib/server/prompts";
import { analyseStyle } from "@/lib/style-analyser";
import { sentence } from "./fixtures";
import { acceptedChapter, validBible } from "./fixtures-bible";

const profile = (() => { const r = analyseStyle(Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" ")); if (!r.ok) throw new Error("x"); return r.profile; })();
const defs = { outline: "OUTLINE DEF", style: "STYLE DEF", continuation: "CONT DEF", continuity: "JUDGE DEF" } as AgentDefinitions;
const DRAFT = `# Kept Title\n\n${"\"We must go now,\" she said. \"The exact draft text the server must not change.\" ".repeat(50)}`.trimEnd();

const beat = (n: 1 | 2 | 3, o: Record<string, unknown> = {}) => ({
  title: "Beat", premise: n === 2 ? "A reversal hits." : "Something happens.", characterIds: ["char-1"],
  foreshadowingPlanted: n === 3 ? [] : ["fs-1"], foreshadowingPaidOff: n === 3 ? ["fs-1", "fs-2"] : [],
  arcRole: { 1: "setup-hook", 2: "escalation", 3: "payoff" }[n], ...o,
});
const outline = (n: 1 | 2 | 3, beats = [beat(n)]) => JSON.stringify({ mode: "chapter", chapterNumber: n, arcRole: { 1: "setup-hook", 2: "escalation", 3: "payoff" }[n], beats });
const style = (n: number) => JSON.stringify({ chapterNumber: n, anchor: "Guidance.", notes: [], targets: profileToTargets(profile) });
const approved = (n: number) => JSON.stringify({ chapterNumber: n, status: "APPROVED", failures: [] });
const veto = (n: number, checkId = "B") => JSON.stringify({ chapterNumber: n, status: "VETO", failures: [{ checkId, bibleField: "timeline[1].event", violation: "Effect before cause.", fix: "Move the event after its cause." }] });

function client(script: Record<string, string | ((req: ChatRequest) => string)>) {
  const calls: ChatRequest[] = [];
  const c = {
    endpoint: "x",
    chat: async (req: ChatRequest): Promise<ChatResult> => {
      calls.push(req);
      const key = req.messages[0]!.content.split(" ")[0]!;
      const r = script[key];
      if (r === undefined) throw new Error(`no reply for ${key}`);
      return { ok: true, content: typeof r === "function" ? r(req) : r, model: "m", transportRetries: 0 };
    },
  } as unknown as ModelClient;
  return { c, calls };
}

function input(n: 1 | 2 | 3, o: Partial<PassInput> = {}): PassInput {
  return {
    runId: `run-${n}`, chapterNumber: n, retryCount: 0, restartAt: "outline", styleProfile: profile, bible: validBible(),
    acceptedChapters: [1, 2].filter((k) => k < n).map((k) => acceptedChapter(k as 1 | 2)),
    foreshadowingState: { "fs-1": "open", "fs-2": "open" }, ...o,
  };
}

async function run(i: PassInput, script: Record<string, string | ((req: ChatRequest) => string)>) {
  const events: PassEvent[] = [];
  const { c, calls } = client(script);
  await runChapterPass(i, { client: c, definitions: defs, emit: (e) => events.push(e) });
  const done = events.at(-1)!;
  const accepted = events.find((e) => e.event === "chapter-accepted");
  return { events, calls, done, accepted, agents: calls.map((r) => r.messages[0]!.content.split(" ")[0]) };
}

describe("T-17: retries", () => {
  it("VETO, then a user-requested outline retry with veto notes, then approval", async () => {
    const first = await run(input(2), { OUTLINE: outline(2), STYLE: style(2), CONT: DRAFT, JUDGE: veto(2) });
    expect(first.done.data).toMatchObject({ status: "vetoed", nextAction: "retry" });
    const failures = (first.events.find((e) => e.event === "continuity")!.data as { failures: unknown[] }).failures;
    const second = await run(input(2, { retryCount: 1, vetoNotes: failures as PassInput["vetoNotes"] }), { OUTLINE: outline(2), STYLE: style(2), CONT: DRAFT, JUDGE: approved(2) });
    expect(second.agents).toEqual(["OUTLINE", "STYLE", "CONT", "JUDGE"]);
    for (const c of second.calls) expect(c.messages[1]!.content).toContain("VETO NOTES FROM THE LAST PASS");
    expect(second.accepted).toBeDefined();
  });
  it("a chapter that is vetoed on its third retry ends with edit-bible, not another retry", async () => {
    const r = await run(input(1, { retryCount: 3, vetoNotes: [] }), { OUTLINE: outline(1), STYLE: style(1), CONT: DRAFT, JUDGE: veto(1) });
    expect(r.done.data).toMatchObject({ status: "vetoed", nextAction: "edit-bible" });
    expect(r.accepted).toBeUndefined();
  });
  it("every agent call carries the read-only context, and later agents get earlier outputs", async () => {
    const r = await run(input(2), { OUTLINE: outline(2), STYLE: style(2), CONT: DRAFT, JUDGE: approved(2) });
    for (const c of r.calls) {
      const u = c.messages[1]!.content;
      for (const s of ["RUN PARAMETERS", "<<<STYLE PROFILE", "<<<STORY BIBLE", "<<<ACCEPTED CHAPTERS", "<<<CONTINUITY LEDGER"]) expect(u).toContain(s);
      expect(u).toContain("Prose placeholder 1."); // chapter 1 text reaches every agent
      expect(u).not.toContain("VETO NOTES"); // first attempt
    }
    expect(r.calls[1]!.messages[1]!.content).toContain("<<<OUTLINE");
    expect(r.calls[2]!.messages[1]!.content).toContain("<<<STYLE ANCHOR");
    expect(r.calls[3]!.messages[1]!.content).toContain("<<<DRAFT");
  });
});

describe("T-20: continuity checks", () => {
  it("Check A: a dead character acting in a later chapter is rejected before any prose is written", async () => {
    const b = validBible();
    b.beatSheet[0]!.characterStates["char-2"] = "dead";
    b.beatSheet[1]!.characterStates["char-2"] = "dead";
    b.beatSheet[2]!.characterStates["char-2"] = "dead";
    const r = await run(input(2, { bible: b }), { OUTLINE: outline(2, [beat(2, { characterIds: ["char-2"] })]), STYLE: style(2), CONT: DRAFT, JUDGE: approved(2) });
    // The outline check fails, so the pass retries the outline call twice
    // with the check issues fed back, then fails before any prose is written.
    expect(r.agents).toEqual(["OUTLINE", "OUTLINE", "OUTLINE"]);
    expect(r.calls[1]!.messages[1]!.content).toContain("OUTLINE CHECKS FAILED ON THE PREVIOUS ATTEMPT");
    expect(r.events.find((e) => e.event === "error")).toMatchObject({ data: { code: "schema-mismatch" } });
    expect(r.accepted).toBeUndefined();
  });
  it("Check A: the ledger marks a character dead even if the beat sheet does not", async () => {
    const r = await run(input(3, { characterStatuses: { "char-1": "dead" } }), { OUTLINE: outline(3), STYLE: style(3), CONT: DRAFT, JUDGE: approved(3) });
    expect(r.agents).toEqual(["OUTLINE", "OUTLINE", "OUTLINE"]);
  });
  it("Check A: a flashback, memory, or ghost exception is allowed", async () => {
    const b = validBible();
    b.beatSheet[0]!.characterStates["char-2"] = "dead";
    const r = await run(input(2, { bible: b }), { OUTLINE: outline(2, [beat(2, { characterIds: ["char-2"], premise: "A reversal arrives through a flashback." })]), STYLE: style(2), CONT: DRAFT, JUDGE: approved(2) });
    expect(r.accepted).toBeDefined();
  });
  it("Check B: a timeline veto blocks acceptance and reaches the user with all four fields", async () => {
    const r = await run(input(2), { OUTLINE: outline(2), STYLE: style(2), CONT: DRAFT, JUDGE: veto(2, "B") });
    expect(r.accepted).toBeUndefined();
    const c = r.events.find((e) => e.event === "continuity")!.data as { status: string; failures: Array<Record<string, string>> };
    expect(c.status).toBe("VETO");
    expect(Object.keys(c.failures[0]!).sort()).toEqual(["bibleField", "checkId", "fix", "violation"]);
  });
  it("Check C: chapter 3 must pay off an item still open", async () => {
    const r = await run(input(3), { OUTLINE: outline(3, [beat(3, { foreshadowingPaidOff: ["fs-1"] })]), STYLE: style(3), CONT: DRAFT, JUDGE: approved(3) });
    expect(r.agents).toEqual(["OUTLINE", "OUTLINE", "OUTLINE"]);
  });
  it("Check C: a deferred item counts as open and must be paid off in chapter 3", async () => {
    const state = { "fs-1": "paidOff" as const, "fs-2": "deferred" as const };
    const bad = await run(input(3, { foreshadowingState: state }), { OUTLINE: outline(3, [beat(3, { foreshadowingPaidOff: ["fs-1"] })]), STYLE: style(3), CONT: DRAFT, JUDGE: approved(3) });
    expect(bad.accepted).toBeUndefined();
    const good = await run(input(3, { foreshadowingState: state }), { OUTLINE: outline(3, [beat(3, { foreshadowingPaidOff: ["fs-2"] })]), STYLE: style(3), CONT: DRAFT, JUDGE: approved(3) });
    expect(good.accepted).toBeDefined();
    const receipt = good.events.find((e) => e.event === "relay-receipt")!.data as { foreshadowingTransitions: unknown[] };
    expect(receipt.foreshadowingTransitions).toEqual([{ id: "fs-2", from: "deferred", to: "paidOff" }]);
  });
  it("Check C: final-chapter payoff of every item is accepted", async () => {
    const r = await run(input(3), { OUTLINE: outline(3), STYLE: style(3), CONT: DRAFT, JUDGE: approved(3) });
    expect(r.accepted).toBeDefined();
  });
  it("the continuity stage never rewrites the draft", async () => {
    const ok = await run(input(1), { OUTLINE: outline(1), STYLE: style(1), CONT: DRAFT, JUDGE: approved(1) });
    expect((ok.accepted!.data as { chapter: { prose: string } }).chapter.prose).toBe(DRAFT);
    const vetoed = await run(input(1), { OUTLINE: outline(1), STYLE: style(1), CONT: DRAFT, JUDGE: veto(1) });
    const drafts = vetoed.events.filter((e) => e.event === "agent-complete" && (e.data as { agent: string }).agent === "continuation");
    expect(drafts).toHaveLength(1);
    expect((drafts[0]!.data as { output: { draft: string } }).output.draft).toBe(DRAFT);
    expect(JSON.stringify(vetoed.events.filter((e) => e.event !== "agent-complete"))).not.toContain("exact draft text");
  });
});
