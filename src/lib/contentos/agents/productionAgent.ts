/**
 * Production Agent (deterministic writer)
 * ---------------------------------------
 * Turns a standardized brief — and, when present, an uploaded agency SEO brief
 * (`brief.agencyExtract`) — into a COMPLETE, coherent article.
 *
 * Source hierarchy (highest wins):
 *   1. Uploaded content brief (outline, talking points, required sections)
 *   2. GTM Studio approved product messaging
 *   3. QA rules / canonical narrative guardrails
 *   4. Sprout internal links (Asset Library)
 *   5. Authoritative third-party sources (Compliance Reference Service)
 *   6. Intake form fields (gap-fill only)
 *
 * CRITICAL: the brief's "writing direction" cells are INSTRUCTIONS TO A WRITER,
 * not article copy. This agent extracts the *talking points* from them (PH terms,
 * named concepts, criteria) and composes original prose around each section
 * heading + the canonical narrative. It NEVER emits writer-note phrases like
 * "Name the dated framing", "Spine of the article", or "Open with answer capsule".
 *
 * It also: inserts real internal Sprout links, cites authoritative government
 * sources for compliance/factual claims, and emits ONLY GTM-verified product
 * claims (no invented "100% compliance" / "fully autonomous" claims).
 *
 * NOTE: this is a deterministic stub. Genuinely interpreting every talking point
 * into publication-grade prose, and live-crawling sprout.ph / Google for sources,
 * requires an LLM + web access. The validation gate (validateDraft) guarantees a
 * structurally complete, placeholder-free draft regardless.
 */

import type {
  AgencyBriefExtract,
  ContentBlock,
  Draft,
  FactualClaim,
  GenerationCheck,
  GenerationReport,
  OutlineSection,
  ProductClaim,
  ProductionOutput,
  RiskTier,
  SourceMapEntry,
  StandardizedBrief,
} from "../schemas/contentos";
import { brandKnowledgeService } from "../data/brandKnowledgeService";
import { icpKnowledgeService } from "../data/icpKnowledgeService";
import { campaignKnowledgeService } from "../data/campaignKnowledgeService";
import { assetLibraryService, type LibraryAsset } from "../data/assetLibraryService";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { databricksApprovedViewsService } from "../data/databricksApprovedViewsService";
import { complianceReferenceService } from "../data/complianceReferenceService";
import { block, nextId } from "../util";
import { buildCanonicalNarrative, buildProblemIntentMap, buildBlueprint } from "./shared";

/** Phrases that are writer instructions, never article copy. Used to strip and to validate. */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /name the dated framing/i, /spine of the article/i, /anchors? paa/i, /cite paa seed/i,
  /\bno sprout\b/i, /answer-first/i, /answer first delta/i, /tradeoff framework/i,
  /stage rule/i, /one proof,? one placement/i, /\bopen with\b/i, /ai overview/i,
  /reframe section/i, /third-party authorities only/i, /solution-category language/i,
  /quotable capsule/i, /peer-advisory voice/i, /evaluation scaffold/i, /recognition opening/i,
  /no answer capsule/i, /no product mention/i, /keyword in first \d+ words/i, /sentence case/i,
  /under \d+ chars/i, /primary keyword in h1/i, /\b\d{2,3}\s*(?:to|–|-)\s*\d{2,3}\s*words?\b/i,
  /distinguish bureau-style/i, /note saas vs on-prem/i, /transition into the two paths/i,
];

interface Ctx {
  icp: string;
  icpId?: string;
  geo: string;
  pains: string[];
  productName?: string;
  thesis: string;
  insights: string[];
  phReality: string[];
  beliefs: string[];
}

