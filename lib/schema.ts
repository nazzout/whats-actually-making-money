import { z } from "zod";

// Exact values from HANDOFF.md sections 5 and 6.
export const AI_ROLES = ["Native", "Engine", "Feature", "None"] as const;
export const DIGITAL = ["Fully digital", "Digital-led", "Digitally distributed", "Digitally enabled", "Non-digital"] as const;
export const FORMS = ["Mobile app", "Web app/site", "Desktop software", "Game", "API/infrastructure", "Marketplace/platform", "Content/media", "Physical product", "Hardware + software", "Service", "Hybrid"] as const;
export const CUSTOMERS = ["B2C", "B2B", "Prosumer", "C2C/marketplace", "B2B/Prosumer"] as const;
export const MODELS = ["Subscription", "Usage", "Take rate", "One-time purchase", "Ads", "Retainer/project fees", "Licensing", "Subscription + usage", "One-time + subscription"] as const;
export const METRIC_TYPES = ["Revenue", "ARR", "Annualized run-rate", "Net income", "Adj. EBITDA", "Free cash flow", "GMV", "Gross consumer spend", "Units", "Users", "Third-party estimate", "Acquisition price"] as const;
export const TIERS = ["Audited filing", "Regulatory/acquirer filing", "Company financial statements", "Reputable press", "Third-party analytics", "Company-reported", "Founder post"] as const;
export const FLAGS = ["Hit-dependent", "Decelerating", "Conflicting figures", "Metric-type risk", "Customer concentration", "Pending disclosure"] as const;
// AI is deliberately not an industry: aiRole carries it, so AI and non-AI companies can be compared within an industry.
export const INDUSTRIES = ["Software", "Developer tools", "Productivity", "Consumer", "Gaming", "Entertainment", "Media", "Advertising", "Creative services", "Commerce", "Health", "Finance", "Hardware", "Consumer goods", "Marketplaces", "Services", "Other"] as const;
export const ECOSYSTEM_ROLES = ["End product", "Platform", "Enabling tool", "Infrastructure", "Marketplace", "Service layer"] as const;
// A tracked entity can be a company, or a product owned by another company (Claude by Anthropic, ReelShort by Crazy Maple Studio).
export const ENTITY_TYPES = ["company", "product"] as const;

const score = z.number().int().min(0).max(5);
const url = z.string().trim().regex(/^https?:\/\//i, "Must start with http:// or https://");

export const EvidenceSchema = z.object({
  metric: z.string().trim().min(1),
  value: z.string().trim().min(1),
  period: z.string().trim().default(""),
  type: z.enum(METRIC_TYPES),
  tier: z.enum(TIERS),
  selfReported: z.boolean(),
  source: z.string().trim().default(""),
  url: url.or(z.literal("")).default(""),
  lastCheckedAt: z.string().optional(),
  lastCheckStatus: z.string().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// Optional pointers the cron jobs use to watch official sources for a company.
export const WatchSchema = z
  .object({
    secCik: z.string().regex(/^\d{1,10}$/).optional(),
    companiesHouse: z.string().trim().optional(),
    rss: z.array(url).optional(),
    steamAppId: z.string().regex(/^\d+$/).optional(),
  })
  .partial();

// Where a company first came from. Internal: stripped from public output.
export const DiscoveredFromSchema = z.object({
  source: z.string().trim().min(1).max(120),
  url: url.optional(),
  lane: z.string().trim().max(60).optional(),
  candidateId: z.string().trim().max(80).optional(),
});

export const CompanySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/, "Lowercase slug"),
  name: z.string().trim().min(1),
  form: z.enum(FORMS),
  customer: z.enum(CUSTOMERS),
  model: z.enum(MODELS),
  digital: z.enum(DIGITAL),
  aiRole: z.enum(AI_ROLES),
  launched: z.string().trim().default(""),
  website: url,
  icon: z.string().trim().optional(),
  trigger: z.string().trim().default(""),
  confidence: score,
  scores: z.object({ scale: score, growth: score, profit: score, efficiency: score, durability: score }),
  profitability: z.string().trim().default("Not publicly verified."),
  summary: z.string().trim().default(""),
  caveats: z.string().trim().default(""),
  recheck: z.string().trim().default(""),
  flags: z.array(z.enum(FLAGS)).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  watch: WatchSchema.optional(),
  // Phase 2 classification. Optional so older records stay valid; empty means not classified yet, not "unknown".
  industry: z.enum(INDUSTRIES).optional(),
  ecosystemRole: z.enum(ECOSYSTEM_ROLES).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  entityType: z.enum(ENTITY_TYPES).optional(),
  parentCompany: z.string().trim().min(1).max(120).optional(),
  discoveredFrom: DiscoveredFromSchema.optional(),
  discoveredAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Company = z.infer<typeof CompanySchema>;

// Fields an update proposal may change. Computed fields (strength, signal, included) are never accepted.
export const CompanyPatchSchema = CompanySchema.omit({ id: true, updatedAt: true }).partial();
export type CompanyPatch = z.infer<typeof CompanyPatchSchema>;

export const COMPUTED_FIELDS = ["strength", "signal", "included"] as const;

export function stripComputed<T extends Record<string, unknown>>(o: T): T {
  const c = { ...o };
  for (const k of COMPUTED_FIELDS) delete (c as Record<string, unknown>)[k];
  return c;
}

export const slugify = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
