import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseStyle, dialogueRatio, ANALYSER_VERSION, type WordSegmenter } from "@/lib/style-analyser";
import type { StyleProfile } from "@/lib/style-profile";
import { parseStyleProfile } from "@/lib/style-profile";
import { HAN, sentence, word, zhSentence } from "./fixtures";

function profileOf(text: string, opts?: Parameters<typeof analyseStyle>[1]): StyleProfile {
  const r = analyseStyle(text, opts);
  if (!r.ok) throw new Error(`expected a profile, got ${r.error.code}`);
  return r.profile;
}

function expectFinite(p: StyleProfile) {
  const nums = [
    p.sentenceLenMean, p.sentenceLenSD, p.typeTokenRatio, p.dialogueRatio,
    p.paraLenMean, p.paraLenSD, p.avgWordLen,
    p.pacingMarkers.emDash, p.pacingMarkers.ellipsis, p.pacingMarkers.sentenceFinal,
  ];
  for (const n of nums) expect(Number.isFinite(n)).toBe(true);
}

/** n words in sentences of `per` words, one paragraph. */
function enBlock(n: number, per = 10): string {
  const out: string[] = [];
  for (let i = 0; i < n; i += per) out.push(sentence(Math.min(per, n - i), i));
  return out.join(" ");
}

describe("validation boundaries", () => {
  it("rejects an empty sample", () => {
    const r = analyseStyle("   \n ");
    expect(r).toMatchObject({ ok: false, error: { code: "empty-sample", units: 0 } });
  });
  it("rejects 199 English words and accepts 200", () => {
    expect(analyseStyle(enBlock(199))).toMatchObject({ ok: false, error: { code: "sample-too-short", units: 199, minimum: 200, language: "en" } });
    expect(analyseStyle(enBlock(200)).ok).toBe(true);
    expect(analyseStyle(enBlock(201)).ok).toBe(true);
  });
  it("rejects 399 字 and accepts 400", () => {
    const make = (n: number) => {
      const full = Math.floor(n / 20);
      return Array.from({ length: full }, (_, i) => zhSentence(20, i)).join("") + (n % 20 ? zhSentence(n % 20) : "");
    };
    expect(analyseStyle(make(399))).toMatchObject({ ok: false, error: { code: "sample-too-short", units: 399, minimum: 400, language: "zh" } });
    expect(analyseStyle(make(400)).ok).toBe(true);
  });
  it("uses the overridden language's minimum", () => {
    // 300 Latin word runs are 300 字 under the zh rules, below the 400 字 minimum.
    expect(analyseStyle(enBlock(300), { language: "zh" })).toMatchObject({ ok: false, error: { minimum: 400 } });
  });
  it("never throws on non-string input", () => {
    expect(analyseStyle(undefined as unknown as string)).toMatchObject({ ok: false, error: { code: "empty-sample" } });
  });
});

describe("English metrics", () => {
  // Paragraph A: 10 sentences of 10 words. Paragraph B: 10 sentences of 30 words.
  const paraA = Array.from({ length: 10 }, (_, i) => sentence(10, i * 10, 100)).join(" ");
  const paraB = Array.from({ length: 10 }, (_, i) => sentence(30, i * 30, 100)).join(" ");
  const p = profileOf(`${paraA}\n\n${paraB}`);

  it("records metadata", () => {
    expect(p).toMatchObject({ language: "en", detectedLanguage: "en", lengthUnit: "word", segmentation: "none", analyserVersion: ANALYSER_VERSION });
  });
  it("computes sentence length mean and population SD", () => {
    expect(p.sentenceLenMean).toBe(20);
    expect(p.sentenceLenSD).toBe(10);
  });
  it("computes paragraph length mean and population SD", () => {
    expect(p.paraLenMean).toBe(200);
    expect(p.paraLenSD).toBe(100);
  });
  it("computes type-token ratio over normalised tokens", () => {
    expect(p.typeTokenRatio).toBeCloseTo(100 / 400, 10);
  });
  it("counts sentence-final marks per 100 words", () => {
    expect(p.pacingMarkers.sentenceFinal).toBeCloseTo((20 / 400) * 100, 10);
    expect(p.pacingMarkers.emDash).toBe(0);
    expect(p.pacingMarkers.ellipsis).toBe(0);
  });
  it("computes average word length", () => {
    expect(p.avgWordLen).toBe(4); // every fixture word has 4 letters
  });
  it("has zero dialogue", () => {
    expect(p.dialogueRatio).toBe(0);
  });
  it("passes its own trust-boundary parser", () => {
    expect(parseStyleProfile(p).ok).toBe(true);
  });
});

