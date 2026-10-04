# What's actually making money? Project handoff (v2)

Version 2, October 3, 2026. This replaces the first handoff. If you already have v1, read section 0 first: it lists everything that changed. Everything else in this file is the complete, current brief.

Files in this package:
- `HANDOFF.md`: this brief.
- `companies.json`: the current dataset (10 scored companies, now with `website`). This matches the live database exactly.
- `making-money.html`: the current app (single file, runs as a claude.ai artifact today).
- `app-icon.svg`, `app-icon-1024.png`: app icon (no longer shown in the nav, kept for favicon or app use).

---

## 0. What changed since v1

**Direction**
- The app is moving to **Vercel** (the owner has Vercel Pro) as a **public, live resource**: everyone sees the same data, and an agent keeps it updated and checked on its own. The owner funds it alone, so favor free, official public data sources and cheap automation. Full plan in section 9.
- The agent must **never push to main** to update data. Data changes go through the app's API into a review queue (section 9.3). Git is for code only.

**Data**
- New field `website` on every company (official site, or the store page for games). Shown as a "Visit site" button in the detail panel.
- Optional `icon` field (no icons collected yet; letter tiles stand in).
- Four new signals are pending verification (section 8). They are not in `companies.json` yet.

**App and design** (all already live in `making-money.html`; details in sections 10 and 11)
- Explore canvas rebuilt on an even, aligned grid of company blocks: icon + company card on a tall row, metric card + score card on a short row.
- New card styles: cobalt company cards, white score cards, deep liquid-green metric cards for AI companies, volt-yellow metric cards with an animated topographic pattern for non-AI companies.
- Browse groups are now piles of outline pills that blow around when the cursor passes.
- Cursor-lean camera, hover growth on everything, white Search and Explore buttons, bigger title, no nav icon, no hint line.
- Detail panel and Board page redesigned: clean white surfaces, most important information first, plain-language labels ("Trust in the numbers" instead of "Confidence").

**Copy rules from the owner** (apply to all UI text and write-ups)
- No em dashes or long dashes.
- No witty jargon. Clear and concise.

---

## 1. Paste-ready prompt for your agent

> I'm continuing my project **"What's actually making money?"** This v2 handoff replaces the first one. Read HANDOFF.md fully before doing anything, starting with section 0 (what changed). Attached: `companies.json` (current data, 10 companies) and `making-money.html` (current app).
>
> **Goal:** identify recently launched or recently scaled businesses, across all categories, that show credible evidence people are actually paying. Not hype, funding or virality. A core question: are AI-native products actually outperforming non-AI products, games, consumer goods, services and creative businesses?
>
> **What I need from you now:**
> 1. **Build the Vercel version** described in section 9: Next.js app, Postgres database, agent API (and MCP endpoint), automatic validators, review queue, scheduled checks. Port the current design from `making-money.html` exactly (sections 10 and 11). Seed the database from `companies.json`. Work in a Git repo I connect to Vercel; never put data updates in commits.
> 2. **Add the four pending signals** in section 8 through the new review queue, after verifying each against primary sources and scoring it exactly per section 4.
> 3. Then: re-checks (section 12) and the next research batch aimed at the coverage gaps in section 7.
>
> **Research rules:** score exactly per section 4. Label every self-reported, run-rate or estimated figure. Never treat funding, valuation, GMV, downloads, units or run-rate as revenue. If profitability can't be verified, say "Not publicly verified." Use official APIs, filings, registries, press releases and public pages only. No scraping behind logins or paywalls. Store facts and links, never copied article text.
>
> **Copy rules:** no em dashes, no witty jargon, clear and concise.
>
> Start by confirming you've read section 0, then propose the repo structure and database schema before writing code.

---

## 2. What we're building and why

**Problem.** Most "this product is crushing it" content is hype: funding rounds, valuations, download counts, self-reported run rates and screenshots. It's hard to tell what's actually making money, especially with AI claims everywhere.

