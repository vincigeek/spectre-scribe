/**
 * Pure, deterministic style analysis (requirements REQ-04, REQ-05, REQ-24 to REQ-26;
 * design §2.2 and §2.11). No network, file, environment, or React access.
 */
import { isStopword, STOPWORDS_VERSION } from "./stopwords";
import type { StyleProfile } from "./style-profile";
import {
  analysisLanguage,
  countUnits,
  detectLanguage,
  LANGUAGE_LIMITS,
  type DetectedLanguage,
  type Language,
  splitParagraphs,
  splitSentences,
} from "./text-units";

export const ANALYSER_VERSION = `sa-1+${STOPWORDS_VERSION}`;

/** The subset of Intl.Segmenter the analyser uses; injectable for tests. */
export type WordSegmenter = {
  segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }>;
};

export type AnalyseOptions = {
  /** User override of the detected language (REQ-25). */
  language?: Language;
  /**
   * Chinese word segmenter. Omit to use `Intl.Segmenter("zh")` when available;
   * pass `null` to force the one-character-per-token fallback.
   */
  segmenter?: WordSegmenter | null;
};

export type AnalyseError = {
  code: "empty-sample" | "sample-too-short";
  language: Language;
  detectedLanguage: DetectedLanguage;
  units: number;
  minimum: number;
};

export type AnalyseResult = { ok: true; profile: StyleProfile } | { ok: false; error: AnalyseError };

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation; 0 for an empty or single-value list. */
function populationSD(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length);
}

function per100(count: number, units: number): number {
  return units === 0 ? 0 : (count / units) * 100;
}

function countRuns(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

const EM_DASH_RUN = /[—―]+/gu;
const ELLIPSIS_RUN = /(?:…|\.{3,})+/gu;

const DOUBLE_PAIRS: Readonly<Record<string, string>> = { "“": "”" };
const ZH_PAIRS: Readonly<Record<string, string>> = { "「": "」", "『": "』" };

/**
 * Length units inside paired dialogue delimiters (REQ-26c), for one paragraph.
 * Spans are closed pairs only; an opener left unmatched at the end of the
 * paragraph covers nothing. Single curly quotes are never delimiters on their own.
 */
function dialogueUnitsInParagraph(paragraph: string, language: Language): number {
  const pairs: Record<string, string> = { ...DOUBLE_PAIRS, ...(language === "zh" ? ZH_PAIRS : {}) };
  const chars = [...paragraph];
  const covered = new Array<boolean>(chars.length).fill(false);
  const stack: Array<{ closer: string; start: number }> = [];

  chars.forEach((ch, i) => {
    const top = stack[stack.length - 1];
    if (top && ch === top.closer) {
      stack.pop();
      for (let j = top.start; j <= i; j += 1) covered[j] = true;
      return;
    }
    if (ch === '"') {
      stack.push({ closer: '"', start: i });
      return;
    }
    const closer = pairs[ch];
    if (closer) stack.push({ closer, start: i });
  });

  const inside = chars.map((ch, i) => (covered[i] ? ch : " ")).join("");
  return countUnits(inside, language);
}

function normaliseToken(token: string): string {
  return token.toLowerCase().replace(/['’-]/g, "");
}

const EN_TOKEN = /\p{L}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*/gu;
const ZH_FALLBACK_TOKEN = /\p{Script=Han}|[\p{Script=Latin}\p{Nd}]+/gu;

function defaultZhSegmenter(): WordSegmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
  return new Intl.Segmenter("zh", { granularity: "word" });
}

function tokenise(
  text: string,
  language: Language,
  segmenter: WordSegmenter | null,
): { tokens: string[]; segmentation: StyleProfile["segmentation"] } {
  if (language === "en") {
    return { tokens: (text.match(EN_TOKEN) ?? []).map(normaliseToken), segmentation: "none" };
  }
  if (segmenter) {
    const tokens: string[] = [];
    for (const s of segmenter.segment(text)) {
      if (s.isWordLike) tokens.push(normaliseToken(s.segment));
    }
    return { tokens, segmentation: "intl" };
  }
  return { tokens: (text.match(ZH_FALLBACK_TOKEN) ?? []).map(normaliseToken), segmentation: "char" };
}

function tokenLength(token: string, language: Language): number {
  return language === "zh" ? countUnits(token, "zh") : [...token].length;
}

/**
 * Computes the eight-metric style profile. Never throws for string input and never
 * returns NaN or Infinity. Input below the language minimum returns a typed error.
 */
export function analyseStyle(sampleText: string, options: AnalyseOptions = {}): AnalyseResult {
  const text = typeof sampleText === "string" ? sampleText : "";
  const detectedLanguage = detectLanguage(text);
  const language = options.language ?? analysisLanguage(detectedLanguage);
  const limits = LANGUAGE_LIMITS[language];
  const units = countUnits(text, language);

  if (units === 0) {
    return { ok: false, error: { code: "empty-sample", language, detectedLanguage, units, minimum: limits.minSample } };
  }
  if (units < limits.minSample) {
    return { ok: false, error: { code: "sample-too-short", language, detectedLanguage, units, minimum: limits.minSample } };
  }

  const paragraphs = splitParagraphs(text, language);
  const sentences = splitSentences(text, language);
  const sentenceLengths = sentences.map((s) => countUnits(s.text, language));
  const paragraphLengths = paragraphs.map((p) => countUnits(p, language));

  const dialogueUnits = paragraphs.reduce((acc, p) => acc + dialogueUnitsInParagraph(p, language), 0);

  const segmenter = options.segmenter === undefined ? (language === "zh" ? defaultZhSegmenter() : null) : options.segmenter;
  const { tokens, segmentation } = tokenise(text, language, segmenter);
  const contentTokens = tokens.filter((t) => !isStopword(t, language));

  const profile: StyleProfile = {
    language,
    detectedLanguage,
    lengthUnit: limits.lengthUnit,
    segmentation,
    analyserVersion: ANALYSER_VERSION,
    sentenceLenMean: mean(sentenceLengths),
    sentenceLenSD: populationSD(sentenceLengths),
    typeTokenRatio: tokens.length === 0 ? 0 : new Set(tokens).size / tokens.length,
    dialogueRatio: Math.min(1, dialogueUnits / units),
    pacingMarkers: {
      emDash: per100(countRuns(text, EM_DASH_RUN), units),
      ellipsis: per100(countRuns(text, ELLIPSIS_RUN), units),
      sentenceFinal: per100(sentences.filter((s) => s.endsWithMark).length, units),
    },
    paraLenMean: mean(paragraphLengths),
    paraLenSD: populationSD(paragraphLengths),
    avgWordLen: mean(contentTokens.map((t) => tokenLength(t, language))),
  };
  return { ok: true, profile };
}
