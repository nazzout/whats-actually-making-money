import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { listCompanies } from "@/lib/data";
import { publicCompany } from "@/lib/public";
import { datasetVersion } from "@/lib/version";
import {
  ASK, MSG, cacheId, checkQuota, estimateCost, estimateGuidanceCost, getCached, guidanceAllowed, isGuidance, logAsk, normalize, scopeOf, setCached, spendQuota,
} from "@/lib/ask";

export const maxDuration = 45;

// Public "ask anything". A navigation and synthesis layer over the dataset, not a general chatbot.
// Order matters: every cheap check runs before any model call.
//   1. length   2. deterministic scope   3. cache (free, no quota)   4. rolling quota   5. one model call
// Two modes, chosen by code, never by a model:
//   dataset  - factual questions. Haiku, dataset only, no browsing.
//   guidance - "what should I build / where is the opportunity". Sonnet, dataset first, plus a web check hard-capped
//              by the API's max_uses inside ONE request. No loop, no fetches, short answer. Falls back to dataset mode
//              when the guidance sub-cap is used up or the pre-flight cost estimate is over the per-question limit.
// Every response is 200 with a `mode`, so the client can always fall back to keyword search.

const VISITOR = "mm_vid";
// Bump when a prompt changes so answers written under the old prompt are not served from cache.
const PROMPT_VERSION = "4";

const BASE =
  "You answer questions for What Makes Money, a research dataset of businesses: their revenue, profitability, growth, business models, AI role and evidence quality. " +
  "Each company has a trust score (0 to 5, how reliable the financial evidence is) and a business strength score (0 to 25). included false means watchlist. " +
  "Describe evidence by its exact tier. Only call a figure audited if its tier is Audited filing. A profitability note starting \"Verified loss\" is a verified loss, not profit. " +
  "No jargon, no filler, no em dashes, do not repeat the question. Mention trust where it matters and state uncertainty directly. ";

const DATASET_SYSTEM =
  BASE +
  "Use only the DATA provided. Never add outside facts, never guess figures, never browse. " +
  "If the question is not about businesses, products, industries, business models, revenue, growth, pricing, distribution, AI role, momentum, comparisons, or what may be worth building, reply exactly {\"offTopic\":true}. " +
  "If the question is on topic but the DATA cannot answer it, reply exactly {\"insufficient\":true}. " +
  "Otherwise answer in 2 to 5 short plain sentences. " +
  'Respond with JSON only, no markdown: {"ids":["matching company ids, most relevant first"],"answer":"..."}';

const GUIDANCE_SYSTEM =
  BASE +
  "The user is asking what might be worth building, or where there is opportunity. Give grounded, practical guidance. " +
  "The DATA is your primary evidence: point to the patterns it shows (business models, product forms, team size, distribution, what is verified versus claimed) and name the relevant companies. " +
  "You may use web search for a quick market check only, such as competition, demand or pricing in a specific niche. Search only if it materially improves the answer. " +
  "Treat web figures as unverified context, never as verified revenue, and never present them as part of the dataset. " +
  "This is guidance, not a prediction of success: say what the evidence suggests and what it does not show. " +
  "Answer in at most 4 short plain sentences and under 110 words, plain text, no lists, no headings, no markdown. " +
  "If the question is not about businesses, products, industries or what to build, reply exactly OFF_TOPIC and nothing else.";

