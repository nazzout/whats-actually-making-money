## Your job: demand layer backfill

Add the demand / adoption layer to existing companies. The companies are listed at the end of this prompt. Set `proposedBy` to "backfill-agent" on every proposal.

For each company:

1. Call `get_company` to read its record, evidence and history.
2. Research only what the demand layer needs, from the best sources available:
   - the 3 to 5 strongest adoption signals (see the standard): paying customers, paying-customer growth, retention or repeat usage, paid conversion, paid expansion, active users, developer or community adoption, download or review velocity, store ranking; for agencies, studios and services, repeat clients, client wins or contract growth, and proprietary tools or IP
   - capital: bootstrapped, funded (total raised and latest valuation, separately) or unknown
   Do not open full annual reports or long PDFs. Use search results and articles, and fetch only the page that holds a figure.
   Check the company's existing evidence first: rows of type Users or Units that are real demand signals (paying subscribers, active customers, copies sold) should be copied into adoption with the same source. Do not copy rows that are really team size, founder counts or prices.
3. Submit exactly one `propose_update` with a patch containing only:
   - `adoption`: the new rows. They are appended to any existing history.
   - `demand`: 0 to 5 per the standard, or leave it out if the evidence does not support a score
   - `whyWorking`: up to 3 sentences
   - `takeaway`: up to 2 sentences, a lesson for another founder, agency or team, not a promise
   - `capital`
   - `scores`: only if the current Growth or Durability breaks the rules (Growth 4 or 5 without monetized growth evidence, Durability 4 or 5 without a stated retention or repeat figure). Send the full scores object with only that dimension lowered, and say why in `reason`.
   Do not change evidence, trust, profitability or any other field.
4. Call `get_proposal` once to confirm it was accepted. If a validator failed, read why; do not resubmit the same thing.

Finish with one line per company: demand score, the strongest adoption signal, capital status, and any score you lowered.
