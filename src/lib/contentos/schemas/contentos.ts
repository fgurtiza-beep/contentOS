/**
 * ContentOS — Strongly typed schemas
 * -----------------------------------
 * The single contract shared by the orchestrator, the three sub-agents
 * (Production, Repurposing, QA), the job store, and the UI.
 *
 * Source doctrine:
 *  - ContentOS Architecture Blueprint (orchestration, state machine, shared layer)
 *  - IMD 2.0 Content Repurposing doctrine (source asset, canonical narrative, risk tiers)
 *  - Sprout AI-Powered Content QA Workflow (QA layers + cliché watchlist)
 *  - GTM Studio Product Hub (product information is single-source-of-truth)
 */

/* ------------------------------------------------------------------ */
/* Job types                                                          */
/* ------------------------------------------------------------------ */

export type JobType =
  | "blog"
  | "ebook"
  | "whitepaper"
  | "exec_one_pager"
  | "social_post"
  | "email"
  | "landing_page"
  | "case_study"
  | "press_release"
  | "award_entry"
  | "custom"
  | "repurpose_sprout_asset"
  | "convert_external_report"
  | "convert_regulatory_update"
  | "reframe_competitor_pov";

export const JOB_TYPES: { value: JobType; label: string; lane: AgentLane }[] = [
  { value: "blog", label: "Blog", lane: "production" },
  { value: "ebook", label: "Ebook", lane: "production" },
  { value: "whitepaper", label: "Whitepaper", lane: "production" },
  { value: "exec_one_pager", label: "Executive one-pager", lane: "production" },
  { value: "social_post", label: "Social post", lane: "production" },
  { value: "email", label: "Email", lane: "production" },
  { value: "landing_page", label: "Landing page", lane: "production" },
  { value: "case_study", label: "Case study", lane: "production" },
  { value: "press_release", label: "Press release", lane: "production" },
  { value: "award_entry", label: "Award entry", lane: "production" },
  { value: "custom", label: "Custom content", lane: "production" },
  { value: "repurpose_sprout_asset", label: "Repurposed Sprout-created asset", lane: "repurposing" },
  { value: "convert_external_report", label: "External industry report conversion", lane: "repurposing" },
  { value: "convert_regulatory_update", label: "Regulatory update conversion", lane: "repurposing" },
  { value: "reframe_competitor_pov", label: "Competitor POV reframing", lane: "repurposing" },
];

export type AgentLane = "production" | "repurposing";

export function laneForJobType(jobType: JobType): AgentLane {
  return JOB_TYPES.find((j) => j.value === jobType)?.lane ?? "production";
}

/* ------------------------------------------------------------------ */
/* Standardized brief                                                 */
/* ------------------------------------------------------------------ */

export type Readiness = "unaware" | "problem_aware" | "solution_aware" | "evaluating" | "decision";
export type ContentIntent = "awareness" | "consideration" | "evaluation" | "conversion" | "retention" | "advocacy";
export type RiskSensitivity = "low" | "moderate" | "high";

/** Regulatory Addendum — required when source is a regulatory update. */
export interface RegulatoryAddendum {
  issuingBody: string; // DOLE / SSS / BIR / PhilHealth / Pag-IBIG / etc.
  effectiveDate: string;
  affectedAudience: string;
  uncertaintyAreas: string;
  legalReviewNeeded: boolean;
  sproutCTAAllowed: boolean;
}

/** Competitor Addendum — required when content references a competitor. */
export interface CompetitorAddendum {
  competitorName: string;
  allowedToNameCompetitor: boolean;
  comparisonsPermitted: boolean;
  differentiationPillars: string[];
  prohibitedClaims: string[]; // pricing, security, uptime, etc.
}

/** Research Addendum — required when source is an industry report / dataset. */
export interface ResearchAddendum {
  mustCite: boolean;
  directQuotesAllowed: boolean;
  dataMisrepresentationRisks: string;
  requiredSources: string[];
}

/** The standardized brief — shared by Production and Repurposing paths. */
export interface StandardizedBrief {
  title: string;
  objective: string;
  jobType: JobType;
  primaryICP: string;
  secondaryICPs: string[];
  industry: string;
  segment: string;
  persona: string;
  readiness: Readiness;
  contentIntent: ContentIntent[];
  tone: string;
  length: string;
  channel: string;
  mustInclude: string[];
  mustAvoid: string[];
  product: string; // GTM Studio product slug, or "" for none
  cta: string;
  campaign: string;
  seoKeyword: string;
  competitor: string;
  smeNotes: string;
  painPoints: string[];
  complianceContext: string;
  sourceAsset: SourceAsset | null; // repurposing only
  landingPageType: "" | "campaign" | "product_solution";
  datasets: string[]; // Databricks approved view ids
  desiredOutputs: DesiredOutput[];
  volumeTarget: string;
  riskSensitivity: RiskSensitivity;

