/**
 * Editor Brief Agent
 * ------------------
 * Final stage of the video-intelligence path. Accepts a single approved
 * ClipApprovalEntry and generates a structured one-page editor brief.
 *
 * Output fields (all required by the brief spec):
 *   1. Exact in/out timestamps
 *   2. Clip angle and hook framing
 *   3. Strategic description (why this clip, for whom, what it achieves)
 *   4. Recommended text overlay (1–2 lines)
 *   5. Caption draft (ready to post, with hashtags)
 *   6. Aspect ratio and format spec per platform (LinkedIn + Instagram)
 *   7. CTA instruction for the editor
 *
 * The brief is exported as both Markdown (embeddable) and styled HTML
 * (print-to-PDF). Both strings are baked into the EditorBrief struct at
 * generation time so they remain consistent regardless of later data changes.
 *
 * This agent is stateless and deterministic given the same inputs.
 */

import type {
  ClipApprovalEntry,
  ClipType,
  EditorBrief,
  EditorBriefPlatformSpec,
  StandardizedBrief,
  VideoSource,
} from "../schemas/contentos";
import { nextId } from "../util";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runEditorBriefAgent(
  entry: ClipApprovalEntry,
  videoSource: VideoSource,
  brief: StandardizedBrief,
  ts: string,
): EditorBrief {
  const c = entry.candidate;
  const durationSec = parseTs(c.endTime) - parseTs(c.startTime);

  const clipAngle         = buildClipAngle(c.clipType, c.excerpt, brief);
  const strategicDesc     = buildStrategicDescription(c.clipType, c.excerpt, brief, videoSource);
  const textOverlay       = buildTextOverlay(c.clipType, c.excerpt, brief);
  const captionDraft      = buildCaption(c.clipType, c.excerpt, brief, videoSource);
  const platformSpecs     = buildPlatformSpecs(c.clipType, durationSec, brief);
  const ctaInstruction    = buildCtaInstruction(c.clipType, brief);

  const partial: Omit<EditorBrief, "markdownExport" | "pdfHtmlExport"> = {
    id: nextId("ebrf"),
    clipId: c.id,
    generatedAt: ts,
    inPoint: c.startTime,
    outPoint: c.endTime,
    durationSec,
    clipAngle,
    strategicDescription: strategicDesc,
    textOverlay,
    captionDraft,
    platformSpecs,
    ctaInstruction,
  };

  const jobTitle = brief.title || "Video Intelligence Job";

  return {
    ...partial,
    markdownExport: renderMarkdown(partial, jobTitle, videoSource),
    pdfHtmlExport:  renderPdfHtml(partial, jobTitle, videoSource),
  };
}

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

const ANGLE_FRAMES: Record<ClipType, string> = {
  hook:         "Pattern interrupt",
  insight:      "Authority insight",
  soundbite:    "Quotable moment",
  "story-beat": "Narrative momentum",
  cta:          "Conversion close",
};

const ANGLE_GUIDANCE: Record<ClipType, string> = {
  hook:         "Opens with a counterintuitive observation. Goal: stop the scroll in the first 3 seconds.",
  insight:      "Delivers one high-value takeaway for professional audiences. Best placed mid-feed where attention is already captured.",
  soundbite:    "Self-contained and emotionally resonant. Ideal for sharing and quote-style overlays.",
  "story-beat": "Mid-story tension point. Creates a curiosity gap that drives viewers to seek the full video.",
  cta:          "Direct action moment. Use only when the audience has already been warmed up in a prior touchpoint.",
};

function buildClipAngle(type: ClipType, excerpt: string, brief: StandardizedBrief): string {
  const frame    = ANGLE_FRAMES[type];
  const guidance = ANGLE_GUIDANCE[type];
  const subject  = brief.painPoints?.[0] ?? brief.objective ?? "the topic";
  return `${frame} — ${guidance} The clip centres on: "${trunc(excerpt, 80)}" within the context of ${subject}.`;
}

