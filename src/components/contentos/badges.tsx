import type { JobState, QARouting, RiskTier, Severity } from "@/lib/contentos/schemas/contentos";
import { JOB_STATE_LABELS } from "@/lib/contentos/schemas/contentos";

export function RiskBadge({ tier }: { tier: RiskTier | null }) {
  if (tier === null) return <span className="badge-pill t0">Unassessed</span>;
  const cls = tier === 2 ? "t2" : tier === 1 ? "t1" : "t0";
  return (
    <span className={`badge-pill ${cls}`}>
      <span className="dot" style={{ background: "currentColor" }} />
      Tier {tier}
    </span>
  );
}

const STATE_TONE: Partial<Record<JobState, string>> = {
  QA_PASSED: "go",
  APPROVED: "go",
  SHIPPED: "go",
  EXPORTED: "go",
  HELD: "stop",
  KILLED: "stop",
  HUMAN_REVIEW: "warn",
  QA_REVISION: "warn",
  CHANGES_PENDING: "warn",
  QA_REVIEW_READY: "flow",
  QA_RUNNING: "flow",
  FINAL_QA_RUNNING: "flow",
  DRAFTED: "flow",
};

export function StateBadge({ state }: { state: JobState }) {
  const tone = STATE_TONE[state] ?? "";
  return <span className={`state ${tone}`}>{JOB_STATE_LABELS[state]}</span>;
}

export function RoutingBadge({ routing }: { routing: QARouting }) {
  const map: Record<QARouting, [string, string]> = {
    pass: ["go", "Pass"],
    revision: ["warn", "Revision"],
    block: ["stop", "Block"],
    human_review: ["warn", "Human review"],
  };
  const [tone, label] = map[routing];
  return <span className={`state ${tone}`}>{label}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, string> = { critical: "stop", high: "warn", moderate: "flow", low: "" };
  return <span className={`state ${map[severity]}`}>{severity}</span>;
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 4.5 ? "go" : score >= 3 ? "warn" : "stop";
  return <span className={`state ${tone}`}>{score.toFixed(1)}/5</span>;
}
