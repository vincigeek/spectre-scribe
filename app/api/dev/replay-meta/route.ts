/**
 * GET /api/dev/replay-meta: model names for replay metadata (design §2.14).
 * Development only; 404 in any other environment.
 */
import { loadModelConfig } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const c = loadModelConfig();
  const models = c.ok ? { standard: c.config.standardModel, premium: c.config.premiumModel } : { standard: "unknown", premium: "unknown" };
  return Response.json({ models }, { headers: { "Cache-Control": "no-store" } });
}
