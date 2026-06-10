/**
 * Production Agent (stub)
 * -----------------------
 * Generates net-new content from a standardized brief. Runs the internal stages:
 *   risk tiering → context retrieval → brief refinement → Problem-Intent Map →
 *   Canonical Narrative → Content Blueprint → draft generation → QA handoff.
 *
 * This is a DETERMINISTIC stub: in production it is replaced by a system-prompted
 * LLM service. It assembles a COMPLETE long-form draft from the standardized
 * brief — and, when an agency SEO brief was uploaded (`brief.agencyExtract`), it
 * treats that brief as the primary source of truth: every outline section, the
 * SEO meta, the keywords, the product placements, and the CTA come from the
 * brief, with intake fields and GTM Studio only filling gaps.
 *
 * It never generates unsupported product claims — every product statement is
 * verified against GTM Studio and marked UNVERIFIED when it cannot be traced.
 */

import type {
  AgencyBriefExtract,
  ContentBlock,
  Draft,
  FactualClaim,
  OutlineSection,
  ProductClaim,
  ProductionOutput,
  RiskTier,
  SourceMapEntry,
  StandardizedBrief,
} from "../schemas/contentos";
import { brandKnowledgeService } from "../data/brandKnowledgeService";
import { icpKnowledgeService, type ICPProfile } from "../data/icpKnowledgeService";
import { campaignKnowledgeService } from "../data/campaignKnowledgeService";
import { assetLibraryService } from "../data/assetLibraryService";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { databricksApprovedViewsService } from "../data/databricksApprovedViewsService";
import { complianceReferenceService } from "../data/complianceReferenceService";
import { block, nextId } from "../util";
import { buildCanonicalNarrative, buildProblemIntentMap, buildBlueprint } from "./shared";

interface Ctx {
  icp: string;
  geo: string;
  pains: string[];
  messaging: string[];
  thesis: string;
}

function buildCtx(brief: StandardizedBrief, icp: ICPProfile | undefined, thesis: string): Ctx {
  return {
    icp: icp?.label ?? brief.persona ?? "growth teams",
    geo: brief.geography || "the Philippines",
    pains: brief.painPoints.length ? brief.painPoints : ["mounting admin and compliance pressure"],
    messaging: brief.agencyExtract?.keyMessaging ?? [],
    thesis,
  };
}

