"use client";

import type { Job, JobState } from "@/lib/contentos/schemas/contentos";

type Status = "done" | "current" | "pending" | "skipped" | "failed";

interface VStep {
  label: string;
  sub: string;
  status: Status;
}

const QA_ACTIVE: JobState[] = ["QA_RUNNING", "QA_REVIEW_READY", "CHANGES_PENDING", "CHANGES_APPLIED", "FINAL_QA_RUNNING", "QA_REVISION"];
const DONE_STATES: JobState[] = ["QA_PASSED", "APPROVED", "SHIPPED", "EXPORTED"];

/**
 * Shows the orchestration pipeline as workflow states — the user never opens an
 * agent, they watch its execution here: Creator → QA → Human Review → Export.
 */
export function AgentWorkflowProgress({ job }: { job: Job }) {
  const s = job.state;
  const steps: VStep[] = [];

  // 1) Creator (or QA-only ingest)
  if (job.qaOnly) {
    steps.push({ label: "Content ingested", sub: "Standalone QA Check (no creator agent)", status: "done" });
  } else {
    const creator = job.lane === "repurposing" ? "Repurposing Agent" : "Production Agent";
    const creatorDone = s !== "INTAKE" && s !== "BRIEFED";
    steps.push({
      label: creator,
      sub: job.lane === "repurposing" ? "Canonical narrative → derivatives" : "Risk → narrative → blueprint → draft",
      status: s === "KILLED" ? "done" : creatorDone ? "done" : "current",
    });
  }

  // 2) QA Agent
  const qaReport = job.finalQaReport ?? job.qaReport;
  const qaActive = QA_ACTIVE.includes(s);
  steps.push({
    label: "QA Agent · 8 layers",
    sub: qaReport ? `Overall ${qaReport.overallScore.toFixed(1)}/5 · routing: ${qaReport.routing.replace("_", " ")}` : "Evaluating",
    status: qaActive ? "current" : qaReport ? "done" : "pending",
  });

  // 3) Human Review
  const needsHuman = job.risk?.tier === 2 || !!job.humanReview || s === "HUMAN_REVIEW" || s === "HELD";
  steps.push({
    label: "Human Review",
    sub: needsHuman ? (job.risk?.tier === 2 ? "Required for Tier 2" : "Routed for review") : "Not required at this tier",
    status:
      s === "HUMAN_REVIEW" || s === "HELD"
        ? "current"
        : job.humanReview && DONE_STATES.includes(s)
        ? "done"
        : needsHuman
        ? "pending"
        : "skipped",
  });

  // 4) Export
  steps.push({
    label: "Export",
    sub: s === "EXPORTED" ? `${job.exports.length} export(s)` : "After QA pass or approval",
    status: s === "EXPORTED" ? "done" : s === "QA_PASSED" || s === "APPROVED" || s === "SHIPPED" ? "current" : "pending",
  });

  if (s === "KILLED") {
    steps.push({ label: "Killed", sub: "Terminated by a reviewer", status: "failed" });
  }

  return (
    <div className="panel panel-pad">
      <h3 style={{ marginBottom: 12, fontSize: 13 }}>Workflow progress</h3>
      <div className="agentflow">
        {steps.map((st, i) => (
          <div key={i} className={`vstep ${st.status}`}>
            <div className="rail">
              <div className="ring">
                {st.status === "done" ? "✓" : st.status === "current" ? <span className="spin">⟳</span> : st.status === "failed" ? "✕" : st.status === "skipped" ? "–" : "○"}
              </div>
              {i < steps.length - 1 && <div className="line" />}
            </div>
            <div className="body">
              <div className="lbl">{st.label}</div>
              <div className="sub">{st.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
