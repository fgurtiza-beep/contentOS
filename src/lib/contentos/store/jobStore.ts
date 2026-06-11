/**
 * Job Store
 * ---------
 * Framework-agnostic, in-memory reactive store (pub/sub via getSnapshot +
 * subscribe, consumable by React's useSyncExternalStore). Holds the job
 * aggregate and the audit stream, and owns every state transition and the QA
 * change-tracking operations.
 *
 * Prototype scope: state lives in memory and resets on reload. Swap this module
 * for a Postgres-backed implementation without touching the UI.
 */

import type {
  AuditEntry,
  ChangeDecision,
  ClipApprovalEntry,
  ContentBlock,
  ContentVersion,
  Draft,
  ExportFormat,
  Job,
  ProductionOutput,
  QALayerKey,
  QASuggestion,
  Severity,
  StandardizedBrief,
} from "../schemas/contentos";
import {
  intake,
  runCreatorAndQA,
  runEditorBriefForClip,
  submitToFinalQA,
  canExport,
  primaryDraft,
  writeDraftBack,
} from "../orchestrator/contentOrchestrator";
import { assessRisk } from "../orchestrator/riskTiering";
import { runQAAgent } from "../agents/qaAgent";
import { runHookQACheck } from "../agents/hookScorer";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { renderExport } from "../export/exporters";
import { block, nextId, now } from "../util";
import { seedJobs } from "./seed";

interface StoreState {
  jobs: Job[];
  audits: AuditEntry[];
  calendarSchedule: Record<string, { date: string; time: string }>;
}

const SCHEDULE_STORAGE_KEY = "contentos_calendar_schedule";

function loadSchedule(): Record<string, { date: string; time: string }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, { date: string; time: string }>) : {};
  } catch { return {}; }
}

function saveSchedule(s: Record<string, { date: string; time: string }>) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(s)); } catch {}
}

const { jobs: _seedJobs, audits: _seedAudits } = seedJobs() as { jobs: Job[]; audits: AuditEntry[] };
let state: StoreState = { jobs: _seedJobs, audits: _seedAudits, calendarSchedule: loadSchedule() };
const listeners = new Set<() => void>();

function emit() {
  // Replace top-level refs so React sees a new snapshot.
  state = { ...state, jobs: [...state.jobs], audits: [...state.audits] };
  listeners.forEach((l) => l());
}

function replaceJob(updated: Job, audits: AuditEntry[] = []) {
  const idx = state.jobs.findIndex((j) => j.id === updated.id);
  if (idx >= 0) state.jobs[idx] = updated;
  else state.jobs.unshift(updated);
  if (audits.length) state.audits.push(...audits);
  emit();
}

function record(entry: Omit<AuditEntry, "id" | "at">) {
  state.audits.push({ id: nextId("aud"), at: now(), ...entry });
}

/* ------------------------------------------------------------------ */
/* Subscription API (for useSyncExternalStore)                        */
/* ------------------------------------------------------------------ */

