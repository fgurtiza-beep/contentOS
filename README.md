# ContentOS

**Sprout Solutions' internal content production and repurposing operating system.**

ContentOS is the orchestration layer above three specialized agents. Users never
talk to a sub-agent directly — they submit a request and ContentOS decides which
agent runs, what context is retrieved, what risk tier applies, whether QA is
required, whether human review is required, and whether content can be exported.

```
Growth Team User
      │  (standardized brief)
      ▼
ContentOS Orchestrator ── routing · context assembly · risk gating · QA handoff
      │
      ├─ Production Agent     → net-new content from a brief
      ├─ Repurposing Agent    → one approved Source Asset → channel-native derivatives (IMD 2.0)
      └─ QA Agent (8 layers)  → evaluates every draft & derivative
              │
   pass ──────┼────── revision (loops to creator)
              └────── Tier 2 / critical → Human Review Queue → approve / kill
                                                      │
                                                  Export
```

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000  → redirects to /contentos
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`. Requires Node 18.18+.

The app ships with **4 seeded jobs** in varied states so the dashboard, QA
workspace, human-review queue, audit log, and observability views are populated
on first load. State is held in memory and **resets on reload** (see Limitations).

## What's inside

### Navigation (progressive disclosure, Notion/Linear-style)
| Route | What it is |
|---|---|
| `/contentos` | **Dashboard** — operational "what needs attention" view (drafts awaiting QA, pending reviews, exports ready) |
| `/contentos/jobs` | **My Jobs** — full job list with filters and search |
| `/contentos/intake` | **New Content Job** — guided wizard: choose workflow → choose type → *then* the brief appears |
| `/contentos/qa-check` | **QA Check** — run the 8-layer QA on pasted / uploaded / URL content without creating a job (QA Agent only) |
| `/contentos/review` | **Human Review Queue** with full reviewer action set |
| `/contentos/exports` | **Exports** — export-ready jobs + export history |
| `/contentos/jobs/[id]` | Job workspace — lifecycle + **agent workflow progress**, **editable side-by-side QA review**, agent outputs, brief, export, audit |
| `/contentos/admin` | **Admin Insights** (admin role only) — Observability, Audit Log, Job History, Agent/QA/Revision/Export analytics |

The sidebar exposes a single **+ New Content Job** entry point; agents are never
navigable — they appear only as workflow states inside a job. A topbar **Standard
/ Admin** toggle previews role-based access (Admin Insights is hidden for Standard).

The **New Content Job** flow never shows the brief up front: Step 1 picks the
workflow (New Content vs Repurposing), Step 2 picks the content type as large
interactive cards, and only then does the standardized brief appear.

### The single source of truth for product information
`src/lib/contentos/data/gtmStudioProductService.ts` is seeded **only** from the
GTM Studio product context file. Every product fact carries provenance (source
document, product id, feature id, section, retrieved version, timestamp). The
service can verify free-text claims; anything it cannot trace is returned
**UNVERIFIED** and routed to Product Marketing — prior content, memory, and
published blogs are never accepted as sources. The QA Agent's Layer 8 (Product &
GTM Accuracy) surfaces unverified claims as **critical**, block-mapped issues.

### The side-by-side QA review workspace
`/contentos/jobs/[id]` opens on the QA tab:
- **Left** — the content, block by block, with tracked changes (original struck
  through, replacement inline). Flagged blocks are highlighted by severity and
  click-linked to their issue.
- **Right** — the 8-layer scorecard plus every flagged issue grouped by QA layer,
  each with current text, suggested replacement, reasoning, confidence, source
  validation status, and risk-tier impact.
- **Per-change controls** — Accept · Reject · Edit · Send to Human Review.
- **Bulk controls** — "Accept all [layer] fixes" per section, plus global
  apply-only-critical / high-confidence / product-accuracy / compliance-legal.
- **Accept All Changes** sits at the very bottom of the workspace, as specified.

### Risk tiering & routing (single source of truth in code)
- QA ≥ 4.5 → pass · 3.0–4.4 → revision · < 3.0 → block
- Any critical factual/product/compliance/legal issue → hold for human review
- Product & GTM Accuracy < 4.0 → product review
- **Tier 2 → human review regardless of score** (regulatory, competitor, pricing,
  security, compliance, integration, AI/roadmap claims, executive/high-visibility)
- After 2 failed revision attempts → escalate to human review

Thresholds live in `src/lib/contentos/schemas/contentos.ts`.

## Project structure

```
src/
  app/                          Next.js App Router pages
    contentos/                  dashboard · intake · jobs/[id] · review · audit · observability
  components/contentos/         ContentOSDashboard, JobIntakeForm, WorkflowStepper,
                                CanonicalNarrativePanel, BlueprintPanel, AgentOutputPanel,
                                DraftEditor, QAReviewWorkspace, SideBySideComparison,
                                QAScorecard, ChangeSuggestionCard, HumanReviewQueue,
                                ExportPanel, AuditTrail, Observability, Sidebar, badges
  lib/contentos/
    schemas/contentos.ts        all typed schemas (brief + addenda, states, risk, QA, content, audit)
    orchestrator/               contentOrchestrator.ts, riskTiering.ts
    agents/                     productionAgent.ts, repurposingAgent.ts, qaAgent.ts, shared.ts
    data/                       gtmStudioProductService + brand / ICP / campaign /
                                assetLibrary / databricksApprovedViews / complianceReference
    store/                      jobStore.ts (reactive), seed.ts, useStore.ts
    export/exporters.ts         markdown · google docs · hubspot · linkedin · csv · html · json
    audit/auditLog.ts           audit selectors
    util.ts                     ids + deterministic seed clock
