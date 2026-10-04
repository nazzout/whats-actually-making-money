import { listCompanies, newId } from "./data";
import { getStore } from "./store";
import { PAYWALLED, hostOf, onList } from "./sources-config";

// Cron jobs never edit company data. They only open re-check tasks (checks collection, status "open")
// that agents pick up through GET /api/agent/rechecks, and the owner sees in the review queue.

const UA = () => process.env.SEC_USER_AGENT || "MakingMoneyResearch/1.0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openTask(t: { kind: string; companyId: string; target: string; summary: string; key: string; detail?: unknown }) {
  const store = await getStore();
  const dupe = await store.list("checks", { where: [["key", t.key], ["status", "open"]], limit: 1 });
  if (dupe.length) return false;
  const id = newId();
  await store.set("checks", id, { ...t, status: "open", createdAt: new Date().toISOString() });
  return true;
}

async function resolveTasks(key: string) {
  const store = await getStore();
  for (const c of await store.list("checks", { where: [["key", key], ["status", "open"]] })) {
    await store.update("checks", c.id, { status: "resolved", resolvedAt: new Date().toISOString() });
  }
}

async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const store = await getStore();
  const d = await store.get("meta", key);
  return d ? ((d.value as T) ?? fallback) : fallback;
}
async function setMeta(key: string, value: unknown) {
  const store = await getStore();
  await store.set("meta", key, { value, updatedAt: new Date().toISOString() });
}

async function probe(url: string) {
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": UA() } });
    if (r.status === 405 || r.status === 403 || r.status === 501) {
      r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "user-agent": UA() } });
    }
    return r.status;
  } catch {
    return 0;
  }
}

/** Daily: every evidence link and website. Two failures in a row open a task; recovery resolves it. */
export async function runLinkHealth() {
  const companies = await listCompanies();
  const health = await getMeta<Record<string, { status: number; fails: number; at: string }>>("linkHealth", {});
  const targets: { companyId: string; url: string; label: string }[] = [];
  for (const c of companies) {
    if (c.website) targets.push({ companyId: c.id, url: c.website, label: "Website" });
    for (const e of c.evidence) if (e.url) targets.push({ companyId: c.id, url: e.url, label: `${e.metric} (${e.source || hostOf(e.url)})` });
  }
  const unique = [...new Map(targets.map((t) => [`${t.companyId}|${t.url}`, t])).values()];
  let broken = 0;
  let opened = 0;
  for (let i = 0; i < unique.length; i += 5) {
    await Promise.all(
      unique.slice(i, i + 5).map(async (t) => {
        if (onList(hostOf(t.url), PAYWALLED)) return;
        const status = await probe(t.url);
        const ok = status >= 200 && status < 400;
        const soft = status === 403 || status === 429; // bot blocks, not dead links
        const prev = health[t.url] || { status: 0, fails: 0, at: "" };
        const fails = ok || soft ? 0 : prev.fails + 1;
        health[t.url] = { status, fails, at: new Date().toISOString() };
        const key = `link:${t.companyId}:${t.url}`;
        if (fails >= 2) {
          broken++;
          if (await openTask({ kind: "link", companyId: t.companyId, target: t.url, key, summary: `Link broken (${status || "no response"}): ${t.label}` })) opened++;
        } else if (ok) {
          await resolveTasks(key);
        }
      }),
    );
  }
  await setMeta("linkHealth", health);
  return { checked: unique.length, broken, opened };
}

const SEC_FORMS = new Set(["10-K", "10-Q", "8-K", "6-K", "20-F", "40-F", "S-1", "F-1", "S-1/A", "F-1/A", "424B4"]);

