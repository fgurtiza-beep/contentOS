/**
 * Brand Knowledge Service
 * -----------------------
 * Placeholder for the Brand Knowledge Base (RAG in production). Holds Sprout's
 * voice, style guide, capitalization rules, inclusive-language rules, the
 * cliché & buzzword watchlist (Appendix A of the QA Workflow), and positioning.
 *
 * The cliché watchlist is reproduced verbatim from the Sprout QA Workflow so the
 * QA Agent can read it on every run and IMD can maintain it without a redeploy.
 */

export interface BrandVoice {
  positioning: string;
  voiceTraits: string[];
  toneByChannel: Record<string, string>;
}

/** Appendix A — Cliché & Buzzword Watchlist (from the Sprout QA Workflow). */
export const CLICHE_WATCHLIST: string[] = [
  // Generic / overused phrases
  "in the fast-paced world of",
  "in the ever-changing world of",
  "in conclusion",
  "firstly",
  "secondly",
  "thirdly",
  "at the heart of",
  "lies in",
  "looking ahead",
  "in the realm of",
  "in the world of",
  "in the landscape of",
  "stemming from",
  "embarked on",
  "expansive",
  "not resting on its laurels",
  "underscore",
  "underscores",
  "underscored",
  "underscoring",
  // Empty descriptors & adjectives
  "innovative",
  "powerful",
  "the power of",
  "harness the power of",
  "seamless",
  "effortless",
  "intuitive",
  "best-in-class",
  "transformative",
  "future-proof",
  "revolutionary",
  "revolutionizes",
  "game-changer",
  "gamechanger",
  "pioneering",
  "boundary-pushing",
  "changemaker",
  "meteoric",
  // Common buzz verbs (overused in AI content)
  "streamline",
  "optimize",
  "elevate",
  "leverage",
  "supercharge",
  "unlock",
  "unleash",
];

/** Formulaic sentence pattern the QA framework explicitly flags. */
export const FORMULAIC_PATTERNS: { label: string; test: RegExp }[] = [
  { label: '"X is not just Y, it\'s Z" construction', test: /\bnot just\b[^.?!]*\bit'?s\b/i },
  { label: "Em dash overuse signals AI-generated writing", test: /—/g },
];

export const STYLE_RULES = {
  capitalization: [
    'Use "Sprout HR", "Sprout Payroll", "Sidekick", "ReadyCash" exactly as written.',
    'Prefer "platform" over "system" when describing Sprout.',
    'Write "Philippine" not "Filipino" when describing the market/compliance context.',
  ],
  inclusiveLanguage: [
    "Avoid stereotypes and exclusionary phrasing.",
    "Use people-first language; the customer (HR/payroll leader) is the hero, Sprout is the guide.",
  ],
  punctuation: [
    "Avoid em dashes; use them sparingly and only when they add clarity.",
    "Avoid generic AI clichés (see watchlist).",
  ],
};

const VOICE: BrandVoice = {
  positioning: "People-First AI for Work — built specifically for Philippine businesses.",
  voiceTraits: ["professional yet approachable", "confident without arrogance", "human", "inclusive", "helpful"],
  toneByChannel: {
    blog: "authoritative, helpful thought leadership",
    report: "informative and evidence-led",
    social_post: "conversational and scroll-stopping",
    email: "personal, empathetic, hero-first",
    landing_page: "benefit-driven and action-oriented",
    press_release: "factual, media-appropriate, 5Ws first",
  },
};

export const brandKnowledgeService = {
  getVoice(): BrandVoice {
    return VOICE;
  },
  toneFor(channel: string): string {
    return VOICE.toneByChannel[channel] ?? "professional, human, inclusive, helpful";
  },
  getClicheWatchlist(): string[] {
    return CLICHE_WATCHLIST;
  },
  getStyleRules() {
    return STYLE_RULES;
  },
  /** Returns the clichés found in a piece of text. */
  scanCliches(text: string): string[] {
    const lower = text.toLowerCase();
    return CLICHE_WATCHLIST.filter((c) => lower.includes(c));
  },
  scanFormulaic(text: string): string[] {
    return FORMULAIC_PATTERNS.filter((p) => p.test.test(text)).map((p) => p.label);
  },
};
