import { listCompanies } from "./data";
import { AI_ROLES, CUSTOMERS, ECOSYSTEM_ROLES, FORMS, INDUSTRIES, MODELS, type Company } from "./schema";
import { tagCounts } from "./tags";

// What discovery reads before every run.
// Priority 1: every product form (the Explore pills) reaches FORM_TARGET credible companies.
// Priority 2: industries grow toward TARGET.
// Everything else is a diagnostic: useful for spotting skew, never a quota that justifies adding weak companies.

export const TARGET = 15;
export const FORM_TARGET = 10;
export const LIMITED_SAMPLE = 5;

/** Sample-size label shown wherever a comparison rests on this many companies. */
export const tierOf = (n: number) => (n < 5 ? "Limited sample" : n < 10 ? "Growing sample" : n < 25 ? "Useful coverage" : "Strong coverage");

// The four discovery rotation groups. Every industry belongs to exactly one.
export const ROTATION: Record<string, readonly (typeof INDUSTRIES)[number][]> = {
  "Consumer, apps and games": ["Consumer", "Gaming", "Health", "Finance"],
  "Software and tools": ["Software", "Developer tools", "Productivity"],
  "Agencies, advertising and entertainment": ["Advertising", "Creative services", "Entertainment", "Media"],
  "Hardware, physical products, services and marketplaces": ["Hardware", "Consumer goods", "Commerce", "Marketplaces", "Services", "Other"],
};

const countBy = <T extends string>(companies: Company[], key: (c: Company) => T | undefined, values: readonly T[]) => {
  const m = Object.fromEntries(values.map((v) => [v, 0])) as Record<T, number>;
  let unclassified = 0;
  for (const c of companies) {
    const v = key(c);
    if (v && v in m) m[v]++;
    else unclassified++;
  }
  return { counts: m, unclassified };
};

export async function coverage() {
  const companies = await listCompanies();
  const ind = countBy(companies, (c) => c.industry, INDUSTRIES);

  const industries = INDUSTRIES.map((name) => {
    const count = ind.counts[name];
    return { name, count, target: TARGET, gap: Math.max(0, TARGET - count), limitedSample: count < LIMITED_SAMPLE, tier: tierOf(count) };
  }).sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));

  const fm = countBy(companies, (c) => c.form, FORMS);
  const forms = FORMS.map((name) => {
    const count = fm.counts[name];
    return { name, count, target: FORM_TARGET, gap: Math.max(0, FORM_TARGET - count), tier: tierOf(count) };
  }).sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));

  // Groups ordered by how far below target they are on average, so discovery works the thinnest group first.
  const groups = Object.entries(ROTATION)
    .map(([group, members]) => {
      const counts = members.map((m) => ind.counts[m]);
      const total = counts.reduce((a, b) => a + b, 0);
      return { group, industries: [...members], total, averageGap: +(members.reduce((a, m) => a + Math.max(0, TARGET - ind.counts[m]), 0) / members.length).toFixed(1) };
    })
    .sort((a, b) => b.averageGap - a.averageGap || a.total - b.total);

  return {
    total: companies.length,
    priority:
      "First: bring every product form below " + FORM_TARGET + " up to " + FORM_TARGET + " credible companies. Then: grow industries toward " + TARGET + ". Never add a weak company to hit a number.",
    // Priority 1. A company counts toward one primary form; tags carry everything else it also is.
    formTarget: FORM_TARGET,
    formsBelowTarget: forms.filter((f) => f.gap > 0).map((f) => `${f.name} (${f.count})`),
    forms,
    // Priority 2.
    target: TARGET,
    limitedSampleBelow: LIMITED_SAMPLE,
    unclassifiedIndustry: ind.unclassified,
    industries,
    rotation: groups,
    // Diagnostics only. No targets.
    diagnostics: {
      aiRole: countBy(companies, (c) => c.aiRole, AI_ROLES),
      customer: countBy(companies, (c) => c.customer, CUSTOMERS),
      model: countBy(companies, (c) => c.model, MODELS),
      ecosystemRole: countBy(companies, (c) => c.ecosystemRole, ECOSYSTEM_ROLES),
    },
    // Reuse these spellings rather than inventing near-duplicates.
    tags: tagCounts(companies.map((c) => c.tags)),
    note: "Industry gaps guide discovery. Never add a weak company to fill a gap; an empty category is better than a bad example.",
  };
}
