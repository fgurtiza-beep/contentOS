"use client";

import { useState } from "react";
import type { ContentBlock, Draft, QASuggestion } from "@/lib/contentos/schemas/contentos";

/**
 * Left panel of the QA workspace. Editable: each block is directly editable and
 * commits on blur (version history + editor are tracked by the store). A "Current"
 * view shows the working draft with tracked changes (accepted/edited suggestions
 * render original struck-through + replacement inline); an "Original" view shows
 * the first draft read-only for comparison.
 */
export function SideBySideComparison({
  draft,
  suggestions,
  activeBlockId,
  onSelectBlock,
  onEditBlock,
}: {
  draft: Draft;
  suggestions: QASuggestion[];
  activeBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onEditBlock: (blockId: string, text: string) => void;
}) {
  const [view, setView] = useState<"current" | "original">("current");
  const original = draft.versions.find((v) => v.label === "original_draft");

  const accepted = suggestions.filter((s) => s.decision === "accepted" || s.decision === "edited").length;
  const pending = suggestions.filter((s) => s.decision === "pending").length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Content · editable</h3>
          <span className="sub">{accepted} accepted · {pending} pending · click any block to edit</span>
        </div>
        <div className="seg-control">
          <button className={view === "current" ? "on" : ""} onClick={() => setView("current")}>Current</button>
          <button className={view === "original" ? "on" : ""} onClick={() => setView("original")}>Original</button>
        </div>
      </div>
      <div className="panel-pad">
        {view === "original" && (
          <>
            <div className="callout" style={{ marginBottom: 10 }}>Original draft (read-only) — the first version produced before any QA changes or edits.</div>
            {(original?.blocks ?? draft.blocks).map((b) => (
              <div key={b.id} className="qa-block"><div className="kind">{b.kind} · block {b.order + 1}</div>{staticText(b)}</div>
            ))}
          </>
        )}

        {view === "current" &&
          draft.blocks.map((b) => {
            const blockSugs = suggestions.filter((s) => s.blockId === b.id);
            const applied = blockSugs.find((s) => s.decision === "accepted" || s.decision === "edited");
            const hasCritical = blockSugs.some((s) => s.severity === "critical" && s.decision === "pending");
            const hasFlag = blockSugs.some((s) => s.decision === "pending");
            const active = activeBlockId === b.id;
            const cls = hasCritical ? "flagged-crit" : hasFlag ? "flagged" : "";
            return (
              <div key={b.id} className={`qa-block ${cls}`} style={active ? { outline: "2px solid var(--ubas)" } : undefined} onClick={() => onSelectBlock(b.id)}>
                <div className="kind" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{b.kind} · block {b.order + 1}{blockSugs.length ? ` · ${blockSugs.length} issue(s)` : ""}{applied ? " · change applied" : ""}</span>
                  <span className="edit-hint">editable ✎</span>
                </div>
                {applied ? <TrackedChange b={b} s={applied} /> : <EditableBlock key={`${b.id}:${b.text}`} b={b} onCommit={(t) => onEditBlock(b.id, t)} />}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function EditableBlock({ b, onCommit }: { b: ContentBlock; onCommit: (text: string) => void }) {
  // Mounted fresh whenever b.text changes externally (keyed by caller), so local
  // edit state never drifts from the committed block text.
  const [val, setVal] = useState(b.text);
  const big = b.kind === "h1";
  const med = b.kind === "h2" || b.kind === "h3";
  return (
    <textarea
      className="editblock"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { if (val !== b.text) onCommit(val); }}
      onClick={(e) => e.stopPropagation()}
      rows={big || med ? 1 : Math.max(2, Math.ceil(val.length / 70))}
      style={big ? { fontSize: 17, fontWeight: 700, color: "var(--green-deep)" } : med ? { fontSize: 14, fontWeight: 700, color: "var(--green-deep)" } : undefined}
    />
  );
}

function TrackedChange({ b, s }: { b: ContentBlock; s: QASuggestion }) {
  const replacement = s.decision === "edited" ? s.editedReplacement ?? s.suggestedReplacement : s.suggestedReplacement;
  const removed = /^\[remove/i.test(replacement.trim());
  const cls = b.kind === "h1" ? "h1t" : b.kind === "h2" || b.kind === "h3" ? "h2t" : "";
  return (
    <div className={cls}>
      <del>{b.text}</del>
      {!removed && <> <ins>{replacement}</ins></>}
      {removed && <span className="tiny faint"> (block removed on apply)</span>}
    </div>
  );
}

function staticText(b: ContentBlock) {
  const cls = b.kind === "h1" ? "h1t" : b.kind === "h2" || b.kind === "h3" ? "h2t" : "";
  if (b.kind === "cta") return <span className="state flow">CTA → {b.text}</span>;
  return <div className={cls}>{b.text}</div>;
}
