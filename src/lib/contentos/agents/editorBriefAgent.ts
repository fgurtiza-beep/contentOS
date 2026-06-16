/**
 * Editor Brief Agent
 * ------------------
 * Accepts the full Job (approved clips + transcript + standardized brief) and
 * produces a single structured editor brief for the entire clip sequence.
 *
 * One brief per job — not one brief per clip. The brief covers:
 *   1. Project Overview
 *   2. Audience & Intent
 *   3. Brand Guidelines
 *   4. Important Links
 *   5. Clip Sequence (Title Card → clips → End Card)
 *   6. Floating Text (conditional)
 *   7. Audio & Music
 *   8. Visual Style Notes
 *   9. Subtitles
 *  10. Editor Checklist
 *
 * Exported as Markdown (primary) and styled HTML (for print-to-PDF).
 */

import type {
  ClipApprovalEntry,
  ClipSequenceRow,
  ClipType,
  EditorBrief,
  FloatingTextRow,
  Job,
} from "../schemas/contentos";
import { nextId } from "../util";

// ---------------------------------------------------------------------------
// Sprout brand defaults (from MKT Brand Book)
// ---------------------------------------------------------------------------

const BRAND = {
  colors: ["#033222", "#dff566", "#31ce13", "#7392e3", "#8139ee", "#a1ec6b", "#eeeeee", "#e8f9f8", "#9364f8", "#fafafa"],
  subtitleFont: "Helvetica Neue",
  subtitleStyle: "White text on semi-transparent dark background box",
  logoNote: "Use official Sprout logo lockup only. Do not alter colors, orientation, or proportions. Minimum clear space = height of the 'S' in Sprout.",
  brandBookUrl: "[Link to MKT Brand Book]",
  assetRepoUrl: "[Link to Logos and Elements Repository]",
};

