# Connecting research agents

Two agents work the board through the MCP endpoint at `https://whatmakesmoney.io/api/mcp`.
Both authenticate with `Authorization: Bearer <AGENT_API_KEY>`.

Never paste the key into a file in this repo. Keep it in your shell environment or your
client's secret store. The value lives in `.env.local` and in Vercel project settings.

## Claude Code

```bash
claude mcp add --transport http making-money https://whatmakesmoney.io/api/mcp \
  --header "Authorization: Bearer $AGENT_API_KEY"
```

## Claude Desktop

Claude Desktop is stdio-only, so it needs `mcp-remote` as a bridge.
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "making-money": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://whatmakesmoney.io/api/mcp",
        "--header", "Authorization: Bearer ${AGENT_API_KEY}"
      ],
      "env": { "AGENT_API_KEY": "paste-key-here" }
    }
  }
}
```

## ChatGPT

ChatGPT's connectors do not support a static bearer header on a custom MCP server, so run
the same `mcp-remote` bridge locally and point the client at it, or use the REST API
directly (`/api/agent/proposals`, `/api/agent/rechecks`) with the bearer token.

## Tools

`list_companies`, `get_company`, `list_due_rechecks`, `get_proposal`,
`propose_company`, `propose_update`, `add_evidence`, `submit_recheck`.

Nothing an agent submits publishes directly. Proposals run validators, then either
auto-publish (routine confirmations) or wait in `/admin/review`.

## Lane A — Filings (primary sources)

> You maintain the filings lane for whatsmakesmoney.io. Call `list_due_rechecks` and work
> the queue in priority order. For each company, verify every evidence row against primary
> sources only: SEC EDGAR, Companies House, HKEX, audited annual reports, and official
> investor-relations releases. Do not use press coverage as a source in this lane.
>
> If a figure still matches its source, call `submit_recheck` with `confirmed: true` and no
> patch. If a newer authoritative period exists, submit the updated evidence rows with the
> correct `tier`, `type`, `period`, and source URL. If a figure cannot be verified from a
> primary source, submit `confirmed: false` with a note explaining what you looked at.
>
> Set `proposedBy` to "filings-agent". Never invent a figure. Never record funding,
> valuation, GMV, users, or consumer spend as type `Revenue`. If you cannot find it, say so.

## Lane B — Disconfirmation (adversarial)

> You maintain the verification lane for whatsmakesmoney.io. Your job is to try to disprove
> what the board claims, not to confirm it.
>
> Call `list_companies`. For each revenue claim, independently search for the original
> source and for any figure that contradicts it. Pay closest attention to private companies
> whose numbers come from founder posts, company statements, or press estimates.
>
> When you find a contradiction, call `add_evidence` with the conflicting figure, its real
> tier, and its source URL, and explain the conflict in `reason`. When a claim traces back
> only to the company itself with no independent corroboration, say so in the reason. When
> a claim holds up against independent sources, submit a re-check confirming it.
>
> Set `proposedBy` to "verify-agent". Disagreement with Lane A is a useful result, not a
> failure. Do not resolve conflicts yourself; surface them.

## Scheduled runs (GitHub Actions)

The lanes above also run unattended. Prompts live in `agents/`, the runner in `scripts/agent-run.sh`.

- `.github/workflows/lane-filings.yml`: re-checks, daily 07:00 UTC, `claude-sonnet-5-5`. Exits before any model call when the queue is empty. At most 3 companies and $0.75 per run.
- `.github/workflows/lane-verify.yml`: disconfirmation, Mondays 09:00 UTC, `claude-opus-5-5`. At most 5 companies and $4 per run.

Secrets: `ANTHROPIC_API_KEY` (the `wmm-agents` key) and `AGENT_API_KEY`. Override models, budgets and caps with repository variables `LANE_FILINGS_MODEL`, `LANE_FILINGS_BUDGET_USD`, `LANE_FILINGS_MAX_COMPANIES`, and the same with `LANE_VERIFY_`.

Every run uploads its transcript as an artifact and fails loudly on any API error, so GitHub emails you when a key expires or credits run out.

To test the disconfirmation lane without touching data, run Lane D manually with `fixture_test` checked. It must catch GMV labeled as revenue or the run fails.

Only watch RSS feeds that carry company or financial news. An editorial feed opens a re-check task for every article.

## Why two lanes

Agreement between two agents that used the same method is not evidence. These lanes are
split by source path so that agreement means something: Lane A reads filings, Lane B tries
to break the claim from outside. When they disagree, the conflict validator flags it and a
human decides.
