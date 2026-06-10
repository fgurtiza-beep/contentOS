"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { jobStore } from "@/lib/contentos/store/useStore";
import { CURRENT_USER } from "@/lib/contentos/store/uiStore";
import {
  JOB_TYPES,
  INDUSTRIES,
  CONTENT_GOALS,
  PAIN_POINT_OPTIONS,
  TONES,
  intentsFromGoals,
  type AgentLane,
  type JobType,
  type StandardizedBrief,
  type AgencyBriefExtract,
  type VideoSourceType,
} from "@/lib/contentos/schemas/contentos";
import { TYPE_META } from "@/lib/contentos/uiMeta";
import { gtmStudioProductService } from "@/lib/contentos/data/gtmStudioProductService";
import { icpKnowledgeService } from "@/lib/contentos/data/icpKnowledgeService";
import { Stepper, AccordionSection, MultiSelect } from "./ui";
import { extractBriefFromFile, extractBriefFromText, type ExtractedBrief } from "@/lib/contentos/intake/briefExtractor";

const REPURPOSE_CHANNELS = ["LinkedIn", "X", "Instagram", "Email", "Blog"];
const NONE_PRODUCT = "__none__";
const MAX_BLOGS = 5;
const COMPANY_SIZES = ["SME", "ENT", "General"];

const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function deriveTone(goals: string[], icpLabel: string): string[] {
  const t = new Set<string>(["Professional"]);
  if (goals.includes("Build thought leadership")) { t.add("Thought Leadership"); t.add("Authoritative"); }
  if (goals.includes("Educate the audience")) { t.add("Educational"); t.add("Helpful"); }
  if (goals.includes("Help readers compare options") || goals.includes("Support solution evaluation")) t.add("Analytical");
  if (/CHRO|CEO|Executive|Director|Owner/i.test(icpLabel)) t.add("Executive");
  t.add("Human");
  return Array.from(t);
}

type Step = "lane" | "type" | "brief";

export function JobIntakeForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("lane");
  const [lane, setLane] = useState<AgentLane | null>(null);
  const [jobType, setJobType] = useState<JobType | null>(null);

  const onDone = (ids: string[]) => router.push(ids.length === 1 ? `/contentos/jobs/${ids[0]}` : `/contentos/jobs`);

  return (
    <div className="content">
      <div className="page-head">
        <h1>New content job</h1>
        <p>
          {step === "lane" && "Start by choosing the kind of work. ContentOS reveals only what each step needs."}
          {step === "type" && "Pick a content type. The request builder appears once you choose."}
          {step === "brief" && "Upload or paste a brief and we'll fill it in — or just answer a few quick questions."}
        </p>
      </div>

      <div className="wiz-crumb">
        <button className={`seg ${step === "lane" ? "current" : "done"}`} onClick={() => setStep("lane")}>1 · Workflow</button>
        {lane && <span className="arrow">›</span>}
        {lane && <button className={`seg ${step === "type" ? "current" : "done"}`} onClick={() => setStep("type")}>{lane === "repurposing" ? "Content Repurposing" : lane === "video_intelligence" ? "Video Intelligence" : "New Content"}</button>}
        {jobType && step === "brief" && (<><span className="arrow">›</span><span className="seg current">{JOB_TYPES.find((t) => t.value === jobType)?.label}</span></>)}
      </div>

      {step === "lane" && (
        <div className="choice-grid three">
          <button className="choice" onClick={() => { setLane("production"); setJobType(null); setStep("type"); }}>
            <div className="ci">✦</div><div className="ct">New Content</div>
            <div className="cd">Create net-new content from a structured brief — blogs, ebooks, social, email, landing pages, and more.</div>
            <div className="cgo">Select →</div>
          </button>
          <button className="choice repurpose" onClick={() => { setLane("repurposing"); setJobType(null); setStep("type"); }}>
            <div className="ci">♺</div><div className="ct">Content Repurposing</div>
            <div className="cd">Transform one approved source asset into channel-native derivatives, following IMD 2.0 doctrine.</div>
            <div className="cgo">Select →</div>
          </button>
          <button className="choice video" onClick={() => { setLane("video_intelligence"); setJobType("transcribe_video"); setStep("brief"); }}>
            <div className="ci">🎬</div>
            <div className="ct">Video Intelligence</div>
            <div className="cd">Extract a cleaned transcript, timestamped chapters, executive summary, and key takeaways from any video.</div>
            <div className="cgo">Select →</div>
          </button>
        </div>
      )}

      {step === "type" && lane && (
        <div className="choice-grid three">
          {JOB_TYPES.filter((t) => t.lane === lane).map((t) => {
            const meta = TYPE_META[t.value];
            return (
              <button key={t.value} className={`choice ${lane === "repurposing" ? "repurpose" : ""} ${jobType === t.value ? "selected" : ""}`} onClick={() => { setJobType(t.value); setStep("brief"); }}>
                {jobType === t.value && <span className="checkmark">✓</span>}
                <div className="ci">{meta.icon}</div><div className="ct">{t.label}</div><div className="cd">{meta.desc}</div>
                <div className="meta-line" style={{ marginTop: 6 }}><span>📏 {meta.outputSize}</span><span>⏱ {meta.effort}</span></div>
                <div className="cgo">{meta.cta} →</div>
              </button>
            );
          })}
        </div>
      )}

      {step === "brief" && jobType && lane && <BriefForm jobType={jobType} lane={lane} onDone={onDone} />}
    </div>
  );
}

