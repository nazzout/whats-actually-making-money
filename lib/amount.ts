// Parse money-like figures ("$1,924M", "RMB 37.12B", "€1.1 billion", ">$300M") into numbers so
// validators can match a claimed value against source text and compare figures for conflicts.

export type Amount = { n: number; cur: string | null; tol: number };

const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, millions: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9,
  t: 1e12, trillion: 1e12,
};

const CUR_MAP: Record<string, string> = {
  "$": "USD", "us$": "USD", usd: "USD", "hk$": "HKD", hkd: "HKD",
  "€": "EUR", eur: "EUR", "£": "GBP", gbp: "GBP", "¥": "CNY", rmb: "CNY", cny: "CNY",
};

const RE =
  /(US\$|HK\$|\$|€|£|¥|RMB|CNY|EUR|USD|GBP|HKD)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(thousand|millions?|billions?|trillion|mm|mn|bn|k|m|b|t)?(?![\w%])/gi;

export function parseAmounts(s: string, opts: { requireMarker?: boolean } = {}): Amount[] {
  const out: Amount[] = [];
  for (const m of s.matchAll(RE)) {
    const [, curRaw, numRaw, scaleRaw] = m;
    if (opts.requireMarker && !curRaw && !scaleRaw) continue;
    const scale = scaleRaw ? SCALE[scaleRaw.toLowerCase()] ?? 1 : 1;
    const digits = numRaw.replace(/,/g, "");
    const n = Number(digits) * scale;
    if (!Number.isFinite(n) || n === 0) continue;
    // Tolerance from the precision of the figure as written (e.g. "$1.1B" means 1.05B to 1.15B).
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    const unit = Math.pow(10, -decimals) * scale;
    out.push({ n, cur: curRaw ? CUR_MAP[curRaw.toLowerCase()] ?? curRaw.toUpperCase() : null, tol: Math.max(0.015, (0.5 * unit) / n) });
  }
  return out;
}

export const firstAmount = (s: string) => parseAmounts(s, { requireMarker: true })[0] || null;

export function close(a: Amount, b: { n: number }) {
  return Math.abs(a.n - b.n) / Math.max(a.n, b.n) <= a.tol;
}

/** Does the source text contain the claimed figure in any common form? */
export function textHasFigure(value: string, text: string) {
  const claimed = parseAmounts(value, { requireMarker: true });
  if (!claimed.length) return null; // nothing numeric to check
  const flat = text.replace(/\s+/g, " ");
  const found = parseAmounts(flat);
  const mult = [1];
  if (/in thousands/i.test(flat)) mult.push(1e3);
  if (/in millions/i.test(flat)) mult.push(1e6);
  return claimed.some((c) => found.some((f) => mult.some((k) => close(c, { n: f.n * k }))));
}

/** Relative difference between two figures in the same currency, or null if not comparable. */
export function relDiff(a: string, b: string) {
  const x = firstAmount(a);
  const y = firstAmount(b);
  if (!x || !y) return null;
  if (x.cur && y.cur && x.cur !== y.cur) return null;
  return Math.abs(x.n - y.n) / Math.max(x.n, y.n);
}
