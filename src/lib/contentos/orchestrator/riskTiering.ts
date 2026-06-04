/**
 * Risk tiering
 * ------------
 * Tier 0 — no regulatory/competitor/product/compliance content; low visibility.
 * Tier 1 — light product mention/interpretation; general campaign messaging.
 * Tier 2 — regulatory/legal/compliance interpretation, competitor claims,
 *          pricing/security/product-capability/integration/AI/roadmap claims,
 *          high-visibility thought leadership, executive comms, customer-sensitive.
 *
 * Tier 2 jobs are always held for human review before export.
 */

import type { RiskAssessment, RiskTier, StandardizedBrief } from "../schemas/contentos";
import { gtmStudioProductService } from "../data/gtmStudioProductService";

const TIER2_JOB_TYPES = new Set([
  "convert_regulatory_update",
  "reframe_competitor_pov",
]);

const HIGH_VIS_JOB_TYPES = new Set(["whitepaper", "exec_one_pager", "press_release", "award_entry"]);

const PRODUCT_CLAIM_TOPICS = /\b(pricing|price|cost|security|secure|compliance|integration|integrat|roadmap|uptime|sla|ai capabilit|capabilit)\b/i;

export function assessRisk(brief: StandardizedBrief): RiskAssessment {
  const signals: string[] = [];
  let tier = 0; // accumulated as a plain number, cast to RiskTier at the end

  const bump = (to: number, reason: string) => {
    if (to > tier) tier = to;
    signals.push(reason);
  };

  // Job-type driven
  if (TIER2_JOB_TYPES.has(brief.jobType)) bump(2, `Job type "${brief.jobType}" involves regulatory or competitive interpretation.`);
  if (HIGH_VIS_JOB_TYPES.has(brief.jobType)) bump(2, "High-visibility thought leadership or executive communication.");

  // Addenda
  if (brief.regulatory) {
    bump(2, `Regulatory addendum present (${brief.regulatory.issuingBody}); compliance interpretation.`);
    if (brief.regulatory.legalReviewNeeded) signals.push("Legal review explicitly flagged on the regulatory addendum.");
  }
  if (brief.competitorAddendum || brief.competitor) bump(2, "Competitor claims are always Tier 2.");
  if (brief.complianceContext.trim()) bump(2, "Compliance context provided; treated as compliance interpretation.");

  // Product claims
  if (brief.product) {
    const facts = gtmStudioProductService.getProduct(brief.product)?.facts ?? [];
    const tier2Fact = facts.some((f) => f.tier2Topic);
    if (PRODUCT_CLAIM_TOPICS.test(brief.objective + " " + brief.mustInclude.join(" "))) {
      bump(2, "Brief references pricing/security/compliance/integration/roadmap/AI capability claims.");
    } else if (tier2Fact && brief.contentIntent.some((i) => i === "evaluation" || i === "conversion")) {
      bump(2, "Product capability claims at evaluation/conversion stage require GTM validation.");
    } else {
      bump(1, "Product is mentioned; at minimum a light product mention applies.");
    }
  }

  // Datasets cited
  if (brief.datasets.length > 0 && tier < 1) bump(1, "Cites approved datasets; light interpretation.");

  // User's own sensitivity read can raise the floor
  if (brief.riskSensitivity === "high") bump(2, "Submitter marked risk sensitivity as high.");
  if (brief.riskSensitivity === "moderate" && tier < 1) bump(1, "Submitter marked risk sensitivity as moderate.");

  if (signals.length === 0) signals.push("No regulatory, competitor, product, or compliance signals detected. Low-visibility content.");

  const finalTier = tier as RiskTier;
  return {
    tier: finalTier,
    signals,
    requiresHumanReview: tier === 2,
    rationale:
      tier === 2
        ? "Tier 2: always held for human review before export."
        : tier === 1
        ? "Tier 1: moderate. QA gates apply; no mandatory human review unless QA flags a critical issue."
        : "Tier 0: low. Standard QA applies.",
  };
}
