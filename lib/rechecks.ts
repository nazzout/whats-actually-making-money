import { listCompanies } from "./data";
import { getStore } from "./store";

const STALE_DAYS = 90;

/** Companies an agent should re-check, with the reasons (HANDOFF.md section 9.3). */
export async function dueRechecks() {
  const store = await getStore();
  const [companies, open] = await Promise.all([listCompanies(), store.list("checks", { where: [["status", "open"]] })]);
  const now = Date.now();
  const out = companies.map((c) => {
    const reasons: string[] = [];
    const tasks = open.filter((o) => o.companyId === c.id);
    for (const t of tasks) reasons.push(String(t.summary || `${t.kind} check`));
    if (c.flags?.includes("Pending disclosure")) reasons.push("Flagged Pending disclosure");
    if (c.flags?.includes("Conflicting figures")) reasons.push("Flagged Conflicting figures");
    const checked = c.evidence.map((e) => (e.lastCheckedAt ? Date.parse(e.lastCheckedAt) : 0));
    const oldest = checked.length ? Math.min(...checked) : 0;
    if (!oldest || now - oldest > STALE_DAYS * 864e5) reasons.push(oldest ? `Evidence not checked in ${STALE_DAYS}+ days` : "Evidence never re-checked");
    return {
      id: c.id,
      name: c.name,
      recheck: c.recheck,
      reasons,
      openTasks: tasks.map((t) => ({ id: t.id, kind: t.kind, summary: t.summary, detail: t.detail, createdAt: t.createdAt })),
      priority: tasks.length * 10 + (c.flags?.includes("Pending disclosure") ? 5 : 0) + reasons.length,
    };
  });
  return out.filter((x) => x.reasons.length).sort((a, b) => b.priority - a.priority);
}
