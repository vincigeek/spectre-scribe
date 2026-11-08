import { describe, expect, it } from "vitest";
import { AGENT_ORDER, ERROR_CODES, isErrorCode, parseContinuityOutput } from "@/lib/pipeline-types";

const failure = { checkId: "A", bibleField: "characters[0].status", violation: "Placeholder violation.", fix: "Placeholder fix." };

describe("pipeline types", () => {
  it("fixes the agent order", () => {
    expect(AGENT_ORDER).toEqual(["outline", "style", "continuation", "continuity"]);
  });
  it("lists every design error code", () => {
    for (const c of ["config-missing", "provider-auth", "provider-rate-limited", "provider-unavailable", "bad-request", "schema-mismatch", "model-refusal", "word-limit", "retry-exhausted", "interrupted", "access-required", "rate-limited", "live-unavailable"]) {
      expect(isErrorCode(c)).toBe(true);
    }
    expect(isErrorCode("toString")).toBe(false);
    expect(ERROR_CODES["retry-exhausted"].retryable).toBe(false);
  });
});

describe("parseContinuityOutput", () => {
  it("accepts APPROVED with no failures", () => {
    expect(parseContinuityOutput({ chapterNumber: 1, status: "APPROVED", failures: [] }, 1)).toEqual({ ok: true, value: { status: "APPROVED", failures: [] } });
  });
  it("accepts VETO with complete failures", () => {
    const r = parseContinuityOutput({ chapterNumber: 2, status: "VETO", failures: [failure] }, 2);
    expect(r.ok && r.value.failures[0]).toEqual(failure);
  });
  it.each([
    [{ chapterNumber: 1, status: "APPROVED", failures: [failure] }, "approved with failures"],
    [{ chapterNumber: 1, status: "VETO", failures: [] }, "veto without failures"],
    [{ chapterNumber: 1, status: "OK", failures: [] }, "bad status"],
    [{ chapterNumber: 2, status: "APPROVED", failures: [] }, "wrong chapter"],
    [{ chapterNumber: 1, status: "VETO", failures: [{ ...failure, fix: "" }] }, "missing fix"],
    [{ chapterNumber: 1, status: "VETO", failures: [{ ...failure, checkId: "Z" }] }, "bad check id"],
    ["APPROVED", "a string that looks like approval"],
  ] as Array<[unknown, string]>)("rejects %j (%s)", (input) => {
    expect(parseContinuityOutput(input, 1).ok).toBe(false);
  });
});