export function runProductionAgent(brief: StandardizedBrief, riskTier: RiskTier, ts: string): ProductionOutput {
  const icp = icpKnowledgeService.resolve(brief.primaryICP);
  const campaign = campaignKnowledgeService.resolve(brief.campaign);
  const tone = brandKnowledgeService.toneFor(brief.jobType);
  const links = assetLibraryService.search([brief.seoKeyword, brief.product, ...brief.painPoints].filter(Boolean), icp?.id);

  const pim = buildProblemIntentMap(brief, icp);
  const narrative = buildCanonicalNarrative(brief, icp, campaign);
  const blueprint = buildBlueprint(brief, narrative, links);

  const ctx = buildCtx(brief, icp, narrative.thesis);
  const productClaims: ProductClaim[] = [];
  const factualClaims: FactualClaim[] = [];
  const ag = brief.agencyExtract;

  // ---- Draft generation: a COMPLETE article -----------------------------
  const blocks: ContentBlock[] = [];
  let order = 0;
  const add = (kind: ContentBlock["kind"], text: string) => { if (text && text.trim()) blocks.push(block(order++, kind, text.trim())); };

  // Title + SEO meta
  add("h1", brief.title);
  add("meta", `SEO meta title: ${metaTitle(brief)}`);
  add("meta", `SEO meta description: ${metaDescription(brief)}`);

  // Intro (keeps two demo-worthy QA issues: a cliché opener + an em dash)
  add("paragraph", introParagraph(brief, ctx));

  // Body — primary source of truth is the uploaded brief's outline.
  const sections = bodySections(ag, brief, ctx);
  for (const sec of sections) {
    const heading = cleanHeading(sec.heading);
    if (/^cta\b/i.test(sec.heading) || /^h1\b/i.test(sec.heading) || /^intro/i.test(sec.heading)) continue;
    if (/faq/i.test(sec.heading)) {
      add("h2", "Frequently asked questions");
      for (const qa of faqPairs(ag, brief)) { add("h3", qa.q); add("paragraph", qa.a); }
      continue;
    }
    if (isProductSection(sec.heading) && brief.product) {
      add("h2", heading);
      productSection(brief, ctx, ts, productClaims).forEach((p) => add("paragraph", p));
      continue;
    }
    add("h2", heading);
    sectionBody(heading, sec.writingDirection, ctx).forEach((p) => add("paragraph", p));
  }

  // If a product exists but no explicit product section ran, add one.
  if (brief.product && !sections.some((s) => isProductSection(s.heading))) {
    add("h2", `Where ${gtmStudioProductService.getProduct(brief.product)?.displayName ?? "Sprout"} fits`);
    productSection(brief, ctx, ts, productClaims).forEach((p) => add("paragraph", p));
  }

  // Approved data citation (if a dataset was selected)
  if (brief.datasets.length > 0) {
    const dv = databricksApprovedViewsService.get(brief.datasets[0]);
    if (dv) {
      const guard = databricksApprovedViewsService.citationGuardrails(dv.datasetId);
      const text = `Across ${dv.name} (${dv.dateRange}, n=${dv.sampleSizeN}), Sprout customers saw measurable improvement.`;
      factualClaims.push({ id: nextId("fact"), text, status: guard.allowed ? "verified" : "human_review", datasetId: dv.datasetId, sourceName: dv.name, dateRange: dv.dateRange, sampleSize: dv.sampleSizeN, note: guard.warnings.join(" ") });
      add("paragraph", text);
    }
  }

  // Compliance disclaimer
  if (brief.complianceContext || brief.regulatory) add("paragraph", complianceReferenceService.disclaimer());

  // Conclusion + CTA
  add("h2", "The bottom line");
  add("paragraph", conclusionParagraph(brief, ctx));
  add("cta", ctaText(brief, campaign));

  const draft: Draft = {
    id: nextId("draft"),
    title: brief.title,
    channel: brief.channel || "blog",
    format: brief.jobType,
    blocks,
    versions: [{ id: nextId("ver"), label: "original_draft", blocks: blocks.map((b) => ({ ...b })), createdAt: ts, createdBy: "Production Agent" }],
  };

  const sourceMap: SourceMapEntry[] = links.map((l) => ({ ref: l.url, type: "internal_asset" as const, anchorText: l.title, contextNote: l.summary }));
  if (brief.product) {
    const p = gtmStudioProductService.getProduct(brief.product);
    if (p) sourceMap.push({ ref: p.sourceDocument, type: "gtm_studio" as const, anchorText: p.displayName, contextNote: `Retrieved version ${p.retrievedVersion}` });
  }

  return {
    brief, riskTier, problemIntentMap: pim, canonicalNarrative: narrative, blueprint, draft,
    productClaims, factualClaims, sourceMap,
    qaHandoffPackage: { riskTier, productClaims, factualClaims, sourceMap, references: [tone, ...links.map((l) => l.url)] },
  };
}

/* ------------------------------------------------------------------ */
/* Section regeneration (used by the "Regenerate" control)            */
/* ------------------------------------------------------------------ */

/** Regenerate the body paragraphs for one section heading, from the brief. */
export function regenerateSectionBody(brief: StandardizedBrief, heading: string, ts: string): string[] {
  const icp = icpKnowledgeService.resolve(brief.primaryICP);
  const narrative = buildCanonicalNarrative(brief, icp, campaignKnowledgeService.resolve(brief.campaign));
  const ctx = buildCtx(brief, icp, narrative.thesis);
  const match = brief.agencyExtract?.outline.find((o) => cleanHeading(o.heading).toLowerCase() === cleanHeading(heading).toLowerCase());
  if (isProductSection(heading) && brief.product) return productSection(brief, ctx, ts, []);
  return sectionBody(cleanHeading(heading), match?.writingDirection ?? "", ctx);
}

