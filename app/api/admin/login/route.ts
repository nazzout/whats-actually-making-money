import { checkPassword, makeSession, OWNER_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const pw = String(form.get("password") || "");
  const next = String(form.get("next") || "/admin/review");
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/admin/review";
  if (!checkPassword(pw)) {
    return Response.redirect(new URL(`/admin/login?error=1&next=${encodeURIComponent(dest)}`, req.url), 303);
  }
  const s = makeSession();
  const res = new Response(null, { status: 303, headers: { location: dest } });
  res.headers.append(
    "set-cookie",
    `${OWNER_COOKIE}=${s.value}; Path=/; Max-Age=${s.maxAge}; HttpOnly; SameSite=Lax${process.env.VERCEL ? "; Secure" : ""}`,
  );
  return res;
}
