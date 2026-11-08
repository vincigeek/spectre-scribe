import { describe, expect, it } from "vitest";
import type { AgentDefinitions } from "@/lib/server/agent-loader";
import type { ChatRequest, ChatResult, ModelClient } from "@/lib/server/model-client";
import { runChapterPass, type PassEvent, type PassInput } from "@/lib/server/orchestrator";
import { profileToTargets } from "@/lib/server/prompts";
import { analyseStyle } from "@/lib/style-analyser";
import { longDialogueDraft, sentence, zhSentence } from "./fixtures";
import { acceptedChapter, validBible } from "./fixtures-bible";

const profile = (() => { const r = analyseStyle(Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" ")); if (!r.ok) throw new Error("x"); return r.profile; })();
const zhProfile = (() => { const r = analyseStyle(Array.from({ length: 20 }, (_, i) => zhSentence(20, i)).join("")); if (!r.ok) throw new Error("x"); return r.profile; })();
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

const all = { OUTLINE: JSON.stringify(outline), STYLE: JSON.stringify(style), CONT: longDialogueDraft(), JUDGE: JSON.stringify(approved) };

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
  it("rejects a draft with too little dialogue", async () => {
    // 700 words, so only the dialogue check fires.
    const { events, names } = await run(input(), { ...all, CONT: `# A Title\n\n${sentence(700)}` });
    expect(names).not.toContain("chapter-accepted");
    expect(events.find((e) => e.event === "error")).toMatchObject({ data: { code: "dialogue-share", retryable: true } });
  });
  it("rejects a draft below the length minimum", async () => {
    // 60% dialogue, so only the length check fires.
    const { events, names } = await run(input(), { ...all, CONT: "\"We must go,\" she said." });
    expect(names).not.toContain("chapter-accepted");
    expect(events.find((e) => e.event === "error")).toMatchObject({ data: { code: "chapter-short", retryable: true } });
  });
  it("accepts a draft at 27% dialogue under the relaxed 25% floor (2026-11-08)", async () => {
    // 190 dialogue units of 702 total (~27%): would have failed the old 30% floor.
    const draft = `# A Title\n\n${"\"Go now,\" she said. ".repeat(95)}\n\n${sentence(320)}`;
    const { names } = await run(input(), { ...all, CONT: draft });
    expect(names).toContain("chapter-accepted");
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

describe("outline check feedback (live flash-lite finding 2026-11-08)", () => {
  const bareBeat = { ...outline.beats[0], title: "Bare", foreshadowingPlanted: [], foreshadowingPaidOff: [] };
  const badOutline = JSON.stringify({ ...outline, beats: [outline.beats[0], bareBeat] });
  const goodOutline = JSON.stringify(outline);

  function queueClient(queue: string[]) {
    const calls: ChatRequest[] = [];
    const client = {
      endpoint: "x",
      chat: async (req: ChatRequest): Promise<ChatResult> => {
        calls.push(req);
        const key = req.messages[0]!.content.split(" ")[0]!;
        const next = key === "OUTLINE" ? queue.shift() : { OUTLINE: goodOutline, STYLE: JSON.stringify(style), CONT: longDialogueDraft(), JUDGE: JSON.stringify(approved) }[key];
        if (next === undefined) throw new Error(`no reply for ${key}`);
        return { ok: true, content: next, model: "m", transportRetries: 0 };
      },
    } as unknown as ModelClient;
    return { client, calls };
  }

  it("retries the outline call with the exact check issues and then accepts", async () => {
    const events: PassEvent[] = [];
    const f = queueClient([badOutline, goodOutline]);
    await runChapterPass(input(), { client: f.client, definitions: defs, emit: (e) => events.push(e) });
    const outlineCalls = f.calls.filter((c) => c.messages[0]!.content.startsWith("OUTLINE"));
    expect(outlineCalls).toHaveLength(2);
    expect(outlineCalls[1]!.messages[1]!.content).toContain("OUTLINE CHECKS FAILED ON THE PREVIOUS ATTEMPT");
    expect(outlineCalls[1]!.messages[1]!.content).toContain("beats[1] must plant or pay off foreshadowing");
    expect(events.map((e) => e.event)).toContain("chapter-accepted");
  });

  it("fails the pass after three bad outlines", async () => {
    const events: PassEvent[] = [];
    const f = queueClient([badOutline, badOutline, badOutline]);
    await runChapterPass(input(), { client: f.client, definitions: defs, emit: (e) => events.push(e) });
    const outlineCalls = f.calls.filter((c) => c.messages[0]!.content.startsWith("OUTLINE"));
    expect(outlineCalls).toHaveLength(3);
    expect(events.map((e) => e.event)).not.toContain("chapter-accepted");
    // The pass itself is still retryable at the pass level (retryCount 0 < 3);
    // the three attempts above were the outline call's in-pass retries.
    expect(events.find((e) => e.event === "error")).toMatchObject({ data: { code: "schema-mismatch", retryable: true } });
  });

  it("keeps the in-pass outline bound separate from the user retry cap", async () => {
    const events: PassEvent[] = [];
    const f = queueClient([badOutline, badOutline, badOutline]);
    await runChapterPass(input({ retryCount: 3 }), { client: f.client, definitions: defs, emit: (e) => events.push(e) });
    expect(f.calls.filter((c) => c.messages[0]!.content.startsWith("OUTLINE"))).toHaveLength(3);
    expect(events.find((e) => e.event === "error")).toMatchObject({ data: { code: "schema-mismatch", retryable: false } });
    expect(events.at(-1)).toMatchObject({ event: "done", data: { nextAction: "edit-bible" } });
  });
});

describe("continuation check feedback (live zh finding 2026-11-08)", () => {
  // 700 words, no dialogue, so only the dialogue check fires.
  const lowDialogue = `# A Title\n\n${sentence(700)}`;
  const goodDraft = longDialogueDraft();

  function queueContClient(queue: string[], fixedReplies: Record<string, string> = {
    OUTLINE: JSON.stringify(outline),
    STYLE: JSON.stringify(style),
    JUDGE: JSON.stringify(approved),
  }) {
    const calls: ChatRequest[] = [];
    const client = {
      endpoint: "x",
      chat: async (req: ChatRequest): Promise<ChatResult> => {
        calls.push(req);
        const key = req.messages[0]!.content.split(" ")[0]!;
        const next = key === "CONT" ? queue.shift() : fixedReplies[key];
        if (next === undefined) throw new Error(`no reply for ${key}`);
        return { ok: true, content: next, model: "m", transportRetries: 0 };
      },
    } as unknown as ModelClient;
    return { client, calls };
  }

  it("retries the continuation call with the measured dialogue share and then accepts", async () => {
    const events: PassEvent[] = [];
    const f = queueContClient([lowDialogue, goodDraft]);
    await runChapterPass(input(), { client: f.client, definitions: defs, emit: (e) => events.push(e) });
    const contCalls = f.calls.filter((c) => c.messages[0]!.content.startsWith("CONT"));
    expect(contCalls).toHaveLength(2);
    expect(contCalls[1]!.messages[1]!.content).toContain("DRAFT CHECKS FAILED ON THE PREVIOUS ATTEMPT");
    expect(contCalls[1]!.messages[1]!.content).toContain("0% dialogue");
    expect(events.map((e) => e.event)).toContain("chapter-accepted");
  });

  it("fails the pass after three low-dialogue drafts", async () => {
    const events: PassEvent[] = [];
    const f = queueContClient([lowDialogue, lowDialogue, lowDialogue]);
    await runChapterPass(input(), { client: f.client, definitions: defs, emit: (e) => events.push(e) });
    const contCalls = f.calls.filter((c) => c.messages[0]!.content.startsWith("CONT"));
    expect(contCalls).toHaveLength(3);
    expect(events.map((e) => e.event)).not.toContain("chapter-accepted");
    expect(events.find((e) => e.event === "error")).toMatchObject({ data: { code: "dialogue-share", retryable: true } });
  });

  it("repairs a short Chinese Chapter 2 draft with actionable beat guidance", async () => {
    const outline2 = {
      mode: "chapter",
      chapterNumber: 2,
      arcRole: "escalation",
      beats: [{ ...outline.beats[0], arcRole: "escalation", premise: "A reversal hits." }],
    };
    const style2 = { ...style, chapterNumber: 2, targets: profileToTargets(zhProfile) };
    const approved2 = { ...approved, chapterNumber: 2 };
    const shortDraft = zhSentence(734);
    const goodDraft = `「${zhSentence(400)}」${zhSentence(800)}`;
    const f = queueContClient([shortDraft, goodDraft], {
      OUTLINE: JSON.stringify(outline2),
      STYLE: JSON.stringify(style2),
      JUDGE: JSON.stringify(approved2),
    });
    const events: PassEvent[] = [];

    await runChapterPass(input({
      chapterNumber: 2,
      styleProfile: zhProfile,
      acceptedChapters: [acceptedChapter(1)],
    }), { client: f.client, definitions: defs, emit: (e) => events.push(e) });

    const continuationCalls = f.calls.filter((c) => c.messages[0]!.content.startsWith("CONT"));
    expect(f.calls.map((c) => c.messages[0]!.content.split(" ")[0])).toEqual(["OUTLINE", "STYLE", "CONT", "CONT", "JUDGE"]);
    expect(continuationCalls).toHaveLength(2);
    expect(continuationCalls[1]!.messages[1]!.content).toContain("The draft has 734 字; at least 1200 is required.");
    expect(continuationCalls[1]!.messages[1]!.content).toContain("expand every outline beat into its own full scene");
    expect(continuationCalls[1]!.messages[1]!.content).toContain("at least 1320 字");
    expect(continuationCalls.every((c) => c.maxTokens === 2600)).toBe(true);
    const accepted = events.find((e) => e.event === "chapter-accepted");
    expect(accepted).toMatchObject({ data: { chapterNumber: 2 } });
    expect((accepted as Extract<PassEvent, { event: "chapter-accepted" }>).data.wordCount).toBeGreaterThanOrEqual(1200);
  });

  it("repairs a short Chinese Chapter 3 draft with actionable payoff guidance", async () => {
    const outline3 = {
      mode: "chapter",
      chapterNumber: 3,
      arcRole: "payoff",
      beats: [{ ...outline.beats[0], arcRole: "payoff", foreshadowingPlanted: [], foreshadowingPaidOff: ["fs-1", "fs-2"] }],
    };
    const style3 = { ...style, chapterNumber: 3, targets: profileToTargets(zhProfile) };
    const approved3 = { ...approved, chapterNumber: 3 };
    const shortDraft = zhSentence(830);
    const goodDraft = `「${zhSentence(400)}」${zhSentence(800)}`;
    const f = queueContClient([shortDraft, goodDraft], {
      OUTLINE: JSON.stringify(outline3),
      STYLE: JSON.stringify(style3),
      JUDGE: JSON.stringify(approved3),
    });
    const events: PassEvent[] = [];

    await runChapterPass(input({
      chapterNumber: 3,
      styleProfile: zhProfile,
      acceptedChapters: [acceptedChapter(1), acceptedChapter(2)],
    }), { client: f.client, definitions: defs, emit: (e) => events.push(e) });

    const continuationCalls = f.calls.filter((c) => c.messages[0]!.content.startsWith("CONT"));
    expect(f.calls.map((c) => c.messages[0]!.content.split(" ")[0])).toEqual(["OUTLINE", "STYLE", "CONT", "CONT", "JUDGE"]);
    expect(continuationCalls).toHaveLength(2);
    expect(continuationCalls[1]!.messages[1]!.content).toContain("The draft has 830 字; at least 1200 is required.");
    expect(continuationCalls[1]!.messages[1]!.content).toContain("expand every outline beat into its own full scene");
    expect(continuationCalls.every((c) => c.maxTokens === 2600)).toBe(true);
    expect(events.find((e) => e.event === "chapter-accepted")).toMatchObject({ data: { chapterNumber: 3, wordCount: 1200 } });
  });
});