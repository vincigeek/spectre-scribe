import { describe, expect, it } from "vitest";
import { checkCore, checkStructure } from "@/lib/server/bible-draft";
import { BIBLE_CORE_SCHEMA, BIBLE_STRUCTURE_SCHEMA, createBibleStructureSchema } from "@/lib/server/prompts";
import { analyseStyle } from "@/lib/style-analyser";
import { sentence } from "./fixtures";

const profile = (() => { const r = analyseStyle(Array.from({ length: 21 }, (_, i) => sentence(10, i * 10)).join(" ")); if (!r.ok) throw new Error("x"); return r.profile; })();
const seed = { genre: "Genre placeholder", tone: "Tone placeholder", idea: "An idea placeholder." };
const char = (n: number, role = "supporting") => ({
  id: `char-${n}`, name: `Zq Name${n}`, role, status: "alive", description: "One sentence.",
  goal: "g", motivation: "m", conflict: "c", epiphany: "e",
});
const coreDraft = {
  mode: "plan", layer: "core",
  logline: "A placeholder wants a thing against a force.",
  synopsis: ["Setup.", "Disaster one.", "Midpoint.", "Disaster two.", "Resolution."],
  setting: { timePeriod: "Period", locations: ["Place"], worldRules: ["Rule."] },
  characters: [char(1, "protagonist"), char(2, "protagonist"), char(3)],
};
const states = { "char-1": "alive", "char-2": "alive", "char-3": "alive" };
const structureDraft = {
  mode: "plan", layer: "structure",
  foreshadowing: [{ id: "fs-1", description: "d", status: "open" }, { id: "fs-2", description: "d", status: "open" }],
  timeline: [1, 2, 3].map((n) => ({ chapterNumber: n, event: "e" })),
  beatSheet: [1, 2, 3].map((n) => ({ chapterNumber: n, title: `T${n}`, premise: "p", characterStates: { ...states } })),
};

describe("BIBLE_CORE_SCHEMA", () => {
  it("pins the plan-mode contract the server checks enforce", () => {
    expect(BIBLE_CORE_SCHEMA.additionalProperties).toBe(false);
    expect([...BIBLE_CORE_SCHEMA.required]).toEqual(["mode", "layer", "logline", "synopsis", "setting", "characters"]);
    expect(BIBLE_CORE_SCHEMA.properties.mode.enum).toEqual(["plan"]);
    expect(BIBLE_CORE_SCHEMA.properties.layer.enum).toEqual(["core"]);
    expect(BIBLE_CORE_SCHEMA.properties.synopsis.minItems).toBe(5);
    expect(BIBLE_CORE_SCHEMA.properties.synopsis.maxItems).toBe(5);
    expect(BIBLE_CORE_SCHEMA.properties.logline.minLength).toBe(1);
    expect(BIBLE_CORE_SCHEMA.properties.setting.properties.locations.minItems).toBe(1);
    const chars = BIBLE_CORE_SCHEMA.properties.characters;
    expect(chars.minItems).toBe(2);
    expect(chars.maxItems).toBe(4);
    expect([...chars.items.properties.role.enum]).toEqual(["protagonist", "antagonist", "supporting"]);
    expect([...chars.items.properties.status.enum]).toEqual(["alive"]);
    expect(chars.items.additionalProperties).toBe(false);
  });
  it("accepts a schema-shaped draft through checkCore", () => {
    expect(checkCore(coreDraft, seed, profile).ok).toBe(true);
  });
  it.each([
    [{ ...coreDraft, mode: "chapter" }, "wrong mode"],
    [{ ...coreDraft, layer: "structure" }, "wrong layer"],
    [{ ...coreDraft, mode: undefined }, "missing mode"],
  ] as Array<[Record<string, unknown>, string]>)("requires the plan/core envelope (%s)", (draft) => {
    expect(checkCore(draft, seed, profile).ok).toBe(false);
  });
});

describe("BIBLE_STRUCTURE_SCHEMA", () => {
  it("pins the structure contract the server checks enforce", () => {
    expect(BIBLE_STRUCTURE_SCHEMA.additionalProperties).toBe(false);
    expect([...BIBLE_STRUCTURE_SCHEMA.required]).toEqual(["mode", "layer", "foreshadowing", "timeline", "beatSheet"]);
    const fs = BIBLE_STRUCTURE_SCHEMA.properties.foreshadowing;
    expect(fs.minItems).toBe(2);
    expect(fs.maxItems).toBe(4);
    expect([...fs.items.properties.status.enum]).toEqual(["open"]);
    expect(fs.items.properties.id.pattern).toBe("^fs-[0-9]+$");
    const beats = BIBLE_STRUCTURE_SCHEMA.properties.beatSheet;
    expect(beats.minItems).toBe(3);
    expect(beats.maxItems).toBe(3);
    expect(BIBLE_STRUCTURE_SCHEMA.properties.timeline.minItems).toBe(3);
  });
  it("closes character-state keys around the accepted core ids", () => {
    const schema = createBibleStructureSchema(["char-1", "char-2", "char-3"]) as {
      properties: {
        beatSheet: { items: { properties: { characterStates: { additionalProperties: boolean; required: string[] } } } };
      };
    };
    const statesSchema = schema.properties.beatSheet.items.properties.characterStates;
    expect(statesSchema.additionalProperties).toBe(false);
    expect(statesSchema.required).toEqual(["char-1", "char-2", "char-3"]);
  });
  it("accepts a schema-shaped draft through checkStructure", () => {
    const c = checkCore(coreDraft, seed, profile);
    if (!c.ok) throw new Error(c.issues.join());
    expect(checkStructure(structureDraft, seed, c.value, profile).ok).toBe(true);
  });
  it.each([
    [{ ...structureDraft, mode: "chapter" }, "wrong mode"],
    [{ ...structureDraft, layer: "core" }, "wrong layer"],
    [{ ...structureDraft, layer: undefined }, "missing layer"],
  ] as Array<[Record<string, unknown>, string]>)("requires the plan/structure envelope (%s)", (draft) => {
    const c = checkCore(coreDraft, seed, profile);
    if (!c.ok) throw new Error(c.issues.join());
    expect(checkStructure(draft, seed, c.value, profile).ok).toBe(false);
  });
});
