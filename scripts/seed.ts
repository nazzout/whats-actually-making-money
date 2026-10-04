// One-time import of data/seed/companies.json into the configured store.
// Usage: npm run seed            (only if the companies collection is empty)
//        npm run seed:force      (writes every seed company, logging any differences)
import fs from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) process.loadEnvFile(f);
}

async function main() {
  const { getStore } = await import("../lib/store");
  const { saveCompany } = await import("../lib/data");
  const store = await getStore();
  const force = process.argv.includes("--force");
  const existing = await store.list("companies");
  console.log(`Store: ${store.mode}. Existing companies: ${existing.length}.`);
  if (existing.length && !force) {
    console.log("Not empty. Use --force to write the seed anyway.");
    return;
  }
  const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/seed/companies.json"), "utf8"));
  let n = 0;
  for (const c of seed) {
    const { changes } = await saveCompany(c, { actor: "seed", reason: "Initial import from companies.json (handoff v2)" });
    if (changes.length) n++;
  }
  console.log(`Wrote ${n} of ${seed.length} companies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
