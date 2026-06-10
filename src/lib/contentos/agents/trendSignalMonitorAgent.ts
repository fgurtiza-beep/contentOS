/**
 * Trend Signal Monitor Agent
 * --------------------------
 * Runs on a weekly schedule. Queries web search (stubbed in prototype) across
 * six keyword categories relevant to Sprout's ICP and market:
 *
 *   1. HR Technology Philippines
 *   2. Payroll Compliance Philippines
 *   3. DOLE / SSS / BIR / PhilHealth Updates
 *   4. B2B SaaS Southeast Asia
 *   5. Workforce Management
 *   6. AI in HR
 *
 * For each signal found: topic name, source, relevance score (0–10 vs Sprout
 * ICP), a one-sentence content angle, and a risk flag for regulatory claims.
 *
 * In production: replace STUB_SIGNALS with live calls to a search API
 * (Perplexity, Bing News, or Google Custom Search) and an LLM scoring pass.
 */

import type {
  TrendDigest,
  TrendSignal,
  TrendSignalCategory,
} from "../schemas/contentos";
import { nextId } from "../util";

// ---------------------------------------------------------------------------
// Stub signal bank — 19 signals across 6 categories
// In production, each category runs a live web search query.
// ---------------------------------------------------------------------------

interface SignalTemplate {
  category: TrendSignalCategory;
  topicName: string;
  source: string;
  sourceUrl: string;
  relevanceScore: number;
  contentAngle: string;
  riskFlag: { hasRisk: boolean; reason: string } | null;
}

