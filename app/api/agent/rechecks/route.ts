import { isAgent, unauthorized } from "@/lib/auth";
import { dueRechecks } from "@/lib/rechecks";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAgent(req)) return unauthorized();
  return Response.json({ due: await dueRechecks() });
}
