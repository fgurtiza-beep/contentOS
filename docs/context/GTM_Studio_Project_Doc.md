# GTM Studio — Project Documentation

**Owner:** Java, Product Marketing Lead, Sprout Solutions
**Status:** v1 — for ExeCom review
**Last updated:** April 30, 2026
**Prototype:** `gtm_studio.html` (clickable HTML)
**Production target:** Vercel web app, Sprout SSO, Postgres on Vercel

---

## 1. For the engineer picking this up

Before you touch any code, here are the five things that matter most. Everything else flows from these.

**1. The user is a Product Marketer, not an analyst.** The whole product hinges on the reviewer being able to disagree with the AI quickly. Every AI output needs three things visible without clicking: a confidence score, source tags, and a way to push back. If you find yourself building a screen where the user just reads what AI produced, you've drifted off-spec. Keep "human decides" at the front of every gate.

**2. Source tagging is functional, not decorative.** Every chip that shows a source ("HubSpot 47 deals", "CSM Apr 18", "Win wires 4") must be clickable in the Vercel build. Clicking opens the underlying record in HubSpot, the Win Wires Google Doc, the CSM observations Notion page, or the relevant artifact. If you can't make a chip clickable to its real source, the chip should not render. This is the audit trail and it's how PRMKT trusts the output.

**3. The 8 steps are sequential for new GTMs, jumpable for revisions.** A net-new GTM walks through Steps 1 → 8 in order. Each step's "advance" is gated by a human approval. Once a brief reaches Step 8 once, the user can jump to any prior step from the stepper to revise. Refinement mode is a special re-entry path on completed briefs that diffs old vs. new with a changelog. Don't collapse these three modes into one — they have different state machines.

**4. Quick Tools are first-class, not utilities.** The six Quick Tools (TAM SAM SOM, VRIO, Big Idea Generator, Messaging Stress-test, Win/Loss Quick Read, Persona Pressure-test) are standalone surfaces with their own URLs and routing. They share components with the main workflow (variants, confidence chips, source tags) but don't share state. PRMKT-ers use them between formal GTMs, often without ever entering the workflow. Treat them as their own product surface.

**5. The five future integrations are placeholders, not commitments.** v2 ships with manual fallbacks for everything except HubSpot MCP. Wiring up Competitive Intelligence Hub, Customer Proof Hub, Social Listening Agent, SEO Reporting, and PRMKT Dashboard is v3 work and the dates are not locked. Build the ingestion layer abstractly enough that swapping a manual paste for a live feed is a config change, not a re-architecture.

---

## 2. Problem and scope

### The problem

PRMKT develops GTM strategies for every product launch and major feature release. Today the process suffers from two compounding bottlenecks.

Input gathering is slow and inconsistent. Pulling HubSpot data, surfacing win and loss themes, scanning competitor signals, and synthesizing field insights is manual, varies by person, and often gets shortcut under deadline pressure.

Synthesis-to-positioning is uneven. Even when team members get to the right inputs, framing the Big Idea, CVP, and Messaging House requires fundamentals not everyone has fully internalized yet. Output quality varies depending on who runs the GTM, not on the strength of the underlying data.

The result: GTM strategy work is slower than it should be, output quality is inconsistent across the team, and ExeCom sees uneven strategic depth across launches.

### What GTM Studio solves

A guided AI-powered workspace that takes a Product Marketer through Phase 2 of the GTM Process — from Market Insights to Messaging Architecture — with structured inputs, data-grounded synthesis, and human review gates at every step. Plus a standalone Win/Loss Intelligence module that surfaces product-specific patterns on demand, and six Quick Tools for spot work.

The tool informs and accelerates. The human Product Marketer decides.

### Design principle

**Human Product Marketer-led, AI-powered.** Every output is reviewed and shaped by a human before it advances. AI synthesizes data weight; humans bring field truth, hypothesis, and empathy. The product makes it easy to disagree.

### What's in scope

**GTM Workflow — 8 steps:**
1. Market Insights (trends, regulatory, AI, productivity gaps)
2. Competitive Landscape (top competitors, positioning gaps, why we win)
3. Consumer Insight (what the buyer really feels and believes)
4. Product Truth (what is uniquely true about our product)
5. Big Idea (intersection of Insight × Truth × Market Realities)
6. CVP and Positioning (core value proposition + main positioning)
7. Messaging House (primary message, pillars, proof points)
8. Messaging Architecture (TOFU / MOFU / BOFU)

