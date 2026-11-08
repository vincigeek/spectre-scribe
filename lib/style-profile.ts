/**
 * The style profile shape shared by browser and server (requirements REQ-04,
 * design §2.2 and §2.11), plus its trust-boundary parser.
 */
import type { DetectedLanguage, Language, LengthUnit } from "./text-units";

export type PacingMarkers = {
  /** Em-dash runs per 100 length units. */
  emDash: number;
  /** Ellipsis runs per 100 length units. */
  ellipsis: number;
  /** Sentence-final boundary-mark runs per 100 length units. */
  sentenceFinal: number;
};

export type StyleProfile = {
  // Metadata (design §2.11).
  language: Language;
  detectedLanguage: DetectedLanguage;
  lengthUnit: LengthUnit;
  /** `none` for English (regex tokens); `intl` or `char` for Chinese. */
  segmentation: "intl" | "char" | "none";
  analyserVersion: string;
  // The eight metrics (REQ-04).
  sentenceLenMean: number;
  sentenceLenSD: number;
  typeTokenRatio: number;
  dialogueRatio: number;
  pacingMarkers: PacingMarkers;
  paraLenMean: number;
  paraLenSD: number;
  avgWordLen: number;
};

export const METRIC_KEYS = [
  "sentenceLenMean",
  "sentenceLenSD",
  "typeTokenRatio",
  "dialogueRatio",
  "pacingMarkers",
  "paraLenMean",
  "paraLenSD",
  "avgWordLen",
] as const;

const NUMBER_KEYS = METRIC_KEYS.filter((k) => k !== "pacingMarkers");
const PACING_KEYS = ["emDash", "ellipsis", "sentenceFinal"] as const;
const META_KEYS = ["language", "detectedLanguage", "lengthUnit", "segmentation", "analyserVersion"] as const;
const ALL_KEYS = new Set<string>([...META_KEYS, ...METRIC_KEYS]);

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** Validates an untrusted value as a StyleProfile. Unknown fields are rejected. */
export function parseStyleProfile(input: unknown): ParseResult<StyleProfile> {
  const issues: string[] = [];
  if (!isRecord(input)) return { ok: false, issues: ["styleProfile: must be an object"] };

  for (const key of Object.keys(input)) {
    if (!ALL_KEYS.has(key)) issues.push(`styleProfile.${key}: unknown field`);
  }
  if (input.language !== "en" && input.language !== "zh") issues.push("styleProfile.language: must be en or zh");
  if (!["en", "zh", "other"].includes(input.detectedLanguage as string)) {
    issues.push("styleProfile.detectedLanguage: must be en, zh, or other");
  }
  const expectedUnit = input.language === "zh" ? "char" : "word";
  if (input.lengthUnit !== expectedUnit) issues.push(`styleProfile.lengthUnit: must be ${expectedUnit}`);
  const expectedSeg = input.language === "zh" ? ["intl", "char"] : ["none"];
  if (!expectedSeg.includes(input.segmentation as string)) {
    issues.push(`styleProfile.segmentation: must be ${expectedSeg.join(" or ")}`);
  }
  if (typeof input.analyserVersion !== "string" || input.analyserVersion.length === 0 || input.analyserVersion.length > 64) {
    issues.push("styleProfile.analyserVersion: must be a short non-empty string");
  }
  for (const key of NUMBER_KEYS) {
    if (!isFiniteNonNegative(input[key])) issues.push(`styleProfile.${key}: must be a finite number >= 0`);
  }
  for (const key of ["typeTokenRatio", "dialogueRatio"] as const) {
    if (isFiniteNonNegative(input[key]) && (input[key] as number) > 1) {
      issues.push(`styleProfile.${key}: must be at most 1`);
    }
  }
  const pacing = input.pacingMarkers;
  if (!isRecord(pacing)) {
    issues.push("styleProfile.pacingMarkers: must be an object");
  } else {
    for (const key of Object.keys(pacing)) {
      if (!(PACING_KEYS as readonly string[]).includes(key)) issues.push(`styleProfile.pacingMarkers.${key}: unknown field`);
    }
    for (const key of PACING_KEYS) {
      if (!isFiniteNonNegative(pacing[key])) issues.push(`styleProfile.pacingMarkers.${key}: must be a finite number >= 0`);
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: structuredClone(input) as StyleProfile };
}
