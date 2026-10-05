import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { CompanySchema, stripComputed, type Company } from "./schema";
import { canonicalTags } from "./tags";

export type Actor = { actor: string; reason: string; source?: string; proposalId?: string };
export type ChangeEntry = {
  id: string;
  companyId: string;
  field: string;
  before: unknown;
  after: unknown;
  reason: string;
  source: string;
  actor: string;
  proposalId: string | null;
  createdAt: string;
};

// Short in-memory cache so public pages don't read every document on every visit.
// Writes in this instance clear it; other instances pick up changes within TTL.
const TTL = 30_000;
let cache: { at: number; rows: Company[] } | null = null;
export const invalidate = () => {
  cache = null;
};

export async function listCompanies(): Promise<Company[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const store = await getStore();
  const rows = (await store.list("companies")) as unknown as Company[];
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getCompany(id: string): Promise<Company | null> {
  const store = await getStore();
  return (await store.get("companies", id)) as unknown as Company | null;
}

export const newId = () => `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomUUID().slice(0, 8)}`;

// Key order differs between stored documents and parsed objects, so compare with sorted keys.
export const stable = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v ?? null);
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

export function diffCompany(before: Partial<Company> | null, after: Partial<Company>) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after)]);
  keys.delete("updatedAt");
  keys.delete("id");
  const out: { field: string; before: unknown; after: unknown }[] = [];
  for (const k of keys) {
    const b = (before as Record<string, unknown> | null)?.[k];
    const a = (after as Record<string, unknown>)[k];
    if (!same(b, a)) out.push({ field: k, before: b ?? null, after: a ?? null });
  }
  return out;
}

async function log(companyId: string, changes: { field: string; before: unknown; after: unknown }[], who: Actor) {
  const store = await getStore();
  const createdAt = new Date().toISOString();
  for (const ch of changes) {
    const e: ChangeEntry = {
      id: newId(),
      companyId,
      ...ch,
      reason: who.reason,
      source: who.source || "",
      actor: who.actor,
      proposalId: who.proposalId || null,
      createdAt,
    };
    await store.set("changeLog", e.id, e);
  }
}

/** Reuse existing tag spellings so agents and edits don't create near-duplicates ("Creator tools" vs "Creators"). */
export async function withCanonicalTags<T extends Record<string, unknown>>(rec: T, selfId?: string): Promise<T> {
  if (rec.tags == null) return rec;
  const others = (await listCompanies()).filter((c) => c.id !== selfId).flatMap((c) => c.tags || []);
  return { ...rec, tags: canonicalTags(rec.tags, others) };
}

/** Validate, write and log a full company record. Returns the changed fields. */
export async function saveCompany(input: unknown, who: Actor) {
  const raw = stripComputed((input || {}) as Record<string, unknown>);
  const parsed = CompanySchema.parse(await withCanonicalTags(raw, typeof raw.id === "string" ? raw.id : undefined));
  const store = await getStore();
  const before = await getCompany(parsed.id);
  const after: Company = { ...parsed, updatedAt: new Date().toISOString() };
  const changes = diffCompany(before, after);
  if (!changes.length) return { company: before as Company, changes };
  await store.set("companies", after.id, after);
  await log(after.id, before ? changes : [{ field: "_created", before: null, after: after.name }], who);
  invalidate();
  return { company: after, changes };
}

export async function deleteCompany(id: string, who: Actor) {
  const store = await getStore();
  const before = await getCompany(id);
  if (!before) return false;
  await store.remove("companies", id);
  await log(id, [{ field: "_deleted", before, after: null }], who);
  invalidate();
  return true;
}

export async function listChangeLog(companyId?: string, limit = 200) {
  const store = await getStore();
  return (await store.list("changeLog", {
    where: companyId ? [["companyId", companyId]] : [],
    orderBy: "id",
    desc: true,
    limit,
  })) as unknown as ChangeEntry[];
}