const DEFAULT_PLATFORMS = [
  { name: "LinkedIn", aspectRatio: "16:9", dimensions: "1920 × 1080" },
  { name: "Instagram Reels", aspectRatio: "9:16", dimensions: "1080 × 1920" },
  { name: "Square (LinkedIn / Facebook)", aspectRatio: "1:1", dimensions: "1080 × 1080" },
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runEditorBriefAgent(job: Job, ts: string): EditorBrief {
  const brief      = job.brief;
  const transcript = job.videoTranscript;
  const videoSource = transcript?.videoSource;

  const approvedEntries = (job.clipApprovalQueue ?? [])
    .filter((e) => e.status === "approved")
    .sort((a, b) => parseTs(a.candidate.startTime) - parseTs(b.candidate.startTime));

  // -- 1. Project Overview --
  const projectTitle    = brief.title || "Video Project";
  const videoType       = inferVideoType(approvedEntries.map((e) => e.candidate.clipType));
  const totalClipSec    = approvedEntries.reduce((sum, e) => sum + Math.max(0, parseTs(e.candidate.endTime) - parseTs(e.candidate.startTime)), 0);
  const targetLengthSec = totalClipSec + 10; // +10 for title/end cards
  const platforms       = DEFAULT_PLATFORMS;

  // -- 2. Audience & Intent --
  const audience = [brief.primaryICP, brief.persona].filter(Boolean).join(" · ") || "Target audience";
  const intent   = brief.contentIntent?.join(", ") || brief.objective || "Drive awareness and engagement";
  const outroCta = brief.cta || "Learn more at sprout.ph";

  // -- 3. Brand Guidelines --
  const brandGuidelinesFound = true;

  // -- 4. Important Links --
  const transcriptUrl = videoSource?.url || "[Add transcript URL]";

  // -- 5. Clip Sequence --
  const clipSequence = buildClipSequence(approvedEntries, brief.cta);

  // -- 6. Floating Text --
  const floatingText = buildFloatingText(approvedEntries);

  // -- 7. Audio & Music --
  const { musicMood, specificTracks, pacingNote, primaryAudioNote } = buildAudio(brief);

  // -- 8. Visual Style Notes --
  const visualStyleNotes = buildVisualStyleNotes(brief);

  // -- 9. Subtitles --
  const subtitleFontName        = BRAND.subtitleFont;
  const subtitleColor           = "White";
  const subtitleBackgroundStyle = "Semi-transparent dark background box";
  const subtitleTiming          = "Manually timed — match speaker cadence precisely. Do not use auto-generated timing.";

  const partial: Omit<EditorBrief, "markdownExport" | "pdfHtmlExport"> = {
    id: nextId("ebrf"),
    generatedAt: ts,
    projectTitle,
    videoType,
    targetLengthSec,
    deadline: "[Add deadline]",
    platforms,
    audience,
    intent,
    outroCta,
    brandColors: BRAND.colors,
    subtitleFont: BRAND.subtitleFont,
    subtitleStyle: BRAND.subtitleStyle,
    logoUsageNote: BRAND.logoNote,
    brandBookUrl: BRAND.brandBookUrl,
    assetRepositoryUrl: BRAND.assetRepoUrl,
    brandGuidelinesFound,
    rawVideoFilesUrl: "[Add raw video files URL]",
    transcriptUrl,
    landingPageUrl: "[Add landing page URL]",
    referenceAssetsUrl: "[Add reference assets URL]",
    inspirationUrl: "[Add inspiration / peg videos URL]",
    clipSequence,
    floatingText,
    musicMood,
    specificTracks,
    pacingNote,
    primaryAudioNote,
    visualStyleNotes,
    subtitleFontName,
    subtitleColor,
    subtitleBackgroundStyle,
    subtitleTiming,
  };

  return {
    ...partial,
    markdownExport: renderMarkdown(partial),
    pdfHtmlExport:  renderPdfHtml(partial),
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function inferVideoType(types: ClipType[]): string {
  if (types.length === 0) return "Compilation";
  const unique = new Set(types);
  if (unique.has("hook") && types.length <= 3) return "Teaser";
  if (unique.has("story-beat")) return "Interview highlights";
  return "Compilation";
}

function buildClipSequence(
  entries: ClipApprovalEntry[],
  cta: string | undefined,
): ClipSequenceRow[] {
  const rows: ClipSequenceRow[] = [];

  rows.push({
    rowType: "title_card",
    clipNumber: null,
    speakerName: "",
    company: "",
    timestampIn: "",
    timestampOut: "",
    soundbite: "",
    visualInstruction: "Animate brand colors in. Hold 3–4 seconds.",
    cardCopy: "[Add title card copy]",
  });

  entries.forEach((entry, i) => {
    const c = entry.candidate;
    rows.push({
      rowType: "clip",
      clipNumber: i + 1,
      speakerName: "[Speaker Name]",
      company: "[Company]",
      timestampIn: normalizeTs(c.startTime),
      timestampOut: normalizeTs(c.endTime),
      soundbite: `"${c.excerpt.replace(/"/g, "'").slice(0, 200)}${c.excerpt.length > 200 ? "…" : ""}"`,
      visualInstruction: visualInstructionFor(c.clipType, i),
      cardCopy: "",
    });
  });

  rows.push({
    rowType: "end_card",
    clipNumber: null,
    speakerName: "",
    company: "",
    timestampIn: "",
    timestampOut: "",
    soundbite: "",
    visualInstruction: "Hold 4–5 seconds. Fade out.",
    cardCopy: cta || "[Add end card CTA copy]",
  });

  return rows;
}

const VISUAL_BY_TYPE: Record<ClipType, (idx: number) => string> = {
  hook:         (_i) => "Open on speaker face. Quick cut to b-roll on second line. Return to speaker for close.",
  insight:      (_i) => "Hold on speaker for the key line. Insert relevant b-roll (data/dashboard) if available. Keep framing tight.",
  soundbite:    (_i) => "Speaker on screen throughout. Mid-shot or close-up. Keep it clean.",
  "story-beat": (_i) => "Match edit pace to speech. Use reaction shots or context b-roll between lines.",
  cta:          (_i) => "Bring brand elements in — logo, primary green. Clean cut to end card immediately after.",
};

function visualInstructionFor(type: ClipType, idx: number): string {
  return VISUAL_BY_TYPE[type]?.(idx) ?? "Hold on speaker. Clean cut.";
}

function buildFloatingText(entries: ClipApprovalEntry[]): FloatingTextRow[] {
  const rows: FloatingTextRow[] = [];
  entries.forEach((entry, i) => {
    const c = entry.candidate;
    if (c.clipType === "insight" || c.clipType === "hook") {
      const words = c.excerpt.split(/\s+/).slice(0, 6).join(" ");
      rows.push({
        clipNumber: i + 1,
        text: `"${words}${c.excerpt.split(/\s+/).length > 6 ? "…" : ""}"`,
        placement: "Lower third — appears 1s after speaker starts, fades before they finish.",
      });
    }
  });
  return rows;
}

function buildAudio(brief: { contentIntent?: string[]; primaryICP?: string }): {
  musicMood: string;
  specificTracks: string;
  pacingNote: string;
  primaryAudioNote: string;
} {
  const isAwareness = brief.contentIntent?.some((i) => i.toLowerCase().includes("aware") || i.toLowerCase().includes("education"));
  return {
    musicMood: isAwareness
      ? "Upbeat, energetic, professional. Corporate but human — not generic elevator music."
      : "Warm, understated, professional. Background presence only.",
    specificTracks: "[Add specific track names or leave blank for editor judgment]",
    pacingNote: "Cuts should follow speech rhythm, not the beat. Do not cut on music hits. Music drops in energy at each clip transition.",
    primaryAudioNote: "Interview audio is primary. Music sits at least 20 dB under speech throughout.",
  };
}

function buildVisualStyleNotes(brief: { primaryICP?: string; smeNotes?: string; mustAvoid?: string[] }): string {
  const lines = [
    "Color grade: warm and natural. Skin tones must be accurate — do not over-saturate.",
    "Motion graphics: minimal. Use only for lower thirds, text cards, and end card.",
    "Transitions: straight cuts only between interview clips. No dissolves or wipes.",
    "B-roll: prioritize workplace / human moments over stock footage.",
  ];
  if (brief.mustAvoid?.length) {
    lines.push(`Avoid: ${brief.mustAvoid.join("; ")}.`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Timestamp utilities
// ---------------------------------------------------------------------------

function parseTs(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(":").map((p) => parseFloat(p));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(ts) || 0;
}

/** Normalizes any timestamp string to HH:MM:SS.mmm */
function normalizeTs(ts: string): string {
  if (!ts) return "00:00:00.000";
  const totalSec = parseTs(ts);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const sInt = Math.floor(s);
  const ms = Math.round((s - sInt) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(sInt)}.${pad3(ms)}`;
}

function pad2(n: number): string { return String(Math.floor(n)).padStart(2, "0"); }
function pad3(n: number): string { return String(Math.floor(n)).padStart(3, "0"); }

function fmtSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

function renderMarkdown(b: Omit<EditorBrief, "markdownExport" | "pdfHtmlExport">): string {
  const date = new Date(b.generatedAt).toISOString().split("T")[0];

  const colorSwatches = b.brandColors.join(" · ");

  const platformTable = [
    "| Platform | Aspect Ratio | Dimensions |",
    "|---|---|---|",
    ...b.platforms.map((p) => `| ${p.name} | ${p.aspectRatio} | ${p.dimensions} |`),
  ].join("\n");

  const linksTable = [
    "| Asset | URL |",
    "|---|---|",
    `| Raw video files | ${b.rawVideoFilesUrl} |`,
    `| Transcript | ${b.transcriptUrl} |`,
    `| Landing page | ${b.landingPageUrl} |`,
    `| Reference assets | ${b.referenceAssetsUrl} |`,
    `| Inspiration / peg videos | ${b.inspirationUrl} |`,
  ].join("\n");

  const seqHeader = "| # | Speaker / Company | In | Out | Sound Bite / Card Copy | Visual Instruction |";
  const seqSep    = "|---|---|---|---|---|---|";
  const seqRows = b.clipSequence.map((row) => {
    if (row.rowType === "title_card") {
      return `| **Title Card** | — | — | — | **${row.cardCopy}** | ${row.visualInstruction} |`;
    }
    if (row.rowType === "end_card") {
      return `| **End Card** | — | — | — | **${row.cardCopy}** | ${row.visualInstruction} |`;
    }
    return `| ${row.clipNumber} | ${row.speakerName} / ${row.company} | \`${row.timestampIn}\` | \`${row.timestampOut}\` | ${row.soundbite} | ${row.visualInstruction} |`;
  });
  const sequenceTable = [seqHeader, seqSep, ...seqRows].join("\n");

  const floatingSection = b.floatingText.length === 0
    ? "_No floating text used in this sequence._"
    : [
        "| Clip # | Text | Placement |",
        "|---|---|---|",
        ...b.floatingText.map((r) => `| ${r.clipNumber} | ${r.text} | ${r.placement} |`),
      ].join("\n");

  const checklist = [
    "- [ ] All timestamps verified against source footage",
    "- [ ] Brand colors used throughout — no off-brand grays or blues",
    "- [ ] Subtitle style applied (Helvetica Neue, white on semi-transparent box)",
    "- [ ] CTA end card included with correct copy",
    "- [ ] All dimensions exported (16:9 · 9:16 · 1:1)",
    "- [ ] File naming followed: `[ProjectTitle]_[Dimension]_v01.mp4`",
  ].join("\n");

  return [
    `# Editor Brief — ${b.projectTitle}`,
    ``,
    `> **Generated:** ${date}`,
    ``,
    `---`,
    ``,
    `## 1. Project Overview`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Project Title | ${b.projectTitle} |`,
    `| Video Type | ${b.videoType} |`,
    `| Target Length | ~${fmtSec(b.targetLengthSec)} |`,
    `| Deadline | ${b.deadline} |`,
    ``,
    `**Platforms:**`,
    platformTable,
    ``,
    `---`,
    ``,
    `## 2. Audience & Intent`,
    ``,
    `**Who this is for:** ${b.audience}`,
    ``,
    `**Intended feel / action:** ${b.intent}`,
    ``,
    `**Outro CTA:** ${b.outroCta}`,
    ``,
    `---`,
    ``,
    `## 3. Brand Guidelines`,
    ``,
    `> ⚠️ Pull from Brand KB before proceeding. Do not use unverified colors or fonts.`,
    ``,
    `**Approved hex codes:** ${colorSwatches}`,
    ``,
    `**Subtitle font:** ${b.subtitleFont} — ${b.subtitleStyle}`,
    ``,
    `**Logo usage:** ${b.logoUsageNote}`,
    ``,
    `**Brand book:** ${b.brandBookUrl}`,
    ``,
    `**Asset repository:** ${b.assetRepositoryUrl}`,
    ``,
    `---`,
    ``,
    `## 4. Important Links`,
    ``,
    linksTable,
    ``,
    `---`,
    ``,
    `## 5. Clip Sequence`,
    ``,
    sequenceTable,
    ``,
    `---`,
    ``,
    `## 6. Floating Text`,
    ``,
    floatingSection,
    ``,
    `---`,
    ``,
    `## 7. Audio & Music`,
    ``,
    `**Mood / genre:** ${b.musicMood}`,
    ``,
    `**Specific tracks:** ${b.specificTracks}`,
    ``,
    `**Pacing note:** ${b.pacingNote}`,
    ``,
    `**Primary audio:** ${b.primaryAudioNote}`,
    ``,
    `---`,
    ``,
    `## 8. Visual Style Notes`,
    ``,
    b.visualStyleNotes,
    ``,
    `---`,
    ``,
    `## 9. Subtitles`,
    ``,
    `**Font:** ${b.subtitleFontName}`,
    ``,
    `**Color:** ${b.subtitleColor}`,
    ``,
    `**Background style:** ${b.subtitleBackgroundStyle}`,
    ``,
    `**Timing:** ${b.subtitleTiming}`,
    ``,
    `---`,
    ``,
    `## 10. Editor Checklist`,
    ``,
    `Before submitting your final export, confirm each item:`,
    ``,
    checklist,
    ``,
    `---`,
    ``,
    `_Generated by ContentOS · EditorBriefAgent · ${date}_`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// PDF/HTML export
// ---------------------------------------------------------------------------

function renderPdfHtml(b: Omit<EditorBrief, "markdownExport" | "pdfHtmlExport">): string {
  const date = new Date(b.generatedAt).toISOString().split("T")[0];

  const colorDots = b.brandColors.map((c) =>
    `<span class="swatch" style="background:${esc(c)}" title="${esc(c)}"></span>`
  ).join(" ");

  const platformRows = b.platforms.map((p) =>
    `<tr><td>${esc(p.name)}</td><td>${esc(p.aspectRatio)}</td><td>${esc(p.dimensions)}</td></tr>`
  ).join("");

  const linkRows = [
    ["Raw video files", b.rawVideoFilesUrl],
    ["Transcript", b.transcriptUrl],
    ["Landing page", b.landingPageUrl],
    ["Reference assets", b.referenceAssetsUrl],
    ["Inspiration / peg videos", b.inspirationUrl],
  ].map(([label, url]) => `<tr><td>${esc(label)}</td><td class="mono">${esc(url)}</td></tr>`).join("");

  const seqRows = b.clipSequence.map((row) => {
    if (row.rowType === "title_card" || row.rowType === "end_card") {
      const label = row.rowType === "title_card" ? "Title Card" : "End Card";
      return `<tr class="card-row"><td colspan="2"><strong>${esc(label)}</strong></td><td colspan="2">—</td><td><strong>${esc(row.cardCopy)}</strong></td><td>${esc(row.visualInstruction)}</td></tr>`;
    }
    return `<tr><td>${row.clipNumber}</td><td>${esc(row.speakerName)}<br><small>${esc(row.company)}</small></td><td class="mono">${esc(row.timestampIn)}</td><td class="mono">${esc(row.timestampOut)}</td><td class="quote">${esc(row.soundbite)}</td><td>${esc(row.visualInstruction)}</td></tr>`;
  }).join("");

  const floatingBody = b.floatingText.length === 0
    ? "<p class=\"muted\"><em>No floating text used in this sequence.</em></p>"
    : `<table><thead><tr><th>Clip #</th><th>Text</th><th>Placement</th></tr></thead><tbody>${
        b.floatingText.map((r) => `<tr><td>${r.clipNumber}</td><td>${esc(r.text)}</td><td>${esc(r.placement)}</td></tr>`).join("")
      }</tbody></table>`;

  const checklistItems = [
    "All timestamps verified against source footage",
    "Brand colors used throughout — no off-brand grays or blues",
    "Subtitle style applied (Helvetica Neue, white on semi-transparent box)",
    "CTA end card included with correct copy",
    "All dimensions exported (16:9 · 9:16 · 1:1)",
    "File naming followed: [ProjectTitle]_[Dimension]_v01.mp4",
  ].map((item) => `<li><span class="checkbox">☐</span> ${esc(item)}</li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Editor Brief — ${esc(b.projectTitle)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #1a1a1a; padding: 32px 40px; max-width: 960px; margin: auto; }
  header { border-bottom: 3px solid #8139ee; padding-bottom: 16px; margin-bottom: 28px; display: flex; align-items: flex-start; justify-content: space-between; }
  header h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; }
  header .meta { color: #6b6b6b; font-size: 12px; margin-top: 6px; }
  .badge { background: #f3eeff; color: #8139ee; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap; margin-top: 4px; }
  .section { margin-bottom: 28px; }
  h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #8139ee; margin: 0 0 10px; border-bottom: 1px solid #e8e5f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th { text-align: left; color: #6b6b6b; font-weight: 600; padding: 5px 8px; background: #f9f8ff; border-bottom: 2px solid #e8e5f0; }
  td { padding: 5px 8px; border-bottom: 1px solid #f0eef8; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .card-row td { background: #f3eeff; font-style: normal; }
  .quote { font-style: italic; color: #444; }
  .mono { font-family: monospace; font-size: 11px; }
  .kv-grid { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; font-size: 12px; }
  .kv-grid .label { color: #6b6b6b; font-weight: 600; padding: 2px 0; }
  .kv-grid .value { padding: 2px 0; }
  .swatch { display: inline-block; width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.1); vertical-align: middle; }
  .brand-warning { background: #fffbec; border-left: 4px solid #f5a623; padding: 8px 12px; border-radius: 4px; font-size: 12px; margin-bottom: 10px; }
  .visual-notes { white-space: pre-line; background: #f9f9f9; border: 1px solid #eee; padding: 10px 14px; border-radius: 4px; font-size: 12px; }
  .checklist { list-style: none; padding: 0; }
  .checklist li { padding: 4px 0; border-bottom: 1px solid #f0eef8; }
  .checklist li:last-child { border-bottom: none; }
  .checkbox { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #888; border-radius: 3px; margin-right: 8px; vertical-align: middle; text-align: center; line-height: 14px; font-size: 12px; }
  .muted { color: #888; font-size: 12px; }
  footer { margin-top: 32px; border-top: 1px solid #e8e5f0; padding-top: 12px; color: #aaa; font-size: 11px; text-align: center; }
  @media print { body { padding: 16px 20px; } .section { page-break-inside: avoid; } }
</style>
</head>
<body>

<header>
  <div>
    <h1>${esc(b.projectTitle)}</h1>
    <div class="meta">Editor Brief · ${esc(b.videoType)} · ~${fmtSec(b.targetLengthSec)} · Generated ${date}</div>
  </div>
  <div class="badge">Deadline: ${esc(b.deadline)}</div>
</header>

<div class="section">
  <h2>1. Project Overview</h2>
  <div class="kv-grid">
    <span class="label">Video type</span><span class="value">${esc(b.videoType)}</span>
    <span class="label">Target length</span><span class="value">~${fmtSec(b.targetLengthSec)}</span>
    <span class="label">Deadline</span><span class="value">${esc(b.deadline)}</span>
  </div>
  <table style="margin-top:12px">
    <thead><tr><th>Platform</th><th>Aspect Ratio</th><th>Dimensions</th></tr></thead>
    <tbody>${platformRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>2. Audience &amp; Intent</h2>
  <div class="kv-grid">
    <span class="label">Who this is for</span><span class="value">${esc(b.audience)}</span>
    <span class="label">Intended feel / action</span><span class="value">${esc(b.intent)}</span>
    <span class="label">Outro CTA</span><span class="value">${esc(b.outroCta)}</span>
  </div>
</div>

<div class="section">
  <h2>3. Brand Guidelines</h2>
  <div class="brand-warning">⚠️ Pull from Brand KB before proceeding. Do not use unverified colors or fonts.</div>
  <div class="kv-grid">
    <span class="label">Approved colors</span><span class="value">${colorDots} <span class="mono" style="font-size:11px">${esc(b.brandColors.join(" · "))}</span></span>
    <span class="label">Subtitle font</span><span class="value">${esc(b.subtitleFont)} — ${esc(b.subtitleStyle)}</span>
    <span class="label">Logo usage</span><span class="value">${esc(b.logoUsageNote)}</span>
    <span class="label">Brand book</span><span class="value mono">${esc(b.brandBookUrl)}</span>
    <span class="label">Asset repository</span><span class="value mono">${esc(b.assetRepositoryUrl)}</span>
  </div>
</div>

<div class="section">
  <h2>4. Important Links</h2>
  <table>
    <thead><tr><th>Asset</th><th>URL</th></tr></thead>
    <tbody>${linkRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>5. Clip Sequence</h2>
  <table>
    <thead><tr><th>#</th><th>Speaker / Company</th><th>In</th><th>Out</th><th>Sound Bite / Card Copy</th><th>Visual Instruction</th></tr></thead>
    <tbody>${seqRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>6. Floating Text</h2>
  ${floatingBody}
</div>

<div class="section">
  <h2>7. Audio &amp; Music</h2>
  <div class="kv-grid">
    <span class="label">Mood / genre</span><span class="value">${esc(b.musicMood)}</span>
    <span class="label">Specific tracks</span><span class="value">${esc(b.specificTracks)}</span>
    <span class="label">Pacing note</span><span class="value">${esc(b.pacingNote)}</span>
    <span class="label">Primary audio</span><span class="value">${esc(b.primaryAudioNote)}</span>
  </div>
</div>

<div class="section">
  <h2>8. Visual Style Notes</h2>
  <div class="visual-notes">${esc(b.visualStyleNotes)}</div>
</div>

<div class="section">
  <h2>9. Subtitles</h2>
  <div class="kv-grid">
    <span class="label">Font</span><span class="value">${esc(b.subtitleFontName)}</span>
    <span class="label">Color</span><span class="value">${esc(b.subtitleColor)}</span>
    <span class="label">Background style</span><span class="value">${esc(b.subtitleBackgroundStyle)}</span>
    <span class="label">Timing</span><span class="value">${esc(b.subtitleTiming)}</span>
  </div>
</div>

<div class="section">
  <h2>10. Editor Checklist</h2>
  <ul class="checklist">${checklistItems}</ul>
</div>

<footer>Generated by ContentOS · EditorBriefAgent · ${date}</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