  // Addenda
  regulatory?: RegulatoryAddendum;
  competitorAddendum?: CompetitorAddendum;
  research?: ResearchAddendum;
}

export interface DesiredOutput {
  channel: string; // LinkedIn, Email, Blog, X, Instagram, etc.
  format: string; // post, thread, caption, newsletter, etc.
  quantity: number;
}

export interface SourceAsset {
  id: string;
  title: string;
  origin: "sprout" | "external" | "regulatory" | "competitor";
  assetType: string; // blog / report / webinar / regulation / PR / etc.
  url: string;
  content: string; // pasted source text or excerpt
  approved: boolean; // IMD 2.0: must be a single APPROVED source asset
}

/* ------------------------------------------------------------------ */
/* Risk tiering                                                       */
/* ------------------------------------------------------------------ */

export type RiskTier = 0 | 1 | 2;

export interface RiskAssessment {
  tier: RiskTier;
  signals: string[]; // human-readable reasons the tier was assigned
  requiresHumanReview: boolean;
  rationale: string;
}

export const RISK_TIER_LABELS: Record<RiskTier, string> = {
  0: "Tier 0 · Low visibility",
  1: "Tier 1 · Moderate",
  2: "Tier 2 · High — human review required",
};

/* ------------------------------------------------------------------ */
/* Job state machine                                                  */
/* ------------------------------------------------------------------ */

export type JobState =
  | "INTAKE"
  | "BRIEFED"
  | "PIM_READY"
  | "NARRATIVE_READY"
  | "BLUEPRINT_READY"
  | "DRAFTED"
  | "QA_RUNNING"
  | "QA_REVIEW_READY"
  | "CHANGES_PENDING"
  | "CHANGES_APPLIED"
  | "FINAL_QA_RUNNING"
  | "QA_PASSED"
  | "QA_REVISION"
  | "HELD"
  | "HUMAN_REVIEW"
  | "APPROVED"
  | "SHIPPED"
  | "EXPORTED"
  | "KILLED";

export const TERMINAL_STATES: JobState[] = ["EXPORTED", "KILLED"];

export const JOB_STATE_LABELS: Record<JobState, string> = {
  INTAKE: "Intake",
  BRIEFED: "Briefed",
  PIM_READY: "Problem-Intent Map ready",
  NARRATIVE_READY: "Canonical Narrative ready",
  BLUEPRINT_READY: "Blueprint ready",
  DRAFTED: "Drafted",
  QA_RUNNING: "QA running",
  QA_REVIEW_READY: "QA review ready",
  CHANGES_PENDING: "Changes pending",
  CHANGES_APPLIED: "Changes applied",
  FINAL_QA_RUNNING: "Final QA running",
  QA_PASSED: "QA passed",
  QA_REVISION: "QA revision required",
  HELD: "Held",
  HUMAN_REVIEW: "Human review",
  APPROVED: "Approved",
  SHIPPED: "Shipped",
  EXPORTED: "Exported",
  KILLED: "Killed",
};

/* ------------------------------------------------------------------ */
/* Problem-Intent Map / Canonical Narrative / Blueprint               */
/* ------------------------------------------------------------------ */

export interface ProblemIntentMap {
  problems: string[];
  intentSignals: { intent: ContentIntent; signal: string }[];
  readinessLevels: { level: Readiness; note: string }[];
}

/** Sprout Canonical Narrative — the strategic interpretation all derivatives flow from. */
export interface CanonicalNarrative {
  thesis: string;
  keyInsights: string[];
  sproutBelievesRecommends: string[];
  sproutDoesNotClaim: string[]; // boundaries
  phRealityMatters: string[]; // what matters to PH HR / payroll / compliance reality
  differentiationBelongs: string[];
  safeCtaLanes: { intent: ContentIntent; cta: string }[];
}

export interface ContentBlueprint {
  outline: { heading: string; purpose: string }[];
  outputMatrix: { channel: string; format: string; quantity: number; intent: ContentIntent }[];
  requiredDisclaimers: string[];
  internalLinkTargets: string[]; // from Asset Library
}