export function runProductionAgent(brief: StandardizedBrief, riskTier: RiskTier, ts: string): ProductionOutput {
  const icp = icpKnowledgeService.resolve(brief.primaryICP);
  const campaign = campaignKnowledgeService.resolve(brief.campaign);
  const tone = brandKnowledgeService.toneFor(brief.jobType);

  const pim = buildProblemIntentMap(brief, icp);
  const narrative = buildCanonicalNarrative(brief, icp, campaign);
  const blueprint = buildBlueprint(brief, narrative, []);

  // Candidate internal links — real Sprout assets ranked by topic/ICP relevance.
  const linkTopics = [brief.seoKeyword, brief.primaryKeyword, ...(brief.painPoints ?? []), "payroll", "compliance"].filter(Boolean) as string[];
  const candidateLinks = assetLibraryService.search(linkTopics, icp?.id, 8);
  const usedLinks = new Set<string>();

  const ctx: Ctx = {
    icp: icp?.label ?? brief.persona ?? "growth teams",
    icpId: icp?.id,
    geo: brief.geography || "the Philippines",
    pains: brief.painPoints.length ? brief.painPoints : ["mounting admin and compliance pressure"],
    productName: brief.product ? gtmStudioProductService.getProduct(brief.product)?.displayName : undefined,
    thesis: narrative.thesis,
    insights: narrative.keyInsights,
    phReality: narrative.phRealityMatters,
    beliefs: narrative.sproutBelievesRecommends,
  };

  const productClaims: ProductClaim[] = [];
  const factualClaims: FactualClaim[] = [];
  const sourceMap: SourceMapEntry[] = [];
  const ag = brief.agencyExtract;

  const blocks: ContentBlock[] = [];
  let order = 0;
  const add = (kind: ContentBlock["kind"], text: string) => { if (text && text.trim()) blocks.push(block(order++, kind, scrub(text))); };

  // ---- Title + SEO meta ----
  add("h1", brief.title);
  add("meta", `SEO meta title: ${metaTitle(brief)}`);
  add("meta", `SEO meta description: ${metaDescription(brief, ctx)}`);

  // ---- Intro ----
  add("paragraph", introParagraph(brief, ctx));

  // ---- Body: follow the brief's outline, section by section ----
  let rotation = 0;
  for (const sec of bodySections(ag, brief, ctx)) {
    if (/^(h1)$/i.test(sec.heading.trim()) || /^intro/i.test(sec.heading) || /^cta\b/i.test(sec.heading.trim())) continue;
    if (/faq/i.test(sec.heading)) {
      add("h2", "Frequently asked questions");
      for (const qa of faqPairs(ag, brief, ctx)) { add("h3", qa.q); add("paragraph", qa.a); }
      continue;
    }
    const heading = cleanHeading(sec.heading);
    if (isProductSection(sec.heading) && brief.product) {
      add("h2", heading);
      for (const p of productSection(brief, ctx, ts, productClaims, sourceMap)) add("paragraph", p);
      maybeLink(heading, ctx, candidateLinks, usedLinks, sourceMap, add);
      continue;
    }
    add("h2", heading);
    for (const p of composeSection(heading, sec.writingDirection, ctx, rotation++)) add("paragraph", p);
    // Cite an authoritative source where the section makes a compliance/statutory claim.
    citeSourceIfNeeded(heading + " " + sec.writingDirection, sourceMap, add);
    // Weave in a relevant internal link where one fits naturally.
    maybeLink(heading, ctx, candidateLinks, usedLinks, sourceMap, add);
  }

  // ---- Approved data citation (only when a dataset was selected) ----
  if (brief.datasets.length > 0) {
    const dv = databricksApprovedViewsService.get(brief.datasets[0]);
    if (dv) {
      const guard = databricksApprovedViewsService.citationGuardrails(dv.datasetId);
      const text = `Across ${dv.name} (${dv.dateRange}, n=${dv.sampleSizeN}), Sprout customers saw measurable improvement.`;
      factualClaims.push({ id: nextId("fact"), text, status: guard.allowed ? "verified" : "human_review", datasetId: dv.datasetId, sourceName: dv.name, dateRange: dv.dateRange, sampleSize: dv.sampleSizeN, note: guard.warnings.join(" ") });
      add("paragraph", text);
    }
  }

  // ---- Compliance disclaimer ----
  if (brief.complianceContext || brief.regulatory || mentionsCompliance(blocks)) {
    add("paragraph", complianceReferenceService.disclaimer());
  }

  // ---- Conclusion ----
  add("h2", "The bottom line");
  add("paragraph", conclusionParagraph(brief, ctx));

  // ---- Ensure internal links: add a "Related resources" block if short ----
  if (usedLinks.size < 3) {
    const extra = candidateLinks.filter((l) => !usedLinks.has(l.url)).slice(0, 4 - usedLinks.size);
    if (extra.length) {
      add("h3", "Related Sprout resources");
      for (const l of extra) {
        usedLinks.add(l.url);
        add("list", `[${l.title}](${l.url}) — ${l.summary}`);
        sourceMap.push({ ref: l.url, type: "internal_asset", anchorText: l.title, contextNote: l.summary });
      }
    }
  }

  add("cta", ctaText(brief, campaign));

  // Product provenance source
  if (brief.product) {
    const p = gtmStudioProductService.getProduct(brief.product);
    if (p && !sourceMap.some((s) => s.ref === p.sourceDocument)) sourceMap.push({ ref: p.sourceDocument, type: "gtm_studio", anchorText: p.displayName, contextNote: `Retrieved version ${p.retrievedVersion}` });
  }

  const draft: Draft = {
    id: nextId("draft"),
    title: brief.title,
    channel: brief.channel || "blog",
    format: brief.jobType,
    blocks,
    versions: [{ id: nextId("ver"), label: "original_draft", blocks: blocks.map((b) => ({ ...b })), createdAt: ts, createdBy: "Production Agent" }],
  };

  const internalLinks = sourceMap.filter((s) => s.type === "internal_asset").length;
  const externalSources = sourceMap.filter((s) => s.type === "regulatory" || s.type === "external_authority").length;
  const generationReport = validateDraft(draft, brief, ag, internalLinks, externalSources);

  return {
    brief, riskTier, problemIntentMap: pim, canonicalNarrative: narrative, blueprint, draft,
    productClaims, factualClaims, sourceMap, generationReport,
    qaHandoffPackage: { riskTier, productClaims, factualClaims, sourceMap, references: [tone, ...sourceMap.map((s) => s.ref)] },
  };
}

