# ContentOS — New Content Job Intake Redesign

**Status:** Implemented in this build · **Date:** 2026-06-09 · **Surface:** `/contentos/intake`

A redesign of the New Content Job intake to reduce form fatigue, raise completion
rates, standardize inputs, and enable AI-assisted auto-fill from an uploaded brief.

---

## 0. v2 update — single-page builder + governance safeguards

The accordion form was flattened into a **single-page intelligent request builder**
targeting a **sub-60-second** request. Changes in this iteration:

- **Structure:** four accordions → one scrollable page of numbered blocks
  (`What → Who → Pain points → Goal → Product`); only *Additional guidance* stays
  collapsed. (Answers the "is the four-section structure necessary?" question — no.)
- **Max 5 blogs** per submission via a `1–5` segmented control + quality helper
  text (prevents content-calendar dumps, context dilution, hallucination).
- **Content format** for blogs: *Standard* vs *Listicle*. Listicle reveals
  **item count (≤20)**, **companies/solutions to feature**, and **mandatory
  inclusions** — pinning list shape so the AI can't invent it.
- **Goal** is now a **12-option multi-select** ("What should this content
  achieve?") with example microcopy; each option maps to a `ContentIntent` so the
  pipeline is unchanged (`intentsFromGoals`).
- **Pain points are required** and promoted to the main form — a 10-option
  chip multi-select + free-text "Other".
- **Additional guidance reduced to 3 fields**: Must include · Must avoid · Other
  notes. Removed entirely: SEO keyword, Campaign, Readiness, Risk sensitivity,
  Competitor field, Compliance context, SME notes, Databricks views, CTA, and the
  Operator-settings section.
- **Field minimization (challenge every field):** **Tone is inferred** from goals
  + audience (no input); **CTA dropped** (agents generate safe CTAs); **Competitor
  governance inferred** from the listicle "featured" list so Tier-2 still triggers
  without a competitor field; Persona/Industry are optional.

**Resulting required set:** Title · Pain points · Goal. Everything else is
auto-filled, optional, hidden, or inferred.

### Governance preserved despite fewer fields
- Risk tiering still runs on every submit; competitor signals are inferred from the
  featured list, regulatory/competitor/research addenda still appear for the job
  types that require them.
- GTM Studio remains the only product authority; auto-fill never invents a product.

### Architecture recommendation (Final Design Question)
Implemented the **single-page intelligent builder** now. The recommended **next
phase** is a **progressive conversational builder** (ChatGPT-style): one prompt box
("What do you want to create?") + optional upload, where ContentOS extracts the
brief, then asks only for the 1–2 fields it couldn't infer (usually pain points and
goal) as inline quick-replies, and shows a compact confirmation card before submit.
The single-page build already isolates the minimal required set (Title, Pain points,
Goal), which is exactly the question set a conversational flow would ask — so it is a
direct stepping stone, not throwaway work.

---

## 0b. v3 update — agency SEO brief alignment

Rebuilt the upload/extraction around the real agency brief format (reference:
*"Payroll software vs payroll outsourcing: an SME decision framework"*).

**Deliverable 1 — UX critique (of the v2 form):** extraction was unreliable
because the parser only read flat text and knew nothing about the agency's
section structure; products in prose/links weren't detected; the nuanced audience
paragraph was forced into ICP/Persona; Part-2 SEO fields (keywords, outline, CTA
type, specs) had nowhere to land. Fixed below.

**Deliverable 2 — Revised IA (5 blocks + 2 collapsed):**
`Top: Upload / Paste / Manual` → `1 Essentials` → `2 Audience` →
`3 Content Direction` → `4 SEO & Outline (collapsed)` → `5 Production Specs (collapsed)`.

**Deliverable 3 — Field changes:** *Added* — Audience details, Company size,
Geography, Trigger events, Content angle, CTA type, Product mention rules, Proof
requirements, Key messaging, Search intent, SERP opportunity, Competitor-gap rows,
Outline rows, FAQ requirements, Primary/Secondary/Variation keywords, PAA, Word
count, Schema, Media, Title options. *Relabeled* — Title → **Title / Main Topic**,
Content Intent → **What should this content achieve?**. *Promoted* — Pain points to
main form (required, editable chips). *Hidden* — Databricks (admin/risk only).

**Deliverable 4 — Upload extraction logic:** `acquire text (paste · PDF via
pdfjs · DOCX via mammoth · MD/TXT) → detect agency format (≥3 known headings) →
deterministic parse → map to fields → review`. Deterministic rules run **before**
any AI, keyed to the agency headings, so high-value fields extract reliably.

**Deliverable 5 — Field mapping (agency brief → ContentOS):**

