/**
 * Clip Discovery Agent
 * --------------------
 * Takes VideoTranscriptOutput as its sole content input and produces a ranked
 * list of clip candidates suitable for short-form social distribution.
 *
 * Per-candidate output:
 *   - Timestamp range (sub-range of the source chapter)
 *   - Transcript excerpt
 *   - Clip type: soundbite | insight | story-beat | hook | cta
 *   - Platform fit scores for LinkedIn and Instagram (0–5)
 *   - Risk flag when the excerpt contains product claims or regulatory language
 *
 * Routing contract (enforced by the Orchestrator, not here):
 *   - Flagged clips  → Human Review Queue
 *   - Clean clips    → Clip Approval Queue
 *
 * Execution sequence: chapter segmentation → clip extraction → type assignment
 *   → platform scoring → risk scan → rank & sort.
 */

import type {
  ClipCandidate,
  ClipDiscoveryOutput,
  ClipRiskFlag,
  ClipType,
  QAHandoffPackage,
  RiskTier,
  SourceMapEntry,
  StandardizedBrief,
  VideoTranscriptOutput,
} from "../schemas/contentos";
import { nextId } from "../util";
import { round1 } from "../util";

// ---------------------------------------------------------------------------
// Risk-signal patterns (aligned with riskTiering.ts signals)
// ---------------------------------------------------------------------------

const PRODUCT_CLAIM_RE =
  /\b(pricing|price|cost|per user|per month|security|secure|encrypt|SOC|ISO|compliance|compliant|integration|integrat|API|sync|roadmap|coming soon|uptime|SLA|guarantee|ai capabilit|capabilit)\b/i;

