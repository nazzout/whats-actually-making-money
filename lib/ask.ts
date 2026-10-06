import { createHash } from "node:crypto";
import { getStore } from "./store";

// Every value here can be raised later through environment variables, once real usage and cost are known.
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
export const ASK = {
  maxChars: num(process.env.ASK_MAX_CHARS, 280),
  maxTokens: num(process.env.ASK_MAX_TOKENS, 200),
  dailyLimit: num(process.env.ASK_DAILY_LIMIT, 10),
  weeklyLimit: num(process.env.ASK_WEEKLY_LIMIT, 30),
  // IP is a secondary abuse signal, looser than the per-visitor limit so shared networks still work.
  ipDailyLimit: num(process.env.ASK_IP_DAILY_LIMIT, 40),
  monthlyBudgetUsd: num(process.env.ASK_MONTHLY_BUDGET_USD, 10),
  model: process.env.ASK_MODEL || "claude-haiku-4-5",
  // USD per million tokens. Estimates only; update if the model or its pricing changes.
  price: {
    input: num(process.env.ASK_PRICE_INPUT, 1),
    output: num(process.env.ASK_PRICE_OUTPUT, 5),
    cacheWrite: num(process.env.ASK_PRICE_CACHE_WRITE, 1.25),
    cacheRead: num(process.env.ASK_PRICE_CACHE_READ, 0.1),
    webSearch: 0,
  },
  // Market guidance: strategic build/opportunity questions. Dataset first, plus a hard-capped web check inside one API call.
  guidance: {
    model: process.env.ASK_GUIDANCE_MODEL || "claude-sonnet-5-5",
    // Each search adds roughly 14K input tokens of page content, which dominates cost. 1 by default; 2 is the ceiling.
    maxSearches: Math.min(2, Math.max(0, num(process.env.ASK_GUIDANCE_MAX_SEARCHES, 1))),
    maxTokens: num(process.env.ASK_GUIDANCE_MAX_TOKENS, 250),
    // Counts against the normal allowance too; this only stops one visitor spending all of it on the dearer mode.
    dailyLimit: num(process.env.ASK_GUIDANCE_DAILY_LIMIT, 3),
    // Pre-flight worst-case estimate above this falls back to a dataset-only answer.
    maxUsd: num(process.env.ASK_GUIDANCE_MAX_USD, 0.1),
    searchTokens: num(process.env.ASK_GUIDANCE_SEARCH_TOKENS, 14000),
    cacheDays: num(process.env.ASK_GUIDANCE_CACHE_DAYS, 7),
    price: {
      input: num(process.env.ASK_GUIDANCE_PRICE_INPUT, 3),
      output: num(process.env.ASK_GUIDANCE_PRICE_OUTPUT, 15),
      cacheWrite: num(process.env.ASK_GUIDANCE_PRICE_CACHE_WRITE, 3.75),
      cacheRead: num(process.env.ASK_GUIDANCE_PRICE_CACHE_READ, 0.3),
      webSearch: num(process.env.ASK_PRICE_WEB_SEARCH, 0.01), // USD per search
    },
  },
};

/** Strategic "what should I build / where is the opportunity" questions. Code decides, not a model. */
const GUIDANCE =
  /\b(what|which)\b.*\b(should|could|can|would)\b.*\b(i|we|a small team|a solo|someone|one)\b.*\b(build|make|launch|start|create|sell)\b|\b(worth|realistic(ally)?|best)\b.*\b(build|building|make|launch|start)\b|\bopportunit(y|ies)\b|\bwhite ?space\b|\bgap(s)? in the market\b|\bunderserved\b|\bsmall team(s)?\b.*\b(build|make|win|start)\b|\bwhat to build\b|\bstart a (business|company|studio|agency)\b|\bniche(s)?\b.*\b(build|enter|start|worth)\b/i;
export const isGuidance = (q: string) => GUIDANCE.test(q);

/** Worst-case cost of a guidance call before making it: dataset prompt + every allowed search + full output. */
export function estimateGuidanceCost(promptChars: number) {
  const g = ASK.guidance;
  const inTok = Math.ceil(promptChars / 4) + g.maxSearches * g.searchTokens;
  return (inTok * g.price.input + g.maxTokens * g.price.output) / 1e6 + g.maxSearches * g.price.webSearch;
}