| Agency brief section | ContentOS field(s) |
|---|---|
| 1.1 Topic intent analysis | Search intent · SERP opportunity |
| 1.2 Competitor analysis (table) | Competitor-gap rows (URL + analysis) |
| 1.3 Audience and business goal | ICP · Persona · Audience details · Company size · Geography · Trigger events · Objective |
| 1.4 Key messaging principles | Key messaging (chips) |
| 1.5 Pain points this article must address | **Pain points** (required chips) |
| 2.1 Title options | Title / Main Topic (primary) + Title options (grouped, not separate blogs) |
| 2.2 Content outline | Outline rows (heading + writing direction) · FAQ requirements |
| 2.3 Content specifications | Word count · Format · Schema · Media · CTA type/text |
| 2.4 Keyword analysis table | Primary / Secondary / Variation keywords · PAA questions |
| "Where Sprout fits" + CTA + links | **Products** (multi-select) · Product mention rules · Proof requirements |

**Deliverable 6 — UI layout:** single page; SEO & Production blocks collapsed
after auto-fill; products show **"Detected product not found in product list"**
chips with a *map-to* dropdown; pain points / triggers / messaging are
add/edit/delete chip lists.

**Deliverable 7 — Error & warning states:** hard-required (block submit) — Title,
Pain points, Goal. Soft warnings (must acknowledge "intentionally empty" to submit)
— No product / audience / primary keyword / CTA / outline detected. Unreadable file
→ "use Paste brief text".

**Deliverable 8 — Final spec:** this document + the live form.

**Deliverable 9 — Parsing reliability:** deterministic heading rules first;
**Paste brief text** as the always-reliable path; PDF/DOCX best-effort with paste
fallback; every auto-filled field tagged **review**; products reconciled to GTM
Studio (never invented). *Verified against the real brief:* pain points (5/5),
products (Sprout Payroll Management → mapped; Sprout Managed Payroll → flagged
unmapped), company size, triggers, primary keyword, all 3 title options, PAA, CTA
type = Validation, word count, schema, competitor URLs.

**Deliverable 10 — Edge cases:** multiple title options → grouped under one blog,
not split into separate jobs; multi-blog → per-blog Title + Objective + Primary
keyword + Notes (max 5); detected-but-unmapped product → flagged, never
auto-referenced; service named that isn't a GTM product (Sprout Managed Payroll) →
unmapped chip for PMM to resolve; scanned/image PDF → paste fallback.

### Mapping note (real data)
The brief's *"Sprout Payroll Management"* maps to GTM Studio **`sprout-payroll`**;
*"Sprout Managed Payroll"* is a managed **service** not in the GTM product list, so
it surfaces as an unmapped chip — exactly the confirm/map flow requested.

---

## 0c. v4 — full draft generation + simplified review

**Core fix — the brief now drives a complete article.** The production agent
previously emitted only a title + intro and ignored the uploaded brief. It now
treats `brief.agencyExtract` as the **primary source of truth** and generates a
complete draft: SEO meta title + description, full intro, **every outline H2/H3
with body copy**, FAQ (from PAA), the product section (GTM-verified, with a
flagged unverified claim), a conclusion, and a brief-aligned CTA. With no uploaded
outline it still builds a full multi-section article from goals + pain points —
never a stub. *Verified:* a brief with a 6-section outline produces h1 + 2 meta +
6×h2 + 3×h3 + 14 paragraphs + CTA.

**Brief hierarchy.** Brief → intake fields → GTM Studio → AI gap-fill. Mismatches
(brief names a product not selected, recommended title/keyword differs) are
surfaced as **"Brief vs. request — please confirm"** flags rather than silently
resolved.

**Submission flow.** Filing a request no longer auto-routes to human review. It
lands on a **stakeholder preview**; human review is a **user action**
(`Submit for approval`). A non-binding recommendation banner appears when
governance flags exist.

**Simplified post-submit (Standard View).** A two-column `StakeholderReview`:
- **Left** — the full draft in a document-style editor: edit inline, regenerate any
  section from the brief (↻), SEO meta fields, comments.
- **Right** — **Brief coverage** checklist (pain points, products, sections, CTA,
  length, unsupported claims — each with an "Add section" fix where missing) and
  **QA suggestions** styled like Grammarly (Accept · Edit · Dismiss · Ask why ·
  Apply all safe edits).

Risk tiers, the workflow stepper, agent panels, audit, routing logic, and all
internal metadata are **hidden from Standard View** and live behind the collapsed
**"Admin view — full production detail"** section (role = admin only).

---

## 1. UX critique of the prior experience

The 3-step wizard (Workflow → Type → Brief) and its progressive disclosure were
sound and were kept. The friction lived in the brief step:

1. **The form was the only way in** — no upload path. A requestor with a brief in
   Google Docs had to retype 20+ fields.
2. **Free text where structure exists** — Tone, Industry, and Persona were free
   text despite canonical values living in GTM Studio / the ICP service. Dirty
   data weakens AI output and makes reporting impossible.
3. **"Title" implied certainty** requestors don't have.
4. **Batch was fake** — the quantity stepper produced one brief about one topic, N
   times. Real batch requests are N *different* topics.
5. **Jargon leaked** — "Content Intent → awareness/consideration," "Readiness →
   problem_aware," and a system-architecture helper string faced non-experts.
6. **Advanced settings was a junk drawer** — SEO, competitor, compliance, datasets,
   and Databricks views shared one flat list. Databricks selection is an
   operator concern that should never face a marketing requestor.

