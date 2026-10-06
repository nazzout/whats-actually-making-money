import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy | What makes money?" };

const EMAIL = "nazz@atemporal.xyz";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 6, 2026">
      <p>
        What Makes Money (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) respects your privacy. This policy explains what information the site at
        whatmakesmoney.io handles when you use it.
      </p>

      <h2>Information we collect</h2>
      <p>The site works without accounts. We collect only what is needed to run it.</p>

      <h3>a) Questions you ask</h3>
      <p>When you use the Ask feature:</p>
      <ul>
        <li>The text of your question is sent to Anthropic to generate an answer</li>
        <li>We keep a log of questions and answers to monitor cost, quality and abuse</li>
        <li>That log is not linked to your name, email or account, because we do not collect those</li>
      </ul>
      <p>Please do not include personal information in your questions.</p>

      <h3>b) Usage limits</h3>
      <p>To keep Ask within its daily and weekly limits, we use:</p>
      <ul>
        <li>An anonymous visitor cookie, set only when you use Ask</li>
        <li>A one-way hash of your IP address. We store the hash, not the address itself</li>
        <li>The times of your recent questions, kept for 7 days</li>
      </ul>

      <h3>c) Search and browsing</h3>
      <p>Keyword search, filters, Explore and the Board run in your browser. We do not record what you search or view.</p>

      <h2>Information we do not collect</h2>
      <p>We do not:</p>
      <ul>
        <li>Require accounts or ask for your name or email</li>
        <li>Use advertising or third-party analytics trackers</li>
        <li>Sell or rent personal data</li>
        <li>Track your precise location</li>
      </ul>

      <h2>Cookies</h2>
      <ul>
        <li>
          <strong>mm_vid</strong>: an anonymous ID used only to apply Ask limits. Set when you first use Ask
        </li>
        <li>
          <strong>mm_owner</strong>: used only to keep the site owner signed in to the admin area
        </li>
      </ul>
      <p>Both are first-party, essential cookies. You can clear them at any time in your browser settings.</p>

      <h2>Services we use</h2>
      <p>These providers handle data on our behalf, or receive basic request information such as your IP address when your browser loads them:</p>
      <ul>
        <li>
          <strong>Vercel</strong>: hosts the site
        </li>
        <li>
          <strong>Google Cloud (Firestore)</strong>: stores the dataset and the logs described above
        </li>
        <li>
          <strong>Anthropic</strong>: generates Ask answers from your question
        </li>
        <li>
          <strong>Google Fonts</strong>: serves the site&apos;s font
        </li>
        <li>
          <strong>Brandfetch</strong>: serves company logos
        </li>
      </ul>
      <p>Each provider handles data under its own privacy policy.</p>

      <h2>Your choices</h2>
      <ul>
        <li>You can use the whole site, including search, without using Ask</li>
        <li>You can clear cookies at any time in your browser</li>
        <li>
          You can ask us to delete questions you submitted by emailing <a href={`mailto:${EMAIL}`}>{EMAIL}</a> with the wording and the date
        </li>
      </ul>

      <h2>Children&apos;s privacy</h2>
      <p>The site is not intended for children under 13. We do not knowingly collect personal information from children.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy from time to time. Changes are posted on this page with a new &ldquo;Last updated&rdquo; date.</p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
