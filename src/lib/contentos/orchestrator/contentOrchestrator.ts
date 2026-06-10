/**
 * ContentOS Orchestrator — the conductor
 * --------------------------------------
 * Users never talk to a sub-agent directly. They submit a request and the
 * orchestrator decides which agent runs, what context is retrieved, what risk
 * tier applies, whether QA is required, whether human review is required, and
 * whether content can be exported.
 *
 * Responsibilities: routing, context assembly (inside the agents), risk gating,
 * QA handoffs, state persistence (via returned job + audit entries), and the
 * revision/escalation loop.
 *
 * Every operation returns a new Job plus the AuditEntries it generated; the job
 * store records the audit trail. This keeps the orchestrator free of store
 * coupling and easy to test.
 */

import type {
  AuditEntry,
  Draft,
  Job,
  JobState,
  QAReport,
  StandardizedBrief,
} from "../schemas/contentos";
import { MAX_REVISION_ATTEMPTS, laneForJobType } from "../schemas/contentos";
import { assessRisk } from "./riskTiering";
import { runProductionAgent } from "../agents/productionAgent";
import { runRepurposingAgent, RepurposingError } from "../agents/repurposingAgent";
import { runVideoTranscriptAgent, VideoTranscriptError } from "../agents/videoTranscriptAgent";
import { runClipDiscoveryAgent } from "../agents/clipDiscoveryAgent";
import { runEditorBriefAgent } from "../agents/editorBriefAgent";
import { runQAAgent } from "../agents/qaAgent";
import { nextId, now, nowMs } from "../util";
import type { HumanReviewKind } from "../schemas/contentos";

export interface OrchestratorResult {
  job: Job;
  audits: AuditEntry[];
}

function audit(job: Job, actor: string, action: string, detail: string, fromState?: JobState, toState?: JobState): AuditEntry {
  return { id: nextId("aud"), jobId: job.id, at: now(), actor, action, detail, fromState, toState };
}

function timed<T>(job: Job, stage: string, fn: () => T): T {
  const start = nowMs();
  const out = fn();
  job.metrics.stageTimings.push({ stage, ms: Math.max(1, nowMs() - start) });
  return out;
}

/* ------------------------------------------------------------------ */
/* Intake — create job, assign risk tier                              */
/* ------------------------------------------------------------------ */

export function intake(brief: StandardizedBrief, owner: string, ts: string): OrchestratorResult {
  const lane = laneForJobType(brief.jobType);
  const job: Job = {
    id: nextId("job"),
    createdAt: ts,
    updatedAt: ts,
    owner,
    state: "INTAKE",
    lane,
    brief,
    risk: null,
    qaReport: null,
    finalQaReport: null,
    humanReview: null,
    metrics: { costUsd: 0, stageTimings: [], acceptedSuggestions: 0, rejectedSuggestions: 0, editedSuggestions: 0, revisionAttempts: 0, productClaimFailures: 0 },
    exports: [],
  };
  const audits: AuditEntry[] = [audit(job, owner, "intake", `Job created (${lane} lane, ${brief.jobType}).`, undefined, "INTAKE")];

  const risk = assessRisk(brief);
  job.risk = risk;
  job.briefConflicts = detectBriefConflicts(brief);
  job.metrics.costUsd += 0.4;
  job.state = "BRIEFED";
  job.updatedAt = ts;
  audits.push(audit(job, "Orchestrator", "risk_tiering", `Risk ${risk.tier}: ${risk.signals[0]}`, "INTAKE", "BRIEFED"));
  return { job, audits };
}

/* ------------------------------------------------------------------ */
/* Run the creator agent + QA in one orchestrated pass                */
/* ------------------------------------------------------------------ */

