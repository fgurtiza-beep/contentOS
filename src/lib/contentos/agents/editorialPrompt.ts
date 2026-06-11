/**
 * Editorial prompt — the system + user prompts for the LLM article writer.
 * ------------------------------------------------------------------------
 * The system prompt is large and STABLE (cache it). It encodes the Sprout.ph
 * house style, the writing principles, the anti-AI-pattern rules, and the
 * governance guardrails (GTM-only product claims, internal links, authoritative
 * sources). The user prompt carries the per-article brief context.
 */

import type { StandardizedBrief } from "../schemas/contentos";
import { icpKnowledgeService } from "../data/icpKnowledgeService";
import { campaignKnowledgeService } from "../data/campaignKnowledgeService";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { assetLibraryService } from "../data/assetLibraryService";
import { complianceReferenceService } from "../data/complianceReferenceService";
import { buildCanonicalNarrative } from "./shared";

/* ------------------------------------------------------------------ */
/* System prompt — Sprout editorial standard                          */
/* ------------------------------------------------------------------ */

export const EDITORIAL_SYSTEM_PROMPT = `You are a senior content writer and editor for Sprout Solutions, a Philippine HR and payroll software company. You write long-form articles for sprout.ph that read like genuine, authoritative thought leadership — not AI-generated content.

# Who you write for
Filipino business leaders, HR managers, payroll and people-operations professionals at Philippine SMEs and enterprises. They are practical, time-pressed, and skeptical of fluff. They want to make a better decision, not read a definition.

# The Sprout house style
- Conversational yet authoritative. Second person ("you", "your team"). Warm, direct, never patronizing.
- Problem → insight → practical action. Open with a real situation the reader recognizes, not a definition.
- Short paragraphs (2–4 sentences). Frequent, specific subheadings that a reader can scan.
- Philippine-specific and concrete: cite real statutory realities (DOLE, BIR, SSS, PhilHealth, Pag-IBIG, 13th month, night differential, holiday pay) where relevant. Use realistic business scenarios, not abstractions.
- Show expertise. Make claims a generalist couldn't. The reader should finish thinking "these people actually understand payroll."
- Calm confidence. No hype, no superlatives, no "in today's fast-paced world."

# Hard writing rules
1. Write for the reader first — never for SEO, QA, or a checklist.
2. BANNED phrases — never use these or anything like them: "To set a clear baseline", "It is worth naming", "The deeper issue", "In practice", "The reality is", "It comes down to", "The short answer is", "A useful way to think about it", "The key difference is", "In the fast-paced world", "Let's dive in", "In conclusion", "When it comes to". Vary sentence openings; do not start consecutive paragraphs the same way.
3. Every section must advance the reader's understanding with a NEW idea, example, framework, or piece of evidence. If a section would just restate a prior point, make it earn its place or cut it.
4. Use concrete examples, scenarios, decision frameworks, tradeoffs, and consequences. Avoid abstract filler.
5. The brief's "talking points / writing direction" are INSTRUCTIONS FOR YOU, not copy. Never paste them into the article. Interpret each into polished prose.
6. Earn product mentions. Educate first; mention Sprout once, contextually, only where it genuinely fits — never as a pitch.

# Governance (do not violate)
- PRODUCT CLAIMS: only state Sprout product facts from the APPROVED FACTS provided in the brief. Never invent capabilities, guarantees, "100% compliance", "fully autonomous", or "audit-proof" claims. If a useful claim isn't in the approved facts, omit it or write a safe, general version.
- INTERNAL LINKS: weave in the provided Sprout internal links naturally, with descriptive anchor text, where contextually relevant (aim for 3–5 across the article).
- AUTHORITATIVE SOURCES: when you state a statutory, legal, regulatory, or numerical fact, attribute it to the provided government source with a link. Never cite vendors or competitors as authorities.
- Not legal advice: keep a light, non-legal-advice framing on compliance specifics.

# Quality bar — your draft is REJECTED and sent back if it fails any of these
- It reads like generic AI content instead of a real Sprout.ph article.
- It contains any banned phrase, or starts two paragraphs with the same words.
- It expands the outline mechanically instead of building one clear, cumulative argument across the sections.
- Any section restates an earlier point without adding a new idea, example, or distinction.
- Internal links are dropped in mechanically ("For a closer look, see X") instead of woven into a sentence that earns them.
- FAQ answers are templated or repeat each other — every answer must be specific and unique.
- Product claims go beyond the approved facts, or a statutory claim has no government source.
- It uses vague filler ("various factors", "it depends", "plays a crucial role") instead of concrete specifics.

# How a strong section reads
Open with a specific observation or scenario a Philippine HR/payroll pro would recognize. Make a claim, support it with a concrete example or a real statutory detail, name the tradeoff honestly, and connect it to the reader's decision. Use transitions so each section follows from the last. Keep paragraphs tight (2–4 sentences). Sound like a knowledgeable colleague, not a content mill.

# Output format (STRICT — so it parses cleanly)
Return ONLY the article in this exact markdown shape, nothing else:

# <Article title>
META_TITLE: <SEO meta title, <=60 chars>
META_DESC: <SEO meta description, <=155 chars>

<1–2 intro paragraphs>

## <H2 section heading>
<2–4 polished paragraphs. Inline links as [anchor text](https://url).>

## <next H2> ...
(continue for every required section, in the brief's order)

### <FAQ question?>   (only if the brief requires a FAQ)
<answer, <=80 words>

## The bottom line
<short conclusion>

CTA: <one-sentence call to action>

Do not include writer notes, word-count markers, or the brief's instructions. Write the finished article.`;

