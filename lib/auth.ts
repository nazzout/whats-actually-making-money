import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const OWNER_COOKIE = "mm_owner";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const isDevMock = () => !process.env.VERCEL && process.env.NODE_ENV !== "production";
const secret = () => process.env.SESSION_SECRET || (isDevMock() ? "dev-only-secret" : "");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("hex");

export function makeSession() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return { value: `${exp}.${sign(exp)}`, maxAge: MAX_AGE };
}

function validSession(v: string | undefined) {
  if (!v || !secret()) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, sign(exp));
}

/** In local mock mode with no ADMIN_PASSWORD set, the local user is treated as the owner. */
export async function isOwner() {
  if (isDevMock() && !process.env.ADMIN_PASSWORD) return true;
  const jar = await cookies();
  return validSession(jar.get(OWNER_COOKIE)?.value);
}

export function checkPassword(pw: string) {
  const want = process.env.ADMIN_PASSWORD;
  return !!want && !!secret() && safeEqual(pw, want);
}

const bearer = (req: Request) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

export function isAgent(req: Request) {
  const key = process.env.AGENT_API_KEY;
  if (!key) return isDevMock(); // local mock mode: open, so the flow can be tested without keys
  return safeEqual(bearer(req), key);
}

export function isCron(req: Request) {
  const key = process.env.CRON_SECRET;
  if (!key) return isDevMock();
  return safeEqual(bearer(req), key);
}

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
