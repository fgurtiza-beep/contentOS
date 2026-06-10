/**
 * Video Transcript Agent
 * ----------------------
 * Video Intelligence lane. Accepts a YouTube, Loom, or Vimeo URL, or an
 * uploaded transcript file, then produces:
 *   1. Cleaned transcript text
 *   2. Timestamped chapter segments
 *   3. Executive summary
 *   4. Key takeaways (main topics with bullet points per topic)
 *
 * Input/output contract mirrors the Repurposing Agent pattern:
 *   - Input comes via brief.videoSource (validated before processing)
 *   - Output is VideoTranscriptOutput, which includes a Draft for QA handoff
 *
 * Hard rules enforced here:
 *   - A VideoSource must be present on the brief
 *   - YouTube / Loom / Vimeo sources must supply a non-empty URL
 *   - Transcript content must be non-empty (raw captions or uploaded file)
 *
 * Execution sequence: source validation → platform classification →
 *   transcript cleaning → chapter detection → executive summary →
 *   key takeaways → draft assembly → QA handoff.
 */

import type {
  ContentBlock,
  Draft,
  KeyTakeaway,
  RiskTier,
  SourceMapEntry,
  StandardizedBrief,
  TranscriptChapter,
  VideoSource,
  VideoTranscriptOutput,
} from "../schemas/contentos";
import { block, nextId } from "../util";

export class VideoTranscriptError extends Error {}

