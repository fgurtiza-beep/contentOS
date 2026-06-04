/**
 * Seed jobs
 * ---------
 * Builds a realistic set of jobs in varied states by running the real
 * orchestrator pipeline under a deterministic clock, so the dashboard, QA
 * workspace, human-review queue, and audit trail are populated on first load.
 */

import type { AuditEntry, Job, StandardizedBrief } from "../schemas/contentos";
import { intake, runCreatorAndQA } from "../orchestrator/contentOrchestrator";
import { runWithDeterministicClock, SEED_NOW } from "../util";

function baseBrief(partial: Partial<StandardizedBrief>): StandardizedBrief {
  return {
    title: "",
    objective: "",
    jobType: "blog",
    primaryICP: "SME HR Leader",
    secondaryICPs: [],
    industry: "Professional services",
    segment: "SME",
    persona: "HR generalist wearing multiple hats",
    readiness: "problem_aware",
    contentIntent: ["awareness"],
    tone: "professional, human, helpful",
    length: "1,200 words",
    channel: "blog",
    mustInclude: [],
    mustAvoid: [],
    product: "",
    cta: "",
    campaign: "",
    seoKeyword: "",
    competitor: "",
    smeNotes: "",
    painPoints: [],
    complianceContext: "",
    sourceAsset: null,
    landingPageType: "",
    datasets: [],
    desiredOutputs: [],
    volumeTarget: "",
    riskSensitivity: "low",
    ...partial,
  };
}

export function seedJobs(): { jobs: Job[]; audits: AuditEntry[] } {
  return runWithDeterministicClock(SEED_NOW, () => {
    const jobs: Job[] = [];
    const audits: AuditEntry[] = [];

    const push = (brief: StandardizedBrief, owner: string) => {
      const created = intake(brief, owner, SEED_NOW);
      const ran = runCreatorAndQA(created.job, SEED_NOW);
      jobs.push(ran.job);
      audits.push(...created.audits, ...ran.audits);
      return ran.job;
    };

    // 1) Tier 1 blog with a verified + an unverified product claim → QA review ready
    push(
      baseBrief({
        title: "Why Philippine SMEs lose days to manual payroll (and what to do about it)",
        objective: "Help SME HR leaders see the cost of manual payroll and the path to automation.",
        jobType: "blog",
        primaryICP: "SME HR Leader",
        product: "sprout-payroll",
        seoKeyword: "automated payroll Philippines",
        painPoints: ["Manual payroll and timekeeping", "Compliance anxiety"],
        contentIntent: ["awareness", "consideration"],
        campaign: "Compliance Confidence",
        desiredOutputs: [{ channel: "blog", format: "blog", quantity: 1 }],
      }),
      "marketing@sprout.ph",
    );

    // 2) Tier 2 regulatory conversion → routed to human review
    push(
      baseBrief({
        title: "New DOLE advisory: what PH employers should do now",
        objective: "Translate a DOLE advisory into practical employer guidance with a Sprout context.",
        jobType: "convert_regulatory_update",
        primaryICP: "CHRO / People Leader",
        riskSensitivity: "high",
        complianceContext: "DOLE labor advisory affecting overtime and night differential.",
        regulatory: {
          issuingBody: "DOLE",
          effectiveDate: "2026-07-01",
          affectedAudience: "All private-sector employers",
          uncertaintyAreas: "Scope of covered industries",
          legalReviewNeeded: true,
          sproutCTAAllowed: true,
        },
        sourceAsset: {
          id: "src_dole_001",
          title: "DOLE Labor Advisory No. 0X-2026",
          origin: "regulatory",
          assetType: "regulation",
          url: "https://dole.gov.ph/advisory",
          content:
            "The advisory clarifies computation of night-differential and overtime for covered workers, effective the first of July.",
          approved: true,
        },
        desiredOutputs: [
          { channel: "blog", format: "employer guidance", quantity: 1 },
          { channel: "LinkedIn", format: "post", quantity: 2 },
        ],
      }),
      "marketing@sprout.ph",
    );

    // 3) Repurposing a Sprout report into LinkedIn + email → QA per derivative
    push(
      baseBrief({
        title: "Repurpose: State of HR in the Philippines 2026",
        objective: "Extend the State of HR report into channel-native derivatives.",
        jobType: "repurpose_sprout_asset",
        primaryICP: "CHRO / People Leader",
        contentIntent: ["awareness", "consideration", "conversion"],
        campaign: "State of HR (Thought Leadership)",
        sourceAsset: {
          id: "src_sohr_2026",
          title: "State of HR in the Philippines 2026",
          origin: "sprout",
          assetType: "report",
          url: "https://sprout.ph/resources/state-of-hr-2026",
          content:
            "Annual benchmark covering PH HR priorities, payroll automation, compliance pressure, and people strategy trends.",
          approved: true,
        },
        desiredOutputs: [
          { channel: "LinkedIn", format: "post", quantity: 3 },
          { channel: "email", format: "newsletter", quantity: 1 },
        ],
      }),
      "marketing@sprout.ph",
    );

    // 4) Clean-ish social post (Tier 0) → closer to pass
    push(
      baseBrief({
        title: "Sidekick: the AI companion inside Sprout HR",
        objective: "Raise awareness of Sidekick for existing Sprout HR users.",
        jobType: "social_post",
        primaryICP: "SME HR Leader",
        product: "sidekick",
        contentIntent: ["awareness"],
        channel: "social_post",
        desiredOutputs: [{ channel: "LinkedIn", format: "post", quantity: 1 }],
      }),
      "marketing@sprout.ph",
    );

    return { jobs, audits };
  });
}