**Win/Loss Intelligence module** — standalone, filterable by product, segment, time, headcount, pipeline. Feeds Workflow Step 2 and Workflow Step 1 (Market Insights). Reusable for QBR.

**Six Quick Tools** — TAM SAM SOM Generator, VRIO Stress-test, Big Idea Generator, Messaging Stress-test, Win/Loss Quick Read, Persona Pressure-test.

**Refinement mode** — re-entry path on completed briefs with side-by-side diffs and changelog.

### What's out of scope

GTM Process Phases 1, 3, 4, 5, 6. Phase 1 outputs (Discover Memo, Product Walkthrough, ICP) are required attachments before Workflow Step 1 unlocks but are not produced inside the tool. Phases 3–6 are downstream cascades handled by Sales Enablement and Marcom.

Asset production (decks, brochures, landing pages, copy) is downstream Marcom work. GTM Studio produces the brief that informs those assets.

Pricing decisions are Sales-led; PRMKT contributes positioning input only.

Replacing human PRMKT judgment.

---

## 3. Users and access

### Primary

PRMKT team. Java (Lead) and five direct reports (Sam, Peps, Nikki, Lance, Gianina). Used when initiating GTM work for a product launch or major feature release.

### Secondary, read-only

Marcom team members. Read-only access to **Messaging House and Messaging Architecture only** — they don't need the upstream synthesis (Big Idea reasoning, competitive scan), and limiting scope keeps internal review gates clean.

### Access model (v2 Vercel)

Sprout SSO. Email domain restricted to `@sproutsolutions.ph`. Three roles:

- **PRMKT (full):** create, edit, approve, refine briefs; run Quick Tools; run Win/Loss queries
- **Marcom (read-only):** view completed Messaging House and Architecture
- **Admin (Java + designee):** manage roles, view audit logs, manage product context files

### Multi-user collaboration model

**Single owner with shared view-and-comment access.** The PRMKT team is small (5 direct reports), and GTM authorship benefits from one accountable hand. Real-time co-edit adds engineering complexity for marginal gain — defer to v3 if demand emerges.

### Audit log retention

**13 months.** Covers a full annual planning cycle plus one buffer quarter for QBR look-backs. Purge nightly after retention window.

---

## 4. Architecture overview

### Two main modules + Quick Tools

**Module 1: GTM Workflow.** Guided 8-step flow through Phase 2.1–2.7 (plus Market Insights as Step 1). Produces a CMO-ready GTM Brief.

**Module 2: Win/Loss Intelligence.** Standalone analytical surface. Filterable by product, segment, time, headcount, pipeline. Produces thematic loss analyses on demand. Feeds Module 1 and is reusable for QBR.

**Six Quick Tools.** Standalone mini-tools for spot work. Each is its own route. Share visual components with the workflow but no shared state.

### Data layer

**Live integrations (v2):**
- HubSpot MCP (closed-lost data, competitor field, ACV, deal stage, segment)
- Win Wires (Google Doc, fetched on read)
- Sales weekly sync notes (Google Doc, fetched on read)
- CSM observations (Google Doc or Notion, fetched on read)
- Product context files (markdown in repo, editable via Settings → Products by Admin)

**Future integrations (v3):**
- Competitive Intelligence Hub
- Customer Proof Hub
- Social Listening Agent
- SEO Reporting Dashboard
- PRMKT Dashboard

### Output layer

All AI outputs are confidence-scored, source-tagged, recency-flagged. Every source tag is clickable to its underlying record (HubSpot deal URL, Google Doc link, etc.).

### Tech stack

