import { MONETIZED_GROWTH_KINDS, MONETIZED_KINDS, RETENTION_KINDS, type Adoption, type Company, type Evidence } from "./schema";
import { relDiff, textHasFigure } from "./amount";
import { VERIFIED_LOSS } from "./rubric";
import { ANALYTICS, DEMAND_SIGNALS, DEMAND_SIGNAL_TIERS, FILING_DOMAINS, PAYWALLED, REPUTABLE_PRESS, hostOf, isCompanyIR, onList } from "./sources-config";

export type Level = "pass" | "warn" | "fail";
export type CheckResult = { rule: string; level: Level; message: string; evidence?: number };

const NOT_REVENUE =
  /\b(funding|raised|raise|valuation|valued|gmv|gross merchandise|users|downloads|installs|units|copies|wishlists?|bookings|transaction volume|gross consumer|consumer spend|app[- ]store gross)\b/i;
const RUN_RATE = /\b(run[- ]?rate|annuali[sz]ed|arr)\b/i;
const PROJECTION = /\b(project(ed|ion|s)?|forecast|guid(ance|ed)|expects?|expected|on track|target(ed)?|outlook)\b/i;
const UNCONFIRMED_PRICE = /\b(reported|talks|discussions|centered around|said to|rumou?red|undisclosed)\b/i;

/** Evidence rules from HANDOFF.md section 3 and 9.4 (item 3). Runs on new or changed evidence. */
export function evidenceRules(list: Evidence[], indexes: number[]): CheckResult[] {
  const out: CheckResult[] = [];
  for (const i of indexes) {
    const e = list[i];
    if (!e) continue;
    const text = `${e.metric} ${e.value} ${e.period}`;
    const tag = `Evidence ${i + 1} (${e.metric})`;
    if (e.type === "Revenue" && NOT_REVENUE.test(text))
      out.push({ rule: "metric-type", level: "fail", evidence: i, message: `${tag}: looks like funding, valuation, GMV, users, units or consumer spend recorded as Revenue.` });
    if (e.type === "Revenue" && RUN_RATE.test(text))
      out.push({ rule: "run-rate", level: "fail", evidence: i, message: `${tag}: a run-rate or ARR is in a trailing revenue slot. Use type ARR or Annualized run-rate.` });
    if (e.type === "Revenue" && !/\d/.test(e.value))
      out.push({ rule: "no-figure", level: "fail", evidence: i, message: `${tag}: type is Revenue but the value has no figure.` });
    if ((e.tier === "Company-reported" || e.tier === "Founder post") && !e.selfReported)
      out.push({ rule: "self-reported", level: "fail", evidence: i, message: `${tag}: ${e.tier} must be marked self-reported.` });
    if (PROJECTION.test(text))
      out.push({
        rule: "projection",
        level: i === 0 ? "fail" : "warn",
        evidence: i,
        message: i === 0 ? `${tag}: a projection cannot be the headline figure.` : `${tag}: looks like a projection. Keep it as context only.`,
      });
    if (e.type === "Acquisition price" && UNCONFIRMED_PRICE.test(text))
      out.push({ rule: "unconfirmed-price", level: "warn", evidence: i, message: `${tag}: price looks reported, not disclosed. Do not treat it as a confirmed exit value.` });
    if (e.type === "Third-party estimate" && e.tier !== "Third-party analytics")
      out.push({ rule: "estimate-tier", level: "warn", evidence: i, message: `${tag}: third-party estimates should use the Third-party analytics tier.` });
    if (!e.url) out.push({ rule: "no-link", level: "warn", evidence: i, message: `${tag}: no source link.` });
    const host = hostOf(e.url);
    if (host) {
      if ((e.tier === "Audited filing" || e.tier === "Regulatory/acquirer filing") && !onList(host, FILING_DOMAINS) && !host.endsWith(".gov"))
        out.push({
          rule: "tier-domain",
          level: "warn",
          evidence: i,
          message: isCompanyIR(host)
            ? `${tag}: company investor page tagged as a filing. Link the filing itself (for example on sec.gov) if possible.`
            : `${tag}: tier says filing but the link is on ${host}.`,
        });
      if (e.tier === "Reputable press" && !onList(host, REPUTABLE_PRESS))
        out.push({ rule: "tier-domain", level: "warn", evidence: i, message: `${tag}: ${host} is not on the reputable press list in section 3.` });
      if (e.tier === "Third-party analytics" && !onList(host, ANALYTICS))
        out.push({ rule: "tier-domain", level: "warn", evidence: i, message: `${tag}: ${host} is not a known analytics source; it may be a secondary write-up.` });
      // Reddit, HN, Product Hunt, TikTok, YouTube, trends and the like can never raise trust on their own.
      if (onList(host, DEMAND_SIGNALS)) {
        if (!DEMAND_SIGNAL_TIERS.includes(e.tier))
          out.push({ rule: "demand-signal", level: "fail", evidence: i, message: `${tag}: ${host} is a community or social source. It can be a Founder post or Company-reported at most, never ${e.tier}.` });
        else if (!e.selfReported)
          out.push({ rule: "demand-signal", level: "fail", evidence: i, message: `${tag}: a figure from ${host} must be marked self-reported.` });
      }
    }
  }
  return out;
}

