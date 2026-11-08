/**
 * POST /api/style/analyse (requirements REQ-01 to REQ-05, REQ-25; task T-07).
 * Validates the sample and runs the pure analyser. It never calls a model,
 * fetches text, or stores the sample.
 */
import { MAX_ANALYSE_BODY_BYTES as MAX_BODY_BYTES } from "@/lib/request-limits";
import { analyseStyle } from "@/lib/style-analyser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorBody = { code: string; message: string; units?: number; minimum?: number; language?: string };

function error(status: number, body: ErrorBody): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return error(415, { code: "bad-request", message: "Send the sample as JSON." });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return error(413, { code: "bad-request", message: "The sample is too large." });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return error(413, { code: "bad-request", message: "The sample is too large." });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, { code: "bad-request", message: "The request is not valid JSON." });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return error(400, { code: "bad-request", message: "The request must be a JSON object." });
  }
  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record).filter((k) => k !== "sampleText" && k !== "language");
  if (unknown.length > 0) {
    return error(400, { code: "bad-request", message: "The request has unknown fields." });
  }
  if (typeof record.sampleText !== "string") {
    return error(400, { code: "bad-request", message: "sampleText must be a string." });
  }
  if (record.language !== undefined && record.language !== "en" && record.language !== "zh") {
    return error(400, { code: "bad-request", message: "language must be en or zh." });
  }

  const result = analyseStyle(record.sampleText, { language: record.language });
  if (!result.ok) {
    const { code, units, minimum, language } = result.error;
    const unit = language === "zh" ? "字" : "words";
    const message =
      code === "empty-sample"
        ? "The sample is empty."
        : `The sample has ${units} ${unit}. It needs at least ${minimum}.`;
    return error(422, { code, message, units, minimum, language });
  }

  const notice = result.profile.detectedLanguage === "other" && record.language === undefined
    ? "unsupported-language"
    : undefined;
  return Response.json(
    { profile: result.profile, ...(notice ? { notice } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
