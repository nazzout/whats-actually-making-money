import { createHash } from "node:crypto";
import type { Company } from "./schema";

/** A short hash that changes whenever any company is added, removed or edited. */
export function datasetVersion(companies: Pick<Company, "id" | "updatedAt">[]) {
  const sig = companies
    .map((c) => `${c.id}:${c.updatedAt || ""}`)
    .sort()
    .join("|");
  return createHash("sha256").update(sig).digest("hex").slice(0, 16);
}
