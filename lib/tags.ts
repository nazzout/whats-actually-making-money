// Tags stay flexible, but near-duplicates collapse to one spelling.
// A new tag reuses an existing tag when their normalized keys match; otherwise it is kept as written (trimmed).

// Different words that mean the same tag. Keys and values are normalized keys (see keyOf).
const ALIASES: Record<string, string> = {
  creator: "creator tool",
  "tool for creator": "creator tool",
  "direct to consumer": "dtc",
  "d2c": "dtc",
  "software as a service": "saas",
  "b2b saas": "saas",
  "indie": "indie game",
  "ad tech": "adtech",
  "advertising technology": "adtech",
  "public": "public company",
  "listed company": "public company",
  "wearable device": "wearable",
};

// Words that end in s but are not plurals.
const KEEP = new Set(["saas", "paas", "news", "analytics", "sales", "esports", "ios", "maps", "aws", "plus", "bonus", "status", "campus", "census", "series", "physics", "economics", "logistics", "robotics", "wellness", "fitness", "business", "express", "chess"]);
function singular(w: string) {
  if (w.length <= 3 || KEEP.has(w) || w.endsWith("ss") || w.endsWith("us")) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Lowercase, punctuation to spaces, each word singular, aliases applied. "Creator Tools" and "creator-tool" share a key. */
export function keyOf(tag: string) {
  const k = tag
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ");
  return ALIASES[k] || k;
}

/**
 * Canonicalize a tag list against the tags already in use.
 * Reuses the existing spelling when keys match, drops duplicates within the list, caps at `max`.
 */
export function canonicalTags(input: unknown, existing: string[], max = 12): string[] {
  if (!Array.isArray(input)) return [];
  const known = new Map<string, string>();
  for (const t of existing) {
    const k = keyOf(t);
    if (k && !known.has(k)) known.set(k, t);
  }
  const out = new Map<string, string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const k = keyOf(t);
    if (!k || out.has(k)) continue;
    out.set(k, known.get(k) || t);
    if (out.size >= max) break;
  }
  return [...out.values()];
}

/** Every tag in use with its company count, most used first. Agents read this so they reuse tags. */
export function tagCounts(lists: (string[] | undefined)[]) {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const list of lists)
    for (const t of list || []) {
      const k = keyOf(t);
      const cur = counts.get(k);
      if (cur) cur.count++;
      else counts.set(k, { tag: t, count: 1 });
    }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
