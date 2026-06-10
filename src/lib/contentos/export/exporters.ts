/**
 * Export Layer (placeholders)
 * ---------------------------
 * Renders the approved content into each target format. These are local
 * placeholders that produce a preview string; in production they are replaced by
 * connectors (Google Docs API, HubSpot, etc.).
 *
 * Export is gated by the orchestrator's canExport() check: QA passed, human
 * reviewer approved, or an explicit logged override.
 */

import type { ContentBlock, Draft, ExportFormat, Job } from "../schemas/contentos";
import { JOB_STATE_LABELS, RISK_TIER_LABELS } from "../schemas/contentos";
import { primaryDraft } from "../orchestrator/contentOrchestrator";

function blockToMarkdown(b: ContentBlock): string {
  switch (b.kind) {
    case "h1":
      return `# ${b.text}`;
    case "h2":
      return `## ${b.text}`;
    case "h3":
      return `### ${b.text}`;
    case "cta":
      return `**CTA:** ${b.text}`;
    case "meta":
      return `<!-- ${b.text} -->`;
    case "list":
      return b.text
        .split("\n")
        .map((l) => `- ${l}`)
        .join("\n");
    default:
      return b.text;
  }
}

function draftToMarkdown(d: Draft): string {
  return d.blocks.map(blockToMarkdown).join("\n\n");
}

function draftToHtml(d: Draft): string {
  const body = d.blocks
    .map((b) => {
      if (b.kind === "h1") return `<h1>${esc(b.text)}</h1>`;
      if (b.kind === "h2") return `<h2>${esc(b.text)}</h2>`;
      if (b.kind === "h3") return `<h3>${esc(b.text)}</h3>`;
      if (b.kind === "cta") return `<p><a class="cta" href="#">${esc(b.text)}</a></p>`;
      if (b.kind === "meta") return `<!-- ${esc(b.text)} -->`;
      return `<p>${esc(b.text)}</p>`;
    })
    .join("\n");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(d.title)}</title></head>\n<body>\n${body}\n</body></html>`;
}

/** Render the job-level editor brief for a video-intelligence job. */
export function renderEditorBriefExport(job: Job, format: "markdown" | "html"): string {
  const brief = job.jobEditorBrief;

  if (!brief) return format === "markdown"
    ? "<!-- No editor brief on this job. Approve at least one clip to generate it. -->"
    : "<p>No editor brief on this job. Approve at least one clip to generate it.</p>";

  return format === "markdown" ? brief.markdownExport : brief.pdfHtmlExport;
}

/**
 * Content Calendar CSV — formatted for HubSpot Social bulk scheduling import.
 *
 * HubSpot's required columns (in any order): Account, Date, Message, Link,
 * Photo URL, Campaign. Date format: mm/dd/yy hh:mm.
 * Ref: https://knowledge.hubspot.com/social/bulk-upload-and-schedule-social-posts
 *
 * Hashtags are appended to Message (HubSpot has no separate hashtag field).
 * Two trailing columns (content_format_recommendation, qa_score) are added for
 * reference — HubSpot ignores unrecognised column headers on import.
 *
 * The Account column uses "DisplayName - AccountType" as a placeholder; the user
 * must replace the display-name part with their actual connected HubSpot account
 * name before uploading.
 *
 * Row sources (in priority order):
 *  1. social_production lane  → one row per PlatformPost (richest data)
 *  2. repurposing lane        → one row per social derivative
 *  3. everything else         → single row from primaryDraft
 */

const HUBSPOT_ACCOUNT_TYPE: Record<string, string> = {
  linkedin:  "LinkedIn Page",
  instagram: "Instagram Business Account",
  facebook:  "Facebook Page",
  x:         "Twitter Profile",
};

function toHubSpotAccount(displayName: string, platformKey: string): string {
  const type = HUBSPOT_ACCOUNT_TYPE[platformKey] ?? "Social Account";
  return `${displayName} - ${type}`;
}

/** Converts "YYYY-MM-DD" + "HH:MM" → "mm/dd/yy hh:mm" required by HubSpot. */
function toHubSpotDate(isoDate: string, time: string): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year.slice(2)} ${time || "09:00"}`;
}