```

## Design

The UI reuses the **GTM Studio design system** (UBAS purple `#8139EE`, dark
sidebar, Rubik typography, the same token set lifted from `gtm_studio.html`) so
ContentOS reads as a sibling internal operating system, not a generic chatbot.

## Guardrails enforced

- Product information comes only from GTM Studio; unverifiable claims are marked
  UNVERIFIED and routed to review, never presented as fact.
- Regulatory content carries a non-legal-advice disclaimer; competitor, pricing,
  security, compliance, integration, and roadmap claims are Tier 2.
- Repurposed outputs require exactly one **approved** Source Asset and derive from
  the Canonical Narrative (no cross-asset blending; the agent throws otherwise).
- QA is shown side by side with the content; every suggestion is individually
  approvable; all changes are version-tracked; Accept All is at the bottom.
- Export is blocked unless QA passed, a human approved, or an explicit override
  reason is logged.
- Generated content avoids em dashes and the Appendix A cliché watchlist (the QA
  Agent actively scans for both).

## Known limitations

1. **In-memory store** — jobs/audit live in module memory and reset on reload.
   Swap `jobStore.ts` / `seed.ts` for a Postgres-backed implementation (the
   schema and orchestrator are storage-agnostic).
2. **Agents are deterministic stubs**, not LLM calls. They assemble coherent,
   provenance-aware outputs from the brief + knowledge layer so the full pipeline
   and UI work end to end. Replace the three `agents/*.ts` with system-prompted
   model services behind the same input/output contracts.
3. **Knowledge services are placeholders** seeded from the provided context files;
   they expose the query surface a RAG / connector implementation would.
4. **Claim verification is naive token overlap**, a stand-in for retrieval.
5. **Export connectors render previews only** (no live Google Docs / HubSpot push).
6. **Visual & Structural QA (Layer 7)** is text-only in the prototype (no design
   assets to inspect).

## Recommended next steps

1. Replace the three agent stubs with system-prompted Claude services; keep the
   typed input/output contracts so they remain swappable.
2. Back the store with Postgres + the GTM Studio Product Hub three-layer model
   (Spec / Story / Commercial) and `brief_snapshots` to solve the rug-pull
   problem from the Product Hub engineer brief.
3. Wire the Brand/ICP/Campaign/Asset knowledge services to the real RAG store and
   the Databricks "approved-for-content" data contract.
4. Implement live export connectors (Google Docs, HubSpot) behind the existing
   `exporters.ts` interface.
5. Add notifications (Slack/email) when a job enters the Human Review Queue.
6. Add automated tests around routing thresholds, the revision/escalation loop,
   and GTM-claim verification.
```
