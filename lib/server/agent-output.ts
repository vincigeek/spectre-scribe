/**
 * Deterministic checks on outline and style outputs (design §2.4, §2.5; T-15, T-20a).
 * The server never trusts the model's own counts.
 */
import "server-only";
import type { StoryBible } from "@/lib/story-bible";
import { countUnits, type Language } from "@/lib/text-units";
import { ARC_ROLES, type OutlineOutput, type StyleOutput } from "./prompts";

export const MAX_BEATS = 8;
type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Words that mark a bible-sanctioned exception for a dead character (Check A). */
export const DEAD_EXCEPTION = /flashback|memory|memories|remember|ghost|spirit|dream|vision|recording|echo|闪回|回忆|记忆|鬼|幽灵|亡魂|梦|录音|录像|幻象/i;

const DISASTER =
  /disaster|reversal|betray|collapse|fail|lose|loss|death|dies|trap|catastroph|灾|反转|背叛|崩|失败|失去|死|陷阱|危机|逆转/i;

export type Check<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/**
 * Validates a chapter-mode outline against the bible and the arc rules.
 * `openBefore` is the set of foreshadowing ids still open before this chapter.
 */
export function checkOutline(
  raw: unknown,
  chapterNumber: 1 | 2 | 3,
  bible: StoryBible,
  openBefore: ReadonlySet<string>,
  /** Characters dead before this chapter (ledger and earlier beat-sheet states). */
  deadBefore: ReadonlySet<string> = new Set(),
): Check<OutlineOutput> {
  const issues: string[] = [];
  if (!isRecord(raw)) return { ok: false, issues: ["outline must be an object"] };
  const role = ARC_ROLES[chapterNumber];
  if (raw.mode !== "chapter") issues.push("mode must be chapter");
  if (raw.chapterNumber !== chapterNumber) issues.push(`chapterNumber must be ${chapterNumber}`);
  if (raw.arcRole !== role) issues.push(`arcRole must be ${role}`);
  const beats = raw.beats;
  if (!Array.isArray(beats) || beats.length === 0) return { ok: false, issues: [...issues, "beats must be a non-empty list"] };
  if (beats.length > MAX_BEATS) issues.push(`at most ${MAX_BEATS} beats`);
  const charIds = new Set(bible.characters.map((c) => c.id));
  const fsIds = new Set(bible.foreshadowing.map((f) => f.id));
  const planted = new Set<string>();
  const paid = new Set<string>();
  beats.forEach((b, i) => {
    const p = `beats[${i}]`;
    if (!isRecord(b)) return issues.push(`${p} must be an object`);
    if (!nonEmpty(b.title) || !nonEmpty(b.premise)) issues.push(`${p} needs a title and premise`);
    if (!isStrList(b.characterIds) || !isStrList(b.foreshadowingPlanted) || !isStrList(b.foreshadowingPaidOff)) {
      return issues.push(`${p} id lists must be string lists`);
    }
    if (b.characterIds.length === 0) issues.push(`${p} must name a character`);
    for (const id of b.characterIds) if (!charIds.has(id)) issues.push(`${p} unknown character "${id}"`);
    for (const id of b.characterIds) {
      if (deadBefore.has(id) && !DEAD_EXCEPTION.test(`${b.title} ${b.premise}`)) {
        issues.push(`${p} character "${id}" is dead and cannot act without a flashback, memory, or ghost exception`);
      }
    }
    if (b.foreshadowingPlanted.length + b.foreshadowingPaidOff.length === 0) {
      issues.push(`${p} must plant or pay off foreshadowing`);
    }
    for (const id of [...b.foreshadowingPlanted, ...b.foreshadowingPaidOff]) {
      if (!fsIds.has(id)) issues.push(`${p} unknown foreshadowing "${id}"`);
    }
    b.foreshadowingPlanted.forEach((x) => planted.add(x));
    b.foreshadowingPaidOff.forEach((x) => paid.add(x));
  });
  if (chapterNumber === 1 && ![...planted].some((id) => !paid.has(id))) {
    issues.push("chapter 1 must leave at least one foreshadowing item open — make the last beat plant (not pay off) an item");
  }
  if (chapterNumber === 2 && !beats.some((b) => isRecord(b) && DISASTER.test(`${b.title} ${b.premise}`))) {
    issues.push("chapter 2 needs a disaster or reversal beat");
  }
  if (chapterNumber === 3) {
    const stillOpen = [...openBefore, ...planted].filter((id) => !paid.has(id));
    if (stillOpen.length > 0) issues.push(`chapter 3 must pay off: ${[...new Set(stillOpen)].join(", ")}`);
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: structuredClone(raw) as OutlineOutput };
}

export function checkStyle(raw: unknown, chapterNumber: number, language: Language, anchorMax: number): Check<StyleOutput> {
  const issues: string[] = [];
  if (!isRecord(raw)) return { ok: false, issues: ["style must be an object"] };
  if (raw.chapterNumber !== chapterNumber) issues.push(`chapterNumber must be ${chapterNumber}`);
  if (!nonEmpty(raw.anchor)) issues.push("anchor is required");
  else if (countUnits(raw.anchor, language) > anchorMax) issues.push(`anchor is over ${anchorMax} length units`);
  if (!isStrList(raw.notes)) issues.push("notes must be a string list");
  const t = raw.targets;
  if (!isRecord(t)) {
    issues.push("targets must be an object");
  } else {
    for (const k of [
      "sentenceLengthMean",
      "sentenceLengthStdDev",
      "vocabularyRichness",
      "dialogueRatio",
      "paragraphLengthMean",
      "paragraphLengthStdDev",
      "averageWordLength",
    ]) {
      if (typeof t[k] !== "number" || !Number.isFinite(t[k])) issues.push(`targets.${k} must be a number`);
    }
    const pm = t.pacingMarkersPer100Words;
    if (!isRecord(pm) || !["emDash", "ellipsis", "sentenceFinal"].every((k) => typeof pm[k] === "number")) {
      issues.push("targets.pacingMarkersPer100Words is invalid");
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: structuredClone(raw) as StyleOutput };
}