**Product.** A public research resource that:
- Tracks emerging businesses across all categories (apps, SaaS, games, marketplaces, media, hardware, physical products, services, agencies, AI-native and non-AI).
- Scores each one **two separate ways**: how much we can trust the numbers ("Trust in the numbers", internally `confidence`) and how strong the business looks ("Business strength"). Hype lives in the gap between them.
- Keeps an **evidence ledger**: every number stored with its period, metric type, source tier, self-reported flag and link.
- Compares groups (AI role, digital intensity, product form) on both scores separately, so "less disclosed" never reads as "worse business."

**Audiences.** Now: the owner and anyone with the link. Later: studios deciding what to build; agencies using fast-growing, verified-revenue companies as prospects.

**Working model.** An agent is the research engine (search, read filings, score). The app is the memory and the public face. The app's validators and review queue are the quality gate between them.

---

## 3. Evidence standard

Prioritize evidence roughly in this order:
1. Public-company filings or earnings reports
2. Regulatory filings
3. Acquisition disclosures
4. Reputable financial journalism (Reuters, Bloomberg, FT, WSJ, CNBC, TechCrunch, The Information)
5. Credible industry analytics (Sensor Tower, Appfigures, Alinea/VG Insights/Gamalytic, Similarweb, Circana), labeled as estimates
6. Direct company financial disclosures
7. Founder interviews or social posts

Rules:
- Label company- and founder-reported figures as **self-reported**.
- Never present funding, valuation, downloads, users, GMV, gross consumer spend, units sold, transaction volume or app-store gross revenue as company revenue unless the source says it is.
- Never present ARR as profit, or annualized run rate as trailing revenue.
- Projections are not revenue. Record them only as context, never as the headline figure.
- An acquisition with an undisclosed price is not a valuation. Reported deal talks ("discussions centered around $2B") stay unconfirmed.
- Never infer profitability from high revenue.
- Third-party numbers are labeled as estimates.

**Timeframe.** Prioritize companies launched, broken out or materially scaled in roughly the last 1 to 3 years. Older companies qualify only with a meaningful recent development (new product, business-model change, unusual growth, acquisition, profitability milestone).

---

## 4. Scoring rubric

### Trust in the numbers (`confidence`, 0 to 5)
Rates the best source for the main revenue or profit claim.

| Score | Standard | Plain-words label in the app |
|---|---|---|
| 5 | Audited filing (10-K/Q, HKEX annual results, 20-F) | Audited filing |
| 4 | Regulatory or acquirer filing that states the company's financials | Regulatory or acquirer filing |
| 3 | Company-published full-year results with both a revenue line and a profit line, or reputable press citing documents | Company results or reputable press |
| 2 | Company headline or run-rate claim, or a third-party estimate | Company claim or estimate |
| 1 | Founder social posts, or a single anonymous source | Founder post or single source |
| 0 | Only funding, valuation, downloads or users | No revenue evidence |

Adjustments: **+1** (max 5) if acquired at a disclosed price. **-1** if credible sources disagree on the key figure by more than 25%.

### Business strength (0 to 25)
Five dimensions, each 0 to 5. Unknown counts as 0.

| Dimension | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|
| Scale (annual revenue) | $1B+, or $250M+ within 3 yrs of launch | $100M to $1B, or $50M+ within 3 yrs | $20M to $100M | $5M to $20M | Under $5M |
| Growth (YoY) | 100%+, or top-0.1% launch in category | 50 to 99% | 20 to 49% | 5 to 19% | Flat or declining |
| Profitability | Verified GAAP profit + positive FCF | Verified net profit or adj. EBITDA | Company-claimed profit | Verified positive gross margin, no profit line | Not publicly verified |
| Efficiency | Over $1M rev/employee, or revenue over 5x capital raised | $500K to $1M, or 2 to 5x | $250K to $500K, or 1 to 2x | Lower | Heavily capital-dependent |
| Durability | Verified retention/NRR, or 3+ yrs sustained growth | Subscription/repeat model with reported retention | Recurring model, no retention data | Single hit, no recurring revenue | Documented decline |

