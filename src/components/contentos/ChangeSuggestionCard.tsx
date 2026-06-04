"use client";

import { useState } from "react";
import type { QASuggestion } from "@/lib/contentos/schemas/contentos";
import { QA_LAYERS } from "@/lib/contentos/schemas/contentos";
import { SeverityBadge } from "./badges";

const layerName = (key: string) => QA_LAYERS.find((l) => l.key === key)?.name ?? key;

export function ChangeSuggestionCard({
  s,
  onAccept,
  onReject,
  onEdit,
  onSendHuman,
  onFocus,
}: {
  s: QASuggestion;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (text: string) => void;
  onSendHuman: () => void;
  onFocus: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.editedReplacement ?? s.suggestedReplacement);

  return (
    <div className={`sug ${s.severity === "critical" ? "crit" : ""} decided-${s.decision}`} onMouseEnter={onFocus}>
      <div className="sug-head">
        <span className="type">{s.issueType}</span>
        <SeverityBadge severity={s.severity} />
        <span className="faint tiny">{layerName(s.layer)}</span>
        {s.decision !== "pending" && (
          <span className="decision-tag" style={{ color: decisionColor(s.decision) }}>
            {s.decision.replace("_", " ")}
            {s.decidedBy ? ` · ${s.decidedBy.split("@")[0]}` : ""}
          </span>
        )}
      </div>

      <div className="diff">
        <div className="old">{s.currentText || "(empty)"}</div>
        {!editing ? (
          <div className="new">{s.decision === "edited" ? s.editedReplacement ?? s.suggestedReplacement : s.suggestedReplacement}</div>
        ) : (
          <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} />
        )}
      </div>

      <div className="why">{s.explanation}</div>
      <div className="meta-line">
        <span><b>Confidence</b> {Math.round(s.confidence * 100)}%</span>
        <span><b>Source</b> {s.sourceValidationStatus}</span>
        {s.riskTierImpact != null && <span style={{ color: "var(--red)" }}><b>Risk</b> Tier {s.riskTierImpact}</span>}
      </div>

      <div className="controls">
        {!editing ? (
          <>
            <button className="btn sm green" onClick={onAccept} disabled={s.decision === "accepted"}>✓ Accept</button>
            <button className="btn sm" onClick={onReject} disabled={s.decision === "rejected"}>✕ Reject</button>
            <button className="btn sm ghost" onClick={() => setEditing(true)}>✎ Edit</button>
            <button className="btn sm" onClick={onSendHuman} disabled={s.decision === "sent_to_human"}>⚑ Human review</button>
          </>
        ) : (
          <>
            <button className="btn sm primary" onClick={() => { onEdit(text); setEditing(false); }}>Save edited change</button>
            <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

function decisionColor(decision: string): string {
  if (decision === "accepted") return "#1f8a0d";
  if (decision === "rejected") return "var(--red)";
  if (decision === "edited") return "var(--ubas-deep)";
  return "var(--amber)";
}
