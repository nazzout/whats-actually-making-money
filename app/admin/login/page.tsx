export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login">
      <a className="a-brand" href="/">What makes money?</a>
      <h1 style={{ marginTop: 28 }}>Owner sign in</h1>
      <p className="a-sub">Sign in to review agent proposals and edit companies.</p>
      <form method="post" action="/api/admin/login">
        <input type="hidden" name="next" value={sp.next || "/admin/review"} />
        <input type="password" name="password" placeholder="Password" autoComplete="current-password" required autoFocus aria-label="Password" />
        {sp.error ? <p className="err">That password didn&apos;t work.</p> : null}
        <button className="btn-a go" type="submit">Sign in</button>
      </form>
    </div>
  );
}
