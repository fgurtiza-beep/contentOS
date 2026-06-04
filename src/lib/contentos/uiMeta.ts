import type { JobType } from "./schemas/contentos";

export interface TypeMeta {
  icon: string;
  desc: string;
  outputSize: string;
  effort: string;
  cta: string;
  /** Sensible default count options for the amount stepper / dropdown. */
  amountOptions: number[];
}

/** Display metadata for the content-type chooser cards. */
export const TYPE_META: Record<JobType, TypeMeta> = {
  blog: { icon: "📝", desc: "SEO-focused article", outputSize: "1,500–3,000 words", effort: "5–10 min setup", cta: "Create Blog", amountOptions: [1, 2, 3] },
  ebook: { icon: "📘", desc: "Lead magnet", outputSize: "10–20 pages", effort: "10–15 min setup", cta: "Create Ebook", amountOptions: [1, 2] },
  whitepaper: { icon: "📄", desc: "Research-driven asset", outputSize: "8–15 pages", effort: "15–20 min setup", cta: "Create Whitepaper", amountOptions: [1, 2] },
  exec_one_pager: { icon: "🧾", desc: "Condensed executive briefing", outputSize: "1–2 pages", effort: "5–8 min setup", cta: "Create One-Pager", amountOptions: [1, 2, 3] },
  social_post: { icon: "📢", desc: "LinkedIn / social content", outputSize: "100–500 words", effort: "2–3 min setup", cta: "Create Social Post", amountOptions: [1, 3, 5, 10] },
  email: { icon: "✉️", desc: "Nurture / campaign email", outputSize: "150–400 words", effort: "3–5 min setup", cta: "Create Email", amountOptions: [1, 2, 3, 5] },
  landing_page: { icon: "🎯", desc: "Conversion-focused page", outputSize: "400–900 words", effort: "8–12 min setup", cta: "Create Landing Page", amountOptions: [1, 2] },
  case_study: { icon: "🏆", desc: "Customer success story", outputSize: "800–1,500 words", effort: "10–15 min setup", cta: "Create Case Study", amountOptions: [1, 2] },
  press_release: { icon: "📰", desc: "Media announcement", outputSize: "400–700 words", effort: "8–12 min setup", cta: "Create Press Release", amountOptions: [1, 2] },
  award_entry: { icon: "🥇", desc: "Award submission", outputSize: "800–1,500 words", effort: "10–15 min setup", cta: "Create Award Entry", amountOptions: [1, 2] },
  custom: { icon: "✨", desc: "Specialized content", outputSize: "Flexible", effort: "Varies", cta: "Create Custom Content", amountOptions: [1, 2, 3, 5] },
  repurpose_sprout_asset: { icon: "♻️", desc: "From an existing Sprout asset", outputSize: "Multi-channel set", effort: "5–8 min setup", cta: "Repurpose Asset", amountOptions: [3, 5, 10] },
  convert_external_report: { icon: "📊", desc: "From third-party research", outputSize: "Multi-channel set", effort: "8–12 min setup", cta: "Convert Report", amountOptions: [3, 5, 10] },
  convert_regulatory_update: { icon: "⚖️", desc: "Employer guidance from a regulation", outputSize: "Guidance + posts", effort: "10–15 min setup", cta: "Convert Update", amountOptions: [2, 3, 5] },
  reframe_competitor_pov: { icon: "🎯", desc: "Differentiation narrative", outputSize: "Multi-channel set", effort: "8–12 min setup", cta: "Reframe POV", amountOptions: [2, 3, 5] },
};
