/**
 * Brief Extractor
 * ---------------
 * Acquires text from an uploaded file OR pasted text, then routes it:
 *  - If it matches the agency SEO brief format → deterministic agencyBriefParser.
 *  - Otherwise → lightweight keyword heuristics.
 *
 * Text acquisition:
 *  - Paste / .txt / .md / .json / .csv / .html / .rtf → read directly.
 *  - .docx → mammoth (browser).
 *  - .pdf  → pdfjs-dist (browser). If the PDF can't be read, we ask the user to
 *    paste the brief text instead (the most reliable path).
 *
 * Provenance guardrail: a Sprout PRODUCT is only filled when the document names
 * one; products the brief names but GTM Studio doesn't list are surfaced as
 * "detected but unmapped" for the user to confirm — never silently accepted.
 */

import { INDUSTRIES, TONES, INTENT_GOALS, type ContentIntent, type AgencyBriefExtract, type CompetitorGap, type OutlineSection, type DetectedProduct, type TitleOption } from "../schemas/contentos";
import { icpKnowledgeService } from "../data/icpKnowledgeService";
import { gtmStudioProductService } from "../data/gtmStudioProductService";
import { isAgencyBrief, parseAgencyBrief } from "./agencyBriefParser";

export interface ExtractedBrief {
  // Core
  title?: string;
  objective?: string;
  industry?: string;
  primaryICP?: string;
  persona?: string;
  painPoints?: string[];
  contentIntent?: ContentIntent[];
  contentGoals?: string[];
  tone?: string[];
  products?: string[]; // mapped GTM Studio slugs
  unmappedProducts?: string[]; // detected but not in GTM list — needs confirmation
  cta?: string;
  competitor?: string;
  seoKeyword?: string;
  // Agency-brief richness
  agency?: AgencyBriefExtract;
  audienceDetails?: string;
  companySize?: string;
  geography?: string;
  triggerEvents?: string[];
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  keywordVariations?: string[];
  paaQuestions?: string[];
  searchIntent?: string;
  serpOpportunity?: string;
  contentAngle?: string;
  competitorGaps?: CompetitorGap[];
  keyMessaging?: string[];
  outline?: OutlineSection[];
  ctaType?: string;
  ctaText?: string;
  wordCount?: string;
  productionFormat?: string;
  schema?: string;
  media?: string;
  productMentionRules?: string;
  proofRequirements?: string;
  titleOptions?: TitleOption[];
  detectedProducts?: DetectedProduct[];
  // Status
  isAgency: boolean;
  simulated: boolean;
  needsPaste?: boolean; // file couldn't be read — ask the user to paste
  sourceName: string;
}

const TEXT_EXT = ["txt", "md", "markdown", "json", "csv", "html", "htm", "rtf"];

/* ------------------------------------------------------------------ */
/* Entry points                                                       */
/* ------------------------------------------------------------------ */

export function extractBriefFromText(text: string, sourceName = "pasted text"): ExtractedBrief {
  const ext = isAgencyBrief(text) ? mapAgency(parseAgencyBrief(text), sourceName) : extractHeuristic(text, sourceName);
  // Context-clue fallback: if the structured sections didn't yield pain points
  // or goals, infer them from cues anywhere in the document so the form still
  // auto-fills the two most important inputs.
  if (!ext.painPoints?.length) {
    const inferred = inferPains(text);
    if (inferred.length) ext.painPoints = inferred;
  }
  if (!ext.contentGoals?.length) {
    const inferred = inferGoals(text);
    if (inferred.length) ext.contentGoals = inferred;
  }
  return ext;
}

/** Map pain-signal cues anywhere in the text to the standard pain-point options. */
function inferPains(text: string): string[] {
  const lower = text.toLowerCase();
  const cues: [RegExp, string][] = [
    [/manual|spreadsheet|by hand|re-?key|double entry/, "Manual processes"],
    [/complian|penalt|audit|\bdole\b|\bbir\b|\bsss\b|philhealth|pag-?ibig|statutory|regulat/, "Compliance risk"],
    [/payroll error|miscalc|inaccurac|inaccurate|payroll mistake|dispute|wrong pay/, "Payroll errors"],
    [/turnover|attrition|resign|churn(?!.*customer)/, "Employee turnover"],
    [/recruit|hiring|talent acquisition|sourcing candidates/, "Recruitment challenges"],
    [/visibility|single source of truth|fragmented|siloed|no .* overview|disconnected data/, "Lack of HR visibility"],
    [/engagement|morale|burnout|disengag/, "Poor employee engagement"],
    [/report|analytic|dashboard|insight/, "Limited reporting"],
    [/scal|head ?count growth|growing team|expansion|second branch|multi-?branch/, "Difficulty scaling operations"],
    [/adoption|learning curve|change management|onboarding to the tool|user uptake/, "Technology adoption issues"],
  ];
  const out: string[] = [];
  for (const [re, label] of cues) if (re.test(lower) && !out.includes(label)) out.push(label);
  return out.slice(0, 6);
}

