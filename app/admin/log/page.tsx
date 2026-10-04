import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
import { listChangeLog } from "@/lib/data";
import AdminTop from "../AdminTop";

export const dynamic = "force-dynamic";

const show = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));

export default async function Log({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  if (!(await isOwner())) redirect("/admin/login?next=/admin/log");
  const { company } = await searchParams;
  const rows = await listChangeLog(company, 300);
  return (
    <div className="wrap">
      <AdminTop />
      <h1>Change log</h1>
      <p className="a-sub">Every published change, with who or what made it and why. {company ? <>Showing {company}. <a href="/admin/log">Show all</a></> : null}</p>
      {rows.length ? (
        <table className="diff">
          <thead><tr><th>When</th><th>Company</th><th>Field</th><th>Before</th><th>After</th><th>By and why</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString("en-US")}</td>
                <td><a href={`/admin/log?company=${r.companyId}`}>{r.companyId}</a></td>
                <td>{r.field}</td>
                <td><pre>{show(r.before)}</pre></td>
                <td><pre>{show(r.after)}</pre></td>
                <td>{r.actor}<div className="meta">{r.reason}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty">No changes yet.</p>}
    </div>
  );
}
