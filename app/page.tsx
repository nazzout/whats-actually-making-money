import AppShell from "@/components/app/AppShell";
import { listCompanies } from "@/lib/data";
import { isOwner } from "@/lib/auth";
import { publicCompany } from "@/lib/public";
import { CLIENT_METHOD } from "@/lib/methodology";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [companies, owner] = await Promise.all([listCompanies(), isOwner()]);
  return (
    <AppShell
      initial={companies.map(publicCompany)}
      canWrite={owner}
      askEnabled={!!process.env.ANTHROPIC_API_KEY}
      brandfetchId={process.env.BRANDFETCH_CLIENT_ID || ""}
      method={CLIENT_METHOD}
    />
  );
}
