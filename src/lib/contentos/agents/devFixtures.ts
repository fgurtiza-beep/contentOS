/**
 * Dev fixtures, "simulated" generation for local development.
 * -----------------------------------------------------------
 * These articles were written by Claude (in Claude Code) so the app can show
 * publication-grade output without spending API credits during development.
 * They follow the same editorial standard the live writer uses.
 *
 * In production, /api/generate calls the real Claude API and these fixtures are
 * ignored (the live path takes precedence whenever ANTHROPIC_API_KEY is set).
 *
 * To add a fixture for a new brief: ask Claude Code to write the article, paste
 * it below in the same markdown output format, and add a `match` rule.
 */

import type { StandardizedBrief, QALayerKey, Severity } from "../schemas/contentos";
import { parseArticleToBlocks } from "./editorialPrompt";

interface Fixture {
  id: string;
  match: (b: StandardizedBrief) => boolean;
  markdown: string;
}

const PAYROLL_DECISION_ARTICLE = `# Payroll software vs payroll outsourcing: an SME decision framework
META_TITLE: Payroll software vs payroll outsourcing (PH SME guide)
META_DESC: A practical Philippine SME framework for choosing between payroll software and outsourcing, by team size, budget, compliance load, and operational maturity.

You can usually feel the moment your payroll setup stops fitting. Month-end stretches past the weekend. A BIR notice lands on someone's desk. Two co-founders argue about whether to "just hire a bureau" or "just buy a system." Underneath the noise is a real question, and most of the advice online answers the wrong version of it.

The old debate, in-house versus outsourced, was settled a decade ago. For a Philippine SME today, the choice is between two modern, productized paths: run payroll yourself with capable software, or hand it to a managed service. Both are legitimate. This guide gives you a way to decide which one fits your team, so you can defend the call to a co-founder or your finance lead.

## Why the manual-vs-outsourced question is the wrong question
"Should we do payroll in-house or outsource it?" quietly assumes in-house still means spreadsheets and a stressed admin. That framing is a relic. Almost no growing PH business should be computing withholding tax by hand in 2026, and almost none should be faxing timesheets to a bureau either.

The useful split is software or service. With software, your team keeps the work but the heavy lifting, computations, statutory filings, payslips, is automated. With a managed service, an external team runs the cycle for you on top of a platform. Same destination, different division of labor. Once you see the decision that way, the rest of this article is about matching the division of labor to your situation.

## What is payroll software, in plain Philippine terms
Payroll software is a system that calculates and pays your people, then produces the reports the government expects. A good Philippine-built tool handles gross-to-net automatically: basic pay, overtime, night differential, holiday pay, allowances, deductions, loans, and off-cycle runs.

What separates a serious PH product from a generic one is the statutory layer. It should keep current with SSS, PhilHealth, Pag-IBIG, and BIR tables, and generate the forms you actually file, BIR Form 2316, the Alphalist, and 13th month computations, without you re-checking a circular every quarter. If you want a sense of how often those obligations move, the [BIR](https://www.bir.gov.ph/) updates withholding and year-end requirements regularly, which is exactly the work software is meant to absorb. Our [Philippine business compliance hub](https://sprout.ph/philippines-business-compliance) tracks how these obligations stack up across the year.

## What payroll outsourcing actually means today
Outsourcing used to mean a bureau: you sent hours, they sent back a register, and corrections took days. Modern managed payroll is different. You still hand off the cycle, but it runs on a real platform, with an SLA, a named team, and visibility you can log into.

So the question is not "do I trust a third party with payroll", it's "how much of the operational load do I want to keep." A managed service buys you time and a buffer of expertise. The tradeoff is that you give up some directness: a change you could make yourself in software becomes a request you submit to someone else.

## Software or service: the four decision criteria for a Philippine SME
You can settle this with four honest questions. None of them is about preference, they're about fit.

- **Team size.** Under ~30 employees, software usually wins; the work is light enough that one capable person plus automation handles it. Between 30 and 150, it depends on the next three criteria. Past ~150, the volume and exception-handling often justify a managed service.
- **Budget shape.** Software is a predictable subscription plus your team's hours. A service is a per-employee-per-month fee that absorbs those hours. Compare the total, not the sticker.
- **Compliance load.** Single-site, straightforward operations lean software. Multi-branch operations, dense DOLE rule exposure, or a recent audit finding lean service, where someone is accountable for getting it right.
- **Operational maturity.** If you have a finance or HR person who can own the cycle, software gives you control. If you don't, or that person is already stretched, a service fills the gap without a new hire.

Score yourself across all four. The answer is usually not a tie; one path will hold up better against your real constraints.

## The real difference: control versus delegation
Strip away the marketing and the distinction is simple, control or delegation. Software keeps the controls in your hands; a service puts them in someone else's, in exchange for taking the work off your plate.

That difference shows up in the moments that matter. When an employee disputes a payslip at 4 p.m. before a cutoff, software lets you fix it now; a service means logging a ticket and waiting. When a DOLE inspection or a BIR audit asks for records, control means you can pull them yourself; delegation means your provider is the one who answers. Neither is better in the abstract, but one of them matches how your team likes to work.

## What outsourcing payroll actually costs, and where SMEs get this wrong
The mistake is comparing a subscription price to a per-employee fee and stopping there. The honest cost of running payroll yourself includes the software, the implementation hours, the time your people spend each cycle, and, the line nobody budgets for, the cost of getting it wrong.

A single late or miscalculated statutory remittance can erase a year of subscription savings in penalties and goodwill. A managed service folds that risk into its fee, which is part of what you're paying for. So the right comparison is total cost of ownership over a year, weighed against how much a mistake would actually cost your business. Cheaper-on-paper is not the same as cheaper.

## Where Sprout fits, both paths under one roof
Most vendors push you toward one path because it's the only one they sell. Sprout supports both, which keeps the framework above honest. If you choose software, [Sprout Payroll](https://sprout.ph/product/payroll-management) computes salary, OT, ND, holiday pay, allowances, deductions, loans, and off-cycle payroll automatically. It has built-in PH statutory compliance, with auto-updated BIR, SSS, PhilHealth, Pag-IBIG tables and reports including 2316, Alphalist, and 13th month. If you would rather delegate, [Sprout Payroll Outsourcing](https://sprout.ph/product/payroll-outsourcing) runs the same cycle as a managed service.

One number worth anchoring to: 99.9% payroll accuracy. Whichever path you pick, the goal is the same, which is payroll that's correct, on time, and defensible, and you are not locked into the wrong one because of a vendor's incentives.

## A short side-by-side for the founder who still wants the table
If you'd rather see it at a glance, here's the same decision in one view:

- **Who owns execution:** Software, your team. Service, the provider's team.
- **Control over data and changes:** Software, direct and immediate. Service, by request.
- **Speed of corrections:** Software, minutes. Service, within the SLA.
- **Compliance accountability:** Software, yours, with the tool's help. Service, shared with the provider.
- **Monthly cost shape:** Software, subscription plus your hours. Service, per-employee-per-month.
- **Best fit:** Software, lean teams that want control. Service, teams that want the load off their plate.

### How does payroll outsourcing work?
You agree on a cutoff calendar, hand over attendance and any changes each cycle, and the provider runs the computations, files statutory reports, and produces payslips on a platform you can monitor. You review and approve; they execute. The better the data you hand over, the cleaner the run.

### What is payroll software?
It's a system that automates the math and the filings, gross-to-net pay, statutory contributions, and year-end forms, while your team keeps ownership of the cycle. Think of it as removing the manual computation and compliance work, not the responsibility, so a small team can run payroll accurately without a specialist for every step.

### How do I outsource payroll without losing visibility?
Choose a managed service built on a platform you can log into, and write visibility into the agreement: access to records, a correction SLA, and clarity on who is accountable in an audit. Outsourcing the work doesn't have to mean outsourcing your sightline, modern services are designed to keep you informed even when you're not the one pressing the button.

### Is there free payroll software in the Philippines?
Free tools exist, but they rarely keep pace with PH statutory changes, and the gap shows up at year-end when 2316, the Alphalist, or updated contribution tables don't line up. For a business with real employees and real filings, the cost of a missed obligation usually dwarfs a modest subscription, "free" tends to move the cost rather than remove it.

### Can ChatGPT or AI do payroll?
AI can help you understand a rule or draft a policy, but it shouldn't compute or file your actual payroll. Statutory calculations need a system that's accountable for accuracy and kept current with PH regulations. Use AI to learn; use payroll software or a managed service to run the cycle.

## The bottom line
There's no universally right answer, only the right answer for your team's size, budget, compliance load, and operational maturity. Score yourself honestly across those four, and the choice between software and a service tends to make itself. The businesses that struggle are the ones still arguing about an in-house-versus-outsourced question that stopped being the real one years ago.

CTA: Compare Sprout's software and managed-payroll options side by side to see which path fits your team, no demo booking required.`;

