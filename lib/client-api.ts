/**
 * Browser calls to the Route Handlers (REQ-17). The demo access code lives only in
 * sessionStorage and is sent as `X-Demo-Access` (design §2.13).
 */
import { createSseParser, parseSseData } from "./sse";

export const ACCESS_CODE_KEY = "spectre-scribe:access-code";

export function getAccessCode(): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(ACCESS_CODE_KEY) ?? "";
}
export function setAccessCode(code: string): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(ACCESS_CODE_KEY, code);
}

export type ApiError = { status: number; code: string; message: string; retryAfterSeconds?: number; issues?: string[] };

async function readError(res: Response): Promise<ApiError> {
  try {
    const j = (await res.json()) as Partial<ApiError>;
    return { status: res.status, code: String(j.code ?? "bad-request"), message: String(j.message ?? "The request failed."), retryAfterSeconds: j.retryAfterSeconds, issues: j.issues };
  } catch {
    return { status: res.status, code: "bad-request", message: "The request failed." };
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const code = getAccessCode();
  if (code) h["x-demo-access"] = code;
  return h;
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
  } catch {
    return { ok: false, error: { status: 0, code: "interrupted", message: "The network request failed." } };
  }
  if (!res.ok) return { ok: false, error: await readError(res) };
  return { ok: true, data: (await res.json()) as T };
}

/**
 * Starts a pipeline pass and feeds parsed events to `onEvent`. Resolves when the
 * stream ends. Malformed records are ignored, never turned into checkpoints.
 */
export async function streamPipeline(
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  let res: Response;
  try {
    res = await fetch("/api/pipeline/stream", { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
  } catch {
    return { ok: false, error: { status: 0, code: "interrupted", message: "The network request failed." } };
  }
  if (!res.ok || !res.body) return { ok: false, error: await readError(res) };
  const parser = createSseParser((r) => {
    const data = parseSseData(r);
    if (data !== undefined) onEvent(r.event, data);
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
  } catch {
    parser.end();
    return { ok: false, error: { status: 0, code: "interrupted", message: "The stream was interrupted." } };
  }
  parser.end();
  return { ok: true };
}
