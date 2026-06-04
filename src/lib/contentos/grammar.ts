/**
 * Grammar / clarity / readability engine
 * --------------------------------------
 * Deterministic detection that returns issues with **text offsets**, so the UI
 * can underline the exact word, phrase, or sentence (Grammarly-style) and apply
 * a single fix without touching the rest of the copy. Shared by the floating
 * Copy helper widget and the inline GrammarTextEditor so counts always match.
 *
 * Grounded in the same brand rules the QA Agent uses (Appendix A cliché
 * watchlist) plus common spelling/grammar/punctuation/readability checks.
 */

import { CLICHE_WATCHLIST } from "./data/brandKnowledgeService";

export type IssueType = "Spelling" | "Grammar" | "Punctuation" | "Clarity" | "Readability" | "Tone" | "Style";
/** error = red (grammar/spelling/punctuation) - warn = orange (clarity/readability) - info = blue (style/tone) */
export type IssueSeverity = "error" | "warn" | "info";

export interface Issue {
  id: string;
  start: number;
  end: number;
  text: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  /** Replacement text. null means there is no one-click fix (review only). Empty string means remove. */
  suggestion: string | null;
}

const SPACE = " ";

/** signature used for ignore/dismiss so a hidden issue stays hidden across re-detection */
export function issueSig(i: Issue): string {
  return `${i.type}|${i.text.toLowerCase()}`;
}

const MISSPELLINGS: Record<string, string> = {
  teh: "the", recieve: "receive", recieved: "received", seperate: "separate", definately: "definitely",
  occured: "occurred", occurence: "occurrence", accomodate: "accommodate", existance: "existence",
  priviledge: "privilege", neccessary: "necessary", calender: "calendar", goverment: "government",
  enviroment: "environment", maintainance: "maintenance", succesful: "successful", begining: "beginning",
  beleive: "believe", arguement: "argument", comparision: "comparison", untill: "until", wich: "which",
  thier: "their", payed: "paid", greatful: "grateful", responsibile: "responsible", tommorow: "tomorrow",
  adress: "address", buisness: "business", compatable: "compatible", efficency: "efficiency",
};

const FILLERS = ["very", "really", "just", "actually", "basically", "literally", "simply", "quite"];

function add(list: Issue[], partial: Omit<Issue, "id">) {
  list.push({ id: `${partial.type}-${partial.start}-${partial.end}`, ...partial });
}

function cap(word: string, repl: string): string {
  return /^[A-Z]/.test(word) ? repl.charAt(0).toUpperCase() + repl.slice(1) : repl;
}

export function detectIssues(text: string): Issue[] {
  const issues: Issue[] = [];
  if (!text) return issues;

  // 1) Spelling (common misspellings)
  for (const m of text.matchAll(/\b([A-Za-z]+)\b/g)) {
    const word = m[1];
    const fix = MISSPELLINGS[word.toLowerCase()];
    if (fix && m.index != null) {
      add(issues, { start: m.index, end: m.index + word.length, text: word, type: "Spelling", severity: "error", message: "Possible spelling error.", suggestion: cap(word, fix) });
    }
  }

  // 2) Repeated words ("the the")
  for (const m of text.matchAll(/\b(\w+)(\s+)(\1)\b/gi)) {
    if (m.index != null) add(issues, { start: m.index, end: m.index + m[0].length, text: m[0], type: "Grammar", severity: "error", message: `Repeated word "${m[1]}".`, suggestion: m[1] });
  }

  // 3) Double spaces
  for (const m of text.matchAll(/ {2,}/g)) {
    if (m.index != null) add(issues, { start: m.index, end: m.index + m[0].length, text: m[0], type: "Punctuation", severity: "error", message: "Multiple spaces.", suggestion: SPACE });
  }

  // 4) Space before punctuation
  for (const m of text.matchAll(/\s+([,.;:!?])/g)) {
    if (m.index != null) add(issues, { start: m.index, end: m.index + m[0].length, text: m[0], type: "Punctuation", severity: "error", message: "Space before punctuation.", suggestion: m[1] });
  }

  // 5) Em dashes (brand rule)
  for (const m of text.matchAll(/—/g)) {
    if (m.index != null) add(issues, { start: m.index, end: m.index + 1, text: "—", type: "Style", severity: "info", message: "Em dashes read as AI-generated. Use a comma or period.", suggestion: "," });
  }

  // 6) Clichés / buzzwords (Appendix A watchlist)
  const lower = text.toLowerCase();
  for (const c of CLICHE_WATCHLIST) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(c, from);
      if (idx === -1) break;
      const before = idx === 0 ? " " : text[idx - 1];
      const after = idx + c.length >= text.length ? " " : text[idx + c.length];
      if (/\W/.test(before) && /\W/.test(after)) {
        add(issues, { start: idx, end: idx + c.length, text: text.slice(idx, idx + c.length), type: "Tone", severity: "info", message: `"${c}" is on Sprout's watchlist. Use specific, grounded language.`, suggestion: "" });
      }
      from = idx + c.length;
    }
  }

  // 7) Filler words (clarity)
  for (const w of FILLERS) {
    for (const m of text.matchAll(new RegExp(`\\b${w}\\b`, "gi"))) {
      if (m.index != null) add(issues, { start: m.index, end: m.index + m[0].length, text: m[0], type: "Clarity", severity: "warn", message: `Filler word "${m[0]}". Tighten by removing it.`, suggestion: "" });
    }
  }

  // 8) Long sentences (readability)
  for (const m of text.matchAll(/[^.!?\n]+[.!?]*/g)) {
    const s = m[0];
    if (m.index != null && s.trim().split(/\s+/).length > 30) {
      add(issues, { start: m.index, end: m.index + s.length, text: s.trim().slice(0, 40) + "...", type: "Readability", severity: "warn", message: `This sentence runs ${s.trim().split(/\s+/).length} words. Consider splitting it.`, suggestion: null });
    }
  }

  // 9) Lowercase sentence start (grammar)
  for (const m of text.matchAll(/([.!?]\s+|^\s*)([a-z])/g)) {
    const letterIdx = (m.index ?? 0) + m[1].length;
    add(issues, { start: letterIdx, end: letterIdx + 1, text: m[2], type: "Grammar", severity: "error", message: "Sentence should start with a capital letter.", suggestion: m[2].toUpperCase() });
  }

  return issues.sort((a, b) => a.start - b.start);
}

