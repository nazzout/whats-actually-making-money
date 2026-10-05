import { isAgent, unauthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/public";
import { recordRun } from "@/lib/usage";

/** Record one agent run's cost. Keyed by run id + attempt + lane, so a retried report never double-counts. */
export async function POST(req: Request) {
  if (!isAgent(req)) return unauthorized();
  try {
    const r = await recordRun(await req.json());
    return Response.json(
      { id: r.id, duplicate: r.duplicate, proposals: r.run.proposalIds.length, candidates: r.run.candidateIds.length },
      { status: r.duplicate ? 200 : 201 },
    );
  } catch (e) {
    return errorResponse(e, 400);
  }
}
