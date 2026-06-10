"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useJobs, jobStore } from "@/lib/contentos/store/useStore";
import { primaryDraft } from "@/lib/contentos/orchestrator/contentOrchestrator";
import { DraftView } from "./DraftEditor";
import { RiskBadge } from "./badges";
import { JOB_TYPES, type HumanReviewKind, type Job } from "@/lib/contentos/schemas/contentos";

const REVIEWER = "marketing@sprout.ph";

const REASON_TEXT: Record<HumanReviewKind, { reason: string; verify: string; action: string }> = {
  tier2: { reason: "Tier 2 content requires human sign-off.", verify: "Confirm the claims and framing are appropriate for high-risk content.", action: "Review and approve if accurate." },
  unresolved_product_claim: { reason: "Product differentiation claims detected.", verify: "Validate every product claim against GTM Studio.", action: "Validate product positioning." },
  unresolved_factual_claim: { reason: "Unverified data or factual claims.", verify: "Check cited stats and datasets are accurate and approved.", action: "Verify the data before approving." },
  compliance_sensitive: { reason: "Compliance-sensitive content.", verify: "Confirm the non-legal-advice disclaimer is present and correct.", action: "Confirm compliance framing." },
  legal_sensitive: { reason: "Legal-sensitive content.", verify: "Confirm legal review has happened and language avoids legal advice.", action: "Route to legal if not yet reviewed." },
  competitive_claim: { reason: "Competitor claims present.", verify: "Confirm comparisons are permitted and factually defensible.", action: "Verify competitive claims." },
  executive_thought_leadership: { reason: "High-visibility executive content.", verify: "Confirm tone and positioning match executive standards.", action: "Review for executive readiness." },
  blocked_output: { reason: "QA blocked this output.", verify: "Review the fundamental QA issues that triggered the block.", action: "Rework or kill." },
  failed_revisions: { reason: "Failed two QA revision attempts.", verify: "Decide whether to approve, edit directly, or kill.", action: "Make a final call." },
  flagged_clip_content: { reason: "Clip candidates contain product claims or regulatory language.", verify: "Review each flagged clip in the Clip Approval Queue and confirm accuracy before publishing.", action: "Approve or reject flagged clips." },
};

function jobTypeLabel(j: Job) {
  return j.qaOnly ? "QA Check" : JOB_TYPES.find((t) => t.value === j.brief.jobType)?.label ?? j.brief.jobType;
}
function primaryReason(j: Job): HumanReviewKind | null {
  const order: HumanReviewKind[] = ["blocked_output", "unresolved_product_claim", "legal_sensitive", "compliance_sensitive", "competitive_claim", "tier2", "executive_thought_leadership", "unresolved_factual_claim", "failed_revisions", "flagged_clip_content"];
  const reasons = j.humanReview?.reasons ?? [];
  return order.find((r) => reasons.includes(r)) ?? reasons[0] ?? null;
}

export function HumanReviewQueue() {
  const jobs = useJobs();
  const queue = jobs.filter((j) => j.state === "HUMAN_REVIEW" || j.state === "HELD");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = queue.find((j) => j.id === openId);

  return (
    <div className="content wide">
      <div className="page-head">
        <h1>Human Review</h1>
        <p>{open ? "Review the content on the left against the summary on the right, then decide." : "Content that needs a human decision. Each card tells you why and what to check."}</p>
      </div>

      {queue.length === 0 && <div className="panel empty">Queue is clear. Nothing awaiting human review.</div>}

      {!open && queue.length > 0 && (
        <div className="choice-grid three">
          {queue.map((j) => {
            const pr = primaryReason(j);
            const info = pr ? REASON_TEXT[pr] : null;
            const tierCls = j.risk?.tier === 2 ? "t2" : j.risk?.tier === 1 ? "t1" : "";
            return (
              <div key={j.id} className={`rcard ${tierCls}`}>
                <div className="rrow">
                  <RiskBadge tier={j.risk?.tier ?? null} />
                  <span className="faint tiny">{jobTypeLabel(j)}</span>
                </div>
                <div className="rt">{j.brief.title}</div>
                <div className="reason"><b>Reason:</b> {info?.reason ?? "Routed for review."}</div>
                {info && <div className="rec">Recommended: {info.action}</div>}
                <button className="btn primary sm" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => setOpenId(j.id)}>Review →</button>
              </div>
            );
          })}
        </div>
      )}

      {open && <ReviewDetail job={open} onBack={() => setOpenId(null)} />}
    </div>
  );
}