- Services, agencies and media: +1 on Scale, scored on net revenue.
- Efficiency: if both ratios are known, use the lower.
- Profitability 0 = verified losses.

Strength labels in the app: Very strong (20+), Strong (15+), Moderate (12+), Too early to call (under 12).

### Signal (for ranking)
Signal = Strength x confidence weight. Weights: 5 = 1.0, 4 = 0.9, 3 = 0.75, 2 = 0.55, 1 = 0.3, 0 = excluded. Round to one decimal.

**Inclusion:** confidence 2+ and Strength 12+. Otherwise: **Watchlist**.

### Flags (don't affect score)
Hit-dependent, Decelerating, Conflicting figures, Metric-type risk, Customer concentration, Pending disclosure.

**Known tilt:** the rubric rewards verifiability, so public and acquired companies rank higher than private AI companies. Always report Strength and Trust separately in group comparisons.

---

## 5. Classification fields

- **AI role:** Native (AI is the product), Engine (AI drives economics, not the customer-facing product), Feature (secondary user-facing feature), None
- **Product form:** Mobile app, Web app/site, Desktop software, Game, API/infrastructure, Marketplace/platform, Content/media, Physical product, Hardware + software, Service, Hybrid
- **Customer:** B2C, B2B, Prosumer, C2C/marketplace, B2B/Prosumer
- **Revenue model:** Subscription, Usage, Take rate, One-time purchase, Ads, Retainer/project fees, Licensing, Subscription + usage, One-time + subscription
- **Digital intensity:** Fully digital, Digital-led (physical, but digital carries core value or recurring revenue), Digitally distributed (physical, won via DTC/social/Amazon), Digitally enabled (service or offline, digital supports delivery), Non-digital

---

## 6. Data model (one JSON object per company)

```json
{
  "id": "slug-of-name",
  "name": "Company",
  "form": "Physical product",
  "customer": "B2C",
  "model": "Subscription",
  "digital": "Digitally distributed",
  "aiRole": "None",
  "launched": "2023",
  "website": "https://example.com",
  "icon": "icons/example.png",
  "trigger": "Why it qualifies now",
  "confidence": 3,
  "scores": { "scale": 4, "growth": 5, "profit": 3, "efficiency": 5, "durability": 4 },
  "profitability": "Founder-claimed profitable; not publicly verified.",
  "summary": "2 to 3 sentence signal summary.",
  "caveats": "What could make this wrong.",
  "recheck": "Next event that would change the score",
  "flags": ["Metric-type risk"],
  "evidence": [
    {
      "metric": "Revenue",
      "value": "$1,924M",
      "period": "Q2 2026",
      "type": "Revenue",
      "tier": "Audited filing",
      "selfReported": false,
      "source": "Source name",
      "url": "https://..."
    }
  ],
  "updatedAt": "2026-10-02T00:00:00Z"
}
```

- `website` (new): official site, or the store page for games. Required for new companies.
- `icon` (optional): path to an icon file served by the app. On Vercel this can be a normal image URL or Vercel Blob; the artifact version could only use files published alongside it.
- `profitability`: start with "Verified" only for verified profit. The app derives the profit status from this text: starts with "Verified" = Profit verified; mentions "claim", "company-reported" or "self-reported" = Profit claimed, not verified; otherwise Profit not verified.
- The first evidence item is the headline figure shown on cards and at the top of the detail panel. Put the best, most relevant figure first.
- Strength, Signal and watchlist status are **computed**; never store them. On Vercel, compute them on the server too, so an agent can't submit inconsistent scores.

Allowed `type` values: Revenue, ARR, Annualized run-rate, Net income, Adj. EBITDA, Free cash flow, GMV, Gross consumer spend, Units, Users, Third-party estimate, Acquisition price

