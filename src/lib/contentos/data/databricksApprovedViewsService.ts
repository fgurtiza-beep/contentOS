/**
 * Databricks Approved Views Service
 * ---------------------------------
 * NOT a raw Databricks connection. Exposes only a curated set of approved views
 * ContentOS may query, each carrying metadata (date range, sample size,
 * sensitivity, owner, refresh date). This is the single biggest factual-accuracy
 * lever, so the guardrails below are enforced when sub-agents cite a dataset.
 */

export interface ApprovedView {
  datasetId: string;
  name: string;
  dateRange: string;
  sampleSizeN: number;
  sensitivity: "low" | "medium" | "high";
  generalizable: boolean;
  owner: string;
  lastRefreshed: string;
}

const VIEWS: ApprovedView[] = [
  { datasetId: "dv_payroll_accuracy_2026", name: "Payroll accuracy benchmark (PH SMEs)", dateRange: "2025-01 to 2026-03", sampleSizeN: 1240, sensitivity: "low", generalizable: true, owner: "Data Science", lastRefreshed: "2026-04-15" },
  { datasetId: "dv_attrition_signals_2026", name: "Attrition early-warning signals", dateRange: "2025-06 to 2026-05", sampleSizeN: 280, sensitivity: "medium", generalizable: false, owner: "Data Science", lastRefreshed: "2026-05-20" },
  { datasetId: "dv_compliance_penalties", name: "DOLE/BIR penalty exposure index", dateRange: "2024-01 to 2025-12", sampleSizeN: 640, sensitivity: "high", generalizable: true, owner: "Compliance", lastRefreshed: "2026-02-10" },
];

export const SMALL_SAMPLE_THRESHOLD = 300;

export const databricksApprovedViewsService = {
  list(): ApprovedView[] {
    return VIEWS;
  },
  get(datasetId: string): ApprovedView | undefined {
    return VIEWS.find((v) => v.datasetId === datasetId);
  },
  /** Guardrail evaluation for citing a dataset. */
  citationGuardrails(datasetId: string): { allowed: boolean; warnings: string[]; meta?: ApprovedView } {
    const v = this.get(datasetId);
    if (!v) return { allowed: false, warnings: ["Dataset is not an approved view. Block citation."] };
    const warnings: string[] = [];
    if (v.sampleSizeN < SMALL_SAMPLE_THRESHOLD) warnings.push(`Small sample (n=${v.sampleSizeN}). Do not generalize.`);
    if (!v.generalizable) warnings.push("View is flagged not generalizable. Tag insight as observed, not a broad claim.");
    if (v.sensitivity === "high") warnings.push(`Sensitive view (owner: ${v.owner}). Requires explicit owner approval before citing.`);
    return { allowed: v.sensitivity !== "high", warnings, meta: v };
  },
};
