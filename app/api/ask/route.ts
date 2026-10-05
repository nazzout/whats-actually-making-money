import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { listCompanies } from "@/lib/data";
import { publicCompany } from "@/lib/public";
import { datasetVersion } from "@/lib/version";
import { ASK, MSG, cacheId, checkQuota, estimateCost, getCached, logAsk, normalize, scopeOf, setCached, spendQuota } from "@/lib/ask";

export const maxDuration = 30;

// Public "ask anything". A navigation and synthesis layer over the dataset, not a general chatbot.
// Order matters: every cheap check runs before any model call.
//   1. length   2. deterministic scope   3. cache (free, no quota)   4. rolling quota   5. model
// Every response is 200 with a `mode`, so the client can always fall back to keyword search.
// mode: "ai" (model answer), "cached", "message" (fixed copy, show keyword results), "limit" (quota/paused).

const VISITOR = "mm_vid";
// Bump when SYSTEM changes so answers written under the old prompt are not served from cache.
const PROMPT_VERSION = "2";

const SYSTEM =
  "You answer questions for What Makes Money, a research dataset of businesses: their revenue, profitability, growth, business models, AI role and evidence quality. " +
  "Each company has a trust score (0 to 5, how reliable the financial evidence is) and a business strength score (0 to 25). included false means watchlist. " +
  "Use only the DATA provided. Never add outside facts, never guess figures, never browse. " +
  "Describe evidence by its exact tier. Only call a figure audited if its tier is Audited filing. Company financial statements, company-reported figures, press and estimates are not audited, so say what they are. " +
  "If the question is not about businesses, products, industries, business models, revenue, growth, pricing, distribution, AI role, momentum, comparisons, or what may be worth building, reply exactly {\"offTopic\":true}. " +
  "If the question is on topic but the DATA cannot answer it, reply exactly {\"insufficient\":true}. " +
  "Otherwise answer in 2 to 5 short plain sentences. No jargon, no filler, no em dashes, do not repeat the question. Mention trust where it matters and state uncertainty directly. " +
  'Respond with JSON only, no markdown: {"ids":["matching company ids, most relevant first"],"answer":"..."}';

const clean = (s: string) => s.replace(/\s*[\u2014\u2013]\s*/g, ", ").trim();

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  const { q } = (await req.json().catch(() => ({}))) as { q?: string };
  const raw = String(q || "").trim();
  if (!raw) return Response.json({ mode: "message", answer: "Ask a question about the companies in the dataset." });

  // 1. Length, enforced before anything else and never sent to a model.
  if ([...raw].length > ASK.maxChars) return Response.json({ mode: "message", reason: "too_long", answer: MSG.tooLong });

  const companies = (await listCompanies()).map(publicCompany);

  // 2. Deterministic scope check. Clear off-topic input never reaches a model.
  if (scopeOf(raw, companies.map((c) => c.name)) === "off") {
    await logAsk({ q: raw, route: "off_topic_rule" });
    return Response.json({ mode: "message", reason: "off_topic", answer: MSG.offTopic });
  }
  if (!key) return Response.json({ mode: "limit", reason: "disabled", answer: MSG.paused });

  // 3. Cache by normalized question + dataset version. A hit costs nothing and uses no quota.
  const norm = normalize(raw);
  const cid = cacheId(norm, `${datasetVersion(companies)}:p${PROMPT_VERSION}`);
  const hit = await getCached(cid);
  if (hit) {
    await logAsk({ q: raw, route: "cache" });
    return Response.json({ ...hit, mode: hit.mode === "ai" ? "cached" : hit.mode });
  }

  // 4. Rolling 24h / 7d allowance per anonymous visitor, with IP as a secondary signal.
  const jar = await cookies();
  let visitor = jar.get(VISITOR)?.value;
  if (!visitor) {
    visitor = randomUUID();
    jar.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: !!process.env.VERCEL, path: "/", maxAge: 60 * 60 * 24 * 400 });
  }
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const quota = await checkQuota(visitor, ip);
  if (!quota.ok) {
    await logAsk({ q: raw, route: `limit_${quota.reason}` });
    return Response.json(
      quota.reason === "paused"
        ? { mode: "limit", reason: "paused", answer: MSG.paused }
        : { mode: "limit", reason: "exhausted", answer: MSG.exhausted, retryAt: quota.retryAt },
    );
  }

  // 5. One cheap model call, dataset only, strict output budget.
  const data = companies.map((d) => ({
    id: d.id, name: d.name, form: d.form, customer: d.customer, model: d.model, digital: d.digital, aiRole: d.aiRole,
    trust: d.confidence, strength: d.strength, signal: d.signal, included: d.included,
    profitability: d.profitability, flags: d.flags, summary: d.summary,
    industry: d.industry, ecosystemRole: d.ecosystemRole, tags: d.tags, entityType: d.entityType, parentCompany: d.parentCompany,
    evidence: d.evidence.slice(0, 4).map((e) => ({ metric: e.metric, value: e.value, period: e.period, type: e.type, tier: e.tier, selfReported: e.selfReported })),
  }));

  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ASK.model,
        max_tokens: ASK.maxTokens,
        system: [
          { type: "text", text: SYSTEM },
          // Identical for every question until the dataset changes, so it is cached.
          { type: "text", text: `DATA: ${JSON.stringify(data)}`, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: `QUESTION: ${raw}` }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json({ mode: "limit", reason: "unavailable", answer: "AI answers are unavailable right now. Showing search results instead." });
  }
  if (!r.ok) return Response.json({ mode: "limit", reason: r.status === 429 ? "busy" : "unavailable", answer: "AI answers are busy right now. Showing search results instead." });

  const j = await r.json();
  const usd = estimateCost(j.usage);
  await spendQuota(visitor, ip);

  const text = (j.content || []).map((b: { text?: string }) => b.text || "").join("");
  let parsed: { ids?: unknown; answer?: unknown; offTopic?: boolean; insufficient?: boolean } = {};
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    /* falls through to the no-data message */
  }

  let body: Record<string, unknown>;
  if (parsed.offTopic) body = { mode: "message", reason: "off_topic", answer: MSG.offTopic };
  else if (parsed.insufficient || typeof parsed.answer !== "string" || !parsed.answer.trim()) body = { mode: "message", reason: "no_data", answer: MSG.noData };
  else {
    const ids = (Array.isArray(parsed.ids) ? parsed.ids : []).filter((id): id is string => typeof id === "string" && companies.some((c) => c.id === id));
    body = { mode: "ai", answer: clean(parsed.answer), ids };
  }

  await setCached(cid, body);
  await logAsk({ q: raw, route: `model_${body.reason || "answer"}`, usd, usage: j.usage });
  return Response.json({ ...body, remainingToday: Math.max(0, quota.remainingToday - 1) });
}
