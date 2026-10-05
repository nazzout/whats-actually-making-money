import { isAgent, unauthorized } from "@/lib/auth";
import { coverage } from "@/lib/coverage";

export const dynamic = "force-dynamic";

/** Industry coverage against target (primary), other dimensions as diagnostics, and tags in use. Read before discovery. */
export async function GET(req: Request) {
  if (!isAgent(req)) return unauthorized();
  return Response.json(await coverage());
}
