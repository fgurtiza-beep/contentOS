"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { jobStore } from "@/lib/contentos/store/useStore";
import { CURRENT_USER } from "@/lib/contentos/store/uiStore";
import {
  JOB_TYPES,
  type AgentLane,
  type ContentIntent,
  type JobType,
  type Readiness,
  type RiskSensitivity,
  type StandardizedBrief,
} from "@/lib/contentos/schemas/contentos";
import { TYPE_META } from "@/lib/contentos/uiMeta";
import { gtmStudioProductService } from "@/lib/contentos/data/gtmStudioProductService";
import { icpKnowledgeService } from "@/lib/contentos/data/icpKnowledgeService";
import { campaignKnowledgeService } from "@/lib/contentos/data/campaignKnowledgeService";
import { databricksApprovedViewsService } from "@/lib/contentos/data/databricksApprovedViewsService";
import { Stepper, AccordionSection } from "./ui";

const READINESS: Readiness[] = ["unaware", "problem_aware", "solution_aware", "evaluating", "decision"];
const INTENTS: ContentIntent[] = ["awareness", "consideration", "evaluation", "conversion", "retention", "advocacy"];
const REPURPOSE_CHANNELS = ["LinkedIn", "X", "Instagram", "Email", "Blog"];

const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

type Step = "lane" | "type" | "brief";

export function JobIntakeForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("lane");
  const [lane, setLane] = useState<AgentLane | null>(null);
  const [jobType, setJobType] = useState<JobType | null>(null);

  return (
    <div className="content">
      <div className="page-head">
        <h1>New content job</h1>
        <p>
          {step === "lane" && "Start by choosing the kind of work. ContentOS reveals only what each step needs."}
          {step === "type" && "Pick a content type. The brief appears once you choose."}
          {step === "brief" && "The essentials are open; advanced settings are tucked away until you need them."}
        </p>
      </div>

      <div className="wiz-crumb">
        <button className={`seg ${step === "lane" ? "current" : "done"}`} onClick={() => setStep("lane")}>1 · Workflow</button>
        {lane && <span className="arrow">›</span>}
        {lane && <button className={`seg ${step === "type" ? "current" : "done"}`} onClick={() => setStep("type")}>{lane === "repurposing" ? "Content Repurposing" : "New Content"}</button>}
        {jobType && step === "brief" && (<><span className="arrow">›</span><span className="seg current">{JOB_TYPES.find((t) => t.value === jobType)?.label}</span></>)}
      </div>

      {step === "lane" && (
        <div className="choice-grid two">
          <button className="choice" onClick={() => { setLane("production"); setJobType(null); setStep("type"); }}>
            <div className="ci">✦</div>
            <div className="ct">New Content</div>
            <div className="cd">Create net-new content from a structured brief — blogs, ebooks, social, email, landing pages, and more.</div>
            <div className="cgo">Select →</div>
          </button>
          <button className="choice repurpose" onClick={() => { setLane("repurposing"); setJobType(null); setStep("type"); }}>
            <div className="ci">♺</div>
            <div className="ct">Content Repurposing</div>
            <div className="cd">Transform one approved source asset into channel-native derivatives, following IMD 2.0 doctrine.</div>
            <div className="cgo">Select →</div>
          </button>
        </div>
      )}

      {step === "type" && lane && (
        <div className="choice-grid three">
          {JOB_TYPES.filter((t) => t.lane === lane).map((t) => {
            const m = TYPE_META[t.value];
            return (
              <button key={t.value} className={`choice ${lane === "repurposing" ? "repurpose" : ""} ${jobType === t.value ? "selected" : ""}`} onClick={() => { setJobType(t.value); setStep("brief"); }}>
                {jobType === t.value && <span className="checkmark">✓</span>}
                <div className="ci">{m.icon}</div>
                <div className="ct">{t.label}</div>
                <div className="cd">{m.desc}</div>
                <div className="meta-line" style={{ marginTop: 6 }}>
                  <span>📏 {m.outputSize}</span>
                  <span>⏱ {m.effort}</span>
                </div>
                <div className="cgo">{m.cta} →</div>
              </button>
            );
          })}
        </div>
      )}

      {step === "brief" && jobType && lane && (
        <BriefForm jobType={jobType} lane={lane} onSubmit={(id) => router.push(`/contentos/jobs/${id}`)} />
      )}
    </div>
  );
}

