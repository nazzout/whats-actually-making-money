import { listCompanies } from "@/lib/data";
import { publicCompany } from "@/lib/public";

export const maxDuration = 30;

// "Ask anything" (HANDOFF.md section 9.7). Off unless ANTHROPIC_API_KEY is set; the app falls back to keyword search.
// Per-instance rate limit plus a short answer cache keep costs low.
const hits = new Map<string, number[]>();
const cache = new Map<string, { at: number; body: unknown }>();
const LIMIT = 10; // questions per IP per 10 minutes
const WINDOW = 10 * 60_000;

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "Ask is not enabled" }, { status: 404 });

  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= LIMIT) return Response.json({ error: "Too many questions. Try again shortly." }, { status: 429 });
  hits.set(ip, [...recent, now]);

  const { q } = (await req.json().catch(() => ({}))) as { q?: string };
  const question = String(q || "").trim().slice(0, 300);
  if (!question) return Response.json({ error: "Ask a question" }, { status: 400 });

  const companies = (await listCompanies()).map(publicCompany);
  const cacheKey = `${question.toLowerCase()}|${companies.map((c) => c.updatedAt).join(",")}`;
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < 3_600_000) return Response.json(hit.body);

  const data = companies.map((d) => ({
    id: d.id, name: d.name, form: d.form, customer: d.customer, model: d.model, digital: d.digital, aiRole: d.aiRole,
    trust: d.confidence, strength: d.strength, signal: d.signal, included: d.included,
    profitability: d.profitability, flags: d.flags, summary: d.summary, headline: d.evidence[0] || null,
  }));
  const system =
    "You help someone explore a research ledger of emerging companies. Each company has a trust score (0 to 5, how trustworthy the numbers are) and a business strength score (0 to 25). " +
    '"included" false means watchlist. Only use the data provided; never add outside facts. If the data cannot answer, say so plainly and suggest what to search instead. ' +
    "Write plainly. No em dashes, no jargon. " +
    'Respond with JSON only, no markdown: {"ids":["company ids that answer the question, most relevant first; empty if none"],"answer":"1 to 2 plain sentences answering from the data, mentioning trust where it matters"}';

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ASK_MODEL || "claude-haiku-4-5",
      max_tokens: 400,
      // The dataset is the same for every question, so cache it to cut cost and latency.
      system: [
        { type: "text", text: system },
        { type: "text", text: `DATA: ${JSON.stringify(data)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: `QUESTION: ${question}` }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (r.status === 429) return Response.json({ error: "Busy" }, { status: 429 });
  if (!r.ok) return Response.json({ error: "Ask failed" }, { status: 502 });
  const j = await r.json();
  const raw = (j.content || []).map((b: { text?: string }) => b.text || "").join("");
  let body: { ids: string[]; answer: string };
  try {
    body = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    body = { ids: [], answer: "Couldn't interpret that right now. Try a company name or a category." };
  }
  body.ids = (Array.isArray(body.ids) ? body.ids : []).filter((id) => companies.some((c) => c.id === id));
  cache.set(cacheKey, { at: now, body });
  return Response.json(body);
}
