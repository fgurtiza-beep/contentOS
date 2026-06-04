/**
 * Campaign Knowledge Service
 * --------------------------
 * Placeholder for active campaigns, hooks, positioning, and approved CTAs.
 */

export interface Campaign {
  id: string;
  name: string;
  hook: string;
  positioning: string;
  approvedCtas: string[];
}

const CAMPAIGNS: Campaign[] = [
  {
    id: "people_first_ai",
    name: "People-First AI for Work",
    hook: "Put people first while AI handles the admin.",
    positioning: "Sprout pairs Philippine-built HR and payroll with AI that assists, never replaces, human judgment.",
    approvedCtas: ["Book a demo", "See Sprout in action", "Talk to our team"],
  },
  {
    id: "compliance_confidence",
    name: "Compliance Confidence",
    hook: "Stay audit-ready without the stress.",
    positioning: "Automate 100+ PH labor rules and keep every statutory report accurate and on time.",
    approvedCtas: ["Get the compliance checklist", "Book a compliance walkthrough"],
  },
  {
    id: "state_of_hr",
    name: "State of HR (Thought Leadership)",
    hook: "What Philippine HR leaders are prioritizing this year.",
    positioning: "Evidence-led benchmarks for PH HR, payroll, and people strategy.",
    approvedCtas: ["Download the report", "Register for the webinar"],
  },
];

export const campaignKnowledgeService = {
  list(): Campaign[] {
    return CAMPAIGNS;
  },
  get(id: string): Campaign | undefined {
    return CAMPAIGNS.find((c) => c.id === id || c.name === id);
  },
  resolve(name: string): Campaign | undefined {
    if (!name) return undefined;
    const n = name.toLowerCase();
    return CAMPAIGNS.find((c) => c.name.toLowerCase().includes(n) || c.id === n);
  },
};