function BriefForm({ jobType, lane, onSubmit }: { jobType: JobType; lane: AgentLane; onSubmit: (id: string) => void }) {
  const isRepurpose = lane === "repurposing";
  const isRegulatory = jobType === "convert_regulatory_update";
  const isCompetitor = jobType === "reframe_competitor_pov";
  const m = TYPE_META[jobType];

  const products = gtmStudioProductService.listProducts();
  const icps = icpKnowledgeService.list();
  const campaigns = campaignKnowledgeService.list();
  const views = databricksApprovedViewsService.list();

  const [f, setF] = useState({
    title: "", objective: "",
    primaryICP: "SME HR Leader", secondaryICPs: "", industry: "Professional services", segment: "SME",
    persona: "HR generalist wearing multiple hats", readiness: "problem_aware" as Readiness,
    contentIntent: ["awareness"] as ContentIntent[], tone: "professional, human, helpful", length: m.outputSize, channel: jobType,
    mustInclude: "", mustAvoid: "", product: "", cta: "", campaign: "", seoKeyword: "", competitor: "",
    smeNotes: "", painPoints: "", complianceContext: "", specialInstructions: "",
    landingPageType: "" as StandardizedBrief["landingPageType"], datasets: [] as string[],
    amount: m.amountOptions[0] ?? 1, riskSensitivity: "low" as RiskSensitivity,
    srcTitle: "", srcType: "report", srcUrl: "", srcContent: "", srcApproved: true,
    issuingBody: "DOLE", effectiveDate: "", affectedAudience: "", uncertaintyAreas: "", legalReviewNeeded: true, sproutCTAAllowed: true,
    competitorName: "", allowedToName: false, comparisonsPermitted: false, differentiationPillars: "", prohibitedClaims: "pricing, security, uptime",
    mustCite: true, directQuotesAllowed: false, dataMisrepresentationRisks: "", requiredSources: "",
    channelQtys: { LinkedIn: 3, X: 0, Instagram: 0, Email: 1, Blog: 0 } as Record<string, number>,
  });
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const toggleIntent = (i: ContentIntent) => set("contentIntent", f.contentIntent.includes(i) ? f.contentIntent.filter((x) => x !== i) : [...f.contentIntent, i]);
  const toggleDataset = (id: string) => set("datasets", f.datasets.includes(id) ? f.datasets.filter((x) => x !== id) : [...f.datasets, id]);

  const desiredOutputs = useMemo(() => {
    if (isRepurpose) {
      return REPURPOSE_CHANNELS.filter((c) => f.channelQtys[c] > 0).map((c) => ({ channel: c, format: c === "Email" ? "newsletter" : c === "Blog" ? "blog" : "post", quantity: f.channelQtys[c] }));
    }
    return [{ channel: jobType, format: jobType, quantity: f.amount }];
  }, [isRepurpose, f.channelQtys, f.amount, jobType]);

  function submit() {
    const brief: StandardizedBrief = {
      title: f.title || "Untitled job", objective: f.objective, jobType,
      primaryICP: f.primaryICP, secondaryICPs: splitList(f.secondaryICPs), industry: f.industry, segment: f.segment,
      persona: f.persona, readiness: f.readiness, contentIntent: f.contentIntent.length ? f.contentIntent : ["awareness"],
      tone: f.tone, length: f.length, channel: isRepurpose ? desiredOutputs[0]?.channel ?? "LinkedIn" : f.channel,
      mustInclude: splitList(f.mustInclude), mustAvoid: splitList(f.mustAvoid), product: f.product, cta: f.cta,
      campaign: f.campaign, seoKeyword: f.seoKeyword, competitor: isCompetitor ? f.competitorName : f.competitor,
      smeNotes: [f.smeNotes, f.specialInstructions].filter(Boolean).join(" — "), painPoints: splitList(f.painPoints),
      complianceContext: f.complianceContext,
      sourceAsset: isRepurpose ? { id: "src_" + Date.now().toString(36), title: f.srcTitle || "Source asset", origin: isRegulatory ? "regulatory" : isCompetitor ? "competitor" : "sprout", assetType: f.srcType, url: f.srcUrl, content: f.srcContent || "Source content pending.", approved: f.srcApproved } : null,
      landingPageType: jobType === "landing_page" ? f.landingPageType || "campaign" : "",
      datasets: f.datasets, desiredOutputs, volumeTarget: String(isRepurpose ? desiredOutputs.reduce((a, o) => a + o.quantity, 0) : f.amount), riskSensitivity: f.riskSensitivity,
      regulatory: isRegulatory ? { issuingBody: f.issuingBody, effectiveDate: f.effectiveDate, affectedAudience: f.affectedAudience, uncertaintyAreas: f.uncertaintyAreas, legalReviewNeeded: f.legalReviewNeeded, sproutCTAAllowed: f.sproutCTAAllowed } : undefined,
      competitorAddendum: isCompetitor || f.competitor ? { competitorName: f.competitorName || f.competitor, allowedToNameCompetitor: f.allowedToName, comparisonsPermitted: f.comparisonsPermitted, differentiationPillars: splitList(f.differentiationPillars), prohibitedClaims: splitList(f.prohibitedClaims) } : undefined,
      research: jobType === "convert_external_report" ? { mustCite: f.mustCite, directQuotesAllowed: f.directQuotesAllowed, dataMisrepresentationRisks: f.dataMisrepresentationRisks, requiredSources: splitList(f.requiredSources) } : undefined,
    };
    onSubmit(jobStore.submitBrief(brief, CURRENT_USER));
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Section 1 — Required */}
      <AccordionSection num={1} title="Essentials" required defaultOpen>
        <div className="field"><label>Title</label><input type="text" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Working title of the asset" /></div>
        <div className="field"><label>Objective</label><textarea value={f.objective} onChange={(e) => set("objective", e.target.value)} placeholder="What should this content achieve?" /></div>
        <div className="row">
          <div className="field"><label>Content type</label><div className="chip" style={{ fontSize: 12 }}>{m.icon} {JOB_TYPES.find((t) => t.value === jobType)?.label}</div></div>
          <div className="field">
            <label>{isRepurpose ? "Outputs per channel" : "How many?"}</label>
            {isRepurpose ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {REPURPOSE_CHANNELS.map((c) => (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tiny" style={{ width: 72 }}>{c}</span>
                    <Stepper value={f.channelQtys[c]} min={0} max={10} onChange={(n) => set("channelQtys", { ...f.channelQtys, [c]: n })} />
                  </div>
                ))}
              </div>
            ) : (
              <Stepper value={f.amount} min={1} max={10} onChange={(n) => set("amount", n)} />
            )}
          </div>
        </div>
      </AccordionSection>

      {/* Section 2 — Audience */}
      <AccordionSection num={2} title="Audience" defaultOpen>
        <div className="row">
          <div className="field"><label>ICP</label><select value={f.primaryICP} onChange={(e) => set("primaryICP", e.target.value)}>{icps.map((i) => <option key={i.id} value={i.label}>{i.label}</option>)}</select></div>
          <div className="field"><label>Persona</label><input type="text" value={f.persona} onChange={(e) => set("persona", e.target.value)} /></div>
        </div>
        <div className="field"><label>Industry</label><input type="text" value={f.industry} onChange={(e) => set("industry", e.target.value)} /></div>
      </AccordionSection>

      {/* Section 3 — Content */}
      <AccordionSection num={3} title="Content">
        <div className="row">
          <div className="field"><label>Tone</label><input type="text" value={f.tone} onChange={(e) => set("tone", e.target.value)} /></div>
          <div className="field"><label>CTA</label><input type="text" value={f.cta} onChange={(e) => set("cta", e.target.value)} placeholder="Book a demo" /></div>
        </div>
        <div className="field">
          <label>Product <span className="hint">· GTM Studio is the only source of truth for product claims</span></label>
          <select value={f.product} onChange={(e) => set("product", e.target.value)}><option value="">None</option>{products.map((p) => <option key={p.slug} value={p.slug}>{p.displayName}{p.status !== "active" ? ` (${p.status})` : ""}</option>)}</select>
        </div>
        <div className="field">
          <label>Content intent</label>
          <div>{INTENTS.map((i) => <button key={i} className="chip" onClick={() => toggleIntent(i)} style={{ background: f.contentIntent.includes(i) ? "var(--ubas)" : "var(--ubas-light)", color: f.contentIntent.includes(i) ? "#fff" : "var(--ubas-deep)" }}>{i}</button>)}</div>
        </div>
      </AccordionSection>

      {/* Section 4 — Advanced (collapsed) */}
      <AccordionSection num={4} title="Advanced settings" hint="SEO, competitors, compliance, datasets, source asset">
        <div className="row">
          <div className="field"><label>SEO keyword</label><input type="text" value={f.seoKeyword} onChange={(e) => set("seoKeyword", e.target.value)} /></div>
          <div className="field"><label>Campaign</label><select value={f.campaign} onChange={(e) => set("campaign", e.target.value)}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
        </div>
        <div className="row">
          <div className="field"><label>Readiness</label><select value={f.readiness} onChange={(e) => set("readiness", e.target.value as Readiness)}>{READINESS.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</select></div>
          <div className="field"><label>Risk sensitivity</label><select value={f.riskSensitivity} onChange={(e) => set("riskSensitivity", e.target.value as RiskSensitivity)}><option value="low">low</option><option value="moderate">moderate</option><option value="high">high</option></select></div>
        </div>
        {!isCompetitor && <div className="field"><label>Competitor</label><input type="text" value={f.competitor} onChange={(e) => set("competitor", e.target.value)} placeholder="Named competitor (makes this Tier 2)" /></div>}
        <div className="field"><label>Compliance context <span className="hint">· any entry raises the risk tier</span></label><input type="text" value={f.complianceContext} onChange={(e) => set("complianceContext", e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Must include</label><input type="text" value={f.mustInclude} onChange={(e) => set("mustInclude", e.target.value)} /></div>
          <div className="field"><label>Must avoid</label><input type="text" value={f.mustAvoid} onChange={(e) => set("mustAvoid", e.target.value)} /></div>
        </div>
        <div className="field"><label>Pain points <span className="hint">· comma-separated</span></label><input type="text" value={f.painPoints} onChange={(e) => set("painPoints", e.target.value)} /></div>
        <div className="field"><label>SME notes</label><textarea value={f.smeNotes} onChange={(e) => set("smeNotes", e.target.value)} /></div>
        <div className="field"><label>Special instructions</label><textarea value={f.specialInstructions} onChange={(e) => set("specialInstructions", e.target.value)} /></div>
        <div className="field">
          <label>Databricks approved views <span className="hint">· only approved datasets may be cited</span></label>
          {views.map((v) => (
            <label key={v.datasetId} className="tiny" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, marginBottom: 4 }}>
              <input type="checkbox" checked={f.datasets.includes(v.datasetId)} onChange={() => toggleDataset(v.datasetId)} /> {v.name} <span className="faint">(n={v.sampleSizeN}, {v.sensitivity})</span>
            </label>
          ))}
        </div>

        {isRepurpose && (
          <div className="callout">
            <b>Source Asset (IMD 2.0)</b> — exactly one approved source asset. No cross-asset blending.
            <div className="field" style={{ marginTop: 8 }}><label>Source title</label><input type="text" value={f.srcTitle} onChange={(e) => set("srcTitle", e.target.value)} /></div>
            <div className="row">
              <div className="field"><label>Asset type</label><input type="text" value={f.srcType} onChange={(e) => set("srcType", e.target.value)} /></div>
              <div className="field"><label>URL</label><input type="text" value={f.srcUrl} onChange={(e) => set("srcUrl", e.target.value)} /></div>
            </div>
            <div className="field"><label>Source content / excerpt</label><textarea value={f.srcContent} onChange={(e) => set("srcContent", e.target.value)} /></div>
            <label className="tiny" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}><input type="checkbox" checked={f.srcApproved} onChange={(e) => set("srcApproved", e.target.checked)} /> Source asset is approved (required to proceed)</label>
          </div>
        )}

        {isRegulatory && (
          <div className="callout warn" style={{ marginTop: 10 }}>
            <b>Regulatory addendum (Tier 2)</b>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field"><label>Issuing body</label><input type="text" value={f.issuingBody} onChange={(e) => set("issuingBody", e.target.value)} /></div>
              <div className="field"><label>Effective date</label><input type="text" value={f.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} /></div>
            </div>
            <label className="tiny" style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" checked={f.legalReviewNeeded} onChange={(e) => set("legalReviewNeeded", e.target.checked)} /> Legal review needed</label>
          </div>
        )}

        {isCompetitor && (
          <div className="callout warn" style={{ marginTop: 10 }}>
            <b>Competitor addendum (Tier 2)</b>
            <div className="field" style={{ marginTop: 8 }}><label>Competitor name</label><input type="text" value={f.competitorName} onChange={(e) => set("competitorName", e.target.value)} /></div>
            <div className="field"><label>Differentiation pillars</label><input type="text" value={f.differentiationPillars} onChange={(e) => set("differentiationPillars", e.target.value)} /></div>
            <label className="tiny" style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" checked={f.allowedToName} onChange={(e) => set("allowedToName", e.target.checked)} /> Allowed to name competitor</label>
          </div>
        )}

        {jobType === "convert_external_report" && (
          <div className="callout" style={{ marginTop: 10 }}>
            <b>Research addendum</b>
            <div className="field" style={{ marginTop: 8 }}><label>Required sources</label><input type="text" value={f.requiredSources} onChange={(e) => set("requiredSources", e.target.value)} /></div>
            <label className="tiny" style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" checked={f.mustCite} onChange={(e) => set("mustCite", e.target.checked)} /> Must cite</label>
          </div>
        )}
      </AccordionSection>

      <div className="actionbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="faint tiny">ContentOS runs risk tiering → context retrieval → {isRepurpose ? "canonical narrative → derivatives" : "PIM → narrative → blueprint → draft"} → QA.</div>
        <button className="btn primary accept-all" onClick={submit}>Submit to ContentOS →</button>
      </div>
    </div>
  );
}