const FUNDING = /\b(funding|raised|raise|valuation|valued|series [a-f]|seed round)\b/i;
const NOT_PAID = /\b(downloads?|installs?|followers?|visits?|traffic|wishlists?|signups?|sign-ups?|waitlist)\b/i;
const RETENTION_WORDS = /retention|retain|repeat|churn|renew|returning|cohort|re-?order|recurring|again|%/i;

/** Rules for new or changed adoption rows. */
export function adoptionRules(list: Adoption[], indexes: number[]): CheckResult[] {
  const out: CheckResult[] = [];
  for (const i of indexes) {
    const a = list[i];
    if (!a) continue;
    const text = `${a.metric} ${a.value} ${a.change || ""}`;
    const tag = `Adoption ${i + 1} (${a.metric})`;
    if (FUNDING.test(text))
      out.push({ rule: "adoption-funding", level: "fail", message: `${tag}: funding and valuation are capital, not adoption. Use the capital field.` });
    if (MONETIZED_KINDS.includes(a.kind) && NOT_PAID.test(text))
      out.push({ rule: "adoption-kind", level: "warn", message: `${tag}: downloads, followers, traffic or sign-ups are not paying customers. Use Active users or Download or review velocity.` });
    if (RETENTION_KINDS.includes(a.kind) && !RETENTION_WORDS.test(text))
      out.push({ rule: "adoption-retention", level: "warn", message: `${tag}: this reads as popularity, not retention or repeat usage. Retention must be stated, not inferred.` });
    if ((a.tier === "Company-reported" || a.tier === "Founder post") && !a.selfReported)
      out.push({ rule: "self-reported", level: "fail", message: `${tag}: ${a.tier} must be marked self-reported.` });
    if (!a.url) out.push({ rule: "no-link", level: "warn", message: `${tag}: no source link.` });
    const host = hostOf(a.url);
    if (host && onList(host, DEMAND_SIGNALS) && (!DEMAND_SIGNAL_TIERS.includes(a.tier) || !a.selfReported))
      out.push({ rule: "demand-signal", level: "fail", message: `${tag}: ${host} is a community or social source: Founder post or Company-reported at most, and self-reported.` });
  }
  return out;
}

// Monetized growth in the financial ledger: a growth figure on a revenue-type row, or two periods to compare.
const FIN = ["Revenue", "ARR", "Annualized run-rate", "Net income", "Adj. EBITDA", "Free cash flow"];
const GROWTH_WORDS = /grow|growth|yoy|year[- ]on[- ]year|\bup\b|\bfrom\b.*\bto\b|%|\d+x\b|doubled|tripled/i;
function hasMonetizedGrowth(c: Company) {
  if ((c.adoption || []).some((a) => MONETIZED_GROWTH_KINDS.includes(a.kind))) return true;
  const fin = c.evidence.filter((e) => FIN.includes(e.type));
  if (fin.some((e) => GROWTH_WORDS.test(`${e.metric} ${e.value}`))) return true;
  return new Set(fin.filter((e) => e.period).map((e) => `${e.type}|${e.period}`)).size >= 2;
}

/** Demand, growth and durability rules. Only run when the fields they judge change, so routine re-checks are not blocked. */
function demandRules(after: Company, isNew: boolean, before: Company | null): CheckResult[] {
  const touched =
    isNew ||
    !before ||
    JSON.stringify(before.scores) !== JSON.stringify(after.scores) ||
    before.demand !== after.demand ||
    (before.adoption || []).length !== (after.adoption || []).length;
  if (!touched) return [];
  const out: CheckResult[] = [];
  const ad = after.adoption || [];
  const monetized = ad.some((a) => MONETIZED_KINDS.includes(a.kind));
  const retained = ad.some((a) => RETENTION_KINDS.includes(a.kind)) || after.evidence.some((e) => /retention|repeat|renewal|\bnrr\b|churn/i.test(e.metric));
  const d = after.demand;
  if (d !== undefined && d >= 4 && !monetized && !retained)
    out.push({ rule: "demand-support", level: "warn", message: `Demand ${d} needs a paying-customer, paid conversion, paid expansion, repeat-client or retention signal. Usage alone supports 2 at most.` });
  if (d === 5 && !(monetized && retained && after.scores.growth >= 4))
    out.push({ rule: "demand-five", level: "warn", message: "Demand 5 needs monetized adoption, retention or repeat evidence, and sustained growth (Growth 4+)." });
  if (after.scores.growth >= 4 && !hasMonetizedGrowth(after))
    out.push({ rule: "growth-support", level: "warn", message: `Growth ${after.scores.growth} needs monetized growth evidence: revenue growth, paying-customer growth or client expansion. Users or downloads alone do not support it.` });
  if (after.scores.durability >= 4 && !retained)
    out.push({ rule: "durability-support", level: "warn", message: `Durability ${after.scores.durability} needs a retention, repeat-usage or repeat-client signal.` });
  if (after.capital?.status === "funded" && !after.capital.totalRaised && !after.capital.latestValuation)
    out.push({ rule: "capital", level: "warn", message: "Capital says funded but gives no amount raised or valuation. Use unknown if neither is public." });
  return out;
}