Allowed `tier` values: Audited filing, Regulatory/acquirer filing, Company financial statements, Reputable press, Third-party analytics, Company-reported, Founder post

---

## 7. Current dataset (`companies.json`, as of Oct 3, 2026)

| Company | AI role | Trust | Strength | Signal | Website | Notes |
|---|---|---|---|---|---|---|
| AppLovin | Engine | 5 | 24 | 24.0 | applovin.com | Audited; Q2 2026 revenue $1,924M, net income $1,267M |
| Pop Mart | None | 5 | 19 | 19.0 | popmart.com | Hit-dependent, decelerating; overseas revenue fell in H1 2026 |
| Grüns | None | 3 | 21 | 15.8 | gruns.co | Unilever 6-K: 80% for €767M; revenue self-reported |
| Vinted | None | 3 | 21 | 15.8 | vinted.com | €1.1B revenue, €62M net profit (company-reported) |
| Oura | Feature | 2 | 19 | 10.5 | ouraring.com | Confidential IPO filing; re-check at public S-1 |
| Cursor | Native | 2 | 17 | 9.4 | cursor.com | $60B SpaceX deal; run-rate figures conflict |
| Schedule I | None | 2 | 17 | 9.4 | Steam store page (app 3164500) | Third-party estimate $151M Steam revenue |
| Lovable | Native | 2 | 16 | 8.8 | lovable.dev | $400 to 500M ARR, self-reported |
| The Free Press | None | 2 | 15 | 8.3 | thefp.com | Paramount acquisition, revenue estimated |
| Loop | None | 2 | 10 | Watchlist | loop.co | Brooklyn creative studio, $13.5M net revenue, self-reported (Adweek 2026). Not the Austrian agency LOOP (agentur-loop.com). |

**Early read (hypothesis, not finding):** AI-native companies win on revenue velocity, but every AI-native figure so far is run-rate or self-reported with no verified profit. Every verified profit came from businesses where AI is absent or an internal engine. The pending signals (section 8) add more small creative agencies and indie games breaking through, which supports watching non-AI businesses closely.

**Coverage gaps for the next batch:** non-AI B2B SaaS, services businesses, production companies, hybrid agency/product studios, more mobile apps and hardware.

---

## 8. Pending signals (verify before adding)

These came from the owner's ongoing research chat on Oct 3, 2026. They are **unverified leads**, not data. The names were missing from the pasted text and were inferred from context, so confirm each name first. Add each through the review queue after verifying against primary sources.

| Lead | Claimed facts | What to verify | Expected outcome under the rubric |
|---|---|---|---|
| **X&O** (creative/advertising agency, AI not core) | Revenue $8M (2025), up from $4.2M (2024); projects ~$12M (2026). Clients include Coca-Cola, Verizon. Sells senior-led creative "sprints." | Source of the revenue figures (likely self-reported to trade press). The $12M is a projection, not revenue. | Trust 2 (self-reported). Growth ~90% (score 4). Scale $5 to 20M (2), +1 for agency = 3. Likely near the inclusion line; profitability not verified. |
| **Listen Labs** (AI research platform, AI native) | Salesforce signed a definitive agreement to acquire it (announced Sept 29, 2026). Price not disclosed; reporting says talks centered around ~$2B. 50M+ participant network, 120+ languages. | Salesforce announcement: https://www.salesforce.com/news/stories/salesforce-signs-definitive-agreement-to-acquire-listen-labs/ . Any revenue figure at all. | No revenue evidence and no disclosed price: trust 0 to 1, Watchlist. Do not record $2B as an exit value. |
| **Graveyard Keeper 2** (game, AI absent) | Released Sept 22, 2026 at $24.99. Developer says 400K+ copies across platforms in two days. ~190K Steam preorders, reportedly ~$3M gross; 1M+ wishlists. | Developer announcement for the 400K figure; Steam page for price and date. A third-party revenue estimate (Gamalytic, VG Insights, Alinea). | Units are not revenue. 400K x list price is ~$10M gross consumer spend before platform cuts, discounts and taxes. Record as Units / Gross consumer spend. Score low until a revenue estimate exists. Flag Hit-dependent. |
| **Photon** (developer platform for agents in iMessage/WhatsApp, AI native) | 40,000+ developers; "revenue up 10x in four months" (as of Oct 2, 2026); raised $4.5M. | Any absolute revenue figure. | Growth multiple with no base, plus funding: trust 0, Watchlist. Flag Metric-type risk. |

