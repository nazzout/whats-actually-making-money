import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Contact | What makes money?" };

const EMAIL = "nazz@atemporal.xyz";

export default function Contact() {
  return (
    <LegalPage title="Get in touch">
      <p>Have a question, a correction, or a business you think belongs on the board? I&apos;d love to hear from you.</p>

      <p className="ct-label">Email me at</p>
      <p className="ct-email">
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>

      <p>Whether it&apos;s a figure that looks wrong, a company worth researching, or feedback on the site, I read every message.</p>

      <p>
        For corrections, please include the company, what looks wrong and a link to the source, so I can check it quickly.{" "}
        <a href={`mailto:${EMAIL}?subject=Correction%20request`}>Send a correction</a>
      </p>
    </LegalPage>
  );
}
