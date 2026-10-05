import { z } from "zod";
import { listCompanies, newId } from "./data";
import { getStore } from "./store";
import { ENTITY_TYPES, INDUSTRIES } from "./schema";

// Businesses we've heard of but haven't researched yet. Candidates never appear on the public board.
// Discovery creates them; deep research turns qualified ones into new_company proposals.

export const CANDIDATE_STATUSES = ["discovered", "qualifying", "research_needed", "qualified", "proposed", "published", "rejected", "watch_later"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

const url = z.string().trim().regex(/^https?:\/\//i, "Must start with http:// or https://");

export const CandidateInput = z.object({
  name: z.string().trim().min(1).max(120),
  website: url.optional(),
  entityType: z.enum(ENTITY_TYPES).default("company"),
  parentCompany: z.string().trim().min(1).max(120).optional(),
  industry: z.enum(INDUSTRIES).optional(),
  whyInteresting: z.string().trim().min(3).max(600),
  trendNotes: z.string().trim().max(600).default(""),
  discoveredFrom: z.object({ source: z.string().trim().min(1).max(120), url: url.optional(), lane: z.string().trim().max(60).optional() }),
}).refine((c) => c.entityType !== "product" || !!c.parentCompany, { message: "A product candidate needs parentCompany.", path: ["parentCompany"] });
export type CandidateInputT = z.infer<typeof CandidateInput>;

export type Candidate = CandidateInputT & {
  id: string;
  status: CandidateStatus;
  discoveredAt: string;
  dupChecks: { against: string; kind: "company" | "candidate"; reason: string }[];
  related: { id: string; kind: "company" | "candidate"; note: string }[];
  history: { status: CandidateStatus; at: string; by: string; note?: string }[];
  proposalId?: string;
  companyId?: string;
  updatedAt: string;
};

/* ---------- normalization ---------- */
const SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|sa|ag|plc|bv|oy|ab|technologies|technology|labs|studios?|app|hq|ai)\b/g;
export const normName = (n: string) =>
  n
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
// Storefronts host many unrelated products, so their domain alone says nothing about identity.
const STOREFRONTS = /(^|\.)(steampowered\.com|apps\.apple\.com|play\.google\.com|epicgames\.com|gog\.com|itch\.io|amazon\.[a-z.]+|kickstarter\.com|etsy\.com|shopify\.com)$/;
/**
 * Identity key for a website. Normally the full hostname without www, so products on subdomains
 * (gemini.google.com) stay distinct from their parent (google.com). On storefronts it is the page path
 * (store.steampowered.com/app/3164500), so two different Steam games never collide; a bare storefront root is no key at all.
 */
export const hostKey = (u?: string) => {
  if (!u) return "";
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!STOREFRONTS.test(host)) return host;
    const steam = host.endsWith("steampowered.com") && url.pathname.match(/\/app\/(\d+)/);
    if (steam) return `${host}/app/${steam[1]}`;
    // The same App Store app appears under every country path (/us/, /gb/); the numeric id is stable.
    const apple = host === "apps.apple.com" && url.pathname.match(/\/id(\d+)/);
    if (apple) return `apps.apple.com/id${apple[1]}`;
    const play = host === "play.google.com" && url.searchParams.get("id");
    if (play) return `play.google.com/${play.toLowerCase()}`;
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    return path && path !== "/" ? `${host}${path}` : "";
  } catch {
    return "";
  }
};

type Entity = { id: string; name: string; website?: string; entityType?: string; kind: "company" | "candidate"; status?: string };

/**
 * Deterministic duplicate check, no model. First line of defense.
 * - Same normalized name: duplicate.
 * - Same hostname and same entity type: duplicate.
 * - Same hostname but a different entity type and a different name (a product hosted on its parent's domain): allowed, recorded as related.
 * Rejected candidates still count, so a rejected business is not rediscovered every week.
 */
export async function findDuplicates(input: { name: string; website?: string; entityType?: string }) {
  const store = await getStore();
  const [companies, candidates] = await Promise.all([listCompanies(), store.list("candidates")]);
  const pool: Entity[] = [
    ...companies.map((c) => ({ id: c.id, name: c.name, website: c.website, entityType: c.entityType || "company", kind: "company" as const })),
    ...candidates.map((c) => ({ id: c.id, name: String(c.name), website: c.website as string | undefined, entityType: String(c.entityType || "company"), kind: "candidate" as const, status: String(c.status) })),
  ];
  const n = normName(input.name);
  const h = hostKey(input.website);
  const type = input.entityType || "company";
  const duplicates: { id: string; kind: Entity["kind"]; reason: string }[] = [];
  const related: { id: string; kind: Entity["kind"]; note: string }[] = [];
  const checked: { against: string; kind: Entity["kind"]; reason: string }[] = [];
  for (const e of pool) {
    const sameName = !!n && normName(e.name) === n;
    const sameHost = !!h && hostKey(e.website) === h;
    if (sameName) duplicates.push({ id: e.id, kind: e.kind, reason: `same name as "${e.name}"${e.status ? ` (${e.status})` : ""}` });
    else if (sameHost && e.entityType === type) duplicates.push({ id: e.id, kind: e.kind, reason: `same website as "${e.name}"${e.status ? ` (${e.status})` : ""}` });
    else if (sameHost) related.push({ id: e.id, kind: e.kind, note: `shares ${h} with "${e.name}" (${e.entityType} vs ${type})` });
    if (sameName || sameHost) checked.push({ against: e.id, kind: e.kind, reason: sameName ? "name" : "website" });
  }
  return { duplicates, related, checked };
}

export async function proposeCandidate(raw: unknown) {
  const input = CandidateInput.parse(raw);
  const { duplicates, related, checked } = await findDuplicates(input);
  if (duplicates.length) return { created: false as const, duplicates };
  const now = new Date().toISOString();
  const c: Candidate = {
    ...input,
    id: newId(),
    status: "discovered",
    discoveredAt: now,
    dupChecks: checked,
    related,
    history: [{ status: "discovered", at: now, by: input.discoveredFrom.lane || input.discoveredFrom.source }],
    updatedAt: now,
  };
  const store = await getStore();
  await store.set("candidates", c.id, c);
  return { created: true as const, candidate: c };
}

export async function listCandidates(status?: CandidateStatus, limit = 200) {
  const store = await getStore();
  return (await store.list("candidates", { where: status ? [["status", status]] : [], orderBy: "id", desc: true, limit })) as unknown as Candidate[];
}

export async function getCandidate(id: string) {
  const store = await getStore();
  return (await store.get("candidates", id)) as unknown as Candidate | null;
}

// Agents move candidates through research. "published" is only set by the system when the company is approved.
const AGENT_ALLOWED: CandidateStatus[] = ["qualifying", "research_needed", "qualified", "rejected", "watch_later"];

export async function setCandidateStatus(id: string, status: CandidateStatus, by: string, note = "", extra: Partial<Candidate> = {}, system = false) {
  if (!system && !AGENT_ALLOWED.includes(status)) throw new Error(`Status "${status}" is set automatically, not by hand.`);
  const c = await getCandidate(id);
  if (!c) throw new Error(`No candidate with id "${id}".`);
  if (c.status === "published") throw new Error("This candidate is already published.");
  const at = new Date().toISOString();
  const store = await getStore();
  await store.update("candidates", id, { ...extra, status, updatedAt: at, history: [...(c.history || []), { status, at, by, ...(note ? { note } : {}) }] });
  return { ...c, ...extra, status };
}