function ReviewDetail({ job, onBack }: { job: Job; onBack: () => void }) {
  const router = useRouter();
  const [advanced, setAdvanced] = useState(false);
  const [note, setNote] = useState("");
  const draft = primaryDraft(job);
  const reasons = job.humanReview?.reasons ?? [];
  const pr = primaryReason(job);
  const report = job.finalQaReport ?? job.qaReport;
  const unverified = (job.production?.productClaims ?? []).filter((c) => c.status !== "verified");

  const verifyItems = Array.from(new Set(reasons.map((r) => REASON_TEXT[r]?.verify).filter(Boolean)));
  const recommended = pr ? REASON_TEXT[pr].action : "Review and decide.";

  return (
    <>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 12 }}>← Back to queue</button>
      <div className="qa-split">
        {/* LEFT: content */}
        <DraftView draft={draft} derivatives={job.repurposing?.derivatives} />

        {/* RIGHT: review summary */}
        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head"><h3>Review summary</h3><RiskBadge tier={job.risk?.tier ?? null} /></div>
            <div className="panel-pad">
              <Q label="Why am I reviewing this?">{pr ? REASON_TEXT[pr].reason : "Routed for review."}</Q>
              <Q label="What is risky?">
                <ul className="bullets" style={{ marginBottom: 0 }}>
                  {reasons.map((r) => <li key={r} className="muted">{REASON_TEXT[r]?.reason ?? r}</li>)}
                  {unverified.map((c) => <li key={c.id} style={{ color: "var(--red)" }}>Unverified: {c.text || "product claim"}</li>)}
                </ul>
              </Q>
              <Q label="What should I verify?">
                <ul className="bullets" style={{ marginBottom: 0 }}>{verifyItems.map((v, i) => <li key={i} className="muted">{v}</li>)}</ul>
              </Q>
              <Q label="Recommended decision"><span className="rec" style={{ display: "inline-block" }}>{recommended}</span></Q>
            </div>
          </div>

          <div className="panel panel-pad">
            <div className="field"><label>Note (optional)</label><input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for your decision" /></div>
            <div className="btn-row">
              <button className="btn green" onClick={() => { jobStore.reviewApprove(job.id, REVIEWER); onBack(); }}>Approve</button>
              <button className="btn" onClick={() => { jobStore.reviewRequestRevision(job.id, REVIEWER, note || "Please revise."); onBack(); }}>Request Revision</button>
              <button className="btn" onClick={() => router.push(`/contentos/jobs/${job.id}`)}>Edit Content</button>
              <button className="btn danger" onClick={() => { jobStore.reviewKill(job.id, REVIEWER, note || "Rejected by reviewer."); onBack(); }}>Reject</button>
            </div>

            <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide" : "Show"} advanced details</button>
            {advanced && (
              <div style={{ marginTop: 10 }}>
                <dl className="kv tiny">
                  <dt>QA routing</dt><dd>{report?.routing ?? "—"} ({report?.overallScore.toFixed(1) ?? "–"}/5)</dd>
                  <dt>Lane</dt><dd>{job.lane} agent</dd>
                  <dt>Revision attempts</dt><dd>{job.metrics.revisionAttempts}</dd>
                  <dt>Assigned</dt><dd>{job.humanReview?.assignedReviewer ?? "Unassigned"}</dd>
                  <dt>Product review</dt><dd>{job.humanReview?.productReviewNeeded ? "Needed" : "—"}</dd>
                  <dt>Legal review</dt><dd>{job.humanReview?.legalReviewNeeded ? "Needed" : "—"}</dd>
                </dl>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn sm" onClick={() => jobStore.reviewMark(job.id, REVIEWER, "product")}>Mark product review</button>
                  <button className="btn sm" onClick={() => jobStore.reviewMark(job.id, REVIEWER, "legal")}>Mark legal review</button>
                  <button className="btn sm" onClick={() => jobStore.reviewMark(job.id, REVIEWER, "comms")}>Mark comms review</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Q({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="muted" style={{ fontSize: 12.5 }}>{children}</div>
    </div>
  );
}
