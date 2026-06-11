/**
 * Shared agent building blocks — the Problem-Intent Map, Sprout Canonical
 * Narrative, and Content Blueprint are produced the same way whether content is
 * net-new (Production) or repurposed (Repurposing). Centralizing them keeps the
 * two creator agents interchangeable behind the orchestrator.
 */

import type {
  CanonicalNarrative,
  ContentBlueprint,
  ContentIntent,
  ProblemIntentMap,
  StandardizedBrief,
} from "../schemas/contentos";
import type { ICPProfile } from "../data/icpKnowledgeService";
import type { Campaign } from "../data/campaignKnowledgeService";
import type { LibraryAsset } from "../data/assetLibraryService";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { complianceReferenceService } from "../data/complianceReferenceService";

// Local alias: only the campaign fields the narrative needs.
type CampaignLike = Pick<Campaign, "name" | "hook" | "positioning" | "approvedCtas"> | undefined;

export function buildProblemIntentMap(brief: StandardizedBrief, icp?: ICPProfile): ProblemIntentMap {
  const problems = [
    ...(brief.painPoints.length ? brief.painPoints : icp?.painPoints ?? []),
  ].slice(0, 5);
  const intentSignals = brief.contentIntent.map((intent) => ({
    intent,
    signal: signalForIntent(intent, icp),
  }));
  const readinessLevels = [
    { level: brief.readiness, note: `Primary readiness for ${icp?.label ?? brief.persona}.` },
  ];
  return { problems, intentSignals, readinessLevels };
}

function signalForIntent(intent: ContentIntent, icp?: ICPProfile): string {
  switch (intent) {
    case "awareness":
      return icp?.painPoints[0] ? `Searching for help with: ${icp.painPoints[0]}` : "Becoming aware of the problem.";
    case "consideration":
      return "Comparing approaches and looking for a credible guide.";
    case "evaluation":
      return icp?.objections[0] ? `Evaluating; key objection: ${icp.objections[0]}` : "Evaluating fit and proof.";
    case "conversion":
      return icp?.buyingTriggers[0] ? `Trigger present: ${icp.buyingTriggers[0]}` : "Ready to act.";
    case "retention":
      return "Existing customer seeking to expand value.";
    case "advocacy":
      return "Satisfied customer who may refer or share.";
  }
}

export function buildCanonicalNarrative(
  brief: StandardizedBrief,
  icp?: ICPProfile,
  campaign?: CampaignLike,
): CanonicalNarrative {
  const product = brief.product ? gtmStudioProductService.getProduct(brief.product) : undefined;

  const pain   = brief.painPoints?.[0]?.toLowerCase();
  const market = `Philippine ${brief.industry || "market"}`;
  const who    = icp?.label ?? brief.persona;
  const thesis =
    campaign?.positioning ??
    (pain
      ? `${who} teams in the ${market} are still dealing with ${pain} — a daily drag on productivity and compliance confidence. The path forward is practical, people-first, and built for how PH businesses actually operate.`
      : `For ${who} in the ${market}, the path forward is practical, compliant, and people-first.`);

  const keyInsights = [
    ...(icp?.painPoints.slice(0, 2) ?? []),
    ...(brief.painPoints.slice(0, 2) ?? []),
  ].filter(Boolean);

  // Sprout believes/recommends — generic strategic stance, NOT product claims.
  const sproutBelievesRecommends = [
    "People-first operations: AI should remove admin, not human accountability.",
    "A single source of truth across HR, payroll, and time prevents costly reconciliation and disputes.",
  ];

  // Boundaries — what we explicitly do not claim (anti-hallucination guardrail).
  const sproutDoesNotClaim = [
    "We do not provide legal advice.",
    "We do not claim product capabilities that are not documented in GTM Studio.",
    "We do not guarantee regulatory outcomes.",
  ];
  if (!product) sproutDoesNotClaim.push("No specific Sprout product is in scope for this asset; avoid product capability claims.");

  const phRealityMatters = [
    "Philippine statutory compliance (DOLE, BIR, SSS, PhilHealth, Pag-IBIG) is non-negotiable and changes frequently.",
    "Local payroll nuances (13th month, night differential, holiday pay) drive real disputes when handled manually.",
  ];

  const differentiationBelongs = product
    ? [`Where ${product.displayName} is genuinely differentiated for PH businesses, grounded only in GTM Studio facts.`]
    : ["Sprout's PH-specific build and People-First AI positioning."];

  const safeCtaLanes: { intent: ContentIntent; cta: string }[] = (brief.contentIntent.length
    ? brief.contentIntent
    : (["awareness", "consideration", "conversion"] as ContentIntent[])
  ).map((intent) => ({
    intent,
    cta: ctaForIntent(intent, campaign, brief),
  }));

  return {
    thesis,
    keyInsights: keyInsights.length ? keyInsights : ["The audience is overloaded with manual work and compliance risk."],
    sproutBelievesRecommends,
    sproutDoesNotClaim,
    phRealityMatters,
    differentiationBelongs,
    safeCtaLanes,
  };
}

function ctaForIntent(intent: ContentIntent, campaign: CampaignLike, brief: StandardizedBrief): string {
  if (intent === "awareness") return campaign?.approvedCtas[0] ?? "Read the related guide";
  if (intent === "consideration") return "Download the report";
  if (intent === "evaluation") return "See a side-by-side comparison";
  if (intent === "conversion") return brief.cta || campaign?.approvedCtas[0] || "Book a demo";
  return "Talk to our team";
}

export function buildBlueprint(
  brief: StandardizedBrief,
  narrative: CanonicalNarrative,
  links: LibraryAsset[],
): ContentBlueprint {
  const outline = [
    { heading: "Hook", purpose: "Open with the reader's problem, not Sprout." },
    { heading: "Why it matters now (PH context)", purpose: "Ground in Philippine HR/payroll/compliance reality." },
    { heading: "What good looks like", purpose: "Sprout's recommended approach from the canonical narrative." },
    { heading: "Proof", purpose: "Cite only verified GTM Studio proof points and approved datasets." },
    { heading: "Call to action", purpose: "Use a safe CTA lane for the reader's intent." },
  ];

  const outputMatrix = (brief.desiredOutputs.length
    ? brief.desiredOutputs
    : [{ channel: brief.channel || "blog", format: brief.jobType, quantity: 1 }]
  ).map((o, i) => ({
    channel: o.channel,
    format: o.format,
    quantity: o.quantity,
    intent: brief.contentIntent[i % Math.max(brief.contentIntent.length, 1)] ?? "awareness",
  }));

  const requiredDisclaimers: string[] = [];
  if (brief.complianceContext || brief.regulatory) requiredDisclaimers.push(complianceReferenceService.disclaimer());

  return {
    outline,
    outputMatrix,
    requiredDisclaimers,
    internalLinkTargets: links.map((l) => l.url),
  };
}
