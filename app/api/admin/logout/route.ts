import { OWNER_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = new Response(null, { status: 303, headers: { location: "/" } });
  res.headers.append("set-cookie", `${OWNER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}
