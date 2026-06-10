/**
 * Repurposing Agent (stub)
 * ------------------------
 * Follows IMD 2.0 doctrine. Turns ONE approved Source Asset into channel-native
 * derivatives built from the Sprout Canonical Narrative (not raw excerpts).
 *
 * Hard rules enforced here:
 *  - One approved Source Asset only (validated before generation)
 *  - No cross-asset blending
 *  - Derivatives derive from the Canonical Narrative, preserving positioning
 *  - Repurposing is not summarization
 *  - Every derivative carries its source asset id and goes to QA individually
 *
 * Execution sequence: source classification → metadata validation → risk tiering
 *  → Problem-Intent Map → Sprout Canonical Narrative → Repurposing Blueprint →
 *  channel-native derivatives → QA handoff per derivative.
 */

import type {
  ContentBlock,
  Derivative,
  KeyTakeaway,
  RepurposingOutput,
  RiskTier,
  StandardizedBrief,
  VideoTranscriptOutput,
} from "../schemas/contentos";
import { icpKnowledgeService } from "../data/icpKnowledgeService";
import { campaignKnowledgeService } from "../data/campaignKnowledgeService";
import { assetLibraryService } from "../data/assetLibraryService";
import { complianceReferenceService } from "../data/complianceReferenceService";
import { block, nextId } from "../util";
import { buildCanonicalNarrative, buildProblemIntentMap, buildBlueprint } from "./shared";

export class RepurposingError extends Error {}

/**
 * All asset types the Repurposing Agent accepts as source material.
 * Add new types here — the agent will reject anything not in this list.
 */
export const ELIGIBLE_SOURCE_ASSET_TYPES = [
  "blog",
  "report",
  "webinar",
  "regulation",
  "pr",
  "case-study",
  "whitepaper",
  "social-post",
  "email",
  "video-transcript", // Processed VideoTranscriptOutput only — raw excerpts are ineligible (see below).
] as const;

export type SourceAssetType = typeof ELIGIBLE_SOURCE_ASSET_TYPES[number];

export function runRepurposingAgent(
  brief: StandardizedBrief,
  riskTier: RiskTier,
  ts: string,
  videoTranscript?: VideoTranscriptOutput,
): RepurposingOutput {
  const src = brief.sourceAsset;

  // ---- Metadata validation (IMD 2.0 Step 1) -----------------------------
  if (!src) throw new RepurposingError("Repurposing requires exactly one Source Asset. None provided.");
  if (!src.approved) throw new RepurposingError("The Source Asset must be approved before repurposing. It is not approved.");
  if (!src.content.trim()) throw new RepurposingError("Source Asset content is empty. Provide the source text or excerpt.");
  if (!(ELIGIBLE_SOURCE_ASSET_TYPES as readonly string[]).includes(src.assetType)) {
    throw new RepurposingError(
      `Source asset type "${src.assetType}" is not eligible for repurposing. ` +
      `Eligible types: ${ELIGIBLE_SOURCE_ASSET_TYPES.join(", ")}.`,
    );
  }

  // ---- Source classification (Step 2) -----------------------------------
  const sourceClassification = {
    origin: src.origin,
    type: src.assetType,
    authority: src.origin === "external" || src.origin === "regulatory" ? "authoritative external" : src.origin === "competitor" ? "competitor (handle with care)" : "Sprout first-party",
  };

  const icp = icpKnowledgeService.resolve(brief.primaryICP);
  const campaign = campaignKnowledgeService.resolve(brief.campaign);

  // ---- Transcript enrichment (video-transcript source only) -------------
  // Raw transcript excerpts must not be used directly as derivative content.
  // The Canonical Narrative is the mandatory intermediate step: the
  // executiveSummary seeds the thesis, and keyTakeaways seed the insights.
  // Only the processed VideoTranscriptOutput is eligible — src.content alone
  // (raw pasted transcript) is not sufficient.
  let briefForNarrative = brief;
  if (src.assetType === "video-transcript") {
    if (!videoTranscript) {
      throw new RepurposingError(
        "Source asset type is video-transcript but no VideoTranscriptOutput is attached to this job. " +
        "Run the Video Intelligence pipeline on this job before repurposing.",
      );
    }
    briefForNarrative = structuredClone(brief);
    // Executive summary becomes the objective that drives the narrative thesis.
    briefForNarrative.objective = videoTranscript.executiveSummary;
    // Flatten keyTakeaway bullets into pain-point-style insights (max 6).
    const transcriptInsights = videoTranscript.keyTakeaways
      .flatMap((kt: KeyTakeaway) => kt.bullets.map((b: string) => `${kt.topic}: ${b}`))
      .slice(0, 4);
    briefForNarrative.painPoints = [
      ...new Set([...brief.painPoints, ...transcriptInsights]),
    ].slice(0, 6);
  }

  const links = assetLibraryService.search([brief.seoKeyword, brief.product, ...briefForNarrative.painPoints].filter(Boolean), icp?.id);

  // ---- PIM → Canonical Narrative → Blueprint ----------------------------
  const pim = buildProblemIntentMap(briefForNarrative, icp);
  const narrative = buildCanonicalNarrative(briefForNarrative, icp, campaign);
  const blueprint = buildBlueprint(briefForNarrative, narrative, links);

  // ---- Channel-native derivatives (Step 5) ------------------------------
  const requests = brief.desiredOutputs.length
    ? brief.desiredOutputs
    : [{ channel: "LinkedIn", format: "post", quantity: 3 }];

  const derivatives: Derivative[] = [];
  requests.forEach((req) => {
    const qty = Math.max(1, req.quantity);
    for (let i = 0; i < qty; i++) {
      const intent = brief.contentIntent[(derivatives.length) % Math.max(brief.contentIntent.length, 1)] ?? "awareness";
      derivatives.push(buildDerivative(req.channel, req.format, i + 1, intent, narrative, brief, ts, src.id));
    }
  });

  const sourceMap = [
    { ref: src.url || src.title, type: classifySource(src.origin), anchorText: src.title, contextNote: `Single approved source asset (${src.assetType}).` },
    ...links.map((l) => ({ ref: l.url, type: "internal_asset" as const, anchorText: l.title, contextNote: l.summary })),
  ];

  return {
    sourceClassification,
    riskTier,
    pim,
    canonicalNarrative: narrative,
    blueprint,
    derivatives,
    sourceMap,
    qaHandoffPackage: {
      riskTier,
      productClaims: [],
      factualClaims: [],
      sourceMap,
      references: [src.url, ...links.map((l) => l.url)].filter(Boolean),
    },
  };
}