## 2. Information architecture (implemented)

```
STEP 1 Workflow → STEP 2 Type → STEP 3 Brief
  └─ ▰ Upload content brief / SEO outline  (dominant, top of page)
  ├─ ① The ask           Title/Main topic · Goal · How many → per-item rows if >1
  ├─ ② Who it's for      ICP (GTM) · Persona (cascades) · Industry (dropdown)
  ├─ ③ How it should read Tone (multi) · Product(s) (multi, None last) ·
  │                       What should this achieve? (large buttons) · CTA
  ├─ ④ Additional guidance (optional)  SEO & Search · Content guidance
  └─ ⑤ Operator settings  (Admin View only) Readiness · Risk · Compliance · Databricks
```

## 3. What changed in code

| Area | Change | File |
|---|---|---|
| Upload entry point | Dominant drag-and-drop zone above all fields; parses → auto-fills → user reviews | `JobIntakeForm.tsx`, `intake/briefExtractor.ts` |
| Multi-blog | Quantity > 1 reveals per-item Title/Goal/Notes rows; submits **one job per item** | `JobIntakeForm.tsx` |
| Title relabel | "Title" → **"Title / main topic"** + "a theme works too" hint | `JobIntakeForm.tsx` |
| Persona | Free text → **dropdown cascading from ICP** | `icpKnowledgeService.ts` (`personas[]`, `personasFor`) |
| Industry | Free text → **dropdown** (13 ISIC options) | `INDUSTRIES` in `schemas/contentos.ts` |
| Tone | Free text → **multi-select** (12 options) | `TONES`, `MultiSelect` |
| Product | Single-select → **multi-select, "None" last & exclusive** | `MultiSelect`, `products[]` field |
| Content Intent | Small chips → **large plain-language buttons** ("What should this achieve?") | `INTENT_GOALS` |
| Advanced drawer | Renamed **"Additional guidance (optional)"**, grouped SEO vs. content guidance | `JobIntakeForm.tsx` |
| Operator fields | Readiness, Risk, Compliance, **Databricks** moved to **Admin-View-only** section | gated on `useRole()` |
| Architecture string | **Removed** from the action bar | `JobIntakeForm.tsx` |

## 4. Auto-fill workflow

`Upload → parse → extract → map to StandardizedBrief → pre-fill → review → submit`

- **Text files** (`.txt .md .json .csv .html .rtf`) are parsed with label +
  keyword heuristics against the **real** knowledge services (ICP, products,
  industries, tones, intents).
- **Binary files** (`.docx .pdf .doc`) can't be read as text in the prototype, so
  a clearly-flagged **simulated** extraction is returned; production swaps in an
  LLM/OCR connector.
- Auto-filled fields are tagged **"review"**; the user always confirms.

### Guardrails
1. **GTM Studio stays the only product authority.** The extractor fills a product
   **only** when the document explicitly names a GTM Studio product; it never
   fabricates one. (`briefExtractor.ts`)
2. **Review is mandatory** after upload — extraction is a draft, not a submission.
3. **Risk tiering still auto-fires** on competitor/compliance signals regardless
   of which fields the requestor sees.

## 5. Data-model notes (non-breaking)

- `StandardizedBrief.products?: string[]` was **added**; `product` still holds the
  primary slug, so the orchestrator, risk tiering, and agents are unchanged.
- Tone is persisted as a joined string (`"Professional, Human, Helpful"`),
  preserving the existing `tone: string` contract.
- Multi-blog submits N briefs via the existing `jobStore.submitBrief`; the brief
  shape stays singular.

## 6. Try it

1. `npm run dev` → `http://localhost:3000/contentos/intake`
2. New Content → Blog. Drag **`sample-brief.md`** (repo root) onto the upload zone
   → title, audience, **pain-point chips**, **goal**, and product fill with
   "review" tags.
3. Switch **Content format → Listicle** → item-count notch + featured-companies +
   mandatory-inclusions appear. A known competitor in the featured list flags Tier 2.
4. Set **Number of blogs** to 3 (max 5) → per-item topic rows appear; submitting
   creates 3 jobs and lands on My Jobs.
5. Leave pain points or goal empty and hit submit → inline required-field errors.

## 7. Future enhancements & edge cases

- **Real extraction connector** (LLM/OCR) replacing the prototype heuristics.
- **Save-as-template / duplicate-last-request** for recurring requestors.
- **Live GTM Studio connector** replacing the seeded ICP/product services (the
  query surface is already shaped for a non-breaking swap).
- **Inline Tier-2 preview** before submit when competitor/compliance is detected.
- Edge cases handled: unreadable/binary file → simulated + flagged; doc names a
  non-GTM product → not filled; ICP matched but persona absent → ICP filled,
  persona left for user; "None" product is mutually exclusive with real products.

### Known prototype limitations
- Multi-select product verifies claims for the **primary** product downstream
  (others are stored in `products[]` for future use).
- Multi-blog routes to **My Jobs** (not a single workspace) since it creates N jobs.
