import fs from "node:fs";
import path from "node:path";

// A tiny document store. Firestore in production; a JSON file in local mode.
// Collections: companies, proposals, changeLog, checks, meta.

export type Doc = Record<string, unknown> & { id: string };
export type ListOpts = { where?: [string, unknown][]; orderBy?: string; desc?: boolean; limit?: number };

export interface Store {
  mode: "firestore" | "local" | "readonly";
  get(col: string, id: string): Promise<Doc | null>;
  set(col: string, id: string, doc: Record<string, unknown>): Promise<void>;
  update(col: string, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(col: string, id: string): Promise<void>;
  list(col: string, opts?: ListOpts): Promise<Doc[]>;
}

const clean = (v: Record<string, unknown>) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

function sortLimit(rows: Doc[], o: ListOpts = {}) {
  let r = rows;
  for (const [k, v] of o.where || []) r = r.filter((d) => d[k] === v);
  if (o.orderBy) {
    const k = o.orderBy;
    r = [...r].sort((a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? "")) * (o.desc ? -1 : 1));
  }
  return o.limit ? r.slice(0, o.limit) : r;
}

/* ---------- Firestore ---------- */
async function firestoreStore(json: string): Promise<Store> {
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const sa = JSON.parse(json);
  if (typeof sa.private_key === "string") sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] || initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings can only be applied once per instance */
  }
  return {
    mode: "firestore",
    async get(col, id) {
      const s = await db.collection(col).doc(id).get();
      return s.exists ? ({ id: s.id, ...s.data() } as Doc) : null;
    },
    async set(col, id, doc) {
      const { id: _drop, ...rest } = doc;
      await db.collection(col).doc(id).set(clean(rest));
    },
    async update(col, id, patch) {
      await db.collection(col).doc(id).set(clean(patch), { merge: true });
    },
    async remove(col, id) {
      await db.collection(col).doc(id).delete();
    },
    async list(col, o = {}) {
      let q: FirebaseFirestore.Query = db.collection(col);
      for (const [k, v] of o.where || []) q = q.where(k, "==", v);
      // Ordering + filtering on different fields needs a composite index; sort in memory instead.
      const snap = await q.get();
      return sortLimit(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Doc),
        { ...o, where: [] },
      );
    },
  };
}

/* ---------- Local JSON file ---------- */
type LocalData = Record<string, Record<string, Record<string, unknown>>>;
const LOCAL_FILE = path.join(process.cwd(), ".data", "local-db.json");

function seedData(): LocalData {
  const seedPath = path.join(process.cwd(), "data", "seed", "companies.json");
  const companies: Record<string, Record<string, unknown>> = {};
  for (const c of JSON.parse(fs.readFileSync(seedPath, "utf8"))) {
    const { id, ...rest } = c;
    companies[id] = rest;
  }
  return { companies, proposals: {}, changeLog: {}, checks: {}, meta: {} };
}

function localStore(readonly: boolean): Store {
  let mem: LocalData | null = null;
  const load = (): LocalData => {
    if (readonly) return (mem ||= seedData());
    if (!fs.existsSync(LOCAL_FILE)) {
      fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(seedData(), null, 2));
    }
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  };
  const save = (d: LocalData) => {
    if (readonly) throw new Error("Storage is not configured. Set FIREBASE_SERVICE_ACCOUNT.");
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(d, null, 2));
  };
  return {
    mode: readonly ? "readonly" : "local",
    async get(col, id) {
      const d = load()[col]?.[id];
      return d ? ({ id, ...d } as Doc) : null;
    },
    async set(col, id, doc) {
      const d = load();
      const { id: _drop, ...rest } = doc;
      (d[col] ||= {})[id] = clean(rest);
      save(d);
    },
    async update(col, id, patch) {
      const d = load();
      (d[col] ||= {})[id] = { ...(d[col][id] || {}), ...clean(patch) };
      save(d);
    },
    async remove(col, id) {
      const d = load();
      if (d[col]) delete d[col][id];
      save(d);
    },
    async list(col, o) {
      const rows = Object.entries(load()[col] || {}).map(([id, v]) => ({ id, ...v }) as Doc);
      return sortLimit(rows, o);
    },
  };
}

let storePromise: Promise<Store> | null = null;
export function getStore(): Promise<Store> {
  if (!storePromise) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    storePromise = sa ? firestoreStore(sa) : Promise.resolve(localStore(!!process.env.VERCEL));
  }
  return storePromise;
}
