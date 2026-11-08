/**
 * Story bible schema and validation shared by browser and server
 * (requirements REQ-06, REQ-07, REQ-12, REQ-24, REQ-27; design §2.3; task T-11).
 * No Node-only imports, no environment access.
 */
import { countUnits, LANGUAGE_LIMITS, type Language, splitSentences } from "./text-units";

export type CharacterStatus = "alive" | "dead" | "unknown";
export type CharacterRole = "protagonist" | "antagonist" | "supporting";
export type ForeshadowingStatus = "open" | "paidOff" | "deferred";
export type ChapterNumber = 1 | 2 | 3;

export type Character = {
  id: string;
  name: string;
  role: CharacterRole;
  status: CharacterStatus;
  description: string;
  goal: string;
  motivation: string;
  conflict: string;
  epiphany: string;
};

export type ForeshadowingEntry = {
  id: string;
  description: string;
  status: ForeshadowingStatus;
  deferredToChapter?: number;
};

export type TimelineEvent = { chapterNumber: number; event: string };

export type BeatSheetEntry = {
  chapterNumber: number;
  title: string;
  premise: string;
  characterStates: Record<string, CharacterStatus>;
};

export type StoryBible = {
  genre: string;
  tone: string;
  logline: string;
  synopsis: string;
  setting: { timePeriod: string; locations: string[]; worldRules: string[] };
  characters: Character[];
  foreshadowing: ForeshadowingEntry[];
  timeline: TimelineEvent[];
  beatSheet: BeatSheetEntry[];
};

export const CHAPTER_COUNT = 3;
const ROLES: readonly CharacterRole[] = ["protagonist", "antagonist", "supporting"];
const STATUSES: readonly CharacterStatus[] = ["alive", "dead", "unknown"];
const FS_STATUSES: readonly ForeshadowingStatus[] = ["open", "paidOff", "deferred"];
const MAX_TEXT = 4000;
const MAX_LIST = 50;

export type BibleIssue = { path: string; message: string };
export type BibleParseResult = { ok: true; value: StoryBible } | { ok: false; issues: BibleIssue[] };

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

class Collector {
  issues: BibleIssue[] = [];
  add(path: string, message: string) {
    this.issues.push({ path, message });
  }
  keys(obj: Rec, allowed: readonly string[], path: string) {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) this.add(path ? `${path}.${k}` : k, "unknown field");
  }
  text(obj: Rec, key: string, path: string): string {
    const v = obj[key];
    const p = path ? `${path}.${key}` : key;
    if (typeof v !== "string") {
      this.add(p, "must be a string");
      return "";
    }
    if (v.trim().length === 0) this.add(p, "is required");
    if (v.length > MAX_TEXT) this.add(p, `must be at most ${MAX_TEXT} characters`);
    return v;
  }
  list(obj: Rec, key: string, path: string): unknown[] {
    const v = obj[key];
    const p = path ? `${path}.${key}` : key;
    if (!Array.isArray(v)) {
      this.add(p, "must be a list");
      return [];
    }
    if (v.length > MAX_LIST) this.add(p, `must have at most ${MAX_LIST} entries`);
    return v;
  }
  chapter(v: unknown, path: string) {
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > CHAPTER_COUNT) {
      this.add(path, `must be a chapter number from 1 to ${CHAPTER_COUNT}`);
    }
  }
}

function nameParts(name: string): string[] {
  const parts = name
    .split(/[\s()（）·・,，]+/u)
    .map((p) => p.trim())
    .filter((p) => [...p].length >= 2);
  return [name.trim(), ...parts].filter(Boolean);
}

/**
 * Parses an untrusted value as a StoryBible and checks every drafting invariant
 * (T-11). `language` is the story language from the style profile; it selects the
 * length unit for the logline limit and the sentence counts.
 */