| Layer | v2 (production) |
|---|---|
| Frontend | Next.js (App Router), Tailwind, deployed to Vercel |
| Auth | Sprout SSO via NextAuth + Sprout's identity provider |
| Database | Postgres on Vercel (per Java's preference; co-located with other PRMKT AI projects) |
| AI | Anthropic API, Claude Sonnet 4 for routine synthesis, Claude Opus for Big Idea / CVP variants and refinement diffs |
| HubSpot integration | HubSpot MCP server (already in production for other PRMKT tools) |
| Document fetch | Google Workspace API for Docs; Notion API for CSM observations |
| Audit | Postgres audit table with 13-month retention; nightly purge job |
| File storage | Vercel Blob for any user-uploaded reference materials |

---

## 5. Data sources — full inventory

This is the master list of every source that feeds AI synthesis. **Every source listed here must be wired before that step can be considered complete.** Source tags rendered in the UI must be clickable to the underlying record.

| Step | Source | Type | Recency rule | Click target |
|---|---|---|---|---|
| **1. Market Insights** | DTI 2025 SME registry | Public PH gov data | Refresh annually | dti.gov.ph link |
| | BSP circulars (e.g., 1133) | Regulatory | Refresh on issuance | bsp.gov.ph link |
| | PSA labor force surveys | Public PH gov data | Refresh quarterly | psa.gov.ph link |
| | Mercer PH HR Trends Report | Industry report | Annual | Stored PDF in repo, signed URL |
| | Sprout VOC quarterly summary | Internal | Quarterly | Google Doc link |
| | LLM web research (bounded) | Web | <60 days for trend claims | Source URL with date stamp |
| **2. Competitive Landscape** | HubSpot closed-lost deals (90d) | CRM | Real-time via MCP | HubSpot deal URL |
| | HubSpot competitor field (`name_of_competitors`) | CRM | Real-time | HubSpot deal URL |
| | Win Wires (Google Doc) | Internal | Last fetch <24h | Google Doc anchor link |
| | Competitor websites | Web fetch | Cached 7 days | Live URL |
| | Competitive Intelligence Hub | Internal (v3) | Real-time | Hub record URL |
| **3. Consumer Insight** | Sales weekly sync notes | Internal | Last 8 weeks | Google Doc anchor |
| | CSM observations | Internal | Last 8 weeks | Notion or Google Doc anchor |
| | HubSpot deal notes (closed-won + closed-lost) | CRM | Last 90 days | HubSpot deal URL |
| | Win Wires direct quotes | Internal | Last 90 days | Google Doc anchor |
| | Customer Proof Hub | Internal (v3) | Real-time | Hub record URL |
| **4. Product Truth** | Product context file (`/products/{product}.md`) | Repo file | Manual updates by Admin | Editable in Settings → Products |
| | Top 5 competitors per product context | Repo file | Manual | Same file |
| | Step 2 output | Workflow state | Live | Internal link |
| **5. Big Idea** | Steps 1, 2, 3, 4 outputs | Workflow state | Live | Internal anchor |
| | Phase 1 Market Realities note | Pre-flight attachment | Per launch | Uploaded reference |
| **6. CVP and Positioning** | Step 5 output | Workflow state | Live | Internal anchor |
| | VRIO assessment (auto-run) | AI-derived | Live | N/A (computed) |
| **7. Messaging House** | Steps 5, 6 outputs | Workflow state | Live | Internal anchor |
| | Customer Proof Hub | Internal (v3) | Real-time | Hub record URL |
| | Product context proof points | Repo file | Manual | Settings → Products |
| **8. Messaging Architecture** | Step 7 output | Workflow state | Live | Internal anchor |
| | SEO Reporting Dashboard | Internal (v3) | Real-time | Dashboard URL |
| | Social Listening Agent | Internal (v3) | Real-time | Agent URL |

**Click-through requirement.** Every source tag chip rendered in the UI must, on click, open the underlying record in a new tab. If the source is not wired (e.g., v3 integrations not yet live), the chip renders disabled with a "Coming Q3 2026" tooltip — do not render a fake clickable chip.

**Recency flagging.** Sources older than 60 days display an amber "Stale" badge inline next to the chip. Sources older than 180 days display a red "Outdated" badge.

---

## 6. AI behavior — synthesis logic

### Per-step synthesis weighting (drives confidence score)

Different steps weight different signals because the inputs are genuinely different. There is no single global confidence formula.

| Step | Weighting |
|---|---|
| 1. Market Insights | Source recency (40%) · Number of corroborating sources (30%) · PH-specific verification (20%) · Field signal alignment (10%) |
| 2. Competitive Landscape | Deal sample size (35%) · Field corroboration via win wires (25%) · Recency of competitor signal (25%) · Source diversity (15%) |
| 3. Consumer Insight | Direct quote presence (35%) · Source breadth — number of CSMs/reps citing it (30%) · Recency <60 days (20%) · Internal consistency (15%) |
| 4. Product Truth | Competitive contrast strength (40%) · Product evidence specificity (30%) · Buyer-meaningfulness signal (20%) · Internal consistency (10%) |
| 5–8. Synthesis steps | Variants are generated, not scored. User picks or edits. AI runs consistency checks against prior steps (Big Idea ↔ CVP ↔ House ↔ Architecture) and flags drift. |

**Display.** Confidence percentages are displayed with a hover tooltip showing the weighting formula for that step. PRMKT sees the math, not a black-box number.

### Gate types

**Challenge mode (Steps 1–4).** AI presents the draft, then asks 2–3 sharp questions designed to surface assumptions, missing data, or unvalidated claims. User responds, AI revises, user approves to advance. The questions are auto-generated from synthesis weak points (e.g., low-confidence sources, contradictions, single-source claims).

**Variants (Steps 5–8).** AI generates 3 angles on the same intersection. User can pick one, multi-select to combine (CVP only), edit any variant, or write their own as a 4th variant (Big Idea). Step 5 and Step 6 also run automatic VRIO and consistency checks against prior steps.

### Freeform input on every step

Every step has an "Add your own input" panel where PRMKT can paste a sales rep observation, CSM call note, hypothesis, or any context AI didn't surface. Input is tagged with one of: Sales sync, CSM call, Direct quote, Field hypothesis, CMO direction, Brand alignment. AI re-synthesizes incorporating the new input and re-scores confidence.

This is non-optional. AI synthesis without a way to disagree is what produced the "first version felt like a black box" feedback in early testing.

---

## 7. Workflow detail — pre-flight and gates

### Pre-flight: Phase 1 attachments

Before Step 1 unlocks, the user attaches or links:
- Product walkthrough doc (Google Doc/Slides link)
- Discover Memo (1-pager from Phase 1 milestone)
- Segment + ICP definitions (with HubSpot field mappings: `segment_official`, `headcount_official`)
- Latest Sales weekly sync notes (≤2 weeks old, date-stamped)
- Latest CSM observations (≤2 weeks old, date-stamped)

The tool validates that all are present before Step 1 unlocks. Missing attachments display a clear "Required" indicator with a link to the attachment slot.

### Step-by-step

Each step in the workflow shares the same shape: required inputs, AI synthesis output (with confidence + source tags), gate type, freeform PRMKT input panel, advance button.

The clickable prototype demonstrates this pattern across all 8 steps. The full content patterns are in `gtm_studio.html` and should be treated as the source of truth for v2 visual implementation.

---

## 8. Refinement mode

When PRMKT reopens a completed brief with new learnings, they enter **refinement mode** — a wrapper around the standard workflow with diff-tracking.

### Flow

1. User clicks "Refine with new learnings" on a completed brief.
2. AI prompts: "What's changed since launch? Paste new field signals, new competitor data, new performance metrics."
3. AI analyzes the new input and identifies which steps are likely affected. Example: "Based on this, Steps 1, 4, and 6 are likely affected. Steps 2, 3, 5, 7, 8 still hold."
4. User reviews each affected step with the new context. AI shows side-by-side diff: original draft vs. proposed update.
5. User approves changes. New version saved with a changelog entry: "v2 · Refined April 30 · Updated Big Idea after Q2 sales feedback."

### State

Each brief has a version history. v1 is the original launch brief. v2, v3, etc. are refinements. Users can view any version, restore any version, or branch a new GTM from any version.

---

## 9. The GTM Brief output

At the end of Step 8, the user generates the **GTM Brief** — a CMO-ready one-pager (with appendix). The exact template is delivered as a separate artifact (`gtm_brief_template.html`).

### Sections (in order)

1. Product Name + Date
2. Product Overview (purpose, problem, where it fits in Sprout's 3 verticals × 4 levels)
3. Core Features (top 3–5, outcome-framed)
4. Target Audience (firmographics, buyer, user, segment, ICP fit)
5. Persona and Pain Points
6. Market Insights
7. Competitive Landscape
8. Big Idea
9. Core Value Proposition
10. How We Win vs. Competitors
11. Messaging House
12. Messaging Architecture (TOFU / MOFU / BOFU)

### Output formats

- **HTML** (default, in-app view + clean print)
- **PDF** (one-click export, browser print-to-PDF using the HTML)
- **Word .docx** (post-MVP if requested by Marcom for downstream editing)

### Confidence and source tags

Every claim in the brief carries an inline source tag chip, clickable to its underlying record. The brief is the audit trail for the strategy.

---

## 10. Quick Tools — detailed

Each tool is a standalone route at `/tools/{tool-slug}`. Shared component library, no shared state.

### TAM SAM SOM Generator (`/tools/tam-sam-som`)

Inputs: Product, target industries, geo, headcount range (1–10 Micro SME / 11–299 SME / 300+ ENT / All).
Output: TAM, SAM, SOM with cited sources from PH government and verified industry data.
Sources: DTI SME registry, BSP reports, PSA labor force, Sprout HubSpot install base.

### VRIO Stress-test (`/tools/vrio`)

Inputs: Positioning statement, top 3 competitors.
Output: Valuable / Rare / Inimitable / Organized assessment with strength color-coding and a single-paragraph recommendation.

### Big Idea Generator (`/tools/big-idea`)

Inputs: Product, target segment (drives angle generation), Insight, Truth, Market Reality.
Output: 3 variants on the intersection.
Note: Without product and segment, AI produces generic angles. The product+segment context is mandatory before the AI runs.

### Messaging Stress-test (`/tools/messaging-stress-test`)

Inputs: Type of asset (tagline / headline / spiel / subject / hero), the message itself, target persona, target industry.
Output: Critique on Clarity, Differentiation, Persona fit, Proof strength (each scored). One suggested rewrite.

### Win/Loss Quick Read (`/tools/win-loss-quick-read`)

Inputs: Product, time range.
Output: 30-second thematic summary of wins and losses. Subset of full Win/Loss Intelligence module — no filters, just the read.

### Persona Pressure-test (`/tools/persona-pressure-test`)

Inputs: Positioning statement, multi-select personas (HR Director, CFO, Payroll Officer, CEO/Owner, Employee end-user).
Output: Per-persona reaction with chip indicating Resonates / Pushback / Stalls. Synthesis paragraph.

---

## 11. Workspaces and project organization

### Workspaces

One workspace per product. Current set: ReadyCash, Sprout HR, Sidekick AI, Sprout Payroll, Foresight. New workspaces are added by Admin via Settings → Products (which also creates the corresponding product context file).

### Inside each workspace

- Active GTMs (in-progress)
- Completed briefs (refinable)
- Drafts

### Filters

Across workspaces: Segment, Quarter, Owner, Status.

### Closed-Lost cache

**24-hour cache.** Closed-lost data evolves daily, but a 24-hour cache gives reasonable performance without staleness risk. Force-refresh button available at the top of Win/Loss Intelligence and at any Step 2 source preview.

---

## 12. Integration roadmap

| Integration | Purpose | Phase |
|---|---|---|
| HubSpot MCP | Closed-lost data, deal segments, ACV | v1 mocked, v2 live |
| Win Wires (Google Doc) | Reference doc for Steps 2 and 3 | v1 manual link, v2 auto-fetch |
| Sales sync notes (Google Doc) | Step 3 source | v1 manual, v2 auto-fetch |
| CSM observations (Google Doc / Notion) | Step 3 source | v1 manual, v2 auto-fetch |
| Competitive Intelligence Hub | Auto-feed Step 2 with deeper signals | v3 |
| Customer Proof Hub | Auto-feed Step 7 with verified proof points | v3 |
| Social Listening Agent | Auto-feed Step 8 (TOFU) and Step 3 sentiment | v3 |
| SEO Reporting Dashboard | Auto-feed Step 8 (TOFU channel intelligence) | v3 |
| PRMKT Dashboard | Auto-feed metrics across the workspace | v3 |

The five v3 integrations are not gating dependencies. Each step has manual fallbacks for v2.

---

## 13. v1, v2, v3 phasing

### v1 — this week

**Goal:** Validate workflow logic + secure ExeCom buy-in.
**Form factor:** Clickable HTML prototype (`gtm_studio.html`) + Claude Project for live workflow testing.
**Scope:**
- Full 8-step workflow logic in Claude Project system prompt
- Phase 1 attachment intake (mocked)
- Two gate types implemented (Challenge + Variants)
- Reference docs uploaded (GTM Process PDF, ReadyCash playbook, formatting guidelines)
- ReadyCash placeholder data drawn from Q2 launch playbook
- Vision deck and project documentation

**Out of scope for v1:** real auth, persistent state, live HubSpot, the five v3 integrations, role-based access.

### v2 — May (3–4 weeks post-ExeCom approval)

**Goal:** Production-ready Vercel app for full PRMKT team adoption.
**Form factor:** Vercel-hosted Next.js app.
**Scope:**
- Sprout SSO + role-based access (PRMKT, Marcom, Admin)
- Persistent project state via Postgres on Vercel
- Real HubSpot MCP integration
- Live Win Wires, Sales sync, CSM observation fetches
- Full design system applied
- Audit logging (13-month retention)
- Refinement mode with version history
- All 6 Quick Tools
- Brief export to HTML and PDF
- Manual placeholder fields for the five v3 integrations
- Internal launch to PRMKT team with structured weekly feedback

### v3 — Q3 2026

**Goal:** Full GTM Intelligence Agent vision realized.
**Scope:**
- Live Competitive Intelligence Hub integration
- Live Customer Proof Hub integration
- Live Social Listening Agent integration
- Live SEO Reporting integration
- Live PRMKT Dashboard integration
- Phase 1 (Discover) lightweight intake module
- Phase 6 (Learn & Scale) feedback loop — post-launch performance data feeds back into next GTM cycle
- Multi-product portfolio view
- KPI tagging tied to PRMKT KPI 5b (systems-building / agentification)

---

## 14. Design system application

Per Sprout formatting guidelines.

### Typography
- Headlines: Helvetica Neue Bold
- Body: Rubik Regular
- USP / CTA: Rubik Semibold
- Logo: Petrov Sans (logo only)

### Color
This is an AI product, so primary shifts to **Ubas #8139EE**. Approved AI gradients available for backgrounds and AI-related visuals only.

60 / 30 / 10 proportion:
- 60% neutral background (#FAFAF7, #F7F5F2, #F5F3FF)
- 30% Ubas for main visuals, headers, CTAs
- 10% accent (Carrot, Green Apple, Lime — used sparingly for status indicators, never as decoration)

Maximum 1–3 saturated colors per view.

### Copy principles
- Plain language
- No em dashes (use natural connecting words, parentheses, or sentence breaks)
- Front-load the "why"
- Tight headlines (diagnosis + implied action in one sentence)

---

## 15. Open questions for v2 build

1. **Brief export format priority.** HTML and PDF are confirmed. Word `.docx` post-MVP only if Marcom requests for downstream editing — confirm with Marcom lead before committing.
2. **VRIO surfacing.** Material risks surfaced in Step 6 — should they appear in the final brief, or stay internal-only? Recommend internal-only with a "Material risks reviewed and accepted" line in the appendix.
3. **ACV formula values.** RevOps owns the segment benchmark values. Confirm with RevOps in week 1 of v2 build.
4. **PlaybookGPT integration timing.** Survey showed 10/21 reps want AI tools. Should GTM Studio briefs auto-update PlaybookGPT, or stay decoupled? Defer to v3.
5. **Refinement mode auto-detection.** Should AI proactively flag "this brief is stale" after 60 days, or only run on explicit user re-entry? Recommend explicit user re-entry only, to avoid notification fatigue.

---

## 16. Recommended next steps

After ExeCom endorsement on Friday:

**Track A — workflow validation (week 1–2).** Test the Claude Project version on the next live GTM (likely Sidekick AI feature release). Two PRMKT-ers run it side by side with their existing process. Iterate on prompts.

**Track B — v2 Vercel scoping (week 1).** Engineering kickoff. Confirm Postgres on Vercel, SSO wiring, HubSpot MCP availability. Estimated 3–4 weeks to internal launch.

**Track C — internal documentation (week 2).** Workflow deep-dive deck for PRMKT team alignment. Walks through each of the 8 steps in detail. Shared ahead of first team test cycle.

---

*End of project documentation. Next artifact: GTM Brief one-pager template (`gtm_brief_template.html`).*