const DAY = 864e5;
const WEEK = 7 * DAY;
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export const MSG = {
  tooLong: `Please shorten your question to ${ASK.maxChars} characters or less.`,
  offTopic: "That's outside what What Makes Money covers. Try asking about companies, industries, business models, revenue, growth, or what may be worth building.",
  noData: "We don't have enough verified data on that yet. Try browsing the related category or check back as the research updates.",
  exhausted: "You've used your AI questions for now. You can still search by company, category, industry, or keyword.",
  paused: "AI answers are paused for now. You can still search by company, category, industry, or keyword.",
};

/** Lowercase, drop punctuation, collapse spaces, so trivial variations share a cache entry. */
export const normalize = (q: string) =>
  q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}$%.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ---------- scope ---------- */
const ON_TOPIC =
  /\b(compan|business|startup|product|app|apps|game|games|gaming|software|saas|tool|platform|marketplace|hardware|device|agenc|studio|brand|creator|consumer|b2b|b2c|industr|categor|sector|market|revenue|arr|run.?rate|profit|margin|ebitda|income|earn|money|making|sales|growth|grow|scale|team|employee|founder|bootstrap|fund|acqui|ipo|pricing|price|subscription|usage|ads?|advertis|distribution|organic|ai|ai-native|non-ai|trust|evidence|verified|signal|strength|momentum|trend|build|worth|opportunit|compare|versus|vs|outperform|ledger|board|watchlist|niche|underserved|white ?space|launch|indie|solo|side project|customers?)/i;
const OFF_TOPIC =
  /\b(recipe|cook|bake|weather|forecast|horoscope|poem|haiku|song lyric|joke|riddle|story about|write (me )?(an? )?(essay|letter|email|cover letter|story)|translate|homework|my (girlfriend|boyfriend|wife|husband|boss)|dating|relationship advice|diet|symptom|diagnos|medical|legal advice|lawsuit|javascript|python|typescript|regex|sql|debug|stack trace|compile|capital of|who won|election|president|celebrity|movie recommend|sports score)/i;

/**
 * Deterministic first pass, no model.
 * "off" means reject without any AI call. "on" and "unsure" both go to the cheap answer model,
 * which applies the same scope rule in its prompt and returns a refusal flag for off-topic input.
 */
export function scopeOf(q: string, names: string[]): "on" | "off" | "unsure" {
  const s = q.toLowerCase();
  const mentionsCompany = names.some((n) => n.length > 2 && s.includes(n.toLowerCase()));
  if (mentionsCompany || ON_TOPIC.test(s)) return OFF_TOPIC.test(s) && !mentionsCompany ? "unsure" : "on";
  return OFF_TOPIC.test(s) ? "off" : "unsure";
}

/* ---------- quotas (rolling windows) ---------- */
type Quota = { ok: true; remainingToday: number } | { ok: false; reason: "exhausted"; retryAt: string } | { ok: false; reason: "paused" };

const monthKey = () => new Date().toISOString().slice(0, 7);

export async function monthSpend() {
  const store = await getStore();
  const d = await store.get("meta", `askSpend-${monthKey()}`);
  return Number((d?.value as { usd?: number } | undefined)?.usd || 0);
}

/** Daily limit is halved past 80% of the monthly budget, and AI answers stop at 100%. */
async function effectiveDailyLimit() {
  if (ASK.monthlyBudgetUsd <= 0) return ASK.dailyLimit;
  const spent = await monthSpend();
  if (spent >= ASK.monthlyBudgetUsd) return 0;
  if (spent >= ASK.monthlyBudgetUsd * 0.8) return Math.max(1, Math.floor(ASK.dailyLimit / 2));
  return ASK.dailyLimit;
}

const within = (ts: number[], now: number, win: number) => ts.filter((t) => now - t < win).sort((a, b) => a - b);
// When enough old entries age out of the window to free one slot.
const freeAt = (inWin: number[], limit: number, win: number) => new Date(inWin[inWin.length - limit] + win).toISOString();