/* ------------------------------------------------------------------ */
/* Product / factual claims & provenance                              */
/* ------------------------------------------------------------------ */

export type ClaimStatus = "verified" | "unverified" | "human_review";

/**
 * Every product claim must carry GTM Studio provenance. Prior content,
 * memory, or published blogs are NOT valid sources for product claims.
 */
export interface ProductClaim {
  id: string;
  text: string;
  status: ClaimStatus;
  // Provenance (required when status === "verified")
  gtmSourceDocument?: string;
  productId?: string;
  featureId?: string;
  sourceSection?: string;
  retrievedVersion?: string;
  timestamp?: string;
  note?: string; // why unverified / what a PMM should validate
}

export interface FactualClaim {
  id: string;
  text: string;
  status: ClaimStatus;
  datasetId?: string;
  sourceName?: string;
  dateRange?: string;
  sampleSize?: number;
  note?: string;
}

export interface SourceMapEntry {
  ref: string; // url or document
  type: "internal_asset" | "external_authority" | "gtm_studio" | "databricks" | "regulatory";
  anchorText?: string;
  contextNote?: string;
}

/* ------------------------------------------------------------------ */
/* Versioned content model + QA                                       */
/* ------------------------------------------------------------------ */

export interface ContentBlock {
  id: string;
  /** Stable block index for mapping QA issues to the exact block. */
  order: number;
  kind: "h1" | "h2" | "h3" | "paragraph" | "list" | "cta" | "meta";
  text: string;
}

export type QALayerKey =
  | "strategic_alignment"
  | "narrative_readability"
  | "brand_voice"
  | "factual_accuracy"
  | "channel_optimization"
  | "tone_authenticity"
  | "visual_structural"
  | "product_gtm_accuracy";

export const QA_LAYERS: { key: QALayerKey; index: number; name: string; short: string }[] = [
  { key: "strategic_alignment", index: 1, name: "Strategic & Contextual Alignment", short: "Strategic" },
  { key: "narrative_readability", index: 2, name: "Narrative Flow & Readability", short: "Readability" },
  { key: "brand_voice", index: 3, name: "Brand Voice & Tone", short: "Brand Voice" },
  { key: "factual_accuracy", index: 4, name: "Factual & Data Accuracy", short: "Factual" },
  { key: "channel_optimization", index: 5, name: "Channel-Specific Optimization", short: "Channel" },
  { key: "tone_authenticity", index: 6, name: "Tone Authenticity & AI Detection", short: "Authenticity" },
  { key: "visual_structural", index: 7, name: "Visual & Structural Integrity", short: "Visual" },
  { key: "product_gtm_accuracy", index: 8, name: "Product & GTM Accuracy", short: "Product/GTM" },
];

export type QAStatus = "pass" | "revision" | "fail";
export type Severity = "critical" | "high" | "moderate" | "low";

export interface QALayerResult {
  key: QALayerKey;
  score: number; // 0..5
  status: QAStatus;
  strengths: string[];
  weaknesses: string[];
  flaggedIssues: string[];
  recommendedFixes: string[];
  confidence: number; // 0..1
}

export interface QASuggestion {
  id: string;
  blockId: string; // maps to the exact content block it affects
  layer: QALayerKey;
  issueType: string;
  severity: Severity;
  currentText: string;
  suggestedReplacement: string;
  explanation: string;
  confidence: number; // 0..1
  sourceValidationStatus: ClaimStatus | "n/a";
  riskTierImpact: RiskTier | null;
  decision: ChangeDecision;
  decidedBy?: string;
  editedReplacement?: string;
  decidedAt?: string;
}

export type ChangeDecision = "pending" | "accepted" | "rejected" | "edited" | "sent_to_human";

export type QARouting = "pass" | "revision" | "block" | "human_review";

export interface QAReport {
  id: string;
  runAt: string;
  target: "draft" | "derivative";
  derivativeId?: string;
  layers: QALayerResult[];
  overallScore: number;
  routing: QARouting;
  routingReason: string;
  suggestions: QASuggestion[];
  topStrengths: string[];
  criticalFixes: string[];
  confidence: number;
  recommendedNextSteps: string[];
}

/* ------------------------------------------------------------------ */
/* Drafts & derivatives                                               */
/* ------------------------------------------------------------------ */

export interface ContentVersion {
  id: string;
  label: "original_draft" | "qa_suggested" | "user_approved" | "final_qa_passed";
  blocks: ContentBlock[];
  createdAt: string;
  createdBy: string;
}

