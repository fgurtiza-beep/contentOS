"use client";

import type { CanonicalNarrative } from "@/lib/contentos/schemas/contentos";

export function CanonicalNarrativePanel({ n }: { n: CanonicalNarrative }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Sprout Canonical Narrative</h3>
        <span className="sub">the strategic interpretation all output flows from</span>
      </div>
      <div className="panel-pad">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Thesis</label>
          <div className="muted">{n.thesis}</div>
        </div>
        <Group title="Key insights" items={n.keyInsights} />
        <Group title="What Sprout believes / recommends" items={n.sproutBelievesRecommends} />
        <Group title="What Sprout does NOT claim (boundaries)" items={n.sproutDoesNotClaim} danger />
        <Group title="What matters to PH HR / payroll / compliance reality" items={n.phRealityMatters} />
        <Group title="Where Sprout differentiation belongs" items={n.differentiationBelongs} />
        <div className="field">
          <label>Safe CTA lanes</label>
          <div>
            {n.safeCtaLanes.map((l, i) => (
              <span key={i} className="chip">{l.intent}: {l.cta}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ title, items, danger }: { title: string; items: string[]; danger?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="field">
      <label>{title}</label>
      <ul className="bullets" style={danger ? { color: "var(--red)" } : undefined}>
        {items.map((it, i) => <li key={i} className="muted">{it}</li>)}
      </ul>
    </div>
  );
}
