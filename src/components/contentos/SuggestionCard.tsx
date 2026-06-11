"use client";

import { useState } from "react";
import type { QASuggestion } from "@/lib/contentos/schemas/contentos";

/** Red-flagged → green-recommended correction card. Used inline (popover at the
 * flagged text) and in the side rail. `onBack` is optional (popover hides it). */
export function SuggestionCard({ s, onAccept, onDismiss, onBack, onClose }: {
  s: QASuggestion;
  onAccept: (t?: string) => void;
  onDismiss: () => void;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState(false);
  const [val, setVal] = useState(s.suggestedReplacement);
  const hasReplacement = !!s.suggestedReplacement && s.suggestedReplacement !== s.currentText;
  return (
    <div className={`sug-card sev-${s.severity}`}>
      <div className="sug-card-head">
        <span className={`sr-dot ${s.severity}`} /> <b>{s.issueType}</b>
        <span className="sug-card-layer">{s.layer.replace(/_/g, " ")}</span>
        {onClose && <button className="sug-card-x" onClick={onClose}>×</button>}
      </div>
      {onBack && <button className="sug-card-back" onClick={onBack}>← All suggestions</button>}

      {s.currentText && (
        <div className="diff-block flagged">
          <div className="diff-label">Flagged</div>
          <div className="diff-text">{s.currentText}</div>
        </div>
      )}
      {hasReplacement && (
        <div className="diff-block recommended">
          <div className="diff-label">Recommended</div>
          {editing
            ? <textarea className="diff-edit" rows={3} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
            : <div className="diff-text">{s.suggestedReplacement}</div>}
        </div>
      )}

      {why && <div className="sug-card-why">{s.explanation}</div>}

      <div className="sug-card-actions">
        {editing ? (
          <>
            <button className="btn sm primary" onClick={() => onAccept(val)}>Save &amp; apply</button>
            <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            {hasReplacement && <button className="btn sm primary" onClick={() => onAccept()}>Accept</button>}
            <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn sm" onClick={onDismiss}>Dismiss</button>
            <button className="btn sm ghost" onClick={() => setWhy((w) => !w)}>Ask why</button>
          </>
        )}
      </div>
    </div>
  );
}
