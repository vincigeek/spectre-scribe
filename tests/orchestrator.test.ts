import { describe, expect, it } from "vitest";
import type { AgentDefinitions } from "@/lib/server/agent-loader";
import type { ChatRequest, ChatResult, ModelClient } from "@/lib/server/model-client";
import { runChapterPass, type PassEvent, type PassInput } from "@/lib/server/orchestrator";
import { profileToTargets } from "@/lib/server/prompts";
import { analyseStyle } from "@/lib/style-analyser";
import { sentence } from "./fixtures";
import { validBible } from "./fixtures-bible";

const profile = (() => { const r = analyseStyle(Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" ")); if (!r.ok) throw new Error("x"); return r.profile; })();
const defs = { outline: "OUTLINE DEF", style: "STYLE DEF", continuation: "CONT DEF", continuity: "JUDGE DEF" } as AgentDefinitions;

const outline = { mode: "chapter", chapterNumber: 1, arcRole: "setup-hook", beats: [{ title: "Beat", premise: "Something.", characterIds: ["char-1"], foreshadowingPlanted: ["fs-1"], foreshadowingPaidOff: [], arcRole: "setup-hook" }] };
const style = { chapterNumber: 1, anchor: "Guidance.", notes: ["n"], targets: profileToTargets(profile) };
const approved = { chapterNumber: 1, status: "APPROVED", failures: [] };
const veto = { chapterNumber: 1, status: "VETO", failures: [{ checkId: "A", bibleField: "characters[0].status", violation: "v", fix: "f" }] };

type Reply = string | ChatResult;
function fakeClient(replies: Partial<Record<string, Reply>>) {
  const calls: ChatRequest[] = [];
  const client = {
    endpoint: "x",
    chat: async (req: ChatRequest): Promise<ChatResult> => {
      calls.push(req);
      const sys = req.messages[0]!.content;
      const key = sys.split(" ")[0]!;
      const r = replies[key];
      if (r === undefined) throw new Error(`no reply for ${key}`);
      return typeof r === "string" ? { ok: true, content: r, model: "m", transportRetries: 0 } : r;
    },
  } as unknown as ModelClient;
  return { client, calls };
}

const input = (o: Partial<PassInput> = {}): PassInput => ({
  runId: "run-1", chapterNumber: 1, retryCount: 0, restartAt: "outline", styleProfile: profile, bible: validBible(),
  acceptedChapters: [], foreshadowingState: { "fs-1": "open", "fs-2": "open" }, ...o,
});

async function run(i: PassInput, replies: Partial<Record<string, Reply>>) {
  const events: PassEvent[] = [];
  const f = fakeClient(replies);
  await runChapterPass(i, { client: f.client, definitions: defs, emit: (e) => events.push(e) });
  return { events, names: events.map((e) => e.event), calls: f.calls };
}

const all = { OUTLINE: JSON.stringify(outline), STYLE: JSON.stringify(style), CONT: "# A Title\n\nShort draft prose.", JUDGE: JSON.stringify(approved) };

describe("runChapterPass (T-15, T-17)", () => {
  it("runs the fixed order and accepts on APPROVED", async () => {
    const { names, calls, events } = await run(input(), all);
    expect(calls.map((c) => c.messages[0]!.content.split(" ")[0])).toEqual(["OUTLINE", "STYLE", "CONT", "JUDGE"]);
    expect(calls.map((c) => c.tier)).toEqual(["standard", "standard", "standard", "premium"]);
    expect(names).toEqual(["run-start", "agent-start", "agent-complete", "agent-start", "agent-complete", "agent-start", "agent-complete", "agent-start", "continuity", "chapter-accepted", "relay-receipt", "done"]);
    const acc = events.find((e) => e.event === "chapter-accepted")!;
    expect(acc.data).toMatchObject({ chapterNumber: 1, chapter: { title: "A Title" } });
  });
  it("on VETO emits the receipt and done=vetoed, never chapter-accepted", async () => {
    const { names, events } = await run(input(), { ...all, JUDGE: JSON.stringify(veto) });
    expect(names).not.toContain("chapter-accepted");
    expect(events.at(-1)).toMatchObject({ event: "done", data: { status: "vetoed", nextAction: "retry" } });
  });
  it("a continuation retry reuses checkpoints and sends veto notes", async () => {
    const { calls } = await run(input({ retryCount: 1, restartAt: "continuation", checkpoints: { outline, style }, vetoNotes: veto.failures as never }), all);
    expect(calls.map((c) => c.messages[0]!.content.split(" ")[0])).toEqual(["CONT", "JUDGE"]);
    expect(calls[0]!.messages[1]!.content).toContain("VETO NOTES");
  });
  it("invalid checkpoints force an outline restart", async () => {
    const { calls } = await run(input({ retryCount: 1, restartAt: "continuation", checkpoints: { outline: { bad: 1 }, style } }), all);
    expect(calls[0]!.messages[0]!.content).toBe("OUTLINE DEF");
  });
  it("rejects a fourth retry before any model call", async () => {
    const { calls, events } = await run(input({ retryCount: 4 }), all);
    expect(calls).toHaveLength(0);
    expect(events[0]).toMatchObject({ event: "error", data: { code: "retry-exhausted" } });
  });
  it("rejects a draft over the limit", async () => {
    const { events, names } = await run(input(), { ...all, CONT: "word ".repeat(801) });
    expect(names).not.toContain("chapter-accepted");
    expect(events.find((e) => e.event === "error")).toMatchObject({ data: { code: "word-limit" } });
  });
  it("treats an unparseable verdict as failure, not approval", async () => {
    const { names } = await run(input(), { ...all, JUDGE: "APPROVED" });
    expect(names).not.toContain("chapter-accepted");
  });
  it("maps a provider failure to a safe error", async () => {
    const { events } = await run(input(), { ...all, STYLE: { ok: false, code: "provider-auth", transportRetries: 0 } });
    expect(events.find((e) => e.event === "error")).toMatchObject({ data: { code: "provider-auth", retryable: false } });
    expect(JSON.stringify(events)).not.toMatch(/DEF/);
  });
  it("records foreshadowing transitions from paid-off beats", async () => {
    const o3 = { ...outline, chapterNumber: 3, arcRole: "payoff", beats: [{ ...outline.beats[0], arcRole: "payoff", foreshadowingPlanted: [], foreshadowingPaidOff: ["fs-1", "fs-2"] }] };
    const { events } = await run(input({ chapterNumber: 3 }), { ...all, OUTLINE: JSON.stringify(o3), STYLE: JSON.stringify({ ...style, chapterNumber: 3 }), JUDGE: JSON.stringify({ ...approved, chapterNumber: 3 }) });
    const r = events.find((e) => e.event === "relay-receipt")!;
    expect((r.data as { foreshadowingTransitions: unknown[] }).foreshadowingTransitions).toEqual([{ id: "fs-1", from: "open", to: "paidOff" }, { id: "fs-2", from: "open", to: "paidOff" }]);
  });
});
