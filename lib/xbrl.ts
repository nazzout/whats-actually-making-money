import { getCompany } from "./data";
import { getStore } from "./store";
import { finishProposal, submitProposal } from "./proposals";
import type { Company, Evidence } from "./schema";

// Deterministic revenue updates from SEC XBRL. No model involved.
// Reads structured revenue facts, compares them with stored evidence, and either:
//   - proposes a newer period through the normal proposal pipeline (validators + publish policy apply), or
//   - opens a re-check task for an agent when something disagrees.
// It never writes company data directly and never guesses: a missing or ambiguous tag returns no result.

const UA = () => process.env.SEC_USER_AGENT || "MakingMoneyResearch/1.0";
// Filers use different revenue tags. Facts from all of them are merged; the latest filed value per period wins.
const TAGS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"];

type Fact = { start?: string; end: string; val: number; form: string; fp?: string; fy?: number; frame?: string; filed: string; accn: string };
export type XbrlPeriod = { kind: "quarter" | "annual"; label: string; end: string; val: number; form: string; accn: string; filed: string };

async function facts(cik: string, tag: string): Promise<Fact[]> {
  const r = await fetch(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik.padStart(10, "0")}/us-gaap/${tag}.json`, {
    headers: { "user-agent": UA(), accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`XBRL ${tag} ${r.status}`);
  const j = await r.json();
  return (j.units?.USD as Fact[]) || [];
}

/**
 * Latest discrete quarter and latest fiscal year.
 * Only facts carrying a calendar `frame` are used: SEC assigns each frame to one fact, the most recently
 * filed one, which handles restatements (AppLovin's 2024 revenue was restated after a divestiture).
 */
export async function latestRevenue(cik: string): Promise<{ quarter?: XbrlPeriod; annual?: XbrlPeriod }> {
  const all = (await Promise.all(TAGS.map((t) => facts(cik, t)))).flat();
  const byFrame = new Map<string, Fact>();
  for (const f of all) {
    if (!f.frame || !/^CY\d{4}(Q[1-4])?$/.test(f.frame)) continue;
    const prev = byFrame.get(f.frame);
    if (!prev || f.filed > prev.filed) byFrame.set(f.frame, f);
  }
  const pick = (re: RegExp) => [...byFrame.values()].filter((f) => re.test(f.frame!)).sort((a, b) => b.end.localeCompare(a.end))[0];
  const q = pick(/Q[1-4]$/);
  const y = pick(/^CY\d{4}$/);
  const out: { quarter?: XbrlPeriod; annual?: XbrlPeriod } = {};
  // Labels use the company's own fiscal period (fp/fy), which matches how filings and press describe them.
  if (q && q.fp && q.fy) out.quarter = { kind: "quarter", label: `${q.fp} ${q.fy}`, end: q.end, val: q.val, form: q.form, accn: q.accn, filed: q.filed };
  if (y && y.fy) out.annual = { kind: "annual", label: `FY${y.fy}`, end: y.end, val: y.val, form: y.form, accn: y.accn, filed: y.filed };
  return out;
}

const money = (v: number) => (Math.abs(v) >= 1e8 ? `$${Math.round(v / 1e6).toLocaleString("en-US")}M` : `$${(v / 1e6).toFixed(1)}M`);
const filingUrl = (cik: string, accn: string) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/${accn}-index.htm`;
// 10-K figures are audited. 10-Q figures are reviewed, not audited, so they sit one tier lower.
const tierFor = (form: string): Evidence["tier"] => (/^10-K/.test(form) || /^20-F/.test(form) ? "Audited filing" : "Regulatory/acquirer filing");

/** Parse a stored period label ("Q2 2026", "FY2025", "H1 2026", "2025") into an approximate end date. */
export function periodEnd(p: string): string | null {
  const s = p.toUpperCase();
  let m = s.match(/Q([1-4])\s*(?:FY)?\s*'?(\d{4})/) || s.match(/(\d{4})\s*Q([1-4])/);
  if (m) {
    const [q, y] = /^\d{4}$/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    return `${y}-${["03-31", "06-30", "09-30", "12-31"][Number(q) - 1]}`;
  }
  if ((m = s.match(/H([12])\s*(\d{4})/))) return `${m[2]}-${m[1] === "1" ? "06-30" : "12-31"}`;
  if ((m = s.match(/(?:FY|CY)\s*'?(\d{4})/)) || (m = s.match(/^(\d{4})$/))) return `${m[1]}-12-31`;
  return null;
}
const sameLabel = (a: string, b: string) => a.replace(/\s+/g, "").toUpperCase() === b.replace(/\s+/g, "").toUpperCase();
const numeric = (v: string) => {
  const m = v.replace(/,/g, "").match(/([\d.]+)\s*([MB])/i);
  return m ? Number(m[1]) * (m[2].toUpperCase() === "B" ? 1e9 : 1e6) : null;
};

type Task = { kind: string; companyId: string; target: string; summary: string; key: string; detail?: unknown };
type Result = { proposed: string[]; tasks: string[]; skipped: string[]; error?: string };

export async function pollXbrl(c: Company, cik: string, openTask: (t: Task) => Promise<boolean>): Promise<Result> {
  const res: Result = { proposed: [], tasks: [], skipped: [] };
  const latest = await latestRevenue(cik);
  const periods = [latest.quarter, latest.annual].filter((p): p is XbrlPeriod => !!p);
  if (!periods.length) return { ...res, skipped: ["no frame-tagged revenue facts; nothing to compare"] };

  const store = await getStore();
  const metaKey = `xbrl-${cik}`;
  const sent = new Set(((await store.get("meta", metaKey))?.value as string[]) || []);
  const revenueRows = c.evidence.filter((e) => e.type === "Revenue");
  const newestStored = revenueRows.map((e) => periodEnd(e.period)).filter(Boolean).sort().at(-1) || "";

  for (const p of periods) {
    const url = filingUrl(cik, p.accn);
    const match = revenueRows.find((e) => sameLabel(e.period, p.label));

    if (match) {
      const stored = numeric(match.value);
      if (stored !== null && Math.abs(stored - p.val) / p.val > 0.01) {
        // The board and the filing disagree for the same period. Never pick a winner automatically.
        if (await openTask({ kind: "filing", companyId: c.id, target: url, key: `xbrl-conflict:${c.id}:${p.label}:${p.val}`, summary: `SEC ${p.form} reports ${p.label} revenue of ${money(p.val)}; the board shows ${match.value}.`, detail: p })) res.tasks.push(`conflict ${p.label}`);
      } else if (match.tier !== tierFor(p.form)) {
        if (await openTask({ kind: "filing", companyId: c.id, target: url, key: `xbrl-tier:${c.id}:${p.label}`, summary: `${p.label} revenue comes from a ${p.form}, so its tier should be "${tierFor(p.form)}", not "${match.tier}".`, detail: p })) res.tasks.push(`tier ${p.label}`);
      } else res.skipped.push(`${p.label} already on the board`);
      continue;
    }

    if (newestStored && p.end <= newestStored) {
      res.skipped.push(`${p.label} is not newer than stored evidence`);
      continue;
    }
    const sentKey = `${p.label}:${p.accn}`;
    if (sent.has(sentKey)) {
      res.skipped.push(`${p.label} already proposed`);
      continue;
    }

    const row: Evidence = {
      metric: "Revenue",
      value: money(p.val),
      period: p.label,
      type: "Revenue",
      tier: tierFor(p.form),
      selfReported: false,
      source: `SEC ${p.form} (XBRL)`,
      url,
    };
    // Re-read so a proposal never builds on a stale record.
    if (!(await getCompany(c.id))) continue;
    const proposal = await submitProposal({
      kind: "add_evidence",
      companyId: c.id,
      payload: { evidence: [row], headline: true },
      reason: `${p.label} revenue from SEC ${p.form} filed ${p.filed}, read from structured XBRL data.`,
      sourceUrls: [url],
      proposedBy: "xbrl-collector",
    });
    await finishProposal(proposal.id);
    sent.add(sentKey);
    res.proposed.push(`${p.label} ${money(p.val)} (proposal ${proposal.id})`);
  }

  await store.set("meta", metaKey, { value: [...sent].slice(-50), updatedAt: new Date().toISOString() });
  return res;
}
