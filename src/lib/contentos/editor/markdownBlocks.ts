/**
 * Bridge between the store's ContentBlocks (markdown-ish text) and the TipTap
 * WYSIWYG editor (HTML in / ProseMirror JSON out).
 *
 * The editor holds only the article BODY (h1/h2/h3/paragraph/list). SEO meta and
 * the CTA are edited as separate fields, so they round-trip losslessly outside
 * the rich-text surface.
 */

import type { ContentBlock } from "../schemas/contentos";

type Kind = ContentBlock["kind"];
export interface SimpleBlock { kind: Kind; text: string; }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline markdown (+ passthrough <u>/<mark>) → HTML for the editor. */
export function inlineToHtml(md: string): string {
  let s = esc(md);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t, u) => `<a href="${u}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // restore underline/highlight tags that escaping turned into entities
  s = s.replace(/&lt;u&gt;/g, "<u>").replace(/&lt;\/u&gt;/g, "</u>");
  s = s.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
  return s;
}

const bodyKinds: Kind[] = ["h1", "h2", "h3", "paragraph", "list"];
export const isBody = (k: Kind) => bodyKinds.includes(k);

/** Body blocks → an HTML string for TipTap's initial content. */
export function blocksToHtml(blocks: SimpleBlock[]): string {
  const body = blocks.filter((b) => isBody(b.kind));
  let html = "";
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b.kind === "list") {
      html += "<ul>";
      while (i < body.length && body[i].kind === "list") { html += `<li>${inlineToHtml(body[i].text.replace(/^[-*]\s+/, ""))}</li>`; i++; }
      i--;
      html += "</ul>";
      continue;
    }
    const tag = b.kind === "h1" ? "h1" : b.kind === "h2" ? "h2" : b.kind === "h3" ? "h3" : "p";
    html += `<${tag}>${inlineToHtml(b.text) || "<br>"}</${tag}>`;
  }
  return html || "<p></p>";
}

/* ------------------------------------------------------------------ */
/* ProseMirror JSON → body blocks (markdown text)                      */
/* ------------------------------------------------------------------ */

interface PMNode { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; }

function inlineFromNode(node: PMNode | undefined): string {
  if (!node?.content) return node?.text ? applyMarks(node) : "";
  return node.content.map((c) => (c.type === "text" ? applyMarks(c) : c.content ? inlineFromNode(c) : "")).join("");
}

function applyMarks(node: PMNode): string {
  let t = node.text ?? "";
  const marks = node.marks ?? [];
  if (marks.some((m) => m.type === "bold")) t = `**${t}**`;
  if (marks.some((m) => m.type === "italic")) t = `*${t}*`;
  if (marks.some((m) => m.type === "underline")) t = `<u>${t}</u>`;
  if (marks.some((m) => m.type === "highlight")) t = `<mark>${t}</mark>`;
  const link = marks.find((m) => m.type === "link");
  if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
  return t;
}

/** TipTap doc JSON → body SimpleBlocks. */
export function jsonToBlocks(doc: PMNode): SimpleBlock[] {
  const out: SimpleBlock[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "heading") {
      const lvl = (node.attrs?.level as number) ?? 2;
      out.push({ kind: lvl === 1 ? "h1" : lvl === 2 ? "h2" : "h3", text: inlineFromNode(node) });
    } else if (node.type === "paragraph") {
      const t = inlineFromNode(node).trim();
      if (t) out.push({ kind: "paragraph", text: t });
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      for (const li of node.content ?? []) out.push({ kind: "list", text: inlineFromNode(li.content?.[0]) });
    } else if (node.type === "table") {
      out.push({ kind: "paragraph", text: tableToText(node) });
    }
  }
  return out;
}

function tableToText(table: PMNode): string {
  return (table.content ?? []).map((row) => (row.content ?? []).map((cell) => inlineFromNode(cell.content?.[0])).join(" | ")).join("\n");
}
