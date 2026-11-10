import { describe, expect, it } from "vitest";
import {
  analysisLanguage,
  countUnits,
  detectLanguage,
  LANGUAGE_LIMITS,
  splitParagraphs,
  splitSentences,
} from "@/lib/text-units";
import { HAN, sentence, zhSentence } from "./fixtures";

describe("LANGUAGE_LIMITS", () => {
  it("matches the configured language limits", () => {
    expect(LANGUAGE_LIMITS.en).toMatchObject({ lengthUnit: "word", minSample: 200, loglineMax: 15, styleAnchorMax: 400, chapterTarget: 800, chapterMin: 640, dialogueMin: 0.25, chapterMax: 960 });
    expect(LANGUAGE_LIMITS.zh).toMatchObject({ lengthUnit: "char", minSample: 400, loglineMax: 30, styleAnchorMax: 700, chapterTarget: 1320, chapterMin: 1200, dialogueMin: 0.25, chapterMax: 1800 });
    expect(LANGUAGE_LIMITS.en.chapterTarget / LANGUAGE_LIMITS.en.chapterMax).toBe(800 / 960);
    expect(LANGUAGE_LIMITS.zh.chapterTarget / LANGUAGE_LIMITS.zh.chapterMax).toBe(1320 / 1800);
  });
  it("is frozen", () => {
    expect(Object.isFrozen(LANGUAGE_LIMITS.en)).toBe(true);
  });
});

describe("detectLanguage (REQ-25)", () => {
  it("detects English and Chinese", () => {
    expect(detectLanguage(sentence(20))).toBe("en");
    expect(detectLanguage(zhSentence(20))).toBe("zh");
  });
  it("treats Traditional Chinese as zh", () => {
    expect(detectLanguage("這個實驗會繼續進行。")).toBe("zh");
  });
  it("treats kanji-heavy Japanese with kana as other", () => {
    // 2 kana of 24 letters is about 8%, above the 5% threshold, though Han dominates.
    expect(detectLanguage(`${HAN}のを`)).toBe("other");
    // 1 kana of 23 letters is about 4%, below the threshold.
    expect(detectLanguage(`${HAN}の`)).toBe("zh");
  });
  it("treats hangul and Thai as other", () => {
    expect(detectLanguage("가나다라 마바사")).toBe("other");
    expect(detectLanguage("กขคง จฉช")).toBe("other");
  });
  it("treats a sample with no Han and no Latin runs as other (no 0/0)", () => {
    expect(detectLanguage("абв где жзи")).toBe("other");
    expect(detectLanguage("")).toBe("other");
    expect(detectLanguage("12345 !!!")).toBe("other");
  });
  it("uses a 50% Han threshold against Latin word runs", () => {
    const latin = (n: number) => Array.from({ length: n }, () => "ab").join(" ");
    expect(detectLanguage(`${HAN.slice(0, 10)} ${latin(10)}`)).toBe("zh"); // 10 / 20 = 50%
    expect(detectLanguage(`${HAN.slice(0, 9)} ${latin(10)}`)).toBe("en"); // 9 / 19 < 50%
  });
  it("maps other to the English rules", () => {
    expect(analysisLanguage("other")).toBe("en");
    expect(analysisLanguage("zh")).toBe("zh");
  });
});

describe("countUnits (REQ-24)", () => {
  it("counts English letter runs and digit runs", () => {
    expect(countUnits("don't stop-now 42 3.14", "en")).toBe(5);
    expect(countUnits("— ... !!! ,", "en")).toBe(0);
    expect(countUnits("naïve café", "en")).toBe(2);
  });
  it("counts each Han character and each Latin or digit run as 1 字", () => {
    expect(countUnits("甲乙用AI做了3次。", "zh")).toBe(8);
    expect(countUnits("，。！？「」……——", "zh")).toBe(0);
  });
  it("counts kana, hangul, Cyrillic, and emoji as 0 in zh", () => {
    expect(countUnits("かなカナ한글абв😀甲", "zh")).toBe(1);
  });
  it("works on text with no spaces", () => {
    expect(countUnits(HAN, "zh")).toBe(HAN.length);
  });
});

describe("splitParagraphs (REQ-26e)", () => {
  it("splits English on blank lines, including whitespace-only lines", () => {
    expect(splitParagraphs("qa qb.\nqc qd.\n\nqe.\n \t\nqf.", "en")).toEqual(["qa qb.\nqc qd.", "qe.", "qf."]);
  });
  it("collapses consecutive blank lines and handles CRLF", () => {
    expect(splitParagraphs("qa.\r\n\r\n\r\n\r\nqb.", "en")).toEqual(["qa.", "qb."]);
  });
  it("splits Chinese on any line break and ignores U+3000 indents", () => {
    expect(splitParagraphs("\u3000\u3000甲乙。\n丙丁。\n\n戊。", "zh")).toEqual(["甲乙。", "丙丁。", "戊。"]);
  });
  it("drops paragraphs without length units", () => {
    expect(splitParagraphs("qa.\n\n***\n\nqb.", "en")).toEqual(["qa.", "qb."]);
  });
  it("returns one paragraph for a single block", () => {
    expect(splitParagraphs("qa qb qc", "en")).toEqual(["qa qb qc"]);
  });
});

describe("splitSentences (REQ-26a)", () => {
  const texts = (t: string, l: "en" | "zh" = "en") => splitSentences(t, l).map((s) => s.text);

  it("splits on . ! ?", () => {
    expect(texts("Qa qb. Qc! Qd?")).toEqual(["Qa qb.", "Qc!", "Qd?"]);
  });
  it("treats a run of marks as one boundary", () => {
    expect(texts("Qa?! Qb!!! Qc..")).toEqual(["Qa?!", "Qb!!!", "Qc.."]);
    expect(texts("甲。。乙！？丙", "zh")).toEqual(["甲。。", "乙！？", "丙"]);
  });
  it("does not split on an ellipsis", () => {
    expect(texts("Qa... qb. Qc…qd.")).toEqual(["Qa... qb.", "Qc…qd."]);
  });
  it("does not split on a period between digits", () => {
    expect(texts("Qa is 3.14 now. Qb.")).toEqual(["Qa is 3.14 now.", "Qb."]);
  });
  it("keeps a closing quote or bracket in the sentence", () => {
    expect(texts('Qa said "qb." Qc.')).toEqual(['Qa said "qb."', "Qc."]);
    expect(texts("甲说：“乙。”丙。", "zh")).toEqual(["甲说：“乙。”", "丙。"]);
    expect(texts("甲说：「乙！」丙。", "zh")).toEqual(["甲说：「乙！」", "丙。"]);
  });
  it("counts a final fragment without a mark", () => {
    const s = splitSentences("Qa. Qb qc", "en");
    expect(s.map((x) => x.endsWithMark)).toEqual([true, false]);
  });
  it("never crosses a paragraph break", () => {
    expect(texts("Qa qb\n\nQc.")).toEqual(["Qa qb", "Qc."]);
  });
  it("splits Chinese full-width marks", () => {
    expect(texts("甲乙。丙！丁？", "zh")).toEqual(["甲乙。", "丙！", "丁？"]);
  });
});