Context from the same research (for write-ups, not scoring): premium PC/console games generated about $30B over H2 2025 to H1 2026, with H1 2026 at $13.8B (+5.3% YoY). Recent indie breakouts worth checking for the ledger: WARDOGS, Dressmaker, R.E.P.O., PEAK. Agencies mentioned as part of the same "small senior team, narrow scope" pattern: Koto, Mischief. All unverified.

---

## 9. Vercel build plan

### 9.1 Goals
- One live source of truth that every visitor sees.
- An agent keeps it updated and re-checked without anyone opening a terminal.
- Every number stays traceable to a source, and nothing questionable goes public without a check.
- Low running cost: free official data sources, cheap scheduled jobs, AI only where judgment is needed.

### 9.2 Stack
- **Next.js** (App Router) on **Vercel Pro**. Pro allows commercial use, more frequent cron jobs and longer function runs.
- **Postgres** via the Vercel Marketplace: **Supabase** (database plus auth for the admin login) or **Neon** (database only, pair with Auth.js). Free tiers cover this dataset.
- An ORM such as Drizzle or Prisma, with migrations in the repo.
- Pages are statically rendered and revalidated on publish (`revalidateTag("companies")`), so the public site is fast and always current.
- Public pages need no login. Only the owner logs in, for the review queue.

### 9.3 How the agent connects (no pushes to main)
- **Agent API**, authenticated with a secret key in an `Authorization: Bearer` header (`AGENT_API_KEY` env var):
  - `GET /api/companies`, `GET /api/companies/:id`: read current data (also public).
  - `POST /api/agent/proposals`: propose a new company, an update, new evidence, or a re-check result. Body: the company JSON (or a partial update) plus a short `reason` and the source URLs used.
  - `GET /api/agent/rechecks`: list companies due for a re-check (flags like Pending disclosure, `recheck` events, stale evidence).
- **MCP endpoint** (for example `/api/mcp`, Vercel can host MCP servers) exposing the same actions as tools: `list_companies`, `get_company`, `propose_company`, `propose_update`, `add_evidence`, `list_due_rechecks`. Claude-based agents can then call them directly.
- Any agent that can make HTTP calls or use MCP can contribute. A scheduled Claude task works well for recurring research.

### 9.4 Quality gate: validators and review queue
Every proposal lands in a `proposals` table with status `pending`, and the server runs validators before anything is published:
1. **Schema:** required fields present; enums match section 5 and section 6 values exactly.
2. **Rubric math:** Strength, Signal and inclusion recomputed on the server. Proposals never set them.
3. **Evidence rules:** reject funding, valuation, GMV, users, units or gross consumer spend recorded as `type: Revenue`; reject a run-rate in a trailing-revenue slot; require `selfReported: true` for Company-reported and Founder post tiers; flag projections.
4. **Source checks:** every URL loads (no login wall); the page text contains the figure (normalized, e.g. "$1,924M" vs "$1.924 billion"); the domain is consistent with the claimed tier (a `sources` table maps known domains to tiers: sec.gov = Audited filing, hkexnews.hk = Audited filing, companieshouse.gov.uk = Regulatory, and so on).
5. **Conflicts:** if a new figure differs from stored evidence by more than 25%, add the Conflicting figures flag and require review.