function buildStrategicDescription(
  type: ClipType,
  excerpt: string,
  brief: StandardizedBrief,
  videoSource: VideoSource,
): string {
  const audience = brief.persona || brief.primaryICP || "target audience";
  const product  = brief.product ? ` ${brief.product} is positioned as the solution.` : "";
  const source   = videoSource.title ? ` Source: "${videoSource.title}".` : "";

  const purposeByType: Record<ClipType, string> = {
    hook:         `Creates initial awareness and prompts ${audience} to engage further with the topic.`,
    insight:      `Establishes thought leadership and delivers immediate value to ${audience}.`,
    soundbite:    `Generates organic reach through shareability and emotional resonance with ${audience}.`,
    "story-beat": `Sustains narrative tension and drives ${audience} toward the full-length content.`,
    cta:          `Converts engaged ${audience} into leads or actions at the bottom of the funnel.`,
  };

  return `${purposeByType[type]}${product}${source} Excerpt context: "${trunc(excerpt, 120)}".`;
}

function buildTextOverlay(type: ClipType, excerpt: string, brief: StandardizedBrief): string {
  const words = excerpt.split(/\s+/).filter(Boolean);
  const punchy = words.slice(0, 9).join(" ") + (words.length > 9 ? "…" : "");
  const cta    = brief.cta || "Learn more";

  switch (type) {
    case "hook":
      return `Most ${brief.persona || "teams"} accept this as normal.\nIt doesn't have to be.`;
    case "insight":
      return punchy;
    case "soundbite":
      return `"${punchy}"`;
    case "story-beat":
      return `${punchy}\n[Full story below ↓]`;
    case "cta":
      return `${cta} →\n${brief.product ? brief.product : "See how"}`;
  }
}

const HASHTAG_BANKS: Record<ClipType, string[]> = {
  hook:         ["#HRInsights", "#WorkplaceTruths", "#HRLeadership", "#SproutPH"],
  insight:      ["#HRStrategy", "#WorkforceTips", "#PayrollPH", "#HRLeadership"],
  soundbite:    ["#HRLife", "#WorkplaceWisdom", "#TeamManagement", "#SproutPH"],
  "story-beat": ["#HRStorytime", "#WorkplaceReality", "#SMEPhilippines", "#HRLeadership"],
  cta:          ["#HRSolution", "#PayrollSimplified", "#SproutPH", "#HRTech"],
};

function buildCaption(
  type: ClipType,
  excerpt: string,
  brief: StandardizedBrief,
  videoSource: VideoSource,
): string {
  const opener    = buildTextOverlay(type, excerpt, brief).replace("\n", " ");
  const body      = trunc(excerpt, 160);
  const product   = brief.product ? `\n\nLearn more about ${brief.product}.` : "";
  const videoRef  = videoSource.title ? `\n\n📹 Full video: "${videoSource.title}"` : "";
  const hashtags  = HASHTAG_BANKS[type].join(" ");
  const pain      = brief.painPoints?.[0] ? `#${toHashtag(brief.painPoints[0])}` : "";
  const ctaLine   = brief.cta ? `\n\n👉 ${brief.cta}` : "";

  return `${opener}\n\n${body}${product}${videoRef}${ctaLine}\n\n${hashtags} ${pain}`.trim();
}

// ---------------------------------------------------------------------------
// Platform specs
// ---------------------------------------------------------------------------

function buildPlatformSpecs(
  type: ClipType,
  durationSec: number,
  brief: StandardizedBrief,
): EditorBriefPlatformSpec[] {
  const isShort  = durationSec <= 60;
  const isMedium = durationSec > 60 && durationSec <= 180;
  const isLong   = durationSec > 180;

  const linkedIn: EditorBriefPlatformSpec = {
    platform: "LinkedIn",
    aspectRatio: isShort ? "1:1" : "16:9",
    format: isShort ? "Square video post" : "Landscape video post",
    maxDurationSec: isShort ? 60 : Math.min(durationSec + 10, 600),
    captionCharLimit: 3000,
    notes: isLong
      ? "Clip exceeds 3 min — consider trimming to 90 s for feed. Keep full version for LinkedIn Articles."
      : type === "insight" || type === "hook"
        ? "Lead with text preview in caption. First 2 lines show before 'see more' — make them count."
        : "Auto-captions recommended. Export with burnt-in subtitles as a fallback.",
  };

  const instagram: EditorBriefPlatformSpec = isLong
    ? {
        platform: "Instagram",
        aspectRatio: "16:9",
        format: "IGTV / Instagram Video (trimmed)",
        maxDurationSec: 90,
        captionCharLimit: 2200,
        notes: `Clip is ${durationSec}s — must be trimmed to ≤90 s for Reels. Identify best ${90}-second window with editor.`,
      }
    : {
        platform: "Instagram",
        aspectRatio: "9:16",
        format: isShort ? "Reels" : "Reels (full clip)",
        maxDurationSec: Math.min(durationSec, 90),
        captionCharLimit: 2200,
        notes: isMedium
          ? "Reels up to 3 min are supported but 60–90 s performs best. Add chapter-style cuts if keeping full duration."
          : "Export at 1080 × 1920. Add captions — 85% of Reels are watched without sound.",
      };

  return [linkedIn, instagram];
}

