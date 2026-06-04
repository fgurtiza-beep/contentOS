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

const ASSETS: LibraryAsset[] = [
  { id: "a1", title: "State of HR in the Philippines 2026", type: "report", url: "https://sprout.ph/resources/state-of-hr-2026", summary: "Annual benchmark on PH HR priorities, payroll, and compliance.", topics: ["compliance", "payroll", "people strategy"], icpTags: ["chro", "ceo_owner"] },
  { id: "a2", title: "A practical 13th month pay checklist", type: "blog", url: "https://sprout.ph/blog/13th-month-pay-checklist", summary: "Step-by-step guide to computing and filing 13th month pay.", topics: ["payroll", "compliance", "annualization"], icpTags: ["sme_hr", "comp_ben"] },
  { id: "a3", title: "Sprout Payroll product page", type: "product_page", url: "https://sprout.ph/payroll", summary: "Automated PH-compliant payroll overview.", topics: ["payroll", "statutory compliance"], icpTags: ["sme_hr", "comp_ben"] },
  { id: "a4", title: "How automation removed 700+ monthly timekeeping errors", type: "blog", url: "https://sprout.ph/blog/timekeeping-automation", summary: "Case-driven look at attendance and timekeeping automation.", topics: ["timekeeping", "automation"], icpTags: ["sme_hr"] },
  { id: "a5", title: "Webinar: Reducing payroll disputes with a single source of truth", type: "webinar", url: "https://sprout.ph/webinars/payroll-disputes", summary: "On-demand session on syncing time and payroll.", topics: ["payroll", "single source of truth"], icpTags: ["chro", "comp_ben"] },
  { id: "a6", title: "Financial wellness and retention: the ReadyCash story", type: "blog", url: "https://sprout.ph/blog/financial-wellness-retention", summary: "How salary advance benefits affect turnover.", topics: ["financial wellness", "retention", "readycash"], icpTags: ["chro", "ceo_owner"] },
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
