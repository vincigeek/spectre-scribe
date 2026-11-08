import { describe, expect, it } from "vitest";
import type { AgentDefinitions } from "@/lib/server/agent-loader";
import type { ChatRequest, ModelClient } from "@/lib/server/model-client";
import { createLiveGate, createMemoryStore } from "@/lib/server/live-gate";
import { handlePipelineRequest, parsePipelineRequest } from "@/lib/server/pipeline-handler";
import { profileToTargets } from "@/lib/server/prompts";
import { createSseParser, formatSse, parseSseData, type SseRecord } from "@/lib/sse";
import { analyseStyle } from "@/lib/style-analyser";
import { longDialogueDraft, sentence } from "./fixtures";
import { acceptedChapter, validBible } from "./fixtures-bible";

const profile = (() => { const r = analyseStyle(Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" ")); if (!r.ok) throw new Error("x"); return r.profile; })();
const defs = { outline: "OUTLINE", style: "STYLE", continuation: "CONT", continuity: "JUDGE" } as AgentDefinitions;
const outline = { mode: "chapter", chapterNumber: 1, arcRole: "setup-hook", beats: [{ title: "B", premise: "P.", characterIds: ["char-1"], foreshadowingPlanted: ["fs-1"], foreshadowingPaidOff: [], arcRole: "setup-hook" }] };
const replies: Record<string, string> = {
  OUTLINE: JSON.stringify(outline),
  STYLE: JSON.stringify({ chapterNumber: 1, anchor: "G.", notes: [], targets: profileToTargets(profile) }),
  CONT: longDialogueDraft(),  JUDGE: JSON.stringify({ chapterNumber: 1, status: "APPROVED", failures: [] }),
};
const client = { endpoint: "x", chat: async (r: ChatRequest) => ({ ok: true as const, content: replies[r.messages[0]!.content]!, model: "m", transportRetries: 0 }) } as unknown as ModelClient;
const deps = { getClient: () => client, getDefinitions: async () => defs, gate: null };

const body = (o: Record<string, unknown> = {}) => ({
  runId: "run-1", chapterNumber: 1, retryCount: 0, restartAt: "outline", styleProfile: profile, bible: validBible(),
  acceptedChapters: [], continuityLedger: { characterStatuses: {}, foreshadowing: {} }, ...o,
});
const req = (b: unknown, ct = "application/json") => new Request("http://x/api/pipeline/stream", { method: "POST", headers: { "content-type": ct }, body: typeof b === "string" ? b : JSON.stringify(b) });

async function readAll(res: Response): Promise<SseRecord[]> {
  const out: SseRecord[] = [];
  const p = createSseParser((r) => out.push(r));
  p.feed(await res.text());
  p.end();
  return out;
}

describe("SSE parser", () => {
  it("handles split chunks, CRLF, comments, multi-line data, and drops a partial record", () => {
    const got: SseRecord[] = [];
    const p = createSseParser((r) => got.push(r));
    const text = formatSse(1, "a", { x: 1 }) + ": keep-alive\r\n\r\n" + "id: 2\r\nevent: b\r\ndata: line1\r\ndata: line2\r\n\r\n" + "event: c\ndata: {\"partial\"";
    for (const ch of text) p.feed(ch);
    p.end();
    expect(got).toEqual([{ id: "1", event: "a", data: '{"x":1}' }, { id: "2", event: "b", data: "line1\nline2" }]);
    expect(parseSseData(got[0]!)).toEqual({ x: 1 });
    expect(parseSseData(got[1]!)).toBeUndefined();
  });
});

describe("parsePipelineRequest", () => {
  it("accepts a valid request", () => {
    expect(parsePipelineRequest(body()).ok).toBe(true);
  });
  it.each([
    [{ chapterNumber: 4 }, "fourth chapter"],
    [{ retryCount: 4 }, "fourth retry"],
    [{ extra: 1 }, "unknown field"],
    [{ runId: "../x" }, "bad run id"],
    [{ restartAt: "style" }, "bad restart"],
    [{ chapterNumber: 2 }, "missing earlier chapter"],
    [{ bible: { ...validBible(), beatSheet: [] } }, "invalid bible"],
    [{ styleProfile: { ...profile, sentenceLenMean: -1 } }, "invalid profile"],
    [{ continuityLedger: { foreshadowing: { "fs-9": "open" } } }, "unknown ledger id"],
  ] as Array<[Record<string, unknown>, string]>)("rejects %j (%s)", (o) => {
    expect(parsePipelineRequest(body(o)).ok).toBe(false);
  });
  it("accepts chapter 2 with chapter 1 accepted", () => {
    expect(parsePipelineRequest(body({ chapterNumber: 2, acceptedChapters: [acceptedChapter(1)] })).ok).toBe(true);
  });
});

describe("handlePipelineRequest (T-16)", () => {
  it("streams a full approved pass with SSE headers", async () => {
    const res = await handlePipelineRequest(req(body()), deps);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    const recs = await readAll(res);
    expect(recs.map((r) => r.event)).toContain("chapter-accepted");
    expect(recs.at(-1)!.event).toBe("done");
    expect(recs.map((r) => Number(r.id))).toEqual(recs.map((_, i) => i + 1));
  });
  it("returns JSON errors before the stream starts", async () => {
    expect((await handlePipelineRequest(req(body({ chapterNumber: 4 })), deps)).status).toBe(400);
    expect((await handlePipelineRequest(req("{bad"), deps)).status).toBe(400);
    expect((await handlePipelineRequest(req(body(), "text/plain"), deps)).status).toBe(415);
  });
  it("returns config-missing with no client and makes no model call", async () => {
    const res = await handlePipelineRequest(req(body()), { getClient: () => null, getDefinitions: async () => defs, gate: null });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "config-missing" });
  });
  it("never leaks agent definitions into the stream", async () => {
    const text = await (await handlePipelineRequest(req(body()), deps)).text();
    expect(text).not.toMatch(/OUTLINE"|"JUDGE/);
  });
  it("refuses before any model call when the gate refuses", async () => {
    let calls = 0;
    const counting = { endpoint: "x", chat: async () => { calls += 1; return { ok: false as const, code: "bad-request" as const, transportRetries: 0 }; } } as unknown as ModelClient;
    const gate = createLiveGate({ liveOn: true, accessCode: "c", hashSecret: "s", store: createMemoryStore() });
    const res = await handlePipelineRequest(req(body()), { getClient: () => counting, getDefinitions: async () => defs, gate });
    expect(res.status).toBe(401);
    expect(calls).toBe(0);
  });
  it("releases the per-IP slot after the stream ends", async () => {
    const gate = createLiveGate({ liveOn: true, accessCode: null, hashSecret: "s", store: createMemoryStore() });
    await (await handlePipelineRequest(req(body()), { ...deps, gate })).text();
    const second = await handlePipelineRequest(req(body()), { ...deps, gate });
    expect(second.status).toBe(200);
    await second.text();
  });
});
