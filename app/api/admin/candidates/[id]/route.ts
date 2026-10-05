import { isOwner } from "@/lib/auth";
import { setCandidateStatus, type CandidateStatus } from "@/lib/candidates";

type Ctx = { params: Promise<{ id: string }> };
const ACTIONS: Record<string, CandidateStatus> = { reject: "rejected", watch_later: "watch_later", research: "research_needed" };

// Owner actions from /admin/candidates. Plain form posts, then back to the list.
export async function POST(req: Request, ctx: Ctx) {
  if (!(await isOwner())) return Response.redirect(new URL("/admin/login?next=/admin/candidates", req.url), 303);
  const form = await req.formData();
  const status = ACTIONS[String(form.get("action") || "")];
  if (status) {
    await setCandidateStatus((await ctx.params).id, status, "owner", String(form.get("note") || "")).catch(() => {});
  }
  return Response.redirect(new URL("/admin/candidates", req.url), 303);
}
