import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { isAgent, unauthorized } from "@/lib/auth";
import { getCompany, listChangeLog, listCompanies } from "@/lib/data";
import { publicCompany } from "@/lib/public";
import { finishProposal, getProposal, submitProposal, type ProposalInputT } from "@/lib/proposals";
import { dueRechecks } from "@/lib/rechecks";

export const maxDuration = 60;

const RULES =
  "Score exactly per HANDOFF.md section 4. Never store strength, signal or included; the server computes them. " +
  "Label self-reported, run-rate and estimated figures. Never record funding, valuation, GMV, users, units or consumer spend as type Revenue. " +
  "Projections are context only, never the first (headline) evidence item. If profit can't be verified, profitability is 'Not publicly verified.' " +
  "Every proposal goes through validators and, unless it only confirms existing figures, waits for owner review.";

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

const common = {
  reason: z.string().min(3).describe("Short reason for the change"),
  sourceUrls: z.array(z.string().url()).default([]).describe("Every source URL used"),
  proposedBy: z.string().default("mcp-agent").describe("Agent name"),
};

async function propose(input: ProposalInputT) {
  try {
    const p = await submitProposal(input);
    after(() => finishProposal(p.id));
    return text({ id: p.id, status: p.status, companyId: p.companyId, checks: p.checks, scoreBefore: p.scoreBefore, scoreAfter: p.scoreAfter, note: "Link and figure checks run now. Call get_proposal to see the final status." });
  } catch (e) {
    return { ...text(e instanceof z.ZodError ? z.prettifyError(e) : e instanceof Error ? e.message : "Error"), isError: true };
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_companies",
      { title: "List companies", description: "All companies with server-computed strength, signal and inclusion.", inputSchema: z.object({}) },
      async () => text((await listCompanies()).map(publicCompany)),
    );
    server.registerTool(
      "get_company",
      { title: "Get company", description: "One company with its watch pointers and change history.", inputSchema: z.object({ id: z.string() }) },
      async ({ id }) => {
        const c = await getCompany(id);
        if (!c) return { ...text(`No company with id "${id}".`), isError: true };
        return text({ company: { ...publicCompany(c), watch: c.watch || null }, history: await listChangeLog(id, 30) });
      },
    );
    server.registerTool(
      "propose_company",
      {
        title: "Propose a new company",
        description: `Submit a new company (full JSON per HANDOFF.md section 6, website required). ${RULES}`,
        inputSchema: z.object({ company: z.record(z.string(), z.unknown()), ...common }),
      },
      async ({ company, reason, sourceUrls, proposedBy }) => propose({ kind: "new_company", payload: company, reason, sourceUrls, proposedBy }),
    );
    server.registerTool(
      "propose_update",
      {
        title: "Propose an update",
        description: `Change fields on an existing company. Send only the fields that change. Sending "evidence" replaces the whole list. ${RULES}`,
        inputSchema: z.object({ companyId: z.string(), patch: z.record(z.string(), z.unknown()), ...common }),
      },
      async ({ companyId, patch, reason, sourceUrls, proposedBy }) => propose({ kind: "update", companyId, payload: patch, reason, sourceUrls, proposedBy }),
    );
    server.registerTool(
      "add_evidence",
      {
        title: "Add evidence",
        description: `Append evidence rows to a company. Set headline to true to put them first. ${RULES}`,
        inputSchema: z.object({ companyId: z.string(), evidence: z.array(z.record(z.string(), z.unknown())).min(1), headline: z.boolean().default(false), ...common }),
      },
      async ({ companyId, evidence, headline, reason, sourceUrls, proposedBy }) =>
        propose({ kind: "add_evidence", companyId, payload: { evidence, headline }, reason, sourceUrls, proposedBy }),
    );
    server.registerTool(
      "submit_recheck",
      {
        title: "Submit a re-check result",
        description:
          "Report a re-check. confirmed=true with no patch marks the evidence as checked and publishes automatically if all checks pass. Include updated or new evidence rows, or a patch, when something changed.",
        inputSchema: z.object({
          companyId: z.string(),
          confirmed: z.boolean(),
          notes: z.string().default(""),
          evidence: z.array(z.record(z.string(), z.unknown())).default([]),
          patch: z.record(z.string(), z.unknown()).optional(),
          ...common,
        }),
      },
      async ({ companyId, confirmed, notes, evidence, patch, reason, sourceUrls, proposedBy }) =>
        propose({ kind: "recheck_result", companyId, payload: { confirmed, notes, evidence, patch }, reason, sourceUrls, proposedBy }),
    );
    server.registerTool(
      "list_due_rechecks",
      { title: "List due re-checks", description: "Companies that need a re-check, with reasons and open tasks from the daily cron jobs.", inputSchema: z.object({}) },
      async () => text(await dueRechecks()),
    );
    server.registerTool(
      "get_proposal",
      { title: "Get proposal", description: "Status, validator results and review reasons for a proposal.", inputSchema: z.object({ id: z.string() }) },
      async ({ id }) => {
        const p = await getProposal(id);
        return p ? text(p) : { ...text("Not found"), isError: true };
      },
    );
  },
  { serverInfo: { name: "whats-actually-making-money", version: "0.1.0" } },
);

async function guarded(req: Request) {
  if (!isAgent(req)) return unauthorized();
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