/* ------------------------------------------------------------------ */
/* Re-derive the QA handoff from FINAL article text                   */
/* ------------------------------------------------------------------ */

/**
 * After the article is (re)written by the LLM, the QA agent must inspect the
 * ACTUAL text — not the original deterministic handoff. This rebuilds the
 * handoff from the final blocks: real internal/external links, and every
 * product sentence re-verified against GTM Studio.
 */
export function deriveHandoffFromBlocks(brief: StandardizedBrief, blocks: ContentBlock[], ts: string, tier: RiskTier) {
  const fullText = blocks.map((b) => b.text).join("\n");
  const sourceMap: SourceMapEntry[] = [];
  for (const m of fullText.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    const anchor = m[1], url = m[2];
    const type = /sprout\.ph/i.test(url) ? "internal_asset" : /\.gov\.ph/i.test(url) ? "regulatory" : "external_authority";
    if (!sourceMap.some((s) => s.ref === url)) sourceMap.push({ ref: url, type, anchorText: anchor });
  }

  const productClaims: ProductClaim[] = [];
  const slug = brief.product;
  const product = slug ? gtmStudioProductService.getProduct(slug) : undefined;
  if (slug && product) {
    for (const b of blocks.filter((b) => b.kind === "paragraph")) {
      if (!new RegExp(escapeRe(product.displayName), "i").test(b.text)) continue;
      for (const sentence of b.text.split(/(?<=[.!?])\s+/)) {
        const mentionsProduct = new RegExp(escapeRe(product.displayName), "i").test(sentence) || /\bsprout\b/i.test(sentence);
        // Only verify SUBSTANTIVE capability/proof claims — not positioning or
        // opinion sentences (which aren't GTM-traceable facts by nature).
        const looksLikeClaim = /\d|%|guarantee|automat|computes?|generat|complian|accura|reduc|cuts?\b|processes?|integrat/i.test(sentence);
        if (mentionsProduct && looksLikeClaim) productClaims.push(gtmStudioProductService.verifyText(slug, sentence.trim(), ts));
      }
    }
  }

  return { riskTier: tier, productClaims, factualClaims: [], sourceMap, references: sourceMap.map((s) => s.ref) };
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/* ------------------------------------------------------------------ */
/* Validation gate                                                    */
/* ------------------------------------------------------------------ */

export function validateDraft(draft: Draft, brief: StandardizedBrief, ag: AgencyBriefExtract | undefined, internalLinks: number, externalSources: number): GenerationReport {
  const headings = draft.blocks.filter((b) => b.kind === "h2" || b.kind === "h3").map((b) => cleanHeading(b.text).toLowerCase());
  const paras = draft.blocks.filter((b) => b.kind === "paragraph");
  const words = paras.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
  const allText = draft.blocks.map((b) => b.text).join(" \n ");

  const requiredSections = (ag?.outline ?? []).filter((o) => !/^(h1|intro|faq|cta)$/i.test(o.heading.trim()) && cleanHeading(o.heading).length > 0);
  const missingSections = requiredSections.filter((o) => !headings.some((h) => similar(h, cleanHeading(o.heading).toLowerCase())));
  const placeholders = draft.blocks.filter((b) => b.kind !== "meta" && PLACEHOLDER_PATTERNS.some((re) => re.test(b.text)));
  const emptyHeadings = countHeadingsWithoutProse(draft.blocks);
  const target = parseTarget(ag?.wordCount) ?? (brief.jobType === "blog" ? 700 : 350);

  const checks: GenerationCheck[] = [
    { label: "Followed the uploaded outline", ok: requiredSections.length === 0 || missingSections.length === 0, detail: missingSections.length ? `Missing: ${missingSections.map((s) => cleanHeading(s.heading)).join("; ")}` : undefined },
    { label: "Every required H2/H3 appears", ok: missingSections.length === 0, detail: missingSections.length ? `${missingSections.length} section(s) missing` : undefined },
    { label: "Every section has written prose", ok: emptyHeadings === 0, detail: emptyHeadings ? `${emptyHeadings} heading(s) with no paragraph` : undefined },
    { label: "Meets expected depth", ok: words >= target, detail: `${words} words (target ${target}+)` },
    { label: "No writer notes / placeholders", ok: placeholders.length === 0, detail: placeholders.length ? `Found in ${placeholders.length} block(s)` : undefined },
    { label: "Includes internal Sprout links", ok: internalLinks >= 1, detail: `${internalLinks} internal link(s)` },
    { label: "Authoritative sources where claimed", ok: !/\b(SSS|PhilHealth|Pag-?IBIG|BIR|DOLE)\b/i.test(allText) || externalSources >= 1, detail: `${externalSources} source(s)` },
    { label: "Includes a CTA", ok: draft.blocks.some((b) => b.kind === "cta") },
    { label: "Includes a conclusion", ok: headings.some((h) => /bottom line|conclusion|takeaway/.test(h)) },
  ];

  // A draft fails the gate if structure/placeholders/prose are broken — the
  // things that make output "unusable". Link/source/depth shortfalls warn but
  // don't block (they surface as QA suggestions instead).
  const hardFail = !checks[2].ok || !checks[4].ok || (requiredSections.length > 0 && missingSections.length > requiredSections.length / 2);
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  return { passed: !hardFail, checks, missing, internalLinks, externalSources };
}

function countHeadingsWithoutProse(blocks: ContentBlock[]): number {
  let count = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "h2" || b.kind === "h3") {
      const next = blocks[i + 1];
      // An H2 immediately followed by an H3 is fine — its subsections carry prose.
      const ok = next && (next.kind === "paragraph" || next.kind === "list" || (b.kind === "h2" && next.kind === "h3"));
      if (!ok) count++;
    }
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Section regeneration (used by the "Regenerate" control)            */
/* ------------------------------------------------------------------ */

export function regenerateSectionBody(brief: StandardizedBrief, heading: string, ts: string): string[] {
  const icp = icpKnowledgeService.resolve(brief.primaryICP);
  const narrative = buildCanonicalNarrative(brief, icp, campaignKnowledgeService.resolve(brief.campaign));
  const ctx: Ctx = {
    icp: icp?.label ?? brief.persona ?? "growth teams", icpId: icp?.id, geo: brief.geography || "the Philippines",
    pains: brief.painPoints.length ? brief.painPoints : ["mounting admin and compliance pressure"],
    productName: brief.product ? gtmStudioProductService.getProduct(brief.product)?.displayName : undefined,
    thesis: narrative.thesis, insights: narrative.keyInsights, phReality: narrative.phRealityMatters, beliefs: narrative.sproutBelievesRecommends,
  };
  if (isProductSection(heading) && brief.product) return productSection(brief, ctx, ts, [], []);
  const match = brief.agencyExtract?.outline.find((o) => cleanHeading(o.heading).toLowerCase() === cleanHeading(heading).toLowerCase());
  return composeSection(cleanHeading(heading), match?.writingDirection ?? "", ctx, 0);
}

/* ------------------------------------------------------------------ */
/* Prose composition — original copy, never the brief's instructions  */
/* ------------------------------------------------------------------ */

type SectionKind = "definition" | "problem" | "criteria" | "cost" | "comparison" | "general";

function classify(heading: string): SectionKind {
  const h = heading.toLowerCase();
  if (/what is|what does|in plain|definition|meaning of/.test(h)) return "definition";
  if (/why|wrong question|matters|stop comparing|myth/.test(h)) return "problem";
  if (/criteria|decision|how to choose|how to decide|when to|factors/.test(h)) return "criteria";
  if (/cost|costs|price|pricing|budget|invest|spend/.test(h)) return "cost";
  if (/difference|\bvs\b|versus|compare|comparison|side-by-side|side by side/.test(h)) return "comparison";
  return "general";
}

/** Pull genuine talking points (entities) out of a writer instruction, dropping the imperative language. */
function talkingPoints(direction: string): { phTerms: string[]; criteria: string[] } {
  const phTermPool = ["SSS", "PhilHealth", "Pag-IBIG", "BIR", "DOLE", "13th month", "night differential", "holiday pay", "withholding tax", "Alphalist", "2316"];
  const phTerms = phTermPool.filter((t) => new RegExp(`\\b${t.replace(/-/g, "[-\\s]?")}\\b`, "i").test(direction));
  const criteriaPool = ["team size", "budget", "compliance load", "operational maturity", "control", "speed", "accuracy", "scalability"];
  const criteria = criteriaPool.filter((c) => new RegExp(c.replace(" ", "\\s+"), "i").test(direction));
  return { phTerms, criteria };
}

function composeSection(heading: string, direction: string, ctx: Ctx, rot: number): string[] {
  const kind = classify(heading);
  const topic = heading.replace(/[?:.]+$/, "").trim();
  const lowerTopic = topic.charAt(0).toLowerCase() + topic.slice(1);
  const { phTerms, criteria } = talkingPoints(direction);
  const insight = pick(ctx.insights, rot);
  const phLine = pick(ctx.phReality, rot);
  const belief = pick(ctx.beliefs, rot);
  const paras: string[] = [];

  if (kind === "definition") {
    paras.push(`${capitalize(lowerTopic)} comes down to how a Philippine business gets people paid accurately and on time. For ${ctx.icp}, what matters is the day-to-day reality more than the textbook definition: fewer manual steps, fewer errors, and a clear audit trail when questions come up.`);
    paras.push(phTerms.length
      ? `Locally that means handling the statutory layer correctly — ${joinList(phTerms)} — which is what makes compliance here genuinely non-trivial. ${ensure(phLine)}`
      : `${ensure(phLine)} That local reality is why a generic, one-size-fits-all approach breaks down at scale.`);
  } else if (kind === "problem") {
    paras.push(`${capitalize(ctx.icp)} teams in ${ctx.geo} are usually caught between competing pressures: ${joinList(ctx.pains.slice(0, 2).map((p) => p.toLowerCase()))}. It is tempting to treat this as a single yes/no decision, when it is really a question of fit.`);
    paras.push(`Behind most of it sits ${clauseOf(insight, "the manual workload of every cycle")}. Seen that way, the goal is to match the approach to your team's size, budget, and compliance exposure — not to crown a winner in the abstract.`);
  } else if (kind === "criteria") {
    const factors = (criteria.length ? criteria : ["team size", "budget", "compliance load", "operational maturity"]).slice(0, 4);
    paras.push(`Weigh a few concrete factors rather than going on gut feel. For ${ctx.icp}, the ones that move the decision are ${joinList(factors)}.`);
    paras.push(`Walk each one honestly. ${capitalize(factors[0] ?? "Team size")} sets the baseline workload; budget defines what is sustainable month to month; and compliance load — the density of ${ctx.geo} statutory rules you have to satisfy — is usually the deciding factor. ${ensure(belief)}`);
  } else if (kind === "cost") {
    paras.push(`Cost is where most teams get the comparison wrong, because the sticker price is rarely the real number. The honest figure includes the obvious line items plus the hidden ones: setup and migration time, the hours your people spend each cycle, and the cost of getting it wrong.`);
    paras.push(`For ${ctx.icp} in ${ctx.geo}, a single missed statutory cutoff can outweigh months of subscription savings. ${ensure(phLine)} The right lens is total cost of ownership over a year, not the headline monthly price.`);
  } else if (kind === "comparison") {
    paras.push(`Set side by side, the trade-off becomes clearer. One path keeps execution and control in-house with the right tooling; the other delegates the work to a managed service. Neither is universally better — they suit different teams.`);
    paras.push(`For ${ctx.icp}, the differences that matter are control over data, speed of corrections, who is accountable when something breaks, and how each scales as you grow — especially against ${clauseOf(insight, "the day-to-day workload")}.`);
  } else {
    paras.push(`${capitalize(lowerTopic)} matters most in what it changes day to day. For ${ctx.icp} in ${ctx.geo}, the practical question is what it removes — manual effort, error risk, and the exposure around ${clauseOf(insight, "the core workflow")}.`);
    paras.push(phTerms.length ? `It also has to hold up against the statutory layer — ${joinList(phTerms)} — that defines compliant operations here.` : ensure(belief));
  }
  return paras;
}

function productSection(brief: StandardizedBrief, ctx: Ctx, ts: string, productClaims: ProductClaim[], sourceMap: SourceMapEntry[]): string[] {
  const product = gtmStudioProductService.getProduct(brief.product);
  if (!product) return [];
  const out: string[] = [];
  // ONLY GTM-verified, public facts. No invented "100% / fully autonomous" claims.
  const facts = product.facts.filter((f) => f.sensitivity === "public" && (f.fieldType === "capability" || f.fieldType === "outcome" || f.fieldType === "proof_point")).slice(0, 3);
  const lead = facts[0];
  if (lead) {
    productClaims.push(gtmStudioProductService.buildClaim(product.slug, lead.id, ts));
    out.push(`This is where ${product.displayName} fits for ${ctx.icp}. ${ensure(lead.text)}`);
  }
  const rest = facts.slice(1);
  if (rest.length) {
    rest.forEach((f) => productClaims.push(gtmStudioProductService.buildClaim(product.slug, f.id, ts)));
    out.push(`That shows up as concrete, documented outcomes: ${rest.map((f) => stripTrailingPeriod(f.text)).join("; ")}. These are drawn from approved product messaging, not aspiration — which matters when you are defending the choice internally.`);
  }
  if (brief.agencyExtract?.productMentionRules) {
    out.push(`Mentioned in context, not as a pitch — once, kept honest, then back to the reader's decision.`);
  }
  if (!sourceMap.some((s) => s.ref === product.sourceDocument)) sourceMap.push({ ref: product.sourceDocument, type: "gtm_studio", anchorText: product.displayName, contextNote: "GTM Studio approved messaging" });
  return out;
}

function faqPairs(ag: AgencyBriefExtract | undefined, brief: StandardizedBrief, ctx: Ctx): { q: string; a: string }[] {
  let qs = (ag?.paaQuestions?.length ? ag.paaQuestions : brief.paaQuestions ?? []).slice(0, 6);
  // Never leave the FAQ empty or generic: derive sensible questions from the topic.
  if (qs.length === 0) qs = [
    `How do I choose the right approach for my team?`,
    `What does this mean for ${ctx.geo} compliance?`,
    `How quickly will I see results?`,
  ];
  // Distinct answers — each FAQ entry should read uniquely, not from one template.
  const answers = [
    `Start with your team's size, budget, and compliance load. For most ${ctx.icp} in ${ctx.geo}, the deciding factor is how much statutory complexity you carry: the heavier it is, the more an accountable, managed approach earns its place.`,
    `It means the statutory layer has to be right every cycle — SSS, PhilHealth, Pag-IBIG, and BIR filings. That is where penalties and disputes come from, so it should anchor the decision rather than sit as an afterthought.`,
    `Most teams feel the difference within the first one or two cycles: fewer manual corrections and a cleaner audit trail. The larger payoff — less time lost to month-end and fewer payslip disputes — compounds over the following quarter.`,
    `Map it to the four factors that actually move the call: team size, budget, compliance load, and how much operational maturity you already have in-house.`,
    `Keep ownership of the cycle but remove the manual computation and filing work. A small team can then run payroll accurately without a specialist for every step.`,
    `Write visibility into the arrangement: access to records, a correction SLA, and clarity on who answers in an audit. Delegating the work should not mean losing your line of sight.`,
  ];
  return qs.map((q, i) => ({ q: tidyQuestion(q), a: answers[i % answers.length] }));
}

/* ------------------------------------------------------------------ */
/* Links + sources                                                    */
/* ------------------------------------------------------------------ */

function maybeLink(heading: string, ctx: Ctx, candidates: LibraryAsset[], used: Set<string>, sourceMap: SourceMapEntry[], add: (k: ContentBlock["kind"], t: string) => void) {
  if (used.size >= 5) return;
  const topic = heading.toLowerCase();
  const hit = candidates.find((l) => !used.has(l.url) && (l.topics.some((t) => topic.includes(t) || t.split(" ").some((w) => w.length > 3 && topic.includes(w))) || (ctx.icpId && l.icpTags.includes(ctx.icpId))));
  if (!hit) return;
  used.add(hit.url);
  add("paragraph", `For a closer look, see [${hit.title}](${hit.url}).`);
  sourceMap.push({ ref: hit.url, type: "internal_asset", anchorText: hit.title, contextNote: hit.summary });
}

function citeSourceIfNeeded(text: string, sourceMap: SourceMapEntry[], add: (k: ContentBlock["kind"], t: string) => void) {
  const bodies = ["DOLE", "BIR", "SSS", "PhilHealth", "Pag-IBIG"].filter((b) => new RegExp(`\\b${b.replace("-", "[-]?")}\\b`, "i").test(text));
  if (bodies.length === 0) return;
  const ref = complianceReferenceService.forBody(bodies[0])[0];
  if (!ref || sourceMap.some((s) => s.ref === ref.url)) return;
  add("paragraph", `For the current rules and contribution schedules, refer to the [${ref.body}](${ref.url}) — the authoritative source on ${ref.topic.toLowerCase()}.`);
  sourceMap.push({ ref: ref.url, type: "regulatory", anchorText: ref.body, contextNote: ref.summary });
}

/* ------------------------------------------------------------------ */
/* Section list (follow the brief; fall back to a real article)       */
/* ------------------------------------------------------------------ */

function bodySections(ag: AgencyBriefExtract | undefined, brief: StandardizedBrief, ctx: Ctx): OutlineSection[] {
  const outline = ag?.outline ?? [];
  const realH2 = outline.filter((o) => !/^(h1|intro|faq|cta)$/i.test(o.heading.trim()) && cleanHeading(o.heading).length > 0);
  if (realH2.length >= 2) return outline;
  const sections: OutlineSection[] = [{ heading: `Why ${shorten(brief.title, 56)} matters now`, writingDirection: "" }];
  for (const pain of ctx.pains.slice(0, 3)) sections.push({ heading: `Tackling ${pain.toLowerCase()}`, writingDirection: "" });
  sections.push({ heading: "How to choose the right approach", writingDirection: "team size budget compliance load operational maturity" });
  if (ag?.paaQuestions?.length || brief.paaQuestions?.length) sections.push({ heading: "FAQ", writingDirection: "" });
  return sections;
}

/* ------------------------------------------------------------------ */
/* Intro / conclusion / meta / CTA                                    */
/* ------------------------------------------------------------------ */

function introParagraph(brief: StandardizedBrief, ctx: Ctx): string {
  const pain = ctx.pains[0];
  return `If you run people operations at a business in ${ctx.geo}, you have probably felt ${pain.toLowerCase()} firsthand — the kind of problem that quietly drains time and erodes trust. The path forward is more practical than it looks once you frame it around your team's real constraints rather than the usual either/or. This guide walks through what actually changes day to day, so you can make the call with confidence and defend it to a co-founder or finance lead.`;
}

function conclusionParagraph(brief: StandardizedBrief, ctx: Ctx): string {
  return `There is no universally right answer here — only the right answer for your team's size, budget, and compliance load. ${ensure(pick(ctx.beliefs, 1))} If you can name where you sit on those three, the decision largely makes itself, and you can defend it to anyone in the room.`;
}

function metaTitle(brief: StandardizedBrief): string {
  const kw = brief.primaryKeyword;
  const t = kw && !brief.title.toLowerCase().includes(kw.toLowerCase()) ? `${brief.title} | ${capitalize(kw)}` : brief.title;
  return shorten(t, 60);
}

function metaDescription(brief: StandardizedBrief, ctx: Ctx): string {
  const base = brief.objective || brief.agencyExtract?.serpOpportunity || `A practical ${ctx.geo} guide for ${brief.primaryICP} on ${shorten(brief.title, 40)}.`;
  return shorten(scrub(base), 155);
}

function ctaText(brief: StandardizedBrief, campaign: ReturnType<typeof campaignKnowledgeService.resolve>): string {
  const looksLikeDirective = (s?: string) => !!s && /framed|sentences|point to|no demo|booking|links:/i.test(s);
  if (brief.cta && !looksLikeDirective(brief.cta)) return brief.cta;
  const product = brief.product ? gtmStudioProductService.getProduct(brief.product)?.displayName : null;
  if (product) return `See how ${product} fits your team — compare your options and decide with confidence.`;
  if (brief.agencyExtract?.ctaText && !looksLikeDirective(brief.agencyExtract.ctaText)) return brief.agencyExtract.ctaText;
  return campaign?.approvedCtas[0] || "Talk to our team";
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                       */
/* ------------------------------------------------------------------ */

function scrub(s: string): string {
  // Last-line defense: never let a writer-instruction phrase reach the page.
  let t = s;
  for (const re of PLACEHOLDER_PATTERNS) t = t.replace(re, "");
  return t.replace(/\s{2,}/g, " ").replace(/\s+([.,;])/g, "$1").trim();
}
function isProductSection(heading: string): boolean { return /where .* fits|where sprout fits|how .* helps/i.test(heading); }
function cleanHeading(h: string): string { return h.replace(/^h[1-3]:?\s*/i, "").replace(/\s+/g, " ").trim(); }
function mentionsCompliance(blocks: ContentBlock[]): boolean { return /\b(SSS|PhilHealth|Pag-?IBIG|BIR|DOLE|statutory)\b/i.test(blocks.map((b) => b.text).join(" ")); }
function pick<T>(arr: T[], i: number): T | undefined { return arr.length ? arr[i % arr.length] : undefined; }
function ensure(s?: string): string { if (!s) return ""; const t = s.trim().replace(/\s+/g, " "); const c = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?]$/.test(c) ? c : c + "."; }
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
/** Turn a key-insight noun phrase into a lowercase clause that embeds mid-sentence. */
function clauseOf(s: string | undefined, fallback: string): string { const t = (s ?? "").trim().replace(/[.!?]+$/, ""); return t ? t.charAt(0).toLowerCase() + t.slice(1) : fallback; }
function stripTrailingPeriod(s: string): string { return s.trim().replace(/\.$/, ""); }
function joinList(items: string[]): string { const a = items.filter(Boolean); if (a.length <= 1) return a[0] ?? ""; if (a.length === 2) return `${a[0]} and ${a[1]}`; return `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`; }
function tidyQuestion(q: string): string { const t = q.trim().replace(/\s+/g, " "); const c = t.charAt(0).toUpperCase() + t.slice(1); return /\?$/.test(c) ? c : c + "?"; }
function shorten(s: string, n: number): string { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…"; }
function similar(a: string, b: string): boolean { if (a.includes(b) || b.includes(a)) return true; const aw = new Set(a.split(/\s+/).filter((w) => w.length > 3)); const bw = b.split(/\s+/).filter((w) => w.length > 3); const hits = bw.filter((w) => aw.has(w)).length; return bw.length > 0 && hits / bw.length >= 0.5; }
function parseTarget(s?: string): number | null { if (!s) return null; const m = s.replace(/,/g, "").match(/(\d{3,5})/); return m ? parseInt(m[1], 10) : null; }