export function runVideoTranscriptAgent(
  brief: StandardizedBrief,
  riskTier: RiskTier,
  ts: string,
): VideoTranscriptOutput {
  const src = brief.videoSource;

  // ---- Input validation --------------------------------------------------
  if (!src) {
    throw new VideoTranscriptError(
      "Video Transcript Agent requires a VideoSource on the brief. None provided.",
    );
  }
  if (src.urlType !== "transcript_upload" && !src.url.trim()) {
    throw new VideoTranscriptError(
      `A URL is required for ${src.urlType} sources. Provide the full video URL.`,
    );
  }
  if (!src.transcript.trim()) {
    throw new VideoTranscriptError(
      "Transcript content is empty. Paste the transcript text or upload a .txt / .srt file.",
    );
  }

  // ---- Platform classification -------------------------------------------
  const platform = classifyPlatform(src.url, src.urlType);

  // ---- Stage 1: Clean the raw transcript ---------------------------------
  const cleanedTranscript = cleanTranscript(src.transcript);

  // ---- Stage 2: Detect timestamped chapters ------------------------------
  const chapters = detectChapters(cleanedTranscript, brief, src);

  // ---- Stage 3: Executive summary ----------------------------------------
  const executiveSummary = buildExecutiveSummary(brief, chapters);

  // ---- Stage 4: Key takeaways (topics + bullets) -------------------------
  const keyTakeaways = buildKeyTakeaways(brief, chapters);

  // ---- Stage 5: Assemble draft for QA ------------------------------------
  const draft = buildTranscriptDraft(
    brief,
    src,
    cleanedTranscript,
    chapters,
    executiveSummary,
    keyTakeaways,
    ts,
  );

  const sourceMap: SourceMapEntry[] = [
    {
      ref: src.url || src.title,
      type: "external_authority",
      anchorText: src.title,
      contextNote: `${platform} video transcript (${src.urlType}).`,
    },
  ];

  return {
    videoSource: src,
    riskTier,
    cleanedTranscript,
    chapters,
    executiveSummary,
    keyTakeaways,
    draft,
    sourceMap,
    qaHandoffPackage: {
      riskTier,
      productClaims: [],
      factualClaims: [],
      sourceMap,
      references: [src.url].filter(Boolean),
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function classifyPlatform(url: string, urlType: VideoSource["urlType"]): string {
  if (urlType === "transcript_upload") return "Uploaded transcript";
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("loom.com")) return "Loom";
  if (u.includes("vimeo.com")) return "Vimeo";
  return urlType.charAt(0).toUpperCase() + urlType.slice(1);
}

/** Strip filler words, transcript artifacts, and normalize whitespace. */
function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[(?:inaudible|crosstalk|music|applause|laughter|silence|pause|laugh|noise)\]/gi, "")
    .replace(/\b(um+|uh+|ah+|er+|hmm+|you know,?\s*|I mean,?\s*|sort of,?\s*|kind of,?\s*|basically,?\s*|literally,?\s*|right\?,?\s*|okay so,?\s*)\b/gi, "")
    .replace(/\s([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function detectChapters(
  transcript: string,
  brief: StandardizedBrief,
  src: VideoSource,
): TranscriptChapter[] {
  const words = transcript.split(/\s+/).filter(Boolean);
  const WORDS_PER_MINUTE = 130;
  const estimatedMinutes = src.durationSeconds
    ? Math.round(src.durationSeconds / 60)
    : Math.max(5, Math.round(words.length / WORDS_PER_MINUTE));
  const totalSeconds = estimatedMinutes * 60;

  // 1 chapter per ~4 min; clamp between 3 and 8
  const chapterCount = Math.min(8, Math.max(3, Math.round(estimatedMinutes / 4)));
  const titles = chapterTitles(brief, chapterCount);

  const chapters: TranscriptChapter[] = [];
  for (let i = 0; i < chapterCount; i++) {
    const startSec = Math.round((i / chapterCount) * totalSeconds);
    const endSec = Math.round(((i + 1) / chapterCount) * totalSeconds);
    const wordStart = Math.floor((i / chapterCount) * words.length);
    const wordEnd = Math.floor(((i + 1) / chapterCount) * words.length);
    const segmentText = words.slice(wordStart, Math.min(wordStart + 100, wordEnd)).join(" ");

    chapters.push({
      startTime: formatTimestamp(startSec),
      endTime: formatTimestamp(endSec),
      title: titles[i],
      summary: buildSegmentSummary(segmentText, titles[i], brief, i),
    });
  }

  return chapters;
}

function chapterTitles(brief: StandardizedBrief, count: number): string[] {
  // Opening + closing anchors are always present; middle chapters pull from pain points
  const painDerived = (brief.painPoints ?? [])
    .slice(0, Math.max(0, count - 2))
    .map((p) => toTitleCase(p.length > 50 ? p.slice(0, 47) + "…" : p));

  const middle: string[] = painDerived.length
    ? painDerived
    : ["Core Concepts", "Practical Application", "Common Challenges", "Best Practices", "Real-World Examples"].slice(0, count - 2);

  const pool = [
    "Introduction & Context",
    ...middle,
    "Key Recommendations & Next Steps",
  ];

  // Pad or trim to exactly `count`
  while (pool.length < count) pool.splice(-1, 0, "Deep Dive");
  return pool.slice(0, count);
}

function buildSegmentSummary(
  segmentText: string,
  chapterTitle: string,
  brief: StandardizedBrief,
  index: number,
): string {
  const product = brief.product ? ` and how ${brief.product} addresses this` : "";
  if (index === 0) {
    return `The speaker opens by framing the context around ${brief.objective || chapterTitle}${product}.`;
  }
  // Use the actual segment text words to surface something meaningful
  const preview = segmentText.length > 120 ? segmentText.slice(0, 120) + "…" : segmentText;
  if (preview.trim()) {
    return `${chapterTitle}: ${preview}`;
  }
  return `Covers ${chapterTitle.toLowerCase()}${product}, drawing on real-world examples from the ${brief.industry || "industry"} context.`;
}

function buildExecutiveSummary(brief: StandardizedBrief, chapters: TranscriptChapter[]): string {
  const topic = brief.title || brief.objective || "this video";
  const audience = brief.persona || brief.primaryICP || "practitioners";
  const chapterList = chapters.map((c) => c.title.toLowerCase()).join(", ");
  const product = brief.product ? ` ${brief.product} is highlighted as a solution.` : "";
  return (
    `This video provides ${audience} with a structured walkthrough of ${topic}. ` +
    `Across ${chapters.length} segments, the speaker covers ${chapterList}.` +
    product +
    ` The content is most relevant for teams navigating ${(brief.painPoints ?? []).slice(0, 2).join(" and ") || "operational challenges"} and looking for actionable guidance.`
  );
}

function buildKeyTakeaways(brief: StandardizedBrief, chapters: TranscriptChapter[]): KeyTakeaway[] {
  const painPoints = brief.painPoints?.length ? brief.painPoints : chapters.map((c) => c.title);
  const product = brief.product || "the platform";

  return painPoints.slice(0, 5).map((pain, i) => {
    const bullets: string[] = [
      `${toTitleCase(pain)} is a recurring challenge for ${brief.persona || "teams"} in the ${brief.industry || "sector"}.`,
      `${product} provides structured tooling to reduce manual effort and improve consistency here.`,
    ];
    if (i === 0) {
      bullets.push("Establish a clear process before automating — automation amplifies both good and bad habits.");
    } else if (i === 1) {
      bullets.push("Cross-team alignment early prevents costly rework downstream.");
    } else {
      bullets.push("Start with a pilot; measure impact against a defined baseline before scaling.");
    }
    if (brief.complianceContext) {
      bullets.push(`Compliance requirements (${brief.complianceContext}) must be factored in from the outset.`);
    }
    return { topic: toTitleCase(pain), bullets };
  });
}

function buildTranscriptDraft(
  brief: StandardizedBrief,
  src: VideoSource,
  cleanedTranscript: string,
  chapters: TranscriptChapter[],
  executiveSummary: string,
  keyTakeaways: KeyTakeaway[],
  ts: string,
): Draft {
  const blocks: ContentBlock[] = [];
  let order = 0;

  blocks.push(block(order++, "h1", src.title || brief.title || "Video Intelligence Report"));
  blocks.push(block(order++, "meta", `Source: ${src.urlType}${src.url ? ` · ${src.url}` : ""}`));

  // Executive summary
  blocks.push(block(order++, "h2", "Executive Summary"));
  blocks.push(block(order++, "paragraph", executiveSummary));

  // Chapters
  blocks.push(block(order++, "h2", "Chapter Breakdown"));
  chapters.forEach((ch) => {
    blocks.push(block(order++, "h3", `${ch.startTime}–${ch.endTime}  ${ch.title}`));
    blocks.push(block(order++, "paragraph", ch.summary));
  });

  // Key takeaways
  blocks.push(block(order++, "h2", "Key Takeaways"));
  keyTakeaways.forEach((kt) => {
    blocks.push(block(order++, "h3", kt.topic));
    blocks.push(block(order++, "list", kt.bullets.join("\n")));
  });

  // Cleaned transcript (truncated in draft; full text lives in cleanedTranscript)
  blocks.push(block(order++, "h2", "Cleaned Transcript"));
  const preview = cleanedTranscript.length > 2000
    ? cleanedTranscript.slice(0, 2000) + "\n\n[…transcript continues]"
    : cleanedTranscript;
  blocks.push(block(order++, "paragraph", preview));

  return {
    id: nextId("draft"),
    title: src.title || brief.title || "Video Intelligence Report",
    channel: "video_intelligence",
    format: "transcript_analysis",
    blocks,
    versions: [
      {
        id: nextId("ver"),
        label: "original_draft",
        blocks: blocks.map((b) => ({ ...b })),
        createdAt: ts,
        createdBy: "Video Transcript Agent",
      },
    ],
  };
}

const toTitleCase = (s: string) =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
