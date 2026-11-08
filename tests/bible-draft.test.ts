import { describe, expect, it } from "vitest";
import { checkCore, checkStructure, handleBibleDraftRequest, parseSeed, type BibleCore } from "@/lib/server/bible-draft";
import type { ChatRequest, ModelClient } from "@/lib/server/model-client";
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
const core = (() => { const c = checkCore(coreDraft, seed, profile); if (!c.ok) throw new Error(c.issues.join()); return c.value; })();

describe("seed", () => {
  it("accepts a valid seed and rejects a long idea or notes", () => {
    expect(parseSeed(seed, profile).ok).toBe(true);
    expect(parseSeed({ ...seed, idea: "One. Two. Three." }, profile).ok).toBe(false);
    expect(parseSeed({ ...seed, notes: "w ".repeat(601) }, profile).ok).toBe(false);
    expect(parseSeed({ ...seed, extra: 1 }, profile).ok).toBe(false);
  });
});

describe("checkCore (REQ-31)", () => {
  it("accepts a valid core layer and joins the synopsis", () => {
    expect(core.synopsis).toBe("Setup. Disaster one. Midpoint. Disaster two. Resolution.");
    expect(core.characters).toHaveLength(3); // several protagonists allowed (B1)
  });
  it.each([
    [{ logline: "Zq Name1 wants a thing." }, "name in logline"],
    [{ synopsis: ["One.", "Two."] }, "short synopsis"],
    [{ characters: [char(1, "protagonist")] }, "one character"],
    [{ characters: [char(1), char(2)] }, "no protagonist"],
    [{ characters: [{ ...char(1, "protagonist"), id: "hero" }, char(2)] }, "bad id"],
    [{ characters: [{ ...char(1, "protagonist"), status: "dead" }, char(2)] }, "not alive"],
    [{ beatSheet: [] }, "extra field"],
    [{ error: "cannot" }, "model error"],
  ] as Array<[Record<string, unknown>, string]>)("rejects %j (%s)", (o) => {
    expect(checkCore({ ...coreDraft, ...o }, seed, profile).ok).toBe(false);
  });
});

describe("checkStructure (REQ-31)", () => {
  it("accepts a valid structure layer", () => {
    expect(checkStructure(structureDraft, seed, core, profile).ok).toBe(true);
  });
  it.each([
    [{ logline: "changed" }, "changes core"],
    [{ foreshadowing: [structureDraft.foreshadowing[0]] }, "one item"],
    [{ foreshadowing: [{ id: "fs-1", description: "d", status: "paidOff" }, structureDraft.foreshadowing[1]] }, "not open"],
    [{ timeline: [{ chapterNumber: 1, event: "e" }] }, "missing chapters in timeline"],
    [{ beatSheet: structureDraft.beatSheet.slice(0, 2) }, "two beat entries"],
    [{ beatSheet: structureDraft.beatSheet.map((b) => ({ ...b, characterStates: { "char-1": "alive" } })) }, "missing states"],
  ] as Array<[Record<string, unknown>, string]>)("rejects %j (%s)", (o) => {
    expect(checkStructure({ ...structureDraft, ...o }, seed, core, profile).ok).toBe(false);
  });
});

function client(content: string) {
  const calls: ChatRequest[] = [];
  const c = { endpoint: "x", chat: async (r: ChatRequest) => { calls.push(r); return { ok: true as const, content, model: "m", transportRetries: 0 }; } } as unknown as ModelClient;
  return { c, calls };
}
const post = (b: unknown) => new Request("http://x/api/bible/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("POST /api/bible/draft (T-11a)", () => {
  it("drafts the core layer with one standard-model call", async () => {
    const { c, calls } = client(JSON.stringify(coreDraft));
    const res = await handleBibleDraftRequest(post({ layer: "core", seed, styleProfile: profile }), { getClient: () => c, getOutlineDefinition: async () => "DEF", gate: null });
    expect(res.status).toBe(200);
    expect((await res.json()).draft.logline).toBe(coreDraft.logline);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.tier).toBe("standard");
    expect(calls[0]!.jsonSchema?.name).toBe("bible_core");
    expect(calls[0]!.jsonSchema?.schema).toMatchObject({ required: ["mode", "layer", "logline", "synopsis", "setting", "characters"] });
    expect(calls[0]!.messages[1]!.content).toContain("mode: plan\nlayer: core");
  });
  it("drafts the structure layer from the accepted core", async () => {
    const { c, calls } = client(JSON.stringify(structureDraft));
    const res = await handleBibleDraftRequest(post({ layer: "structure", seed, styleProfile: profile, core }), { getClient: () => c, getOutlineDefinition: async () => "DEF", gate: null });
    expect(res.status).toBe(200);
    expect(calls[0]!.messages[1]!.content).toContain("APPROVED CORE LAYER");
    const schema = calls[0]!.jsonSchema?.schema as { properties: { beatSheet: { items: { properties: { characterStates: { additionalProperties: unknown; required: string[] } } } } } };
    expect(schema.properties.beatSheet.items.properties.characterStates.additionalProperties).toBe(false);
    expect(schema.properties.beatSheet.items.properties.characterStates.required).toEqual(["char-1", "char-2", "char-3"]);
  });
  it("returns schema-mismatch with issues for a bad draft", async () => {
    const { c } = client(JSON.stringify({ ...coreDraft, synopsis: ["One."] }));
    const res = await handleBibleDraftRequest(post({ layer: "core", seed, styleProfile: profile }), { getClient: () => c, getOutlineDefinition: async () => "DEF", gate: null });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "schema-mismatch" });
  });
  it("rejects a structure request without a valid core and makes no call", async () => {
    const { c, calls } = client("{}");
    const res = await handleBibleDraftRequest(post({ layer: "structure", seed, styleProfile: profile, core: { logline: "" } as unknown as BibleCore }), { getClient: () => c, getOutlineDefinition: async () => "DEF", gate: null });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("returns config-missing without a client", async () => {
    const res = await handleBibleDraftRequest(post({ layer: "core", seed, styleProfile: profile }), { getClient: () => null, getOutlineDefinition: async () => "DEF", gate: null });
    expect(res.status).toBe(503);
  });
});
