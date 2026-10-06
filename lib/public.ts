import { z } from "zod";
import { derive } from "./rubric";
import type { Company } from "./schema";

/** What the public sees: the stored record plus server-computed strength, signal and inclusion. */
export function publicCompany(c: Company) {
  // Internal fields: source watch pointers and discovery provenance.
  const { watch: _watch, discoveredFrom: _from, discoveredAt: _at, ...rest } = c;
  const d = derive(rest);
  // Only the date it was added is public (drives the "New" marker); where it came from stays internal.
  const addedAt = typeof _at === "string" ? _at.slice(0, 10) : undefined;
  return { ...rest, ...(addedAt ? { addedAt } : {}), strength: d.strength, signal: d.signal, included: d.included };
}

export function errorResponse(e: unknown, status = 400) {
  if (e instanceof z.ZodError) return Response.json({ error: z.prettifyError(e), code: "invalid" }, { status });
  const msg = e instanceof Error ? e.message : "Something went wrong.";
  return Response.json({ error: msg }, { status: status === 400 ? 500 : status });
}