/* ------------------------------------------------------------------ */
/* Content builders                                                   */
/* ------------------------------------------------------------------ */

function bodySections(ag: AgencyBriefExtract | undefined, brief: StandardizedBrief, ctx: Ctx): OutlineSection[] {
  const outline = ag?.outline ?? [];
  const realH2 = outline.filter((o) => !/^(h1|intro|faq|cta)$/i.test(o.heading.trim()));
  if (realH2.length >= 2) return outline; // follow the brief's prescribed outline
  // No usable outline → still build a full article from goals + pain points.
  const sections: OutlineSection[] = [];
  sections.push({ heading: `Why ${shorten(brief.title, 60)} matters now`, writingDirection: "" });
  for (const pain of ctx.pains.slice(0, 3)) sections.push({ heading: `Addressing ${pain.toLowerCase()}`, writingDirection: "" });
  sections.push({ heading: "How to choose the right approach", writingDirection: "" });
  return sections;
}

function metaTitle(brief: StandardizedBrief): string {
  const kw = brief.primaryKeyword;
  const base = brief.title;
  const t = kw && !base.toLowerCase().includes(kw.toLowerCase()) ? `${base} | ${capitalize(kw)}` : base;
  return shorten(t, 60);
}

function metaDescription(brief: StandardizedBrief): string {
  const base = brief.objective || brief.agencyExtract?.serpOpportunity || `A practical ${brief.geography || "Philippine"} guide for ${brief.primaryICP}.`;
  return shorten(stripDirective(base), 155);
}

function introParagraph(brief: StandardizedBrief, ctx: Ctx): string {
  const pain = ctx.pains[0];
  // Intentionally retains a cliché opener + an em dash so the QA tone/authenticity
  // layer has a real, block-level issue to surface in the workspace.
  return `In the fast-paced world of Philippine HR, ${ctx.icp} teams keep running into ${pain.toLowerCase()} — a problem that quietly drains time and trust. ${ensureSentence(ctx.thesis)} This guide walks through what actually changes day to day, so you can make the call with confidence and defend it to a co-founder or finance lead.`;
}

function sectionBody(heading: string, direction: string, ctx: Ctx): string[] {
  const topic = cleanHeading(heading);
  const cleaned = stripDirective(direction);
  const sentences = cleaned ? cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length > 2) : [];
  const capsule = sentences[0] || `Here is what ${ctx.icp} need to know about ${topic.toLowerCase()}.`;
  const rest = sentences.slice(1).join(" ").trim();

  const p1 = `${ensureSentence(capsule)} For ${ctx.icp} in ${ctx.geo}, this is where the decision gets practical — it has to hold up against real payroll runs, statutory deadlines, and the day-to-day reality of ${ctx.pains[0].toLowerCase()}.`;
  const p2 = `${rest ? ensureSentence(rest) + " " : ""}${ctx.messaging[0] ? ensureSentence(ctx.messaging[0]) + " " : ""}The practical test is fit to your team size, budget, and compliance load — not which option sounds more modern.`;
  return [p1, p2.trim()];
}

