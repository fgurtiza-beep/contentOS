"use client";

import { Fragment, useState } from "react";
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
        </div>
      )}

      {tab === "overview" && <BriefView job={job} />}
      {tab === "export" && <ExportPanel job={job} />}
      {tab === "audit" && <AuditTrail jobId={job.id} />}
    </div>
  );
}

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
