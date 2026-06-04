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

export function renderExport(job: Job, format: ExportFormat): string {
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
