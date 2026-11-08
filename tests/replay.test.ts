import { describe, expect, it } from "vitest";
import { buildReplayFile, createPassRecorder, parseReplayFile, replayDurationMs, replaySchedule, scrub, type ReplayPass } from "@/lib/replay";
import { analyseStyle } from "@/lib/style-analyser";
import { sentence } from "./fixtures";
import { validBible } from "./fixtures-bible";

const profile = (() => { const r = analyseStyle(Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" ")); if (!r.ok) throw new Error("x"); return r.profile; })();

function recordPass(n: 1 | 2 | 3, accepted = true, retryCount = 0): ReplayPass {
  let t = 0;
  const r = createPassRecorder({ chapterNumber: n, retryCount, restartPoint: "outline" }, () => t);
  r.add("run-start", { runId: "r", chapterNumber: n, retryCount });
  t = 1000;
  r.add("agent-delta", { agent: "continuation", text: "Hel" });
  t = 1050;
  r.add("agent-delta", { agent: "continuation", text: "lo" });
  t = 1200;
  r.add("agent-delta", { agent: "continuation", text: "!" });
  r.add("bogus-event", {});
  t = 2000;
  if (accepted) r.add("chapter-accepted", { chapterNumber: n, prompt: "SECRET PROMPT" });
  r.add("done", { status: accepted ? "approved" : "vetoed" });
  return r.finish();
}

const meta = { recordedAt: "2026-11-08T05:00:00.000Z", appVersion: "0.1.0", language: "en" as const, models: { standard: "std", premium: "prem" }, styleProfile: profile, bible: validBible() };

describe("recorder (T-33)", () => {
  it("merges deltas within a 100 ms bucket and drops unknown events", () => {
    const p = recordPass(1);
    const deltas = p.events.filter((e) => e.event === "agent-delta");
    expect(deltas.map((d) => (d.data as { text: string }).text)).toEqual(["Hello", "!"]);
    expect(p.events.map((e) => e.event)).not.toContain("bogus-event");
  });
  it("scrubs forbidden fields at any depth", () => {
    expect(scrub({ a: 1, prompt: "x", nested: [{ apiKey: "k", ok: 2 }] })).toEqual({ a: 1, nested: [{ ok: 2 }] });
    expect(JSON.stringify(recordPass(1))).not.toContain("SECRET PROMPT");
  });
});

describe("buildReplayFile", () => {
  it("refuses a run without all three accepted chapters", () => {
    expect(buildReplayFile({ ...meta, passes: [recordPass(1), recordPass(2)] })).toEqual({ ok: false, reason: "chapter 3 was not accepted" });
  });
  it("builds a valid file that parses back, including a vetoed pass", () => {
    const b = buildReplayFile({ ...meta, passes: [recordPass(1), recordPass(2, false), recordPass(2, true, 1), recordPass(3)] });
    expect(b.ok).toBe(true);
    if (b.ok) expect(parseReplayFile(JSON.parse(JSON.stringify(b.file))).ok).toBe(true);
  });
});

describe("parseReplayFile", () => {
  const good = (() => { const b = buildReplayFile({ ...meta, passes: [recordPass(1), recordPass(2), recordPass(3)] }); if (!b.ok) throw new Error("x"); return b.file; })();
  it.each([
    [{ kind: "other" }, "kind"],
    [{ version: 2 }, "version"],
    [{ language: "zh" }, "language mismatch"],
    [{ recordedAt: "yesterday" }, "date"],
    [{ passes: [] }, "no passes"],
    [{ passes: [{ chapterNumber: 1, events: [{ tMs: 5, event: "done", data: {} }, { tMs: 1, event: "done", data: {} }] }] }, "time goes back"],
    [{ apiKey: "k" }, "forbidden field"],
  ] as Array<[Record<string, unknown>, string]>)("rejects %j (%s)", (o) => {
    expect(parseReplayFile({ ...good, ...o }).ok).toBe(false);
  });
});

describe("replaySchedule", () => {
  const file = (() => { const b = buildReplayFile({ ...meta, passes: [recordPass(1), recordPass(2), recordPass(3)] }); if (!b.ok) throw new Error("x"); return b.file; })();
  it("plays at 1x with 1.5 s gaps between passes", () => {
    const s = replaySchedule(file, 1);
    const starts = s.filter((e) => e.event === "run-start").map((e) => e.atMs);
    expect(starts).toEqual([0, 3500, 7000]);
    expect(replayDurationMs(file, 1)).toBe(9000);
  });
  it("halves the recorded time at 2x and is ordered", () => {
    const s = replaySchedule(file, 2);
    expect(s.filter((e) => e.event === "run-start").map((e) => e.atMs)).toEqual([0, 2500, 5000]);
    expect(s.map((e) => e.atMs)).toEqual([...s.map((e) => e.atMs)].sort((a, b) => a - b));
  });
  it("skip puts every event at time 0", () => {
    expect(replaySchedule(file, "skip").every((e) => e.atMs === 0)).toBe(true);
  });
});
