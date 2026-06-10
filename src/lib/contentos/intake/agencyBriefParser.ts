/**
 * Agency SEO Brief Parser
 * -----------------------
 * Deterministic, heading-driven extraction for the agency content/SEO brief
 * format (Part 1 Foundational strategic analysis + Part 2 Executable content
 * plan). It keys off the exact section headings the agency uses:
 *
 *   1.1 Topic intent analysis        2.1 Title options
 *   1.2 Competitor analysis          2.2 Content outline
 *   1.3 Audience and business goal   2.3 Content specifications
 *   1.4 Key messaging principles     2.4 Keyword analysis table
 *   1.5 Pain points this article must address
 *
 * Deterministic rules run BEFORE any AI interpretation, so the high-value
 * fields (pain points, products, audience, keywords, CTA) extract reliably.
 */

import type { AgencyBriefExtract, CompetitorGap, KeywordRow, OutlineSection, DetectedProduct, TitleOption } from "../schemas/contentos";
import { gtmStudioProductService } from "../data/gtmStudioProductService";

interface Marker { key: string; re: RegExp; }

// Order matters — markers are located then sliced between consecutive hits.
// Headings are matched ANYWHERE (not just line starts) so flattened PDF text —
// where pdfjs joins everything with spaces — still parses.
const MARKERS: Marker[] = [
  { key: "topicIntent", re: /(?:1\.1\s*)?topic intent analysis/i },
  { key: "competitor", re: /(?:1\.2\s*)?competitor analysis/i },
  { key: "audience", re: /(?:1\.3\s*)?audience and business goal/i },
  { key: "messaging", re: /(?:1\.4\s*)?key messaging principles/i },
  { key: "painPoints", re: /(?:1\.5\s*)?pain points this article must address/i },
  { key: "titleOptions", re: /(?:2\.1\s*)?title options/i },
  { key: "outline", re: /(?:2\.2\s*)?content outline/i },
  { key: "specs", re: /(?:2\.3\s*)?content specifications/i },
  { key: "keywords", re: /(?:2\.4\s*)?keyword analysis/i },
];

/** True when the text looks like the agency brief format (≥3 known sections). */
export function isAgencyBrief(text: string): boolean {
  return MARKERS.filter((m) => m.re.test(text)).length >= 3;
}

function sectionSlices(text: string): Record<string, string> {
  const hits = MARKERS.map((m) => {
    const match = m.re.exec(text);
    return match ? { key: m.key, start: match.index + match[0].length, headEnd: match.index } : null;
  }).filter((x): x is { key: string; start: number; headEnd: number } => x !== null)
    .sort((a, b) => a.start - b.start);

  const out: Record<string, string> = {};
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].headEnd : text.length;
    out[h.key] = text.slice(h.start, end).trim();
  });
  return out;
}