export const jobStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): StoreState {
    return state;
  },
  getJobs(): Job[] {
    return state.jobs;
  },
  getJob(id: string): Job | undefined {
    return state.jobs.find((j) => j.id === id);
  },
  getAudits(): AuditEntry[] {
    return state.audits;
  },

  /* ---------------- Intake + run the orchestrated pipeline ---------- */

  submitBrief(brief: Parameters<typeof intake>[0], owner: string): string {
    const ts = now();
    const created = intake(brief, owner, ts);
    const ran = runCreatorAndQA(created.job, ts);
    replaceJob(ran.job, [...created.audits, ...ran.audits]);
    return ran.job.id;
  },

  /**
   * Standalone QA Check: runs ONLY the QA Agent over pasted/uploaded/fetched
   * content. No Production or Repurposing agent runs. Produces the same QA
   * Review Workspace (scorecard, side-by-side, suggestions, approval controls).
   */
  submitQACheck(input: { title: string; channel: string; text: string; product?: string; source?: string }, owner = "marketing@sprout.ph"): string {
    const ts = now();
    const blocks = parseTextToBlocks(input.title, input.text);

    const brief: StandardizedBrief = {
      title: input.title || "QA Check",
      objective: `Standalone QA check of ${input.source || "pasted content"}.`,
      jobType: "custom",
      primaryICP: "SME HR Leader",
      secondaryICPs: [],
      industry: "",
      segment: "",
      persona: "",
      readiness: "problem_aware",
      contentIntent: ["awareness"],
      tone: "",
      length: "",
      channel: input.channel || "blog",
      mustInclude: [],
      mustAvoid: [],
      product: input.product ?? "",
      cta: "",
      campaign: "",
      seoKeyword: "",
      competitor: "",
      smeNotes: "",
      painPoints: [],
      complianceContext: "",
      sourceAsset: null,
      landingPageType: "",
      datasets: [],
      desiredOutputs: [],
      volumeTarget: "",
      riskSensitivity: "low",
    };

    const risk = assessRisk(brief);

    // Verify any product claims in the pasted text against GTM Studio.
    const productClaims = input.product
      ? blocks
          .filter((b) => b.kind === "paragraph")
          .map((b) => gtmStudioProductService.verifyText(input.product!, b.text, ts))
          .filter((c) => c.status !== "verified" || c.featureId)
      : [];

    const draft: Draft = {
      id: nextId("draft"),
      title: brief.title,
      channel: brief.channel,
      format: "qa_check",
      blocks,
      versions: [{ id: nextId("ver"), label: "original_draft", blocks: blocks.map((b) => ({ ...b })), createdAt: ts, createdBy: owner }],
    };

    const production: ProductionOutput = {
      brief,
      riskTier: risk.tier,
      problemIntentMap: { problems: [], intentSignals: [], readinessLevels: [] },
      canonicalNarrative: { thesis: "", keyInsights: [], sproutBelievesRecommends: [], sproutDoesNotClaim: [], phRealityMatters: [], differentiationBelongs: [], safeCtaLanes: [] },
      blueprint: { outline: [], outputMatrix: [], requiredDisclaimers: [], internalLinkTargets: [] },
      draft,
      productClaims,
      factualClaims: [],
      sourceMap: [],
      qaHandoffPackage: { riskTier: risk.tier, productClaims, factualClaims: [], sourceMap: [], references: [] },
    };

    const report = runQAAgent(draft, production.qaHandoffPackage, risk.tier, ts, "draft");

    const job: Job = {
      id: nextId("job"),
      createdAt: ts,
      updatedAt: ts,
      owner,
      state: "QA_REVIEW_READY",
      lane: "production",
      qaOnly: true,
      brief,
      risk,
      production,
      qaReport: report,
      finalQaReport: null,
      humanReview: null,
      metrics: { costUsd: 0.8, stageTimings: [{ stage: "qa_agent", ms: 30 }], acceptedSuggestions: 0, rejectedSuggestions: 0, editedSuggestions: 0, revisionAttempts: 0, productClaimFailures: productClaims.filter((c) => c.status !== "verified").length },
      exports: [],
    };

    state.jobs.unshift(job);
    record({ jobId: job.id, actor: owner, action: "qa_check", detail: `Standalone QA Check run (${input.source || "pasted content"}). Overall ${report.overallScore}/5.`, toState: "QA_REVIEW_READY" });
    emit();
    return job.id;
  },

  /* ---------------- QA change decisions ---------------------------- */

  decideSuggestion(jobId: string, suggestionId: string, decision: ChangeDecision, editedReplacement?: string, actor = "Growth Team User") {
    const job = clone(this.getJob(jobId));
    if (!job?.qaReport) return;
    const sug = job.qaReport.suggestions.find((s) => s.id === suggestionId);
    if (!sug) return;
    applyDecision(job, sug, decision, editedReplacement, actor);
    moveToChangesPending(job);
    replaceJob(job);
  },

  bulkDecide(jobId: string, decision: ChangeDecision, filter: (s: QASuggestion) => boolean, actor = "Growth Team User") {
    const job = clone(this.getJob(jobId));
    if (!job?.qaReport) return;
    job.qaReport.suggestions.filter((s) => s.decision === "pending" && filter(s)).forEach((s) => applyDecision(job, s, decision, undefined, actor));
    moveToChangesPending(job);
    replaceJob(job);
  },

  acceptAllByLayer(jobId: string, layer: QALayerKey) {
    this.bulkDecide(jobId, "accepted", (s) => s.layer === layer);
  },
  acceptAll(jobId: string) {
    this.bulkDecide(jobId, "accepted", () => true);
  },
  rejectAll(jobId: string) {
    this.bulkDecide(jobId, "rejected", () => true);
  },
  applyOnlyCritical(jobId: string) {
    this.bulkDecide(jobId, "accepted", (s) => s.severity === "critical");
  },
  applyHighConfidence(jobId: string, threshold = 0.85) {
    this.bulkDecide(jobId, "accepted", (s) => s.confidence >= threshold);
  },
  applyProductAccuracyFixes(jobId: string) {
    this.bulkDecide(jobId, "accepted", (s) => s.layer === "product_gtm_accuracy");
  },
  applyComplianceLegalFixes(jobId: string) {
    this.bulkDecide(jobId, "accepted", (s) => s.layer === "factual_accuracy" || (s.riskTierImpact ?? 0) >= 2);
  },
  sendAllToHuman(jobId: string) {
    this.bulkDecide(jobId, "sent_to_human", () => true);
    const job = clone(this.getJob(jobId));
    if (!job) return;
    routeToHuman(job, "User sent QA suggestions to human review.");
    replaceJob(job);
  },

  /* ---------------- Hook alternative accept ------------------------ */

  acceptHookAlternative(jobId: string, line: string, actor = "marketing@sprout.ph") {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const draft = primaryDraft(job);
    if (!draft) return;

    // Swap the first non-empty line of the first paragraph block
    const firstPara = draft.blocks.find(b => b.kind === "paragraph");
    if (!firstPara) return;
    const lines = firstPara.text.split("\n");
    const idx = lines.findIndex(l => l.trim());
    if (idx < 0) return;
    lines[idx] = line;
    firstPara.text = lines.join("\n");

    pushVersion(draft, "user_approved", actor);
    writeDraftBack(job, draft);

    // Re-run the hook check only — not full QA
    const handoff = job.production?.qaHandoffPackage;
    const icp     = handoff?.socialContext?.icp ?? "";
    const pain    = handoff?.socialContext?.primaryPain ?? "";
    const newHookResult = runHookQACheck(draft.blocks, icp, pain);
    if (job.qaReport)      job.qaReport      = { ...job.qaReport,      hookQA: newHookResult };
    if (job.finalQaReport) job.finalQaReport = { ...job.finalQaReport, hookQA: newHookResult };

    job.updatedAt = now();
    record({ jobId, actor, action: "hook_alternative_accepted", detail: `Hook alternative accepted: "${line.slice(0, 80)}…"` });
    replaceJob(job);
  },

  /* ---------------- Live manual editing of content ----------------- */

  editBlockText(jobId: string, blockId: string, text: string, actor = "marketing@sprout.ph") {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const draft = primaryDraft(job);
    if (!draft) return;
    const blk = draft.blocks.find((b) => b.id === blockId);
    if (!blk || blk.text === text) return;
    blk.text = text;
    pushVersion(draft, "user_approved", actor);
    writeDraftBack(job, draft);
    // Manual edits move the job into the changes-pending lane and invalidate the pass.
    if (job.state === "QA_REVIEW_READY" || job.state === "QA_PASSED") job.state = "CHANGES_PENDING";
    job.updatedAt = now();
    record({ jobId, actor, action: "manual_edit", detail: `Edited ${blk.kind} block directly.`, meta: { blockId } });
    replaceJob(job);
  },

  /* ---------------- Apply changes + final QA ----------------------- */

  applyChangesAndRunFinalQA(jobId: string): void {
    const current = this.getJob(jobId);
    if (!current) return;
    const draft = buildRevisedDraft(current);
    if (!draft) return;
    const ts = now();
    const result = submitToFinalQA(current, draft, ts);
    replaceJob(result.job, result.audits);
  },

  /* ---------------- Human review actions --------------------------- */

  reviewApprove(jobId: string, reviewer: string) {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const from = job.state;
    job.state = "APPROVED";
    job.updatedAt = now();
    record({ jobId, actor: reviewer, action: "review_approve", detail: "Human reviewer approved the content.", fromState: from, toState: "APPROVED" });
    replaceJob(job);
  },
  reviewRequestRevision(jobId: string, reviewer: string, note: string) {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const from = job.state;
    job.state = "QA_REVISION";
    job.humanReview?.comments.push({ at: now(), author: reviewer, text: note });
    job.updatedAt = now();
    record({ jobId, actor: reviewer, action: "review_request_revision", detail: note, fromState: from, toState: "QA_REVISION" });
    replaceJob(job);
  },
  reviewKill(jobId: string, reviewer: string, reason: string) {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const from = job.state;
    job.state = "KILLED";
    job.updatedAt = now();
    record({ jobId, actor: reviewer, action: "review_kill", detail: reason, fromState: from, toState: "KILLED" });
    replaceJob(job);
  },
  reviewEditDirectly(jobId: string, reviewer: string, blockId: string, text: string) {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const draft = primaryDraft(job);
    if (!draft) return;
    const blk = draft.blocks.find((b) => b.id === blockId);
    if (!blk) return;
    blk.text = text;
    pushVersion(draft, "user_approved", reviewer);
    writeDraftBack(job, draft);
    job.updatedAt = now();
    record({ jobId, actor: reviewer, action: "review_edit_direct", detail: `Edited block ${blockId} directly.` });
    replaceJob(job);
  },
  reviewAddComment(jobId: string, reviewer: string, text: string) {
    const job = clone(this.getJob(jobId));
    if (!job?.humanReview) return;
    job.humanReview.comments.push({ at: now(), author: reviewer, text });
    record({ jobId, actor: reviewer, action: "review_comment", detail: text });
    replaceJob(job);
  },
  reviewAssign(jobId: string, reviewer: string, assignee: string) {
    const job = clone(this.getJob(jobId));
    if (!job?.humanReview) return;
    job.humanReview.assignedReviewer = assignee;
    record({ jobId, actor: reviewer, action: "review_assign", detail: `Assigned to ${assignee}.` });
    replaceJob(job);
  },
  reviewMark(jobId: string, reviewer: string, kind: "product" | "legal" | "comms") {
    const job = clone(this.getJob(jobId));
    if (!job?.humanReview) return;
    if (kind === "product") job.humanReview.productReviewNeeded = true;
    if (kind === "legal") job.humanReview.legalReviewNeeded = true;
    if (kind === "comms") job.humanReview.commsReviewNeeded = true;
    record({ jobId, actor: reviewer, action: `review_mark_${kind}`, detail: `Marked ${kind} review needed.` });
    replaceJob(job);
  },

  /* ---------------- Clip Approval Queue actions -------------------- */

  clipApprove(jobId: string, entryId: string, reviewer: string) {
    const job = clone(this.getJob(jobId));
    if (!job?.clipApprovalQueue) return;
    const entry = job.clipApprovalQueue.find((e) => e.id === entryId);
    if (!entry) return;
    entry.status = "approved";
    entry.reviewedBy = reviewer;
    entry.reviewedAt = now();
    job.updatedAt = now();
    record({ jobId, actor: reviewer, action: "clip_approve", detail: `Clip approved (${entry.candidate.clipType} · ${entry.candidate.startTime}–${entry.candidate.endTime}) — triggering EditorBriefAgent.`, meta: { clipId: entry.clipId, clipType: entry.candidate.clipType } });
    // Run EditorBriefAgent immediately — approval + brief generation are one atomic pass.
    const result = runEditorBriefForClip(job, entryId, now());
    replaceJob(result.job, result.audits);
  },

  clipReject(jobId: string, entryId: string, reviewer: string, note: string) {
    const job = clone(this.getJob(jobId));
    if (!job?.clipApprovalQueue) return;
    const entry = job.clipApprovalQueue.find((e) => e.id === entryId);
    if (!entry) return;
    entry.status = "rejected";
    entry.reviewedBy = reviewer;
    entry.reviewedAt = now();
    entry.notes = note.trim() || "Rejected by reviewer.";
    job.updatedAt = now();
    record({ jobId, actor: reviewer, action: "clip_reject", detail: `Clip rejected. Note: ${entry.notes}`, meta: { clipId: entry.clipId } });
    replaceJob(job);
  },

  clipEditTimestamps(jobId: string, entryId: string, startTime: string, endTime: string, reviewer: string) {
    const job = clone(this.getJob(jobId));
    if (!job?.clipApprovalQueue) return;
    const entry = job.clipApprovalQueue.find((e) => e.id === entryId);
    if (!entry) return;
    const prev = `${entry.candidate.startTime}–${entry.candidate.endTime}`;
    entry.candidate = { ...entry.candidate, startTime, endTime };
    job.updatedAt = now();
    record({ jobId, actor: reviewer, action: "clip_edit_timestamps", detail: `Clip timestamps updated ${prev} → ${startTime}–${endTime}.`, meta: { clipId: entry.clipId } });
    replaceJob(job);
  },

  /* ---------------- Export ----------------------------------------- */

  exportJob(jobId: string, format: ExportFormat, overrideReason?: string, by = "Growth Team User") {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const gate = canExport(job);
    if (!gate.allowed && !overrideReason) {
      record({ jobId, actor: by, action: "export_blocked", detail: gate.reason });
      replaceJob(job);
      return;
    }
    const preview = renderExport(job, format);
    const rec = { id: nextId("exp"), format, at: now(), by, override: !gate.allowed, overrideReason, preview };
    job.exports.push(rec);
    const from = job.state;
    if (job.state !== "EXPORTED") job.state = "EXPORTED";
    job.updatedAt = now();
    record({
      jobId,
      actor: by,
      action: rec.override ? "export_override" : "export",
      detail: rec.override ? `Exported ${format} with override: ${overrideReason}` : `Exported ${format}.`,
      fromState: from,
      toState: "EXPORTED",
    });
    replaceJob(job);
  },

  ship(jobId: string, by = "Growth Team User") {
    const job = clone(this.getJob(jobId));
    if (!job) return;
    const from = job.state;
    job.state = "SHIPPED";
    job.updatedAt = now();
    record({ jobId, actor: by, action: "ship", detail: "Marked shipped.", fromState: from, toState: "SHIPPED" });
    replaceJob(job);
  },

  /* ---------------- Content Calendar scheduling -------------------- */

  getCalendarSchedule(): Record<string, { date: string; time: string }> {
    return state.calendarSchedule;
  },

  schedulePost(postId: string, date: string, time: string) {
    state.calendarSchedule = { ...state.calendarSchedule, [postId]: { date, time } };
    saveSchedule(state.calendarSchedule);
    emit();
  },

  unschedulePost(postId: string) {
    const next = { ...state.calendarSchedule };
    delete next[postId];
    state.calendarSchedule = next;
    saveSchedule(state.calendarSchedule);
    emit();
  },
};