/** Company-level rules. */
export function companyRules(after: Company, isNew: boolean, before: Company | null = null): CheckResult[] {
  const out: CheckResult[] = [...demandRules(after, isNew, before)];
  if (isNew && !after.website) out.push({ rule: "website", level: "fail", message: "New companies need a website." });
  if (!after.evidence.length) out.push({ rule: "evidence", level: "warn", message: "No evidence logged." });
  // A verified loss is a different claim from verified profit, so only verified-profit text needs a profit line.
  if (/^verified/i.test(after.profitability) && !VERIFIED_LOSS.test(after.profitability.trim())) {
    const strong = after.evidence.some(
      (e) =>
        ["Net income", "Adj. EBITDA", "Free cash flow"].includes(e.type) &&
        ["Audited filing", "Regulatory/acquirer filing", "Company financial statements"].includes(e.tier) &&
        !e.selfReported,
    );
    if (!strong)
      out.push({ rule: "profit-verified", level: "warn", message: 'Profitability starts with "Verified" but no profit line from a filing or company financial statements is in the evidence.' });
  }
  if (after.evidence.length === 1 && after.confidence >= 3)
    out.push({ rule: "single-source", level: "warn", message: "Trust of 3 or more rests on a single source." });
  return out;
}

const UA = () => process.env.SEC_USER_AGENT || "MakingMoneyResearch/1.0 (+https://vercel.app)";

/** Fetch each link: does it load, is it behind a login, does the page contain the figure? */
export async function sourceChecks(list: Evidence[], indexes: number[], label = "Evidence"): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  await Promise.all(
    indexes.map(async (i) => {
      const e = list[i];
      if (!e?.url) return;
      const tag = `${label} ${i + 1} (${e.metric})`;
      const host = hostOf(e.url);
      if (onList(host, PAYWALLED)) {
        out.push({ rule: "paywall", level: "warn", evidence: i, message: `${tag}: ${host} is usually paywalled. Not fetched; the owner should confirm by hand.` });
        return;
      }
      try {
        const res = await fetch(e.url, {
          redirect: "follow",
          signal: AbortSignal.timeout(12_000),
          headers: { "user-agent": UA(), accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8" },
        });
        if (res.status >= 400) {
          // 401, 403 and 429 mean the site refused an automated fetch (Reuters returns 401), not that the page is gone.
          const blocked = res.status === 401 || res.status === 403 || res.status === 429;
          out.push({
            rule: "link",
            level: blocked ? "warn" : "fail",
            evidence: i,
            message: blocked ? `${tag}: ${host} refused the automated check (${res.status}). Confirm by hand.` : `${tag}: link returned ${res.status}.`,
          });
          return;
        }
        if (/\/(login|signin|sign-in|subscribe|paywall)\b/i.test(res.url)) {
          out.push({ rule: "login-wall", level: "warn", evidence: i, message: `${tag}: link redirects to a login or subscribe page.` });
          return;
        }
        const type = res.headers.get("content-type") || "";
        if (!type.includes("html") && !type.includes("text")) {
          out.push({ rule: "figure", level: "warn", evidence: i, message: `${tag}: ${type.split(";")[0] || "non-HTML"} source. Figure not checked automatically.` });
          return;
        }
        const html = (await res.text()).slice(0, 3_000_000);
        const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ");
        if (/(subscribe|sign in|log in) to (continue|read)/i.test(text))
          out.push({ rule: "login-wall", level: "warn", evidence: i, message: `${tag}: page text suggests a login or paywall.` });
        const has = textHasFigure(e.value, text);
        if (has === false) out.push({ rule: "figure", level: "warn", evidence: i, message: `${tag}: could not find ${e.value} on the page. It may load with JavaScript or use a different format.` });
        else if (has === true) out.push({ rule: "figure", level: "pass", evidence: i, message: `${tag}: figure found on the source page.` });
      } catch (err) {
        out.push({ rule: "link", level: "fail", evidence: i, message: `${tag}: link did not load (${err instanceof Error ? err.name : "error"}).` });
      }
    }),
  );
  return out;
}

/** Section 9.4 item 5: new figures that differ from stored ones by more than 25%. */
export function conflictCheck(before: Company | null, after: Company, indexes: number[]): CheckResult[] {
  if (!before) return [];
  const out: CheckResult[] = [];
  for (const i of indexes) {
    const e = after.evidence[i];
    if (!e) continue;
    for (const old of before.evidence) {
      if (old.type !== e.type || old.url === e.url) continue;
      if (old.period && e.period && old.period !== e.period) continue;
      const d = relDiff(old.value, e.value);
      if (d !== null && d > 0.25)
        out.push({
          rule: "conflict",
          level: "warn",
          evidence: i,
          message: `Evidence ${i + 1}: ${e.value} differs from stored ${old.value} (${old.source}) by ${Math.round(d * 100)}%. Conflicting figures flag added.`,
        });
    }
  }
  return out;
}
