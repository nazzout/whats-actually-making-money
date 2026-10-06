import type { Company } from "./schema";

// HANDOFF.md section 4. Computed on the server; never stored.
export const WEIGHT: Record<number, number> = { 5: 1, 4: 0.9, 3: 0.75, 2: 0.55, 1: 0.3, 0: 0 };
export const TRUST_WORD = ["No revenue evidence", "Founder post or single source", "Company claim or estimate", "Company results or reputable press", "Regulatory or acquirer filing", "Audited filing"];

const clamp = (v: unknown) => Math.max(0, Math.min(5, Number(v) || 0));

export function strengthOf(c: Pick<Company, "scores">) {
  const s = c.scores || ({} as Company["scores"]);
  return clamp(s.scale) + clamp(s.growth) + clamp(s.profit) + clamp(s.efficiency) + clamp(s.durability);
}

export function derive<T extends Pick<Company, "scores" | "confidence">>(c: T) {
  const strength = strengthOf(c);
  const confidence = clamp(c.confidence);
  return {
    ...c,
    confidence,
    strength,
    signal: +(strength * WEIGHT[confidence]).toFixed(1),
    included: confidence >= 2 && strength >= 12,
  };
}

export const strengthWord = (v: number) => (v >= 20 ? "Very strong" : v >= 15 ? "Strong" : v >= 12 ? "Moderate" : "Too early to call");

// "Verified loss" and "Verified losses: ..." start with "Verified" too; they are verified losses, not verified profit.
export const VERIFIED_LOSS = /^verified\W*(net\s+|operating\s+|gaap\s+|annual\s+)?loss/i;

export function profitState(c: Pick<Company, "profitability">) {
  const p = (c.profitability || "").trim();
  if (VERIFIED_LOSS.test(p)) return "loss";
  return /^verified/i.test(p) ? "verified" : /claim|company-reported|self-reported/i.test(p) ? "claimed" : "none";
}
