import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
import { listProposals, type Proposal } from "@/lib/proposals";
import { getStore } from "@/lib/store";
import AdminTop from "../AdminTop";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  new_company: "New company",
  update: "Update",
  add_evidence: "New evidence",
  recheck_result: "Re-check result",
};
const STATUS_LABEL: Record<string, string> = {
  validating: "Checking sources",
  pending: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  auto_published: "Published automatically",
};

const show = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));
const sig = (s: Proposal["scoreAfter"] | null) => (!s ? "None" : s.included ? String(s.signal) : "Watchlist");

function ProposalCard({ p, open }: { p: Proposal; open: boolean }) {
  const b = p.scoreBefore;
  const a = p.scoreAfter;
  return (
    <article className="card" id={`p-${p.id}`}>
      <div className="card-h">
        <div>
          <h3>{p.companyId}</h3>
          <div className="meta">
            {KIND_LABEL[p.kind] || p.kind} · from {p.proposedBy} · {new Date(p.createdAt).toLocaleString("en-US")}
          </div>
        </div>
        <span className={`badge ${p.status}`}>{STATUS_LABEL[p.status] || p.status}</span>
      </div>
      <p style={{ margin: "12px 0 0" }}>{p.reason}</p>
      {p.sourceUrls?.length ? (
        <p className="meta">
          Sources:{" "}
          {p.sourceUrls.map((u, i) => (
            <span key={u}>
              {i ? ", " : ""}
              <a href={u} target="_blank" rel="noopener noreferrer">{u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a>
            </span>
          ))}
        </p>
      ) : null}
      <div className="scores">
        <div><span>Trust in the numbers</span><b className={b && b.confidence !== a.confidence ? "chg" : ""}>{b ? `${b.confidence} to ` : ""}{a.confidence}/5</b></div>
        <div><span>Business strength</span><b className={b && b.strength !== a.strength ? "chg" : ""}>{b ? `${b.strength} to ` : ""}{a.strength}/25</b></div>
        <div><span>Signal</span><b>{b ? `${sig(b)} to ` : ""}{sig(a)}</b></div>
      </div>
      {p.reviewReasons?.length ? (
        <>
          <p className="sec-h">Why it needs review</p>
          <ul className="list">{p.reviewReasons.map((r) => <li key={r}><span className="dot warn" />{r}</li>)}</ul>
        </>
      ) : null}
      <p className="sec-h">Checks</p>
      <ul className="list">
        {p.checks?.length ? p.checks.map((c, i) => <li key={i}><span className={`dot ${c.level}`} />{c.message}</li>) : <li><span className="dot pass" />No problems found.</li>}
        {p.status === "validating" ? <li><span className="dot" />Link and figure checks are still running. Refresh in a moment.</li> : null}
      </ul>
      <p className="sec-h">Changes</p>
      <table className="diff">
        <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
        <tbody>
          {p.diff?.map((d) => (
            <tr key={d.field}>
              <td>{d.field}</td>
              <td><pre>{show(d.before)}</pre></td>
              <td><pre>{show(d.after)}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
      {open ? (
        <form className="decide" method="post" action={`/api/admin/proposals/${p.id}`}>
          <textarea name="notes" placeholder="Notes (optional)" aria-label="Reviewer notes" />
          <button className="btn-a no" name="action" value="reject" type="submit">Reject</button>
          <button className="btn-a go" name="action" value="approve" type="submit">Approve and publish</button>
        </form>
      ) : p.reviewerNotes ? <p className="meta">Notes: {p.reviewerNotes}</p> : null}
    </article>
  );
}

export default async function Review({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  if (!(await isOwner())) redirect("/admin/login?next=/admin/review");
  const sp = await searchParams;
  const store = await getStore();
  const [all, tasks] = await Promise.all([listProposals(undefined, 150), store.list("checks", { where: [["status", "open"]], orderBy: "createdAt", desc: true })]);
  const open = all.filter((p) => p.status === "pending" || p.status === "validating");
  const done = all.filter((p) => !open.includes(p)).slice(0, 25);
  return (
    <div className="wrap">
      <AdminTop />
      <h1>Review queue</h1>
      <p className="a-sub">Agent proposals land here. Anything new, any score change, anything self-reported or single-source, and any failed check waits for you. Confirmations that change nothing are published automatically.</p>
      {store.mode !== "firestore" ? <p className="a-msg">Local mode: data is stored in .data/local-db.json. Set FIREBASE_SERVICE_ACCOUNT to use Firestore.</p> : null}
      {sp.msg ? <p className="a-msg">{sp.msg}</p> : null}

      <h2>Needs review ({open.length})</h2>
      {open.length ? open.map((p) => <ProposalCard key={p.id} p={p} open />) : <p className="empty">Nothing waiting.</p>}

      <h2>Open re-check tasks ({tasks.length})</h2>
      {tasks.length ? (
        <ul className="list">
          {tasks.map((t) => (
            <li key={t.id}>
              <span className="dot warn" />
              <span><b>{String(t.companyId)}</b>: {String(t.summary || t.kind)}{t.target ? <> · <a href={String(t.target)} target="_blank" rel="noopener noreferrer">source</a></> : null}</span>
            </li>
          ))}
        </ul>
      ) : <p className="empty">No open tasks. Cron jobs add tasks when a link breaks or a new filing appears.</p>}

      <h2>Recent decisions</h2>
      {done.length ? done.map((p) => <ProposalCard key={p.id} p={p} open={false} />) : <p className="empty">None yet.</p>}
    </div>
  );
}
