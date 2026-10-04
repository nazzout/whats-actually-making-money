import { getCompany, listChangeLog } from "@/lib/data";
import { publicCompany } from "@/lib/public";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await getCompany(id);
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const history = await listChangeLog(id, 50);
  return Response.json({ company: { ...publicCompany(c), watch: c.watch || null }, history });
}
