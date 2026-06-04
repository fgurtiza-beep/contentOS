"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectIssues, nonOverlapping, applyIssue, issueSig, type Issue, type IssueSeverity } from "@/lib/contentos/grammar";

/**
 * A content field that doubles as a Grammarly-style review surface.
 *
 *  - Edit mode: a normal textarea.
 *  - Review mode: the same text, read-only, with the exact problem words
 *    underlined (red = grammar/spelling/punctuation, orange = clarity/
 *    readability, blue = style/tone). Clicking an underline opens a popover with
 *    the issue type, explanation, suggested fix, and Accept / Ignore / Dismiss.
 *
 * The original text is never changed until the user clicks Accept. Issues are
 * re-derived from the current value on every change, so highlights update or
 * disappear as the copy is edited. `active` (driven by the floating Copy helper)
 * flips the field into review mode.
 */

const SEV_LABEL: Record<IssueSeverity, string> = { error: "Grammar / Spelling", warn: "Clarity / Readability", info: "Style / Tone" };

export function GrammarTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 160,
  active = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  active?: boolean;
}) {
  const [mode, setMode] = useState<"edit" | "review">(active ? "review" : "edit");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<{ issue: Issue; top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // When the widget runs Grammar Check, flip into review mode.
  useEffect(() => {
    if (active) { setMode("review"); setPopover(null); }
  }, [active]);

  const allIssues = useMemo(() => detectIssues(value), [value]);
  const issues = useMemo(
    () => allIssues.filter((i) => !dismissed.has(issueSig(i)) && !ignored.has(i.id)),
    [allIssues, dismissed, ignored],
  );
  const chosen = useMemo(() => nonOverlapping(issues), [issues]);

  function openPopover(issue: Issue, e: React.MouseEvent) {
    e.stopPropagation();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const top = r.bottom - wrapRect.top + 6;
    const left = Math.max(4, Math.min(r.left - wrapRect.left, wrap.clientWidth - 264));
    setPopover({ issue, top, left });
  }

  function accept(issue: Issue) {
    onChange(applyIssue(value, issue));
    setPopover(null);
  }
  function ignore(issue: Issue) {
    setIgnored((s) => new Set(s).add(issue.id));
    setPopover(null);
  }
  function dismiss(issue: Issue) {
    setDismissed((s) => new Set(s).add(issueSig(issue)));
    setPopover(null);
  }

  const fieldStyle: React.CSSProperties = { minHeight, fontSize: 13, lineHeight: 1.6 };

  return (
    <div className="gc-wrap" ref={wrapRef}>
      {value.trim() && (
        <div className="gc-bar">
          <div className="gc-bar-left">
            {issues.length > 0 ? (
              <>
                <span className="tiny" style={{ fontWeight: 600 }}>{issues.length} issue{issues.length > 1 ? "s" : ""}</span>
                <span className="gc-legend"><span className="gc-dot error" /> grammar</span>
                <span className="gc-legend"><span className="gc-dot warn" /> clarity</span>
                <span className="gc-legend"><span className="gc-dot info" /> style</span>
              </>
            ) : (
              <span className="tiny faint">No issues detected</span>
            )}
          </div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => { setMode(mode === "review" ? "edit" : "review"); setPopover(null); }}
          >
            {mode === "review" ? "✎ Edit text" : `✓ Review${issues.length ? ` (${issues.length})` : ""}`}
          </button>
        </div>
      )}

      {mode === "edit" || !value.trim() ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={fieldStyle}
        />
      ) : (
        <div className="gc-review" style={fieldStyle} onClick={() => setPopover(null)}>
          {renderSegments(value, chosen, openPopover)}
        </div>
      )}

      {popover && mode === "review" && (
        <>
          <div className="gc-pop-backdrop" onClick={() => setPopover(null)} />
          <div className="gc-pop" style={{ top: popover.top, left: popover.left }} onClick={(e) => e.stopPropagation()}>
            <div className="gc-pop-head">
              <span className={`gc-dot ${popover.issue.severity}`} />
              <span className="gc-pop-type">{popover.issue.type}</span>
              <span className="faint tiny" style={{ marginLeft: "auto" }}>{SEV_LABEL[popover.issue.severity]}</span>
            </div>
            <div className="gc-pop-msg">{popover.issue.message}</div>
            {popover.issue.suggestion !== null && (
              <div className="gc-pop-sugg">
                <span className="faint tiny">Suggested:</span>{" "}
                {popover.issue.suggestion === "" ? <em>remove “{popover.issue.text}”</em> : <b>{popover.issue.suggestion}</b>}
              </div>
            )}
            <div className="gc-pop-actions">
              {popover.issue.suggestion !== null && <button className="btn sm green" onClick={() => accept(popover.issue)}>Accept</button>}
              <button className="btn sm" onClick={() => ignore(popover.issue)}>Ignore</button>
              <button className="btn sm ghost" onClick={() => dismiss(popover.issue)}>Dismiss</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function renderSegments(value: string, chosen: Issue[], onMark: (issue: Issue, e: React.MouseEvent) => void) {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  chosen.forEach((issue, i) => {
    if (issue.start > cursor) out.push(<span key={`t${i}`}>{value.slice(cursor, issue.start)}</span>);
    out.push(
      <span
        key={issue.id}
        className={`gc-underline gc-${issue.severity}`}
        title={`${issue.type}: ${issue.message}`}
        onClick={(e) => onMark(issue, e)}
      >
        {value.slice(issue.start, issue.end)}
      </span>,
    );
    cursor = issue.end;
  });
  if (cursor < value.length) out.push(<span key="tail">{value.slice(cursor)}</span>);
  return out;
}
