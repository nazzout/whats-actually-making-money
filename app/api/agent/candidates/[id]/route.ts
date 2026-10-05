import { z } from "zod";
import { isAgent, unauthorized } from "@/lib/auth";
import { CANDIDATE_STATUSES, getCandidate, setCandidateStatus } from "@/lib/candidates";
import { errorResponse } from "@/lib/public";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  if (!isAgent(req)) return unauthorized();
  const c = await getCandidate((await ctx.params).id);
  return c ? Response.json({ candidate: c }) : Response.json({ error: "Not found" }, { status: 404 });
}

const Body = z.object({ status: z.enum(CANDIDATE_STATUSES), by: z.string().trim().min(1).max(80), note: z.string().trim().max(600).default("") });

/** Move a candidate through research. "proposed" and "published" are set by the system, not here. */
export async function PATCH(req: Request, ctx: Ctx) {
  if (!isAgent(req)) return unauthorized();
  try {
    const { status, by, note } = Body.parse(await req.json());
    return Response.json({ candidate: await setCandidateStatus((await ctx.params).id, status, by, note) });
  } catch (e) {
    return errorResponse(e, 400);
  }
}