export function parseAgencyBrief(raw: string): AgencyBriefExtract {
  const text = raw.replace(/\r/g, "");
  const s = sectionSlices(text);

  const extract: AgencyBriefExtract = {
    topicIntent: s.topicIntent ? clip(s.topicIntent, 600) : undefined,
    searchIntent: detectSearchIntent(s.topicIntent ?? text),
    serpOpportunity: serpOpportunity(s.topicIntent),
    competitorGaps: parseCompetitors(s.competitor ?? ""),
    triggerEvents: triggerEvents(s.audience ?? ""),
    keyMessaging: bulletLeads(s.messaging ?? ""),
    painPoints: bulletLeads(s.painPoints ?? ""),
    titleOptions: parseTitleOptions(s.titleOptions ?? ""),
    outline: parseOutline(s.outline ?? ""),
    keywords: parseKeywords(s.keywords ?? ""),
    secondaryKeywords: [],
    keywordVariations: [],
    paaQuestions: parsePaa(text),
    detectedProducts: detectProducts(text),
    contentAngle: detectAngle(text),
  };

  // Audience block
  if (s.audience) {
    extract.audienceDetails = clip(firstSentences(s.audience, 3), 600);
    extract.companySize = companySize(s.audience);
    extract.geography = /philippine/i.test(s.audience) ? "Philippines" : undefined;
    extract.businessGoal = businessGoal(s.audience);
  }

  // Compliance context — PH statutory signal anywhere in the brief
  if (/\b(SSS|PhilHealth|Pag-?IBIG|BIR|DOLE)\b/i.test(text)) {
    extract.complianceContext = "PH statutory compliance (SSS, PhilHealth, Pag-IBIG, BIR, DOLE)";
  }

  // Keyword roll-ups
  extract.primaryKeyword = extract.keywords.find((k) => k.type === "Primary")?.keyword;
  extract.secondaryKeywords = extract.keywords.filter((k) => k.type === "Secondary").map((k) => k.keyword);
  extract.keywordVariations = extract.keywords.filter((k) => k.type === "Variation").map((k) => k.keyword);

  // Content specifications (2.3)
  if (s.specs) {
    extract.wordCount = wordCount(s.specs);
    extract.productionFormat = sliceBetween(s.specs, "Content Format", ["Schema", "Media", "CTA"]);
    extract.schema = sliceBetween(s.specs, "Schema Markup", ["Media", "CTA"]) ?? sliceBetween(s.specs, "Schema", ["Media", "CTA"]);
    extract.media = sliceBetween(s.specs, "Media", ["CTA"]);
    extract.ctaText = sliceBetween(s.specs, "CTA", []) ?? extract.ctaText;
  }

  // FAQ + CTA + product-mention/proof rules pulled from the outline/whole text
  extract.faqRequirements = faqRequirements(s.outline ?? text);
  extract.ctaText = extract.ctaText ?? ctaText(text);
  extract.ctaType = detectCtaType(`${extract.ctaText ?? ""} ${text}`);
  extract.productMentionRules = productMentionRules(text);
  extract.proofRequirements = proofRequirements(text);
  extract.positioning = positioning(s.topicIntent);

  return extract;
}

/* ------------------------------------------------------------------ */
/* Section parsers                                                    */
/* ------------------------------------------------------------------ */

function detectSearchIntent(t: string): string | undefined {
  if (/commercial[- ]investigation/i.test(t)) return "Commercial investigation";
  if (/transactional/i.test(t)) return "Transactional";
  if (/navigational/i.test(t)) return "Navigational";
  if (/informational/i.test(t)) return "Informational";
  return undefined;
}

function serpOpportunity(topicIntent?: string): string | undefined {
  if (!topicIntent) return undefined;
  const sentences = splitSentences(topicIntent);
  const hit = sentences.find((x) => /SERP|AI Overview|Google reads|People-Also-Ask|decision-framework intent/i.test(x));
  return hit ? hit.trim() : clip(topicIntent, 280);
}

function positioning(topicIntent?: string): string | undefined {
  if (!topicIntent) return undefined;
  const hit = splitSentences(topicIntent).find((x) => /gap this article fills|primary job is/i.test(x));
  return hit?.trim();
}

function parseCompetitors(section: string): CompetitorGap[] {
  if (!section) return [];
  const urlRe = /([a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s|]*)?)/gi;
  const matches = Array.from(section.matchAll(urlRe));
  const gaps: CompetitorGap[] = [];
  for (let i = 0; i < matches.length; i++) {
    const url = matches[i][1].replace(/[.,;]+$/, "");
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? section.length : section.length;
    const analysis = section.slice(start, end).replace(/\s+/g, " ").trim();
    if (url.includes("/") || analysis.length > 20) gaps.push({ url, analysis: clip(analysis, 320) });
  }
  return gaps.slice(0, 8);
}

function triggerEvents(audience: string): string[] {
  const m = audience.match(/(?:re-evaluating\s+)?because\s+([^.]+)\./i);
  if (!m) return [];
  return m[1]
    .split(/,|\bor\b/i)
    .map((x) => x.replace(/^(the|a|an)\s+/i, "").trim())
    .filter((x) => x.length > 3)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}