const FIXTURES: Fixture[] = [
  {
    id: "payroll-software-vs-outsourcing",
    match: (b) => {
      const blob = `${b.title} ${b.primaryKeyword ?? ""} ${b.seoKeyword ?? ""} ${b.objective ?? ""}`.toLowerCase();
      return /payroll/.test(blob) && /(outsourc|software|service|decision)/.test(blob);
    },
    markdown: PAYROLL_DECISION_ARTICLE,
  },
];

export function findDevFixture(brief: StandardizedBrief): { blocks: ReturnType<typeof parseArticleToBlocks>; id: string } | null {
  const f = FIXTURES.find((x) => x.match(brief));
  return f ? { blocks: parseArticleToBlocks(f.markdown), id: f.id } : null;
}

/* ------------------------------------------------------------------ */
/* Simulated substantive QA edits                                      */
/* ------------------------------------------------------------------ */
/**
 * Developmental edits a real LLM editor would make on the fixture (passive voice,
 * weak openers, vague phrasing) — beyond what deterministic rules catch. Served
 * only in dev (simulated mode); the live Claude path generates these for real.
 * Each currentText is an EXACT substring of the article so it anchors inline.
 */
export interface SimEdit { currentText: string; suggestedReplacement: string; issueType: string; layer: QALayerKey; severity: Severity; explanation: string; }

