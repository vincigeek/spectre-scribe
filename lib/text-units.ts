/**
 * Shared, pure text rules for English and Chinese (requirements REQ-24 to REQ-26,
 * design §2.11). Imported by the analyser, the bible validator, the Route Handlers,
 * the orchestrator, and the browser counter, so every count agrees.
 *
 * This module never calls `Intl.Segmenter`: length units depend only on scripts.
 */

export type Language = "en" | "zh";
export type DetectedLanguage = Language | "other";
export type LengthUnit = "word" | "char";

export type LanguageLimits = {
  lengthUnit: LengthUnit;
  /** Label shown to users next to a count. */
  unitLabel: string;
  minSample: number;
  loglineMax: number;
  styleAnchorMax: number;
  /** Soft generation target; the server enforces only `chapterMax`. */
  chapterTarget: number;
  /** Minimum draft length (0..chapterMax); the server rejects below it. */
  chapterMin: number;
  /** Minimum dialogue share of a generated draft (0..1); the server rejects below it. */
  dialogueMin: number;
  chapterMax: number;
};

export const LANGUAGE_LIMITS: Readonly<Record<Language, Readonly<LanguageLimits>>> = Object.freeze({
  en: Object.freeze({
    lengthUnit: "word",
    unitLabel: "words",
    minSample: 200,
    loglineMax: 15,
    styleAnchorMax: 400,
    chapterTarget: 640,
    chapterMin: 640,
    dialogueMin: 0.25,
    chapterMax: 800,
  }),
  zh: Object.freeze({
    lengthUnit: "char",
    unitLabel: "字",
    minSample: 400,
    loglineMax: 30,
    styleAnchorMax: 700,
    chapterTarget: 1200,
    chapterMin: 1200,
    dialogueMin: 0.25,
    chapterMax: 1500,
  }),
});

/** Kana, hangul, and Thai share of letters that makes a sample "other" (REQ-25 step 1). */
export const OTHER_SCRIPT_THRESHOLD = 0.05;
/** Han share of Han + Latin word runs that makes a sample `zh` (REQ-25 step 3). */
export const ZH_THRESHOLD = 0.5;

const LETTER = /\p{L}/gu;
const OTHER_SCRIPT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/gu;
const HAN = /\p{Script=Han}/gu;
const LATIN_RUN = /\p{Script=Latin}+/gu;

/** English length unit: a letter run (inner apostrophes or hyphens kept) or a digit run. */
const EN_UNIT = /\p{L}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*|\p{Nd}+/gu;
/** Chinese length unit: one Han character, or one run of Latin letters or digits. */
const ZH_UNIT = /\p{Script=Han}|[\p{Script=Latin}\p{Nd}]+/gu;

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let n = 0;
  while (pattern.exec(text) !== null) n += 1;
  return n;
}

/** Local, deterministic language detection (REQ-25). */
export function detectLanguage(text: string): DetectedLanguage {
  const letters = countMatches(text, LETTER);
  if (letters > 0 && countMatches(text, OTHER_SCRIPT) / letters >= OTHER_SCRIPT_THRESHOLD) {
    return "other";
  }
  const han = countMatches(text, HAN);
  const latinRuns = countMatches(text, LATIN_RUN);
  if (han + latinRuns === 0) return "other";
  return han / (han + latinRuns) >= ZH_THRESHOLD ? "zh" : "en";
}

/** The rules a detected language is analysed with: "other" uses the English rules. */
export function analysisLanguage(detected: DetectedLanguage): Language {
  return detected === "zh" ? "zh" : "en";
}

/** Length in the language's unit: words for `en`, 字 for `zh` (REQ-24). */
export function countUnits(text: string, language: Language): number {
  return countMatches(text, language === "zh" ? ZH_UNIT : EN_UNIT);
}

function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Paragraphs (REQ-26e): `en` splits on blank lines, `zh` on any line break.
 * Leading and trailing spaces, including U+3000, are ignored. Paragraphs with no
 * length units (for example a `***` separator) are dropped.
 */
export function splitParagraphs(text: string, language: Language): string[] {
  const separator = language === "zh" ? /\n+/ : /\n[ \t\u3000]*\n/;
  return normaliseNewlines(text)
    .split(separator)
    .map((p) => p.trim())
    .filter((p) => countUnits(p, language) > 0);
}

export type Sentence = {
  text: string;
  /** False only for a final fragment that has no boundary mark. */
  endsWithMark: boolean;
};

const BOUNDARY_RUN = /[.!?。！？]+/g;
const CLOSERS = /^["'”’」』）)\]】》〉]+/u;
const DIGIT = /\p{Nd}/u;

function isBoundaryRun(run: string, before: string, after: string): boolean {
  if (/^\.+$/.test(run)) {
    if (run.length >= 3) return false; // ASCII ellipsis "..." is not a boundary.
    if (run.length === 1 && DIGIT.test(before) && DIGIT.test(after)) return false; // 3.14
  }
  return true;
}

function splitParagraphSentences(paragraph: string, language: Language): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  BOUNDARY_RUN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOUNDARY_RUN.exec(paragraph)) !== null) {
    const runEnd = match.index + match[0].length;
    const before = paragraph[match.index - 1] ?? "";
    const after = paragraph[runEnd] ?? "";
    if (!isBoundaryRun(match[0], before, after)) continue;
    const closers = CLOSERS.exec(paragraph.slice(runEnd));
    const end = runEnd + (closers ? closers[0].length : 0);
    const text = paragraph.slice(start, end).trim();
    if (countUnits(text, language) > 0) sentences.push({ text, endsWithMark: true });
    start = end;
    BOUNDARY_RUN.lastIndex = end;
  }
  const rest = paragraph.slice(start).trim();
  if (countUnits(rest, language) > 0) sentences.push({ text: rest, endsWithMark: false });
  return sentences;
}

/**
 * Sentences (REQ-26a). Sentences never cross a paragraph break. A run of boundary
 * marks is one boundary; an ellipsis is not a boundary; a period between digits is
 * not a boundary; closing quotes or brackets after the mark stay in the sentence.
 * Sentences with no length units are dropped.
 */
export function splitSentences(text: string, language: Language): Sentence[] {
  return splitParagraphs(text, language).flatMap((p) => splitParagraphSentences(p, language));
}
