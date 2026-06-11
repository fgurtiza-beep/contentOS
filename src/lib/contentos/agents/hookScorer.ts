/**
 * Hook & Opening Line Scorer
 * --------------------------
 * Shared by Production Agent (generation-time self-check) and QA Agent
 * (independent catch layer). Scores the opening line of a social post on three
 * criteria (1–3 each) and detects banned patterns. If total < 7 or a banned
 * pattern is hit, generates three higher-scoring alternative opening lines.
 *
 * This is a deterministic stub. In production, the scoring and alternative
 * generation steps would be LLM calls with the same rubric as the system prompt
 * instruction below.
 */

import type { ContentBlock, HookAlternative, HookQAResult } from "../schemas/contentos";

// ---- Banned patterns (auto-score 0) ----------------------------------------

export const BANNED_HOOK_PATTERNS: string[] = [
  "In today's fast-paced world",
  "Did you know",
  "Are you tired of",
  "In the world of",
  "Now more than ever",
  "It's no secret that",
];

// "As a [role]" — variable role, matched by regex
const AS_A_ROLE_RE = /^as an? \w/i;

export function checkBannedPattern(line: string): string | null {
  const lower = line.toLowerCase();
  for (const p of BANNED_HOOK_PATTERNS) {
    if (lower.includes(p.toLowerCase())) return p;
  }
  if (AS_A_ROLE_RE.test(line.trim())) return "As a [role]";
  return null;
}

// ---- Scoring ----------------------------------------------------------------

/**
 * Score one opening line on the three hook criteria.
 * Each dimension returns 1–3; total max is 9.
 *
 * Rubric (mirrors the LLM system-prompt instruction):
 *  Specificity     — real number / stat / named problem vs generic
 *  Pattern Interrupt — would a mid-scroll reader pause?
 *  ICP Relevance   — clearly written for this audience vs anyone
 */
export function scoreHookBreakdown(
  line: string,
  icp = "",
  pain = "",
): { specificity: number; patternInterrupt: number; icpRelevance: number } {
  // Specificity
  const hasNumber = /\d/.test(line);
  const refinesPain = pain.length > 5 && line.toLowerCase().includes(pain.toLowerCase().slice(0, 12));
  const specificity: number = hasNumber ? 3 : refinesPain ? 2 : 1;

  // Pattern interrupt
  const isQuestion = /\?$/.test(line.trim());
  const unusualStart = /^(most |here's|what if|imagine |stop |the truth|turns out)/i.test(line.trim());
  const boringStart  = /^(in |at |the |if you|did you|are you|it's|this is|we |our )/i.test(line.trim());
  const patternInterrupt: number = (isQuestion || unusualStart) ? 3 : boringStart ? 1 : 2;

  // ICP relevance
  const icpWords = icp.split(" ").filter(w => w.length > 3).map(w => w.toLowerCase());
  const mentionsICP = icpWords.length > 0 && icpWords.some(w => line.toLowerCase().includes(w));
  const hrRelevant  = /\b(hr|payroll|compliance|onboard|workforce|hris|dole|bir|sss|philhealth|cutoff|cut-off)\b/i.test(line);
  const icpRelevance: number = (mentionsICP && hrRelevant) ? 3 : (mentionsICP || hrRelevant) ? 2 : 1;

  return { specificity, patternInterrupt, icpRelevance };
}

// ---- Utility ----------------------------------------------------------------

export function extractFirstLine(blocks: ReadonlyArray<Pick<ContentBlock, "kind" | "text">>): string {
  const para = blocks.find(b => b.kind === "paragraph");
  if (!para) return "";
  return para.text.split("\n").find(l => l.trim()) ?? "";
}

// ---- Alternative generation -------------------------------------------------

export function generateHookAlternatives(who: string, pain: string, market: string): HookAlternative[] {
  const painShort = pain.replace(/^(the |a |an )/i, "").toLowerCase() || "manual HR admin";
  const segment   = market.replace("Philippine ", "");
  const roleShort = who.split(" ").slice(-2).join(" ") || "HR Leader";

  const candidates: [string][] = [
    // Stat-style: number + unusual opener + ICP → spec3, pi3, icp3 = 9
    [`Most ${roleShort}s in ${segment} spend 3–5 hours every payroll cycle on ${painShort}. That's not a productivity issue — it's a systems issue.`],
    // Number + question ending + ICP → spec3, pi3, icp3 = 9
    [`What does ${painShort} cost a ${segment} ${roleShort} team each month — 3 hours, 5 hours, more?`],
    // Number (5+) + scenario framing + ICP → spec3, pi2, icp3 = 8
    [`Philippine ${roleShort}s have been managing ${painShort} manually since before HR automation reached most SMEs here. That's 5+ years of spreadsheet debt.`],
  ];

  return candidates.map(([line]) => {
    const bd = scoreHookBreakdown(line, who, pain);
    return {
      line,
      score: bd.specificity + bd.patternInterrupt + bd.icpRelevance,
      breakdown: { specificity: bd.specificity, patternInterrupt: bd.patternInterrupt, icpRelevance: bd.icpRelevance },
    };
  });
}

// ---- Full check (used by QA Agent + store re-check) -------------------------

export function runHookQACheck(
  blocks: ReadonlyArray<Pick<ContentBlock, "kind" | "text">>,
  icp = "",
  pain = "",
): HookQAResult {
  const firstLine        = extractFirstLine(blocks);
  const bannedPatternHit = checkBannedPattern(firstLine);
  const breakdown        = scoreHookBreakdown(firstLine, icp, pain);
  const totalScore       = bannedPatternHit ? 0 : (breakdown.specificity + breakdown.patternInterrupt + breakdown.icpRelevance);
  const pass             = !bannedPatternHit && totalScore >= 7;

  const who    = icp   || "HR Leader";
  const market = pain  ? "Philippine market" : "Philippine market";

  const alternatives: HookAlternative[] = pass ? [] : generateHookAlternatives(who, pain, market);

  return { firstLine, totalScore, breakdown, bannedPatternHit, pass, alternatives };
}
