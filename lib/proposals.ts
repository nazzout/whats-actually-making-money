import { z } from "zod";
import { getStore } from "./store";
import { diffCompany, getCompany, newId, saveCompany, stable, withCanonicalTags } from "./data";
import { CompanyPatchSchema, CompanySchema, EvidenceSchema, slugify, stripComputed, type Company, type Evidence } from "./schema";
import { derive } from "./rubric";
import { getCandidate, setCandidateStatus } from "./candidates";
import { companyRules, conflictCheck, evidenceRules, sourceChecks, type CheckResult } from "./validators";

export const KINDS = ["new_company", "update", "add_evidence", "recheck_result"] as const;
export type Kind = (typeof KINDS)[number];
export type Status = "validating" | "pending" | "approved" | "rejected" | "auto_published";

export const ProposalInput = z.object({
  kind: z.enum(KINDS),
  companyId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(3, "Give a short reason"),
  sourceUrls: z.array(z.string().url()).default([]),
  proposedBy: z.string().trim().max(80).default("agent"),
  // Set when a new_company proposal comes out of the candidates pipeline.
  candidateId: z.string().trim().max(80).optional(),
});
export type ProposalInputT = z.infer<typeof ProposalInput>;

export type Proposal = ProposalInputT & {
  id: string;
  companyId: string;
  status: Status;
  checks: CheckResult[];
  reviewReasons: string[];
  diff: { field: string; before: unknown; after: unknown }[];
  scoreBefore: { confidence: number; strength: number; signal: number; included: boolean } | null;
  scoreAfter: { confidence: number; strength: number; signal: number; included: boolean };
  createdAt: string;
  decidedAt?: string;
  reviewerNotes?: string;
};

const AddEvidencePayload = z.object({ evidence: z.array(EvidenceSchema).min(1), headline: z.boolean().default(false) });
const RecheckPayload = z.object({
  confirmed: z.boolean(),
  notes: z.string().default(""),
  evidence: z.array(EvidenceSchema).default([]),
  patch: CompanyPatchSchema.optional(),
});

/**
 * Keep only the fields the sender actually provided.
 * CompanyPatchSchema is a partial of CompanySchema, but zod still fills .default() fields (summary "", evidence [],
 * flags [] ...) for keys that were never sent. Spreading that over the stored record silently wiped data.
 */
function onlyProvided<T extends Record<string, unknown>>(parsed: T, raw: unknown): Partial<T> {
  const sent = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => Object.prototype.hasOwnProperty.call(sent, k))) as Partial<T>;
}

const evKey = (e: Evidence) => `${e.url}|${e.metric}|${e.period}`;
const score = (c: Company) => {
  const d = derive(c);
  return { confidence: d.confidence, strength: d.strength, signal: d.signal, included: d.included };
};