/* Editable chip list (used only for pain points). */
function EditableList({ items, onChange, placeholder, suggestions }: { items: string[]; onChange: (next: string[]) => void; placeholder: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState("");
  const add = (v: string) => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); };
  return (
    <div className="edlist">
      {items.length > 0 && (
        <div className="edlist-chips">
          {items.map((it, i) => <span className="edchip" key={i}>{it}<button type="button" aria-label="remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button></span>)}
        </div>
      )}
      {suggestions && suggestions.filter((s) => !items.includes(s)).length > 0 && (
        <div className="edlist-sugg">{suggestions.filter((s) => !items.includes(s)).map((s) => <button type="button" key={s} className="sugg-chip" onClick={() => add(s)}>+ {s}</button>)}</div>
      )}
      <div className="edlist-add">
        <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); setDraft(""); } }} />
        <button type="button" className="btn sm" onClick={() => { add(draft); setDraft(""); }}>Add</button>
      </div>
    </div>
  );
}

interface BlogItem { title: string; notes: string; }

function BriefForm({ jobType, lane, onDone }: { jobType: JobType; lane: AgentLane; onDone: (ids: string[]) => void }) {
  const isRepurpose = lane === "repurposing";
  const isVideoIntel = lane === "video_intelligence";
  const isRegulatory = jobType === "convert_regulatory_update";
  const isCompetitorType = jobType === "reframe_competitor_pov";
  const isBlog = jobType === "blog";
  const m = TYPE_META[jobType];
  const typeLabel = JOB_TYPES.find((t) => t.value === jobType)?.label ?? "items";
  const unitLabel = isBlog ? "blog" : typeLabel.toLowerCase();
  const maxQty = isBlog ? MAX_BLOGS : 10;

  const products = gtmStudioProductService.listProducts();
  const icps = icpKnowledgeService.list();

  // ---- Essentials ----
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [amount, setAmount] = useState(1);
  const [items, setItems] = useState<BlogItem[]>([{ title: "", notes: "" }]);
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [contentFormat, setContentFormat] = useState<"standard" | "listicle">("standard");
  const [listCount, setListCount] = useState(10);
  const [featured, setFeatured] = useState("");

  // ---- Audience ----
  const [primaryICP, setPrimaryICP] = useState("SME HR Leader");
  const [persona, setPersona] = useState("HR generalist wearing multiple hats");
  const [industry, setIndustry] = useState("Professional, Scientific and Technical Services");
  const [companySize, setCompanySize] = useState("SME");
  const [painList, setPainList] = useState<string[]>([]);

  // ---- Content direction ----
  const [goalSel, setGoalSel] = useState<string[]>([]);
  const [toneSel, setToneSel] = useState<string[]>(["Professional", "Helpful", "Human"]);
  const [productSel, setProductSel] = useState<string[]>([NONE_PRODUCT]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [cta, setCta] = useState("");

  // ---- Additional guidance (optional) ----
  const [mustInclude, setMustInclude] = useState("");
  const [mustAvoid, setMustAvoid] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  // ---- Repurpose / addenda ----
  const [a, setA] = useState({
    srcTitle: "", srcType: "report", srcUrl: "", srcContent: "", srcApproved: true,
    vidTitle: "", vidUrl: "", vidUrlType: "youtube" as VideoSourceType, vidTranscript: "",
    issuingBody: "DOLE", effectiveDate: "", legalReviewNeeded: true,
    competitorName: "", allowedToName: false, differentiationPillars: "",
    mustCite: true, requiredSources: "",
    channelQtys: { LinkedIn: 3, X: 0, Instagram: 0, Email: 1, Blog: 0 } as Record<string, number>,
  });
  const setAk = (k: keyof typeof a, v: unknown) => setA((p) => ({ ...p, [k]: v }));

  // ---- Upload / paste (extraction kept; rich fields captured silently) ----
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedBrief | null>(null);
  const [extractMsg, setExtractMsg] = useState<{ text: string; filled: string[]; tone: "ok" | "warn" } | null>(null);
  const [reviewFields, setReviewFields] = useState<Set<string>>(new Set());
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const isMulti = !isRepurpose && amount > 1;
  const isListicle = isBlog && contentFormat === "listicle";
  const realProducts = productSel.filter((p) => p !== NONE_PRODUCT);

  const personaOptions = useMemo(() => {
    const list = icpKnowledgeService.personasFor(primaryICP);
    return persona && !list.includes(persona) ? [persona, ...list] : list;
  }, [primaryICP, persona]);

  function changeAmount(n: number) {
    setAmount(n);
    setItems((prev) => { const next = prev.slice(0, n); while (next.length < n) next.push({ title: "", notes: "" }); return next; });
  }
  const setItem = (idx: number, k: keyof BlogItem, v: string) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  function onIcpChange(label: string) {
    setPrimaryICP(label);
    const ps = icpKnowledgeService.personasFor(label);
    if (!ps.includes(persona)) setPersona(ps[0] ?? persona);
  }

  /* ------------------------------ Extraction ----------------------------- */

  async function handleFile(file: File) {
    setExtracting(true); setExtractMsg(null);
    try { applyExtraction(await extractBriefFromFile(file)); }
    finally { setExtracting(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  function handlePaste() {
    if (!pasteText.trim()) return;
    applyExtraction(extractBriefFromText(pasteText, "pasted text"));
    setShowPaste(false);
  }

  function applyExtraction(ext: ExtractedBrief) {
    if (ext.needsPaste) {
      setExtractMsg({ text: `We couldn't read text from “${ext.sourceName}”. Try Paste brief text instead.`, filled: [], tone: "warn" });
      setShowPaste(true);
      return;
    }
    setExtracted(ext); // keep full extraction (outline, keywords, CTA type, etc.) for the job
    const filled: string[] = [];
    const review = new Set<string>();
    const mark = (k: string, human: string) => { review.add(k); filled.push(human); };

    if (ext.title) { setTitle(ext.title); mark("title", "Title"); }
    if (ext.titleOptions?.length) setTitleOptions(ext.titleOptions.map((t) => t.title));
    if (ext.objective) setObjective(ext.objective);
    if (ext.primaryICP) { setPrimaryICP(ext.primaryICP); mark("primaryICP", "ICP"); }
    if (ext.persona) setPersona(ext.persona);
    if (ext.industry) { setIndustry(ext.industry); mark("industry", "Industry"); }
    if (ext.companySize) setCompanySize(/ent|enterprise/i.test(ext.companySize) ? "ENT" : /sme|small|10|50|250/i.test(ext.companySize) ? "SME" : "General");
    if (ext.painPoints?.length) { setPainList(Array.from(new Set(ext.painPoints))); mark("pains", "Pain points"); }
    if (ext.contentGoals?.length) { setGoalSel(ext.contentGoals); mark("goals", "Content goal"); }
    else if (ext.contentIntent?.length) {
      const g = ext.contentIntent.map((i) => CONTENT_GOALS.find((c) => c.intent === i)?.label).filter((x): x is string => Boolean(x));
      if (g.length) setGoalSel(Array.from(new Set(g)));
    }
    if (ext.tone?.length) setToneSel(ext.tone);
    if (ext.products?.length) { setProductSel(ext.products); mark("products", "Product(s)"); }
    if (ext.unmappedProducts?.length) setUnmapped(ext.unmappedProducts);
    if (ext.ctaText) { setCta(ext.ctaText); mark("cta", "CTA"); }

    setReviewFields(review);
    setExtractMsg({
      text: ext.isAgency ? `Brief parsed from “${ext.sourceName}”. We captured the SEO outline, keywords and CTA behind the scenes — just review the essentials below.` : `Parsed “${ext.sourceName}”. Review the highlighted fields.`,
      filled,
      tone: "ok",
    });
  }

  /* ------------------------------ Validation ----------------------------- */

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (isVideoIntel) {
      if (!a.vidTranscript.trim() && !a.vidUrl.trim()) e.video = "Add a video URL or paste a transcript.";
      return e;
    }
    if (!title.trim() && !isMulti) e.title = "Add a title or main topic.";
    if (painList.length === 0) e.pains = "Add at least one pain point.";
    if (goalSel.length === 0) e.goals = "Choose at least one goal.";
    if (isMulti && items.some((it) => !it.title.trim())) e.items = `Give each ${unitLabel} a topic.`;
    return e;
  }, [isVideoIntel, a.vidTranscript, a.vidUrl, title, isMulti, painList.length, goalSel.length, items, unitLabel]);
  const valid = Object.keys(errors).length === 0;

  /* ------------------------------ Submit --------------------------------- */

  const desiredOutputs = useMemo(() => {
    if (isRepurpose) return REPURPOSE_CHANNELS.filter((c) => a.channelQtys[c] > 0).map((c) => ({ channel: c, format: c === "Email" ? "newsletter" : c === "Blog" ? "blog" : "post", quantity: a.channelQtys[c] }));
    if (isVideoIntel) return [{ channel: "video_intelligence", format: "transcript_analysis", quantity: 1 }];
    return [{ channel: jobType, format: jobType, quantity: amount }];
  }, [isRepurpose, isVideoIntel, a.channelQtys, amount, jobType]);

  function buildAgencyExtract(): AgencyBriefExtract | undefined {
    const e = extracted?.agency;
    if (!e && titleOptions.length === 0 && painList.length === 0) return undefined;
    return {
      topicIntent: e?.topicIntent,
      searchIntent: extracted?.searchIntent ?? e?.searchIntent,
      serpOpportunity: e?.serpOpportunity,
      competitorGaps: e?.competitorGaps ?? [],
      audienceDetails: extracted?.audienceDetails ?? e?.audienceDetails,
      companySize,
      triggerEvents: extracted?.triggerEvents ?? e?.triggerEvents ?? [],
      keyMessaging: e?.keyMessaging ?? [],
      painPoints: painList,
      contentAngle: extracted?.contentAngle ?? e?.contentAngle,
      titleOptions: titleOptions.map((t) => ({ title: t })),
      outline: e?.outline ?? [],
      faqRequirements: e?.faqRequirements,
      ctaText: cta || e?.ctaText,
      ctaType: extracted?.ctaType ?? e?.ctaType,
      wordCount: e?.wordCount,
      productionFormat: e?.productionFormat,
      schema: e?.schema,
      media: e?.media,
      productMentionRules: e?.productMentionRules,
      proofRequirements: e?.proofRequirements,
      keywords: e?.keywords ?? [],
      primaryKeyword: extracted?.primaryKeyword ?? e?.primaryKeyword,
      secondaryKeywords: extracted?.secondaryKeywords ?? e?.secondaryKeywords ?? [],
      keywordVariations: extracted?.keywordVariations ?? e?.keywordVariations ?? [],
      paaQuestions: extracted?.paaQuestions ?? e?.paaQuestions ?? [],
      detectedProducts: [
        ...realProducts.map((slug) => ({ name: products.find((p) => p.slug === slug)?.displayName ?? slug, slug, mapped: true, source: "intake" })),
        ...unmapped.map((n) => ({ name: n, mapped: false, source: "intake (unmapped)" })),
      ],
    };
  }

  function buildBrief(overrides?: Partial<StandardizedBrief>): StandardizedBrief {
    const tone = (toneSel.length ? toneSel : deriveTone(goalSel, primaryICP)).join(", ");
    const contentIntent = intentsFromGoals(goalSel);
    const featuredList = splitList(featured);
    const primaryKeyword = extracted?.primaryKeyword ?? extracted?.agency?.primaryKeyword;
    const competitorForBrief = isCompetitorType ? a.competitorName : unmapped[0] ?? extracted?.agency?.competitorGaps?.[0]?.url ?? "";
    const guidance = [otherNotes, extracted?.agency?.productMentionRules && `Product mention rules: ${extracted.agency.productMentionRules}`].filter(Boolean).join(" — ");

    return {
      title: title || "Untitled job",
      objective: objective || goalSel.join("; ") || title,
      jobType,
      primaryICP, secondaryICPs: [], industry, segment: companySize,
      persona, readiness: "problem_aware", contentIntent,
      tone, length: extracted?.agency?.wordCount || m.outputSize, channel: isVideoIntel ? "video_intelligence" : isRepurpose ? desiredOutputs[0]?.channel ?? "LinkedIn" : jobType,
      mustInclude: splitList(mustInclude), mustAvoid: splitList(mustAvoid),
      product: realProducts[0] ?? "", products: realProducts,
      contentFormat: isBlog ? contentFormat : undefined,
      listSpec: isListicle ? { itemCount: listCount, featured: featuredList, mandatoryInclusions: "" } : undefined,
      contentGoals: goalSel, contentAngle: extracted?.contentAngle ?? extracted?.agency?.contentAngle,
      audienceDetails: extracted?.audienceDetails ?? extracted?.agency?.audienceDetails, companySize,
      triggerEvents: extracted?.triggerEvents ?? extracted?.agency?.triggerEvents,
      primaryKeyword, secondaryKeywords: extracted?.secondaryKeywords, keywordVariations: extracted?.keywordVariations, paaQuestions: extracted?.paaQuestions,
      searchIntent: extracted?.searchIntent ?? extracted?.agency?.searchIntent, ctaType: extracted?.ctaType ?? extracted?.agency?.ctaType,
      agencyExtract: buildAgencyExtract(),
      cta,
      campaign: "", seoKeyword: primaryKeyword ?? "", competitor: competitorForBrief,
      smeNotes: guidance,
      painPoints: painList,
      complianceContext: "",
      sourceAsset: isRepurpose ? { id: "src_" + Date.now().toString(36), title: a.srcTitle || "Source asset", origin: isRegulatory ? "regulatory" : isCompetitorType ? "competitor" : "sprout", assetType: a.srcType, url: a.srcUrl, content: a.srcContent || "Source content pending.", approved: a.srcApproved } : null,
      videoSource: isVideoIntel ? { id: "vid_" + Date.now().toString(36), title: a.vidTitle || title || "Video", url: a.vidUrl, urlType: a.vidUrlType, transcript: a.vidTranscript } : null,
      landingPageType: jobType === "landing_page" ? "campaign" : "",
      datasets: [], desiredOutputs, volumeTarget: isVideoIntel ? "1" : String(isRepurpose ? desiredOutputs.reduce((acc, o) => acc + o.quantity, 0) : amount), riskSensitivity: "low",
      regulatory: isRegulatory ? { issuingBody: a.issuingBody, effectiveDate: a.effectiveDate, affectedAudience: "", uncertaintyAreas: "", legalReviewNeeded: a.legalReviewNeeded, sproutCTAAllowed: true } : undefined,
      competitorAddendum: isCompetitorType || competitorForBrief ? { competitorName: a.competitorName || competitorForBrief, allowedToNameCompetitor: a.allowedToName, comparisonsPermitted: false, differentiationPillars: splitList(a.differentiationPillars), prohibitedClaims: ["pricing", "security", "uptime"] } : undefined,
      research: jobType === "convert_external_report" ? { mustCite: a.mustCite, directQuotesAllowed: false, dataMisrepresentationRisks: "", requiredSources: splitList(a.requiredSources) } : undefined,
      ...overrides,
    };
  }

  function submit() {
    if (!valid) { setShowErrors(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (isMulti) {
      const ids = items.map((it) => jobStore.submitBrief(buildBrief({ title: it.title, smeNotes: [it.notes, otherNotes].filter(Boolean).join(" — "), volumeTarget: "1", desiredOutputs: [{ channel: jobType, format: jobType, quantity: 1 }] }), CURRENT_USER));
      onDone(ids);
    } else {
      onDone([jobStore.submitBrief(buildBrief(), CURRENT_USER)]);
    }
  }

  /* ------------------------------ Render --------------------------------- */

  const tag = (k: string) => (reviewFields.has(k) ? <span className="review-tag">review</span> : null);
  const err = (k: string) => (showErrors && errors[k] ? <span className="err-text">{errors[k]}</span> : null);
  const productOptions = [...products.map((p) => ({ value: p.slug, label: `${p.displayName}${p.status !== "active" ? ` (${p.status})` : ""}` })), { value: NONE_PRODUCT, label: "None" }];

  return (
    <div className="builder" style={{ maxWidth: 720 }}>
      {/* ===== Upload / paste / manual ===== */}
      {!isRepurpose && !isVideoIntel && (
        <>
          <div
            className={`upload-zone ${dragOver ? "drag" : ""} ${extracting ? "busy" : ""}`}
            role="button" tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); }}
          >
            <div className="uz-icon">⤴</div>
            <div className="uz-title">{extracting ? "Reading your brief…" : "Upload brief or SEO outline"}</div>
            <div className="uz-sub">Drag a file here, or <span className="uz-browse">browse files</span></div>
            <div className="uz-types">PDF · DOCX · Google Doc export · Markdown · Plain text</div>
            <div className="uz-hint">We&apos;ll fill in the essentials and capture the SEO detail for you.</div>
            <input ref={fileInput} type="file" accept=".pdf,.docx,.doc,.txt,.md,.markdown,.json,.csv,.html,.rtf" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }} />
          </div>
          <div className="entry-actions">
            <button type="button" className="btn sm" onClick={() => setShowPaste((s) => !s)}>📋 Paste brief text</button>
            <button type="button" className="btn sm ghost" onClick={() => { setShowPaste(false); document.getElementById("block-essentials")?.scrollIntoView({ behavior: "smooth" }); }}>Start manually ↓</button>
          </div>
          {showPaste && (
            <div className="paste-box">
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the brief text here…" />
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn primary sm" onClick={handlePaste} disabled={!pasteText.trim()}>Extract &amp; fill</button>
                <button type="button" className="btn sm" onClick={() => { setPasteText(""); setShowPaste(false); }}>Cancel</button>
              </div>
            </div>
          )}
          {extractMsg && (
            <div className={`callout ${extractMsg.tone === "warn" ? "warn" : ""} extract-banner`}>
              <b>{extractMsg.tone === "warn" ? "⚠ Heads up" : "✓ Brief auto-filled"}</b> — {extractMsg.text}
            </div>
          )}
          {unmapped.length > 0 && (
            <div className="callout warn">
              <b>Detected product not found in product list</b> — {unmapped.join(", ")}. Map it below in <i>Products</i>, or leave it for Product Marketing.
            </div>
          )}
          <div className="or-divider"><span>review &amp; complete</span></div>
        </>
      )}

      {/* ===== Essentials ===== */}
      <div className="form-block" id="block-essentials">
        <div className="block-title">1 · Essentials</div>
        {isMulti ? (
          <div className="field"><label>Batch theme <span className="hint">· optional</span></label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The thread tying these blogs together" /></div>
        ) : (
          <>
            <div className="field"><label>Title / Main Topic {tag("title")}</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A working title, topic, or theme" /><span className="hint">A working title, topic, or theme all work.</span>{err("title")}</div>
            <div className="field"><label>Objective <span className="hint">· optional</span></label><input type="text" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="What should this achieve, in one line?" /></div>
          </>
        )}
        {titleOptions.length > 0 && (
          <div className="field"><label>Title options <span className="hint">· from the brief · primary = Title above</span></label><EditableList items={titleOptions} onChange={setTitleOptions} placeholder="Add an alternate title" /></div>
        )}

        {isVideoIntel && (
          <div className="callout" style={{ marginTop: 8 }}>
            <b>Video source</b>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>Source type</label>
                <select value={a.vidUrlType} onChange={(e) => setAk("vidUrlType", e.target.value as VideoSourceType)}>
                  <option value="youtube">YouTube</option>
                  <option value="loom">Loom</option>
                  <option value="vimeo">Vimeo</option>
                  <option value="transcript_upload">Upload transcript</option>
                </select>
              </div>
              <div className="field">
                <label>Video title <span className="hint">· title of the source video</span></label>
                <input type="text" value={a.vidTitle} onChange={(e) => setAk("vidTitle", e.target.value)} placeholder="e.g. Product demo — Q2 2026" />
              </div>
            </div>
            {a.vidUrlType !== "transcript_upload" && (
              <div className="field">
                <label>Video URL</label>
                <input type="text" value={a.vidUrl} onChange={(e) => setAk("vidUrl", e.target.value)} placeholder={a.vidUrlType === "youtube" ? "https://youtube.com/watch?v=..." : a.vidUrlType === "loom" ? "https://www.loom.com/share/..." : "https://vimeo.com/..."} />
              </div>
            )}
            <div className="field">
              <label>Transcript <span className="hint">· paste auto-generated captions or an uploaded .txt / .srt file</span></label>
              <textarea rows={8} value={a.vidTranscript} onChange={(e) => setAk("vidTranscript", e.target.value)} placeholder="Paste the video transcript here…" />
            </div>
            {err("video")}
          </div>
        )}

        {!isRepurpose && !isVideoIntel && (
          <div className="field"><label>How many {unitLabel}s?</label><Stepper value={amount} min={1} max={maxQty} onChange={changeAmount} /></div>
        )}
        {isRepurpose && (
          <div className="field"><label>Outputs per channel</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{REPURPOSE_CHANNELS.map((c) => <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="tiny" style={{ width: 72 }}>{c}</span><Stepper value={a.channelQtys[c]} min={0} max={10} onChange={(n) => setAk("channelQtys", { ...a.channelQtys, [c]: n })} /></div>)}</div>
          </div>
        )}

        {isBlog && !isMulti && (
          <div className="field"><label>Content format</label>
            <div className="seg-toggle"><button type="button" className={contentFormat === "standard" ? "on" : ""} onClick={() => setContentFormat("standard")}>Standard blog</button><button type="button" className={contentFormat === "listicle" ? "on" : ""} onClick={() => setContentFormat("listicle")}>Listicle</button></div>
          </div>
        )}
        {isListicle && (
          <div className="callout listicle-block">
            <div className="row"><div className="field"><label>Number of items <span className="hint">· up to 20</span></label><Stepper value={listCount} min={1} max={20} onChange={setListCount} /></div></div>
            <div className="field"><label>Companies / solutions to feature</label><textarea value={featured} onChange={(e) => setFeatured(e.target.value)} placeholder={"One per line:\nSprout\nDarwinbox\nWorkday"} /></div>
          </div>
        )}

        {isMulti && (
          <div className="items">
            {items.map((it, idx) => (
              <div className="item-card" key={idx}>
                <div className="item-head">{typeLabel} {idx + 1}</div>
                <div className="field"><label>Title / Main Topic</label><input type="text" value={it.title} onChange={(e) => setItem(idx, "title", e.target.value)} placeholder="What is this one about?" /></div>
                <div className="field"><label>Notes <span className="hint">· optional</span></label><input type="text" value={it.notes} onChange={(e) => setItem(idx, "notes", e.target.value)} /></div>
              </div>
            ))}
            {err("items")}
            <div className="tiny faint">Each becomes its own job. Audience, pain points, goals and products below apply to all {amount}.</div>
          </div>
        )}
      </div>

      {!isVideoIntel && (<>
      {/* ===== Audience ===== */}
      <div className="form-block">
        <div className="block-title">2 · Audience</div>
        <div className="row">
          <div className="field"><label>ICP {tag("primaryICP")} <span className="hint">· GTM Studio</span></label><select value={primaryICP} onChange={(e) => onIcpChange(e.target.value)}>{icps.map((i) => <option key={i.id} value={i.label}>{i.label}</option>)}</select></div>
          <div className="field"><label>Persona <span className="hint">· from ICP</span></label><select value={persona} onChange={(e) => setPersona(e.target.value)}>{personaOptions.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        </div>
        <div className="row">
          <div className="field"><label>Industry {tag("industry")}</label><select value={industry} onChange={(e) => setIndustry(e.target.value)}>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
          <div className="field"><label>Company size</label><select value={companySize} onChange={(e) => setCompanySize(e.target.value)}>{COMPANY_SIZES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <div className="field"><label>Pain points {tag("pains")} <span className="req-star">required</span></label>
          <EditableList items={painList} onChange={setPainList} placeholder="Add a pain point" suggestions={PAIN_POINT_OPTIONS} />
          {err("pains")}
        </div>
      </div>

      {/* ===== Content direction ===== */}
      <div className="form-block">
        <div className="block-title">3 · Content Direction</div>
        <div className="field"><label>What should this content achieve? {tag("goals")} <span className="req-star">required</span></label>
          <div className="goal-grid">{CONTENT_GOALS.map((g) => { const on = goalSel.includes(g.label); return <button type="button" key={g.label} className={`goal-btn ${on ? "on" : ""}`} onClick={() => setGoalSel(on ? goalSel.filter((x) => x !== g.label) : [...goalSel, g.label])}><span className="goal-icon">{g.icon}</span><span className="goal-label">{g.label}</span></button>; })}</div>
          {err("goals")}
        </div>
        <div className="row">
          <div className="field"><label>Tone <span className="hint">· pick a few</span></label><MultiSelect options={TONES.map((t) => ({ value: t, label: t }))} selected={toneSel} onChange={setToneSel} placeholder="Select tone…" /></div>
          <div className="field"><label>Call to action {tag("cta")} <span className="hint">· optional</span></label><input type="text" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. Book a demo" /></div>
        </div>
        <div className="field"><label>Product(s) {tag("products")} <span className="hint">· only GTM Studio products can be referenced</span></label>
          <MultiSelect options={productOptions} selected={productSel} onChange={setProductSel} placeholder="Select product(s)…" exclusiveValue={NONE_PRODUCT} />
          {unmapped.length > 0 && (
            <div className="unmapped-row">
              {unmapped.map((n) => (
                <span key={n} className="unmapped-chip" title="Detected in the brief but not in GTM Studio">
                  ⚠ {n}
                  <select defaultValue="" onChange={(e) => { if (e.target.value) { setProductSel(Array.from(new Set([...realProducts, e.target.value]))); setUnmapped(unmapped.filter((x) => x !== n)); } }}>
                    <option value="">map to…</option>
                    {products.map((p) => <option key={p.slug} value={p.slug}>{p.displayName}</option>)}
                  </select>
                  <button type="button" aria-label="dismiss" onClick={() => setUnmapped(unmapped.filter((x) => x !== n))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* ===== Additional guidance (optional, collapsed) ===== */}
      <AccordionSection num={4} title="Additional guidance" hint="optional — most requests don't need this">
        <div className="field"><label>Must include</label><textarea value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} placeholder={"e.g. Mention DOLE compliance\nInclude ROI examples"} /></div>
        <div className="field"><label>Must avoid</label><textarea value={mustAvoid} onChange={(e) => setMustAvoid(e.target.value)} placeholder={"e.g. Avoid competitor comparisons\nDo not mention pricing"} /></div>
        <div className="field"><label>Other notes</label><textarea value={otherNotes} onChange={(e) => setOtherNotes(e.target.value)} placeholder={"e.g. CEO requested this angle\nShould support the webinar launch"} /></div>

        {isRepurpose && (
          <div className="callout">
            <b>Source Asset (IMD 2.0)</b> — exactly one approved source asset. No cross-asset blending.
            <div className="field" style={{ marginTop: 8 }}><label>Source title</label><input type="text" value={a.srcTitle} onChange={(e) => setAk("srcTitle", e.target.value)} /></div>
            <div className="field"><label>Source content / excerpt</label><textarea value={a.srcContent} onChange={(e) => setAk("srcContent", e.target.value)} /></div>
            <label className="tiny" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}><input type="checkbox" checked={a.srcApproved} onChange={(e) => setAk("srcApproved", e.target.checked)} /> Source asset is approved (required to proceed)</label>
          </div>
        )}
        {isCompetitorType && (
          <div className="callout warn" style={{ marginTop: 10 }}>
            <b>Competitor addendum (Tier 2)</b>
            <div className="field" style={{ marginTop: 8 }}><label>Competitor name</label><input type="text" value={a.competitorName} onChange={(e) => setAk("competitorName", e.target.value)} /></div>
            <label className="tiny" style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" checked={a.allowedToName} onChange={(e) => setAk("allowedToName", e.target.checked)} /> Allowed to name competitor</label>
          </div>
        )}
      </AccordionSection>

      <div className="actionbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="tiny faint">{isVideoIntel ? "Paste the transcript, then submit." : valid ? "Ready to submit." : "Title, pain points and a goal are required."}</div>
        <button className="btn primary accept-all" onClick={submit}>{isMulti ? `Submit ${amount} ${unitLabel}s →` : "Submit to ContentOS →"}</button>
      </div>
    </div>
  );
}