export async function checkQuota(visitor: string, ip: string): Promise<Quota> {
  const daily = await effectiveDailyLimit();
  if (daily === 0) return { ok: false, reason: "paused" };
  const store = await getStore();
  const now = Date.now();
  const [v, i] = await Promise.all([store.get("askQuota", `v-${hash(visitor)}`), store.get("askQuota", `ip-${hash(ip)}`)]);
  const vt = (v?.ts as number[]) || [];
  const it = (i?.ts as number[]) || [];
  const day = within(vt, now, DAY);
  const week = within(vt, now, WEEK);
  const ipDay = within(it, now, DAY);
  const blocked: string[] = [];
  if (day.length >= daily) blocked.push(freeAt(day, daily, DAY));
  if (week.length >= ASK.weeklyLimit) blocked.push(freeAt(week, ASK.weeklyLimit, WEEK));
  if (ipDay.length >= ASK.ipDailyLimit) blocked.push(freeAt(ipDay, ASK.ipDailyLimit, DAY));
  // If several limits apply, the visitor waits for the latest one.
  if (blocked.length) return { ok: false, reason: "exhausted", retryAt: blocked.sort().at(-1)! };
  return { ok: true, remainingToday: Math.max(0, Math.min(daily - day.length, ASK.weeklyLimit - week.length)) };
}

/** Separate rolling 24h cap on guidance answers, inside the normal allowance. */
export async function guidanceAllowed(visitor: string) {
  const store = await getStore();
  const d = await store.get("askQuota", `g-${hash(visitor)}`);
  return within((d?.ts as number[]) || [], Date.now(), DAY).length < ASK.guidance.dailyLimit;
}

/** Record one AI answer against the visitor and their IP. Cached answers never call this. */
export async function spendQuota(visitor: string, ip: string, guidance = false) {
  const store = await getStore();
  const now = Date.now();
  for (const id of [`v-${hash(visitor)}`, `ip-${hash(ip)}`, ...(guidance ? [`g-${hash(visitor)}`] : [])]) {
    const d = await store.get("askQuota", id);
    const ts = within(((d?.ts as number[]) || []).concat(now), now, WEEK);
    await store.set("askQuota", id, { ts, updatedAt: new Date(now).toISOString() });
  }
}

/* ---------- cache ---------- */
export const cacheId = (norm: string, version: string) => hash(`${norm}|${version}`);

/** Cached answer, ignored once older than maxAgeMs (guidance answers include a web check that goes stale). */
export async function getCached(id: string, maxAgeMs = Infinity) {
  const store = await getStore();
  const d = await store.get("askCache", id);
  if (!d) return null;
  if (Date.now() - Date.parse(String(d.at || 0)) > maxAgeMs) return null;
  return d.body as Record<string, unknown>;
}
export async function setCached(id: string, body: unknown) {
  const store = await getStore();
  await store.set("askCache", id, { body, at: new Date().toISOString() });
}

/* ---------- cost ---------- */
type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
};

export function estimateCost(u: Usage = {}, p: { input: number; output: number; cacheWrite: number; cacheRead: number; webSearch: number } = ASK.price) {
  return (
    ((u.input_tokens || 0) * p.input + (u.output_tokens || 0) * p.output + (u.cache_creation_input_tokens || 0) * p.cacheWrite + (u.cache_read_input_tokens || 0) * p.cacheRead) / 1e6 +
    (u.server_tool_use?.web_search_requests || 0) * p.webSearch
  );
}

export async function logAsk(entry: { q: string; route: string; usd?: number; usage?: Usage }) {
  const store = await getStore();
  const at = new Date().toISOString();
  await store.set("askLog", `${at.replace(/[-:.TZ]/g, "")}-${Math.random().toString(36).slice(2, 8)}`, { ...entry, q: entry.q.slice(0, ASK.maxChars), at });
  if (entry.usd) {
    const key = `askSpend-${monthKey()}`;
    const d = await store.get("meta", key);
    const prev = (d?.value as { usd?: number; calls?: number } | undefined) || {};
    await store.set("meta", key, { value: { usd: (prev.usd || 0) + entry.usd, calls: (prev.calls || 0) + 1 }, updatedAt: at });
  }
}
