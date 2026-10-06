import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Use | What makes money?" };

const EMAIL = "nazz@atemporal.xyz";

export default function Terms() {
  return (
    <LegalPage title="Terms of Use" updated="October 6, 2026">
      <p>
        These terms apply to What Makes Money (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) at whatmakesmoney.io. By using the site you agree to them.
        If you do not agree, please do not use the site.
      </p>

      <h2>What the site is</h2>
      <p>
        What Makes Money is a research resource that tracks businesses and the publicly available evidence of what they earn. Each company is
        scored on how much the evidence can be trusted and how strong the business looks. Every figure links to the source it came from.
      </p>

      <h2 id="disclaimer">Not advice</h2>
      <p>Everything on this site is for general research and information only. Nothing on it is:</p>
      <ul>
        <li>Financial or investment advice, or a recommendation to buy, sell or hold any security</li>
        <li>Business, legal, tax or accounting advice</li>
        <li>A prediction that any business, product or idea will succeed</li>
      </ul>
      <p>
        Scores, rankings, coverage and &ldquo;what may be worth building&rdquo; guidance describe the evidence we have gathered. They are not
        guarantees and should not be the sole basis for any decision. Do your own research, and speak to a qualified professional before
        making financial, investment or business decisions.
      </p>

      <h2>Accuracy of information</h2>
      <p>We work to label every figure honestly, but we cannot guarantee that any information is complete, accurate or current. In particular:</p>
      <ul>
        <li>Many figures are self-reported by companies or founders, or are third-party estimates, and are labeled as such</li>
        <li>Run-rate and ARR figures are not trailing revenue, and gross sales are not company revenue</li>
        <li>Figures can be revised, restated or become out of date after we record them</li>
        <li>Research is assisted by automated tools and AI, which can make mistakes</li>
      </ul>
      <p>Always check the linked source before relying on a figure.</p>

      <h2>AI answers</h2>
      <p>
        The Ask feature generates short answers with AI from our dataset. Answers to questions about what to build may also include a limited
        web check, shown separately and labeled unverified. AI answers can be wrong or incomplete, and they are not advice. Use of Ask is
        limited per visitor and may be paused at any time.
      </p>

      <h2>Companies, trademarks and links</h2>
      <ul>
        <li>We are not affiliated with, endorsed by or sponsored by any company listed, unless we say so</li>
        <li>Company names, logos and trademarks belong to their owners and are used only to identify those companies</li>
        <li>Links to third-party sites are provided for reference. We do not control and are not responsible for their content</li>
      </ul>

      <h2>Corrections and removal requests</h2>
      <p>
        If you believe something about a company is wrong, email{" "}
        <a href={`mailto:${EMAIL}?subject=Correction%20request`}>{EMAIL}</a> with the company, what is wrong and a source. We review every
        request and correct errors when the evidence supports it.
      </p>

      <h2>Acceptable use</h2>
      <p>Please do not:</p>
      <ul>
        <li>Try to get around usage limits, or overload or disrupt the site</li>
        <li>Use automated tools to copy the dataset in bulk, or republish it commercially, without our permission</li>
        <li>Use the site for anything unlawful</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The site and everything on it are provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind, express or
        implied, including accuracy, completeness, fitness for a particular purpose and availability.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, we are not liable for any loss or damage, direct or indirect, arising from your use of the site or
        reliance on any information on it, including AI answers. This includes lost profits, lost revenue and business or investment losses.
        Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms from time to time. Changes are posted on this page with a new &ldquo;Last updated&rdquo; date.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
