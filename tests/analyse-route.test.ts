import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/style/analyse/route";
import { MAX_ANALYSE_BODY_BYTES as MAX_BODY_BYTES } from "@/lib/request-limits";
import { sentence, zhSentence } from "./fixtures";

const en200 = Array.from({ length: 20 }, (_, i) => sentence(10, i * 10)).join(" ");
const zh400 = Array.from({ length: 20 }, (_, i) => zhSentence(20, i)).join("");

function post(body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) {
  return POST(
    new Request("http://localhost/api/style/analyse", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/style/analyse (T-07)", () => {
  it("returns a profile for a valid English sample", async () => {
    const res = await post({ sampleText: en200 });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json.profile).toMatchObject({ language: "en", lengthUnit: "word" });
    expect(json.notice).toBeUndefined();
  });

  it("returns a profile for a valid Chinese sample", async () => {
    const json = await (await post({ sampleText: zh400 })).json();
    expect(json.profile).toMatchObject({ language: "zh", lengthUnit: "char" });
  });

  it("rejects a short sample with the count and minimum", async () => {
    const res = await post({ sampleText: sentence(50) });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      code: "sample-too-short",
      message: "The sample has 50 words. It needs at least 200.",
      units: 50,
      minimum: 200,
      language: "en",
    });
  });

  it("reports the Chinese minimum in 字", async () => {
    const json = await (await post({ sampleText: zhSentence(100) })).json();
    expect(json).toMatchObject({ code: "sample-too-short", minimum: 400, message: "The sample has 100 字. It needs at least 400." });
  });

  it("rejects an empty sample", async () => {
    const res = await post({ sampleText: "" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("empty-sample");
  });

  it("honours a language override", async () => {
    const res = await post({ sampleText: en200, language: "zh" });
    expect(res.status).toBe(422); // 200 Latin runs are 200 字 < 400
  });

  it("adds a notice for an unsupported language", async () => {
    const cyr = Array.from({ length: 25 }, () => "абв где жзи клм ноп рст уфх цчш щыэ юяа.").join(" ");
    const json = await (await post({ sampleText: cyr })).json();
    expect(json.notice).toBe("unsupported-language");
    expect(json.profile.detectedLanguage).toBe("other");
  });

  it.each([
    [{ sampleText: 5 }, 400],
    [{ sampleText: en200, extra: true }, 400],
    [{ sampleText: en200, language: "fr" }, 400],
    [[en200], 400],
    ["{not json", 400],
  ])("rejects bad input %#", async (body, status) => {
    const res = await post(body);
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe("bad-request");
  });

  it("rejects a non-JSON content type", async () => {
    const res = await post({ sampleText: en200 }, { "content-type": "text/plain" });
    expect(res.status).toBe(415);
  });

  it("rejects an oversized body", async () => {
    const res = await post({ sampleText: "a ".repeat(MAX_BODY_BYTES) });
    expect(res.status).toBe(413);
  });

  it("does not call fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await post({ sampleText: en200 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not echo the sample in an error", async () => {
    const marker = "qmarkerqq";
    const text = await (await post({ sampleText: `${marker} ${sentence(20)}` })).text();
    expect(text).not.toContain(marker);
  });
});
