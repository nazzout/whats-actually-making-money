export default function AdminTop() {
  return (
    <div className="a-top">
      <a className="a-brand" href="/">What makes money?</a>
      <nav className="a-nav" aria-label="Owner">
        <a href="/#board">Board</a>
        <a href="/admin/review">Review queue</a>
        <a href="/admin/log">Change log</a>
        <form method="post" action="/api/admin/logout">
          <button type="submit">Sign out</button>
        </form>
      </nav>
    </div>
  );
}
