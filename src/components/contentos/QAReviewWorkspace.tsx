"use client";

import { useState } from "react";
import type { HookAlternative, HookQAResult, Job, QALayerKey, QAReport } from "@/lib/contentos/schemas/contentos";
import { QA_LAYERS } from "@/lib/contentos/schemas/contentos";
import { jobStore } from "@/lib/contentos/store/useStore";
import { primaryDraft } from "@/lib/contentos/orchestrator/contentOrchestrator";
import { SideBySideComparison } from "./SideBySideComparison";
import { QAScorecard } from "./QAScorecard";
import { ChangeSuggestionCard } from "./ChangeSuggestionCard";
import { RoutingBadge, ScorePill } from "./badges";

const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3 } as const;

export function QAReviewWorkspace({ job, onGoExport }: { job: Job; onGoExport: () => void }) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const report = job.finalQaReport ?? job.qaReport;
  const draft = primaryDraft(job);
  if (!report || !draft) return <div className="empty">No QA report yet.</div>;

  const suggestions = [...report.suggestions].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const pending = suggestions.filter((s) => s.decision === "pending").length;
  const decided = suggestions.length - pending;
  const layersWithSugs = QA_LAYERS.filter((l) => suggestions.some((s) => s.layer === l.key));

  return (
    <div>
      <div className="panel panel-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <RoutingBadge routing={report.routing} />
        <ScorePill score={report.overallScore} />
        <span className="muted tiny" style={{ flex: 1 }}>{report.routingReason}</span>
        <span className="faint tiny">{decided}/{suggestions.length} decided · {pending} pending</span>
      </div>

      {report.criticalFixes.length > 0 && (
        <div className="callout danger" style={{ marginBottom: 16 }}>
          <b>Critical fixes:</b>
          <ul className="bullets" style={{ marginBottom: 0 }}>{report.criticalFixes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}

      <div className="qa-split">
        {/* LEFT: editable content */}
        <SideBySideComparison
          draft={draft}
          suggestions={suggestions}
          activeBlockId={activeBlockId}
          onSelectBlock={setActiveBlockId}
          onEditBlock={(blockId, text) => jobStore.editBlockText(job.id, blockId, text)}
        />

        {/* RIGHT: QA feedback */}
        <div>
          <HookAlternativesPanel job={job} report={report} />
          <QAScorecard report={report} />
          <ValidationPanels job={job} />

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head">
              <h3>Flagged issues & fixes</h3>
              <span className="sub">each maps to its content block</span>
            </div>
            <div className="panel-pad">
              {suggestions.length === 0 && <div className="faint">No issues flagged. Clean draft.</div>}
              {layersWithSugs.map((layer) => {
                const sugs = suggestions.filter((s) => s.layer === layer.key);
                return (
                  <div key={layer.key} style={{ marginBottom: 16 }}>
                    <div className="section-actions" style={{ alignItems: "center" }}>
                      <span className="tiny" style={{ fontWeight: 700, color: "var(--green-deep)" }}>{layer.name}</span>
                      <span className="faint tiny">({sugs.length})</span>
                      <button className="btn sm ghost" onClick={() => jobStore.acceptAllByLayer(job.id, layer.key as QALayerKey)}>
                        Accept all {layer.short} fixes
                      </button>
                    </div>
                    {sugs.map((s) => (
                      <ChangeSuggestionCard
                        key={s.id}
                        s={s}
                        onFocus={() => setActiveBlockId(s.blockId)}
                        onAccept={() => jobStore.decideSuggestion(job.id, s.id, "accepted")}
                        onReject={() => jobStore.decideSuggestion(job.id, s.id, "rejected")}
                        onEdit={(text) => jobStore.decideSuggestion(job.id, s.id, "edited", text)}
                        onSendHuman={() => jobStore.decideSuggestion(job.id, s.id, "sent_to_human")}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Global controls — Accept All emphasized, at the very bottom */}
      <div className="actionbar">
        <h4>Bulk & global controls</h4>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn sm" onClick={() => jobStore.applyOnlyCritical(job.id)}>Apply only critical corrections</button>
          <button className="btn sm" onClick={() => jobStore.applyHighConfidence(job.id)}>Apply all high-confidence suggestions</button>
          <button className="btn sm" onClick={() => jobStore.applyProductAccuracyFixes(job.id)}>Apply all product fixes</button>
          <button className="btn sm" onClick={() => jobStore.applyComplianceLegalFixes(job.id)}>Apply all compliance fixes</button>
          <button className="btn sm" onClick={() => jobStore.rejectAll(job.id)}>Reject all changes</button>
          <button className="btn sm" onClick={() => jobStore.sendAllToHuman(job.id)}>Send to human review</button>
        </div>
        <div className="divider" />
        <div className="btn-row" style={{ alignItems: "center" }}>
          <button className="btn" onClick={() => jobStore.applyChangesAndRunFinalQA(job.id)}>Submit to Final QA →</button>
          <button className="btn" onClick={onGoExport}>Export →</button>
          <div style={{ flex: 1 }} />
          <button className="btn green accept-all" onClick={() => jobStore.acceptAll(job.id)}>✓ Accept All Changes</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Hook Alternatives Panel ---- */

function HookAlternativesPanel({ job, report }: { job: Job; report: QAReport }) {
  const hookQA = report.hookQA;
  if (!hookQA || hookQA.alternatives.length === 0) return null;

  const banned  = hookQA.bannedPatternHit;
  const subtext = banned
    ? `banned pattern detected: "${banned}"`
    : `score ${hookQA.totalScore}/9 — below the 7-point threshold`;

  return (
    <div className="panel" style={{ marginBottom: 16, borderColor: "#8139ee55", borderWidth: 2 }}>
      <div className="panel-head" style={{ background: "#8139ee0e" }}>
        <h3 style={{ color: "#8139ee" }}>Hook Alternatives</h3>
        <span className="sub">{subtext}</span>
      </div>
      <div className="panel-pad">
        <div style={{ marginBottom: 12 }}>
          <div className="tiny" style={{ color: "var(--red)", marginBottom: 4, fontWeight: 700 }}>Current opening line</div>
          <div className="muted" style={{ fontStyle: "italic", marginBottom: 8 }}>"{hookQA.firstLine}"</div>
          <HookScoreRow breakdown={hookQA.breakdown} total={hookQA.totalScore} banned={!!banned} />
        </div>
        <div className="divider" />
        <div style={{ marginTop: 12 }}>
          {hookQA.alternatives.map((alt, i) => (
            <div key={i} style={{ marginBottom: 10, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 6, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div className="tiny faint" style={{ marginBottom: 4 }}>Alt {i + 1}</div>
                <div className="muted" style={{ marginBottom: 6 }}>"{alt.line}"</div>
                <HookScoreRow breakdown={alt.breakdown} total={alt.score} banned={false} />
              </div>
              <button
                className="btn sm"
                style={{ flexShrink: 0, marginTop: 2 }}
                onClick={() => jobStore.acceptHookAlternative(job.id, alt.line)}
              >
                Accept
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HookScoreRow({ breakdown, total, banned }: { breakdown: HookAlternative["breakdown"]; total: number; banned: boolean }) {
  const color = (banned || total < 7) ? "#e53e3e" : total >= 8 ? "#31ce13" : "#f6ad55";
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span className="chip tiny">Specificity {breakdown.specificity}/3</span>
      <span className="chip tiny">Pattern {breakdown.patternInterrupt}/3</span>
      <span className="chip tiny">ICP fit {breakdown.icpRelevance}/3</span>
      <span className="chip tiny" style={{ background: color + "22", color, fontWeight: 700 }}>
        {banned ? "0 (banned)" : `${total}/9`}
      </span>
    </div>
  );
}

/* ---- Product & Compliance validation summaries ---- */

function ValidationPanels({ job }: { job: Job }) {
  const claims = job.production?.productClaims ?? [];
  const verified = claims.filter((c) => c.status === "verified");
  const unverified = claims.filter((c) => c.status !== "verified");
  const tier = job.risk?.tier ?? 0;
  const complianceFlagged = !!job.brief.complianceContext || !!job.brief.regulatory;
  const legal = !!job.brief.regulatory?.legalReviewNeeded;

  return (
    <div className="grid grid-2" style={{ marginTop: 16 }}>
      <div className="panel">
        <div className="panel-head"><h3 style={{ fontSize: 13 }}>Product validation</h3><span className={`state ${unverified.length ? "stop" : "go"}`}>{unverified.length ? `${unverified.length} unverified` : "All traced"}</span></div>
        <div className="panel-pad">
          {claims.length === 0 && <div className="faint tiny">No product claims in this content.</div>}
          {verified.length > 0 && <div className="tiny muted" style={{ marginBottom: 6 }}>✓ {verified.length} claim(s) traced to GTM Studio.</div>}
          {unverified.map((c) => (
            <div key={c.id} className="callout danger" style={{ marginBottom: 6 }}>
              <div className="tiny"><b>UNVERIFIED:</b> {c.text || "(claim)"}</div>
              <div className="faint tiny" style={{ marginTop: 2 }}>{c.note}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3 style={{ fontSize: 13 }}>Compliance validation</h3><span className={`state ${tier === 2 ? "stop" : complianceFlagged ? "warn" : "go"}`}>Tier {tier}</span></div>
        <div className="panel-pad">
          <dl className="kv tiny">
            <dt>Compliance content</dt><dd>{complianceFlagged ? "Present — disclaimer required" : "None detected"}</dd>
            <dt>Legal review</dt><dd>{legal ? "Flagged — required before export" : "Not flagged"}</dd>
            <dt>Competitive claims</dt><dd>{job.brief.competitor || job.brief.competitorAddendum ? "Present (Tier 2)" : "None"}</dd>
            <dt>Export gate</dt><dd>{tier === 2 ? "Human approval required" : "QA pass sufficient"}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
