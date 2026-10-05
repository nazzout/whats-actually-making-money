import { listCompanies } from "@/lib/data";
import { datasetVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

// Open tabs poll this instead of downloading the whole dataset to see whether anything changed.
export async function GET() {
  const companies = await listCompanies();
  return Response.json({ version: datasetVersion(companies), count: companies.length }, { headers: { "cache-control": "no-store" } });
}
