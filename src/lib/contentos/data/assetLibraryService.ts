/**
 * Asset Library Service
 * ---------------------
 * Placeholder for a searchable index of past published Sprout content: blogs,
 * reports, webinars, landing pages, product pages, with URLs, summaries, topics
 * and ICP tags. Supplies internal-link suggestions for the QA framework (rubric
 * 5a requires 3–5 internal Sprout links per blog) and prevents the Production
 * Agent from rewriting content that already exists.
 */

export interface LibraryAsset {
  id: string;
  title: string;
  type: "blog" | "report" | "webinar" | "landing_page" | "product_page";
  url: string;
  summary: string;
  topics: string[];
  icpTags: string[];
}

// REAL, verified Sprout URLs (checked live — no invented paths). If you add an
// asset, confirm the URL returns 200 before listing it here.
const ASSETS: LibraryAsset[] = [
  { id: "a1", title: "How to procure HR & payroll software for Philippine companies", type: "blog", url: "https://sprout.ph/articles/procure-hr-payroll-software-philippine-companies/", summary: "A buyer's guide to evaluating HR and payroll software in the PH.", topics: ["payroll", "software", "procurement", "compliance"], icpTags: ["sme_hr", "comp_ben", "chro"] },
  { id: "a2", title: "How to evaluate a managed payroll provider in the Philippines", type: "blog", url: "https://sprout.ph/articles/evaluate-managed-payroll-provider-philippines/", summary: "What to look for when outsourcing payroll to a managed provider.", topics: ["payroll", "outsourcing", "managed payroll", "compliance"], icpTags: ["sme_hr", "chro", "ceo_owner"] },
  { id: "a3", title: "What is an HRIS and why do you need one?", type: "blog", url: "https://sprout.ph/articles/what-is-an-hris-why-do-you-need-one/", summary: "A plain explainer of HR information systems for growing PH teams.", topics: ["hris", "hr visibility", "reporting", "scaling"], icpTags: ["sme_hr", "chro"] },
  { id: "a4", title: "Sprout Payroll (Payroll Management)", type: "product_page", url: "https://sprout.ph/product/payroll-management", summary: "Automated, PH-compliant payroll software.", topics: ["payroll", "statutory compliance", "automation"], icpTags: ["sme_hr", "comp_ben"] },
  { id: "a5", title: "Sprout Payroll Outsourcing", type: "product_page", url: "https://sprout.ph/product/payroll-outsourcing", summary: "Managed payroll service on the Sprout platform.", topics: ["payroll", "outsourcing", "managed payroll"], icpTags: ["sme_hr", "chro"] },
  { id: "a6", title: "Philippine business compliance hub", type: "landing_page", url: "https://sprout.ph/philippines-business-compliance", summary: "Resources on PH statutory and labor compliance.", topics: ["compliance", "statutory", "dole", "bir", "13th month"], icpTags: ["chro", "comp_ben", "sme_hr"] },
  { id: "a7", title: "How AI is reshaping Philippine business in 2026", type: "blog", url: "https://sprout.ph/articles/ai-reshaping-philippine-business-2026/", summary: "Trends on AI adoption across PH HR and operations.", topics: ["ai", "automation", "people strategy", "adoption"], icpTags: ["chro", "ceo_owner"] },
];

export const assetLibraryService = {
  list(): LibraryAsset[] {
    return ASSETS;
  },
  /** Naive topic/ICP relevance search for internal-link suggestions. */
  search(topics: string[], icpId?: string, limit = 5): LibraryAsset[] {
    const wanted = topics.map((t) => t.toLowerCase());
    return ASSETS.map((a) => {
      let score = 0;
      a.topics.forEach((t) => {
        if (wanted.some((w) => t.includes(w) || w.includes(t))) score += 2;
      });
      if (icpId && a.icpTags.includes(icpId)) score += 1;
      return { a, score };
    })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map((x) => x.a);
  },
};
