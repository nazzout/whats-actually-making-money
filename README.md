# What makes money?

A public research resource that tracks recently launched or recently scaled businesses with credible evidence that people are paying. Each company is scored two ways: how much we can trust the numbers, and how strong the business looks. The full brief is in [`docs/HANDOFF.md`](docs/HANDOFF.md).

- **Explore** (`/`): the infinite canvas.
- **Board** (`/#board`): ranked list, trust vs. strength chart, group comparison.
- **Review queue** (`/admin/review`): owner only. Agent proposals wait here.
- **Change log** (`/admin/log`): owner only. Every published change, with who made it and why.

## How it works

- **Next.js on Vercel**, data in **Firebase Firestore** (free tier). The browser never talks to Firestore; only the server does.
- **Agents never edit data directly and never push data to Git.** They send proposals to the agent API or MCP endpoint. Validators check every proposal, then:
  - **Published automatically:** re-checks that confirm existing figures, link fixes, new evidence that passes every check and changes no score.
  - **Waits for the owner:** new companies, any score change, anything self-reported, founder posts, single-source claims, conflicting figures, any failed or warning check.
- **Strength, signal and watchlist status are always computed on the server** from `confidence` and `scores` (rubric in `lib/rubric.ts`). Proposals that send them have those fields ignored.
- **Daily cron jobs** check every link and poll free official sources (SEC EDGAR, Companies House, press release RSS, Steam reviews). They never change data; they open re-check tasks that agents pick up.
- **Git is for code only.** `data/seed/companies.json` is the one-time starting snapshot. After launch, all data changes go through the app.

## Run locally

Requires Node 22 (`nvm use` reads `.nvmrc`).

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Firebase key, the app runs in **local mode**: data lives in `.data/local-db.json` (git-ignored), seeded from `data/seed/companies.json`. In local development with no `ADMIN_PASSWORD`, you are treated as the owner and the agent API is open, so the whole flow can be tried without any keys. Delete `.data/` to reset.

Copy `.env.example` to `.env.local` to set keys locally. Every variable is explained there.

```bash
npm run typecheck   # type check
npm run build       # production build
```

## Set up Firebase (free)

1. Go to https://console.firebase.google.com and create a project (Google Analytics is not needed).
2. **Build > Firestore Database > Create database.** Choose **production mode** and a region close to your Vercel region (for example `us-east1` / `nam5`).
3. **Firestore > Rules:** paste the contents of `firestore.rules` (deny all client access) and publish.
4. **Project settings > Service accounts > Generate new private key.** This downloads a JSON file. Keep it private and never commit it.
5. Turn it into one line for the environment variable:
   ```bash
   node -e "console.log(JSON.stringify(require(process.argv[1])))" ~/Downloads/your-key.json | pbcopy
   ```
   That copies it to your clipboard. Paste it as `FIREBASE_SERVICE_ACCOUNT` in `.env.local` (for seeding) and in Vercel.
6. Seed Firestore once from your machine:
   ```bash
   npm run seed
   ```
   It only writes if the companies collection is empty, and logs each import in the change log.

## Deploy on Vercel

1. Push this repo to GitHub (private or public; there are no secrets in it).
2. In Vercel, **Add New > Project**, import the repo. Framework: Next.js (detected). No build settings to change.
3. **Settings > Environment Variables.** Add these for Production (and Preview if you want preview deploys to work):

   | Variable | Required | Notes |
   |---|---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | Yes | One-line JSON from step 5 above. Without it the live site is read-only. |
   | `ADMIN_PASSWORD` | Yes | Your owner login password. |
   | `SESSION_SECRET` | Yes | `openssl rand -hex 32` |
   | `AGENT_API_KEY` | Yes | `openssl rand -hex 32`. Give this to agents. |
   | `CRON_SECRET` | Yes | `openssl rand -hex 32`. Vercel sends it to cron routes automatically. |
   | `SEC_USER_AGENT` | Yes | e.g. `Making Money Research you@example.com` (SEC requires contact details). |
   | `BRANDFETCH_CLIENT_ID` | Optional | Company logos. Public by design. |
   | `COMPANIES_HOUSE_API_KEY` | Optional | UK filing checks. |
   | `ANTHROPIC_API_KEY` | Optional | Turns on "ask anything". Leave empty for keyword search. |

