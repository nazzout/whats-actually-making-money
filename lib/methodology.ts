// Public scoring methodology: one source of truth for the How We Score page, the detail-sheet score popovers and the
// Board header definitions. Scoring numbers come from lib/rubric.ts and lib/schema.ts, so the page cannot drift from
// the code. Changing copy here changes it everywhere; changing a rubric constant changes the page too.
import { TIERS, MONETIZED_KINDS, RETENTION_KINDS, MONETIZED_GROWTH_KINDS } from "./schema";
import { WEIGHT, TRUST_WORD, INCLUDE, STRENGTH_BANDS } from "./rubric";

type Tier = (typeof TIERS)[number];

export const DEFINITIONS = {
  trust: "How reliable is the supporting evidence? Public filings and audited numbers rank higher than company or founder claims.",
  strength: "How strong is the underlying business across scale, growth, profitability, efficiency and durability. Funding does not increase this score.",
  demand: "Evidence that customers are actively using, paying for, returning to or expanding their use of the product. Funding and hype do not count as demand.",
  signal: "Combines Business Strength with evidence confidence. Higher scores reflect stronger operating proof backed by more trustworthy sources.",
} as const;

// One line each, condensed from the research rubric (agents/lane-research.md).
export const DIMENSIONS = [
  { key: "scale", label: "Scale", line: "How much revenue the business brings in each year." },
  { key: "growth", label: "Growth", line: "How fast revenue or paying customers are growing. Downloads or users alone can't score high." },
  { key: "profit", label: "Profitability", line: "Whether it makes money after costs, and how well that is proven." },
  { key: "efficiency", label: "Efficiency", line: "Revenue per employee, or revenue relative to the capital it raised." },
  { key: "durability", label: "Durability", line: "How likely the revenue is to last: retention, repeat customers and sustained growth." },
] as const;

export const DEMAND_RUBRIC = [
  { score: 5, word: "Proven", line: "Monetized adoption, plus retention or repeat evidence, plus sustained growth." },
  { score: 4, word: "Strong", line: "Strong paying-customer growth, or strong retention or repeat evidence." },
  { score: 3, word: "Monetizing", line: "Meaningful adoption with some monetization." },
  { score: 2, word: "Adoption", line: "Strong adoption, but monetization is unclear." },
  { score: 1, word: "Early signals", line: "Early or discovery signals only, such as rankings, reviews or community activity." },
  { score: 0, word: "Declining", line: "Documented deterioration, churn or declining usage." },
] as const;

// Every source tier must be placed in a confidence group; the Record type makes a new tier a compile error until it is.
const TIER_GROUP: Record<Tier, "high" | "medium" | "lower"> = {
  "Audited filing": "high",
  "Regulatory/acquirer filing": "high",
  "Company financial statements": "medium",
  "Reputable press": "medium",
  "Third-party analytics": "medium",
  "Company-reported": "lower",
  "Founder post": "lower",
};
const TIER_LABEL: Record<Tier, string> = {
  "Audited filing": "Audited financial filings",
  "Regulatory/acquirer filing": "Regulatory disclosures and confirmed acquisition documents",
  "Company financial statements": "Direct company financial disclosures",
  "Reputable press": "Reputable financial reporting",
  "Third-party analytics": "Credible analytics providers (estimates)",
  "Company-reported": "Company claims and social posts",
  "Founder post": "Founder claims",
};
export const TRUST_GROUPS = (["high", "medium", "lower"] as const).map((g) => ({
  key: g,
  label: g === "high" ? "Higher confidence" : g === "medium" ? "Medium confidence" : "Lower confidence",
  tiers: TIERS.filter((t) => TIER_GROUP[t] === g).map((t) => TIER_LABEL[t]),
}));

export const EVIDENCE_LABELS = [
  { label: "Verified", line: "Supported by strong primary evidence." },
  { label: "Estimated", line: "Calculated or supplied by a third-party data provider." },
  { label: "Self-reported", line: "Provided by the company or founder and not independently verified." },
] as const;

export const KEPT_SEPARATE = [
  ["Funding", "revenue"],
  ["Valuation", "revenue"],
  ["ARR", "profit"],
  ["GMV", "company revenue"],
  ["Downloads", "active users"],
  ["Users", "paying customers"],
  ["Popularity", "proof of retention"],
] as const;

// Everything the client needs, as plain JSON (passed from the server so the client bundle never imports zod).
export const CLIENT_METHOD = {
  definitions: DEFINITIONS,
  dims: DIMENSIONS.map(({ key, label }) => ({ key, label })),
  demand: DEMAND_RUBRIC.map(({ score, word }) => ({ score, word })),
  weight: WEIGHT,
  trustWord: TRUST_WORD,
  include: INCLUDE,
  strengthBands: STRENGTH_BANDS,
  tierOrder: [...TIERS],
  tierGroup: TIER_GROUP,
  monetizedKinds: MONETIZED_KINDS,
  retentionKinds: RETENTION_KINDS,
  monetizedGrowthKinds: MONETIZED_GROWTH_KINDS,
};
export type ClientMethod = typeof CLIENT_METHOD;