const clean = (s: string) => s.replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ").trim();

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

  // 3. Cache by normalized question + dataset version + mode. A hit costs nothing and uses no quota.
  // Guidance answers include a web check, so they expire after a few days even if the dataset has not changed.
  const wantsGuidance = isGuidance(raw);
  const norm = normalize(raw);
  const version = `${datasetVersion(companies)}:p${PROMPT_VERSION}`;
  const gid = cacheId(norm, `${version}:guidance`);
  const did = cacheId(norm, version);
  const hit = (wantsGuidance ? await getCached(gid, ASK.guidance.cacheDays * 864e5) : null) || (await getCached(did));
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

  const data = companies.map((d) => ({
    id: d.id, name: d.name, form: d.form, customer: d.customer, model: d.model, digital: d.digital, aiRole: d.aiRole,
    trust: d.confidence, strength: d.strength, signal: d.signal, included: d.included,
    profitability: d.profitability, flags: d.flags, summary: d.summary,
    industry: d.industry, ecosystemRole: d.ecosystemRole, tags: d.tags, entityType: d.entityType, parentCompany: d.parentCompany,
    evidence: d.evidence.slice(0, 4).map((e) => ({ metric: e.metric, value: e.value, period: e.period, type: e.type, tier: e.tier, selfReported: e.selfReported })),
  }));
  const dataText = `DATA: ${JSON.stringify(data)}`;

  // 5. Pick the mode. Guidance only if the sub-cap allows it and the worst-case estimate is under the limit.
  let mode: "dataset" | "guidance" = "dataset";
  let downgraded = "";
  if (wantsGuidance) {
    if (!(await guidanceAllowed(visitor))) downgraded = "guidance_cap";
    else if (estimateGuidanceCost(GUIDANCE_SYSTEM.length + dataText.length + raw.length) > ASK.guidance.maxUsd) downgraded = "guidance_cost";
    else mode = "guidance";
  }

  const g = ASK.guidance;
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: mode === "guidance" ? g.model : ASK.model,
        max_tokens: mode === "guidance" ? g.maxTokens : ASK.maxTokens,
        system: [
          { type: "text", text: mode === "guidance" ? GUIDANCE_SYSTEM : DATASET_SYSTEM },
          // Identical for every question until the dataset changes, so it is cached.
          { type: "text", text: dataText, cache_control: { type: "ephemeral" } },
        ],
        // The search cap is enforced by the API inside this single request. There is no tool loop on our side.
        ...(mode === "guidance" && g.maxSearches > 0 ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: g.maxSearches }] } : {}),
        // Sonnet 5.5 thinks before answering by default, and thinking spends the 250-token budget before any text.
        // "between_tools" is this model's no-thinking setting.
        ...(mode === "guidance" ? { thinking: { type: "between_tools" } } : {}),
        messages: [{ role: "user", content: `QUESTION: ${raw}` }],
      }),
      signal: AbortSignal.timeout(mode === "guidance" ? 40_000 : 15_000),
    });
  } catch {
    return Response.json({ mode: "limit", reason: "unavailable", answer: "AI answers are unavailable right now. Showing search results instead." });
  }
  if (!r.ok) return Response.json({ mode: "limit", reason: r.status === 429 ? "busy" : "unavailable", answer: "AI answers are busy right now. Showing search results instead." });

  const j = await r.json();
  const usd = estimateCost(j.usage, mode === "guidance" ? g.price : ASK.price);
  await spendQuota(visitor, ip, mode === "guidance");

  type Block = { type: string; text?: string; citations?: { url?: string; title?: string }[] };
  const blocks: Block[] = j.content || [];
  let text = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("");
  // If the output cap cut the answer off, end it at the last complete sentence rather than mid-word.
  if (j.stop_reason === "max_tokens" && mode === "guidance") {
    const end = Math.max(text.lastIndexOf(". "), text.lastIndexOf(".\n"), text.endsWith(".") ? text.length - 1 : -1);
    if (end > 40) text = text.slice(0, end + 1);
  }
  let body: Record<string, unknown>;

  if (mode === "guidance") {
    if (/^\s*OFF_TOPIC\s*$/.test(text)) body = { mode: "message", reason: "off_topic", answer: MSG.offTopic };
    else if (!text.trim()) body = { mode: "message", reason: "no_data", answer: MSG.noData };
    else {
      // Companies named in the answer become clickable results; cited web pages are listed as sources.
      const lower = text.toLowerCase();
      const ids = companies.filter((c) => lower.includes(c.name.toLowerCase())).map((c) => c.id);
      const seen = new Set<string>();
      const sources: { url: string; title: string }[] = [];
      for (const b of blocks)
        for (const c of b.citations || [])
          if (c.url && !seen.has(c.url) && sources.length < 3) {
            seen.add(c.url);
            sources.push({ url: c.url, title: c.title || new URL(c.url).hostname });
          }
      body = { mode: "ai", kind: "guidance", answer: clean(text), ids, sources };
    }
  } else {
    let parsed: { ids?: unknown; answer?: unknown; offTopic?: boolean; insufficient?: boolean } = {};
    try {
      parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch {
      /* falls through to the no-data message */
    }
    if (parsed.offTopic) body = { mode: "message", reason: "off_topic", answer: MSG.offTopic };
    else if (parsed.insufficient || typeof parsed.answer !== "string" || !parsed.answer.trim()) body = { mode: "message", reason: "no_data", answer: MSG.noData };
    else {
      const ids = (Array.isArray(parsed.ids) ? parsed.ids : []).filter((id): id is string => typeof id === "string" && companies.some((c) => c.id === id));
      body = { mode: "ai", kind: "dataset", answer: clean(parsed.answer), ids };
    }
  }

  // An empty guidance result is a failure, not an answer: never cache it for a week.
  if (!(mode === "guidance" && body.reason === "no_data")) await setCached(mode === "guidance" ? gid : did, body);
  await logAsk({
    q: raw,
    route: `${mode}_${body.reason || "answer"}${downgraded ? `_${downgraded}` : ""}`,
    usd,
    usage: j.usage,
  });
  return Response.json({ ...body, remainingToday: Math.max(0, quota.remainingToday - 1) });
}
