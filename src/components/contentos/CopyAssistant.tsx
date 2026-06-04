"use client";

import { useState } from "react";
import { detectIssues, improveCopy, type RecoResult } from "@/lib/contentos/grammar";

/**
 * Floating "Copy helper" widget for the QA Check page.
 *
 * Two actions, both grounded in the same brand and clarity rules the QA Agent
 * uses, so suggestions stay consistent with ContentOS:
 *   - Suggest reco copy: produces an improved version of the current content.
 *   - Grammar check: turns on inline highlighting in the editor (Grammarly-style
 *     underlines) and reports how many issues were found.
 *
 * It reads the content currently in the QA Check editor and never overwrites it
 * unless the user explicitly clicks Apply.
 */

type Mode = "reco" | "grammar";

export function CopyAssistant({
  content,
  onApply,
  onHighlightGrammar,
}: {
  content: string;
  onApply: (text: string) => void;
  onHighlightGrammar?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reco, setReco] = useState<RecoResult | null>(null);
  const [grammarCount, setGrammarCount] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);

  const hasContent = content.trim().length > 0;

  function reset() {
    setMode(null);
    setReco(null);
    setGrammarCount(null);
    setError(null);
    setApplied(false);
  }

  async function run(kind: Mode) {
    reset();
    setMode(kind);
    if (!hasContent) return;
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      if (kind === "grammar") {
        setGrammarCount(detectIssues(content).length);
        onHighlightGrammar?.();
      } else {
        setReco(improveCopy(content));
      }
    } catch {
      setError("Something went wrong generating suggestions. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function applyReco() {
    if (!reco) return;
    onApply(reco.text);
    setApplied(true);
  }

  return (
    <>
      <button
        type="button"
        className={`copilot-fab ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-label="Copy helper"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ci">{open ? "✕" : "✦"}</span>
        <span className="t">Copy helper</span>
      </button>

      <div className={`copilot-panel ${open ? "open" : ""}`} role="dialog" aria-label="Copy helper" aria-hidden={!open}>
        <div className="copilot-head">
          <span style={{ fontSize: 15 }}>✦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--green-deep)" }}>Copy helper</div>
            <div className="faint tiny">Improve the copy you&apos;re about to QA</div>
          </div>
          <button className="copilot-x" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className="copilot-actions">
          <button className={`btn sm ${mode === "reco" ? "primary" : ""}`} disabled={busy} onClick={() => run("reco")}>✦ Suggest reco copy</button>
          <button className={`btn sm ${mode === "grammar" ? "primary" : ""}`} disabled={busy} onClick={() => run("grammar")}>✓ Grammar check</button>
        </div>

        <div className="copilot-body">
          {!mode && (
            <div className="faint tiny" style={{ padding: "6px 2px" }}>
              Pick an action above. Suggestions are based on the content currently in the QA Check editor and use Sprout&apos;s
              brand and clarity rules.
            </div>
          )}

          {mode && !hasContent && (
            <div className="callout warn" style={{ marginTop: 4 }}>
              No copy to work with yet. Upload, paste, or add a URL&apos;s text in the QA Check editor first.
            </div>
          )}

          {busy && (
            <div className="copilot-loading">
              <span className="copilot-spin">⟳</span> {mode === "grammar" ? "Scanning for grammar, clarity, and style issues…" : "Drafting recommended copy…"}
            </div>
          )}

          {error && <div className="callout danger" style={{ marginTop: 4 }}>{error}</div>}

          {/* Grammar: drives the inline highlighting */}
          {!busy && mode === "grammar" && grammarCount !== null && hasContent && (
            grammarCount === 0 ? (
              <div className="callout" style={{ marginTop: 4 }}>Looks clean. No grammar, clarity, or style issues found.</div>
            ) : (
              <div>
                <div className="callout" style={{ marginTop: 4 }}>
                  Highlighted <b>{grammarCount}</b> issue{grammarCount > 1 ? "s" : ""} in your copy. Click any underline in the editor to review it and Accept, Ignore, or Dismiss.
                </div>
                <div className="copilot-legend">
                  <span><span className="gc-dot error" /> grammar / spelling</span>
                  <span><span className="gc-dot warn" /> clarity / readability</span>
                  <span><span className="gc-dot info" /> style / tone</span>
                </div>
              </div>
            )
          )}

          {/* Reco copy */}
          {!busy && reco && hasContent && (
            <div>
              {reco.changed ? (
                <>
                  <div className="tiny muted" style={{ marginBottom: 6 }}>Recommended copy:</div>
                  <textarea className="copilot-output" readOnly value={reco.text} />
                  {reco.summary.length > 0 && (
                    <ul className="bullets tiny" style={{ marginTop: 8 }}>
                      {reco.summary.map((s, i) => <li key={i} className="muted">{s}</li>)}
                    </ul>
                  )}
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    {!applied ? (
                      <button className="btn sm green" onClick={applyReco}>Apply to my content</button>
                    ) : (
                      <span className="state go">✓ Applied to your content</span>
                    )}
                    <button className="btn sm" onClick={() => navigator.clipboard?.writeText(reco.text)}>Copy</button>
                  </div>
                  {!applied && <div className="faint tiny" style={{ marginTop: 6 }}>Applying replaces the editor content. Your original stays until you confirm.</div>}
                </>
              ) : (
                <div className="callout" style={{ marginTop: 4 }}>This copy already follows Sprout&apos;s brand and clarity rules. Nothing to recommend.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