export interface Draft {
  id: string;
  title: string;
  channel: string;
  format: string;
  blocks: ContentBlock[];
  versions: ContentVersion[];
}

/** Repurposing derivative — one channel-native output from the canonical narrative. */
export interface Derivative extends Draft {
  intent: ContentIntent;
  derivedFromSourceAssetId: string;
}

/* ------------------------------------------------------------------ */
/* Agent output packages                                              */
/* ------------------------------------------------------------------ */

export interface ProductionOutput {
  brief: StandardizedBrief;
  riskTier: RiskTier;
  problemIntentMap: ProblemIntentMap;
  canonicalNarrative: CanonicalNarrative;
  blueprint: ContentBlueprint;
  draft: Draft;
  productClaims: ProductClaim[];
  factualClaims: FactualClaim[];
  sourceMap: SourceMapEntry[];
  qaHandoffPackage: QAHandoffPackage;
}

export interface RepurposingOutput {
  sourceClassification: { origin: string; type: string; authority: string };
  riskTier: RiskTier;
  pim: ProblemIntentMap;
  canonicalNarrative: CanonicalNarrative;
  blueprint: ContentBlueprint;
  derivatives: Derivative[];
  sourceMap: SourceMapEntry[];
  qaHandoffPackage: QAHandoffPackage;
}

export interface QAHandoffPackage {
  riskTier: RiskTier;
  productClaims: ProductClaim[];
  factualClaims: FactualClaim[];
  sourceMap: SourceMapEntry[];
  references: string[];
}

/* ------------------------------------------------------------------ */
/* Audit & observability                                              */
/* ------------------------------------------------------------------ */

export interface AuditEntry {
  id: string;
  jobId: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  fromState?: JobState;
  toState?: JobState;
  meta?: Record<string, string | number | boolean>;
}

export interface StageTiming {
  stage: string;
  ms: number;
}

export interface JobMetrics {
  costUsd: number;
  stageTimings: StageTiming[];
  acceptedSuggestions: number;
  rejectedSuggestions: number;
  editedSuggestions: number;
  revisionAttempts: number;
  productClaimFailures: number;
}

/* ------------------------------------------------------------------ */
/* The Job aggregate                                                  */
/* ------------------------------------------------------------------ */

export type HumanReviewKind =
  | "tier2"
  | "blocked_output"
  | "unresolved_product_claim"
  | "unresolved_factual_claim"
  | "compliance_sensitive"
  | "legal_sensitive"
  | "competitive_claim"
  | "executive_thought_leadership"
  | "failed_revisions";

export interface HumanReviewTicket {
  reasons: HumanReviewKind[];
  assignedReviewer: string;
  productReviewNeeded: boolean;
  legalReviewNeeded: boolean;
  commsReviewNeeded: boolean;
  comments: { at: string; author: string; text: string }[];
}

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
  state: JobState;
  lane: AgentLane;
  /** True when the job was created via a standalone QA Check (QA Agent only). */
  qaOnly?: boolean;
  brief: StandardizedBrief;
  risk: RiskAssessment | null;

  production?: ProductionOutput;
  repurposing?: RepurposingOutput;

  qaReport: QAReport | null;
  finalQaReport: QAReport | null;

  humanReview: HumanReviewTicket | null;
  metrics: JobMetrics;
  exports: ExportRecord[];
}

export interface ExportRecord {
  id: string;
  format: ExportFormat;
  at: string;
  by: string;
  override: boolean;
  overrideReason?: string;
  preview: string;
}

export type ExportFormat =
  | "markdown"
  | "google_docs"
  | "hubspot"
  | "linkedin"
  | "csv_captions"
  | "html"
  | "json_package";

export const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "markdown", label: "Markdown" },
  { value: "google_docs", label: "Google Docs" },
  { value: "hubspot", label: "HubSpot" },
  { value: "linkedin", label: "LinkedIn-ready copy" },
  { value: "csv_captions", label: "CSV captions" },
  { value: "html", label: "HTML preview" },
  { value: "json_package", label: "JSON job package" },
];

/* ------------------------------------------------------------------ */
/* Routing thresholds (single source of truth)                        */
/* ------------------------------------------------------------------ */

export const QA_PASS_THRESHOLD = 4.5;
export const QA_REVISION_FLOOR = 3.0;
export const PRODUCT_GTM_REVIEW_FLOOR = 4.0;
export const MAX_REVISION_ATTEMPTS = 2;
