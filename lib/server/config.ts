/**
 * Server-only model configuration (requirements REQ-22, design §2.4, task T-05).
 * Values come only from the server environment. Nothing here is sent to the browser,
 * logged, put in a prompt, or included in an error message.
 */
import "server-only";

export type ModelConfig = {
  apiKey: string;
  baseUrl: string;
  standardModel: string;
  /** Model for the continuity agent. Falls back to the standard model. */
  premiumModel: string;
};

export type ConfigResult = { ok: true; config: ModelConfig } | { ok: false; code: "config-missing" };

type Env = Readonly<Record<string, string | undefined>>;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Normalises the base URL in one place: https or loopback http, no query, no credentials, no trailing slash. */
export function normaliseBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.toString().replace(/\/+$/, "");
}

export function loadModelConfig(env: Env = process.env): ConfigResult {
  const apiKey = clean(env.LLM_API_KEY);
  const baseUrl = normaliseBaseUrl(clean(env.LLM_BASE_URL));
  const standardModel = clean(env.LLM_MODEL);
  if (!apiKey || !baseUrl || !standardModel) return { ok: false, code: "config-missing" };
  const premiumModel = clean(env.LLM_MODEL_PREMIUM) || standardModel;
  return { ok: true, config: { apiKey, baseUrl, standardModel, premiumModel } };
}
