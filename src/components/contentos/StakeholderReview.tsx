"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentBlock, Job, QASuggestion } from "@/lib/contentos/schemas/contentos";
import { jobStore } from "@/lib/contentos/store/useStore";
import { useRole } from "@/lib/contentos/store/uiStore";
import { primaryDraft } from "@/lib/contentos/orchestrator/contentOrchestrator";
import { DocumentEditor, type DocEditorHandle } from "./DocumentEditor";
import { isBody } from "@/lib/contentos/editor/markdownBlocks";
import { QA_LAYERS } from "@/lib/contentos/schemas/contentos";

const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3 } as const;
const SUBMITTED_STATES = ["HUMAN_REVIEW", "APPROVED", "SHIPPED", "EXPORTED", "KILLED"];
type SaveState = "saved" | "unsaved" | "saving";

export function StakeholderReview({ job }: { job: Job }) {
  const role = useRole();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [openLayer, setOpenLayer] = useState<string | null>(null);
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selDeriv, setSelDeriv] = useState<string | null>(null);
  const editorRef = useRef<DocEditorHandle>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };
  const handleActivate = (id: string | null) => setActiveId(id);
  const isAdmin = role === "admin";
  const llmJob = job.lane === "production" && !job.qaOnly; // jobs that use real generation

  // Trigger real (Claude) article generation once, on first view.
  useEffect(() => {
    if (!job.llmStatus && llmJob) jobStore.enhanceWithLLM(job.id);
  }, [job.id, job.llmStatus, llmJob]);

  // Repurposing jobs have multiple derivatives — let the user switch between them.
  const derivatives = job.lane === "repurposing" ? (job.repurposing?.derivatives ?? []) : [];
  const draft = derivatives.length ? (derivatives.find((d) => d.id === selDeriv) ?? derivatives[0]) : primaryDraft(job);
  if (!draft) return <div className="empty">No draft yet.</div>;

  // ---- Generation gate (LLM jobs only) ----
  if (llmJob) {
    if (!job.llmStatus || job.llmStatus === "writing") return <GeneratingScreen job={job} starting={!job.llmStatus} />;
    // Claude did not produce a publication-ready draft → show the real reason,
    // NOT the built-in writer's output (unless an admin explicitly opens it).
    if (job.llmStatus !== "done" && !(isAdmin && showBuiltIn)) return <LLMFailed job={job} isAdmin={isAdmin} onViewBuiltIn={() => setShowBuiltIn(true)} />;
  }

  // Repurposing: each derivative has its OWN QA report — show the selected tab's.
  const report = (derivatives.length ? derivatives.find((d) => d.id === draft.id)?.qaReport : null) ?? job.finalQaReport ?? job.qaReport;
  const builtInMode = !!job.llmStatus && job.llmStatus !== "done"; // admin viewing the non-production draft
  const gen = job.generationReport;
  if (gen && !gen.passed && job.llmStatus === "done") return <GenerationFailed job={job} />;

  const submitted = SUBMITTED_STATES.includes(job.state);
  const pending = (report?.suggestions ?? []).filter((s) => s.decision === "pending").sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const coverage = computeCoverage(job, draft);
  const gaps = coverage.filter((c) => !c.ok);
  const bodyBlocks = draft.blocks.filter((b) => isBody(b.kind)).map((b) => ({ kind: b.kind, text: b.text }));
  const metaBlocks = draft.blocks.filter((b) => b.kind === "meta");
  const ctaBlock = draft.blocks.find((b) => b.kind === "cta");
  const editorKey = `${job.id}:${draft.id}:${job.llmStatus ?? "x"}:${job.draftRevision ?? 0}`;
  const rewrites = pending.filter((s) => !s.advisory);
  const advisories = pending.filter((s) => s.advisory);
  const passCount = report ? report.layers.filter((l) => l.status === "pass").length : 0;

  const saveLabel = { saved: "✓ Saved", unsaved: "● Unsaved changes", saving: "Saving…" }[saveState];

  return (
    <div className="sr">
      <div className="sr-head">
        <div>
          <h1 className="sr-title">{job.brief.title}</h1>
          <div className="sr-sub">{wordCount(draft.blocks)} words · <span className={`save-state ${saveState}`}>{saveLabel}</span></div>
        </div>
        <div className="sr-head-actions">
          <button className="btn sm" onClick={() => { (document.activeElement as HTMLElement)?.blur(); setTimeout(() => setSaveState("saved"), 50); }}>Save draft</button>
          {!submitted && <button className="btn primary" onClick={() => jobStore.submitForApproval(job.id)}>Submit for approval →</button>}
          {submitted && <span className="sr-submitted">✓ Submitted for approval</span>}
        </div>
      </div>

      {toast && <div className="sr-toast">{toast}</div>}

      {builtInMode && (
        <div className="callout danger sr-banner"><b>⚠ Non-production draft (built-in writer).</b> Claude generation was unavailable ({job.llmReason}). This is for local development only — not stakeholder-ready. <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => jobStore.retryLLM(job.id)}>↻ Retry Claude</button></div>
      )}
      {job.llmStatus === "done" && job.llmReason !== "simulated" && (
        <div className="callout sr-banner tiny" style={{ background: "var(--green-soft, #e9f9e6)" }}>✓ Written by Claude (Opus 4.8) and passed the quality gate.</div>
      )}
      {job.llmStatus === "done" && job.llmReason === "simulated" && (
        <div className="callout sr-banner tiny">🧪 <b>Simulated (dev)</b> — this article was written by Claude in Claude Code, served without API cost. In production (with an API key) ContentOS generates live for any brief.</div>
      )}
      {job.briefConflicts && job.briefConflicts.length > 0 && (
        <div className="callout warn sr-banner"><b>Brief vs. request — please confirm</b><ul>{job.briefConflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
      )}
      {job.reviewRecommendation?.needed && !submitted && (
        <div className="callout sr-banner">{job.reviewRecommendation.note}</div>
      )}

      <div className="sr-cols">
        {/* LEFT — Google-Docs-style editable article */}
        <div className="sr-doc panel">
          {derivatives.length > 1 && (
            <div className="deriv-tabs">
              {derivatives.map((d) => (
                <button key={d.id} className={`deriv-tab ${d.id === draft.id ? "on" : ""}`} onClick={() => { setSelDeriv(d.id); setActiveId(null); }}>
                  {d.channel} · {d.format}
                </button>
              ))}
            </div>
          )}
          {metaBlocks.length > 0 && (
            <details className="seo-fields">
              <summary>SEO meta</summary>
              {metaBlocks.map((b) => {
                const [label, ...rest] = b.text.split(":");
                return (
                  <div className="seo-row" key={b.id}>
                    <span className="seo-label">{label}</span>
                    <input defaultValue={rest.join(":").trim()} disabled={submitted} onChange={() => setSaveState("unsaved")} onBlur={(e) => { const v = `${label}: ${e.target.value}`; if (v !== b.text) { setSaveState("saving"); jobStore.editBlockText(job.id, b.id, v); setSaveState("saved"); } }} />
                  </div>
                );
              })}
            </details>
          )}

          <DocumentEditor ref={editorRef} key={editorKey} jobId={job.id} draftId={derivatives.length ? draft.id : undefined} body={bodyBlocks} suggestions={pending} activeId={activeId} disabled={submitted} onSaveState={setSaveState} onToast={showToast} onActivate={handleActivate} />

          {ctaBlock && (
            <div className="cta-field">
              <span className="doc-cta-tag">CTA</span>
              <input defaultValue={ctaBlock.text} disabled={submitted} onChange={() => setSaveState("unsaved")} onBlur={(e) => { if (e.target.value !== ctaBlock.text) { setSaveState("saving"); jobStore.editBlockText(job.id, ctaBlock.id, e.target.value); setSaveState("saved"); } }} />
            </div>
          )}
        </div>

        {/* RIGHT — QA score + suggestion list (the edit card itself opens inline in the article) */}
        <div className="sr-side">
          {report && (
            <div className="panel qa-score">
              <div className="qa-score-row">
                <div className={`qa-score-num ${report.overallScore >= 4.5 ? "ok" : report.overallScore >= 3 ? "warn" : "bad"}`}>{report.overallScore.toFixed(1)}<span>/5</span></div>
                <div className="qa-score-meta">
                  <div className="qa-score-label">QA score</div>
                  <div className="qa-score-sub">{passCount}/{report.layers.length} layers pass · tap a row for detail</div>
                </div>
              </div>
              <div className="qa-seg" title="One segment per QA layer">
                {QA_LAYERS.map((meta) => {
                  const l = report.layers.find((x) => x.key === meta.key);
                  return <span key={meta.key} className={`seg ${l ? (l.status === "pass" ? "go" : l.status === "revision" ? "warn" : "stop") : ""}`} title={`${meta.short}: ${l?.score.toFixed(1) ?? "—"}`} />;
                })}
              </div>
              {/* Every layer, always visible AND clickable — shows what to revise + how. */}
              <div className="qa-layer-list">
                {QA_LAYERS.map((meta) => {
                  const l = report.layers.find((x) => x.key === meta.key);
                  if (!l) return null;
                  const open = openLayer === meta.key;
                  const fixes = l.recommendedFixes.filter(Boolean);
                  return (
                    <div key={meta.key} className={`qa-llrow ${open ? "open" : ""}`}>
                      <button className="qa-llrow-head" onClick={() => setOpenLayer(open ? null : meta.key)}>
                        <span className={`state ${l.status === "pass" ? "go" : l.status === "revision" ? "warn" : "stop"}`}>{l.status}</span>
                        <span className="qa-layer-nm">{meta.index}. {meta.short}</span>
                        <span className="qa-layer-score">{l.score.toFixed(1)}</span>
                        <span className="qa-llrow-caret">{open ? "▾" : "▸"}</span>
                      </button>
                      {open && (
                        <div className="qa-llrow-detail">
                          {l.weaknesses.length > 0 ? (
                            <>
                              <div className="qa-d-label flag">What needs work</div>
                              <ul>{l.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
                              {fixes.length > 0 && <><div className="qa-d-label fix">How to revise</div><ul>{fixes.map((f, i) => <li key={i}>{f}</li>)}</ul></>}
                            </>
                          ) : (
                            <div className="qa-d-pass">✓ {l.strengths[0] ?? "Meets the standard — nothing to revise."}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

            <div className="sr-side-rest">
              <div className="panel sr-card">
                <div className="sr-card-head"><span>Editor suggestions ({rewrites.length})</span></div>
                <div className="sr-card-body">
                  {rewrites.length === 0 && <div className="faint tiny">No inline edits — the prose reads clean. ✓</div>}
                  {rewrites.length > 0 && (
                    <>
                      <div className="faint tiny" style={{ marginBottom: 8 }}>Click a <span className="qa-mark-legend">underlined phrase</span> in the article, or an item below — the fix opens here.</div>
                      {rewrites.map((s) => (
                        <button key={s.id} className={`sug-nav sev-${s.severity}`} onClick={() => editorRef.current?.activate(s)}>
                          <span className={`sr-dot ${s.severity}`} /> <b>{s.issueType}</b>
                          <span className="sug-nav-text">“{s.currentText}” → “{s.suggestedReplacement}”</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {advisories.length > 0 && (
                <details className="sr-muted">
                  <summary>Advisory <span className="sr-muted-count">{advisories.length}</span></summary>
                  <div className="sr-muted-body">
                    {advisories.map((s) => (
                      <div key={s.id} className={`adv-item sev-${s.severity}`}>
                        <div className="adv-head"><span className={`sr-dot ${s.severity}`} /> <b>{s.issueType}</b></div>
                        <div className="adv-note">{s.explanation}</div>
                        <button className="btn sm" onClick={() => jobStore.decideSuggestion(job.id, s.id, "rejected")}>Mark done</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <details className="sr-muted">
                <summary>Content checklist <span className={`sr-muted-count ${gaps.length ? "warn" : "ok"}`}>{coverage.length - gaps.length}/{coverage.length}</span></summary>
                <div className="sr-muted-body">
                  {coverage.map((c) => (
                    <div key={c.label} className={`sr-cov ${c.ok ? "ok" : "miss"}`}>
                      <span className="sr-cov-icon">{c.ok ? "✓" : "⚠"}</span>
                      <span className="sr-cov-label">{c.label}</span>
                      {!c.ok && c.fix && <button className="btn sm" onClick={c.fix.run}>{c.fix.label}</button>}
                    </div>
                  ))}
                </div>
              </details>

              <Comments job={job} />
            </div>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Claude generation: in-progress + failure screens                    */
/* ------------------------------------------------------------------ */

function GeneratingScreen({ job, starting }: { job: Job; starting: boolean }) {
  return (
    <div className="sr">
      <div className="sr-head"><div><h1 className="sr-title">{job.brief.title}</h1><div className="sr-sub">Generating with Claude</div></div></div>
      <div className="gen-stage">
        <div className="gen-spinner">✍️</div>
        <div className="gen-title">{starting ? "Claude generation started…" : "Writing your article with Claude (Opus 4.8)…"}</div>
        <div className="gen-sub">Reading the brief, applying the Sprout editorial standard, and drafting a publication-ready article. This usually takes 20–40 seconds.</div>
        <div className="gen-steps">
          <span>✓ Brief parsed</span><span>✓ Approved facts &amp; sources gathered</span><span className="on">• Writing &amp; quality-checking…</span>
        </div>
      </div>
    </div>
  );
}

function LLMFailed({ job, isAdmin, onViewBuiltIn }: { job: Job; isAdmin: boolean; onViewBuiltIn: () => void }) {
  const reason = job.llmReason ?? "error";
  const detail: Record<string, { title: string; body: React.ReactNode }> = {
    no_key: { title: "No Anthropic API key is set", body: <>Add <code>ANTHROPIC_API_KEY=sk-ant-…</code> to <code>.env.local</code> in the project root, then <b>restart</b> <code>npm run dev</code> (env vars load at server start). Then click Retry.</> },
    fallback: { title: "No Anthropic API key is set", body: <>Add <code>ANTHROPIC_API_KEY=sk-ant-…</code> to <code>.env.local</code>, then <b>restart</b> <code>npm run dev</code> and click Retry.</> },
    bad_key: { title: "Anthropic rejected the API key", body: <>The key returned a 401. Check that it&apos;s valid and active, update <code>.env.local</code>, restart, then Retry. {job.llmMessage}</> },
    quality: { title: "Claude&apos;s draft didn&apos;t meet the quality bar", body: <>Even after a revision pass, the article still had issues (below). We don&apos;t publish sub-par drafts. Retry, or refine the brief.</> },
    error: { title: "Claude generation failed", body: <>{job.llmMessage || "An unexpected error occurred."} Retry, or check the server logs.</> },
    thin_output: { title: "Claude returned too little content", body: <>The response was too short to be a complete article. Retry.</> },
  };
  const d = detail[reason] ?? detail.error;
  return (
    <div className="sr">
      <div className="sr-head"><div><h1 className="sr-title">{job.brief.title}</h1><div className="sr-sub">Draft not generated</div></div></div>
      <div className="callout danger" style={{ marginTop: 8 }}>
        <b>ContentOS could not generate a publication-ready draft.</b>
        <div style={{ marginTop: 6, fontWeight: 700 }}>{d.title}</div>
        <div style={{ marginTop: 4 }}>{d.body}</div>
        {reason === "quality" && job.llmIssues?.length ? <ul style={{ margin: "8px 0 0 18px" }}>{job.llmIssues.map((i, k) => <li key={k} className="tiny">{i}</li>)}</ul> : null}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={() => jobStore.retryLLM(job.id)}>↻ Retry Claude generation</button>
        {isAdmin && <button className="btn ghost sm" onClick={onViewBuiltIn}>View built-in draft (non-production) — Admin only</button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Failure condition — withhold the draft, show what's missing         */
/* ------------------------------------------------------------------ */

function GenerationFailed({ job }: { job: Job }) {
  const gen = job.generationReport!;
  const ag = job.brief.agencyExtract;
  const extracted: [string, string][] = [
    ["H1 / title", job.brief.title || "—"],
    ["Required sections", ag?.outline?.filter((o) => !/^(h1|intro|faq|cta)$/i.test(o.heading.trim())).length ? `${ag.outline.filter((o) => !/^(h1|intro|faq|cta)$/i.test(o.heading.trim())).length} found` : "none detected"],
    ["Pain points", (job.brief.painPoints ?? []).join(", ") || "none detected"],
    ["Primary keyword", job.brief.primaryKeyword || "none detected"],
    ["Products", (job.brief.products ?? []).join(", ") || "none detected"],
    ["CTA", job.brief.cta || ag?.ctaText || "none detected"],
  ];
  return (
    <div className="sr">
      <div className="sr-head"><div><h1 className="sr-title">{job.brief.title}</h1><div className="sr-sub">Draft withheld</div></div></div>
      <div className="callout danger sr-banner">
        <b>ContentOS could not generate a complete draft because the brief was not fully parsed.</b>
        <div style={{ marginTop: 4 }}>Please review the extraction checklist below or regenerate. We don&apos;t show a draft we can&apos;t stand behind.</div>
      </div>
      <div className="sr-cols">
        <div className="panel sr-card">
          <div className="sr-card-head"><span>Validation checklist</span></div>
          <div className="sr-card-body">
            {gen.checks.map((c) => (
              <div key={c.label} className={`sr-cov ${c.ok ? "ok" : "miss"}`}>
                <span className="sr-cov-icon">{c.ok ? "✓" : "✗"}</span>
                <span className="sr-cov-label">{c.label}{c.detail ? ` — ${c.detail}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel sr-card">
          <div className="sr-card-head"><span>What we extracted</span></div>
          <div className="sr-card-body">
            {extracted.map(([k, v]) => (<div key={k} className="sr-cov"><span className="sr-cov-label"><b>{k}:</b> {v}</span></div>))}
            <button className="btn primary" style={{ marginTop: 10 }} onClick={() => jobStore.regenerateAll(job.id)}>↻ Regenerate draft</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editable document block                                            */
/* ------------------------------------------------------------------ */

function EditableBlock({ job, block, disabled, onSave }: { job: Job; block: ContentBlock; disabled: boolean; onSave?: (s: SaveState) => void }) {
  const [text, setText] = useState(block.text);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const change = (v: string) => { setText(v); onSave?.("unsaved"); };
  const commit = () => { if (text !== block.text) { onSave?.("saving"); jobStore.editBlockText(job.id, block.id, text); } onSave?.("saved"); setFocused(false); };

  const wrap = (before: string, after = before, prefix = false) => {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    if (prefix) { change(`${before}${text}`); return; }
    const sel = text.slice(s, e) || "text";
    change(text.slice(0, s) + before + sel + after + text.slice(e));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = s + before.length; el.selectionEnd = s + before.length + sel.length; });
  };

  if (block.kind === "meta") {
    const [label, ...rest] = block.text.split(":");
    return (
      <div className="doc-meta">
        <span className="doc-meta-label">{label}</span>
        <input className="doc-meta-input" defaultValue={rest.join(":").trim()} disabled={disabled} onChange={() => onSave?.("unsaved")} onBlur={(e) => { const v = `${label}: ${e.target.value}`; if (v !== block.text) { onSave?.("saving"); jobStore.editBlockText(job.id, block.id, v); } onSave?.("saved"); }} />
      </div>
    );
  }

  const isHeading = block.kind === "h1" || block.kind === "h2" || block.kind === "h3";
  const showToolbar = focused && !disabled && (block.kind === "paragraph" || block.kind === "list");
  return (
    <div className={`doc-block doc-${block.kind}`}>
      {isHeading && block.kind !== "h1" && !disabled && (
        <button className="doc-regen" title="Regenerate this section from the brief" onMouseDown={(e) => e.preventDefault()} onClick={() => jobStore.regenerateSection(job.id, block.id)}>↻ Regenerate</button>
      )}
      {block.kind === "cta" && <span className="doc-cta-tag">CTA</span>}
      {showToolbar && (
        <div className="fmt-toolbar" onMouseDown={(e) => e.preventDefault()}>
          <button title="Bold" onClick={() => wrap("**")}><b>B</b></button>
          <button title="Italic" onClick={() => wrap("*")}><i>I</i></button>
          <button title="Link" onClick={() => wrap("[", "](https://sprout.ph/)")}>🔗</button>
          <button title="Bulleted item" onClick={() => wrap("- ", "", true)}>• List</button>
        </div>
      )}
      <textarea
        className={`doc-input doc-${block.kind}-input`}
        value={text}
        disabled={disabled}
        rows={1}
        onFocus={() => setFocused(true)}
        onChange={(e) => change(e.target.value)}
        onBlur={commit}
        onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }}
        ref={(el) => { ref.current = el; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
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
