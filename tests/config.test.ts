import { describe, expect, it } from "vitest";
import { loadModelConfig, normaliseBaseUrl } from "@/lib/server/config";

const base = { LLM_API_KEY: "test-key", LLM_BASE_URL: "https://api.example.test/v1/", LLM_MODEL: "std-model" };

describe("loadModelConfig (T-05)", () => {
  it("loads the three required values and falls back for the premium model", () => {
    expect(loadModelConfig(base)).toEqual({
      ok: true,
      config: { apiKey: "test-key", baseUrl: "https://api.example.test/v1", standardModel: "std-model", premiumModel: "std-model" },
    });
  });
  it("uses LLM_MODEL_PREMIUM when set", () => {
    const r = loadModelConfig({ ...base, LLM_MODEL_PREMIUM: "premium-model" });
    expect(r.ok && r.config.premiumModel).toBe("premium-model");
  });
  it.each(["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"])("fails safely when %s is missing or blank", (key) => {
    expect(loadModelConfig({ ...base, [key]: undefined })).toEqual({ ok: false, code: "config-missing" });
    expect(loadModelConfig({ ...base, [key]: "  " })).toEqual({ ok: false, code: "config-missing" });
  });
  it("never puts the key in the failure result", () => {
    expect(JSON.stringify(loadModelConfig({ ...base, LLM_MODEL: "" }))).not.toContain("test-key");
  });
});

describe("normaliseBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normaliseBaseUrl("https://x.test/v1///")).toBe("https://x.test/v1");
  });
  it("allows http only for loopback", () => {
    expect(normaliseBaseUrl("http://127.0.0.1:8080/v1")).toBe("http://127.0.0.1:8080/v1");
    expect(normaliseBaseUrl("http://x.test/v1")).toBeNull();
  });
  it("rejects credentials, queries, fragments, and junk", () => {
    expect(normaliseBaseUrl("https://u:p@x.test/v1")).toBeNull();
    expect(normaliseBaseUrl("https://x.test/v1?key=1")).toBeNull();
    expect(normaliseBaseUrl("https://x.test/v1#a")).toBeNull();
    expect(normaliseBaseUrl("not a url")).toBeNull();
    expect(normaliseBaseUrl("ftp://x.test")).toBeNull();
  });
});