/** Issues that don't overlap, chosen greedily (errors win ties). */
export function nonOverlapping(issues: Issue[]): Issue[] {
  const weight: Record<IssueSeverity, number> = { error: 0, warn: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => a.start - b.start || weight[a.severity] - weight[b.severity] || b.end - a.end);
  const out: Issue[] = [];
  let lastEnd = -1;
  for (const i of sorted) {
    if (i.start >= lastEnd) { out.push(i); lastEnd = i.end; }
  }
  return out;
}

/** Apply one issue's suggestion at its exact range. Does not touch the rest. */
export function applyIssue(text: string, issue: Issue): string {
  if (issue.suggestion === null) return text;
  const before = text.slice(0, issue.start);
  let after = text.slice(issue.end);
  const repl = issue.suggestion;
  // when removing a word/phrase, also consume one adjacent space to avoid a gap
  if (repl === "" && after.startsWith(" ")) after = after.slice(1);
  return (before + repl + after).replace(/ {2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1");
}

export interface RecoResult { text: string; summary: string[]; changed: boolean; }

/** Apply every one-click fix at once (used by "Suggest reco copy"). */
export function improveCopy(text: string): RecoResult {
  const fixable = detectIssues(text).filter((i) => i.suggestion !== null);
  const chosen = nonOverlapping(fixable).sort((a, b) => b.start - a.start); // right-to-left keeps indices valid
  const counts: Partial<Record<IssueType, number>> = {};
  let t = text;
  for (const i of chosen) {
    t = t.slice(0, i.start) + (i.suggestion ?? "") + t.slice(i.end);
    counts[i.type] = (counts[i.type] ?? 0) + 1;
  }
  t = t.replace(/ {2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/[ \t]+\n/g, "\n").trim();

  const label: Record<IssueType, (n: number) => string> = {
    Spelling: (n) => `Fixed ${n} spelling error${n > 1 ? "s" : ""}.`,
    Grammar: (n) => `Fixed ${n} grammar issue${n > 1 ? "s" : ""}.`,
    Punctuation: (n) => `Fixed ${n} punctuation issue${n > 1 ? "s" : ""}.`,
    Clarity: (n) => `Trimmed ${n} filler word${n > 1 ? "s" : ""}.`,
    Readability: (n) => `Flagged ${n} long sentence${n > 1 ? "s" : ""}.`,
    Tone: (n) => `Removed ${n} cliché${n > 1 ? "s" : ""}.`,
    Style: (n) => `Replaced ${n} em dash${n > 1 ? "es" : ""}.`,
  };
  const summary = (Object.keys(counts) as IssueType[]).map((k) => label[k](counts[k]!));
  return { text: t, summary, changed: t !== text.trim() };
}
