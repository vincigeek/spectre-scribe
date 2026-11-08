import { describe, expect, it } from "vitest";
import { analyseStyle } from "@/lib/style-analyser";
import { parseStyleProfile } from "@/lib/style-profile";
import { sentence } from "./fixtures";

const sample = Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" ");
const r = analyseStyle(sample);
if (!r.ok) throw new Error("fixture");
const good = r.profile;

describe("parseStyleProfile", () => {
  it("accepts a real profile and returns a copy", () => {
    const parsed = parseStyleProfile(good);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual(good);
      expect(parsed.value).not.toBe(good);
    }
  });
  it("rejects unknown fields", () => {
    expect(parseStyleProfile({ ...good, extra: 1 }).ok).toBe(false);
    expect(parseStyleProfile({ ...good, pacingMarkers: { ...good.pacingMarkers, extra: 1 } }).ok).toBe(false);
  });
  it("rejects NaN, Infinity, negatives, and ratios above 1", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(parseStyleProfile({ ...good, sentenceLenMean: bad }).ok).toBe(false);
    }
    expect(parseStyleProfile({ ...good, dialogueRatio: 1.5 }).ok).toBe(false);
  });
  it("rejects a unit that does not match the language", () => {
    expect(parseStyleProfile({ ...good, lengthUnit: "char" }).ok).toBe(false);
    expect(parseStyleProfile({ ...good, language: "zh" }).ok).toBe(false);
  });
  it("rejects a missing metric", () => {
    const { avgWordLen: _drop, ...rest } = good;
    expect(parseStyleProfile(rest).ok).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(parseStyleProfile(null).ok).toBe(false);
    expect(parseStyleProfile([]).ok).toBe(false);
  });
});
