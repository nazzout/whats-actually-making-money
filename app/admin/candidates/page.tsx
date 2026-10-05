import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
import { CANDIDATE_STATUSES, listCandidates, type Candidate, type CandidateStatus } from "@/lib/candidates";
import AdminTop from "../AdminTop";

export const dynamic = "force-dynamic";

const LABEL: Record<CandidateStatus, string> = {
  discovered: "Discovered",
  qualifying: "Qualifying",
  research_needed: "Research needed",
  qualified: "Qualified",
  proposed: "Proposed",
  published: "Published",
  rejected: "Rejected",
  watch_later: "Watch later",
};
// Stages still moving through research come first.
const ORDER: CandidateStatus[] = ["qualified", "research_needed", "qualifying", "discovered", "proposed", "watch_later", "published", "rejected"];
const OPEN = new Set<CandidateStatus>(["discovered", "qualifying", "research_needed", "qualified", "watch_later"]);

function Row({ c }: { c: Candidate }) {
  return (
    <article className="card">
      <div className="card-h">
        <div>
          <h3>
            {c.name}
            {c.entityType === "product" && c.parentCompany ? <span className="meta"> · product of {c.parentCompany}</span> : null}
          </h3>
          <div className="meta">
            {c.industry || "No industry yet"} · found via {c.discoveredFrom?.source}
            {c.discoveredFrom?.lane ? ` (${c.discoveredFrom.lane})` : ""} · {new Date(c.discoveredAt).toLocaleDateString("en-US")}
            {c.website ? (
              <>
                {" · "}
                <a href={c.website} target="_blank" rel="noopener noreferrer">
                  {c.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </>
            ) : null}
          </div>
        </div>
        <span className={`badge ${c.status}`}>{LABEL[c.status]}</span>
      </div>
      <p style={{ margin: "12px 0 0" }}>{c.whyInteresting}</p>
      {c.related?.length ? <p className="meta">Related: {c.related.map((r) => r.note).join("; ")}</p> : null}
      {c.history?.length > 1 ? <p className="meta">Last step: {c.history.at(-1)?.note || LABEL[c.history.at(-1)!.status]}</p> : null}
      {OPEN.has(c.status) ? (
        <form method="post" action={`/api/admin/candidates/${encodeURIComponent(c.id)}`} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input name="note" placeholder="Note (optional)" style={{ flex: "1 1 200px" }} />
          {c.status !== "research_needed" ? <button name="action" value="research">Needs research</button> : null}
          {c.status !== "watch_later" ? <button name="action" value="watch_later">Watch later</button> : null}
          <button name="action" value="reject">Reject</button>
        </form>
      ) : null}
    </article>
  );
}

export default async function CandidatesPage() {
  if (!(await isOwner())) redirect("/admin/login?next=/admin/candidates");
  const all = await listCandidates(undefined, 500);
  const by = new Map<CandidateStatus, Candidate[]>(CANDIDATE_STATUSES.map((s) => [s, []]));
  for (const c of all) by.get(c.status)?.push(c);
  return (
    <div className="wrap">
      <AdminTop />
        <h1>Candidates</h1>
        <p className="meta">
          Businesses found but not yet researched. Nothing here is public. Discovery is off until the first week of cost data is reviewed, so this
          list fills once Step 2 is switched on.
        </p>
        {!all.length ? <p>No candidates yet.</p> : null}
        {ORDER.filter((s) => by.get(s)!.length).map((s) => (
          <section key={s}>
            <h2>
              {LABEL[s]} ({by.get(s)!.length})
            </h2>
            {by.get(s)!.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </section>
        ))}
    </div>
  );
}