/* ------------------------------------------------------------------ */
/* Write package — assemble the brief context for the user prompt      */
/* ------------------------------------------------------------------ */

export interface WritePackage {
  title: string;
  audience: string;
  painPoints: string[];
  goals: string[];
  tone: string;
  searchIntent?: string;
  primaryKeyword?: string;
  secondaryKeywords: string[];
  paaQuestions: string[];
  outline: { heading: string; talkingPoints: string }[];
  productFacts: { name: string; facts: string[] }[];
  productMentionRules?: string;
  internalLinks: { title: string; url: string; summary: string }[];
  sources: { body: string; url: string; topic: string }[];
  mustInclude: string[];
  mustAvoid: string[];
  cta: string;
  wordCount?: string;
}

export function buildWritePackage(brief: StandardizedBrief): WritePackage {
  const icp = icpKnowledgeService.resolve(brief.primaryICP);
  const campaign = campaignKnowledgeService.resolve(brief.campaign);
  const ag = brief.agencyExtract;

  const audience = [
    brief.primaryICP,
    brief.persona && `persona: ${brief.persona}`,
    brief.industry && `industry: ${brief.industry}`,
    brief.companySize && `company size: ${brief.companySize}`,
    brief.geography && `geography: ${brief.geography}`,
    brief.audienceDetails && `details: ${brief.audienceDetails}`,
    brief.triggerEvents?.length && `triggers: ${brief.triggerEvents.join(", ")}`,
  ].filter(Boolean).join(" · ");

  // Outline = brief's required sections + talking points (instructions, not copy).
  const outline = (ag?.outline ?? [])
    .filter((o) => !/^(h1|intro|cta)$/i.test(o.heading.trim()))
    .map((o) => ({ heading: o.heading.replace(/^h[1-3]:?\s*/i, "").trim(), talkingPoints: o.writingDirection }));

  // Approved product facts ONLY.
  const productSlugs = (brief.products ?? [brief.product]).filter(Boolean) as string[];
  const productFacts = productSlugs.map((slug) => {
    const p = gtmStudioProductService.getProduct(slug);
    return { name: p?.displayName ?? slug, facts: (p ? gtmStudioProductService.publicFacts(slug) : []).map((f) => f.text) };
  }).filter((p) => p.facts.length);

  // Real internal links by relevance.
  const links = assetLibraryService.search(
    [brief.seoKeyword, brief.primaryKeyword, ...(brief.painPoints ?? []), "payroll", "compliance"].filter(Boolean) as string[],
    icp?.id,
    6,
  ).map((l) => ({ title: l.title, url: l.url, summary: l.summary }));

  // Authoritative sources if the brief touches statutory topics.
  const blob = `${brief.title} ${brief.objective} ${outline.map((o) => o.talkingPoints).join(" ")}`;
  const sources = complianceReferenceService.list()
    .filter((r) => new RegExp(`\\b${r.body.replace("-", "[-]?")}\\b`, "i").test(blob))
    .map((r) => ({ body: r.body, url: r.url, topic: r.topic }));

  return {
    title: brief.title,
    audience,
    painPoints: brief.painPoints ?? [],
    goals: brief.contentGoals ?? [],
    tone: brief.tone || "Professional, Human, Helpful",
    searchIntent: brief.searchIntent ?? ag?.searchIntent,
    primaryKeyword: brief.primaryKeyword,
    secondaryKeywords: brief.secondaryKeywords ?? [],
    paaQuestions: brief.paaQuestions ?? ag?.paaQuestions ?? [],
    outline,
    productFacts,
    productMentionRules: ag?.productMentionRules,
    internalLinks: links,
    sources,
    mustInclude: brief.mustInclude ?? [],
    mustAvoid: brief.mustAvoid ?? [],
    cta: brief.cta || campaign?.approvedCtas[0] || (productFacts[0] ? `See how ${productFacts[0].name} fits your team.` : "Talk to our team."),
    wordCount: ag?.wordCount,
  };
}

