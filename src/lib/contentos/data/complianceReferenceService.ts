/**
 * Compliance Reference Service
 * ----------------------------
 * Placeholder for PH HR, payroll, and compliance references (DOLE, SSS, BIR,
 * PhilHealth, Pag-IBIG). This service provides factual references only and
 * MUST NOT provide legal advice. Regulatory content is always Tier 2 and
 * requires a non-legal-advice disclaimer.
 */

export interface ComplianceReference {
  body: string;
  topic: string;
  summary: string;
  note: string;
  /** Authoritative government source URL for external citations. */
  url: string;
}

const REFERENCES: ComplianceReference[] = [
  { body: "DOLE", topic: "Labor standards", summary: "Minimum labor standards, holiday pay, overtime, night differential rules.", note: "Reference only. Not legal advice.", url: "https://www.dole.gov.ph/" },
  { body: "BIR", topic: "Withholding tax / 2316 / Alphalist", summary: "Year-end tax reconciliation, annualization, and statutory reporting.", note: "Reference only. Not legal advice.", url: "https://www.bir.gov.ph/" },
  { body: "SSS", topic: "Social security contributions", summary: "Employer/employee contribution schedules and remittance.", note: "Reference only. Not legal advice.", url: "https://www.sss.gov.ph/" },
  { body: "PhilHealth", topic: "Health insurance contributions", summary: "Contribution tables and reporting obligations.", note: "Reference only. Not legal advice.", url: "https://www.philhealth.gov.ph/" },
  { body: "Pag-IBIG", topic: "Housing fund contributions", summary: "Contribution and remittance obligations.", note: "Reference only. Not legal advice.", url: "https://www.pagibigfund.gov.ph/" },
];

export const NON_LEGAL_ADVICE_DISCLAIMER =
  "This content is general information for Philippine employers and is not legal advice. For specific situations, consult qualified counsel or the relevant government agency.";

export const complianceReferenceService = {
  list(): ComplianceReference[] {
    return REFERENCES;
  },
  forBody(body: string): ComplianceReference[] {
    const b = body.toLowerCase();
    return REFERENCES.filter((r) => r.body.toLowerCase().includes(b) || b.includes(r.body.toLowerCase()));
  },
  disclaimer(): string {
    return NON_LEGAL_ADVICE_DISCLAIMER;
  },
};