export function runCreatorAndQA(input: Job, ts: string): OrchestratorResult {
  const job: Job = structuredClone(input);
  const audits: AuditEntry[] = [];
  const tier = job.risk?.tier ?? 0;

  let draft: Draft;
  try {
    if (job.lane === "production") {
      const out = timed(job, "production_agent", () => runProductionAgent(job.brief, tier, ts));
      job.production = out;
      job.metrics.productClaimFailures += out.productClaims.filter((c) => c.status !== "verified").length;
      draft = out.draft;
      audits.push(audit(job, "Production Agent", "pim", `Problem-Intent Map ready (${out.problemIntentMap.problems.length} problems).`, "BRIEFED", "PIM_READY"));
      audits.push(audit(job, "Production Agent", "narrative", "Canonical Narrative ready.", "PIM_READY", "NARRATIVE_READY"));
      audits.push(audit(job, "Production Agent", "blueprint", "Content Blueprint ready.", "NARRATIVE_READY", "BLUEPRINT_READY"));
      audits.push(audit(job, "Production Agent", "draft", "Draft generated.", "BLUEPRINT_READY", "DRAFTED"));
    } else if (job.lane === "video_intelligence") {
      // Stage 1: Video Transcript Agent
      const transcriptOut = timed(job, "video_transcript_agent", () => runVideoTranscriptAgent(job.brief, tier, ts));
      job.videoTranscript = transcriptOut;
      draft = transcriptOut.draft;
      audits.push(audit(job, "Video Transcript Agent", "ingest", `Video source ingested: ${transcriptOut.videoSource.urlType} · ${transcriptOut.chapters.length} chapters detected.`, "BRIEFED", "PIM_READY"));
      audits.push(audit(job, "Video Transcript Agent", "transcript", "Transcript cleaned and segmented.", "PIM_READY", "NARRATIVE_READY"));
      audits.push(audit(job, "Video Transcript Agent", "analysis", `Executive summary and ${transcriptOut.keyTakeaways.length} key takeaway topics ready.`, "NARRATIVE_READY", "BLUEPRINT_READY"));
      audits.push(audit(job, "Video Transcript Agent", "draft", "Video intelligence report assembled.", "BLUEPRINT_READY", "DRAFTED"));

      // Stage 2: Clip Discovery Agent — uses transcript output as direct input
      const clipsOut = timed(job, "clip_discovery_agent", () => runClipDiscoveryAgent(transcriptOut, job.brief, tier, ts));
      job.clipDiscovery = clipsOut;
      job.metrics.costUsd += 0.4;
      audits.push(audit(job, "Clip Discovery Agent", "discover", `${clipsOut.candidates.length} clip candidates ranked across ${transcriptOut.chapters.length} chapters.`));

      // Route flagged clips → Human Review Queue
      if (clipsOut.flaggedCandidates.length > 0) {
        job.humanReview = job.humanReview ?? blankTicket();
        if (!job.humanReview.reasons.includes("flagged_clip_content")) {
          job.humanReview.reasons.push("flagged_clip_content");
        }
        job.humanReview.productReviewNeeded = job.humanReview.productReviewNeeded
          || clipsOut.flaggedCandidates.some((c) => c.riskFlag?.reasons.includes("product_claim"));
        job.humanReview.legalReviewNeeded = job.humanReview.legalReviewNeeded
          || clipsOut.flaggedCandidates.some((c) => c.riskFlag?.reasons.includes("regulatory_language"));
        audits.push(audit(job, "Clip Discovery Agent", "route_flagged", `${clipsOut.flaggedCandidates.length} clip(s) flagged → Human Review Queue (product/regulatory signals).`));
      }

      // Route clean clips → Clip Approval Queue
      if (clipsOut.cleanCandidates.length > 0) {
        job.clipApprovalQueue = clipsOut.cleanCandidates.map((c) => ({
          id: nextId("cap"),
          clipId: c.id,
          candidate: c,
          submittedAt: ts,
          status: "pending" as const,
        }));
        audits.push(audit(job, "Clip Discovery Agent", "route_clean", `${clipsOut.cleanCandidates.length} clean clip(s) → Clip Approval Queue.`));
      }
    } else {
      const out = timed(job, "repurposing_agent", () => runRepurposingAgent(job.brief, tier, ts, job.videoTranscript));
      job.repurposing = out;
      draft = out.derivatives[0] ?? emptyDraft();
      audits.push(audit(job, "Repurposing Agent", "classify", `Source classified: ${out.sourceClassification.origin}/${out.sourceClassification.type}.`, "BRIEFED", "PIM_READY"));
      audits.push(audit(job, "Repurposing Agent", "narrative", "Sprout Canonical Narrative ready.", "PIM_READY", "NARRATIVE_READY"));
      audits.push(audit(job, "Repurposing Agent", "blueprint", `Repurposing Blueprint ready (${out.derivatives.length} derivatives).`, "NARRATIVE_READY", "BLUEPRINT_READY"));
      audits.push(audit(job, "Repurposing Agent", "draft", `${out.derivatives.length} channel-native derivatives generated.`, "BLUEPRINT_READY", "DRAFTED"));
    }
  } catch (e) {
    if (e instanceof RepurposingError) {
      job.state = "HELD";
      audits.push(audit(job, "Orchestrator", "held", `Repurposing blocked: ${e.message}`, "BRIEFED", "HELD"));
      job.updatedAt = ts;
      return { job, audits };
    }
    if (e instanceof VideoTranscriptError) {
      job.state = "HELD";
      audits.push(audit(job, "Orchestrator", "held", `Video transcript blocked: ${e.message}`, "BRIEFED", "HELD"));
      job.updatedAt = ts;
      return { job, audits };
    }
    throw e;
  }

  job.metrics.costUsd += 1.6;
  job.state = "DRAFTED";

  // ---- QA handoff -------------------------------------------------------
  job.state = "QA_RUNNING";
  audits.push(audit(job, "Orchestrator", "qa_handoff", "Draft handed off to QA Agent.", "DRAFTED", "QA_RUNNING"));
  const handoff =
    job.lane === "production" ? job.production!.qaHandoffPackage :
    job.lane === "video_intelligence" ? job.videoTranscript!.qaHandoffPackage :
    job.repurposing!.qaHandoffPackage;
  const report = timed(job, "qa_agent", () => runQAAgent(draft, handoff, tier, ts, job.lane === "repurposing" ? "derivative" : "draft", job.lane === "repurposing" ? draft.id : undefined));
  job.qaReport = report;
  job.metrics.costUsd += 0.8;
  job.state = "QA_REVIEW_READY";
  audits.push(audit(job, "QA Agent", "qa_complete", `QA complete. Overall ${report.overallScore}/5 · routing: ${report.routing}.`, "QA_RUNNING", "QA_REVIEW_READY"));

  // The stakeholder previews/edits FIRST. Human review is offered as a
  // recommendation, never an automatic state transition on the initial pass.
  recommendReview(job, report);
  job.updatedAt = ts;
  return { job, audits };
}