// ---------------------------------------------------------------------------
// CTA instruction
// ---------------------------------------------------------------------------

function buildCtaInstruction(type: ClipType, brief: StandardizedBrief): string {
  const explicitCta = brief.cta;
  const product     = brief.product;

  switch (type) {
    case "hook":
      return "End clip with a single-line question on screen to prompt comments. Do NOT include a product mention here.";
    case "insight":
      return explicitCta
        ? `Overlay "${explicitCta}" as a lower-third in the final 3 seconds.`
        : `Add a lower-third with a link to the full video or related resource in the final 3 seconds.`;
    case "soundbite":
      return "Close with 'Tag someone who needs to hear this' on screen. Drives organic reach through tagging behaviour.";
    case "story-beat":
      return "Bridge to the next clip or full video. On-screen text: 'Watch the full story [link in bio]'.";
    case "cta":
      return explicitCta
        ? `Display "${explicitCta}" prominently over the final 5 seconds. ${product ? `Pair with the ${product} logo lockup.` : ""}`
        : `Direct viewers to the product or resource page. Use a clear, action-first label: "See how →" or "Book a demo →".`;
  }
}

// ---------------------------------------------------------------------------
// Export renderers
// ---------------------------------------------------------------------------

function renderMarkdown(
  b: Omit<EditorBrief, "markdownExport" | "pdfHtmlExport">,
  jobTitle: string,
  videoSource: VideoSource,
): string {
  const dur = fmtDuration(b.durationSec);
  const platformRows = b.platformSpecs.map((ps) =>
    [
      `### ${ps.platform}`,
      `| Field | Value |`,
      `|---|---|`,
      `| Aspect ratio | \`${ps.aspectRatio}\` |`,
      `| Format | ${ps.format} |`,
      `| Max duration | ${ps.maxDurationSec}s |`,
      `| Caption limit | ${ps.captionCharLimit} chars |`,
      `| Notes | ${ps.notes} |`,
    ].join("\n"),
  ).join("\n\n");

  return [
    `# Editor Brief`,
    ``,
    `**Job:** ${jobTitle}  `,
    `**Source:** ${videoSource.title || videoSource.url || "—"} (${videoSource.urlType})  `,
    `**Generated:** ${new Date(b.generatedAt).toISOString().split("T")[0]}  `,
    `**Clip ID:** \`${b.clipId}\``,
    ``,
    `---`,
    ``,
    `## Timestamps`,
    ``,
    `| In | Out | Duration |`,
    `|---|---|---|`,
    `| \`${b.inPoint}\` | \`${b.outPoint}\` | ${dur} |`,
    ``,
    `## Clip Angle`,
    ``,
    b.clipAngle,
    ``,
    `## Strategic Description`,
    ``,
    b.strategicDescription,
    ``,
    `## Recommended Text Overlay`,
    ``,
    b.textOverlay.split("\n").map((l) => `> ${l}`).join("\n"),
    ``,
    `## Caption Draft`,
    ``,
    "```",
    b.captionDraft,
    "```",
    ``,
    `## Platform Specs`,
    ``,
    platformRows,
    ``,
    `## CTA Instruction`,
    ``,
    b.ctaInstruction,
  ].join("\n");
}

