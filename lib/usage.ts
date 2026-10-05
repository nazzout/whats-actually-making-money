import { z } from "zod";
import { getStore } from "./store";

// One record per agent run, keyed by GitHub run id + lane, so a retried report overwrites instead of double-counting.
// Links to candidates, proposals and companies are derived here from what the run's agent created during the run,
// rather than trusted from the runner, so cost can later be traced end to end.

export const UsageInput = z.object({
  lane: z.string().trim().min(1).max(40),
  runId: z.string().trim().min(1).max(40),
  runAttempt: z.coerce.number().int().min(1).default(1),
  model: z.string().trim().max(60).default(""),
  usd: z.coerce.number().min(0).max(1000),
  turns: z.coerce.number().int().min(0).default(0),
  status: z.string().trim().max(40).default(""),
  // The proposedBy / discovery lane name the agent used, for matching what it created.
  agentName: z.string().trim().min(1).max(80),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
});

export type AgentRun = z.infer<typeof UsageInput> & {
  id: string;
  month: string;
  proposalIds: string[];
  companyIds: string[];
  candidateIds: string[];
  recordedAt: string;
};

// A retried report of the same attempt overwrites. A GitHub re-run keeps the run id but bumps the attempt,
// and is genuinely new spend, so the attempt is part of the key.
const runKey = (runId: string, attempt: number, lane: string) => `${runId}-${attempt}-${lane}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
const SLACK_MS = 2 * 60_000; // proposals finish validating just after the agent stops

export async function recordRun(raw: unknown) {
  const u = UsageInput.parse(raw);
  const store = await getStore();
  const id = runKey(u.runId, u.runAttempt, u.lane);
  const existing = await store.get("agentRuns", id);
  const from = Date.parse(u.startedAt);
  const to = Date.parse(u.finishedAt) + SLACK_MS;
  const inWindow = (iso: unknown) => {
    const t = Date.parse(String(iso || ""));
    return t >= from && t <= to;
  };
  const [proposals, candidates] = await Promise.all([store.list("proposals", { where: [["proposedBy", u.agentName]] }), store.list("candidates")]);
  const mine = proposals.filter((p) => inWindow(p.createdAt));
  const cands = candidates.filter((c) => inWindow(c.discoveredAt) && (c.discoveredFrom as { lane?: string } | undefined)?.lane === u.agentName);
  const run: AgentRun = {
    ...u,
    id,
    month: u.startedAt.slice(0, 7),
    proposalIds: mine.map((p) => p.id),
    companyIds: [...new Set(mine.map((p) => String(p.companyId)))],
    // Candidates the run discovered, plus candidates it turned into proposals.
    candidateIds: [...new Set([...cands.map((c) => c.id), ...mine.map((p) => p.candidateId).filter((x): x is string => typeof x === "string")])],
    recordedAt: new Date().toISOString(),
  };
  await store.set("agentRuns", id, run);
  return { id, duplicate: !!existing, run };
}

/** Monthly costs by lane plus end-to-end unit costs. All figures are estimates from reported model spend. */
export async function costSummary(month = new Date().toISOString().slice(0, 7)) {
  const store = await getStore();
  const [runs, proposals, candidates, ask] = await Promise.all([
    store.list("agentRuns", { where: [["month", month]] }) as unknown as Promise<AgentRun[]>,
    store.list("proposals"),
    store.list("candidates"),
    store.get("meta", `askSpend-${month}`),
  ]);
  const pStatus = new Map(proposals.map((p) => [p.id, String(p.status)]));
  const cStatus = new Map(candidates.map((c) => [c.id, String(c.status)]));
  const published = (id: string) => ["auto_published", "approved"].includes(pStatus.get(id) || "");

  const lanes = new Map<string, { lane: string; usd: number; runs: number; proposals: number; published: number; candidates: number }>();
  // Each run's cost is split evenly across what it touched, so shared runs are not counted twice.
  const perCandidate = new Map<string, number>();
  let updateUsd = 0;
  let verifiedUpdates = 0;
  for (const r of runs) {
    const l = lanes.get(r.lane) || { lane: r.lane, usd: 0, runs: 0, proposals: 0, published: 0, candidates: 0 };
    l.usd += r.usd;
    l.runs++;
    l.proposals += r.proposalIds.length;
    l.published += r.proposalIds.filter(published).length;
    l.candidates += r.candidateIds.length;
    lanes.set(r.lane, l);
    if (r.candidateIds.length) for (const c of r.candidateIds) perCandidate.set(c, (perCandidate.get(c) || 0) + r.usd / r.candidateIds.length);
    else {
      updateUsd += r.usd;
      verifiedUpdates += r.proposalIds.filter(published).length;
    }
  }
  const askValue = (ask?.value as { usd?: number; calls?: number } | undefined) || {};
  const avg = (ids: string[]) => (ids.length ? ids.reduce((a, id) => a + (perCandidate.get(id) || 0), 0) / ids.length : null);
  const ids = [...perCandidate.keys()];
  const qualified = ids.filter((id) => ["qualified", "proposed", "published"].includes(cStatus.get(id) || ""));
  const pub = ids.filter((id) => cStatus.get(id) === "published");

  const agentUsd = runs.reduce((a, r) => a + r.usd, 0);
  return {
    month,
    totalUsd: agentUsd + (askValue.usd || 0),
    ask: { usd: askValue.usd || 0, calls: askValue.calls || 0 },
    lanes: [...lanes.values()].sort((a, b) => b.usd - a.usd),
    unit: {
      // Average cost already spent on each candidate at that stage. Null until the pipeline has data.
      perDiscoveredCandidate: avg(ids),
      perQualifiedCandidate: avg(qualified),
      perPublishedCompany: avg(pub),
      // Re-check and verification spend divided by the updates that actually published.
      perVerifiedUpdate: verifiedUpdates ? updateUsd / verifiedUpdates : null,
    },
    counts: { runs: runs.length, discovered: ids.length, qualified: qualified.length, published: pub.length, verifiedUpdates },
  };
}
