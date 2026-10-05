import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
import { costSummary } from "@/lib/usage";
import AdminTop from "../AdminTop";

export const dynamic = "force-dynamic";

const usd = (v: number | null) => (v === null ? "Not enough data yet" : `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`);

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  if (!(await isOwner())) redirect("/admin/login?next=/admin/costs");
  const m = (await searchParams).month;
  const s = await costSummary(m && /^\d{4}-\d{2}$/.test(m) ? m : undefined);
  return (
    <div className="wrap">
      <AdminTop />
        <h1>Costs, {s.month}</h1>
        <p className="a-sub">Estimates from model spend reported by each run and each Ask answer. Your Anthropic console is the source of truth for billing.</p>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Total: {usd(s.totalUsd)}</h2>
          <table className="a-table">
            <thead>
              <tr>
                <th>Lane</th>
                <th>Spend</th>
                <th>Runs or calls</th>
                <th>Proposals</th>
                <th>Published</th>
                <th>Candidates</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Ask (public)</td>
                <td>{usd(s.ask.usd)}</td>
                <td>{s.ask.calls}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
              </tr>
              {s.lanes.map((l) => (
                <tr key={l.lane}>
                  <td>{l.lane}</td>
                  <td>{usd(l.usd)}</td>
                  <td>{l.runs}</td>
                  <td>{l.proposals}</td>
                  <td>{l.published}</td>
                  <td>{l.candidates}</td>
                </tr>
              ))}
              {!s.lanes.length ? (
                <tr>
                  <td colSpan={6}>No agent runs recorded this month yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Cost per outcome</h2>
          <p className="meta">Each run's spend is split evenly across the candidates it worked on, then averaged per stage.</p>
          <table className="a-table">
            <tbody>
              <tr>
                <td>Per discovered candidate ({s.counts.discovered})</td>
                <td>{usd(s.unit.perDiscoveredCandidate)}</td>
              </tr>
              <tr>
                <td>Per qualified candidate ({s.counts.qualified})</td>
                <td>{usd(s.unit.perQualifiedCandidate)}</td>
              </tr>
              <tr>
                <td>Per published company ({s.counts.published})</td>
                <td>{usd(s.unit.perPublishedCompany)}</td>
              </tr>
              <tr>
                <td>Per verified update ({s.counts.verifiedUpdates})</td>
                <td>{usd(s.unit.perVerifiedUpdate)}</td>
              </tr>
            </tbody>
          </table>
        </section>
    </div>
  );
}
