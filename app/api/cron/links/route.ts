import { isCron, unauthorized } from "@/lib/auth";
import { runLinkHealth } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCron(req)) return unauthorized();
  return Response.json(await runLinkHealth());
}
