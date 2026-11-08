import { describe, expect, it } from "vitest";
import { bibleJson, chapterMarkdown, safeFileName, storyMarkdown } from "@/lib/downloads";
import { createEmptySession, deriveLedger, restoreSession, serialiseSession } from "@/lib/session";
import { analyseStyle } from "@/lib/style-analyser";
import { acceptedChapter, validBible } from "./fixtures-bible";
import { sentence } from "./fixtures";

const profile = (() => {
  const r = analyseStyle(Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" "));
  if (!r.ok) throw new Error("fixture");
  return r.profile;
})();

describe("deriveLedger", () => {
  it("applies beat-sheet states and receipt transitions in chapter order", () => {
    const b = validBible();
    b.beatSheet[1]!.characterStates["char-2"] = "dead";
    const ledger = deriveLedger(b, [
      acceptedChapter(2, [{ id: "fs-1", from: "deferred", to: "paidOff" }]),
      acceptedChapter(1, [{ id: "fs-1", from: "open", to: "deferred" }]),
    ]);
    expect(ledger.characterStatuses["char-2"]).toBe("dead");
    expect(ledger.foreshadowing).toEqual({ "fs-1": "paidOff", "fs-2": "open" });
  });
  it("does not mutate the bible", () => {
    const b = validBible();
    const before = JSON.stringify(b);
    deriveLedger(b, [acceptedChapter(1, [{ id: "fs-1", from: "open", to: "paidOff" }])]);
    expect(JSON.stringify(b)).toBe(before);
  });
});

describe("session restore (T-04)", () => {
  const full = () => ({ ...createEmptySession(), styleProfile: profile, bible: validBible(), acceptedChapters: [acceptedChapter(1)], retryCounters: { 1: 2 } });

  it("round-trips a valid session", () => {
    const s = full();
    const r = restoreSession(serialiseSession(s));
    expect(r.notice).toBe("restored");
    expect(r.session.acceptedChapters).toEqual(s.acceptedChapters);
    expect(r.session.retryCounters).toEqual({ 1: 2 });
    expect(r.session.continuityLedger.foreshadowing["fs-1"]).toBe("open");
  });
  it("starts empty with no stored data", () => {
    expect(restoreSession(null)).toEqual({ session: createEmptySession(), notice: null });
  });
  it("turns a running pipeline into awaiting-retry", () => {
    expect(restoreSession(serialiseSession({ ...full(), pipelineStatus: "running" })).session.pipelineStatus).toBe("awaiting-retry");
  });
  it.each([
    ["not json", "{"],
    ["wrong version", JSON.stringify({ ...createEmptySession(), version: 99 })],
    ["bad profile", JSON.stringify({ ...createEmptySession(), styleProfile: { language: "en" } })],
    ["chapter gap", serialiseSession({ ...createEmptySession(), acceptedChapters: [acceptedChapter(2)] })],
    ["retry counter over 3", serialiseSession({ ...createEmptySession(), retryCounters: { 1: 4 } })],
    ["bad status", JSON.stringify({ ...createEmptySession(), pipelineStatus: "weird" })],
  ])("discards %s", (_name, raw) => {
    const r = restoreSession(raw);
    expect(r.session).toEqual(createEmptySession());
    expect(r.notice).toMatch(/^discarded-/);
  });
});

describe("downloads (T-12)", () => {
  it("serialises the bible as pretty JSON", () => {
    const b = validBible();
    expect(JSON.parse(bibleJson(b))).toEqual(b);
  });
  it("builds chapter and story Markdown in order", () => {
    expect(chapterMarkdown(acceptedChapter(1))).toBe("# Chapter 1: Title 1\n\nProse placeholder 1.\n");
    const md = storyMarkdown("Story", [acceptedChapter(3), acceptedChapter(1), acceptedChapter(2)]);
    expect(md.indexOf("## Chapter 1")).toBeLessThan(md.indexOf("## Chapter 2"));
    expect(md.indexOf("## Chapter 2")).toBeLessThan(md.indexOf("## Chapter 3"));
    expect(storyMarkdown("S", [], { replay: true })).toContain("Replay");
  });
  it("makes ASCII file names", () => {
    expect(safeFileName("我的 Story: Part 1", "md")).toBe("story-part-1.md");
    expect(safeFileName("故事", "json")).toBe("spectre-scribe.json");
  });
});
