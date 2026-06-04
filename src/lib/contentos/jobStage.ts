import type { Job, JobState } from "./schemas/contentos";
import { CURRENT_USER } from "./store/uiStore";

/** Board columns (Trello-style) and the states that map to each. */
export type BoardStage = "drafting" | "qa" | "human_review" | "approved" | "exported";

export const BOARD_STAGES: { key: BoardStage; label: string }[] = [
  { key: "drafting", label: "Drafting" },
  { key: "qa", label: "QA" },
  { key: "human_review", label: "Human Review" },
  { key: "approved", label: "Approved" },
  { key: "exported", label: "Exported" },
];

const STAGE_OF: Record<JobState, BoardStage | null> = {
  INTAKE: "drafting",
  BRIEFED: "drafting",
  PIM_READY: "drafting",
  NARRATIVE_READY: "drafting",
  BLUEPRINT_READY: "drafting",
  DRAFTED: "drafting",
  CHANGES_PENDING: "drafting",
  CHANGES_APPLIED: "drafting",
  QA_RUNNING: "qa",
  QA_REVIEW_READY: "qa",
  FINAL_QA_RUNNING: "qa",
  QA_REVISION: "qa",
  HELD: "human_review",
  HUMAN_REVIEW: "human_review",
  APPROVED: "approved",
  QA_PASSED: "approved",
  SHIPPED: "approved",
  EXPORTED: "exported",
  KILLED: null,
};

export function boardStage(state: JobState): BoardStage | null {
  return STAGE_OF[state];
}

/**
 * My Jobs scope: jobs the current user created, is assigned to review, or that
 * are awaiting their action. Standard users never see other people's jobs.
 */
export function isMyJob(job: Job, user = CURRENT_USER): boolean {
  if (job.owner === user) return true;
  if (job.humanReview?.assignedReviewer === user) return true;
  return false;
}

const AWAITING_ME: JobState[] = ["QA_REVIEW_READY", "CHANGES_PENDING", "QA_REVISION", "HUMAN_REVIEW", "HELD", "QA_PASSED"];

export function awaitsAction(job: Job): boolean {
  return AWAITING_ME.includes(job.state);
}