export function parseStoryBible(input: unknown, language: Language): BibleParseResult {
  const c = new Collector();
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", message: "must be an object" }] };

  c.keys(input, ["genre", "tone", "logline", "synopsis", "setting", "characters", "foreshadowing", "timeline", "beatSheet"], "");
  c.text(input, "genre", "");
  c.text(input, "tone", "");
  const logline = c.text(input, "logline", "");
  const synopsis = c.text(input, "synopsis", "");

  const limits = LANGUAGE_LIMITS[language];
  if (logline.trim()) {
    const units = countUnits(logline, language);
    if (units > limits.loglineMax) c.add("logline", `must be at most ${limits.loglineMax} ${limits.unitLabel} (has ${units})`);
    if (splitSentences(logline, language).length !== 1) c.add("logline", "must be one sentence");
  }
  if (synopsis.trim()) {
    const n = splitSentences(synopsis, language).length;
    if (n !== 5) c.add("synopsis", `must be exactly five sentences (has ${n})`);
  }

  // Setting
  if (!isRecord(input.setting)) {
    c.add("setting", "must be an object");
  } else {
    const s = input.setting;
    c.keys(s, ["timePeriod", "locations", "worldRules"], "setting");
    c.text(s, "timePeriod", "setting");
    const locations = c.list(s, "locations", "setting");
    if (locations.length === 0) c.add("setting.locations", "needs at least one location");
    locations.forEach((l, i) => {
      if (typeof l !== "string" || !l.trim()) c.add(`setting.locations[${i}]`, "must be a non-empty string");
    });
    const rules = c.list(s, "worldRules", "setting");
    rules.forEach((r, i) => {
      if (typeof r !== "string" || !r.trim()) c.add(`setting.worldRules[${i}]`, "must be a non-empty string");
      else if (/\n[ \t\u3000]*\n/.test(r.trim())) c.add(`setting.worldRules[${i}]`, "must be one paragraph");
    });
  }

  // Characters
  const characters = c.list(input, "characters", "");
  const ids = new Set<string>();
  const majorIds: string[] = [];
  const names: string[] = [];
  let protagonists = 0;
  characters.forEach((raw, i) => {
    const p = `characters[${i}]`;
    if (!isRecord(raw)) return c.add(p, "must be an object");
    c.keys(raw, ["id", "name", "role", "status", "description", "goal", "motivation", "conflict", "epiphany"], p);
    const id = c.text(raw, "id", p);
    if (id && ids.has(id)) c.add(`${p}.id`, `duplicate id "${id}"`);
    if (id) ids.add(id);
    names.push(c.text(raw, "name", p));
    if (!ROLES.includes(raw.role as CharacterRole)) c.add(`${p}.role`, "must be protagonist, antagonist, or supporting");
    if (raw.role === "protagonist") protagonists += 1;
    if ((raw.role === "protagonist" || raw.role === "antagonist") && id) majorIds.push(id);
    if (!STATUSES.includes(raw.status as CharacterStatus)) c.add(`${p}.status`, "must be alive, dead, or unknown");
    else if (raw.status !== "alive") c.add(`${p}.status`, "a new character starts alive");
    const description = c.text(raw, "description", p);
    if (description.trim() && splitSentences(description, language).length !== 1) {
      c.add(`${p}.description`, "must be one sentence");
    }
    for (const k of ["goal", "motivation", "conflict", "epiphany"]) c.text(raw, k, p);
  });
  if (characters.length === 0) c.add("characters", "needs at least one character");
  else if (protagonists === 0) c.add("characters", "needs at least one protagonist");

  // A logline contains no character names (REQ-06).
  if (logline.trim()) {
    const lower = logline.toLowerCase();
    for (const name of names) {
      const hit = nameParts(name).find((part) => lower.includes(part.toLowerCase()));
      if (hit) {
        c.add("logline", `must not contain a character name ("${hit}")`);
        break;
      }
    }
  }

  // Foreshadowing
  const fsIds = new Set<string>();
  c.list(input, "foreshadowing", "").forEach((raw, i) => {
    const p = `foreshadowing[${i}]`;
    if (!isRecord(raw)) return c.add(p, "must be an object");
    c.keys(raw, ["id", "description", "status", "deferredToChapter"], p);
    const id = c.text(raw, "id", p);
    if (id && fsIds.has(id)) c.add(`${p}.id`, `duplicate id "${id}"`);
    if (id) fsIds.add(id);
    c.text(raw, "description", p);
    if (!FS_STATUSES.includes(raw.status as ForeshadowingStatus)) c.add(`${p}.status`, "must be open, paidOff, or deferred");
    if (raw.status === "deferred") {
      if (raw.deferredToChapter === undefined) c.add(`${p}.deferredToChapter`, "is required when status is deferred");
      else c.chapter(raw.deferredToChapter, `${p}.deferredToChapter`);
    } else if (raw.deferredToChapter !== undefined) {
      c.add(`${p}.deferredToChapter`, "is only allowed when status is deferred");
    }
  });

  // Timeline
  c.list(input, "timeline", "").forEach((raw, i) => {
    const p = `timeline[${i}]`;
    if (!isRecord(raw)) return c.add(p, "must be an object");
    c.keys(raw, ["chapterNumber", "event"], p);
    c.chapter(raw.chapterNumber, `${p}.chapterNumber`);
    c.text(raw, "event", p);
  });

  // Beat sheet: exactly chapters 1..3, each major character's state in every entry,
  // and no return from death between adjacent entries.
  const beats = c.list(input, "beatSheet", "");
  const seen = new Map<number, Rec>();
  beats.forEach((raw, i) => {
    const p = `beatSheet[${i}]`;
    if (!isRecord(raw)) return c.add(p, "must be an object");
    c.keys(raw, ["chapterNumber", "title", "premise", "characterStates"], p);
    c.chapter(raw.chapterNumber, `${p}.chapterNumber`);
    if (Number.isInteger(raw.chapterNumber)) {
      if (seen.has(raw.chapterNumber as number)) c.add(`${p}.chapterNumber`, `duplicate chapter ${raw.chapterNumber}`);
      seen.set(raw.chapterNumber as number, raw);
    }
    c.text(raw, "title", p);
    c.text(raw, "premise", p);
    const states = raw.characterStates;
    if (!isRecord(states)) return c.add(`${p}.characterStates`, "must be an object");
    for (const [cid, st] of Object.entries(states)) {
      if (!ids.has(cid)) c.add(`${p}.characterStates.${cid}`, "unknown character id");
      if (!STATUSES.includes(st as CharacterStatus)) c.add(`${p}.characterStates.${cid}`, "must be alive, dead, or unknown");
    }
    for (const mid of majorIds) {
      if (!(mid in states)) c.add(`${p}.characterStates`, `missing state for major character "${mid}"`);
    }
  });
  if (beats.length !== CHAPTER_COUNT || seen.size !== CHAPTER_COUNT) {
    c.add("beatSheet", `must have exactly one entry for each of chapters 1 to ${CHAPTER_COUNT}`);
  }
  for (let ch = 2; ch <= CHAPTER_COUNT; ch += 1) {
    const prev = seen.get(ch - 1)?.characterStates;
    const cur = seen.get(ch)?.characterStates;
    if (!isRecord(prev) || !isRecord(cur)) continue;
    for (const [cid, st] of Object.entries(cur)) {
      if (prev[cid] === "dead" && st === "alive") {
        c.add(`beatSheet[chapter ${ch}].characterStates.${cid}`, `cannot be alive after dead in chapter ${ch - 1}`);
      }
    }
  }

  return c.issues.length > 0 ? { ok: false, issues: c.issues } : { ok: true, value: structuredClone(input) as StoryBible };
}