export function renderContentCalendarCsv(job: Job): string {
  const qaScore =
    (job.finalQaReport ?? job.qaReport)?.overallScore.toFixed(1) ?? "";

  // HubSpot's 6 columns first, then two reference-only trailing columns.
  const HEADER = [
    "Account",
    "Date",
    "Message",
    "Link",
    "Photo URL",
    "Campaign",
    "content_format_recommendation",
    "qa_score",
  ];
  const rows: string[][] = [HEADER];

  if (job.lane === "repurposing" && job.repurposing) {
    const SOCIAL = new Set(["linkedin", "x", "twitter", "instagram", "facebook"]);
    const pool = job.repurposing.derivatives;
    const target =
      pool.filter((d) => SOCIAL.has(d.channel.toLowerCase())).length
        ? pool.filter((d) => SOCIAL.has(d.channel.toLowerCase()))
        : pool;
    for (const d of target) {
      const copy = d.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text).join(" ");
      const ctaText = d.blocks.filter((b) => b.kind === "cta").map((b) => b.text).join("; ") || job.brief.cta;
      const key = d.channel.toLowerCase() === "twitter" ? "x" : d.channel.toLowerCase();
      rows.push([
        toHubSpotAccount(d.channel, key),
        "",
        copy,
        ctaText,
        "",
        job.brief.campaign || "",
        d.format,
        qaScore,
      ]);
    }
  } else {
    const draft = primaryDraft(job);
    if (draft) {
      const copy = draft.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text).join(" ");
      const ctaText = draft.blocks.filter((b) => b.kind === "cta").map((b) => b.text).join("; ") || job.brief.cta;
      const ch = (job.brief.channel || draft.channel).toLowerCase();
      rows.push([
        toHubSpotAccount(job.brief.channel || draft.channel, ch),
        "",
        copy,
        ctaText,
        "",
        job.brief.campaign || "",
        draft.format,
        qaScore,
      ]);
    }
  }

  return rows
    .map((r) =>
      r.map((cell) => `"${(cell ?? "").replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}

export { toHubSpotDate, toHubSpotAccount };

export function renderExport(job: Job, format: ExportFormat): string {
  // Video-intelligence jobs: primary export is the editor brief collection
  if (job.lane === "video_intelligence") {
    if (format === "markdown") return renderEditorBriefExport(job, "markdown");
    if (format === "html")     return renderEditorBriefExport(job, "html");
  }

  const draft = primaryDraft(job);
  if (!draft) return "// No content available to export.";

  switch (format) {
    case "markdown":
      return draftToMarkdown(draft);

    case "html":
      return draftToHtml(draft);

    case "google_docs":
      return `[Google Docs placeholder]\nWould create a Google Doc titled "${draft.title}" with the following body:\n\n${draftToMarkdown(draft)}`;

    case "hubspot":
      return JSON.stringify(
        {
          connector: "hubspot",
          objectType: job.brief.jobType === "email" ? "marketing_email" : "blog_post",
          name: draft.title,
          campaign: job.brief.campaign || null,
          body_html: draftToHtml(draft),
        },
        null,
        2,
      );

    case "linkedin":
      return draft.blocks
        .filter((b) => b.kind === "paragraph" || b.kind === "cta" || b.kind === "h2")
        .map((b) => (b.kind === "cta" ? `\n👉 ${b.text}` : b.text))
        .join("\n\n");

    case "content_calendar_csv":
      return renderContentCalendarCsv(job);

    case "csv_captions": {
      const rows = [["channel", "format", "caption"]];
      const captions =
        job.lane === "repurposing" && job.repurposing
          ? job.repurposing.derivatives.map((d) => [d.channel, d.format, d.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text).join(" ")])
          : [[draft.channel, draft.format, draft.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text).join(" ")]];
      captions.forEach((c) => rows.push(c));
      return rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    }

    case "json_package":
      return JSON.stringify(
        {
          jobId: job.id,
          title: draft.title,
          state: JOB_STATE_LABELS[job.state],
          riskTier: job.risk ? RISK_TIER_LABELS[job.risk.tier] : null,
          brief: job.brief,
          qa: job.finalQaReport ?? job.qaReport,
          draft,
          sourceMap: job.lane === "production" ? job.production?.sourceMap : job.repurposing?.sourceMap,
        },
        null,
        2,
      );
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
