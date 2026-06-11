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
  StandardizedBrief,
} from "../schemas/contentos";
import {
  PRODUCT_GTM_REVIEW_FLOOR,
  QA_LAYERS,
  QA_PASS_THRESHOLD,
  QA_REVISION_FLOOR,
} from "../schemas/contentos";
import { brandKnowledgeService } from "../data/brandKnowledgeService";
import { assetLibraryService } from "../data/assetLibraryService";
import { complianceReferenceService } from "../data/complianceReferenceService";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { avg, nextId, round1 } from "../util";

interface DraftLike extends Pick<Draft, "blocks" | "channel" | "format"> {}

export function runQAAgent(
  content: DraftLike,
  handoff: QAHandoffPackage,
  riskTier: RiskTier,
  ts: string,
  target: "draft" | "derivative" = "draft",
  derivativeId?: string,
  brief?: StandardizedBrief,
): QAReport {
  const blocks = content.blocks;
  const text = blocks.map((b) => b.text).join("\n");
  const lowerText = text.toLowerCase();
  const wordTotal = blocks.filter((b) => b.kind !== "meta").reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
  const paras = blocks.filter((b) => b.kind === "paragraph");
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
  // Clichés are specific phrases → one suggestion each. Formulaic patterns (e.g.
  // em dashes) are CAPPED to one suggestion per pattern so they don't drown the
  // panel or zero out the layer.
  const formulaicSeen = new Map<string, { block: ContentBlock; count: number; label: string }>();
  blocks.forEach((b) => {
    brandKnowledgeService.scanCliches(b.text).forEach((c) => {
      suggestions.push(
        mkSuggestion(b, "tone_authenticity", "AI cliché / buzzword", "high", b.text, replacePhrase(b.text, c), `"${c}" is on Sprout's cliché watchlist (Appendix A). Replace with grounded, specific language.`, 0.9, "n/a", null),
      );
      note("tone_authenticity", `Watchlist phrase: "${c}"`, `Remove "${c}".`, 0.6);
      note("brand_voice", `Generic phrasing reduces brand authenticity ("${c}").`, "Use specific, human language.", 0.25);
    });
    brandKnowledgeService.scanFormulaic(b.text).forEach((f) => {
      const key = f.toLowerCase().includes("em dash") ? "em" : f.toLowerCase();
      const existing = formulaicSeen.get(key);
      if (existing) existing.count++;
      else formulaicSeen.set(key, { block: b, count: 1, label: f });
    });
  });
  formulaicSeen.forEach((v, key) => {
    const isEm = key === "em";
    suggestions.push(
      mkSuggestion(v.block, "tone_authenticity", isEm ? "Em dash overuse" : "Formulaic construction", "moderate", v.block.text, isEm ? v.block.text.replace(/\s*—\s*/g, ", ") : v.block.text, `${v.label}${v.count > 1 ? ` — appears in ${v.count} places` : ""}. Soften for an authentic, human tone.`, 0.7, "n/a", null),
    );
    note("tone_authenticity", `${v.label}${v.count > 1 ? ` (×${v.count})` : ""}`, isEm ? "Replace some em dashes with commas or periods." : "Rework the sentence structure.", Math.min(0.4 * v.count, 1.0));
  });

  // -- Layer 8: Product & GTM Verification — claims traced to GTM Studio ---
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
        true,
      ),
    );
    note("product_gtm_accuracy", "Unverified product claim present.", "Trace to GTM Studio or remove. Route to Product Marketing.", 1.4);
  });

  // Product MESSAGING alignment (beyond per-claim tracing): placement (earned,
  // over/under-used?) and forbidden superlatives.
  if (brief?.product) {
    const product = gtmStudioProductService.getProduct(brief.product);
    if (product) {
      const name = product.displayName;
      const nameRe = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const mentions = (text.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? []).length;
      if (mentions === 0) note("product_gtm_accuracy", `${name} is the brief's product but is never mentioned — a missed positioning opportunity.`, `Add one earned, in-context mention of ${name} tied to a GTM-verified capability.`, 0.9);
      else if (mentions > 5) note("product_gtm_accuracy", `${name} appears ${mentions}× — reads more like a pitch than thought leadership.`, "Trim to 1–3 earned mentions; let the argument carry the piece.", 0.6);
      else strength("product_gtm_accuracy", `${name} mentioned ${mentions}× — earned and in proportion.`);
      // Only clearly-aspirational PRODUCT claims — not ordinary words like "the only
      // one they sell" (about competitors). Each comes with ready-to-accept softer copy.
      const SOFTEN: { re: RegExp; to: string }[] = [
        { re: /\bthe best\b/i, to: "a strong" }, { re: /\b#1\b/i, to: "a leading" },
        { re: /\bnumber one\b/i, to: "a leading" }, { re: /\bworld-class\b/i, to: "capable" },
        { re: /\bguaranteed\b/i, to: "designed to deliver" }, { re: /\b100%\s+(accurate|compliant|automated)\b/i, to: "highly $1" },
        { re: /\bfully autonomous\b/i, to: "automated" }, { re: /\beffortless\b/i, to: "low-effort" },
        { re: /\bunrivall?ed\b/i, to: "strong" }, { re: /\bunmatched\b/i, to: "strong" },
      ];
      for (const p of paras) {
        if (!nameRe.test(p.text) && !/\bsprout\b/i.test(p.text)) continue;
        for (const rule of SOFTEN) {
          const m = p.text.match(rule.re);
          if (!m) continue;
          const replacement = m[0].replace(rule.re, rule.to);
          suggestions.push(mkSuggestion(p, "product_gtm_accuracy", "Unsubstantiated superlative", "high", m[0], replacement, `"${m[0]}" is an aspirational claim GTM Studio doesn't approve. Suggested softer wording — accept, edit, or reject.`, 0.85, "n/a", null));
          note("product_gtm_accuracy", `Superlative near the product: "${m[0]}".`, `Soften to "${replacement}" or use a specific GTM-approved benefit.`, 0.7);
        }
      }
    }
  }

  // -- Layer 4: Factual / data accuracy — dataset guardrails --------------
  handoff.factualClaims.forEach((claim) => {
    if (claim.status === "human_review" || claim.status === "unverified") {
      const blk = blocks.find((b) => b.text.includes((claim.sourceName ?? "").slice(0, 16))) ?? blocks[blocks.length - 1];
      suggestions.push(
        mkSuggestion(blk, "factual_accuracy", "Data citation needs validation", "high", blk.text, blk.text, claim.note || "Dataset citation requires owner approval or carries a small-sample caveat.", 0.75, claim.status, null, true),
      );
      note("factual_accuracy", `Data claim flagged: ${claim.sourceName}`, "Add caveat / get owner approval, or remove.", 0.6);
    } else {
      strength("factual_accuracy", `Cited ${claim.sourceName} (${claim.dateRange}, n=${claim.sampleSize}).`);
    }
  });

  // -- Layer 5: Channel optimization — hyperlinking (internal + external) --
  const isBlog = content.channel === "blog" || content.format === "blog";
  if (isBlog) {
    const bodyText = blocks.map((b) => b.text).join(" ");
    const linkCount = handoff.sourceMap.filter((s) => s.type === "internal_asset").length;
    if (linkCount < 3) {
      // Describe the TOPICS to link — never fabricate URLs. Real link targets must
      // come from a verified Sprout source (sitemap/CMS), not be invented here.
      const topicSet = Array.from(new Set((bodyText.toLowerCase().match(/payroll|compliance|timekeeping|retention|13th month|outsourc\w*|onboarding|benefits|attendance/g) ?? ["payroll"]))).slice(0, 3);
      const topicList = topicSet.join(", ");
      const blk = blocks[blocks.length - 1];
      suggestions.push(
        mkSuggestion(blk, "channel_optimization", "Add relevant internal links", "moderate", "", "", `Only ${linkCount} internal Sprout link(s); blogs want 3–5. Link to your existing published Sprout articles on: ${topicList}. Use real, verified URLs — do not invent link paths.`, 0.8, "n/a", null, true),
      );
      note("channel_optimization", `Only ${linkCount} internal Sprout link(s); 3–5 recommended for blogs.`, `Link to verified Sprout articles on ${topicList} (use real URLs).`, 0.7);
    } else {
      strength("channel_optimization", `${linkCount} internal links present.`);
    }

    // External authoritative sources — required where the draft makes statutory/factual claims.
    const claimsStatutory = /\b(SSS|PhilHealth|Pag-?IBIG|BIR|DOLE|statutory|withholding|contribution)\b/i.test(bodyText);
    const externalCount = handoff.sourceMap.filter((s) => s.type === "regulatory" || s.type === "external_authority").length;
    if (claimsStatutory && externalCount < 1) {
      const body = ["DOLE", "BIR", "SSS", "PhilHealth", "Pag-IBIG"].find((b) => new RegExp(`\\b${b.replace("-", "[-]?")}\\b`, "i").test(bodyText)) ?? "DOLE";
      const ref = complianceReferenceService.forBody(body)[0];
      const blk = blocks.find((b) => new RegExp(body.replace("-", "[-]?"), "i").test(b.text)) ?? blocks[blocks.length - 1];
      suggestions.push(
        mkSuggestion(blk, "factual_accuracy", "Statutory claim needs an authoritative source", "high", "", "", ref ? `Cite the authoritative source for this claim: ${ref.body} (${ref.url}). Avoid vendor or competitor pages.` : "Cite the relevant government agency.", 0.85, "n/a", null, true),
      );
      note("channel_optimization", "Statutory/factual claims lack an authoritative external source.", "Cite the relevant PH government agency (DOLE/BIR/SSS/PhilHealth/Pag-IBIG).", 0.8);
    } else if (externalCount > 0) {
      strength("factual_accuracy", `${externalCount} authoritative external source(s) cited.`);
    }

    const hasMeta = blocks.some((b) => b.kind === "meta");
    if (!hasMeta) note("channel_optimization", "No meta description.", "Add a meta description under 160 characters.", 0.4);
    else strength("channel_optimization", "Meta description present.");
  }

  // -- Layer 6: Writing quality — AI patterns & repetition ----------------
  const AI_PATTERNS = [
    /to set a clear baseline/i, /it is worth naming/i, /the deeper issue/i, /\bin practice\b/i,
    /the reality is/i, /it comes down to/i, /the short answer is/i, /a useful way to think/i,
    /the key difference is/i, /in the fast-paced world/i, /let'?s dive in/i, /\bin conclusion\b/i,
    /when it comes to/i, /\bnavigating the\b/i, /\bin today'?s\b/i,
  ];
  for (const p of paras) {
    const hit = AI_PATTERNS.find((re) => re.test(p.text));
    if (!hit) continue;
    const matched = p.text.match(hit)?.[0] ?? "";
    suggestions.push(
      mkSuggestion(p, "tone_authenticity", "AI writing pattern", "moderate", matched, "", `"${matched}" is generic AI phrasing. Rewrite this in a specific, expert voice — click Edit to supply a replacement.`, 0.75, "n/a", null, true),
    );
    note("tone_authenticity", `AI pattern detected: "${matched}".`, "Replace formulaic phrasing with concrete, expert prose.", 0.7);
  }
  const openers = paras.map((p) => p.text.split(/\s+/).slice(0, 3).join(" ").toLowerCase());
  const repeated = openers.filter((o, i) => o.length > 4 && openers.indexOf(o) !== i).length;
  if (repeated > 0) note("tone_authenticity", `${repeated} paragraph(s) open with the same words.`, "Vary sentence openings so the piece doesn't read mechanically.", 0.65);
  else if (paras.length > 3) strength("tone_authenticity", "Varied sentence openings; reads naturally.");

  // -- Clarity & concision — concrete line edits (real before → after) -----
  // Safe exact-phrase substitutions (the replacement always reads correctly).
  const CLARITY: { re: RegExp; to: string }[] = [
    { re: /\bin order to\b/i, to: "to" }, { re: /\bdue to the fact that\b/i, to: "because" },
    { re: /\bthe fact that\b/i, to: "that" }, { re: /\bin the event that\b/i, to: "if" },
    { re: /\bhas the ability to\b/i, to: "can" }, { re: /\bhave the ability to\b/i, to: "can" },
    { re: /\bfor the purpose of\b/i, to: "for" }, { re: /\bat this point in time\b/i, to: "now" },
    { re: /\bat the present time\b/i, to: "now" }, { re: /\bin the near future\b/i, to: "soon" },
    { re: /\bwith regard to\b/i, to: "about" }, { re: /\bwith respect to\b/i, to: "about" },
    { re: /\bin spite of the fact that\b/i, to: "although" }, { re: /\bin spite of\b/i, to: "despite" },
    { re: /\ba majority of\b/i, to: "most" }, { re: /\bthe majority of\b/i, to: "most" },
    { re: /\ba large number of\b/i, to: "many" }, { re: /\ba number of\b/i, to: "several" },
    { re: /\bprior to\b/i, to: "before" }, { re: /\bsubsequent to\b/i, to: "after" },
    { re: /\bin the absence of\b/i, to: "without" }, { re: /\bon a regular basis\b/i, to: "regularly" },
    { re: /\bin a timely manner\b/i, to: "promptly" }, { re: /\bthe reason why\b/i, to: "why" },
    { re: /\bthe reason is because\b/i, to: "because" }, { re: /\beach and every\b/i, to: "every" },
    { re: /\bend result\b/i, to: "result" }, { re: /\bfinal outcome\b/i, to: "outcome" },
    { re: /\bpast history\b/i, to: "history" }, { re: /\bpast experience\b/i, to: "experience" },
    { re: /\bfuture plans\b/i, to: "plans" }, { re: /\badvance planning\b/i, to: "planning" },
    { re: /\bcompletely eliminate\b/i, to: "eliminate" }, { re: /\babsolutely essential\b/i, to: "essential" },
    { re: /\bbasic fundamentals\b/i, to: "fundamentals" }, { re: /\badded bonus\b/i, to: "bonus" },
    { re: /\bnew innovation\b/i, to: "innovation" }, { re: /\bmake a decision\b/i, to: "decide" },
    { re: /\bmake use of\b/i, to: "use" }, { re: /\bgive consideration to\b/i, to: "consider" },
    { re: /\btake into consideration\b/i, to: "consider" }, { re: /\bis going to\b/i, to: "will" },
    { re: /\bare going to\b/i, to: "will" }, { re: /\bin conjunction with\b/i, to: "with" },
    { re: /\bas a means to\b/i, to: "to" }, { re: /\bin terms of\b/i, to: "for" },
    { re: /\bdespite the fact that\b/i, to: "although" }, { re: /\bregardless of the fact that\b/i, to: "although" },
    { re: /\butiliz(e|es|ed|ing)\b/i, to: "use" }, { re: /\bso as to\b/i, to: "to" },
  ];
  let clarityCount = 0;
  for (const p of paras) {
    if (clarityCount >= 12) break;
    for (const rule of CLARITY) {
      const m = p.text.match(rule.re);
      if (!m) continue;
      // Preserve the matched word's leading capitalization in the replacement.
      const to = /^[A-Z]/.test(m[0]) ? rule.to.charAt(0).toUpperCase() + rule.to.slice(1) : rule.to;
      suggestions.push(mkSuggestion(p, "narrative_readability", "Wordy phrasing", "low", m[0], to, `Tighten “${m[0]}” to “${to || "(remove)"}” for concision.`, 0.8, "n/a", null));
      note("narrative_readability", `Wordy: “${m[0]}” → “${to}”.`, "", 0.12);
      if (++clarityCount >= 12) break;
    }
  }
  // Filler words — remove with a neighbour for a clean before → after swap.
  const FILLER = /\b(\w+)\s+(actually|basically|essentially|simply)\s+(\w+)\b/i;
  for (const p of paras) {
    if (clarityCount >= 10) break;
    const m = p.text.match(FILLER);
    if (!m) continue;
    suggestions.push(mkSuggestion(p, "narrative_readability", "Filler word", "low", m[0], `${m[1]} ${m[3]}`, `“${m[2]}” adds little here — tighten to “${m[1]} ${m[3]}.”`, 0.7, "n/a", null));
    note("narrative_readability", `Filler word “${m[2]}” — consider removing.`, "", 0.12);
    clarityCount++;
  }

  // Hedges & intensifiers that soften authority — an editor cuts these. Each comes
  // with ready-to-accept tighter copy (the word removed, neighbour kept).
  const HEDGE = /\b(usually|generally|typically|somewhat|fairly|relatively|very|simply|genuinely|truly|basically|quite)\s+([a-z]\w+)/gi;
  let hedgeCount = 0;
  for (const p of paras) {
    if (hedgeCount >= 6) break;
    for (const m of p.text.matchAll(HEDGE)) {
      if (hedgeCount >= 6) break;
      const word = m[1].toLowerCase();
      const next = m[2].toLowerCase();
      const before = p.text.slice(Math.max(0, (m.index ?? 0) - 9), m.index).toLowerCase();
      // Skip context where removal changes meaning: "how usually", "would …", number words.
      if (/\b(how|would|how much|'d)\s*$/.test(before)) continue;
      if (/^(one|two|three|few|several|some|many|most|little|few)$/.test(next)) continue;
      suggestions.push(mkSuggestion(p, "tone_authenticity", "Hedge / softener", "low", m[0], next, `“${word}” softens your authority — cut it: “${m[0]}” → “${next}.”`, 0.7, "n/a", null));
      note("tone_authenticity", `Hedge/softener: “${word}”.`, "Cut hedges for a more authoritative, expert voice.", 0.25);
      hedgeCount++;
    }
  }

  // -- Layer 2: Readability — structure, paragraph & sentence length ------
  const hasHeading = blocks.some((b) => b.kind === "h1" || b.kind === "h2");
  if (!hasHeading) note("narrative_readability", "No clear heading structure.", "Add H1/H2 headers for skimmability.", 0.8);
  else strength("narrative_readability", "Clear heading structure.");
  const longParas = paras.filter((p) => p.text.split(/\s+/).length > 95);
  longParas.slice(0, 3).forEach((p) =>
    suggestions.push(mkSuggestion(p, "narrative_readability", "Paragraph runs long", "low", p.text.slice(0, 60), "", `This paragraph runs ${p.text.split(/\s+/).length} words. Split it so each runs 2–4 sentences for skimmability.`, 0.6, "n/a", null, true)),
  );
  if (longParas.length) note("narrative_readability", `${longParas.length} long paragraph(s) (>95 words).`, "Split into shorter paragraphs.", Math.min(0.3 * longParas.length, 1));
  const longSentences = paras.reduce((n, p) => n + p.text.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length > 38).length, 0);
  if (longSentences) note("narrative_readability", `${longSentences} very long sentence(s) (>38 words).`, "Break long sentences for an easier read.", Math.min(0.2 * longSentences, 0.8));
  else if (paras.length) strength("narrative_readability", "Sentence and paragraph lengths are reader-friendly.");

  // -- Layer 1: Strategic alignment — CTA, pain-point coverage, must-include/avoid --
  const hasCta = blocks.some((b) => b.kind === "cta");
  if (!hasCta) note("strategic_alignment", "No CTA.", "Add a CTA matched to reader intent and funnel stage.", 0.7);
  else strength("strategic_alignment", "CTA present.");
  if (brief) {
    const covered = (phrase: string) => { const w = phrase.toLowerCase().split(/\s+/).filter((x) => x.length > 4); return w.length === 0 || w.some((x) => lowerText.includes(x)); };
    const uncovered = (brief.painPoints ?? []).filter((p) => !covered(p));
    if (uncovered.length) note("strategic_alignment", `${uncovered.length} brief pain point(s) not addressed: ${uncovered.join("; ")}.`, "Add a paragraph addressing each uncovered pain point.", Math.min(0.6 * uncovered.length, 1.5));
    else if ((brief.painPoints ?? []).length) strength("strategic_alignment", `All ${brief.painPoints.length} brief pain points are addressed.`);
    for (const inc of brief.mustInclude ?? []) if (inc && !covered(inc)) note("strategic_alignment", `Must-include missing: "${inc}".`, `Work "${inc}" into the article.`, 0.5);
    for (const av of brief.mustAvoid ?? []) if (av && lowerText.includes(av.toLowerCase())) {
      const blk = blocks.find((b) => b.text.toLowerCase().includes(av.toLowerCase())) ?? blocks[0];
      suggestions.push(mkSuggestion(blk, "strategic_alignment", "Must-avoid term present", "high", av, "", `The brief says to avoid "${av}". Remove or rephrase it.`, 0.85, "n/a", null));
      note("strategic_alignment", `Must-avoid term present: "${av}".`, `Remove "${av}".`, 0.7);
    }
  }

  // -- Layer 3: Brand voice — second-person address -----------------------
  const secondPerson = (text.match(/\b(you|your|you're|you'll)\b/gi) ?? []).length;
  if (wordTotal > 250 && secondPerson < 3) note("brand_voice", "Reads impersonal — little direct address.", "Speak to the reader with 'you/your', per Sprout's conversational voice.", 0.5);
  else if (secondPerson >= 3) strength("brand_voice", "Speaks to the reader directly (second person).");
  if (layerAccumulator.brand_voice.issues.length === 0 && secondPerson >= 3) strength("brand_voice", "Tone consistent with Sprout's style guide.");

  // -- Layer 4: Factual — uncited market/industry statistics --------------
  const marketClaims = paras.filter((p) => /\b\d+(\.\d+)?%\s+(of|increase|decrease|growth|rise|drop)|\b(studies|research|surveys?|reports?)\s+(show|found|suggest|indicate)/i.test(p.text) && !/\]\(http/.test(p.text));
  if (marketClaims.length) note("factual_accuracy", `${marketClaims.length} market/industry statistic(s) without a cited source.`, "Attribute industry statistics to an authoritative source (not a vendor).", Math.min(0.4 * marketClaims.length, 1));

  // -- Layer 7: Visual & structural integrity -----------------------------
  const hasList = blocks.some((b) => b.kind === "list");
  const h2count = blocks.filter((b) => b.kind === "h2").length;
  if (h2count < 2) note("visual_structural", "Too few sections for the length.", "Break the article into clear H2 sections.", 0.6);
  else if (!hasList && wordTotal > 700) note("visual_structural", "No lists or tables in a long read.", "Add a list or comparison table for scannability.", 0.4);
  else strength("visual_structural", "Good structural variety (headings + lists).");

  // Drop rewrite suggestions that wouldn't change anything or can't be anchored
  // in the editable body (e.g. point at a meta/cta block). Advisory items stay.
  const bodyText = blocks.filter((b) => ["h1", "h2", "h3", "paragraph", "list"].includes(b.kind)).map((b) => b.text).join("\n");
  for (let i = suggestions.length - 1; i >= 0; i--) {
    const s = suggestions[i];
    if (s.advisory) continue;
    const noop = !s.currentText.trim() || s.suggestedReplacement.trim() === s.currentText.trim();
    const anchorable = bodyText.includes(s.currentText.trim());
    if (noop || !anchorable) suggestions.splice(i, 1);
  }

  // Every layer must show a verdict — if a layer found nothing, record that it
  // ran and passed, so the scorecard never looks "silent" on any criterion.
  QA_LAYERS.forEach((l) => {
    const acc = layerAccumulator[l.key];
    if (acc.issues.length === 0 && acc.strengths.length === 0) acc.strengths.push("Checked — meets the standard, no issues found.");
  });

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
  advisory = false,
): QASuggestion {
  return {
    id: nextId("sug"),
    blockId: blk.id,
    layer,
    issueType,
    severity,
    currentText,
    suggestedReplacement,
    advisory,
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
