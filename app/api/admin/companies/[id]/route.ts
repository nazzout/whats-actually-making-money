import { isOwner, unauthorized } from "@/lib/auth";
import { deleteCompany, getCompany, saveCompany } from "@/lib/data";
import { errorResponse, publicCompany } from "@/lib/public";

type Ctx = { params: Promise<{ id: string }> };

// Owner edits from the app. They skip the review queue (the owner is the reviewer) but are still validated and logged.
export async function PUT(req: Request, ctx: Ctx) {
  if (!(await isOwner())) return unauthorized();
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { reason, ...data } = body;
    const existing = await getCompany(id);
    // A null value means "clear this optional field" (JSON cannot send undefined).
    const merged: Record<string, unknown> = { ...(existing || {}), ...data, id };
    for (const [k, v] of Object.entries(merged)) if (v === null) delete merged[k];
    const { company } = await saveCompany(
      merged,
      { actor: "owner", reason: typeof reason === "string" && reason ? reason : existing ? "Edited in the app" : "Added in the app" },
    );
    return Response.json({ company: publicCompany(company) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await isOwner())) return unauthorized();
  const { id } = await ctx.params;
  try {
    const ok = await deleteCompany(id, { actor: "owner", reason: "Deleted in the app" });
    return ok ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return errorResponse(e, 500);
  }
}
