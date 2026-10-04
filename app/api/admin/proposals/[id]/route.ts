import { isOwner, unauthorized } from "@/lib/auth";
import { decide } from "@/lib/proposals";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return unauthorized();
  const { id } = await ctx.params;
  const form = await req.formData();
  const action = form.get("action") === "approve" ? "approve" : "reject";
  const notes = String(form.get("notes") || "");
  let msg = action === "approve" ? "Published." : "Rejected.";
  try {
    await decide(id, action, notes);
  } catch (e) {
    msg = e instanceof Error ? e.message : "Something went wrong.";
  }
  return new Response(null, { status: 303, headers: { location: `/admin/review?msg=${encodeURIComponent(msg)}#p-${id}` } });
}