const SIGNAL_BANK: SignalTemplate[] = [
  // --- HR Technology Philippines ---
  {
    category: "hr_technology_ph",
    topicName: "AI-powered payroll automation gaining traction among Philippine SMEs",
    source: "HR Tech Philippines",
    sourceUrl: "https://hrtechphilippines.com",
    relevanceScore: 8.5,
    contentAngle: "Position Sprout Payroll as the leading AI-first compliance payroll for PH SMEs by contrasting manual vs. automated annualization error rates.",
    riskFlag: null,
  },
  {
    category: "hr_technology_ph",
    topicName: "HRIS adoption doubles in Philippine mid-market companies — 2026 survey",
    source: "PwC Philippines",
    sourceUrl: "https://pwc.com/ph",
    relevanceScore: 7.5,
    contentAngle: "Use the adoption data as a peg for a 'State of HR Tech PH' LinkedIn thought-leadership post with Sprout as the benchmark.",
    riskFlag: null,
  },
  {
    category: "hr_technology_ph",
    topicName: "Paperless onboarding cuts PH employee ramp time by up to 40%",
    source: "BusinessWorld",
    sourceUrl: "https://businessworld.com.ph",
    relevanceScore: 7.0,
    contentAngle: "Frame Sprout's digital onboarding module as the answer to first-day paperwork burden for HR teams scaling past 100 employees.",
    riskFlag: null,
  },
  // --- Payroll Compliance Philippines ---
  {
    category: "payroll_compliance_ph",
    topicName: "Year-end annualization: December payroll window opens for PH employers",
    source: "BIR Philippines",
    sourceUrl: "https://bir.gov.ph",
    relevanceScore: 9.5,
    contentAngle: "Timely checklist post for Comp & Ben managers on annualization steps, with Sprout's automation highlighted as an error-reduction tool.",
    riskFlag: { hasRisk: true, reason: "Contains specific regulatory deadlines — verify current BIR calendar before publishing." },
  },
  {
    category: "payroll_compliance_ph",
    topicName: "BIR reviewing de minimis benefits ceiling — changes expected mid-year",
    source: "Manila Bulletin",
    sourceUrl: "https://mb.com.ph",
    relevanceScore: 9.0,
    contentAngle: "Publish a FAQ breaking down what the ceiling change means for PH employers and how Sprout's payroll rules engine auto-updates.",
    riskFlag: { hasRisk: true, reason: "Regulatory claim subject to change — do not publish specific figures until BIR issues official advisory." },
  },
  {
    category: "payroll_compliance_ph",
    topicName: "Mixed-rate employee 13th month pay computation — common errors flagged by auditors",
    source: "DOLE Philippines",
    sourceUrl: "https://dole.gov.ph",
    relevanceScore: 8.5,
    contentAngle: "Step-by-step guide on correct mixed-rate annualization, showing how Sprout handles the computation automatically to prevent audit flags.",
    riskFlag: { hasRisk: true, reason: "Specific computation rules — legal review required before publishing." },
  },
  // --- DOLE / SSS / BIR / PhilHealth ---
  {
    category: "dole_sss_bir_philhealth",
    topicName: "PhilHealth contribution rate increase takes effect Q3 2026",
    source: "PhilHealth",
    sourceUrl: "https://philhealth.gov.ph",
    relevanceScore: 9.5,
    contentAngle: "Publish an employer impact brief with the new rate table and a note that Sprout Payroll auto-applies the update on effective date.",
    riskFlag: { hasRisk: true, reason: "Statutory rates — verify official Circular before publishing rate figures." },
  },
  {
    category: "dole_sss_bir_philhealth",
    topicName: "SSS pension reform bill advances in Senate committee",
    source: "Senate of the Philippines",
    sourceUrl: "https://senate.gov.ph",
    relevanceScore: 8.5,
    contentAngle: "Early-mover awareness piece on what pension reform means for employer contributions and long-term workforce planning.",
    riskFlag: { hasRisk: true, reason: "Legislative status — bill has not passed; do not present as enacted law." },
  },
  {
    category: "dole_sss_bir_philhealth",
    topicName: "DOLE issues updated night shift differential computation guidelines",
    source: "DOLE Philippines",
    sourceUrl: "https://dole.gov.ph",
    relevanceScore: 8.0,
    contentAngle: "Explainer post on correct NSD computation using the new guidelines, with Sprout as the compliance guardrail for shift-based teams.",
    riskFlag: { hasRisk: true, reason: "Regulatory content — confirm DOLE advisory number and effectivity date before publishing." },
  },
  {
    category: "dole_sss_bir_philhealth",
    topicName: "BIR Form 2316 deadline extension announced for FY 2025",
    source: "BIR Philippines",
    sourceUrl: "https://bir.gov.ph",
    relevanceScore: 9.0,
    contentAngle: "Alert post: deadline change with a concise employer checklist to stay compliant, published while the window is open.",
    riskFlag: { hasRisk: true, reason: "Deadline claim — verify against official BIR Revenue Memorandum before publishing." },
  },
  // --- B2B SaaS SEA ---
  {
    category: "b2b_saas_sea",
    topicName: "Product-led growth dominates SEA SaaS go-to-market strategies in 2026",
    source: "TechCrunch",
    sourceUrl: "https://techcrunch.com",
    relevanceScore: 5.5,
    contentAngle: "Reframe Sprout's freemium onboarding story as a PLG case study for SEA SaaS audiences at regional events and LinkedIn.",
    riskFlag: null,
  },
  {
    category: "b2b_saas_sea",
    topicName: "Vertical SaaS outperforms horizontal in Philippine mid-market — IDG Asia report",
    source: "IDG Asia",
    sourceUrl: "https://idg.asia",
    relevanceScore: 6.5,
    contentAngle: "Use the data as a peg for a differentiation post on why purpose-built HR software outperforms general-purpose tools for PH companies.",
    riskFlag: null,
  },
  {
    category: "b2b_saas_sea",
    topicName: "SEA SaaS churn spikes as companies tighten software budgets in 2026",
    source: "Tech in Asia",
    sourceUrl: "https://techinasia.com",
    relevanceScore: 5.0,
    contentAngle: "Counter-positioning piece: an ROI calculator post showing the cost of payroll errors vs. Sprout's subscription cost, timed for budget season.",
    riskFlag: null,
  },
  // --- Workforce Management ---
  {
    category: "workforce_management",
    topicName: "Compressed work schedule adoptions up 30% among PH BPOs — DOLE data",
    source: "DOLE Philippines",
    sourceUrl: "https://dole.gov.ph",
    relevanceScore: 7.5,
    contentAngle: "Explainer: how to set up a DOLE-compliant CWS arrangement in Sprout, covering notice periods and timekeeping configuration.",
    riskFlag: null,
  },
  {
    category: "workforce_management",
    topicName: "Philippine employers navigate hybrid WFH gray areas as permanence policies stall",
    source: "BusinessWorld",
    sourceUrl: "https://businessworld.com.ph",
    relevanceScore: 7.0,
    contentAngle: "Position Sprout's flexible timekeeping module as the practical solution for tracking hybrid attendance without a formal WFH law.",
    riskFlag: null,
  },
  {
    category: "workforce_management",
    topicName: "DOLE four-day work week task force releases initial pilot results",
    source: "DOLE Philippines",
    sourceUrl: "https://dole.gov.ph",
    relevanceScore: 7.5,
    contentAngle: "Thought-leadership piece on what a 4-day workweek means for PH payroll, timekeeping, and OT compliance — with Sprout's readiness highlighted.",
    riskFlag: { hasRisk: true, reason: "Pilot results are preliminary — do not present as policy or cite specific productivity figures without source link." },
  },
  // --- AI in HR ---
  {
    category: "ai_in_hr",
    topicName: "AI screening tools face NLRC scrutiny for bias risks in PH hiring decisions",
    source: "Manila Bulletin",
    sourceUrl: "https://mb.com.ph",
    relevanceScore: 6.5,
    contentAngle: "Brand-safe awareness piece on responsible AI in HR, positioning Sprout as the compliance-first alternative to opaque AI hiring tools.",
    riskFlag: { hasRisk: true, reason: "Involves legal and regulatory framing — do not make specific legal claims about competitor tools." },
  },
  {
    category: "ai_in_hr",
    topicName: "HR copilot tools reduce admin workload by 5 hours per week in SEA pilot — Gartner",
    source: "Gartner",
    sourceUrl: "https://gartner.com",
    relevanceScore: 6.0,
    contentAngle: "Data-backed LinkedIn post on AI productivity gains for HR teams, tying the Gartner stat to Sprout's automation features.",
    riskFlag: null,
  },
  {
    category: "ai_in_hr",
    topicName: "AI-assisted performance reviews gain traction in Philippine enterprise HR",
    source: "HR Tech Philippines",
    sourceUrl: "https://hrtechphilippines.com",
    relevanceScore: 6.5,
    contentAngle: "Differentiation piece: how AI can support — not replace — the human manager in performance conversations, with Sprout's approach.",
    riskFlag: null,
  },
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runTrendSignalMonitorAgent(ts: string): TrendDigest {
  const weekOf = getWeekStart(ts);

  // In production: run a search query per category, score results with LLM.
  // In prototype: select signals from the bank, varying by week for freshness.
  const signals = selectSignals(ts);

  return {
    id: nextId("trend"),
    generatedAt: ts,
    weekOf,
    signals,
  };
}

// ---------------------------------------------------------------------------
// Signal selection — rotate a subset each week for variety
// ---------------------------------------------------------------------------

function selectSignals(ts: string): TrendSignal[] {
  const seed = weekSeed(ts);

  return SIGNAL_BANK.map((t, i) => ({
    id: nextId("sig"),
    category:       t.category,
    topicName:      t.topicName,
    source:         t.source,
    sourceUrl:      t.sourceUrl,
    relevanceScore: jitter(t.relevanceScore, seed + i),
    contentAngle:   t.contentAngle,
    riskFlag:       t.riskFlag,
  })).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/** Adds ±0.3 variation to a score based on week seed, keeping it in [1, 10]. */
function jitter(base: number, seed: number): number {
  const delta = ((seed % 7) - 3) * 0.1;
  return Math.min(10, Math.max(1, Math.round((base + delta) * 10) / 10));
}

function weekSeed(ts: string): number {
  const d = new Date(ts);
  return d.getFullYear() * 100 + getWeekNumber(d);
}

function getWeekStart(ts: string): string {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}
