/**
 * GTM Studio Product Knowledge Service
 * ------------------------------------
 * GTM Studio is the SINGLE SOURCE OF TRUTH for all Sprout product information.
 *
 * ContentOS must not invent, infer, embellish, or assume product features,
 * benefits, integrations, pricing, packaging, security, compliance, roadmap,
 * AI capabilities, differentiators, availability, limitations, or use cases.
 *
 * Every product fact below is seeded ONLY from the GTM Studio product context
 * file (`context_file-sprout_products.md`) and carries provenance so any claim
 * derived from it can be traced back to GTM Studio. Prior content, memory, or
 * published blogs are NOT valid sources for product claims.
 *
 * This is a placeholder service. In production it is replaced by a connector to
 * the GTM Studio Product Hub three-layer model (Spec / Story / Commercial), per
 * the Product Hub engineer brief. The query surface below is intentionally
 * shaped so that swap is non-breaking.
 */

import type { ProductClaim } from "../schemas/contentos";

export type ProductSensitivity = "public" | "internal" | "confidential";

export interface ProductFact {
  id: string; // feature/benefit/proof id
  layer: "spec" | "story" | "commercial";
  fieldType:
    | "description"
    | "capability"
    | "outcome"
    | "proof_point"
    | "differentiator"
    | "integration"
    | "pricing"
    | "roadmap"
    | "who_not_for"
    | "limitation";
  text: string;
  /** Tier 2 topics (pricing, security, compliance, integration, roadmap, AI) flagged so the orchestrator can gate. */
  tier2Topic: boolean;
  sensitivity: ProductSensitivity;
}

export interface ProductRecord {
  id: string; // product id
  slug: string;
  displayName: string;
  status: "active" | "provisional" | "not_released";
  oneLiner: string;
  facts: ProductFact[];
  competitors: string[];
  sourceDocument: string;
  retrievedVersion: string;
}

const SOURCE_DOC = "GTM Studio · context_file-sprout_products.md";
const VERSION = "2026-06-01";

