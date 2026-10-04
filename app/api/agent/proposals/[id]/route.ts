import { isAgent, unauthorized } from "@/lib/auth";
import { getProposal } from "@/lib/proposals";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAgent(req)) return unauthorized();
  const { id } = await ctx.params;
  const p = await getProposal(id);
  return p ? Response.json({ proposal: p }) : Response.json({ error: "Not found" }, { status: 404 });
}