/** Build the full candidate record a proposal would produce, plus which evidence rows are new or changed. */
export async function buildCandidate(p: ProposalInputT) {
  // Canonical tags first, so the diff and validators see the spelling that would actually be saved.
  const payload = await withCanonicalTags(stripComputed(p.payload), p.companyId);
  if (p.kind === "new_company") {
    const id = (payload.id as string) || slugify(String(payload.name || ""));
    const before = await getCompany(id);
    if (before) throw new Error(`A company with id "${id}" already exists. Use kind "update".`);
    // A company researched from a candidate inherits where it was discovered, unless the payload says otherwise.
    const cand = p.candidateId ? await getCandidate(p.candidateId) : null;
    if (p.candidateId && !cand) throw new Error(`No candidate with id "${p.candidateId}".`);
    const fromCandidate = cand
      ? {
          discoveredFrom: { ...cand.discoveredFrom, candidateId: cand.id },
          discoveredAt: cand.discoveredAt,
          entityType: cand.entityType,
          ...(cand.parentCompany ? { parentCompany: cand.parentCompany } : {}),
        }
      : {};
    const after = CompanySchema.parse({ ...fromCandidate, ...payload, id });
    return { id, before: null, after, changed: after.evidence.map((_, i) => i) };
  }
  const id = p.companyId || "";
  const before = await getCompany(id);
  if (!before) throw new Error(`No company with id "${id}".`);
  const now = new Date().toISOString();

  if (p.kind === "update") {
    const patch = onlyProvided(CompanyPatchSchema.parse(payload), payload);
    const after = CompanySchema.parse({ ...before, ...patch, id });
    const old = new Set(before.evidence.map((e) => stable(e)));
    const changed = after.evidence.map((e, i) => (old.has(stable(e)) ? -1 : i)).filter((i) => i >= 0);
    return { id, before, after, changed };
  }

  if (p.kind === "add_evidence") {
    const { evidence, headline } = AddEvidencePayload.parse(payload);
    const list = headline ? [...evidence, ...before.evidence] : [...before.evidence, ...evidence];
    const after = CompanySchema.parse({ ...before, evidence: list });
    const changed = evidence.map((_, i) => (headline ? i : before.evidence.length + i));
    return { id, before, after, changed };
  }

  // recheck_result
  const r = RecheckPayload.parse(payload);
  const byKey = new Map(r.evidence.map((e) => [evKey(e), e]));
  let list: Evidence[] = before.evidence.map((e): Evidence => {
    const upd = byKey.get(evKey(e));
    return upd ? { ...e, ...upd, lastCheckedAt: now, lastCheckStatus: "confirmed" } : { ...e, lastCheckedAt: now, lastCheckStatus: r.confirmed ? "confirmed" : "needs review" };
  });
  const known = new Set(before.evidence.map(evKey));
  const added = r.evidence.filter((e) => !known.has(evKey(e)));
  list = [...list, ...added];
  // Same rule for a re-check patch: an omitted evidence field must not become an empty list.
  const patch = r.patch ? onlyProvided(r.patch, (payload as { patch?: unknown }).patch) : {};
  const after = CompanySchema.parse({ ...before, ...patch, evidence: patch.evidence || list, id });
  const changed = added.map((_, i) => before.evidence.length + i);
  return { id, before, after, changed };
}

const LOG_ONLY_FIELDS = new Set(["lastCheckedAt", "lastCheckStatus"]);

/** Section 9.4 publish policy. Returns reasons the owner must review; empty means auto-publish. */
function reviewReasons(p: ProposalInputT, before: Company | null, after: Company, checks: CheckResult[], changed: number[]) {
  const r: string[] = [];
  if (p.kind === "new_company") r.push("New company");
  if (before) {
    const a = score(before);
    const b = score(after);
    if (a.confidence !== b.confidence || a.strength !== b.strength) r.push("Score change");
  }
  for (const i of changed) {
    const e = after.evidence[i];
    if (e.selfReported) r.push(`Evidence ${i + 1} is self-reported`);
    if (e.tier === "Founder post") r.push(`Evidence ${i + 1} is a founder post`);
  }
  if ((changed.length || p.kind === "new_company") && after.evidence.length <= 1) r.push("Single source");
  if (p.kind === "recheck_result" && p.payload.confirmed === false) r.push("Re-check did not confirm the figures");
  if (checks.some((c) => c.level === "fail")) r.push("A validator failed");
  if (checks.some((c) => c.level === "warn")) r.push("A validator raised a warning");
  if (before) {
    // Anything beyond evidence, links and re-check notes needs a human.
    const allowed = new Set(["evidence", "website", "recheck", "icon"]);
    const fields = diffCompany(before, after).map((d) => d.field);
    const other = fields.filter((f) => !allowed.has(f));
    if (other.length) r.push(`Changes ${other.join(", ")}`);
    if (fields.includes("evidence") && before.evidence.length > after.evidence.length) r.push("Removes evidence");
  }
  return [...new Set(r)];
}

/** Fast checks at submission time. Throws on schema errors so the agent gets a 400. */
export async function submitProposal(input: unknown) {
  const p = ProposalInput.parse(input);
  const { id, before, after, changed } = await buildCandidate(p);
  const checks = [...evidenceRules(after.evidence, changed), ...companyRules(after, !before)];
  const proposal: Proposal = {
    ...p,
    id: newId(),
    companyId: id,
    status: "validating",
    checks,
    reviewReasons: [],
    diff: diffCompany(before, after),
    scoreBefore: before ? score(before) : null,
    scoreAfter: score(after),
    createdAt: new Date().toISOString(),
  };
  const store = await getStore();
  await store.set("proposals", proposal.id, proposal);
  if (p.kind === "new_company" && p.candidateId) {
    await setCandidateStatus(p.candidateId, "proposed", p.proposedBy, "new_company proposal submitted", { proposalId: proposal.id, companyId: id }, true);
  }
  return proposal;
}

