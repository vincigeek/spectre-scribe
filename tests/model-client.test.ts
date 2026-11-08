import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AGENT_FILES, clearAgentCache, isUsableDefinition, loadAgentDefinitions } from "@/lib/server/agent-loader";
import type { ModelConfig } from "@/lib/server/config";
import { buildRequestBody, createModelClient, DEFAULT_DIALECT } from "@/lib/server/model-client";

const config: ModelConfig = { apiKey: "sk-test-secret", baseUrl: "https://api.example.test/v1", standardModel: "std", premiumModel: "prem" };

const ok = (content: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "std", choices: [{ message: { content }, finish_reason: "stop", ...extra }] }), { status: 200 });

function client(responses: Array<Response | Error>, opts = {}) {
  const fetchImpl = vi.fn(async () => {
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    if (r instanceof Error) throw r;
    return r;
  });
  const sleep = vi.fn(async () => undefined);
  return { c: createModelClient(config, { fetchImpl: fetchImpl as unknown as typeof fetch, sleep, ...opts }), fetchImpl, sleep };
}

const req = { tier: "standard" as const, messages: [{ role: "user" as const, content: "hi" }], maxTokens: 600 };

describe("agent loader (T-13)", () => {
  it("loads the four real agent files from the repo", async () => {
    clearAgentCache();
    const r = await loadAgentDefinitions();
    expect(r.ok).toBe(true);
    if (r.ok) for (const a of Object.keys(AGENT_FILES)) expect(r.definitions[a as keyof typeof AGENT_FILES]).toContain("## Run parameters");
  });
  it("fails safely on a missing or stub file", async () => {
    clearAgentCache();
    const root = await mkdtemp(path.join(tmpdir(), "agents-"));
    await mkdir(path.join(root, ".kiro/agents"), { recursive: true });
    expect(await loadAgentDefinitions(root)).toEqual({ ok: false, code: "config-missing", agent: "outline" });
    for (const f of Object.values(AGENT_FILES)) await writeFile(path.join(root, f), "# Agent: stub\n");
    clearAgentCache();
    expect((await loadAgentDefinitions(root)).ok).toBe(false);
    expect(isUsableDefinition("short")).toBe(false);
  });
});

describe("request body", () => {
  it("uses the standard model, the token field, and strict JSON schema", () => {
    const b = buildRequestBody(config, { ...req, jsonSchema: { name: "x", schema: { type: "object" } } }, DEFAULT_DIALECT);
    expect(b).toMatchObject({ model: "std", max_completion_tokens: 600, response_format: { type: "json_schema", json_schema: { strict: true } } });
    expect(b).not.toHaveProperty("temperature");
  });
  it("routes premium calls without sampling params and with low reasoning effort", () => {
    const b = buildRequestBody(config, { ...req, tier: "premium" }, DEFAULT_DIALECT);
    expect(b).toMatchObject({ model: "prem", reasoning_effort: "low" });
    for (const k of ["temperature", "top_p", "top_k"]) expect(b).not.toHaveProperty(k);
  });
  it("supports the max_tokens dialect", () => {
    expect(buildRequestBody(config, req, { tokenField: "max_tokens" })).toMatchObject({ max_tokens: 600 });
  });
});

describe("model client", () => {
  it("returns content and sends the key only in the header", async () => {
    const { c, fetchImpl } = client([ok("hello")]);
    expect(await c.chat(req)).toEqual({ ok: true, content: "hello", model: "std", transportRetries: 0 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test-secret");
    expect(String(init.body)).not.toContain("sk-test-secret");
  });
  it("retries once on 503 and honours Retry-After", async () => {
    const { c, fetchImpl, sleep } = client([new Response("x", { status: 503, headers: { "retry-after": "2" } }), ok("ok")]);
    expect(await c.chat(req)).toMatchObject({ ok: true, transportRetries: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it("caps the Retry-After wait", async () => {
    const { c, sleep } = client([new Response("x", { status: 429, headers: { "retry-after": "999" } }), ok("ok")], { maxRetryWaitMs: 3000 });
    await c.chat(req);
    expect(sleep).toHaveBeenCalledWith(3000);
  });
  it("retries at most once", async () => {
    const { c, fetchImpl } = client([new Response("", { status: 502 }), new Response("", { status: 502 })]);
    expect(await c.chat(req)).toEqual({ ok: false, code: "provider-unavailable", status: 502, transportRetries: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("retries a connection failure", async () => {
    const { c } = client([new TypeError("fetch failed"), ok("ok")]);
    expect(await c.chat(req)).toMatchObject({ ok: true, transportRetries: 1 });
  });
  it.each([
    [401, "provider-auth"],
    [403, "provider-auth"],
    [400, "bad-request"],
  ])("does not retry %i", async (status, code) => {
    const { c, fetchImpl } = client([new Response("provider secret body", { status })]);
    const r = await c.chat(req);
    expect(r).toMatchObject({ ok: false, code, transportRetries: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r)).not.toContain("secret");
  });
  it("treats refusal, truncation, and empty content as failures", async () => {
    expect(await client([ok("x", { message: { content: null, refusal: "no" } })]).c.chat(req)).toMatchObject({ ok: false, code: "model-refusal" });
    expect(await client([ok("partial", { finish_reason: "length" })]).c.chat(req)).toMatchObject({ ok: false, code: "schema-mismatch" });
    expect(await client([ok("  ")]).c.chat(req)).toMatchObject({ ok: false, code: "schema-mismatch" });
    expect(await client([new Response("not json", { status: 200 })]).c.chat(req)).toMatchObject({ ok: false, code: "schema-mismatch" });
  });
  it("reports a client abort as interrupted and does not retry", async () => {
    const ac = new AbortController();
    ac.abort();
    const { c, fetchImpl } = client([new DOMException("aborted", "AbortError")]);
    expect(await c.chat({ ...req, signal: ac.signal })).toMatchObject({ ok: false, code: "interrupted" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
