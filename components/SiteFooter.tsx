// Site footer. Shown on the legal pages, and under the Board (hidden on the full-screen Explore canvas).
// Layout follows louder.wtf: brand left, link columns, then a bottom bar.
export default function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="sf-top">
        <a className="sf-brand" href="/">
          What makes money?
        </a>
        <nav className="sf-col" aria-label="Product">
          <h4>Product</h4>
          <a href="/#explore">Explore</a>
          <a href="/#board">Board</a>
        </nav>
        <nav className="sf-col" aria-label="Legal">
          <h4>Legal</h4>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms#disclaimer">Disclaimer</a>
        </nav>
        <nav className="sf-col" aria-label="Contact">
          <h4>Contact</h4>
          <a href="mailto:nazz@atemporal.xyz?subject=Correction%20request">Request a correction</a>
          <a href="mailto:nazz@atemporal.xyz">Email us</a>
        </nav>
      </div>
      <p className="sf-note">
        For research and information only. Not financial, investment, legal or business advice. Figures may be estimates, self-reported or
        out of date; check the linked sources before relying on them.
      </p>
      <div className="sf-bottom">
        <span>{new Date().getFullYear()} What Makes Money. All rights reserved.</span>
        <a href="https://atemporal.xyz" target="_blank" rel="noopener noreferrer">
          atemporal.xyz
        </a>
      </div>
    </footer>
  );
}
