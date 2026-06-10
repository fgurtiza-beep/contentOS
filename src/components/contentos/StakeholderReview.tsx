"use client";

import { useMemo, useState } from "react";
import type { ContentBlock, Job, QASuggestion } from "@/lib/contentos/schemas/contentos";
import { jobStore } from "@/lib/contentos/store/useStore";
import { primaryDraft } from "@/lib/contentos/orchestrator/contentOrchestrator";

const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3 } as const;
const SUBMITTED_STATES = ["HUMAN_REVIEW", "APPROVED", "SHIPPED", "EXPORTED", "KILLED"];

export function StakeholderReview({ job }: { job: Job }) {
  const draft = primaryDraft(job);
  const report = job.finalQaReport ?? job.qaReport;
  if (!draft) return <div className="empty">No draft yet.</div>;

  const submitted = SUBMITTED_STATES.includes(job.state);
  const pending = (report?.suggestions ?? []).filter((s) => s.decision === "pending").sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const coverage = computeCoverage(job, draft);
  const gaps = coverage.filter((c) => !c.ok);

  const accept = (s: QASuggestion) => { jobStore.editBlockText(job.id, s.blockId, s.suggestedReplacement); jobStore.decideSuggestion(job.id, s.id, "accepted"); };
  const acceptEdited = (s: QASuggestion, text: string) => { jobStore.editBlockText(job.id, s.blockId, text); jobStore.decideSuggestion(job.id, s.id, "edited", text); };
  const dismiss = (s: QASuggestion) => jobStore.decideSuggestion(job.id, s.id, "rejected");
  const applyAllSafe = () => pending.filter((s) => s.confidence >= 0.85).forEach(accept);

  return (
    <div className="sr">
      <div className="sr-head">
        <div>
          <h1 className="sr-title">{job.brief.title}</h1>
          <div className="sr-sub">Draft ready to review · {wordCount(draft.blocks)} words</div>
        </div>
        <div className="sr-head-actions">
          {!submitted && <button className="btn primary" onClick={() => jobStore.submitForApproval(job.id)}>Submit for approval →</button>}
          {submitted && <span className="sr-submitted">✓ Submitted for approval</span>}
        </div>
      </div>

      {job.briefConflicts && job.briefConflicts.length > 0 && (
        <div className="callout warn sr-banner">
          <b>Brief vs. request — please confirm</b>
          <ul>{job.briefConflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {job.reviewRecommendation?.needed && !submitted && (
        <div className="callout sr-banner">{job.reviewRecommendation.note}</div>
      )}

      <div className="sr-cols">
        {/* LEFT — editable document */}
        <div className="sr-doc panel">
          <div className="sr-doc-inner">
            {draft.blocks.map((b) => <EditableBlock key={b.id} job={job} block={b} disabled={submitted} />)}
          </div>
        </div>

        {/* RIGHT — QA suggestions + coverage */}
        <div className="sr-side">
          <div className="panel sr-card">
            <div className="sr-card-head">
              <span>Brief coverage</span>
              <span className={`sr-cov-pill ${gaps.length ? "warn" : "ok"}`}>{coverage.length - gaps.length}/{coverage.length}</span>
            </div>
            <div className="sr-card-body">
              {coverage.map((c) => (
                <div key={c.label} className={`sr-cov ${c.ok ? "ok" : "miss"}`}>
                  <span className="sr-cov-icon">{c.ok ? "✓" : "⚠"}</span>
                  <span className="sr-cov-label">{c.label}</span>
                  {!c.ok && c.fix && <button className="btn sm" onClick={c.fix.run}>{c.fix.label}</button>}
                </div>
              ))}
            </div>
          </div>

          <div className="panel sr-card">
            <div className="sr-card-head">
              <span>QA suggestions</span>
              {pending.length > 0 && <button className="btn sm" onClick={applyAllSafe}>Apply all safe edits</button>}
            </div>
            <div className="sr-card-body">
              {pending.length === 0 && <div className="faint tiny">No suggestions — this draft reads clean.</div>}
              {pending.map((s) => <SuggestionItem key={s.id} s={s} onAccept={() => accept(s)} onAcceptEdited={(t) => acceptEdited(s, t)} onDismiss={() => dismiss(s)} disabled={submitted} />)}
            </div>
          </div>

          <Comments job={job} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editable document block                                            */
/* ------------------------------------------------------------------ */

function EditableBlock({ job, block, disabled }: { job: Job; block: ContentBlock; disabled: boolean }) {
  const [text, setText] = useState(block.text);
  const commit = () => { if (text !== block.text) jobStore.editBlockText(job.id, block.id, text); };

  if (block.kind === "meta") {
    const [label, ...rest] = block.text.split(":");
    return (
      <div className="doc-meta">
        <span className="doc-meta-label">{label}</span>
        <input className="doc-meta-input" defaultValue={rest.join(":").trim()} disabled={disabled} onBlur={(e) => { const v = `${label}: ${e.target.value}`; if (v !== block.text) jobStore.editBlockText(job.id, block.id, v); }} />
      </div>
    );
  }

  const isHeading = block.kind === "h1" || block.kind === "h2" || block.kind === "h3";
  return (
    <div className={`doc-block doc-${block.kind}`}>
      {isHeading && block.kind !== "h1" && !disabled && (
        <button className="doc-regen" title="Regenerate this section from the brief" onClick={() => jobStore.regenerateSection(job.id, block.id)}>↻ Regenerate</button>
      )}
      {block.kind === "cta" && <span className="doc-cta-tag">CTA</span>}
      <textarea
        className={`doc-input doc-${block.kind}-input`}
        value={text}
        disabled={disabled}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }}
        ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QA suggestion (Grammarly-style)                                    */
/* ------------------------------------------------------------------ */

function SuggestionItem({ s, onAccept, onAcceptEdited, onDismiss, disabled }: { s: QASuggestion; onAccept: () => void; onAcceptEdited: (t: string) => void; onDismiss: () => void; disabled: boolean }) {
  const [why, setWhy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(s.suggestedReplacement);
  return (
    <div className={`sr-sug sev-${s.severity}`}>
      <div className="sr-sug-head"><span className={`sr-dot ${s.severity}`} />{s.issueType}</div>
      {s.currentText && <div className="sr-sug-cur">{s.currentText}</div>}
      <div className="sr-sug-new">{s.suggestedReplacement}</div>
      {why && <div className="sr-sug-why">{s.explanation}</div>}
      {editing ? (
        <div className="sr-sug-edit">
          <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={3} />
          <div className="btn-row"><button className="btn sm primary" onClick={() => { onAcceptEdited(val); setEditing(false); }}>Save</button><button className="btn sm" onClick={() => setEditing(false)}>Cancel</button></div>
        </div>
      ) : (
        !disabled && (
          <div className="sr-sug-actions">
            <button className="btn sm primary" onClick={onAccept}>Accept</button>
            <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn sm" onClick={onDismiss}>Dismiss</button>
            <button className="btn sm ghost" onClick={() => setWhy((w) => !w)}>Ask why</button>
          </div>
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comments                                                           */
/* ------------------------------------------------------------------ */

function Comments({ job }: { job: Job }) {
  const [text, setText] = useState("");
  return (
    <div className="panel sr-card">
      <div className="sr-card-head"><span>Comments</span></div>
      <div className="sr-card-body">
        {(job.draftComments ?? []).map((c, i) => (
          <div key={i} className="sr-comment"><b>{c.author.split("@")[0]}</b> {c.text}</div>
        ))}
        <textarea className="sr-comment-input" value={text} rows={2} placeholder="Leave a note for the reviewer…" onChange={(e) => setText(e.target.value)} />
        <button className="btn sm" disabled={!text.trim()} onClick={() => { jobStore.addDraftComment(job.id, text); setText(""); }}>Add comment</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brief coverage                                                     */
/* ------------------------------------------------------------------ */

interface Coverage { label: string; ok: boolean; fix?: { label: string; run: () => void }; }

function computeCoverage(job: Job, draft: { blocks: ContentBlock[] }): Coverage[] {
  const text = draft.blocks.map((b) => b.text).join(" \n ").toLowerCase();
  const headings = draft.blocks.filter((b) => b.kind === "h2" || b.kind === "h3").map((b) => b.text.toLowerCase());
  const out: Coverage[] = [];
  const ag = job.brief.agencyExtract;

  // Pain points covered
  for (const pain of job.brief.painPoints.slice(0, 6)) {
    const words = pain.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const ok = words.length === 0 ? true : words.some((w) => text.includes(w));
    out.push({ label: `Pain point: ${pain}`, ok, fix: ok ? undefined : { label: "Add section", run: () => jobStore.appendSection(job.id, `Addressing ${pain}`) } });
  }

  // Required products mentioned
  const slugs = (job.brief.products ?? [job.brief.product]).filter(Boolean);
  for (const slug of slugs) {
    const name = slug.replace(/-/g, " ");
    const ok = text.includes(name) || text.includes("sprout");
    out.push({ label: `Mentions ${name}`, ok, fix: ok ? undefined : { label: "Insert product section", run: () => jobStore.appendSection(job.id, "Where Sprout fits") } });
  }

  // Outline sections present
  if (ag?.outline?.length) {
    for (const sec of ag.outline) {
      const h = sec.heading.replace(/^h[1-3]:?\s*/i, "").toLowerCase().trim();
      if (!h || /^(h1|intro|cta)\b/i.test(sec.heading)) continue;
      const ok = headings.some((x) => similar(x, h));
      out.push({ label: `Section: ${sec.heading.replace(/^h[1-3]:?\s*/i, "").slice(0, 48)}`, ok, fix: ok ? undefined : { label: "Add section", run: () => jobStore.appendSection(job.id, sec.heading) } });
    }
  }

  // CTA present
  out.push({ label: "Includes a CTA", ok: draft.blocks.some((b) => b.kind === "cta") });

  // Length
  const words = wordCount(draft.blocks);
  const target = parseTarget(ag?.wordCount) ?? (job.brief.jobType === "blog" ? 1200 : 600);
  out.push({ label: `Length ${words}/${target}+ words`, ok: words >= target * 0.6 });

  // Unsupported claims
  const unverified = (job.production?.productClaims ?? []).filter((c) => c.status !== "verified").length;
  out.push({ label: unverified ? `${unverified} unverified claim(s) to check` : "No unsupported claims", ok: unverified === 0 });

  return out;
}

function similar(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return true;
  const aw = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const bw = b.split(/\s+/).filter((w) => w.length > 3);
  const hits = bw.filter((w) => aw.has(w)).length;
  return bw.length > 0 && hits / bw.length >= 0.5;
}

function wordCount(blocks: ContentBlock[]): number {
  return blocks.filter((b) => b.kind !== "meta").reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
}

function parseTarget(s?: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/(\d{3,5})/);
  return m ? parseInt(m[1], 10) : null;
}
