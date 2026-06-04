"use client";

import type { ContentBlueprint, ProblemIntentMap } from "@/lib/contentos/schemas/contentos";

export function BlueprintPanel({ blueprint, pim }: { blueprint: ContentBlueprint; pim: ProblemIntentMap }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Problem-Intent Map & Blueprint</h3>
        <span className="sub">readiness-first, channel-native plan</span>
      </div>
      <div className="panel-pad">
        <div className="field">
          <label>Problems</label>
          <ul className="bullets">{pim.problems.map((p, i) => <li key={i} className="muted">{p}</li>)}</ul>
        </div>
        <div className="field">
          <label>Intent signals</label>
          {pim.intentSignals.map((s, i) => (
            <div key={i} className="tiny muted"><b>{s.intent}</b> — {s.signal}</div>
          ))}
        </div>
        <div className="divider" />
        <div className="field">
          <label>Outline</label>
          {blueprint.outline.map((o, i) => (
            <div key={i} className="tiny muted" style={{ marginBottom: 3 }}><b>{o.heading}</b> — {o.purpose}</div>
          ))}
        </div>
        <div className="field">
          <label>Output matrix</label>
          {blueprint.outputMatrix.map((o, i) => (
            <span key={i} className="chip">{o.quantity}× {o.channel}/{o.format} · {o.intent}</span>
          ))}
        </div>
        {blueprint.requiredDisclaimers.length > 0 && (
          <div className="callout warn">
            <b>Required disclaimers:</b> {blueprint.requiredDisclaimers.join(" ")}
          </div>
        )}
        {blueprint.internalLinkTargets.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Suggested internal links</label>
            {blueprint.internalLinkTargets.map((u, i) => (
              <div key={i} className="tiny mono muted">{u}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
