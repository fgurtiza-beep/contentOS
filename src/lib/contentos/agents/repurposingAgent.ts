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

  // Read the ACTUAL source asset so derivatives are about the source, not generic
  // Sprout messaging. (Video sources use the processed transcript summary instead.)
  const source: SourceDigest = src.assetType === "video-transcript" && videoTranscript
    ? (() => { const pts = videoTranscript.keyTakeaways.flatMap((kt: KeyTakeaway) => kt.bullets).slice(0, 8); return { topic: videoTranscript.executiveSummary.split(/[.!?]/)[0] || src.title, gist: pts[0] ?? videoTranscript.executiveSummary, points: pts }; })()
    : cleanSource(src.content, src.title);

  const derivatives: Derivative[] = [];
  requests.forEach((req) => {
    const qty = Math.max(1, req.quantity);
    for (let i = 0; i < qty; i++) {
      const intent = brief.contentIntent[(derivatives.length) % Math.max(brief.contentIntent.length, 1)] ?? "awareness";
      derivatives.push(buildDerivative(req.channel, req.format, i + 1, intent, narrative, brief, ts, src.id, source));
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

interface SourceDigest { topic: string; gist: string; points: string[]; }

// Site chrome / nav to strip when reading a pasted webpage.
const NAV = /(arrow|chevron|caret)-?(down|up|right|left)|^(menu|search|home|solutions?|industries|resources|customers?|pricing|products?|company|login|log ?in|sign ?in|sign ?up|register|subscribe|share|tweet|next|previous|prev|categories|tags|comments?|why sprout|features|integrations|blog|articles|events|news|careers|support)$|skip to (content|main)|we use cookies|^©|all rights reserved|privacy policy|^terms\b|back to top|^read more$|follow us|toggle navigation|book a (demo|meeting)/i;

/**
 * Read the ACTUAL source asset: strip nav/breadcrumbs, find the real headline
 * (the line just before the first long paragraph) and the substantive body
 * sentences. Robust against pasted full-page text.
 */
function cleanSource(raw: string, fallbackTitle: string): SourceDigest {
  const lines = (raw || "").replace(/\r/g, "").split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const cleaned = lines
    .map((l) => (/\s[\/›>|]\s/.test(l) ? (l.split(/\s*[\/›>|]\s*/).pop() || l).trim() : l)) // de-breadcrumb
    .filter((l) => l.length >= 3 && !NAV.test(l) && !/^[\W\d]+$/.test(l));
  const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const isLong = (s: string) => wc(s) >= 12;
  const firstLongIdx = cleaned.findIndex(isLong);
  const DATE = /^(\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,2},?\s*\d{4}$|^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\w+\s+\d{1,2},?\s+\d{4}$/i;
  // Pick the strongest HEADLINE: a 3–13 word, non-nav, non-date, non-paragraph line
  // in the first part of the doc. Prefer the longest such line (the real title beats
  // a date, a one-word nav item, or a breadcrumb crumb).
  const headlineCandidates = cleaned
    .slice(0, Math.max(25, (firstLongIdx < 0 ? 25 : firstLongIdx + 2)))
    .filter((l) => l.length >= 14 && l.length <= 120 && wc(l) >= 3 && wc(l) <= 13 && /[a-z]/.test(l) && !DATE.test(l) && !isLong(l));
  let title = headlineCandidates.sort((a, b) => b.length - a.length)[0] || "";
  if (!title) title = (firstLongIdx >= 0 ? cleaned[firstLongIdx].split(/[.!?]/)[0] : "") || fallbackTitle || "this piece";

  const norm = (s: string) => s.replace(/[?.!]+$/, "").trim().toLowerCase();
  const sentences = cleaned.slice(Math.max(0, firstLongIdx)).join("\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => { const w = wc(s); return w >= 8 && w <= 55 && s.length <= 340 && /[a-z]/.test(s) && !NAV.test(s) && ((s.match(/[A-Za-z]/g)?.length ?? 0) / s.length) > 0.65; });
  const points = Array.from(new Set(sentences)).filter((s) => norm(s) !== norm(title));
  const finalPoints = (points.length ? points : sentences).slice(0, 8);
  return { topic: capped(title.replace(/[.!?]+$/, "").trim(), 100), gist: finalPoints[0] ?? title, points: finalPoints };
}

/* ---- per-format generation: each content type follows its own workflow ---- */

function blockBuilder() {
  const blocks: ContentBlock[] = []; let o = 0;
  return { add: (k: ContentBlock["kind"], t: string) => { if (t && t.trim()) blocks.push(block(o++, k, t.trim())); }, blocks };
}
const subhead = (p: string) => cap(p.split(/[,.;:—]/)[0].split(/\s+/).slice(0, 8).join(" ").replace(/[.!?]+$/, ""));
function hashtags(src: SourceDigest, brief: StandardizedBrief): string {
  const stop = new Set(["with", "that", "this", "from", "what", "your", "their", "about", "significance", "celebrating", "philippine", "philippines"]);
  const words = `${src.topic} ${brief.seoKeyword ?? ""}`.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const tags = Array.from(new Set(words.filter((w) => !stop.has(w)))).slice(0, 3).map((w) => "#" + cap(w));
  return [...tags, "#Sprout"].join(" ");
}
function emojiFor(src: SourceDigest): string {
  const t = src.topic.toLowerCase();
  if (/independence|nation|holiday|fiesta|christmas/.test(t)) return "🇵🇭";
  if (/payroll|salary|wage|pay\b/.test(t)) return "💰";
  if (/complian|tax|bir|sss|dole/.test(t)) return "📋";
  return "📌";
}

function blogFmt(src: SourceDigest, brief: StandardizedBrief, cta: string): ContentBlock[] {
  const { add, blocks } = blockBuilder();
  const aud = brief.primaryICP || "Philippine HR and operations teams";
  add("h1", cap(src.topic));
  add("meta", `SEO meta title: ${capped(cap(src.topic), 60)}`);
  add("meta", `SEO meta description: ${capped(`${cap(src.topic)} — what it means for ${aud}.`, 155)}`);
  add("paragraph", `${src.gist} Here's a quick recap for ${aud}, and why it matters.`);
  src.points.slice(1, 4).forEach((p) => { add("h2", subhead(p)); add("paragraph", p); });
  add("h2", `What this means for ${aud}`);
  add("paragraph", `The practical takeaway: ${lower(src.gist)}${brief.painPoints?.[0] ? ` It speaks directly to ${lower(brief.painPoints[0])}.` : ""}`);
  add("cta", cta);
  return blocks;
}
function longFmt(src: SourceDigest, brief: StandardizedBrief, cta: string, format: string): ContentBlock[] {
  const { add, blocks } = blockBuilder();
  add("h1", `${cap(format)}: ${cap(src.topic)}`);
  add("h2", "Executive summary");
  add("paragraph", `${src.gist} This ${format} unpacks what it means for ${brief.primaryICP || "PH teams"}.`);
  src.points.slice(1, 5).forEach((p) => { add("h2", subhead(p)); add("paragraph", p); });
  add("h2", "The bottom line");
  add("paragraph", `In short: ${lower(src.gist)}`);
  add("cta", cta);
  return blocks;
}
function pressFmt(src: SourceDigest, brief: StandardizedBrief, cta: string): ContentBlock[] {
  const { add, blocks } = blockBuilder();
  add("h1", cap(src.topic));
  add("paragraph", `MANILA, Philippines — ${src.gist}`);
  src.points.slice(1, 4).forEach((p) => add("paragraph", p));
  add("paragraph", `About Sprout Solutions: Sprout is a Philippine HR and payroll platform helping businesses run people operations with confidence. ${cta}`);
  return blocks;
}
function emailFmt(src: SourceDigest, brief: StandardizedBrief, cta: string): ContentBlock[] {
  const { add, blocks } = blockBuilder();
  add("meta", `Subject line: ${capped(cap(src.topic), 60)}`);
  add("paragraph", "Hi there,");
  add("paragraph", `${src.gist} Here are the highlights:`);
  src.points.slice(1, 4).forEach((p) => add("list", p));
  add("paragraph", "Read on for the full picture.");
  add("cta", cta);
  return blocks;
}
function threadFmt(src: SourceDigest, cta: string): ContentBlock[] {
  const { add, blocks } = blockBuilder();
  add("paragraph", `1/ ${cap(src.topic)} — a thread 🧵`);
  src.points.slice(0, 5).forEach((p, i) => add("paragraph", `${i + 2}/ ${capped(p, 270)}`));
  add("paragraph", `${Math.min(src.points.length, 5) + 2}/ ${cta}`);
  return blocks;
}
function carouselFmt(src: SourceDigest, cta: string): ContentBlock[] {
  const { add, blocks } = blockBuilder();
  add("h2", `Slide 1 — ${cap(src.topic)}`);
  src.points.slice(0, 5).forEach((p, i) => { add("h3", `Slide ${i + 2}`); add("paragraph", capped(p, 200)); });
  add("h3", `Slide ${Math.min(src.points.length, 5) + 2} — Takeaway`);
  add("cta", cta);
  return blocks;
}
function socialFmt(c: string, src: SourceDigest, brief: StandardizedBrief, cta: string): ContentBlock[] {
  const { add, blocks } = blockBuilder();
  const tags = hashtags(src, brief);
  const aud = brief.primaryICP || "HR and ops teams";
  const takeaway = src.points.length > 2 ? src.points[src.points.length - 1] : (brief.painPoints?.[0] ? `If your team wrestles with ${lower(brief.painPoints[0])}, this is worth a read.` : "");
  if (c.includes("linkedin")) {
    add("paragraph", `${cap(src.topic)} 👇`);
    add("paragraph", src.points[0] ?? src.gist);
    if (src.points[1] && src.points[1] !== src.points[0]) add("paragraph", src.points[1]);
    if (takeaway) add("paragraph", `What it means for ${aud}: ${lower(takeaway)}`);
    add("cta", cta);
    add("paragraph", tags);
  } else if (c.includes("facebook") || c.includes("instagram")) {
    add("paragraph", `${emojiFor(src)} ${cap(src.topic)}`);
    add("paragraph", capped(src.points[0] ?? src.gist, 220));
    add("cta", cta);
    add("paragraph", tags);
  } else if (c.includes("x") || c.includes("twitter")) {
    add("paragraph", capped(`${cap(src.topic)} — ${lower(src.points[0] ?? src.gist)}`, 270));
    add("cta", cta);
  } else {
    add("paragraph", cap(src.topic));
    add("paragraph", src.points[0] ?? src.gist);
    add("cta", cta);
  }
  return blocks;
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
  source: SourceDigest,
): Derivative {
  const f = format.toLowerCase(), c = channel.toLowerCase();
  const cta = brief.cta || narrative.safeCtaLanes.find((l) => l.intent === intent)?.cta || "Read the full article";
  let blocks: ContentBlock[];
  if (/blog|recap|article|listicle/.test(f)) blocks = blogFmt(source, brief, cta);
  else if (/ebook|whitepaper|guide|case study/.test(f)) blocks = longFmt(source, brief, cta, format);
  else if (/press release/.test(f)) blocks = pressFmt(source, brief, cta);
  else if (/newsletter|sequence/.test(f) || c.includes("email")) blocks = emailFmt(source, brief, cta);
  else if (/thread/.test(f)) blocks = threadFmt(source, cta);
  else if (/carousel/.test(f)) blocks = carouselFmt(source, cta);
  else blocks = socialFmt(c, source, brief, cta);
  if (brief.regulatory) blocks.push(block(blocks.length, "paragraph", complianceReferenceService.disclaimer()));

  return {
    id: nextId("deriv"),
    title: `${channel} · ${cap(format)} — ${capped(cap(source.topic), 56)}`,
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

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const capped = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