describe("tokens and stopwords", () => {
  it("excludes stopwords from average word length but not from type-token ratio", () => {
    const body = enBlock(200);
    const withStops = `${body} The the THE.`;
    const p = profileOf(withStops);
    expect(p.avgWordLen).toBe(4); // "the" excluded
    expect(p.typeTokenRatio).toBeCloseTo(201 / 203, 10); // 200 unique + "the" x3
  });
  it("lowercases and strips apostrophes and hyphens before comparing tokens", () => {
    const body = enBlock(200);
    const p = profileOf(`${body} Qzz-zz qzzzz QZZZZ.`);
    expect(p.typeTokenRatio).toBeCloseTo(201 / 203, 10);
  });
  it("handles zero variance", () => {
    const p = profileOf(enBlock(200, 10));
    expect(p.sentenceLenSD).toBe(0);
    expect(p.paraLenSD).toBe(0);
  });
  it("returns finite values for a sample with only stopwords and no punctuation", () => {
    const p = profileOf(Array.from({ length: 220 }, () => "the").join(" "));
    expectFinite(p);
    expect(p.avgWordLen).toBe(0);
    expect(p.pacingMarkers.sentenceFinal).toBe(0);
  });
});

describe("dialogue ratio (REQ-26c)", () => {
  const body = enBlock(200);

  it("counts words inside straight and curly double quotes", () => {
    const p = profileOf(`${body}\n\n"${word(1)} ${word(2)}" ${word(3)} “${word(4)} ${word(5)}” ${word(6)}.`);
    expect(p.dialogueRatio).toBeCloseTo(4 / 206, 10);
  });
  it("does not treat apostrophes or single quotes as delimiters", () => {
    const p = profileOf(`${body} it's ‘qbbb’ don't.`);
    expect(p.dialogueRatio).toBe(0);
  });
  it("ignores an unmatched opener past the end of its paragraph", () => {
    const p = profileOf(`"${word(1)} ${word(2)}\n\n${body}`);
    expect(p.dialogueRatio).toBe(0);
  });
  it("is 1 for an all-dialogue sample", () => {
    const quoted = Array.from({ length: 21 }, (_, i) => `"${sentence(10, i * 10)}"`).join(" ");
    expect(profileOf(quoted).dialogueRatio).toBe(1);
  });
  it("counts 「」 and 『』 only in Chinese", () => {
    const zhBody = Array.from({ length: 20 }, (_, i) => zhSentence(20, i)).join("");
    const zh = profileOf(`${zhBody}\n甲说：「乙丙『丁』。」戊。`);
    expect(zh.dialogueRatio).toBeCloseTo(3 / 406, 10);
    const en = profileOf(`${body} 「${word(1)} ${word(2)}」.`);
    expect(en.dialogueRatio).toBe(0);
  });
  it("counts dialogue that contains punctuation", () => {
    const p = profileOf(`${body}\n\n“${word(1)}! ${word(2)}?” ${word(3)}.`);
    expect(p.dialogueRatio).toBeCloseTo(2 / 203, 10);
  });
});

describe("dialogueRatio export (REQ-20 draft check)", () => {
  it("measures quoted words over all words in English", () => {
    expect(dialogueRatio(`"Hello world" said she.`, "en")).toBe(0.5);
    expect(dialogueRatio(`"Go."`, "en")).toBe(1);
    expect(dialogueRatio(`No dialogue here.`, "en")).toBe(0);
    expect(dialogueRatio(`"Unmatched opener`, "en")).toBe(0);
    expect(dialogueRatio(``, "en")).toBe(0);
  });
  it("matches the profile ratio for Chinese dialogue", () => {
    const zhBody = Array.from({ length: 20 }, (_, i) => zhSentence(20, i)).join("");
    const text = `${zhBody}\n甲说：「乙丙『丁』。」戊。`;
    expect(dialogueRatio(text, "zh")).toBe(profileOf(text).dialogueRatio);
    expect(dialogueRatio(text, "zh")).toBeGreaterThan(0);
  });
});

