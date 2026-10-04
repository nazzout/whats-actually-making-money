import { listCompanies } from "@/lib/data";
import { publicCompany } from "@/lib/public";

export const dynamic = "force-dynamic";

export async function GET() {
  const companies = (await listCompanies()).map(publicCompany);
  return Response.json(
    { count: companies.length, companies },
    { headers: { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300" } },
  );
}