async function pollEdgar(companyId: string, cik: string) {
  const padded = cik.padStart(10, "0");
  const r = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, { headers: { "user-agent": UA(), accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return { error: `EDGAR ${r.status}` };
  const j = await r.json();
  const recent = j.filings?.recent || {};
  const rows: { form: string; acc: string; date: string; doc: string }[] = (recent.accessionNumber || []).slice(0, 40).map((acc: string, i: number) => ({
    acc,
    form: recent.form[i],
    date: recent.filingDate[i],
    doc: recent.primaryDocument[i],
  }));
  const key = `edgar:${padded}`;
  const seen = new Set(await getMeta<string[]>(key, []));
  const first = seen.size === 0;
  let opened = 0;
  for (const f of rows) {
    if (seen.has(f.acc)) continue;
    seen.add(f.acc);
    if (first || !SEC_FORMS.has(f.form)) continue; // first run only records a baseline
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.acc.replace(/-/g, "")}/${f.doc}`;
    if (await openTask({ kind: "filing", companyId, target: url, key: `filing:${f.acc}:${companyId}`, summary: `New SEC filing: ${f.form} filed ${f.date}`, detail: f })) opened++;
  }
  await setMeta(key, [...seen].slice(-200));
  return { opened, baseline: first };
}

async function pollCompaniesHouse(companyId: string, number: string) {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return { skipped: "no COMPANIES_HOUSE_API_KEY" };
  const r = await fetch(`https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}/filing-history?items_per_page=10`, {
    headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return { error: `Companies House ${r.status}` };
  const j = await r.json();
  const metaKey = `ch:${number}`;
  const seen = new Set(await getMeta<string[]>(metaKey, []));
  const first = seen.size === 0;
  let opened = 0;
  for (const it of j.items || []) {
    if (seen.has(it.transaction_id)) continue;
    seen.add(it.transaction_id);
    if (first) continue;
    const url = `https://find-and-update.company-information.service.gov.uk/company/${number}/filing-history`;
    if (await openTask({ kind: "filing", companyId, target: url, key: `ch:${it.transaction_id}`, summary: `New Companies House filing: ${it.description || it.type} (${it.date})`, detail: it })) opened++;
  }
  await setMeta(metaKey, [...seen].slice(-200));
  return { opened, baseline: first };
}

async function pollRss(companyId: string, feed: string) {
  const r = await fetch(feed, { headers: { "user-agent": UA() }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return { error: `RSS ${r.status}` };
  const xml = await r.text();
  const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].slice(0, 20).map((m) => {
    const b = m[0];
    const title = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const link = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "").trim();
    const guid = (b.match(/<(guid|id)[^>]*>([\s\S]*?)<\/(guid|id)>/i)?.[2] || link || title).trim();
    return { title, link, guid };
  });
  // The feed URL becomes part of a Firestore document id, which cannot contain "/".
  const metaKey = `rss:${encodeURIComponent(feed)}`;
  const seen = new Set(await getMeta<string[]>(metaKey, []));
  const first = seen.size === 0;
  let opened = 0;
  for (const it of items) {
    if (seen.has(it.guid)) continue;
    seen.add(it.guid);
    if (first) continue;
    if (await openTask({ kind: "filing", companyId, target: it.link || feed, key: `rss:${it.guid}`, summary: `New press release: ${it.title.slice(0, 140)}` })) opened++;
  }
  await setMeta(metaKey, [...seen].slice(-200));
  return { opened, baseline: first };
}

/** Steam review counts as a demand signal (Boxleiter method, about 20 to 60 sales per review). Opens a task on a 25% jump. */
async function pollSteam(companyId: string, appId: string) {
  const r = await fetch(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`, {
    headers: { "user-agent": UA() },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return { error: `Steam ${r.status}` };
  const j = await r.json();
  const total = Number(j.query_summary?.total_reviews || 0);
  const metaKey = `steam:${appId}`;
  const prev = await getMeta<{ total: number; baseline: number } | null>(metaKey, null);
  let opened = 0;
  if (prev && prev.baseline && total >= prev.baseline * 1.25) {
    const pct = Math.round((total / prev.baseline - 1) * 100);
    const summary = `Steam reviews up ${pct}% to ${total.toLocaleString("en-US")} (about ${(total * 20).toLocaleString("en-US")} to ${(total * 60).toLocaleString("en-US")} copies by the Boxleiter method; an estimate, not revenue)`;
    if (await openTask({ kind: "filing", companyId, target: `https://store.steampowered.com/app/${appId}/`, key: `steam:${appId}:${total}`, summary })) opened++;
    await setMeta(metaKey, { total, baseline: total });
  } else {
    await setMeta(metaKey, { total, baseline: prev?.baseline || total });
  }
  return { total, opened };
}

/** Daily: poll free official sources for companies with watch pointers. */
export async function runFilingPolls() {
  const companies = await listCompanies();
  const results: Record<string, unknown> = {};
  for (const c of companies) {
    const w = c.watch;
    if (!w) continue;
    const r: Record<string, unknown> = {};
    try {
      if (w.secCik) {
        r.edgar = await pollEdgar(c.id, w.secCik);
        await sleep(200); // EDGAR asks for no more than 10 requests per second
      }
      if (w.companiesHouse) r.companiesHouse = await pollCompaniesHouse(c.id, w.companiesHouse);
      if (w.rss?.length) {
        const feeds: unknown[] = [];
        for (const feed of w.rss) feeds.push(await pollRss(c.id, feed));
        r.rss = feeds;
      }
      if (w.steamAppId) r.steam = await pollSteam(c.id, w.steamAppId);
    } catch (e) {
      r.error = e instanceof Error ? e.message : "error";
    }
    results[c.id] = r;
  }
  return results;
}