**Publish policy:**
- **Auto-publish:** re-check results that confirm existing figures, link updates, new evidence that passes all validators and doesn't change any score.
- **Owner approval** (one click in `/admin/review`): new companies, any score change, anything self-reported, founder-post or single-source, any failed validator.
- Every published change writes a `change_log` row (company, field, before, after, reason, source, who or what proposed it, timestamp). This also gives the per-company score history.

### 9.5 Scheduled work
- **Vercel Cron (no AI, nearly free):**
  - Daily: link health for all evidence URLs and websites.
  - Daily: poll free official sources for tracked public companies. SEC EDGAR (free API, send a descriptive User-Agent, respect rate limits), HKEX announcements, UK Companies House (free API key), company press-release RSS, Steam store pages for tracked games. A new filing opens a re-check task.
- **Scheduled agent (AI, judgment work):**
  - Weekly: research batch of 8 to 12 new companies across categories (section 7 gaps), submitted as proposals.
  - Daily or on trigger: re-check anything in `GET /api/agent/rechecks`.
- Keep AI calls to work that needs judgment. Don't use the model for fetching or arithmetic.

### 9.6 Suggested tables
- `companies`: one row per company (fields from section 6 except evidence).
- `evidence`: one row per figure, linked to a company; first row by `position` is the headline.
- `proposals`: incoming agent submissions, validator results, status (pending, approved, rejected, auto-published), reviewer notes.
- `change_log`: every published change.
- `sources`: domain to tier mapping and notes.
- `checks`: results of cron link and filing checks.

### 9.7 The "ask anything" search
Today it uses the artifact's built-in Claude call. On Vercel, either:
- start with the existing keyword search (free), or
- add `/api/ask` that sends the question plus a compact dataset to a model, with caching and per-IP rate limits to control cost.

### 9.8 Migration steps
1. Create the repo and Next.js app. Port `making-money.html` into components (canvas, cards, piles, detail panel, Board) without changing the design.
2. Create the schema and seed it from `companies.json`.
3. Build the public read routes and pages.
4. Build the agent API, MCP endpoint, validators and `/admin/review`.
5. Add cron jobs and the scheduled agent.
6. Add the four pending signals through the queue as the first real test.
7. Point the domain at Vercel; keep the claude.ai artifact as a private backup until the Vercel version is stable.

---

## 10. The app today (`making-money.html`)

The file runs as a claude.ai artifact with capabilities `db`, `user` and `sample`. It holds no company data; data lives in the artifact database (collection `companies`, doc id = company `id`). Outside claude.ai, `window.claude.use(...)` doesn't exist and the page shows "Not connected." On Vercel, replace the db layer with the API from section 9 (the current code uses a Firestore-style API: `collection("companies").onSnapshot`, `doc(id).set()`, `doc(id).delete()`).

### Explore (`#explore`): infinite canvas
- **Grid:** 228px columns, 40px gutters, wraps in both directions; the whole grid moves together.
- **Company blocks:** each company is a block of two columns and two rows.
  - Tall row (228px): icon tile + company card.
  - Short row (150px): metric card + score card.
  - Even block rows: [icon][company] over [metric][score]. Odd block rows: [company][icon] over [score][metric]. Two icons never touch.
- **Browse piles:** some blocks are a pile of pills instead, one per group (AI role, Product form, Digital intensity, Proof and watch-outs). Piles are spread diagonally so two never stack.
- **Motion:**
  - Slow idle drift when the cursor isn't on the canvas.
  - Drag or scroll to travel, with directional motion blur on fast moves only and a slight zoom-out while dragging.
  - Cursor-lean camera (mouse only): the view leans toward where the cursor points, up to 11% of the viewport at the edge with an 8% dead zone in the center, then comes to rest. It does not keep panning. It eases back when the cursor leaves the canvas or a panel opens.
  - Hover growth with a springy ease: cards 6%, icon tiles 10%, pills 12%.
  - All motion respects reduced-motion settings.
