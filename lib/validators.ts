import type { Company, Evidence } from "./schema";
import { relDiff, textHasFigure } from "./amount";
import { ANALYTICS, FILING_DOMAINS, PAYWALLED, REPUTABLE_PRESS, hostOf, isCompanyIR, onList } from "./sources-config";

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
    }
  }
  return out;
}

/** Company-level rules. */
export function companyRules(after: Company, isNew: boolean): CheckResult[] {
  const out: CheckResult[] = [];
  if (isNew && !after.website) out.push({ rule: "website", level: "fail", message: "New companies need a website." });
  if (!after.evidence.length) out.push({ rule: "evidence", level: "warn", message: "No evidence logged." });
  if (/^verified/i.test(after.profitability)) {
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
export async function sourceChecks(list: Evidence[], indexes: number[]): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  await Promise.all(
    indexes.map(async (i) => {
      const e = list[i];
      if (!e?.url) return;
      const tag = `Evidence ${i + 1} (${e.metric})`;
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