/** Infer content goals from cues anywhere in the text. */
function inferGoals(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  const push = (label: string) => { if (!out.includes(label)) out.push(label); };
  if (/compar|comparison|\bvs\b|versus|decision framework|software or service|which (is|one)|alternative|evaluat/.test(lower)) {
    push("Help readers compare options");
    push("Support solution evaluation");
  }
  if (/educat|what is|in plain|plain (terms|language)|explainer|\bguide\b|how .* works|how to/.test(lower)) push("Educate the audience");
  if (/awareness|recognition|recogniz|introduc/.test(lower)) push("Build awareness");
  if (/\bdemo\b|validation|next steps for evaluation|\bmql\b|conversion|book a|request a|sign up|free trial/.test(lower)) push("Encourage validation or demo interest");
  if (/thought leadership|point of view|\bpov\b|perspective|industry trend/.test(lower)) push("Build thought leadership");
  if (/existing customer|retention|onboarding|customer success|adoption/.test(lower)) push("Support existing customers");
  return out.slice(0, 4);
}

export async function extractBriefFromFile(file: File): Promise<ExtractedBrief> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  try {
    let text = "";
    if (ext === "docx") text = await docxToText(file);
    else if (ext === "pdf") text = await pdfToText(file);
    else if (TEXT_EXT.includes(ext) || file.type.startsWith("text/")) text = await file.text();
    else return needsPaste(file.name);

    if (!text.trim() || printableRatio(text) < 0.8) return needsPaste(file.name);
    return extractBriefFromText(text, file.name);
  } catch {
    return needsPaste(file.name);
  }
}

/* ------------------------------------------------------------------ */
/* File → text                                                        */
/* ------------------------------------------------------------------ */

async function docxToText(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value ?? "";
}

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Webpack 5 emits the worker asset from this URL.
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Preserve line structure: pdfjs marks the end of a visual line with hasEOL.
    for (const it of content.items) {
      if ("str" in it) text += it.str + (it.hasEOL ? "\n" : " ");
    }
    text += "\n";
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Agency brief → ExtractedBrief                                      */
/* ------------------------------------------------------------------ */

function mapAgency(a: AgencyBriefExtract, sourceName: string): ExtractedBrief {
  const ad = (a.audienceDetails ?? "").toLowerCase();
  let primaryICP: string | undefined;
  let persona: string | undefined;
  if (/hr manager|hr leader|hr generalist|hr head|people leader/.test(ad)) { primaryICP = "SME HR Leader"; persona = "HR Manager"; }
  else if (/founder|business owner|\bowner\b|\bceo\b/.test(ad)) { primaryICP = "CEO / Business Owner (SME)"; persona = "Business Owner"; }

  const products = Array.from(new Set(a.detectedProducts.filter((p) => p.mapped && p.slug).map((p) => p.slug!)));
  const unmappedProducts = Array.from(new Set(a.detectedProducts.filter((p) => !p.mapped).map((p) => p.name)));

  return {
    isAgency: true,
    simulated: false,
    sourceName,
    agency: a,
    title: a.titleOptions[0]?.title,
    titleOptions: a.titleOptions,
    primaryICP,
    persona,
    industry: inferIndustry(`${a.audienceDetails ?? ""} ${a.topicIntent ?? ""}`),
    painPoints: a.painPoints,
    contentGoals: suggestGoals(a),
    products,
    unmappedProducts,
    detectedProducts: a.detectedProducts,
    competitor: a.detectedProducts.find((p) => !p.mapped)?.name,
    audienceDetails: a.audienceDetails,
    companySize: a.companySize,
    geography: a.geography,
    triggerEvents: a.triggerEvents,
    primaryKeyword: a.primaryKeyword,
    seoKeyword: a.primaryKeyword,
    secondaryKeywords: a.secondaryKeywords,
    keywordVariations: a.keywordVariations,
    paaQuestions: a.paaQuestions,
    searchIntent: a.searchIntent,
    serpOpportunity: a.serpOpportunity,
    contentAngle: a.contentAngle,
    competitorGaps: a.competitorGaps,
    keyMessaging: a.keyMessaging,
    outline: a.outline,
    ctaType: a.ctaType,
    ctaText: a.ctaText,
    wordCount: a.wordCount,
    productionFormat: a.productionFormat,
    schema: a.schema,
    media: a.media,
    productMentionRules: a.productMentionRules,
    proofRequirements: a.proofRequirements,
  };
}