/* ------------------------------------------------------------------ */
/* Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function clone<T>(v: T | undefined): T | undefined {
  return v ? (structuredClone(v) as T) : undefined;
}

function applyDecision(job: Job, sug: QASuggestion, decision: ChangeDecision, editedReplacement: string | undefined, actor: string) {
  const prev = sug.decision;
  sug.decision = decision;
  sug.decidedBy = actor;
  sug.decidedAt = now();
  if (decision === "edited" && editedReplacement !== undefined) sug.editedReplacement = editedReplacement;

  // Update metrics (only count the net new decision)
  if (prev === "accepted") job.metrics.acceptedSuggestions = Math.max(0, job.metrics.acceptedSuggestions - 1);
  if (prev === "rejected") job.metrics.rejectedSuggestions = Math.max(0, job.metrics.rejectedSuggestions - 1);
  if (prev === "edited") job.metrics.editedSuggestions = Math.max(0, job.metrics.editedSuggestions - 1);
  if (decision === "accepted") job.metrics.acceptedSuggestions += 1;
  if (decision === "rejected") job.metrics.rejectedSuggestions += 1;
  if (decision === "edited") job.metrics.editedSuggestions += 1;

  record({
    jobId: job.id,
    actor,
    action: `qa_${decision}`,
    detail: `${decision} suggestion on ${sug.layer} (${sug.issueType}).`,
    meta: { layer: sug.layer, severity: sug.severity, suggestionId: sug.id },
  });
}

function moveToChangesPending(job: Job) {
  if (job.state === "QA_REVIEW_READY" || job.state === "QA_REVISION") {
    const from = job.state;
    job.state = "CHANGES_PENDING";
    record({ jobId: job.id, actor: "Orchestrator", action: "changes_pending", detail: "QA changes are being triaged.", fromState: from, toState: "CHANGES_PENDING" });
  }
  job.updatedAt = now();
}

function routeToHuman(job: Job, reason: string) {
  const from = job.state;
  job.humanReview = job.humanReview ?? {
    reasons: [],
    assignedReviewer: "Unassigned",
    productReviewNeeded: false,
    legalReviewNeeded: false,
    commsReviewNeeded: false,
    comments: [],
  };
  job.state = "HUMAN_REVIEW";
  job.updatedAt = now();
  record({ jobId: job.id, actor: "Orchestrator", action: "route_human", detail: reason, fromState: from, toState: "HUMAN_REVIEW" });
}

/** Build a revised draft applying accepted/edited suggestions to the blocks. */
function buildRevisedDraft(job: Job): Draft | null {
  const base = primaryDraft(job);
  if (!base || !job.qaReport) return null;
  const draft: Draft = structuredClone(base);

  // group decided suggestions by block
  const byBlock = new Map<string, QASuggestion[]>();
  job.qaReport.suggestions
    .filter((s) => s.decision === "accepted" || s.decision === "edited")
    .forEach((s) => {
      const arr = byBlock.get(s.blockId) ?? [];
      arr.push(s);
      byBlock.set(s.blockId, arr);
    });

  const newBlocks: ContentBlock[] = [];
  draft.blocks.forEach((b) => {
    const decisions = byBlock.get(b.id);
    if (!decisions || decisions.length === 0) {
      newBlocks.push(b);
      return;
    }
    let text = b.text;
    let removed = false;
    decisions.forEach((d) => {
      const replacement = d.decision === "edited" ? d.editedReplacement ?? d.suggestedReplacement : d.suggestedReplacement;
      if (/^\[remove/i.test(replacement.trim())) {
        removed = true;
      } else {
        text = replacement;
      }
    });
    if (!removed) newBlocks.push({ ...b, text });
  });

  draft.blocks = newBlocks;
  pushVersion(draft, "user_approved", job.owner);
  return draft;
}

function pushVersion(draft: Draft, label: ContentVersion["label"], by: string) {
  draft.versions.push({
    id: nextId("ver"),
    label,
    blocks: draft.blocks.map((b) => ({ ...b })),
    createdAt: now(),
    createdBy: by,
  });
}

/** Parse free text (paste / file / URL) into content blocks for the QA Agent. */
function parseTextToBlocks(title: string, text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let order = 0;
  if (title.trim()) blocks.push(block(order++, "h1", title.trim()));

  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const p of paras) {
    const oneLine = !/\n/.test(p);
    const looksHeading = oneLine && p.length <= 70 && !/[.?!]$/.test(p);
    if (looksHeading) blocks.push(block(order++, "h2", p));
    else blocks.push(block(order++, "paragraph", p.replace(/\n/g, " ")));
  }
  if (blocks.length === 0) blocks.push(block(0, "paragraph", text || "(no content)"));
  return blocks;
}

/* Severity ordering helper used by the UI for sorting. */
export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
