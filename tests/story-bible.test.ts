import { describe, expect, it } from "vitest";
import { parseStoryBible, type StoryBible } from "@/lib/story-bible";

/** Structural values only (testing.md): no plot, no real names. */
function validBible(): StoryBible {
  const ch = (id: string, role: "protagonist" | "antagonist" | "supporting") => ({
    id,
    name: `Zq ${id.toUpperCase()}`,
    role,
    status: "alive" as const,
    description: "Role summary placeholder.",
    goal: "Goal placeholder.",
    motivation: "Motivation placeholder.",
    conflict: "Conflict placeholder.",
    epiphany: "Epiphany placeholder.",
  });
  const states = { "char-1": "alive", "char-2": "alive" } as const;
  return {
    genre: "Genre placeholder",
    tone: "Tone placeholder",
    logline: "A placeholder wants a thing against a force at a stake.",
    synopsis: "Setup sentence. Disaster sentence. Midpoint sentence. Second disaster sentence. Resolution sentence.",
    setting: { timePeriod: "Period placeholder", locations: ["Place placeholder"], worldRules: ["Rule placeholder."] },
    characters: [ch("char-1", "protagonist"), ch("char-2", "antagonist"), ch("char-3", "supporting")],
    foreshadowing: [
      { id: "fs-1", description: "Item placeholder.", status: "open" },
      { id: "fs-2", description: "Item placeholder.", status: "open" },
    ],
    timeline: [
      { chapterNumber: 1, event: "Event placeholder." },
      { chapterNumber: 2, event: "Event placeholder." },
      { chapterNumber: 3, event: "Event placeholder." },
    ],
    beatSheet: [1, 2, 3].map((n) => ({ chapterNumber: n, title: `Title ${n}`, premise: "Premise placeholder.", characterStates: { ...states } })),
  };
}

function issuesOf(input: unknown, lang: "en" | "zh" = "en") {
  const r = parseStoryBible(input, lang);
  return r.ok ? [] : r.issues;
}
const paths = (input: unknown, lang: "en" | "zh" = "en") => issuesOf(input, lang).map((i) => i.path);