function suggestGoals(a: AgencyBriefExtract): string[] {
  const blob = `${a.searchIntent ?? ""} ${a.contentAngle ?? ""} ${a.topicIntent ?? ""} ${a.businessGoal ?? ""}`.toLowerCase();
  const goals: string[] = [];
  if (/comparison|compare|decision framework|\bvs\b|evaluation|solution comparison/.test(blob)) {
    goals.push("Help readers compare options", "Support solution evaluation");
  }
  if (goals.length === 0 && /educate|informational|recognition|what is/.test(blob)) goals.push("Educate the audience");
  if (/awareness/.test(blob)) goals.push("Build awareness");
  if (/thought leadership/.test(blob)) goals.push("Build thought leadership");
  return Array.from(new Set(goals));
}

/* ------------------------------------------------------------------ */
/* Heuristic fallback (non-agency text)                               */
/* ------------------------------------------------------------------ */

function extractHeuristic(raw: string, sourceName: string): ExtractedBrief {
  const text = raw.replace(/\r/g, "");
  const lower = text.toLowerCase();
  const out: ExtractedBrief = { isAgency: false, simulated: false, sourceName };

  out.title = field(text, ["title", "main topic", "topic", "working title", "headline"]) || firstHeading(text) || firstLine(text) || cleanName(sourceName);
  out.objective = field(text, ["objective", "goal", "summary", "purpose"]) || undefined;
  const kw = field(text, ["keyword", "keywords", "primary keyword", "seo keyword", "target keyword"]);
  if (kw) { out.seoKeyword = kw.split(/[,;|]/)[0].trim(); out.primaryKeyword = out.seoKeyword; }
  out.cta = field(text, ["cta", "call to action"]) || undefined;

  const pains = field(text, ["pain points", "pain point", "challenges", "problems"]);
  if (pains) out.painPoints = pains.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);

  for (const icp of icpKnowledgeService.list()) {
    if ([icp.label, ...icp.label.split(/[/&]/).map((x) => x.trim())].some((n) => n.length > 2 && lower.includes(n.toLowerCase()))) {
      out.primaryICP = icp.label;
      out.persona = icp.personas.find((p) => lower.includes(p.toLowerCase()));
      break;
    }
  }
  out.industry = inferIndustry(text);
  const tone = TONES.filter((t) => new RegExp(`\\b${escapeRe(t)}\\b`, "i").test(text));
  if (tone.length) out.tone = tone;

  const products = gtmStudioProductService.listProducts().filter((p) => lower.includes(p.displayName.toLowerCase()));
  if (products.length) out.products = products.map((p) => p.slug);

  const intents = inferIntents(lower);
  if (intents.length) out.contentIntent = intents;
  return out;
}

function inferIndustry(text: string): string | undefined {
  const lower = text.toLowerCase();
  return INDUSTRIES.find((i) => lower.includes(i.toLowerCase()) || lower.includes(i.split(/[ ,]/)[0].toLowerCase() + " industry"));
}

function inferIntents(lower: string): ContentIntent[] {
  const hits = new Set<ContentIntent>();
  for (const g of INTENT_GOALS) if (lower.includes(g.label.toLowerCase()) || lower.includes(g.intent)) hits.add(g.intent);
  const kw: [RegExp, ContentIntent][] = [
    [/awareness|educate|explain|what is|guide/, "awareness"],
    [/demand|nurture|consider/, "consideration"],
    [/compare|vs\.?\b|versus|alternative|evaluat/, "evaluation"],
    [/demo|sign up|free trial|convert|purchase|buy/, "conversion"],
    [/retain|onboarding|support|adoption|existing customer/, "retention"],
    [/advoca|referral|review|testimonial/, "advocacy"],
  ];
  for (const [re, intent] of kw) if (re.test(lower)) hits.add(intent);
  return Array.from(hits);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function needsPaste(sourceName: string): ExtractedBrief {
  return { isAgency: false, simulated: true, needsPaste: true, sourceName, title: cleanName(sourceName) };
}

function printableRatio(text: string): number {
  return (text.match(/[\x20-\x7E\s]/g)?.length ?? 0) / Math.max(1, text.length);
}

function field(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`^\\s*(?:[#*\\->]*\\s*)?${escapeRe(label)}\\s*[:\\-–]\\s*(.+)$`, "im");
    const m = text.match(re);
    if (m && m[1].trim()) return m[1].trim().replace(/^["'[]+|["'\]]+$/g, "").trim();
  }
  return undefined;
}

function firstHeading(text: string): string | undefined {
  const m = text.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  return m ? m[1].trim() : undefined;
}

function firstLine(text: string): string | undefined {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line && line.length <= 120 ? line.replace(/^#+\s*/, "") : undefined;
}

function cleanName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