const SIMULATED_QA: Record<string, SimEdit[]> = {
  "payroll-software-vs-outsourcing": [
    { currentText: "was settled a decade ago", suggestedReplacement: "ended a decade ago", issueType: "Passive voice", layer: "narrative_readability", severity: "low", explanation: "Passive construction (“was settled”) — use the active, more direct verb so the sentence drives forward." },
    { currentText: "It is tempting to treat this as a single yes/no decision", suggestedReplacement: "Teams treat this as a single yes/no decision", issueType: "Weak opener", layer: "tone_authenticity", severity: "moderate", explanation: "Opening with “It is” buries the subject. Lead with who acts for a more confident, authoritative line." },
    { currentText: "answers the wrong version of it", suggestedReplacement: "answers the wrong question", issueType: "Vague phrasing", layer: "narrative_readability", severity: "moderate", explanation: "“the wrong version of it” is vague — name the thing. “the wrong question” is concrete and sharper." },
    { currentText: "buys you time and a buffer of expertise", suggestedReplacement: "buys you time and expertise", issueType: "Wordy phrasing", layer: "narrative_readability", severity: "low", explanation: "“a buffer of” adds length without meaning; the noun alone is stronger." },
    { currentText: "which is exactly the work software is meant to absorb", suggestedReplacement: "which is precisely what software should absorb", issueType: "Flabby clause", layer: "tone_authenticity", severity: "low", explanation: "Tighten the trailing clause and use a crisper verb for a more expert cadence." },
  ],
};

export function findSimulatedQA(brief: StandardizedBrief): SimEdit[] {
  const f = FIXTURES.find((x) => x.match(brief));
  return f ? SIMULATED_QA[f.id] ?? [] : [];
}
