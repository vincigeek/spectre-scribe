import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultUiLang, DICTIONARIES, translate, type MessageKey } from "@/lib/i18n-messages";
import { ERROR_CODES } from "@/lib/pipeline-types";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("UI dictionaries (T-23a)", () => {
  it("have the same keys and the same placeholders in en and zh-CN", () => {
    const en = DICTIONARIES.en;
    const zh = DICTIONARIES["zh-CN"];
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en) as MessageKey[]) {
      expect(zh[k].trim(), k).not.toBe("");
      expect(placeholders(zh[k]), k).toEqual(placeholders(en[k]));
    }
  });
  it("cover every pipeline error code", () => {
    for (const code of Object.keys(ERROR_CODES)) expect(DICTIONARIES.en).toHaveProperty(`err.${code}`);
  });
  it("every t(\"key\") used in components exists", () => {
    const used = new Set<string>();
    for (const f of readdirSync("components")) {
      const src = readFileSync(`components/${f}`, "utf8");
      for (const m of src.matchAll(/\bt\("([\w.-]+)"/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(50);
    for (const k of used) expect(DICTIONARIES.en, k).toHaveProperty(k);
  });
  it("fills variables and keeps unknown placeholders", () => {
    expect(translate("en", "ws.write", { n: 2 })).toBe("Write chapter 2");
    expect(translate("zh-CN", "ws.write", { n: 2 })).toBe("写第 2 章");
    expect(translate("en", "ws.retriesLeft", { n: 1 })).toBe("1 of {max} retries left");
  });
  it("defaults from the browser language", () => {
    expect(defaultUiLang("zh-CN")).toBe("zh-CN");
    expect(defaultUiLang("zh-TW")).toBe("zh-CN");
    expect(defaultUiLang("en-US")).toBe("en");
    expect(defaultUiLang(undefined)).toBe("en");
  });
});