function companySize(audience: string): string | undefined {
  const m = audience.match(/between\s+(\d[\d,]*)\s+and\s+(\d[\d,]*)\s+employees/i) || audience.match(/(\d[\d,]*)\s*(?:to|–|-)\s*(\d[\d,]*)\s+employees/i);
  return m ? `${m[1]}–${m[2]} employees` : undefined;
}

function businessGoal(audience: string): string | undefined {
  const hit = splitSentences(audience).find((x) => /\b(MQL|conversion|business goal|article's job)\b/i.test(x));
  return hit?.trim();
}

function parseTitleOptions(section: string): TitleOption[] {
  if (!section) return [];
  const seen = new Set<string>();
  const titles: TitleOption[] = [];
  // The title sits after the angle descriptor; split on newlines and sentence
  // breaks, then keep the topic-bearing segment from each row.
  for (const segment of section.split(/\n|(?<=[a-z.])\.\s+(?=[A-Z])/)) {
    const t = segment.replace(/\s+/g, " ").trim();
    if (t.length < 25 || t.length > 140) continue;
    if (/^(angle|title)\b/i.test(t)) continue;
    if (/^(decision-framework|reframe-first|icp-specific|primary keyword|contrarian|names the)/i.test(t)) continue;
    if (!/payroll/i.test(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push({ title: t });
  }
  return titles.slice(0, 5);
}

// A row starts with a marker (H1/H2/H3/Intro/FAQ/CTA), an optional colon, then
// whitespace and a heading/direction. The trailing `[A-Z0-9]` requirement avoids
// false splits on mid-sentence mentions like "Primary keyword in H1." (a period,
// not whitespace, follows the marker there). Note: the previous version required a
// word boundary AFTER "H2:" — but a colon-then-space has no \b, so every H2 row
// failed to split and the whole outline collapsed to H1/Intro/FAQ/CTA.
const OUTLINE_MARKER = /\b(?:H1|H2|H3|Intro|FAQ|CTA):?\s+[A-Z0-9]/;
const DIRECTION_START = /\b(Open with|Spine of|Name the|One compact|Reframe cost|Distinguish|Note SaaS|\d{2,3}\s+to\s+\d{2,3}\b)/i;

function parseOutline(section: string): OutlineSection[] {
  if (!section) return [];
  const out: OutlineSection[] = [];
  const parts = section.split(new RegExp(`(?=${OUTLINE_MARKER.source})`));
  for (const part of parts) {
    const p = part.replace(/\s+/g, " ").trim();
    const mm = p.match(/^(H1|H2|H3|Intro|FAQ|CTA):?\s+(.*)$/i);
    if (!mm) continue;
    const marker = mm[1].toUpperCase();
    const rest = mm[2].trim();
    if (marker === "H2" || marker === "H3") {
      const cut = rest.search(DIRECTION_START);
      const heading = (cut > 0 ? rest.slice(0, cut) : rest.split(/\.\s/)[0]).trim();
      const dir = (cut > 0 ? rest.slice(cut) : rest).trim();
      if (heading) out.push({ heading: clip(heading, 110), writingDirection: clip(dir, 360) });
    } else {
      // Keep the marker as the heading so the generator routes H1/Intro/FAQ/CTA
      // specially (they are not body sections).
      out.push({ heading: marker === "INTRO" ? "Intro" : marker, writingDirection: clip(rest, 360) });
    }
    if (out.length >= 18) break;
  }
  return out;
}

function parseKeywords(section: string): KeywordRow[] {
  if (!section) return [];
  const cleaned = section.replace(/Keyword\s+Type\s+Volume\s+KD\s+PAA\s*\(y\/n\)/i, " ").replace(/\s+/g, " ");
  const rowRe = /([a-z][a-z0-9 '/().-]+?)\s+(Primary|Secondary|Variation)\s+((?:No PH data|[\d,]+))\s+(n\/a|\d+)\s+(y|n)\b/gi;
  const rows: KeywordRow[] = [];
  for (const m of cleaned.matchAll(rowRe)) {
    const keyword = m[1].replace(/\b(PAA|Volume|KD|Type)\b/gi, "").replace(/^(?:table|analysis|keyword)\s+/i, "").trim();
    if (keyword.length < 3) continue;
    rows.push({ keyword, type: m[2] as KeywordRow["type"], volume: m[3], kd: m[4], paa: /y/i.test(m[5]) });
  }
  return rows;
}

function parsePaa(text: string): string[] {
  const m = text.match(/Include:\s*([^.]+?)\./i);
  if (m) {
    return m[1].split(/,|\band\b/i).map((x) => x.trim()).filter((x) => x.length > 6).slice(0, 12);
  }
  return [];
}

function faqRequirements(t: string): string | undefined {
  const m = t.match(/FAQ\s+([^]*?)(?=\bCTA\b|$)/i);
  if (!m) return undefined;
  return clip(m[1].replace(/\s+/g, " ").trim(), 320);
}

function ctaText(text: string): string | undefined {
  const hit = splitSentences(text).find((x) => /Validation-framed|validation CTA|next steps for evaluation/i.test(x));
  return hit?.trim();
}

function detectCtaType(t: string): string | undefined {
  if (/validation/i.test(t)) return "Validation";
  if (/no demo|not a demo|no cta/i.test(t) && !/demo booking|book a demo/i.test(t)) return "Validation";
  if (/demo/i.test(t)) return "Demo";
  if (/download|guide|report|checklist/i.test(t)) return "Download";
  if (/consultation|walkthrough/i.test(t)) return "Consultation";
  if (/newsletter|subscribe/i.test(t)) return "Newsletter";
  if (/evaluation/i.test(t)) return "Product evaluation";
  return undefined;
}

function detectAngle(text: string): string | undefined {
  if (/decision[- ]framework/i.test(text)) return "Decision framework";
  if (/reframe/i.test(text)) return "Reframe-first";
  if (/buyer guide|buying guide/i.test(text)) return "Buyer guide";
  if (/compliance-led|compliance led/i.test(text)) return "Compliance-led";
  if (/comparison|\bvs\b/i.test(text)) return "Comparison";
  if (/thought leadership/i.test(text)) return "Thought leadership";
  return undefined;
}

function productMentionRules(text: string): string | undefined {
  const parts = splitSentences(text)
    .filter((x) => /one (?:contextual )?Sprout mention|Stage rule|No repeated pitch|one Sprout placement|validation CTA, not a demo/i.test(x))
    .map((x) => x.split(/\b(?:\d+\.\d+\s|Part \d|pain points this article|key messaging principles|article must address)/i)[0].replace(/\s+/g, " ").trim())
    .filter((x) => x.length > 8 && !/^(part|section)\s+\d/i.test(x));
  return parts.length ? clip(Array.from(new Set(parts)).slice(0, 3).join(" "), 320) : undefined;
}

function proofRequirements(text: string): string | undefined {
  const hit = splitSentences(text).find((x) => /one proof point|proof anchor|one proof, one placement/i.test(x));
  return hit?.replace(/\s+/g, " ").trim();
}

function wordCount(specs: string): string | undefined {
  const m = specs.match(/([\d,]+)\s*(?:to|–|-)\s*([\d,]+)\s*words/i);
  return m ? `${m[1]}–${m[2]} words` : undefined;
}

/* ------------------------------------------------------------------ */
/* Product detection (#2)                                             */
/* ------------------------------------------------------------------ */

function detectProducts(text: string): DetectedProduct[] {
  const gtm = gtmStudioProductService.listProducts();
  const found = new Map<string, DetectedProduct>();

  // Named "Sprout X" entities (covers "Sprout Payroll Management", "Sprout Managed Payroll").
  for (const m of text.matchAll(/\bSprout\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}/g)) {
    const name = m[0].replace(/\s+/g, " ").trim();
    if (/^Sprout (Solutions|HR|Payroll|Managed|Sidekick)$/i.test(name) && name.split(" ").length < 2) continue;
    const slug = gtm.find((p) => name.toLowerCase().includes(p.displayName.toLowerCase()))?.slug;
    upsert(found, name, slug, "named in brief body");
  }
  // Direct GTM display-name mentions.
  for (const p of gtm) {
    if (new RegExp(`\\b${escapeRe(p.displayName)}\\b`, "i").test(text)) upsert(found, p.displayName, p.slug, "product name");
  }
  // Product URLs.
  if (/sprout\.ph\/product\/payroll-management/i.test(text)) upsert(found, "Sprout Payroll Management", "sprout-payroll", "link: sprout.ph/product/payroll-management/");
  if (/sprout\.ph\/managed-services/i.test(text)) upsert(found, "Sprout Managed Payroll", undefined, "link: sprout.ph/managed-services/");

  return Array.from(found.values());
}

function upsert(map: Map<string, DetectedProduct>, name: string, slug: string | undefined, source: string) {
  const key = name.toLowerCase();
  const existing = map.get(key);
  if (existing) {
    if (!existing.slug && slug) { existing.slug = slug; existing.mapped = true; }
    return;
  }
  map.set(key, { name, slug, mapped: Boolean(slug), source });
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

function bulletLeads(section: string): string[] {
  if (!section) return [];
  const isHeading = (x: string) =>
    /^(part|section)\s+\d/i.test(x) ||
    /^\d+(\.\d+)?\s/.test(x) ||
    /^(resolved|see section|covered in|addressed in)\b/i.test(x); // cross-references, not leads

  // Primary: split on bullet markers or line starts (works for paste / PDFs with
  // line structure). Each bullet's lead is the phrase before its first period.
  const chunks = section
    .split(/\n?\s*[●•◦▪*]\s+|\n(?=[A-Z])/)
    .map((x) => x.trim())
    .filter((x) => x.length > 3 && !/^[0-9.]+\s/.test(x));
  const leads = chunks
    .map((c) => c.split(/\.\s|:\s|\.$/)[0].replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 4 && x.length <= 90 && !isHeading(x));
  if (Array.from(new Set(leads)).length >= 2) return Array.from(new Set(leads)).slice(0, 12);

  // Fallback for fully-flattened text (no bullets, no line breaks): the bold
  // leads are short sentences; explanations are long. Keep the short ones.
  const shortLeads = section
    .split(/(?<=[.!?])\s+(?=[A-Z'])/)
    .map((s) => s.replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim())
    .filter((s) => { const w = s.split(/\s+/).length; return w >= 2 && w <= 8 && /^[A-Z]/.test(s) && !isHeading(s); });
  return Array.from(new Set(shortLeads)).slice(0, 12);
}

function sliceBetween(text: string, label: string, nextLabels: string[]): string | undefined {
  const start = text.search(new RegExp(escapeRe(label), "i"));
  if (start < 0) return undefined;
  const after = text.slice(start + label.length).replace(/^[\s:|-]+/, "");
  let end = after.length;
  for (const n of nextLabels) {
    const idx = after.search(new RegExp(escapeRe(n), "i"));
    if (idx >= 0 && idx < end) end = idx;
  }
  const val = after.slice(0, end).replace(/\s+/g, " ").trim();
  return val.length > 1 ? clip(val, 320) : undefined;
}

function splitSentences(t: string): string[] {
  return t.split(/(?<=[.!?])\s+(?=[A-Z'])/).map((x) => x.trim()).filter(Boolean);
}

function firstSentences(t: string, n: number): string {
  return splitSentences(t).slice(0, n).join(" ");
}

function clip(t: string, max: number): string {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trim() + "…" : s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
