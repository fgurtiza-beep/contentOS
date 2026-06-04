/**
 * QA Agent (stub)
 * ---------------
 * Evaluates every draft and derivative with the 8-layer QA framework and emits
 * block-mapped suggestions. Grounds itself only on the provided content plus the
 * handoff references — when it cannot verify, it flags for human review instead
 * of fabricating (the anti-hallucination rule from the QA prompt).
 *
 * 8 layers:
 *  1 Strategic & Contextual Alignment
 *  2 Narrative Flow & Readability
 *  3 Brand Voice & Tone
 *  4 Factual & Data Accuracy
 *  5 Channel-Specific Optimization
 *  6 Tone Authenticity & AI Detection
 *  7 Visual & Structural Integrity
 *  8 Product & GTM Accuracy
 *
 * Routing:
 *  overall >= 4.5 → pass · 3.0–4.4 → revision · < 3.0 → block
 *  any critical factual/product/compliance/legal issue → hold
 *  Product & GTM Accuracy < 4.0 → revision or human review
 *  Tier 2 → human review regardless of score
 */

import type {
  ContentBlock,
  Draft,
  QAHandoffPackage,
  QALayerKey,
  QALayerResult,
  QAReport,
  QARouting,
  QAStatus,
  QASuggestion,
  RiskTier,
  Severity,
} from "../schemas/contentos";
import {
  PRODUCT_GTM_REVIEW_FLOOR,
  QA_LAYERS,
  QA_PASS_THRESHOLD,
  QA_REVISION_FLOOR,
} from "../schemas/contentos";
import { brandKnowledgeService } from "../data/brandKnowledgeService";
import { assetLibraryService } from "../data/assetLibraryService";
import { avg, nextId, round1 } from "../util";

interface DraftLike extends Pick<Draft, "blocks" | "channel" | "format"> {}

