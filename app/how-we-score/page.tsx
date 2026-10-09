import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { DEFINITIONS, DIMENSIONS, DEMAND_RUBRIC, TRUST_GROUPS, EVIDENCE_LABELS, KEPT_SEPARATE } from "@/lib/methodology";
import { INCLUDE } from "@/lib/rubric";

export const metadata: Metadata = {
  title: "How We Score | What makes money?",
  description: "How What Makes Money evaluates businesses: Trust, Business Strength, Demand and Signal, and why funding and hype never raise a score.",
};

// Everything below is rendered from lib/methodology.ts and lib/rubric.ts, the same constants the scoring code uses.
const CARDS = [
  { id: "trust", name: "Trust", range: "0–5", line: DEFINITIONS.trust },
  { id: "strength", name: "Business Strength", range: "0–25", line: DEFINITIONS.strength },
  { id: "demand", name: "Demand", range: "0–5", line: DEFINITIONS.demand },
  { id: "signal", name: "Signal", range: "0–25", line: DEFINITIONS.signal },
];

export default function HowWeScore() {
  return (
    <LegalPage title="How we score">
      <div className="hws">
        <p className="hws-lede">
          We separate business performance from hype. Funding, popularity and financial performance are different signals, so we evaluate them
          separately.
        </p>

        <div className="hws-cards">
          {CARDS.map((c) => (
            <a key={c.id} className="hws-card" href={`#${c.id}`}>
              <span className="hws-range">{c.range}</span>
              <b>{c.name}</b>
              <span>{c.line}</span>
            </a>
          ))}
        </div>

        <section id="trust">
          <h2>
            Trust <small>0–5</small>
          </h2>
          <p>How reliable the evidence is. The score comes from the best source behind the main revenue or profit figure.</p>
          <div className="hws-tiers">
            {TRUST_GROUPS.map((g) => (
              <div key={g.key} className={`hws-tier t-${g.key}`}>
                <h3>{g.label}</h3>
                <ul>
                  {g.tiers.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="strength">
          <h2>
            Business Strength <small>0–25</small>
          </h2>
          <p>Five dimensions, each scored 0 to 5.</p>
          <div className="hws-dims">
            {DIMENSIONS.map((d) => (
              <div key={d.key}>
                <b>{d.label}</b>
                <span>{d.line}</span>
              </div>
            ))}
          </div>
          <p className="hws-note">Funding and valuation never increase Business Strength.</p>
        </section>

        <section id="demand">
          <h2>
            Demand <small>0–5</small>
          </h2>
          <p>Evidence that real customers or users are adopting, paying for, returning to or expanding their use of the product or service.</p>
          <ol className="hws-scale">
            {DEMAND_RUBRIC.map((r) => (
              <li key={r.score}>
                <span className="hws-n">{r.score}</span>
                <div>
                  <b>{r.word}</b>
                  <span>{r.line}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="hws-note">No Demand score means there isn&rsquo;t enough reliable evidence yet. It does not mean demand is zero.</p>
        </section>

        <section id="signal">
          <h2>Signal</h2>
          <p>Signal combines Business Strength with evidence confidence. The same business scores higher when its numbers come from stronger sources.</p>
          <div className="hws-formula" aria-label="Business Strength combined with Trust gives Signal">
            <span>Business Strength</span>
            <i aria-hidden="true">×</i>
            <span>Trust</span>
            <i aria-hidden="true">→</i>
            <b>Signal</b>
          </div>
          <p>
            A company is ranked once it reaches Trust {INCLUDE.trust} and Business Strength {INCLUDE.strength}. Below that it sits on the watchlist
            until stronger evidence appears. Demand only breaks ties between equal Signals.
          </p>
        </section>

        <section id="labels">
          <h2>Evidence labels</h2>
          <div className="hws-labels">
            {EVIDENCE_LABELS.map((l) => (
              <div key={l.label}>
                <span className="hws-pill">{l.label}</span>
                <span>{l.line}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="separate">
          <h2>We keep these separate</h2>
          <ul className="hws-sep">
            {KEPT_SEPARATE.map(([a, b]) => (
              <li key={a}>
                <b>{a}</b> is not {b}
              </li>
            ))}
          </ul>
        </section>

        <section id="capital">
          <h2>Capital is context only</h2>
          <p>
            Funding, valuation and capital raised are useful context and can appear on a company&rsquo;s record. They never increase Business Strength or
            Demand.
          </p>
        </section>
      </div>
    </LegalPage>
  );
}