function renderPdfHtml(
  b: Omit<EditorBrief, "markdownExport" | "pdfHtmlExport">,
  jobTitle: string,
  videoSource: VideoSource,
): string {
  const dur  = fmtDuration(b.durationSec);
  const date = new Date(b.generatedAt).toISOString().split("T")[0];

  const platformRows = b.platformSpecs.map((ps) => `
    <section class="platform">
      <h3>${esc(ps.platform)}</h3>
      <table>
        <tr><th>Aspect ratio</th><td><code>${esc(ps.aspectRatio)}</code></td></tr>
        <tr><th>Format</th><td>${esc(ps.format)}</td></tr>
        <tr><th>Max duration</th><td>${ps.maxDurationSec}s</td></tr>
        <tr><th>Caption limit</th><td>${ps.captionCharLimit} chars</td></tr>
        <tr><th>Notes</th><td>${esc(ps.notes)}</td></tr>
      </table>
    </section>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Editor Brief — ${esc(jobTitle)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, system-ui, sans-serif; font-size: 13px; line-height: 1.6; color: #1a1a1a; padding: 32px 40px; max-width: 820px; margin: auto; }
  header { border-bottom: 3px solid #8139ee; padding-bottom: 16px; margin-bottom: 24px; }
  header h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; }
  header .meta { color: #6b6b6b; font-size: 12px; margin-top: 6px; display: flex; gap: 24px; flex-wrap: wrap; }
  h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #5b22b8; margin: 22px 0 8px; border-bottom: 1px solid #e8e5f0; padding-bottom: 4px; }
  h3 { font-size: 13px; font-weight: 600; color: #1a1a1a; margin: 12px 0 6px; }
  p, .text { margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: #6b6b6b; font-weight: 600; width: 140px; padding: 4px 8px 4px 0; vertical-align: top; }
  td { padding: 4px 0; vertical-align: top; }
  tr { border-bottom: 1px solid #f0eef8; }
  .ts-table th, .ts-table td { text-align: center; padding: 6px 16px; }
  .ts-table { width: auto; }
  code { background: #f5f3fa; border-radius: 4px; padding: 2px 6px; font-family: monospace; font-size: 12px; }
  .overlay { background: #f8f4ff; border-left: 4px solid #8139ee; padding: 10px 14px; border-radius: 4px; font-style: italic; white-space: pre-wrap; }
  .caption { background: #f5f3fa; border: 1px solid #e8e5f0; border-radius: 6px; padding: 12px; font-size: 12px; white-space: pre-wrap; font-family: monospace; }
  .platform { border: 1px solid #e8e5f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
  .cta-box { background: #e6fce0; border-left: 4px solid #32ce13; padding: 10px 14px; border-radius: 4px; }
  footer { margin-top: 32px; border-top: 1px solid #e8e5f0; padding-top: 12px; color: #9b98a8; font-size: 11px; text-align: center; }
  @media print { body { padding: 16px 24px; } }
</style>
</head>
<body>
<header>
  <h1>Editor Brief</h1>
  <div class="meta">
    <span><strong>Job:</strong> ${esc(jobTitle)}</span>
    <span><strong>Source:</strong> ${esc(videoSource.title || videoSource.url || "—")} (${esc(videoSource.urlType)})</span>
    <span><strong>Generated:</strong> ${date}</span>
    <span><strong>Clip ID:</strong> <code>${esc(b.clipId)}</code></span>
  </div>
</header>

<h2>Timestamps</h2>
<table class="ts-table">
  <tr><th>In</th><th>Out</th><th>Duration</th></tr>
  <tr><td><code>${esc(b.inPoint)}</code></td><td><code>${esc(b.outPoint)}</code></td><td>${esc(dur)}</td></tr>
</table>

<h2>Clip Angle</h2>
<p class="text">${esc(b.clipAngle)}</p>

<h2>Strategic Description</h2>
<p class="text">${esc(b.strategicDescription)}</p>

<h2>Recommended Text Overlay</h2>
<div class="overlay">${esc(b.textOverlay)}</div>

<h2>Caption Draft</h2>
<div class="caption">${esc(b.captionDraft)}</div>

<h2>Platform Specs</h2>
${platformRows}

<h2>CTA Instruction</h2>
<div class="cta-box">${esc(b.ctaInstruction)}</div>

<footer>Generated by ContentOS · EditorBriefAgent · ${date}</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function parseTs(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function trunc(text: string, n: number): string {
  return text.length <= n ? text : text.slice(0, n - 1) + "…";
}

function toHashtag(s: string): string {
  return s.replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
