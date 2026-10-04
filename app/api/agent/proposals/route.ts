import { after } from "next/server";
import { isAgent, unauthorized } from "@/lib/auth";
import { finishProposal, listProposals, submitProposal, type Status } from "@/lib/proposals";
import { errorResponse } from "@/lib/public";

export const maxDuration = 60;

/** Submit a proposal. Fast checks run now; link and figure checks run right after the response. */
export async function POST(req: Request) {
  if (!isAgent(req)) return unauthorized();
  try {
    const p = await submitProposal(await req.json());
    after(() => finishProposal(p.id));
    return Response.json(
      {
        id: p.id,
        status: p.status,
        companyId: p.companyId,
        checks: p.checks,
        scoreBefore: p.scoreBefore,
        scoreAfter: p.scoreAfter,
        statusUrl: `/api/agent/proposals/${p.id}`,
      },
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e, 400);
  }
}

export async function GET(req: Request) {
  if (!isAgent(req)) return unauthorized();
  const status = new URL(req.url).searchParams.get("status") as Status | null;
  return Response.json({ proposals: await listProposals(status || undefined, 100) });
}
