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
  HookAlternative,
  ProductionOutput,
  RiskTier,
  SourceMapEntry,
  StandardizedBrief,
} from "../schemas/contentos";
import { runHookQACheck } from "./hookScorer";
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
  const productClaims = [];
  const factualClaims = [];
  let draftHookScore: number | undefined;
  let draftHookAlts: HookAlternative[] | undefined;

  if (brief.jobType === "social_post") {
    const who     = icp?.label ?? brief.persona;
    const pain    = brief.painPoints[0] ?? "manual compliance pressure";
    const pain2   = brief.painPoints[1] ?? "growing audit risk";
    const market  = `Philippine ${brief.industry || "market"}`;
    const product = brief.product ? gtmStudioProductService.getProduct(brief.product) : undefined;
    const cap     = product?.facts.find((f) => f.fieldType === "capability");
    const cta     = brief.cta || campaign?.approvedCtas[0] || "Book a demo →";
    const indTag  = `#${(brief.industry ?? "HR").replace(/\s+/g, "")}`;
    const year    = new Date(ts).getFullYear();

    if (product && cap) {
      productClaims.push(gtmStudioProductService.buildClaim(product.slug, cap.id, ts));
    }

    // Dataset citation if available
    let dataLine = "";
    if (brief.datasets.length > 0) {
      const dv = databricksApprovedViewsService.get(brief.datasets[0]);
      if (dv) {
        const guard = databricksApprovedViewsService.citationGuardrails(dv.datasetId);
        dataLine = `Across ${dv.name} (${dv.dateRange}, n=${dv.sampleSizeN}), Sprout customers saw measurable improvement.`;
        factualClaims.push({
          id: nextId("fact"), text: dataLine,
          status: guard.allowed ? ("verified" as const) : ("human_review" as const),
          datasetId: dv.datasetId, sourceName: dv.name,
          dateRange: dv.dateRange, sampleSize: dv.sampleSizeN, note: guard.warnings.join(" "),
        });
      }
    }

    const capLine = cap?.text ?? `${product?.displayName ?? "Sprout"} is built for how PH businesses actually operate.`;

    const platforms = brief.socialPlatforms ?? [];

    if (platforms.length > 0) {
      // Platform-specific captions — one block per selected platform
      for (const platform of platforms) {
        blocks.push(block(order++, "h3", `${platform} caption`));
        blocks.push(block(order++, "paragraph", buildPlatformCaption(platform, {
          who, pain, pain2, market, capLine, cta, dataLine, indTag, year,
        })));
      }
    } else {
      // Generic 3-variant fallback when no platform is chosen
      const hashtags = `#SproutSolutions #PhilippineHR ${indTag}`;

      blocks.push(block(order++, "h3", "Variant 1 — Awareness Hook"));
      blocks.push(block(order++, "paragraph",
        `Still dealing with ${pain} in ${year}?\n\n` +
        `For ${who} teams in the ${market}, it's not just a time sink — it's a liability.\n\n` +
        `There's a better way to run compliant, people-first operations.\n\n` +
        hashtags,
      ));

      blocks.push(block(order++, "h3", "Variant 2 — Insight / Evidence"));
      const insightBody = dataLine
        ? `${dataLine}\n\nWhen ${who} teams stop chasing ${pain2} manually, they get their time back — and their confidence in compliance, too.\n\n`
        : `${narrative.thesis}\n\nWhen ${who} teams stop chasing ${pain2} manually, they get their time back — and their confidence in compliance, too.\n\n`;
      blocks.push(block(order++, "paragraph", insightBody + hashtags));

      blocks.push(block(order++, "h3", "Variant 3 — Conversion / CTA"));
      blocks.push(block(order++, "paragraph",
        `${capLine}\n\n` +
        `${who} teams across the ${market} use it to move faster, stay compliant, and put people first.\n\n` +
        `${cta}\n\n` + hashtags,
      ));
    }

    // Compliance disclaimer if needed
    if (brief.complianceContext || brief.regulatory) {
      blocks.push(block(order++, "paragraph", complianceReferenceService.disclaimer()));
    }

    // Hook self-check — simulates the LLM system-prompt instruction:
    // "Before returning your output, score your opening line on these three criteria…"
    // If total < 7, swap the first paragraph's opening line with the best alternative.
    {
      const icpLabel  = icp?.label ?? brief.persona;
      const primaryPain = brief.painPoints[0] ?? "";
      const hookCheck = runHookQACheck(blocks, icpLabel, primaryPain);
      draftHookAlts   = hookCheck.alternatives;

      if (!hookCheck.pass && hookCheck.alternatives.length > 0) {
        const best = [...hookCheck.alternatives].sort((a, b) => b.score - a.score)[0];
        const firstPara = blocks.find(b => b.kind === "paragraph");
        if (firstPara) {
          const lines = firstPara.text.split("\n");
          const idx = lines.findIndex(l => l.trim());
          if (idx >= 0) { lines[idx] = best.line; firstPara.text = lines.join("\n"); }
        }
        draftHookScore = best.score;
      } else {
        draftHookScore = hookCheck.totalScore;
      }
    }
  } else {
    // Long-form draft (blog, email, guide, etc.)
    blocks.push(block(order++, "h1", brief.title));
    blocks.push(
      block(
        order++,
        "meta",
        `Meta description: ${truncate(narrative.thesis, 150)}`,
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
      blocks.push(block(order++, "paragraph", risky.text));
    }

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

    if (brief.complianceContext || brief.regulatory) {
      blocks.push(block(order++, "paragraph", complianceReferenceService.disclaimer()));
    }

    const cta = brief.cta || campaign?.approvedCtas[0] || "Book a demo";
    blocks.push(block(order++, "cta", cta));
  }

  const draft: Draft = {
    id: nextId("draft"),
    title: brief.title,
    channel: brief.channel || (brief.jobType === "social_post" ? "social" : "blog"),
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
    hookScore: draftHookScore,
    hookAlternatives: draftHookAlts,
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
      ...(brief.jobType === "social_post" && {
        agentHookScore: draftHookScore,
        agentHookAlternatives: draftHookAlts,
        socialContext: {
          icp: icp?.label ?? brief.persona,
          primaryPain: brief.painPoints[0] ?? "",
        },
      }),
    },
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

interface PlatformCaptionCtx {
  who: string; pain: string; pain2: string; market: string;
  capLine: string; cta: string; dataLine: string; indTag: string; year: number;
}

function buildPlatformCaption(platform: string, c: PlatformCaptionCtx): string {
  const { who, pain, pain2, market, capLine, cta, dataLine, indTag, year } = c;

  switch (platform) {
    case "LinkedIn": {
      // Professional, thought-leadership tone. ~700 chars. 3–5 hashtags.
      const evidence = dataLine || `${who} teams in the ${market} are still spending hours on ${pain2} — manually.`;
      return [
        `Still dealing with ${pain} in ${year}?`,
        "",
        `For ${who} teams in the ${market}, it's not just inefficiency — it's a compliance risk that compounds every pay cycle.`,
        "",
        evidence,
        "",
        capLine,
        "",
        `${cta}`,
        "",
        `#SproutSolutions #PhilippineHR #HRTech ${indTag} #PayrollCompliance`,
      ].join("\n");
    }

    case "Facebook": {
      // Conversational, community-focused. ~400 chars. 1–2 hashtags.
      return [
        `Quick question for HR managers in the Philippines 👋`,
        "",
        `How much time does your team spend on ${pain} every month?`,
        "",
        `For most ${who} teams, it's more than it should be — and it's pulling attention away from your people.`,
        "",
        `There's a better way. ${capLine}`,
        "",
        `Want to see how? ${cta}`,
        "",
        `#SproutSolutions ${indTag}`,
      ].join("\n");
    }

    case "Instagram": {
      // Visual-first. Short hook visible above fold (~150 chars). 5–10 hashtags below.
      const hook = `${pain} is costing PH HR teams more than they think. 👇`;
      const body = `${who} teams deserve tools that work as hard as they do.\n\n${capLine}\n\nLink in bio → ${cta}`;
      const tags = [
        "#SproutSolutions", "#PhilippineHR", "#HRTech", "#PayrollPH",
        "#HRManager", "#WorkforcePH", `${indTag}`, "#CompliancePH",
        "#HRLife", "#PeopleFirst",
      ].join(" ");
      return `${hook}\n\n${body}\n\n.\n.\n.\n${tags}`;
    }

    case "X": {
      // 280 char hard limit. Punchy. 1–2 hashtags included in count.
      const base = `${pain} is still manual for most PH HR teams in ${year}. ${capLine} ${cta} #SproutSolutions ${indTag}`;
      return truncate(base, 280);
    }

    case "Threads": {
      // Casual, authentic. ~500 chars. Minimal hashtags.
      return [
        `Hot take: most ${who} teams in the Philippines aren't struggling with ${pain} because they're bad at HR.`,
        "",
        `They're struggling because their tools haven't caught up with how PH compliance actually works.`,
        "",
        `${capLine}`,
        "",
        `What's one thing you'd automate first if you could?`,
      ].join("\n");
    }

    default: {
      // Generic fallback for unknown platforms
      const hashtags = `#SproutSolutions #PhilippineHR ${indTag}`;
      return `Still dealing with ${pain} in ${year}?\n\n${capLine}\n\n${cta}\n\n${hashtags}`;
    }
  }
}