export function runQAAgent(
  content: DraftLike,
  handoff: QAHandoffPackage,
  riskTier: RiskTier,
  ts: string,
  target: "draft" | "derivative" = "draft",
  derivativeId?: string,
): QAReport {
  const blocks = content.blocks;
  const text = blocks.map((b) => b.text).join("\n");
  const suggestions: QASuggestion[] = [];

  const layerAccumulator: Record<QALayerKey, { issues: string[]; fixes: string[]; strengths: string[]; penalty: number }> =
    Object.fromEntries(QA_LAYERS.map((l) => [l.key, { issues: [], fixes: [], strengths: [], penalty: 0 }])) as never;

  const note = (key: QALayerKey, issue: string, fix: string, penalty: number) => {
    layerAccumulator[key].issues.push(issue);
    layerAccumulator[key].fixes.push(fix);
    layerAccumulator[key].penalty += penalty;
  };
  const strength = (key: QALayerKey, s: string) => layerAccumulator[key].strengths.push(s);

  // -- Layer 6: Tone authenticity / AI detection — clichés + em dashes ----
  blocks.forEach((b) => {
    const cliches = brandKnowledgeService.scanCliches(b.text);
    cliches.forEach((c) => {
      suggestions.push(
        mkSuggestion(b, "tone_authenticity", "AI cliché / buzzword", "high", b.text, replacePhrase(b.text, c), `"${c}" is on Sprout's cliché watchlist (Appendix A). Replace with grounded, specific language.`, 0.9, "n/a", null),
      );
      note("tone_authenticity", `Watchlist phrase: "${c}"`, `Remove "${c}".`, 0.6);
      note("brand_voice", `Generic phrasing reduces brand authenticity ("${c}").`, "Use specific, human language.", 0.25);
    });
    const formulaic = brandKnowledgeService.scanFormulaic(b.text);
    formulaic.forEach((f) => {
      const isEmDash = f.toLowerCase().includes("em dash");
      suggestions.push(
        mkSuggestion(b, "tone_authenticity", isEmDash ? "Em dash overuse" : "Formulaic construction", "moderate", b.text, isEmDash ? b.text.replace(/\s*—\s*/g, ", ") : b.text, `${f}. Avoid for an authentic, human tone.`, 0.7, "n/a", null),
      );
      note("tone_authenticity", f, isEmDash ? "Replace em dashes with commas or periods." : "Rework the sentence structure.", 0.4);
    });
  });

  // -- Layer 8: Product & GTM accuracy — unverified product claims --------
  let productFailures = 0;
  handoff.productClaims.forEach((claim) => {
    if (claim.status === "verified") {
      strength("product_gtm_accuracy", `Verified against ${claim.gtmSourceDocument} (${claim.sourceSection}).`);
      return;
    }
    productFailures++;
    const blk = blocks.find((b) => claim.text && b.text.includes(claim.text.slice(0, 24))) ?? blocks[blocks.length - 1];
    suggestions.push(
      mkSuggestion(
        blk,
        "product_gtm_accuracy",
        "Unverified product claim",
        "critical",
        claim.text || blk.text,
        "[Remove or replace with a GTM Studio-verified statement]",
        claim.note ?? "Cannot be traced to GTM Studio. Do not present as fact; route to Product Marketing to validate.",
        0.92,
        "unverified",
        riskTier,
      ),
    );
    note("product_gtm_accuracy", "Unverified product claim present.", "Trace to GTM Studio or remove. Route to Product Marketing.", 1.4);
  });

  // -- Layer 4: Factual / data accuracy — dataset guardrails --------------
  handoff.factualClaims.forEach((claim) => {
    if (claim.status === "human_review" || claim.status === "unverified") {
      const blk = blocks.find((b) => b.text.includes((claim.sourceName ?? "").slice(0, 16))) ?? blocks[blocks.length - 1];
      suggestions.push(
        mkSuggestion(blk, "factual_accuracy", "Data citation needs validation", "high", blk.text, blk.text, claim.note || "Dataset citation requires owner approval or carries a small-sample caveat.", 0.75, claim.status, null),
      );
      note("factual_accuracy", `Data claim flagged: ${claim.sourceName}`, "Add caveat / get owner approval, or remove.", 0.6);
    } else {
      strength("factual_accuracy", `Cited ${claim.sourceName} (${claim.dateRange}, n=${claim.sampleSize}).`);
    }
  });

  // -- Layer 5: Channel optimization — internal links for blogs -----------
  const isBlog = content.channel === "blog" || content.format === "blog";
  if (isBlog) {
    const linkCount = handoff.sourceMap.filter((s) => s.type === "internal_asset").length;
    if (linkCount < 3) {
      const suggested = assetLibraryService.list().slice(0, 3).map((a) => a.title).join(", ");
      const blk = blocks[blocks.length - 1];
      suggestions.push(
        mkSuggestion(blk, "channel_optimization", "Insufficient internal links", "moderate", blk.text, blk.text, `Rubric 5a requires 3–5 internal Sprout links. Suggested: ${suggested}.`, 0.8, "n/a", null),
      );
      note("channel_optimization", `Only ${linkCount} internal link(s); 3–5 required for blogs.`, "Add 3–5 contextual internal links with descriptive anchor text.", 0.7);
    } else {
      strength("channel_optimization", `${linkCount} internal links present.`);
    }
    const hasMeta = blocks.some((b) => b.kind === "meta");
    if (!hasMeta) note("channel_optimization", "No meta description.", "Add a meta description under 160 characters.", 0.4);
    else strength("channel_optimization", "Meta description present.");
  }

  // -- Layer 2: Readability — block structure -----------------------------
  const hasHeading = blocks.some((b) => b.kind === "h1" || b.kind === "h2");
  if (!hasHeading) note("narrative_readability", "No clear heading structure.", "Add H1/H2 headers for skimmability.", 0.8);
  else strength("narrative_readability", "Clear heading structure.");
  const hasCta = blocks.some((b) => b.kind === "cta");
  if (!hasCta) note("strategic_alignment", "No CTA.", "Add a CTA matched to reader intent and funnel stage.", 0.7);
  else strength("strategic_alignment", "CTA present.");

  // -- Layer 1: Strategic alignment — campaign tie-in ---------------------
  strength("strategic_alignment", "Brief objective reflected in the opening.");

  // -- Layer 3: brand voice baseline --------------------------------------
  if (layerAccumulator.brand_voice.issues.length === 0) strength("brand_voice", "Tone consistent with Sprout's style guide.");

  // -- Layer 7: Visual & structural integrity (prototype: text-only) ------
  strength("visual_structural", "Logical text hierarchy. Visual review pending design assets.");

  // ---- Score each layer -------------------------------------------------
  const layers: QALayerResult[] = QA_LAYERS.map((l) => {
    const acc = layerAccumulator[l.key];
    const score = clamp(5 - acc.penalty, 0, 5);
    const status: QAStatus = score >= QA_PASS_THRESHOLD ? "pass" : score >= QA_REVISION_FLOOR ? "revision" : "fail";
    return {
      key: l.key,
      score: round1(score),
      status,
      strengths: acc.strengths,
      weaknesses: acc.issues,
      flaggedIssues: acc.issues,
      recommendedFixes: acc.fixes,
      confidence: acc.issues.length ? 0.8 : 0.92,
    };
  });

  const overallScore = round1(avg(layers.map((l) => l.score)));
  const productLayer = layers.find((l) => l.key === "product_gtm_accuracy")!;
  const hasCritical = suggestions.some((s) => s.severity === "critical");

  const { routing, reason } = decideRouting(overallScore, productLayer.score, hasCritical, riskTier);

  return {
    id: nextId("qa"),
    runAt: ts,
    target,
    derivativeId,
    layers,
    overallScore,
    routing,
    routingReason: reason,
    suggestions,
    topStrengths: layers.flatMap((l) => l.strengths).slice(0, 4),
    criticalFixes: suggestions.filter((s) => s.severity === "critical" || s.severity === "high").map((s) => s.explanation).slice(0, 5),
    confidence: round1(avg(layers.map((l) => l.confidence))),
    recommendedNextSteps: nextSteps(routing, productFailures),
  };
}

