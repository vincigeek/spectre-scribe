/**
 * OpenAI-compatible Chat Completions adapter (tech.md "Server model client", design
 * §2.4, task T-13). One place builds the endpoint, sends the key, applies caps and
 * deadlines, and maps provider failures to safe codes. No provider body, prompt, or
 * key ever leaves this module in an error.
 */
import "server-only";
import type { ModelConfig } from "./config";

export type Tier = "standard" | "premium";

export type ChatMessage = { role: "system" | "user"; content: string };

export type ChatRequest = {
  tier: Tier;
  messages: ChatMessage[];
  maxTokens: number;
  /** Strict JSON Schema output. Omit for plain prose. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  signal?: AbortSignal;
};

export type ChatFailureCode =
  | "provider-auth"
  | "provider-rate-limited"
  | "provider-unavailable"
  | "bad-request"
  | "model-refusal"
  | "schema-mismatch"
  | "interrupted";

export type ChatResult =
  | { ok: true; content: string; model: string; transportRetries: number }
  | { ok: false; code: ChatFailureCode; status?: number; transportRetries: number };

export type Dialect = {
  /** Token-limit field the provider accepts (recorded by the provider contract test). */
  tokenField: "max_completion_tokens" | "max_tokens";
  /** Sent only on premium calls, to keep the slow judge model fast. */
  premiumReasoningEffort?: "minimal" | "low";
};

export const DEFAULT_DIALECT: Dialect = { tokenField: "max_completion_tokens", premiumReasoningEffort: "low" };

export type ClientOptions = {
  fetchImpl?: typeof fetch;
  dialect?: Dialect;
  /** Per-call deadline in ms. */
  timeoutMs?: number;
  /** Longest Retry-After wait honoured, in ms. */
  maxRetryWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

function codeForStatus(status: number): ChatFailureCode {
  if (status === 401 || status === 403) return "provider-auth";
  if (status === 429) return "provider-rate-limited";
  if (TRANSIENT.has(status)) return "provider-unavailable";
  return "bad-request";
}

function retryAfterMs(header: string | null, cap: number): number {
  if (!header) return Math.min(1000, cap);
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(Math.max(0, secs * 1000), cap);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.min(Math.max(0, at - Date.now()), cap) : Math.min(1000, cap);
}

export function buildRequestBody(config: ModelConfig, req: ChatRequest, dialect: Dialect): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.tier === "premium" ? config.premiumModel : config.standardModel,
    messages: req.messages,
    [dialect.tokenField]: req.maxTokens,
    stream: false,
  };
  if (req.jsonSchema) {
    body.response_format = { type: "json_schema", json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema } };
  }
  // Premium model ignores sampling params; never send them (design §2.4).
  if (req.tier === "premium" && dialect.premiumReasoningEffort) body.reasoning_effort = dialect.premiumReasoningEffort;
  return body;
}

export function createModelClient(config: ModelConfig, opts: ClientOptions = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dialect = opts.dialect ?? DEFAULT_DIALECT;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const maxWait = opts.maxRetryWaitMs ?? 5_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const endpoint = `${config.baseUrl}/chat/completions`;

  async function once(req: ChatRequest): Promise<{ result: ChatResult; retryWait?: number }> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(buildRequestBody(config, req, dialect)),
        signal,
        cache: "no-store",
      });
    } catch {
      if (req.signal?.aborted) return { result: { ok: false, code: "interrupted", transportRetries: 0 } };
      return { result: { ok: false, code: "provider-unavailable", transportRetries: 0 }, retryWait: Math.min(1000, maxWait) };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      const code = codeForStatus(res.status);
      const retryWait = TRANSIENT.has(res.status) ? retryAfterMs(res.headers.get("retry-after"), maxWait) : undefined;
      return { result: { ok: false, code, status: res.status, transportRetries: 0 }, retryWait };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { result: { ok: false, code: "schema-mismatch", transportRetries: 0 } };
    }
    const choice = (json as { choices?: Array<{ message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }> })?.choices?.[0];
    if (!choice?.message) return { result: { ok: false, code: "schema-mismatch", transportRetries: 0 } };
    if (choice.message.refusal || choice.finish_reason === "content_filter") {
      return { result: { ok: false, code: "model-refusal", transportRetries: 0 } };
    }
    if (choice.finish_reason === "length") return { result: { ok: false, code: "schema-mismatch", transportRetries: 0 } };
    const content = choice.message.content;
    if (typeof content !== "string" || content.trim() === "") {
      return { result: { ok: false, code: "schema-mismatch", transportRetries: 0 } };
    }
    const model = typeof (json as { model?: unknown }).model === "string" ? (json as { model: string }).model : "";
    return { result: { ok: true, content, model, transportRetries: 0 } };
  }

  /** At most one transport retry, only for connection failures and 408/429/5xx. */
  async function chat(req: ChatRequest): Promise<ChatResult> {
    const first = await once(req);
    if (first.result.ok || first.retryWait === undefined || req.signal?.aborted) return first.result;
    await sleep(first.retryWait);
    if (req.signal?.aborted) return { ok: false, code: "interrupted", transportRetries: 1 };
    const second = await once(req);
    return { ...second.result, transportRetries: 1 };
  }

  return { chat, endpoint };
}

export type ModelClient = ReturnType<typeof createModelClient>;