- **Search bar** (bottom): an exact company name opens it; free-form questions go to Claude with the dataset; otherwise keyword match. Focusing it opens suggestions and browse groups.

### Card types
- **Company card** (tall): cobalt gradient, name, form, digital intensity, AI role dot, Signal (green) or Watchlist.
- **Icon tile** (tall row, beside its company card): 148px rounded square. Real icon if `icon` is set, otherwise the company's first letter in its AI-role color on dark. Company name appears on hover.
- **Metric card** (short): the headline evidence figure, label, source tier and Self-reported tag.
  - AI companies (any AI role): deep green WebGL liquid gradient with white text. The cursor stirs the liquid.
  - Non-AI companies: volt yellow with pure black text and a topographic contour pattern that draws itself in when the card enters view and redraws on hover.
  - Long tiers are shortened on cards: "Company financials", "Acquirer filing".
- **Score card** (short, the smallest card): white, about 184 x 114px centered in its slot. Company name, trust pips (green), strength bar (green).
- **Pills:** outline only (white 1.5px border, white text, clear fill). They blow away from the cursor and spring back. The selected pill fills white with black text.

### Detail panel (opens from any card, icon or Board row)
White sheet, ordered by what matters most:
1. Header: icon, name, "form · customer · AI role", a black **Visit site** button (opens `website` in a new tab) and a round X close button.
2. Verdict block (light grey): headline figure with period and Self-reported tag; Signal or Watchlist; the summary sentence; two bars, "Trust in the numbers" (n/5 plus plain words) and "Business strength" (n/25 plus label).
3. Profit status with a colored dot: green Profit verified, amber Profit claimed (not verified), grey Profit not verified.
4. "Why it's on the list" and "What could make this wrong", side by side.
5. Watch-outs, score breakdown bars, evidence list with source links, details (website, revenue model, customer, digital intensity, launched, re-check when).
6. Edit and Delete for writers.

### Board (`#board`)
White page:
1. Title, one-line description, status, Add company button.
2. Four summary tiles: Top signal, Profit verified (n of total), Solid evidence (trust 3+), Watchlist.
3. Filters (search, AI role, digital intensity, product form) with custom chevrons.
4. **Ranked by signal** list: icon, name and form, AI role, trust pips plus plain-words tier, strength bar, Signal.
5. Below: "Trust vs. strength" scatter (zones "Verified and strong" and "Strong claims, thin evidence", dashed inclusion lines) and "How groups compare" (median Strength and Trust per group).
6. Add/edit form with live score calculation, including a Website field.

---

## 11. Design system

**Type:** Bricolage Grotesque (Google Fonts), 400 to 800. Canvas headlines 800 with tight tracking; Board and panel headings 700.

**Nav:** "What's actually making money?" at 28px (20px on phones) in a blurred pill, no icon. Explore/Board tabs: active tab white with black text on the dark canvas; on the Board page, the title pill turns white and the active tab black.

**Buttons:** Search button white with black text. Panel close is a 44px light grey circle with an X. Visit site is black with white text.

**Explore canvas (dark):**
- Canvas `#0B0B0B`, tiles `#171717`, lines `#262626`, text `#F2F2F2`, muted `#9C9C9C`.
- Brand green `#00D54B`.
- Company cards: gradient `#1233C8` to `#0B248E` (135deg), border `#2B4BD8`, white text, muted text white at 72%.
- AI metric cards: WebGL liquid in deep greens (shader palette roughly `#004A1F`, `#007530`, `#089E45`, highlight `#52CC85`), white text with a soft shadow.
- Non-AI metric cards: volt `#D9FC51`, text `#000000`, contour lines `#0A0A0A` at 26% opacity, 1.3px. Pattern: marching-squares isolines of a seeded noise field, 8 levels, about four or five hills per card.
- Score cards: white, ink `#111111`, muted `#6E6E6E`, track `#ECECEC`, pips and bar brand green.
- Icon tiles: `#181818` with a `#2A2A2A` border, letter in the AI-role color.
- AI role colors on dark: native `#B39BFF`, engine `#3FD6F5`, feature `#FFB443`, none `#8C8C8C`.

