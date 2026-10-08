import SiteFooter from "./SiteFooter";

// Simple document page in the Board's light palette: white, greys, black text, green links.
export default function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="legal">
      <header className="lg-top">
        <a className="lg-brand" href="/">
          What makes money?
        </a>
        <a className="lg-back" href="/#board">
          Back to the board
        </a>
      </header>
      <main className="lg-doc">
        <h1>{title}</h1>
        {updated ? <p className="lg-updated">Last updated: {updated}</p> : null}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