/** Compute a non-binding human-review recommendation (no state change). */
function recommendReview(job: Job, report: QAReport) {
  const reasons = humanReviewReasons(job, report);
  const needed = reasons.length > 0 || report.routing === "human_review" || report.routing === "block";
  job.reviewRecommendation = {
    needed,
    reasons,
    note: needed
      ? "We recommend routing this for human review before approval — but it's your call."
      : "This draft looks clear of governance flags. You can submit it for approval when you're happy with it.",
  };
}

/** Surface mismatches between the uploaded brief and the submitted intake. */
function detectBriefConflicts(brief: StandardizedBrief): string[] {
  const ag = brief.agencyExtract;
  if (!ag) return [];
  const conflicts: string[] = [];
  const selected = new Set((brief.products ?? [brief.product]).filter(Boolean));
  for (const dp of ag.detectedProducts) {
    if (dp.mapped && dp.slug && !selected.has(dp.slug)) conflicts.push(`The brief references ${dp.name}, but it wasn't selected as a product. Follow the brief?`);
  }
  const recTitle = ag.titleOptions[0]?.title;
  if (recTitle && brief.title && recTitle.toLowerCase() !== brief.title.toLowerCase() && !brief.title.startsWith("Untitled")) {
    conflicts.push(`The brief's recommended title ("${recTitle}") differs from the submitted title ("${brief.title}").`);
  }
  if (ag.primaryKeyword && brief.seoKeyword && ag.primaryKeyword.toLowerCase() !== brief.seoKeyword.toLowerCase()) {
    conflicts.push(`The brief's primary keyword ("${ag.primaryKeyword}") differs from the submitted keyword ("${brief.seoKeyword}").`);
  }
  return conflicts.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Routing after a QA run                                             */
/* ------------------------------------------------------------------ */

function applyRouting(job: Job, report: QAReport, audits: AuditEntry[], ts: string) {
  if (report.routing === "human_review" || report.routing === "block") {
    const reasons = humanReviewReasons(job, report);
    job.humanReview = job.humanReview ?? blankTicket();
    job.humanReview.reasons = Array.from(new Set([...job.humanReview.reasons, ...reasons]));
    job.humanReview.productReviewNeeded = job.humanReview.productReviewNeeded || job.metrics.productClaimFailures > 0;
    job.humanReview.legalReviewNeeded = job.humanReview.legalReviewNeeded || !!job.brief.regulatory?.legalReviewNeeded;
    const from = job.state;
    job.state = report.routing === "block" ? "HELD" : "HUMAN_REVIEW";
    if (report.routing === "block") {
      audits.push(audit(job, "Orchestrator", "held", report.routingReason, from, "HELD"));
      job.state = "HUMAN_REVIEW";
      audits.push(audit(job, "Orchestrator", "route_human", "Escalated to Human Review Queue.", "HELD", "HUMAN_REVIEW"));
    } else {
      audits.push(audit(job, "Orchestrator", "route_human", report.routingReason, from, "HUMAN_REVIEW"));
    }
  }
  // pass / revision are surfaced in the QA workspace for the user to act on.
}

function humanReviewReasons(job: Job, report: QAReport): HumanReviewKind[] {
  const r: HumanReviewKind[] = [];
  if (job.risk?.tier === 2) r.push("tier2");
  if (report.routing === "block") r.push("blocked_output");
  if (job.metrics.productClaimFailures > 0) r.push("unresolved_product_claim");
  if (report.suggestions.some((s) => s.layer === "factual_accuracy")) r.push("unresolved_factual_claim");
  if (job.brief.complianceContext || job.brief.regulatory) r.push("compliance_sensitive");
  if (job.brief.regulatory?.legalReviewNeeded) r.push("legal_sensitive");
  if (job.brief.competitor || job.brief.competitorAddendum) r.push("competitive_claim");
  if (["whitepaper", "exec_one_pager", "press_release"].includes(job.brief.jobType)) r.push("executive_thought_leadership");
  return r;
}

/* ------------------------------------------------------------------ */
/* Apply accepted changes + re-run final QA (revision loop)           */
/* ------------------------------------------------------------------ */

export function submitToFinalQA(input: Job, revisedDraft: Draft, ts: string): OrchestratorResult {
  const job: Job = structuredClone(input);
  const audits: AuditEntry[] = [];
  const tier = job.risk?.tier ?? 0;

  job.metrics.revisionAttempts += 1;
  job.state = "CHANGES_APPLIED";
  audits.push(audit(job, job.owner, "changes_applied", "Accepted/edited QA changes applied to the working draft.", "CHANGES_PENDING", "CHANGES_APPLIED"));

  // Persist the revised draft back onto the job.
  writeDraftBack(job, revisedDraft);

  job.state = "FINAL_QA_RUNNING";
  audits.push(audit(job, "Orchestrator", "final_qa_handoff", "Revised draft handed off to QA.", "CHANGES_APPLIED", "FINAL_QA_RUNNING"));

  const handoff =
    job.lane === "production" ? job.production!.qaHandoffPackage :
    job.lane === "video_intelligence" ? job.videoTranscript!.qaHandoffPackage :
    job.repurposing!.qaHandoffPackage;
  const report = runQAAgent(revisedDraft, handoff, tier, ts, job.lane === "repurposing" ? "derivative" : "draft", job.lane === "repurposing" ? revisedDraft.id : undefined);
  job.finalQaReport = report;
  job.metrics.costUsd += 0.8;

  // Escalation: after MAX_REVISION_ATTEMPTS failed attempts → human review.
  if (report.routing !== "pass" && job.metrics.revisionAttempts >= MAX_REVISION_ATTEMPTS && tier !== 2) {
    job.humanReview = job.humanReview ?? blankTicket();
    if (!job.humanReview.reasons.includes("failed_revisions")) job.humanReview.reasons.push("failed_revisions");
    job.state = "HUMAN_REVIEW";
    audits.push(audit(job, "Orchestrator", "route_human", `${job.metrics.revisionAttempts} revision attempts without a pass — escalated to human review.`, "FINAL_QA_RUNNING", "HUMAN_REVIEW"));
    job.updatedAt = ts;
    return { job, audits };
  }

  if (tier === 2 || report.routing === "human_review" || report.routing === "block") {
    applyRouting(job, report, audits, ts);
  } else if (report.routing === "pass") {
    job.state = "QA_PASSED";
    audits.push(audit(job, "QA Agent", "qa_passed", `Final QA passed. Overall ${report.overallScore}/5.`, "FINAL_QA_RUNNING", "QA_PASSED"));
  } else {
    job.state = "QA_REVISION";
    audits.push(audit(job, "QA Agent", "qa_revision", `Final QA returned ${report.overallScore}/5 — another revision required.`, "FINAL_QA_RUNNING", "QA_REVISION"));
  }

  job.updatedAt = ts;
  return { job, audits };
}

/* ------------------------------------------------------------------ */
/* Editor Brief — final step of the video-intelligence path          */
/* ------------------------------------------------------------------ */

/**
 * Runs EditorBriefAgent for a single approved clip and stores the resulting
 * brief on the ClipApprovalEntry. Called by the store immediately after a
 * reviewer approves a clip so approval + brief generation are one atomic
 * operation from the store's perspective.
 */
export function runEditorBriefForClip(input: Job, entryId: string, ts: string): OrchestratorResult {
  const job: Job = structuredClone(input);
  const audits: AuditEntry[] = [];

  const entry = job.clipApprovalQueue?.find((e) => e.id === entryId);
  if (!entry || entry.status !== "approved") return { job, audits };

  const videoSource = job.videoTranscript?.videoSource;
  if (!videoSource) return { job, audits };

  const editorBrief = timed(job, "editor_brief_agent", () =>
    runEditorBriefAgent(entry, videoSource, job.brief, ts),
  );
  entry.editorBrief = editorBrief;
  job.metrics.costUsd += 0.3;

  audits.push(audit(
    job,
    "Editor Brief Agent",
    "brief_generated",
    `Editor brief generated for clip ${entry.clipId} (${entry.candidate.clipType} · ${entry.candidate.startTime}–${entry.candidate.endTime}). Markdown + PDF exports ready.`,
  ));

  job.updatedAt = ts;
  return { job, audits };
}

/* ------------------------------------------------------------------ */
/* Export eligibility                                                 */
/* ------------------------------------------------------------------ */

export function canExport(job: Job): { allowed: boolean; reason: string } {
  if (job.state === "QA_PASSED" || job.state === "APPROVED" || job.state === "SHIPPED" || job.state === "EXPORTED") {
    return { allowed: true, reason: "QA passed or human reviewer approved." };
  }
  return { allowed: false, reason: "Export blocked: requires QA pass, human approval, or an explicit logged override." };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function blankTicket() {
  return {
    reasons: [] as HumanReviewKind[],
    assignedReviewer: "Unassigned",
    productReviewNeeded: false,
    legalReviewNeeded: false,
    commsReviewNeeded: false,
    comments: [] as { at: string; author: string; text: string }[],
  };
}

function emptyDraft(): Draft {
  return { id: nextId("draft"), title: "Untitled", channel: "blog", format: "blog", blocks: [], versions: [] };
}

/** Write a revised draft back to whichever lane produced it. */
export function writeDraftBack(job: Job, draft: Draft) {
  if (job.lane === "production" && job.production) {
    job.production.draft = draft;
  } else if (job.lane === "repurposing" && job.repurposing) {
    const idx = job.repurposing.derivatives.findIndex((d) => d.id === draft.id);
    if (idx >= 0) job.repurposing.derivatives[idx] = { ...job.repurposing.derivatives[idx], ...draft };
  } else if (job.lane === "video_intelligence" && job.videoTranscript) {
    job.videoTranscript.draft = draft;
  }
}

/** The primary draft/derivative the QA workspace operates on. */
export function primaryDraft(job: Job): Draft | null {
  if (job.lane === "production") return job.production?.draft ?? null;
  if (job.lane === "video_intelligence") return job.videoTranscript?.draft ?? null;
  return job.repurposing?.derivatives[0] ?? null;
}