function classifySource(origin: string) {
  if (origin === "regulatory") return "regulatory" as const;
  if (origin === "external" || origin === "competitor") return "external_authority" as const;
  return "internal_asset" as const;
}

function buildDerivative(
  channel: string,
  format: string,
  n: number,
  intent: Derivative["intent"],
  narrative: ReturnType<typeof buildCanonicalNarrative>,
  brief: StandardizedBrief,
  ts: string,
  sourceAssetId: string,
): Derivative {
  const blocks: ContentBlock[] = [];
  let order = 0;
  const insight = narrative.keyInsights[(n - 1) % Math.max(narrative.keyInsights.length, 1)] ?? narrative.thesis;
  const cta = narrative.safeCtaLanes.find((l) => l.intent === intent)?.cta ?? "Talk to our team";

  blocks.push(block(order++, "h2", `${channel} ${format} #${n}`));
  // Hook is channel-native, derived from the narrative — not a shortened excerpt.
  blocks.push(block(order++, "paragraph", hookFor(channel, insight)));
  blocks.push(block(order++, "paragraph", `${narrative.sproutBelievesRecommends[0]} ${narrative.phRealityMatters[0]}`));
  if (brief.regulatory) blocks.push(block(order++, "paragraph", complianceReferenceService.disclaimer()));
  blocks.push(block(order++, "cta", cta));

  return {
    id: nextId("deriv"),
    title: `${channel} ${format} #${n}`,
    channel,
    format,
    intent,
    derivedFromSourceAssetId: sourceAssetId,
    blocks,
    versions: [
      { id: nextId("ver"), label: "original_draft", blocks: blocks.map((b) => ({ ...b })), createdAt: ts, createdBy: "Repurposing Agent" },
    ],
  };
}

function hookFor(channel: string, insight: string): string {
  const c = channel.toLowerCase();
  if (c.includes("linkedin")) return `Most ${"PH"} HR teams accept ${lower(insight)} as normal. It does not have to be.`;
  if (c.includes("x") || c.includes("twitter")) return `${capped(insight, 180)}`;
  if (c.includes("instagram")) return `Swipe: ${lower(insight)}`;
  if (c.includes("email")) return `A quick note on ${lower(insight)} — and what good looks like.`;
  return insight;
}

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const capped = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
