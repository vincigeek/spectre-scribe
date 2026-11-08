/** POST /api/pipeline/stream (T-16). Logic lives in lib/server/pipeline-handler.ts. */
import { handlePipelineRequest } from "@/lib/server/pipeline-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return handlePipelineRequest(request);
}