function decideRouting(overall: number, productScore: number, hasCritical: boolean, tier: RiskTier): { routing: QARouting; reason: string } {
  if (tier === 2) return { routing: "human_review", reason: "Tier 2: human review required regardless of score." };
  if (hasCritical) return { routing: "human_review", reason: "A critical factual/product/compliance/legal issue was flagged — held for human review." };
  if (productScore < PRODUCT_GTM_REVIEW_FLOOR) return { routing: "human_review", reason: `Product & GTM Accuracy ${productScore} is below ${PRODUCT_GTM_REVIEW_FLOOR}; route to product review.` };
  if (overall < QA_REVISION_FLOOR) return { routing: "block", reason: `Overall ${overall} is below ${QA_REVISION_FLOOR}; blocked.` };
  if (overall < QA_PASS_THRESHOLD) return { routing: "revision", reason: `Overall ${overall} is in the 3.0–4.4 band; revision required.` };
  return { routing: "pass", reason: `Overall ${overall} meets the ${QA_PASS_THRESHOLD} pass threshold.` };
}

function nextSteps(routing: QARouting, productFailures: number): string[] {
  const steps: string[] = [];
  if (routing === "pass") steps.push("Submit final draft to QA confirmation, then export.");
  if (routing === "revision") steps.push("Apply suggested corrections in the side-by-side workspace, then resubmit to QA.");
  if (routing === "block") steps.push("Content blocked. Rework fundamentals before resubmitting.");
  if (routing === "human_review") steps.push("Routed to the Human Review Queue. A reviewer must approve before export.");
  if (productFailures > 0) steps.push(`${productFailures} product claim(s) need GTM Studio validation by Product Marketing.`);
  return steps;
}

function mkSuggestion(
  blk: ContentBlock,
  layer: QALayerKey,
  issueType: string,
  severity: Severity,
  currentText: string,
  suggestedReplacement: string,
  explanation: string,
  confidence: number,
  sourceValidationStatus: QASuggestion["sourceValidationStatus"],
  riskTierImpact: RiskTier | null,
): QASuggestion {
  return {
    id: nextId("sug"),
    blockId: blk.id,
    layer,
    issueType,
    severity,
    currentText,
    suggestedReplacement,
    explanation,
    confidence,
    sourceValidationStatus,
    riskTierImpact,
    decision: "pending",
  };
}

function replacePhrase(text: string, phrase: string): string {
  const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  return text.replace(re, "").replace(/\s{2,}/g, " ").replace(/^[,\s]+/, "").trim();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