/** Slow checks (network) and the publish decision. Run after the response is sent. */
export async function finishProposal(id: string) {
  const store = await getStore();
  const p = (await store.get("proposals", id)) as unknown as Proposal | null;
  if (!p || p.status !== "validating") return;
  try {
    const { before, after, changed } = await buildCandidate(p);
    const slow = [...(await sourceChecks(after.evidence, changed)), ...conflictCheck(before, after, changed)];
    const checks = [...p.checks, ...slow];
    const reasons = reviewReasons(p, before, after, checks, changed);
    if (checks.some((c) => c.rule === "conflict")) reasons.push("Conflicting figures");
    if (!reasons.length) {
      await apply(p, "auto");
      await store.update("proposals", id, { checks, reviewReasons: [], status: "auto_published", decidedAt: new Date().toISOString() });
    } else {
      await store.update("proposals", id, { checks, reviewReasons: [...new Set(reasons)], status: "pending" });
    }
  } catch (e) {
    await store.update("proposals", id, {
      status: "pending",
      reviewReasons: ["Validation error"],
      checks: [...p.checks, { rule: "error", level: "fail", message: e instanceof Error ? e.message : "Validation error" }],
    });
  }
}

/** Publish a proposal: rebuild against the current record (it may have changed since submission), save and log. */
async function apply(p: Proposal, how: "auto" | "owner") {
  const { after, before, changed } = await buildCandidate(p);
  let final = after;
  if (before && conflictCheck(before, after, changed).length && !final.flags.includes("Conflicting figures")) {
    final = { ...final, flags: [...final.flags, "Conflicting figures"] };
  }
  const strip = (list: Evidence[]) => stable(list.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !LOG_ONLY_FIELDS.has(k)))));
  const allLogOnly = before && diffCompany(before, final).every((d) => d.field === "evidence") && strip(before.evidence) === strip(final.evidence);
  await saveCompany(final, {
    actor: `${how === "auto" ? "auto" : "owner"}:${p.proposedBy}`,
    reason: allLogOnly ? `Re-check confirmed. ${p.reason}` : p.reason,
    source: p.sourceUrls.join(" "),
    proposalId: p.id,
  });
  if (p.kind === "new_company" && p.candidateId) {
    await setCandidateStatus(p.candidateId, "published", how === "auto" ? "auto" : "owner", "company published", { companyId: final.id }, true);
  }
  if (p.kind === "recheck_result") {
    const store = await getStore();
    const open = await store.list("checks", { where: [["companyId", p.companyId], ["status", "open"]] });
    for (const c of open) await store.update("checks", c.id, { status: "resolved", resolvedBy: p.id });
  }
}

export async function decide(id: string, action: "approve" | "reject", notes = "") {
  const store = await getStore();
  const p = (await store.get("proposals", id)) as unknown as Proposal | null;
  if (!p) throw new Error("Proposal not found");
  if (p.status !== "pending" && p.status !== "validating") throw new Error(`Already ${p.status}`);
  if (action === "approve") await apply(p, "owner");
  // A rejected company stays rejected as a candidate, so discovery does not keep resurfacing it.
  if (action === "reject" && p.kind === "new_company" && p.candidateId) {
    await setCandidateStatus(p.candidateId, "rejected", "owner", notes || "new_company proposal rejected", {}, true).catch(() => {});
  }
  await store.update("proposals", id, { status: action === "approve" ? "approved" : "rejected", reviewerNotes: notes, decidedAt: new Date().toISOString() });
}

export async function listProposals(status?: Status, limit = 100) {
  const store = await getStore();
  return (await store.list("proposals", { where: status ? [["status", status]] : [], orderBy: "id", desc: true, limit })) as unknown as Proposal[];
}

export async function getProposal(id: string) {
  const store = await getStore();
  return (await store.get("proposals", id)) as unknown as Proposal | null;
}
