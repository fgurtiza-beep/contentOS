/**
 * Production Agent (stub)
 * -----------------------
 * Generates net-new content from a standardized brief. Runs the internal stages:
 *   risk tiering → context retrieval → brief refinement → Problem-Intent Map →
 *   Canonical Narrative → Content Blueprint → draft generation → QA handoff.
 *
 * This is a DETERMINISTIC stub: in production it is replaced by a system-prompted
 * LLM service. It assembles outputs from the standardized brief plus retrieved
 * context, and it never generates unsupported product claims — every product
 * statement is verified against the GTM Studio Product Knowledge Service and
 * marked UNVERIFIED when it cannot be traced.
 */

import type {
  ContentBlock,
  Draft,
  ProductionOutput,
  RiskTier,
  SourceMapEntry,
  StandardizedBrief,
} from "../schemas/contentos";
import { brandKnowledgeService } from "../data/brandKnowledgeService";
import { icpKnowledgeService } from "../data/icpKnowledgeService";
import { campaignKnowledgeService } from "../data/campaignKnowledgeService";
import { assetLibraryService } from "../data/assetLibraryService";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { databricksApprovedViewsService } from "../data/databricksApprovedViewsService";
import { complianceReferenceService } from "../data/complianceReferenceService";
import { block, nextId } from "../util";
import {
  buildCanonicalNarrative,
  buildProblemIntentMap,
  buildBlueprint,
} from "./shared";

export function runProductionAgent(brief: StandardizedBrief, riskTier: RiskTier, ts: string): ProductionOutput {
  const icp = icpKnowledgeService.resolve(brief.primaryICP);
  const campaign = campaignKnowledgeService.resolve(brief.campaign);
  const tone = brandKnowledgeService.toneFor(brief.jobType);
  const links = assetLibraryService.search(
    [brief.seoKeyword, brief.product, ...brief.painPoints].filter(Boolean),
    icp?.id,
  );

  const pim = buildProblemIntentMap(brief, icp);
  const narrative = buildCanonicalNarrative(brief, icp, campaign);
  const blueprint = buildBlueprint(brief, narrative, links);

  // ---- Draft generation -------------------------------------------------
  const blocks: ContentBlock[] = [];
  let order = 0;

  blocks.push(block(order++, "h1", brief.title));
  blocks.push(
    block(
      order++,
      "meta",
      `Meta description: ${truncate(brief.objective, 150)}`,
    ),
  );

  // Intro — intentionally includes a couple of watchlist phrases + an em dash so
  // the QA layer has real, block-level issues to surface in the demo.
  blocks.push(
    block(
      order++,
      "paragraph",
      `In the fast-paced world of Philippine HR, ${icp?.label ?? brief.persona} teams face ${
        brief.painPoints[0] ?? "mounting admin and compliance pressure"
      } — a problem that quietly drains time and trust. ${narrative.thesis}`,
    ),
  );

  // Body — verified product capability claim (traced to GTM Studio)
  const productClaims = [];
  const factualClaims = [];

  if (brief.product) {
    const product = gtmStudioProductService.getProduct(brief.product);
    const cap = product?.facts.find((f) => f.fieldType === "capability");
    if (product && cap) {
      const claim = gtmStudioProductService.buildClaim(product.slug, cap.id, ts);
      productClaims.push(claim);
      blocks.push(block(order++, "h2", `How ${product.displayName} helps`));
      blocks.push(block(order++, "paragraph", cap.text));
    }
    // An intentionally UNVERIFIED product claim (cannot be traced) so the
    // Product & GTM Accuracy layer flags it and routes to validation.
    const risky = gtmStudioProductService.verifyText(
      brief.product,
      `${gtmStudioProductService.getProduct(brief.product)?.displayName ?? "Sprout"} guarantees 100% audit-proof compliance and a fully autonomous payroll run with zero human oversight.`,
      ts,
    );
    productClaims.push(risky);
    blocks.push(
      block(
        order++,
        "paragraph",
        risky.text,
      ),
    );
  }

  // Data citation from an approved view (if selected)
  if (brief.datasets.length > 0) {
    const dv = databricksApprovedViewsService.get(brief.datasets[0]);
    if (dv) {
      const guard = databricksApprovedViewsService.citationGuardrails(dv.datasetId);
      factualClaims.push({
        id: nextId("fact"),
        text: `Across ${dv.name} (${dv.dateRange}, n=${dv.sampleSizeN}), Sprout customers saw measurable improvement.`,
        status: guard.allowed ? ("verified" as const) : ("human_review" as const),
        datasetId: dv.datasetId,
        sourceName: dv.name,
        dateRange: dv.dateRange,
        sampleSize: dv.sampleSizeN,
        note: guard.warnings.join(" "),
      });
      blocks.push(
        block(
          order++,
          "paragraph",
          `Across ${dv.name} (${dv.dateRange}, n=${dv.sampleSizeN}), Sprout customers saw measurable improvement.`,
        ),
      );
    }
  }

  // Compliance disclaimer for any compliance context
  if (brief.complianceContext || brief.regulatory) {
    blocks.push(block(order++, "paragraph", complianceReferenceService.disclaimer()));
  }

  // CTA
  const cta = brief.cta || campaign?.approvedCtas[0] || "Book a demo";
  blocks.push(block(order++, "cta", cta));

  const draft: Draft = {
    id: nextId("draft"),
    title: brief.title,
    channel: brief.channel || "blog",
    format: brief.jobType,
    blocks,
    versions: [
      {
        id: nextId("ver"),
        label: "original_draft",
        blocks: blocks.map((b) => ({ ...b })),
        createdAt: ts,
        createdBy: "Production Agent",
      },
    ],
  };

  const sourceMap: SourceMapEntry[] = links.map((l) => ({
    ref: l.url,
    type: "internal_asset" as const,
    anchorText: l.title,
    contextNote: l.summary,
  }));
  if (brief.product) {
    const p = gtmStudioProductService.getProduct(brief.product);
    if (p) sourceMap.push({ ref: p.sourceDocument, type: "gtm_studio" as const, anchorText: p.displayName, contextNote: `Retrieved version ${p.retrievedVersion}` });
  }

  return {
    brief,
    riskTier,
    problemIntentMap: pim,
    canonicalNarrative: narrative,
    blueprint,
    draft,
    productClaims,
    factualClaims,
    sourceMap,
    qaHandoffPackage: {
      riskTier,
      productClaims,
      factualClaims,
      sourceMap,
      references: [tone, ...links.map((l) => l.url)],
    },
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
