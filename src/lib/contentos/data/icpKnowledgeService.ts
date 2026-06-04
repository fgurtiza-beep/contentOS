/**
 * ICP Knowledge Service
 * ---------------------
 * Placeholder for richer ICP profiles than the intake dropdown: pain points,
 * buying triggers, objections, preferred language, content preferences.
 */

export interface ICPProfile {
  id: string;
  label: string;
  painPoints: string[];
  buyingTriggers: string[];
  objections: string[];
  preferredLanguage: string[];
  contentPreferences: string[];
}

const ICPS: ICPProfile[] = [
  {
    id: "sme_hr",
    label: "SME HR Leader",
    painPoints: ["Manual payroll and timekeeping", "Compliance anxiety (DOLE, BIR, SSS, PhilHealth, Pag-IBIG)", "Wearing multiple hats with no specialist support"],
    buyingTriggers: ["Recurring payroll errors", "Rapid headcount growth", "A failed or stressful audit"],
    objections: ["Cost vs. a spreadsheet", "Migration effort", "Will employees adopt it"],
    preferredLanguage: ["practical", "reassuring", "Philippine-specific"],
    contentPreferences: ["how-to blogs", "checklists", "short webinars"],
  },
  {
    id: "chro",
    label: "CHRO / People Leader",
    painPoints: ["Fragmented workforce data", "No single source of truth across HR, Finance, Ops", "Attrition and engagement risk surfacing too late"],
    buyingTriggers: ["Board-level reporting demands", "Scaling without adding HR headcount", "Digital transformation mandate"],
    objections: ["Change management at scale", "Integration with existing stack", "Data security and governance"],
    preferredLanguage: ["strategic", "outcome-led", "evidence-backed"],
    contentPreferences: ["thought leadership reports", "executive one-pagers", "benchmark data"],
  },
  {
    id: "comp_ben",
    label: "Comp & Ben Manager",
    painPoints: ["Year-end annualization stress", "Statutory contribution accuracy", "Defensible compensation cycles"],
    buyingTriggers: ["13th month / annualization season", "Audit findings", "Promotion / merit planning cycles"],
    objections: ["Accuracy guarantees", "Audit trail completeness"],
    preferredLanguage: ["precise", "compliance-aware"],
    contentPreferences: ["detailed guides", "compliance updates"],
  },
  {
    id: "ceo_owner",
    label: "CEO / Business Owner (SME)",
    painPoints: ["Admin work distracting leaders from growth", "Lack of unified workforce visibility"],
    buyingTriggers: ["Scaling the business", "Wanting leaders focused on needle-moving work"],
    objections: ["ROI", "Time to value"],
    preferredLanguage: ["plain-spoken", "ROI-focused"],
    contentPreferences: ["case studies", "short videos", "one-pagers"],
  },
];

export const icpKnowledgeService = {
  list(): ICPProfile[] {
    return ICPS;
  },
  get(id: string): ICPProfile | undefined {
    return ICPS.find((i) => i.id === id || i.label === id);
  },
  resolve(name: string): ICPProfile | undefined {
    const n = name.toLowerCase();
    return ICPS.find((i) => i.label.toLowerCase().includes(n) || i.id === n);
  },
};
