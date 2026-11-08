/** POST /api/bible/draft (T-11a). Logic lives in lib/server/bible-draft.ts. */
import { handleBibleDraftRequest } from "@/lib/server/bible-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleBibleDraftRequest(request);
}