4. Deploy. Cron jobs in `vercel.json` start automatically (daily link check 06:00 UTC, source polling 06:30 UTC).
5. Sign in at `https://your-domain/admin/login`.
6. If you use Brandfetch domain restrictions, add your Vercel domain.

## Agent API

Send `Authorization: Bearer <AGENT_API_KEY>` on every agent call. Public reads need no key.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/companies` | All companies with computed strength, signal, inclusion (public) |
| GET | `/api/companies/:id` | One company plus its change history (public) |
| POST | `/api/agent/proposals` | Submit a proposal (returns 202 and fast check results) |
| GET | `/api/agent/proposals/:id` | Final status, all checks, review reasons |
| GET | `/api/agent/proposals?status=pending` | List proposals |
| GET | `/api/agent/rechecks` | Companies due for a re-check, with reasons and open tasks |

Proposal body:

```json
{
  "kind": "new_company | update | add_evidence | recheck_result",
  "companyId": "required except for new_company",
  "payload": {},
  "reason": "Why, in one sentence",
  "sourceUrls": ["https://..."],
  "proposedBy": "agent name"
}
```

Payload by kind:

- `new_company`: the full company JSON from `docs/HANDOFF.md` section 6 (`website` required, no computed fields).
- `update`: only the fields that change. Sending `evidence` replaces the whole list.
- `add_evidence`: `{ "evidence": [ ... ], "headline": false }`. Set `headline: true` to put the new rows first.
- `recheck_result`: `{ "confirmed": true, "notes": "", "evidence": [], "patch": {} }`. A plain confirmation publishes automatically if all checks pass and resolves open re-check tasks.

Example:

```bash
curl -X POST https://your-domain/api/agent/proposals \
  -H "Authorization: Bearer $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"kind":"recheck_result","companyId":"applovin","reason":"Q2 figures re-checked against the 10-Q","sourceUrls":["https://www.sec.gov/..."],"proposedBy":"weekly-agent","payload":{"confirmed":true}}'
```

## MCP endpoint

`/api/mcp` exposes the same actions as tools: `list_companies`, `get_company`, `propose_company`, `propose_update`, `add_evidence`, `submit_recheck`, `list_due_rechecks`, `get_proposal`. Connect any MCP client that supports Streamable HTTP with the URL `https://your-domain/api/mcp` and the header `Authorization: Bearer <AGENT_API_KEY>`. For stdio-only clients use `mcp-remote`.

## Watching official sources

Add a `watch` object to a company (through an update proposal or the owner edit) to have the daily cron poll it:

```json
"watch": { "secCik": "1751008", "companiesHouse": "12345678", "rss": ["https://example.com/press.rss"], "steamAppId": "3164500" }
```

The first run records a baseline. After that, a new filing or press release opens a re-check task. Steam opens a task when the review count rises 25% (an estimate signal, never revenue).

## Logos

Company logos come from the free [Brandfetch Logo API](https://docs.brandfetch.com/docs/logo-api), built from each company's `website`. Brandfetch requires logos to be hotlinked (never downloaded or cached), so nothing is stored. An `icon` field (a path under `public/icons/` or an https URL) overrides it; store pages like Steam keep the letter tile unless an `icon` is set.

## Project layout

```
app/                    pages and API routes
  page.tsx              Explore + Board (server loads data, client mounts the ported app)
  admin/                owner login, review queue, change log
  api/                  public, agent, owner, cron, MCP and ask routes
components/app/         the ported client app (legacy-app.js keeps the original design code)
lib/                    schema, rubric, store (Firestore or local file), validators, proposals, cron
data/seed/              one-time starting snapshot
docs/                   handoff brief, original single-file app, icons
```

## Copy rules

All UI text and write-ups: no em dashes or long dashes, no witty jargon, clear and concise.