function productSection(brief: StandardizedBrief, ctx: Ctx, ts: string, productClaims: ProductClaim[]): string[] {
  const product = gtmStudioProductService.getProduct(brief.product);
  if (!product) return [];
  const out: string[] = [];
  const cap = product.facts.find((f) => f.fieldType === "capability");
  if (cap) {
    productClaims.push(gtmStudioProductService.buildClaim(product.slug, cap.id, ts));
    out.push(`This is where ${product.displayName} earns its place for ${ctx.icp}. ${ensureSentence(cap.text)}`);
  }
  // An intentionally UNVERIFIED claim so the Product & GTM Accuracy layer flags it.
  const risky = gtmStudioProductService.verifyText(product.slug, `${product.displayName} guarantees 100% audit-proof compliance and a fully autonomous payroll run with zero human oversight.`, ts);
  productClaims.push(risky);
  out.push(risky.text);
  if (brief.agencyExtract?.productMentionRules) out.push(`Placement note for editors: ${stripDirective(brief.agencyExtract.productMentionRules)}`);
  return out;
}

function faqPairs(ag: AgencyBriefExtract | undefined, brief: StandardizedBrief): { q: string; a: string }[] {
  const qs = (ag?.paaQuestions?.length ? ag.paaQuestions : brief.paaQuestions ?? []).slice(0, 6);
  return qs.map((q) => ({ q: tidyQuestion(q), a: `Short answer: it depends on your team size, budget, and compliance load. For most ${brief.primaryICP} in ${brief.geography || "the Philippines"}, the practical answer is to weigh the cost of getting payroll wrong against the effort of running it in-house, then pick the path that keeps you audit-ready.` }));
}

function conclusionParagraph(brief: StandardizedBrief, ctx: Ctx): string {
  return `There is no universally right answer — only the right answer for your team's size, budget, and compliance load. ${ctx.messaging[ctx.messaging.length - 1] ? ensureSentence(ctx.messaging[ctx.messaging.length - 1]) + " " : ""}If you can name where you sit on those three, you can defend the choice to anyone in the room.`;
}

function ctaText(brief: StandardizedBrief, campaign: ReturnType<typeof campaignKnowledgeService.resolve>): string {
  // A clean call to action — never the brief's CTA *instruction* (e.g.
  // "Validation-framed. Two sentences max. Point to Sprout.").
  const looksLikeDirective = (s?: string) => !!s && /framed|sentences|point to|no demo|booking|links:/i.test(s);
  if (brief.cta && !looksLikeDirective(brief.cta)) return brief.cta;
  const product = brief.product ? gtmStudioProductService.getProduct(brief.product)?.displayName : null;
  if (product) return `See how ${product} fits your team — compare your options and decide with confidence.`;
  if (brief.agencyExtract?.ctaText && !looksLikeDirective(brief.agencyExtract.ctaText)) return brief.agencyExtract.ctaText;
  return campaign?.approvedCtas[0] || "Book a demo";
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                       */
/* ------------------------------------------------------------------ */

function isProductSection(heading: string): boolean {
  return /where .* fits|where sprout fits|how .* helps/i.test(heading);
}

function cleanHeading(h: string): string {
  return h.replace(/^h[1-3]:?\s*/i, "").replace(/\s+/g, " ").trim();
}

function stripDirective(s: string): string {
  return s
    .replace(/\b\d+\s*(?:to|–|-)\s*\d+\s*words\.?/gi, "")
    .replace(/\bAnswer-first[^.]*\.?/gi, "")
    .replace(/\bAnchors?\b[^.]*?\.(?:\s|$)/gi, " ")
    .replace(/\bAI Overview[- ]shaped\b\.?/gi, "")
    .replace(/\bNo Sprout(?: yet)?\.?/gi, "")
    .replace(/\bSolution-category language(?: only)?\.?/gi, "")
    .replace(/\bOpen with (?:a |one-sentence )?answer capsule,?/gi, "")
    .replace(/\bThird-party authorities only\.?/gi, "")
    .replace(/\b(Reframe section|Quotable capsule|Peer-advisory voice|Stage rule[^.]*)\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function ensureSentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : cap + ".";
}

function tidyQuestion(q: string): string {
  const t = q.trim().replace(/\s+/g, " ");
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /\?$/.test(cap) ? cap : cap + "?";
}

function shorten(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