/** Seeded directly from the GTM Studio product context file. */
const PRODUCTS: ProductRecord[] = [
  {
    id: "prod_sprout_hr",
    slug: "sprout-hr",
    displayName: "Sprout HR",
    status: "active",
    oneLiner:
      "A People-first AI platform for end-to-end HR, built specifically for Philippine businesses to manage people, payroll, and compliance in one connected system.",
    competitors: ["Darwinbox", "PeoplesHR", "GreatDay", "Kami Workforce", "JeonSoft"],
    sourceDocument: SOURCE_DOC,
    retrievedVersion: VERSION,
    facts: [
      { id: "hr_cap_hub", layer: "spec", fieldType: "capability", text: "Digital Employee Hub — centralized employee records, documents, and workforce profiles in one system of record.", tier2Topic: false, sensitivity: "public" },
      { id: "hr_cap_payroll_sync", layer: "spec", fieldType: "capability", text: "Timekeeping to Payroll Sync built for Philippine labor laws, with automated computations, government contributions, and statutory reporting.", tier2Topic: true, sensitivity: "public" },
      { id: "hr_cap_ai", layer: "spec", fieldType: "capability", text: "Built-in AI assistance for HR queries, compliance checks, and predictive workforce insights, designed for Philippine business rules.", tier2Topic: true, sensitivity: "public" },
      { id: "hr_cap_rbac", layer: "spec", fieldType: "capability", text: "Role-based access controls across employee, manager, HR admin, and payroll admin permissions.", tier2Topic: true, sensitivity: "public" },
      { id: "hr_out_compliance", layer: "story", fieldType: "outcome", text: "Stay compliant without the stress: Sprout automates 100+ labor rules, reducing penalties and audit risk while keeping reports audit-ready.", tier2Topic: true, sensitivity: "public" },
      { id: "hr_proof_98", layer: "story", fieldType: "proof_point", text: "98% faster processing time.", tier2Topic: false, sensitivity: "public" },
      { id: "hr_proof_70", layer: "story", fieldType: "proof_point", text: "70% decrease in attendance processing disputes.", tier2Topic: false, sensitivity: "public" },
      { id: "hr_proof_users", layer: "story", fieldType: "proof_point", text: "Over 350,000 platform users.", tier2Topic: false, sensitivity: "public" },
      { id: "hr_int_workday", layer: "spec", fieldType: "integration", text: "Workday (HRIS; Innovator Partner Silver Tier), plus Manatal, Teamtailor, Peoplebox.ai, Disprz, Xoxoday Plum, Referrly.", tier2Topic: true, sensitivity: "internal" },
      { id: "hr_who_not", layer: "story", fieldType: "who_not_for", text: "Not for companies operating outside the Philippines that need non-PH-native payroll as the primary use case, or global-first HCM suites.", tier2Topic: false, sensitivity: "public" },
    ],
  },
  {
    id: "prod_sprout_payroll",
    slug: "sprout-payroll",
    displayName: "Sprout Payroll",
    status: "active",
    oneLiner:
      "A Philippine-compliant, automated payroll system built for growing SMEs and Enterprises that need accurate, scalable, fully compliant payroll without manual complexity.",
    competitors: ["Darwinbox", "PeopleStrong", "Ramco", "PeoplesHR", "SunFish DataOn"],
    sourceDocument: SOURCE_DOC,
    retrievedVersion: VERSION,
    facts: [
      { id: "pay_cap_engine", layer: "spec", fieldType: "capability", text: "Automated Payroll Engine computes salary, OT, ND, holiday pay, allowances, deductions, loans, and off-cycle payroll.", tier2Topic: false, sensitivity: "public" },
      { id: "pay_cap_statutory", layer: "spec", fieldType: "capability", text: "Built-in PH statutory compliance with auto-updated BIR, SSS, PhilHealth, Pag-IBIG tables and reports including 2316, Alphalist, and 13th month.", tier2Topic: true, sensitivity: "public" },
      { id: "pay_out_accuracy", layer: "story", fieldType: "outcome", text: "Near-zero payroll errors that reduce disputes and rebuild employee trust.", tier2Topic: false, sensitivity: "public" },
      { id: "pay_proof_999", layer: "story", fieldType: "proof_point", text: "99.9% payroll accuracy.", tier2Topic: false, sensitivity: "public" },
      { id: "pay_proof_2b", layer: "story", fieldType: "proof_point", text: "$2B+ in payroll processed.", tier2Topic: false, sensitivity: "public" },
      { id: "pay_proof_speed", layer: "story", fieldType: "proof_point", text: "Cuts payroll cycles from 5–7 days to as fast as 2 days.", tier2Topic: false, sensitivity: "public" },
    ],
  },
  {
    id: "prod_sidekick",
    slug: "sidekick",
    displayName: "Sidekick",
    status: "active",
    oneLiner:
      "Sprout's built-in AI companion for HR, Payroll, and Compliance, embedded inside Sprout HR for employees, managers, and HR teams.",
    competitors: ["Darwinbox Super Agent", "SAP SuccessFactors Joule", "PeopleStrong Jinie", "Workday Assistant", "Adrenalin SARA"],
    sourceDocument: SOURCE_DOC,
    retrievedVersion: VERSION,
    facts: [
      { id: "sk_cap_companion", layer: "spec", fieldType: "capability", text: "Role-aware conversational interface embedded in Sprout HR (web and mobile).", tier2Topic: true, sensitivity: "public" },
      { id: "sk_cap_selfservice", layer: "spec", fieldType: "capability", text: "Securely retrieves leave balances, attendance, payslips, and employment data, and can file leaves, log breaks, and generate COA/COE once configured by the admin.", tier2Topic: true, sensitivity: "public" },
      { id: "sk_cap_explain", layer: "spec", fieldType: "capability", text: "Explains payslip breakdowns and PH labor concepts in plain language as non-legal guidance.", tier2Topic: true, sensitivity: "public" },
      { id: "sk_out_workload", layer: "story", fieldType: "outcome", text: "Up to 50% reduction in HR administrative workload.", tier2Topic: false, sensitivity: "public" },
      { id: "sk_out_disputes", layer: "story", fieldType: "outcome", text: "Up to 60% reduction in payroll errors and disputes.", tier2Topic: false, sensitivity: "public" },
      { id: "sk_boundary", layer: "story", fieldType: "limitation", text: "Sidekick assists and prepares; humans retain decision control. Not for users seeking legal advice or guaranteed compliance outcomes.", tier2Topic: true, sensitivity: "public" },
      { id: "sk_pricing", layer: "commercial", fieldType: "pricing", text: "Free for all Sprout clients with monthly free credits that refresh; extra credits can be purchased beyond the monthly allocation.", tier2Topic: true, sensitivity: "internal" },
    ],
  },
  {
    id: "prod_readycash",
    slug: "readycash",
    displayName: "ReadyCash",
    status: "active",
    oneLiner:
      "A salary advance benefit embedded in the Sprout HRIS that gives Filipino employees instant access to emergency cash, repaid via automatic payroll deductions, at zero cost to employers.",
    competitors: ["SAVii", "Traditional Banks", "Neobanks (GCash, Maya, Tonik)", "B2C E-Lenders", "SSS/GSIS"],
    sourceDocument: SOURCE_DOC,
    retrievedVersion: VERSION,
    facts: [
      { id: "rc_cap_instant", layer: "spec", fieldType: "capability", text: "Instant cash disbursement with funds landing in the employee's payroll bank account in 2–3 minutes, no approval period.", tier2Topic: false, sensitivity: "public" },
      { id: "rc_cap_repay", layer: "spec", fieldType: "capability", text: "Automated payroll deduction repayment, deducted bi-monthly via payroll with no manual tracking.", tier2Topic: false, sensitivity: "public" },
      { id: "rc_int_netbank", layer: "spec", fieldType: "integration", text: "Powered by Netbank, a BSP-regulated, PDIC-insured Philippine bank that fully funds and disburses the loans.", tier2Topic: true, sensitivity: "public" },
      { id: "rc_pricing", layer: "commercial", fieldType: "pricing", text: "Free for employers. Employees pay a 5–8% convenience fee per advance; maximum loanable amount ₱50,000; 3-month max term repaid bi-monthly.", tier2Topic: true, sensitivity: "internal" },
      { id: "rc_proof_turnover", layer: "story", fieldType: "proof_point", text: "20% reduction in staff turnover among companies using ReadyCash.", tier2Topic: false, sensitivity: "public" },
      { id: "rc_who_not", layer: "story", fieldType: "who_not_for", text: "Not for companies not on Sprout HR and Payroll; ReadyCash cannot be deployed outside the Sprout ecosystem.", tier2Topic: false, sensitivity: "public" },
    ],
  },
  {
    id: "prod_peoplebox",
    slug: "peoplebox-ai",
    displayName: "Peoplebox.ai",
    status: "active",
    oneLiner:
      "An AI-powered performance and talent intelligence platform that integrates directly with Sprout HR, built for enterprises that need structured performance, development, and compensation governance at scale.",
    competitors: ["Darwinbox", "PeopleStrong", "Workday", "Oracle Fusion HCM", "Omni HR"],
    sourceDocument: SOURCE_DOC,
    retrievedVersion: VERSION,
    facts: [
      { id: "pb_cap_goals", layer: "spec", fieldType: "capability", text: "Goals management across OKR, KPI, MBO, BSC, KRA to cascade strategy into measurable outcomes.", tier2Topic: false, sensitivity: "public" },
      { id: "pb_cap_reviews", layer: "spec", fieldType: "capability", text: "AI-supported performance reviews and 360 feedback with configurable cycles and AI writing assistance.", tier2Topic: true, sensitivity: "public" },
      { id: "pb_out_cycle", layer: "story", fieldType: "outcome", text: "Reduce review cycle admin time by up to 30%.", tier2Topic: false, sensitivity: "public" },
      { id: "pb_pricing", layer: "commercial", fieldType: "pricing", text: "Performance Base ₱200/HC; Talent ₱90/HC; Compensation ₱100/HC; Nova AI ₱45/HC; minimum 50 HC.", tier2Topic: true, sensitivity: "confidential" },
    ],
  },
  {
    id: "prod_foresight",
    slug: "foresight",
    displayName: "Foresight",
    status: "not_released",
    oneLiner:
      "An AI-assisted People Intelligence Platform that delivers actionable workforce and payroll analytics. [Not yet released.]",
    competitors: ["Visier", "One Model", "Crunchr", "Orgvue", "ChartHop"],
    sourceDocument: SOURCE_DOC,
    retrievedVersion: VERSION,
    facts: [
      { id: "fs_cap_digest", layer: "spec", fieldType: "capability", text: "Weekly email digest highlighting key trends, performance shifts, and AI-powered recommendations.", tier2Topic: true, sensitivity: "internal" },
      { id: "fs_roadmap", layer: "spec", fieldType: "roadmap", text: "Roadmap, pricing, and proof points are TBD. Not yet released.", tier2Topic: true, sensitivity: "confidential" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Query surface                                                      */
/* ------------------------------------------------------------------ */

export const gtmStudioProductService = {
  listProducts(): { slug: string; displayName: string; status: ProductRecord["status"] }[] {
    return PRODUCTS.map((p) => ({ slug: p.slug, displayName: p.displayName, status: p.status }));
  },

  getProduct(slug: string): ProductRecord | undefined {
    return PRODUCTS.find((p) => p.slug === slug);
  },

  /** Public facts only — what is safe to surface in buyer-facing synthesis. */
  publicFacts(slug: string): ProductFact[] {
    return this.getProduct(slug)?.facts.filter((f) => f.sensitivity === "public") ?? [];
  },

  competitorsFor(slug: string): string[] {
    return this.getProduct(slug)?.competitors ?? [];
  },

  /**
   * Build a verified ProductClaim with full GTM Studio provenance.
   * Returns an UNVERIFIED claim (no provenance) if the fact cannot be located,
   * so the caller never presents an unsupported product claim as fact.
   */
  buildClaim(slug: string, factId: string, timestamp: string): ProductClaim {
    const product = this.getProduct(slug);
    const fact = product?.facts.find((f) => f.id === factId);
    if (!product || !fact) {
      return {
        id: `claim_${factId}`,
        text: "",
        status: "unverified",
        note: "No matching GTM Studio fact. Do not present as fact. Route to Product Marketing / Product owner to validate.",
      };
    }
    return {
      id: `claim_${factId}`,
      text: fact.text,
      status: "verified",
      gtmSourceDocument: product.sourceDocument,
      productId: product.id,
      featureId: fact.id,
      sourceSection: `${fact.layer} · ${fact.fieldType}`,
      retrievedVersion: product.retrievedVersion,
      timestamp,
    };
  },

  /**
   * Attempt to verify a free-text product claim against GTM Studio.
   * Naive token-overlap match — a stand-in for retrieval. If nothing matches,
   * the claim is returned UNVERIFIED with a human-review hint.
   */
  verifyText(slug: string, text: string, timestamp: string): ProductClaim {
    const product = this.getProduct(slug);
    if (!product) {
      return {
        id: `claim_${hash(text)}`,
        text,
        status: "unverified",
        note: "No GTM Studio product selected for this claim. Route to Product Marketing to validate.",
      };
    }
    const match = bestMatch(text, product.facts);
    if (match && match.score >= 0.34) {
      return {
        id: `claim_${hash(text)}`,
        text,
        status: "verified",
        gtmSourceDocument: product.sourceDocument,
        productId: product.id,
        featureId: match.fact.id,
        sourceSection: `${match.fact.layer} · ${match.fact.fieldType}`,
        retrievedVersion: product.retrievedVersion,
        timestamp,
      };
    }
    return {
      id: `claim_${hash(text)}`,
      text,
      status: "unverified",
      note: `Could not trace this product claim to GTM Studio for ${product.displayName}. Mark UNVERIFIED; route to a Product Marketing or Product owner to validate before publishing.`,
    };
  },

  /** Topics that force Tier 2 if a verified fact touches them. */
  isTier2Topic(slug: string, factId: string): boolean {
    return this.getProduct(slug)?.facts.find((f) => f.id === factId)?.tier2Topic ?? false;
  },
};

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function bestMatch(text: string, facts: ProductFact[]): { fact: ProductFact; score: number } | null {
  const a = new Set(tokens(text));
  if (a.size === 0) return null;
  let best: { fact: ProductFact; score: number } | null = null;
  for (const fact of facts) {
    const b = new Set(tokens(fact.text));
    let overlap = 0;
    a.forEach((t) => {
      if (b.has(t)) overlap++;
    });
    const score = overlap / a.size;
    if (!best || score > best.score) best = { fact, score };
  }
  return best;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
