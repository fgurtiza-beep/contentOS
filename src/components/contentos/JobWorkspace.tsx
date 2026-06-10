"use client";

import React, { Fragment, useState } from "react";
import Link from "next/link";
import { useJob } from "@/lib/contentos/store/useStore";
import { primaryDraft } from "@/lib/contentos/orchestrator/contentOrchestrator";
import { WorkflowStepper } from "./WorkflowStepper";
import { AgentWorkflowProgress } from "./AgentWorkflowProgress";
import { CanonicalNarrativePanel } from "./CanonicalNarrativePanel";
import { BlueprintPanel } from "./BlueprintPanel";
import { ClaimsPanel } from "./AgentOutputPanel";
import { DraftView } from "./DraftEditor";
import { QAReviewWorkspace } from "./QAReviewWorkspace";
import { ExportPanel } from "./ExportPanel";
import { AuditTrail } from "./AuditTrail";
import { RiskBadge, StateBadge, ScorePill } from "./badges";
import { JOB_TYPES } from "@/lib/contentos/schemas/contentos";
import type { EditorBrief } from "@/lib/contentos/schemas/contentos";

type Tab = "overview" | "agent" | "qa" | "export" | "audit";

export function JobWorkspace({ id }: { id: string }) {
  const job = useJob(id);
  const [tab, setTab] = useState<Tab>("qa");

  if (!job) {
    return (
      <div className="content">
        <div className="empty">
          Job not found (the in-memory store resets on reload). <Link href="/contentos">Back to workspace</Link>.
        </div>
      </div>
    );
  }

  const report = job.finalQaReport ?? job.qaReport;
  const jobTypeLabel = JOB_TYPES.find((t) => t.value === job.brief.jobType)?.label ?? job.brief.jobType;
  const prod = job.production;
  const rep = job.repurposing;
  const narrative = prod?.canonicalNarrative ?? rep?.canonicalNarrative;
  const blueprint = prod?.blueprint ?? rep?.blueprint;
  const pim = prod?.problemIntentMap ?? rep?.pim;

  return (
    <div className="content wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <Link href="/contentos" className="tiny faint">← Workspace</Link>
          <h1 style={{ marginTop: 4 }}>{job.brief.title}</h1>
          <p style={{ marginTop: 4 }}>{jobTypeLabel} · {job.lane} agent · {job.brief.primaryICP} · owner {job.owner.split("@")[0]}</p>
        </div>
        <div className="btn-row">
          {report && <ScorePill score={report.overallScore} />}
          <RiskBadge tier={job.risk?.tier ?? null} />
          <StateBadge state={job.state} />
        </div>
      </div>

      <div className="qa-split" style={{ gridTemplateColumns: "1fr 300px", marginBottom: 16 }}>
        <div className="panel panel-pad">
          <h3 style={{ marginBottom: 12, fontSize: 13 }}>Lifecycle</h3>
          <WorkflowStepper state={job.state} />
        </div>
        <AgentWorkflowProgress job={job} />
      </div>

      {job.risk && (
        <div className={`callout ${job.risk.tier === 2 ? "danger" : job.risk.tier === 1 ? "warn" : ""}`} style={{ marginBottom: 16 }}>
          <b>Risk {job.risk.tier}.</b> {job.risk.rationale}
          <ul className="bullets" style={{ marginBottom: 0 }}>{job.risk.signals.map((s, i) => <li key={i} className="tiny">{s}</li>)}</ul>
        </div>
      )}

      <div className="tabs">
        {(([
          ["qa", "QA review"],
          !job.qaOnly && ["agent", "Agent outputs"],
          !job.qaOnly && ["overview", "Brief"],
          ["export", "Export"],
          ["audit", "Audit"],
        ].filter(Boolean)) as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === "qa" && <QAReviewWorkspace job={job} onGoExport={() => setTab("export")} />}

      {tab === "agent" && (
        <div className="grid" style={{ gap: 16 }}>
          {job.lane === "video_intelligence" ? (
            <EditorBriefWorkspacePanel brief={job.jobEditorBrief} jobTitle={job.brief.title} />
          ) : (
            <>
              <DraftView draft={job.lane === "production" ? primaryDraft(job) : null} derivatives={rep?.derivatives} />
              <div className="grid grid-2">
                {narrative && <CanonicalNarrativePanel n={narrative} />}
                {blueprint && pim && <BlueprintPanel blueprint={blueprint} pim={pim} />}
              </div>
              <ClaimsPanel
                productClaims={prod?.productClaims ?? []}
                factualClaims={prod?.factualClaims ?? []}
                sourceMap={(prod?.sourceMap ?? rep?.sourceMap) ?? []}
              />
            </>
          )}
        </div>
      )}

      {tab === "overview" && <BriefView job={job} />}
      {tab === "export" && <ExportPanel job={job} />}
      {tab === "audit" && <AuditTrail jobId={job.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor Brief panel (video_intelligence lane)
// ---------------------------------------------------------------------------

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function EditorBriefWorkspacePanel({ brief, jobTitle }: { brief: EditorBrief | undefined; jobTitle: string }) {
  const [activeTab, setActiveTab] = useState<"preview" | "markdown">("preview");

  if (!brief) {
    return (
      <div className="panel panel-pad">
        <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
          <b>No editor brief yet.</b> Approve at least one clip in Human Review → Video clip candidates to generate the brief.
        </div>
      </div>
    );
  }

  const slug = jobTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const seqLen = brief.clipSequence.filter((r) => r.rowType === "clip").length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Editor Brief</span>
          <span className="sub" style={{ marginLeft: 8 }}>
            {seqLen} clip{seqLen !== 1 ? "s" : ""} · ~{fmtBriefSec(brief.targetLengthSec)} · {brief.videoType}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={() => downloadBlob(`editor-brief-${slug}.md`, brief.markdownExport, "text/markdown")}>
            ↓ Markdown
          </button>
          <button className="btn sm" onClick={() => downloadBlob(`editor-brief-${slug}.html`, brief.pdfHtmlExport, "text/html")}>
            ↓ PDF (HTML)
          </button>
        </div>
      </div>

      <div style={{ borderBottom: "1px solid var(--border)", display: "flex" }}>
        {(["preview", "markdown"] as const).map((t) => (
          <button key={t} className={`tab ${activeTab === t ? "active" : ""}`}
            style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => setActiveTab(t)}>
            {t === "preview" ? "Brief preview" : "Markdown source"}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 24px" }}>
        {activeTab === "preview" ? (
          <EditorBriefPreview brief={brief} />
        ) : (
          <pre style={{
            fontFamily: "monospace", fontSize: 12, lineHeight: 1.6,
            whiteSpace: "pre-wrap", color: "var(--text)", margin: 0,
            background: "var(--bg-subtle)", padding: 16, borderRadius: 6,
            maxHeight: 640, overflowY: "auto",
          }}>
            {brief.markdownExport}
          </pre>
        )}
      </div>
    </div>
  );
}

function EditorBriefPreview({ brief }: { brief: EditorBrief }) {
  const colorSwatches = brief.brandColors.map((c) => (
    <span key={c} title={c} style={{
      display: "inline-block", width: 16, height: 16, borderRadius: 3,
      background: c, border: "1px solid rgba(0,0,0,0.1)", verticalAlign: "middle", marginRight: 3,
    }} />
  ));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontSize: 13 }}>

      {/* 1. Project Overview */}
      <BriefSection label="1. Project Overview">
        <dl className="kv tiny">
          <dt>Video type</dt><dd>{brief.videoType}</dd>
          <dt>Target length</dt><dd>~{fmtBriefSec(brief.targetLengthSec)}</dd>
          <dt>Deadline</dt><dd>{brief.deadline}</dd>
          <dt>Platforms</dt><dd>{brief.platforms.map((p) => `${p.name} (${p.aspectRatio})`).join(" · ")}</dd>
        </dl>
      </BriefSection>

      {/* 2. Audience & Intent */}
      <BriefSection label="2. Audience & Intent">
        <dl className="kv tiny">
          <dt>Who this is for</dt><dd>{brief.audience}</dd>
          <dt>Intent</dt><dd>{brief.intent}</dd>
          <dt>Outro CTA</dt><dd>{brief.outroCta}</dd>
        </dl>
      </BriefSection>

      {/* 3. Brand Guidelines */}
      <BriefSection label="3. Brand Guidelines">
        <div style={{ marginBottom: 8 }}>
          <span className="tiny" style={{ color: "var(--text-muted)", marginRight: 8 }}>Colors:</span>
          {colorSwatches}
          <span className="tiny mono" style={{ color: "var(--text-faint)", marginLeft: 4 }}>{brief.brandColors.join(" · ")}</span>
        </div>
        <dl className="kv tiny">
          <dt>Subtitle font</dt><dd>{brief.subtitleFont} — {brief.subtitleStyle}</dd>
          <dt>Logo usage</dt><dd>{brief.logoUsageNote}</dd>
        </dl>
      </BriefSection>

      {/* 4. Important Links */}
      <BriefSection label="4. Important Links">
        <dl className="kv tiny">
          <dt>Raw video files</dt><dd className="mono">{brief.rawVideoFilesUrl}</dd>
          <dt>Transcript</dt><dd className="mono">{brief.transcriptUrl}</dd>
          <dt>Landing page</dt><dd className="mono">{brief.landingPageUrl}</dd>
          <dt>Reference assets</dt><dd className="mono">{brief.referenceAssetsUrl}</dd>
          <dt>Inspiration</dt><dd className="mono">{brief.inspirationUrl}</dd>
        </dl>
      </BriefSection>

      {/* 5. Clip Sequence */}
      <BriefSection label="5. Clip Sequence">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                {["#", "Speaker / Company", "In", "Out", "Sound Bite / Card Copy", "Visual Instruction"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brief.clipSequence.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-light)", background: row.rowType !== "clip" ? "var(--bg-subtle)" : "transparent" }}>
                  <td style={{ padding: "5px 8px", fontWeight: row.rowType !== "clip" ? 700 : 400 }}>
                    {row.rowType === "title_card" ? "Title Card" : row.rowType === "end_card" ? "End Card" : row.clipNumber}
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    {row.rowType === "clip" ? <>{row.speakerName}<br /><span className="faint">{row.company}</span></> : "—"}
                  </td>
                  <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{row.timestampIn || "—"}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{row.timestampOut || "—"}</td>
                  <td style={{ padding: "5px 8px", fontStyle: row.rowType === "clip" ? "italic" : "normal", fontWeight: row.rowType !== "clip" ? 600 : 400, maxWidth: 260 }}>
                    {row.rowType === "clip" ? row.soundbite : row.cardCopy}
                  </td>
                  <td style={{ padding: "5px 8px", color: "var(--text-muted)", maxWidth: 200 }}>{row.visualInstruction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BriefSection>

      {/* 6. Floating Text */}
      {brief.floatingText.length > 0 && (
        <BriefSection label="6. Floating Text">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                {["Clip #", "Text", "Placement"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brief.floatingText.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "5px 8px" }}>{row.clipNumber}</td>
                  <td style={{ padding: "5px 8px", fontStyle: "italic" }}>{row.text}</td>
                  <td style={{ padding: "5px 8px", color: "var(--text-muted)" }}>{row.placement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </BriefSection>
      )}

      {/* 7. Audio & Music */}
      <BriefSection label="7. Audio & Music">
        <dl className="kv tiny">
          <dt>Mood / genre</dt><dd>{brief.musicMood}</dd>
          <dt>Specific tracks</dt><dd>{brief.specificTracks}</dd>
          <dt>Pacing note</dt><dd>{brief.pacingNote}</dd>
          <dt>Primary audio</dt><dd>{brief.primaryAudioNote}</dd>
        </dl>
      </BriefSection>

      {/* 8. Visual Style Notes */}
      <BriefSection label="8. Visual Style Notes">
        <pre style={{ fontFamily: "inherit", whiteSpace: "pre-line", fontSize: 12.5, lineHeight: 1.65, color: "var(--text)", margin: 0 }}>
          {brief.visualStyleNotes}
        </pre>
      </BriefSection>

      {/* 9. Subtitles */}
      <BriefSection label="9. Subtitles">
        <dl className="kv tiny">
          <dt>Font</dt><dd>{brief.subtitleFontName}</dd>
          <dt>Color</dt><dd>{brief.subtitleColor}</dd>
          <dt>Background</dt><dd>{brief.subtitleBackgroundStyle}</dd>
          <dt>Timing</dt><dd>{brief.subtitleTiming}</dd>
        </dl>
      </BriefSection>

      {/* 10. Editor Checklist */}
      <BriefSection label="10. Editor Checklist">
        <ul style={{ listStyle: "none", padding: 0, fontSize: 12.5 }}>
          {[
            "All timestamps verified against source footage",
            "Brand colors used throughout — no off-brand grays or blues",
            "Subtitle style applied (Helvetica Neue, white on semi-transparent box)",
            "CTA end card included with correct copy",
            "All dimensions exported (16:9 · 9:16 · 1:1)",
            "File naming followed: [ProjectTitle]_[Dimension]_v01.mp4",
          ].map((item) => (
            <li key={item} style={{ padding: "4px 0", borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 14, height: 14, border: "1.5px solid var(--text-muted)", borderRadius: 3, flexShrink: 0 }} />
              {item}
            </li>
          ))}
        </ul>
      </BriefSection>

    </div>
  );
}

function BriefSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8, borderBottom: "1px solid var(--border-light)", paddingBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function fmtBriefSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------------------------------------------------------------------------

function BriefView({ job }: { job: ReturnType<typeof useJob> }) {
  if (!job) return null;
  const b = job.brief;
  const entries: [string, string][] = [
    ["Objective", b.objective],
    ["Primary ICP", b.primaryICP],
    ["Secondary ICPs", b.secondaryICPs.join(", ") || "—"],
    ["Industry / segment", `${b.industry} · ${b.segment}`],
    ["Persona", b.persona],
    ["Readiness", b.readiness],
    ["Content intent", b.contentIntent.join(", ")],
    ["Tone / length", `${b.tone} · ${b.length}`],
    ["Channel", b.channel],
    ["Product (GTM Studio)", b.product || "None"],
    ["Campaign", b.campaign || "—"],
    ["SEO keyword", b.seoKeyword || "—"],
    ["CTA", b.cta || "—"],
    ["Pain points", b.painPoints.join(", ") || "—"],
    ["Must include", b.mustInclude.join(", ") || "—"],
    ["Must avoid", b.mustAvoid.join(", ") || "—"],
    ["Compliance context", b.complianceContext || "—"],
    ["Datasets", b.datasets.join(", ") || "—"],
    ["Risk sensitivity", b.riskSensitivity],
  ];
  return (
    <div className="grid grid-2">
      <div className="panel">
        <div className="panel-head"><h3>Standardized brief</h3></div>
        <div className="panel-pad">
          <dl className="kv">{entries.map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>))}</dl>
        </div>
      </div>
      <div className="grid" style={{ gap: 16 }}>
        {b.sourceAsset && (
          <div className="panel">
            <div className="panel-head"><h3>Source asset (IMD 2.0)</h3><span className={`state ${b.sourceAsset.approved ? "go" : "stop"}`}>{b.sourceAsset.approved ? "Approved" : "Not approved"}</span></div>
            <div className="panel-pad">
              <dl className="kv">
                <dt>Title</dt><dd>{b.sourceAsset.title}</dd>
                <dt>Origin / type</dt><dd>{b.sourceAsset.origin} · {b.sourceAsset.assetType}</dd>
                <dt>URL</dt><dd className="mono">{b.sourceAsset.url || "—"}</dd>
              </dl>
              <div className="muted tiny" style={{ marginTop: 8 }}>{b.sourceAsset.content}</div>
            </div>
          </div>
        )}
        {b.regulatory && (
          <div className="panel panel-pad">
            <h3 style={{ marginBottom: 8 }}>Regulatory addendum</h3>
            <dl className="kv">
              <dt>Issuing body</dt><dd>{b.regulatory.issuingBody}</dd>
              <dt>Effective</dt><dd>{b.regulatory.effectiveDate}</dd>
              <dt>Affected</dt><dd>{b.regulatory.affectedAudience}</dd>
              <dt>Legal review</dt><dd>{b.regulatory.legalReviewNeeded ? "Needed" : "No"}</dd>
            </dl>
          </div>
        )}
        {b.competitorAddendum && (
          <div className="panel panel-pad">
            <h3 style={{ marginBottom: 8 }}>Competitor addendum</h3>
            <dl className="kv">
              <dt>Competitor</dt><dd>{b.competitorAddendum.competitorName}</dd>
              <dt>Naming allowed</dt><dd>{b.competitorAddendum.allowedToNameCompetitor ? "Yes" : "No"}</dd>
              <dt>Comparisons</dt><dd>{b.competitorAddendum.comparisonsPermitted ? "Permitted" : "No"}</dd>
              <dt>Prohibited</dt><dd>{b.competitorAddendum.prohibitedClaims.join(", ")}</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