describe("pacing markers (REQ-26d)", () => {
  const body = enBlock(200);
  it("counts dash and ellipsis runs once", () => {
    const p = profileOf(`${body} qa — qb —— qc… qd …… qe... qf.`);
    const units = 206;
    expect(p.pacingMarkers.emDash).toBeCloseTo((2 / units) * 100, 10);
    expect(p.pacingMarkers.ellipsis).toBeCloseTo((3 / units) * 100, 10);
  });
  it("counts a run of sentence-final marks once", () => {
    const a = profileOf(`${body} Qa?!`);
    const b = profileOf(`${body} Qa?`);
    expect(a.pacingMarkers.sentenceFinal).toBe(b.pacingMarkers.sentenceFinal);
  });
});

describe("Chinese metrics", () => {
  const zhBody = Array.from({ length: 20 }, (_, i) => zhSentence(20, i)).join(""); // 400 字, 20 sentences

  it("uses 字 as the unit and detects zh", () => {
    const p = profileOf(zhBody);
    expect(p).toMatchObject({ language: "zh", detectedLanguage: "zh", lengthUnit: "char" });
    expect(p.sentenceLenMean).toBe(20);
    expect(p.sentenceLenSD).toBe(0);
    expect(p.pacingMarkers.sentenceFinal).toBeCloseTo(5, 10);
  });
  it("splits paragraphs on single line breaks", () => {
    const p = profileOf(`${zhSentence(100)}\n${zhSentence(300)}`);
    expect(p.paraLenMean).toBe(200);
    expect(p.paraLenSD).toBe(100);
  });
  it("counts Chinese dash and ellipsis runs", () => {
    const p = profileOf(`${zhBody}甲——乙……丙。`);
    expect(p.pacingMarkers.emDash).toBeCloseTo((1 / 403) * 100, 10);
    expect(p.pacingMarkers.ellipsis).toBeCloseTo((1 / 403) * 100, 10);
  });
  it("uses an injected segmenter for word metrics", () => {
    const fixed: WordSegmenter = {
      *segment(text: string) {
        for (const ch of text) yield { segment: ch === "甲" ? "甲甲" : ch, isWordLike: /\p{Script=Han}/u.test(ch) };
      },
    };
    const p = profileOf(zhBody, { segmenter: fixed });
    expect(p.segmentation).toBe("intl");
    expect(p.avgWordLen).toBeGreaterThan(1);
  });
  it("falls back to one character per token without a segmenter", () => {
    const p = profileOf(zhBody, { segmenter: null });
    expect(p.segmentation).toBe("char");
    expect(p.avgWordLen).toBe(1);
    expect(p.typeTokenRatio).toBeCloseTo(HAN.length / 400, 10);
  });
  it("uses Intl.Segmenter by default on this runtime", () => {
    const p = profileOf(zhBody);
    expect(p.segmentation).toBe("intl");
    expect(p.typeTokenRatio).toBeGreaterThan(0);
    expect(p.typeTokenRatio).toBeLessThanOrEqual(1);
  });
  it("excludes Chinese stopwords from average word length", () => {
    const withStops = `${zhBody}${"的".repeat(50)}。`;
    const p = profileOf(withStops, { segmenter: null });
    expect(p.avgWordLen).toBe(1);
  });
  it("counts Latin words inside Chinese text as 1 字", () => {
    const p = profileOf(`${zhBody}甲用AI乙。`);
    expect(p.sentenceLenMean).toBeCloseTo(404 / 21, 10);
  });
  it("returns finite values", () => {
    expectFinite(profileOf(zhBody));
  });
});

describe("other languages", () => {
  it("analyses with English rules and reports detectedLanguage other", () => {
    const cyr = Array.from({ length: 30 }, () => "абв где жзи клм ноп рст уфх цчш щыэ юяа.").join(" ");
    const p = profileOf(cyr);
    expect(p.language).toBe("en");
    expect(p.detectedLanguage).toBe("other");
  });
});

describe("purity (REQ-05)", () => {
  it("the analyser modules import no I/O, environment, or React", () => {
    for (const f of ["lib/style-analyser.ts", "lib/text-units.ts", "lib/stopwords.ts", "lib/style-profile.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/\bfetch\s*\(|process\.env|from\s+["'](?:node:)?(?:fs|http|https|net|child_process)["']|from\s+["']react["']/);
    }
  });
});
