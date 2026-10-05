import { isAgent, unauthorized } from "@/lib/auth";
import { CANDIDATE_STATUSES, listCandidates, proposeCandidate, type CandidateStatus } from "@/lib/candidates";
import { errorResponse } from "@/lib/public";

/** Propose a candidate. A duplicate by name or website is refused with 409 and the existing ids. */
export async function POST(req: Request) {
  if (!isAgent(req)) return unauthorized();
  try {
    const r = await proposeCandidate(await req.json());
    if (!r.created) return Response.json({ error: "Duplicate", duplicates: r.duplicates }, { status: 409 });
    return Response.json({ candidate: r.candidate }, { status: 201 });
  } catch (e) {
    return errorResponse(e, 400);
  }
}

export async function GET(req: Request) {
  if (!isAgent(req)) return unauthorized();
  const s = new URL(req.url).searchParams.get("status");
  const status = s && (CANDIDATE_STATUSES as readonly string[]).includes(s) ? (s as CandidateStatus) : undefined;
  return Response.json({ candidates: await listCandidates(status) });
}