describe("parseStoryBible", () => {
  it("accepts a valid bible and returns a deep copy", () => {
    const b = validBible();
    const r = parseStoryBible(b, "en");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(b);
      r.value.characters[0]!.name = "changed";
      expect(b.characters[0]!.name).not.toBe("changed");
    }
  });

  it("allows several protagonists (PR #1 review B1)", () => {
    const b = validBible();
    b.characters.forEach((c) => (c.role = "protagonist"));
    b.beatSheet.forEach((e) => (e.characterStates["char-3"] = "alive"));
    expect(issuesOf(b)).toEqual([]);
  });

  it("requires at least one protagonist", () => {
    const b = validBible();
    b.characters[0]!.role = "supporting";
    expect(issuesOf(b)).toContainEqual({ path: "characters", message: "needs at least one protagonist" });
  });

  it("rejects unknown fields and wrong types", () => {
    expect(paths({ ...validBible(), extra: 1 })).toContain("extra");
    expect(paths({ ...validBible(), genre: 3 })).toContain("genre");
    expect(paths(null)).toEqual([""]);
  });

  it("requires non-empty text fields", () => {
    const b = validBible();
    b.tone = "  ";
    b.characters[1]!.goal = "";
    expect(paths(b)).toEqual(expect.arrayContaining(["tone", "characters[1].goal"]));
  });

  describe("logline", () => {
    it("enforces 15 words in English", () => {
      const b = validBible();
      b.logline = `${Array.from({ length: 16 }, () => "word").join(" ")}.`;
      expect(paths(b)).toContain("logline");
      b.logline = `${Array.from({ length: 15 }, () => "word").join(" ")}.`;
      expect(paths(b)).not.toContain("logline");
    });
    it("enforces 30 字 in Chinese", () => {
      const b = validBible();
      b.synopsis = "甲。乙。丙。丁。戊。";
      b.characters.forEach((c) => (c.description = "描述。"));
      b.logline = `${"甲".repeat(31)}。`;
      expect(paths(b, "zh")).toContain("logline");
      b.logline = `${"甲".repeat(30)}。`;
      expect(paths(b, "zh")).not.toContain("logline");
    });
    it("must be one sentence", () => {
      const b = validBible();
      b.logline = "One part. Two part.";
      expect(issuesOf(b)).toContainEqual({ path: "logline", message: "must be one sentence" });
    });
    it("must not contain a character name or name part", () => {
      const b = validBible();
      b.logline = "A placeholder zq meets a force.";
      expect(issuesOf(b).find((i) => i.path === "logline")?.message).toMatch(/character name/);
    });
  });

  it("requires exactly five synopsis sentences", () => {
    const b = validBible();
    b.synopsis = "One. Two. Three. Four.";
    expect(issuesOf(b)).toContainEqual({ path: "synopsis", message: "must be exactly five sentences (has 4)" });
  });

  it("requires one-sentence descriptions and one-paragraph world rules", () => {
    const b = validBible();
    b.characters[0]!.description = "First. Second.";
    b.setting.worldRules = ["Para one.\n\nPara two."];
    expect(paths(b)).toEqual(expect.arrayContaining(["characters[0].description", "setting.worldRules[0]"]));
  });

  it("requires new characters to start alive and rejects bad enums", () => {
    const b = validBible() as unknown as { characters: Array<Record<string, unknown>> };
    b.characters[0]!.status = "dead";
    b.characters[1]!.role = "villain";
    expect(paths(b)).toEqual(expect.arrayContaining(["characters[0].status", "characters[1].role"]));
  });

  it("rejects duplicate ids", () => {
    const b = validBible();
    b.characters[2]!.id = "char-1";
    b.foreshadowing[1]!.id = "fs-1";
    expect(paths(b)).toEqual(expect.arrayContaining(["characters[2].id", "foreshadowing[1].id"]));
  });

  describe("foreshadowing", () => {
    it("requires deferredToChapter for a deferred item", () => {
      const b = validBible();
      b.foreshadowing[0]!.status = "deferred";
      expect(paths(b)).toContain("foreshadowing[0].deferredToChapter");
    });
    it("accepts a valid deferred item", () => {
      const b = validBible();
      b.foreshadowing[0] = { ...b.foreshadowing[0]!, status: "deferred", deferredToChapter: 3 };
      expect(issuesOf(b)).toEqual([]);
    });
    it("rejects a deferred chapter outside 1 to 3, and deferredToChapter on an open item", () => {
      const b = validBible();
      b.foreshadowing[0] = { ...b.foreshadowing[0]!, status: "deferred", deferredToChapter: 4 };
      b.foreshadowing[1] = { ...b.foreshadowing[1]!, deferredToChapter: 2 };
      expect(paths(b)).toEqual(expect.arrayContaining(["foreshadowing[0].deferredToChapter", "foreshadowing[1].deferredToChapter"]));
    });
  });

  describe("beat sheet", () => {
    it("requires exactly chapters 1, 2, and 3", () => {
      const b = validBible();
      b.beatSheet = b.beatSheet.slice(0, 2);
      expect(paths(b)).toContain("beatSheet");
      const d = validBible();
      d.beatSheet[2]!.chapterNumber = 2;
      expect(paths(d)).toEqual(expect.arrayContaining(["beatSheet", "beatSheet[2].chapterNumber"]));
    });
    it("requires a state for every major character", () => {
      const b = validBible();
      delete b.beatSheet[1]!.characterStates["char-2"];
      expect(issuesOf(b)).toContainEqual({ path: "beatSheet[1].characterStates", message: 'missing state for major character "char-2"' });
    });
    it("rejects unknown character ids and bad states", () => {
      const b = validBible() as unknown as { beatSheet: Array<{ characterStates: Record<string, string> }> };
      b.beatSheet[0]!.characterStates["char-9"] = "alive";
      b.beatSheet[0]!.characterStates["char-1"] = "asleep";
      expect(paths(b)).toEqual(expect.arrayContaining(["beatSheet[0].characterStates.char-9", "beatSheet[0].characterStates.char-1"]));
    });
    it("rejects a return from death between adjacent chapters", () => {
      const b = validBible();
      b.beatSheet[0]!.characterStates["char-2"] = "dead";
      expect(paths(b)).toContain("beatSheet[chapter 2].characterStates.char-2");
    });
    it("allows dead to stay dead and unknown to change", () => {
      const b = validBible();
      b.beatSheet[0]!.characterStates["char-2"] = "unknown";
      b.beatSheet[1]!.characterStates["char-2"] = "dead";
      b.beatSheet[2]!.characterStates["char-2"] = "dead";
      expect(issuesOf(b)).toEqual([]);
    });
  });

  it("rejects timeline chapters outside 1 to 3", () => {
    const b = validBible();
    b.timeline[0]!.chapterNumber = 0;
    expect(paths(b)).toContain("timeline[0].chapterNumber");
  });
});