const REGULATORY_RE =
  /\b(DOLE|SSS|BIR|PhilHealth|Pag-IBIG|HDMF|labor code|labor law|Republic Act|R\.A\.|Executive Order|EO \d|regulation|regulatory|mandate|mandatory|penalty|fine|violation|effective date|statute|ordinance|legal(?:ly)?)\b/i;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function runClipDiscoveryAgent(
  transcriptOutput: VideoTranscriptOutput,
  brief: StandardizedBrief,
  riskTier: RiskTier,
  ts: string,
): ClipDiscoveryOutput {
  const candidates = generateCandidates(transcriptOutput, brief);

  // Sort by rankScore descending
  candidates.sort((a, b) => b.rankScore - a.rankScore);

  const flaggedCandidates = candidates.filter((c) => c.riskFlag !== null);
  const cleanCandidates = candidates.filter((c) => c.riskFlag === null);

  const sourceMap: SourceMapEntry[] = [
    {
      ref: transcriptOutput.videoSource.url || transcriptOutput.videoSource.title,
      type: "external_authority",
      anchorText: transcriptOutput.videoSource.title,
      contextNote: `Clip candidates derived from ${transcriptOutput.videoSource.urlType} transcript.`,
    },
  ];

  const qaHandoffPackage: QAHandoffPackage = {
    riskTier,
    productClaims: [],
    factualClaims: [],
    sourceMap,
    references: [transcriptOutput.videoSource.url].filter(Boolean),
  };

  return { candidates, flaggedCandidates, cleanCandidates, qaHandoffPackage };
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

function generateCandidates(
  transcriptOutput: VideoTranscriptOutput,
  brief: StandardizedBrief,
): ClipCandidate[] {
  const { chapters, cleanedTranscript } = transcriptOutput;
  const words = cleanedTranscript.split(/\s+/).filter(Boolean);
  const total = chapters.length;
  const candidates: ClipCandidate[] = [];

  chapters.forEach((chapter, i) => {
    const isFirst = i === 0;
    const isLast = i === total - 1;

    const chapterStartSec = parseTimestamp(chapter.startTime);
    const chapterEndSec = parseTimestamp(chapter.endTime);
    const chapterDuration = Math.max(30, chapterEndSec - chapterStartSec);

    // Word range for this chapter
    const wordStart = Math.floor((i / total) * words.length);
    const wordEnd = Math.floor(((i + 1) / total) * words.length);
    const chapterWords = words.slice(wordStart, wordEnd);

    // --- First clip: opening portion of the chapter ---
    const clip1Type = assignClipType(i, total, 0);
    const clip1Duration = Math.max(15, Math.min(90, Math.round(chapterDuration * 0.38)));
    const clip1Words = chapterWords.slice(0, Math.min(75, Math.floor(chapterWords.length * 0.4)));
    candidates.push(
      buildCandidate(
        i,
        chapterStartSec,
        chapterStartSec + clip1Duration,
        clip1Words.join(" ") || chapter.summary,
        clip1Type,
        brief,
      ),
    );

    // --- Second clip: middle portion (skip for very short chapters or first/last) ---
    if (!isFirst && !isLast && chapterWords.length > 40) {
      const clip2Type = assignClipType(i, total, 1);
      const clip2StartSec = chapterStartSec + Math.round(chapterDuration * 0.45);
      const clip2Duration = Math.max(15, Math.min(60, Math.round(chapterDuration * 0.35)));
      const clip2Words = chapterWords.slice(
        Math.floor(chapterWords.length * 0.45),
        Math.floor(chapterWords.length * 0.45) + Math.min(65, Math.floor(chapterWords.length * 0.35)),
      );
      candidates.push(
        buildCandidate(
          i,
          clip2StartSec,
          clip2StartSec + clip2Duration,
          clip2Words.join(" ") || chapter.summary,
          clip2Type,
          brief,
        ),
      );
    }
  });

  return candidates;
}

function buildCandidate(
  chapterIndex: number,
  startSec: number,
  endSec: number,
  excerpt: string,
  clipType: ClipType,
  brief: StandardizedBrief,
): ClipCandidate {
  const platformFit = scorePlatformFit(clipType, excerpt);
  const riskFlag = detectRisk(excerpt, brief);
  const rankScore = round1(
    (platformFit.linkedin * 0.45 + platformFit.instagram * 0.35 + typeWeight(clipType) * 1.2) / 2,
  );

  return {
    id: nextId("clip"),
    chapterIndex,
    startTime: formatTimestamp(startSec),
    endTime: formatTimestamp(endSec),
    excerpt: excerpt.trim(),
    clipType,
    platformFit,
    rankScore: Math.min(5, rankScore),
    riskFlag,
  };
}

// ---------------------------------------------------------------------------
// Clip type assignment
// ---------------------------------------------------------------------------

function assignClipType(chapterIndex: number, total: number, slot: number): ClipType {
  if (chapterIndex === 0) return slot === 0 ? "hook" : "soundbite";
  if (chapterIndex === total - 1) return slot === 0 ? "cta" : "soundbite";
  // Rotate through insight / soundbite / story-beat for middle chapters
  const mid: ClipType[] = ["insight", "soundbite", "story-beat"];
  return mid[(chapterIndex * 2 + slot) % mid.length];
}

// ---------------------------------------------------------------------------
// Platform fit scoring
// ---------------------------------------------------------------------------

const PLATFORM_BASE: Record<ClipType, { linkedin: number; instagram: number }> = {
  hook:        { linkedin: 4, instagram: 5 },
  insight:     { linkedin: 5, instagram: 2 },
  soundbite:   { linkedin: 4, instagram: 5 },
  "story-beat": { linkedin: 3, instagram: 3 },
  cta:         { linkedin: 2, instagram: 4 },
};

function scorePlatformFit(
  clipType: ClipType,
  excerpt: string,
): { linkedin: number; instagram: number } {
  const base = PLATFORM_BASE[clipType];
  const wordCount = excerpt.split(/\s+/).length;

  // LinkedIn bonus: professional/workplace context signals
  const liBonus = /\b(team|leader|HR|employer|employee|workforce|payroll|compliance|management|strategy|professional|B2B)\b/i.test(excerpt) ? 0.5 : 0;
  // Instagram penalty: long excerpts don't suit short-form
  const igPenalty = wordCount > 60 ? 0.5 : 0;

  return {
    linkedin: Math.min(5, round1(base.linkedin + liBonus)),
    instagram: Math.max(0, round1(base.instagram - igPenalty)),
  };
}

function typeWeight(clipType: ClipType): number {
  return { hook: 5, soundbite: 4.5, insight: 4.5, "story-beat": 3.5, cta: 3 }[clipType];
}

// ---------------------------------------------------------------------------
// Risk detection
// ---------------------------------------------------------------------------

function detectRisk(excerpt: string, brief: StandardizedBrief): ClipRiskFlag | null {
  const reasons: ClipRiskFlag["reasons"] = [];
  const signals: string[] = [];

  // Product claim: keyword pattern match OR product name in excerpt
  const productNameMatch = brief.product && excerpt.toLowerCase().includes(brief.product.toLowerCase());
  if (PRODUCT_CLAIM_RE.test(excerpt) || productNameMatch) {
    reasons.push("product_claim");
    const match = PRODUCT_CLAIM_RE.exec(excerpt);
    signals.push(
      match
        ? `Product claim keyword detected: "${match[0]}".`
        : `Product name "${brief.product}" appears in this clip — verify claim accuracy before publishing.`,
    );
  }

  // Regulatory language
  if (REGULATORY_RE.test(excerpt) || (brief.regulatory && /\b(DOLE|SSS|BIR|regulation)\b/i.test(excerpt))) {
    reasons.push("regulatory_language");
    const match = REGULATORY_RE.exec(excerpt);
    signals.push(
      match
        ? `Regulatory term detected: "${match[0]}". Legal review recommended before publishing.`
        : "Regulatory language detected. Verify compliance before use.",
    );
  }

  return reasons.length > 0 ? { reasons, signals } : null;
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