**Board and detail panel (light):**
- Background `#FFFFFF`, soft fill `#F3F3F5`, lines `#E7E7EA`, ink `#0A0A0A`, muted `#6B6B70`.
- Bars and pips `#3DCB52` on track `#E4E4E8`.
- AI role colors on light: native `#7B5CF0`, engine `#0E9FC2`, feature `#D98A0B`, none `#A3A3A8`.
- Flag and self-reported tag `#C4501C`. Links `#0A7A2F`.

**Shapes:** canvas cards 20px radius (score cards 16px), panels and tiles 18 to 20px, pills fully rounded. The panel slides in from the right with a springy ease.

**Inspiration:** infinite-canvas brand sites (such as Cash App's design site) and creative-code patterns. Original design; no third-party logos or typefaces. Company logos are trademarks; showing them to identify a company is generally fine, but check before the public launch.

---

## 12. Re-checks due

- **Oura:** public S-1 if the IPO filing goes public.
- **Cursor:** disclosures after the SpaceX deal; the conflicting run-rate figures.
- **AppLovin:** Q3 2026 earnings (guided $2,055M to $2,085M revenue).
- **Pop Mart:** full-year results; continued overseas slowdown.
- **Loop:** next agency ranking or headcount data (efficiency is 0 because headcount is unknown).

---

## 13. Data sourcing and legal notes

- **Low risk:** SEC EDGAR, HKEX, UK Companies House and other registries, official APIs, press releases, RSS. Automate with rate limits and a descriptive User-Agent.
- **Medium:** public pages without login. Extract facts and link back; respect robots.txt; don't store article text.
- **High (avoid automating):** anything behind logins or paywalls (The Information, Sacra, PitchBook), circumventing blocks, scraping personal data. If the owner subscribes, they read it and log the fact manually with a citation.
- **How established players do it:** PitchBook crawls public sources plus researchers making calls; Crunchbase uses contributors; Sacra separates cited observations from modeled estimates; Sensor Tower uses an opt-in panel; Steam estimators model public review counts (about 20 to 60 sales per review).
- **Verified revenue later:** opt-in read-only connections (Stripe, RevenueCat, Shopify, QuickBooks/Xero), like TrustMRR. A connected company could move straight to high trust.
- Not legal advice; get counsel before the public launch.

---

## 14. Landscape (closest products)

- **TrustMRR** (by Marc Lou): public database of startup revenue verified by a direct Stripe connection. Strongest proof, but only opt-in companies, mostly small indie software.
- **Sacra Signals:** pulls revenue figures from public sources and labels each (actual vs projection, ARR vs run rate) with citations. Closest to our evidence ledger, but limited to large private tech and paid.
- **Verified-revenue leaderboards** (for example Hoopvia): newer, smaller lists in TrustMRR's spirit.
- **Adjacent sources, not competitors:** GetLatka (self-reported SaaS revenue), PitchBook and Crunchbase (funding-centric, paywalled), Sensor Tower, Appfigures, Gamalytic, VG Insights (estimates we cite).

**Our difference:** every category in one place, trust and strength scored separately, and an evidence ledger that shows exactly why each number can or can't be trusted.

---

## 15. Next steps (in order)

1. Build the Vercel version (section 9.8).
2. Verify and add the four pending signals through the review queue (section 8).
3. Run the re-checks in section 12.
4. Next research batch on the coverage gaps (section 7).
5. Collect company icons (square PNG, 256px+) and set the `icon` field.
6. Later: opt-in verified revenue connections; public score history pages built from `change_log`.