/* ------------------------------------------------------------------ */
/* User prompt                                                        */
/* ------------------------------------------------------------------ */

export function buildUserPrompt(pkg: WritePackage): string {
  const lines: string[] = [];
  lines.push(`Write a complete long-form article. Follow the brief exactly; it is the primary source of truth.`);
  lines.push(``);
  lines.push(`TITLE / MAIN TOPIC: ${pkg.title}`);
  lines.push(`AUDIENCE: ${pkg.audience}`);
  lines.push(`TONE: ${pkg.tone}`);
  if (pkg.searchIntent) lines.push(`SEARCH INTENT: ${pkg.searchIntent}`);
  if (pkg.goals.length) lines.push(`GOALS: ${pkg.goals.join("; ")}`);
  if (pkg.wordCount) lines.push(`TARGET LENGTH: ${pkg.wordCount}`);
  lines.push(``);
  lines.push(`PAIN POINTS THIS ARTICLE MUST ADDRESS (cover every one):`);
  pkg.painPoints.forEach((p) => lines.push(`- ${p}`));
  lines.push(``);
  if (pkg.outline.length) {
    lines.push(`REQUIRED OUTLINE — write each H2 in this order. The "guidance" is your instruction, NOT copy to paste:`);
    pkg.outline.forEach((o, i) => {
      lines.push(`${i + 1}. ## ${o.heading}`);
      if (o.talkingPoints) lines.push(`   guidance: ${o.talkingPoints}`);
    });
    lines.push(``);
  }
  if (pkg.primaryKeyword) lines.push(`PRIMARY KEYWORD (use naturally in the title and early): ${pkg.primaryKeyword}`);
  if (pkg.secondaryKeywords.length) lines.push(`SECONDARY KEYWORDS: ${pkg.secondaryKeywords.join(", ")}`);
  if (pkg.paaQuestions.length) {
    lines.push(`FAQ — include a FAQ section answering these (each <=80 words):`);
    pkg.paaQuestions.forEach((q) => lines.push(`- ${q}`));
  }
  lines.push(``);
  if (pkg.productFacts.length) {
    lines.push(`APPROVED PRODUCT FACTS — the ONLY product claims you may make (do not invent others):`);
    pkg.productFacts.forEach((p) => { lines.push(`Product: ${p.name}`); p.facts.forEach((f) => lines.push(`  • ${f}`)); });
    if (pkg.productMentionRules) lines.push(`PRODUCT MENTION RULES: ${pkg.productMentionRules}`);
    lines.push(``);
  }
  if (pkg.internalLinks.length) {
    lines.push(`INTERNAL SPROUT LINKS — weave 3–5 of these in naturally with descriptive anchor text:`);
    pkg.internalLinks.forEach((l) => lines.push(`- [${l.title}](${l.url}) — ${l.summary}`));
    lines.push(``);
  }
  if (pkg.sources.length) {
    lines.push(`AUTHORITATIVE SOURCES — cite these (with links) for any statutory/legal/numerical claim:`);
    pkg.sources.forEach((s) => lines.push(`- ${s.body} (${s.url}) — ${s.topic}`));
    lines.push(``);
  }
  if (pkg.mustInclude.length) lines.push(`MUST INCLUDE: ${pkg.mustInclude.join("; ")}`);
  if (pkg.mustAvoid.length) lines.push(`MUST AVOID: ${pkg.mustAvoid.join("; ")}`);
  lines.push(`CTA: ${pkg.cta}`);
  lines.push(``);
  lines.push(`Now write the finished article in the exact output format specified. No preamble, no writer notes.`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Parse the model's markdown into ContentBlocks                       */
/* ------------------------------------------------------------------ */

export function parseArticleToBlocks(markdown: string): { kind: "h1" | "h2" | "h3" | "paragraph" | "list" | "cta" | "meta"; text: string }[] {
  const out: { kind: "h1" | "h2" | "h3" | "paragraph" | "list" | "cta" | "meta"; text: string }[] = [];
  const lines = markdown.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ kind: "paragraph", text: para.join(" ").trim() }); para = []; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.+)/))) { flush(); out.push({ kind: "h1", text: m[1].trim() }); }
    else if ((m = line.match(/^###\s+(.+)/))) { flush(); out.push({ kind: "h3", text: m[1].trim() }); }
    else if ((m = line.match(/^##\s+(.+)/))) { flush(); out.push({ kind: "h2", text: m[1].trim() }); }
    else if ((m = line.match(/^META_TITLE:\s*(.+)/i))) { flush(); out.push({ kind: "meta", text: `SEO meta title: ${m[1].trim()}` }); }
    else if ((m = line.match(/^META_DESC(?:RIPTION)?:\s*(.+)/i))) { flush(); out.push({ kind: "meta", text: `SEO meta description: ${m[1].trim()}` }); }
    else if ((m = line.match(/^CTA:\s*(.+)/i))) { flush(); out.push({ kind: "cta", text: m[1].trim() }); }
    else if ((m = line.match(/^[-*]\s+(.+)/))) { flush(); out.push({ kind: "list", text: m[1].trim() }); }
    else para.push(line);
  }
  flush();
  return out.filter((b) => b.text.length > 0);
}

/* ------------------------------------------------------------------ */
/* Pre-display quality gate                                            */
/* ------------------------------------------------------------------ */

export const BANNED_PHRASES = [
  "to set a clear baseline", "it is worth naming", "the deeper issue", "in practice",
  "the reality is", "it comes down to", "the short answer is", "a useful way to think",
  "the key difference is", "in the fast-paced world", "let's dive in", "let us dive in",
  "in conclusion", "when it comes to", "in today's", "navigating the", "plays a crucial role",
  "various factors", "it depends on a number of",
];

// Writer-instruction leakage — these are brief directions, never article copy.
const LEAKAGE = [
  /guidance:/i, /talking points/i, /writing direction/i, /\bH2:/i, /answer-first/i,
  /\b\d{2,3}\s*(?:to|–|-)\s*\d{2,3}\s*words\b/i, /anchors? paa/i, /no sprout\b/i,
  /open with (?:a |one-sentence )?answer capsule/i, /word count/i,
];

export interface QualityResult { passed: boolean; issues: string[]; }

export function qualityCheck(blocks: { kind: string; text: string }[], targetWords: number): QualityResult {
  const issues: string[] = [];
  const paras = blocks.filter((b) => b.kind === "paragraph");
  const body = blocks.filter((b) => b.kind !== "meta").map((b) => b.text).join(" \n ");
  const lower = body.toLowerCase();

  const banned = BANNED_PHRASES.filter((p) => lower.includes(p));
  if (banned.length) issues.push(`Remove banned AI phrases: ${banned.map((b) => `"${b}"`).join(", ")}.`);

  const leaks = blocks.filter((b) => b.kind !== "meta" && LEAKAGE.some((re) => re.test(b.text)));
  if (leaks.length) issues.push(`Remove brief-instruction text that leaked into ${leaks.length} block(s) — write prose, not directions.`);

  const openers = paras.map((p) => p.text.split(/\s+/).slice(0, 3).join(" ").toLowerCase());
  const repeated = openers.filter((o, i) => o.length > 4 && openers.indexOf(o) !== i);
  if (repeated.length) issues.push(`Vary paragraph openings — ${repeated.length} start with the same words (e.g. "${repeated[0]}…").`);

  // Duplicate FAQ answers: paragraphs that immediately follow an h3.
  const faqAnswers: string[] = [];
  for (let i = 0; i < blocks.length; i++) if (blocks[i].kind === "h3" && blocks[i + 1]?.kind === "paragraph") faqAnswers.push(blocks[i + 1].text);
  const sigs = faqAnswers.map((a) => a.slice(0, 60).toLowerCase());
  if (sigs.some((s, i) => sigs.indexOf(s) !== i)) issues.push("FAQ answers repeat each other — write each one uniquely.");

  const words = paras.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
  if (targetWords && words < targetWords * 0.6) issues.push(`Too short: ${words} words vs ~${targetWords} target. Develop each section with more depth.`);

  if (blocks.filter((b) => b.kind === "h2").length < 2) issues.push("Too few sections — the article must follow the brief's outline.");

  return { passed: issues.length === 0, issues };
}

export function buildRevisionPrompt(issues: string[]): string {
  return `Your previous draft did not meet the quality bar. Fix EVERY one of these problems and return the full corrected article in the exact same output format:\n\n${issues.map((i) => `- ${i}`).join("\n")}\n\nRewrite thoroughly — do not just patch the flagged spots. Keep the required sections and the Sprout.ph voice.`;
}
