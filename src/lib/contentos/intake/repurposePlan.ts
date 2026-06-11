/**
 * Repurposing plan engine
 * -----------------------
 * IMD 2.0 doctrine: ONE approved source asset → channel-native derivatives built
 * from the Sprout canonical narrative (never raw excerpts). This suggests the
 * best derivative formats + quantities for a given source, which the user then
 * approves or adjusts. The platform proposes; the human signs off.
 *
 * The recommendation adapts to the source asset TYPE and LENGTH — a 2,000-word
 * report yields a richer plan than a short PR note.
 */

export interface DerivItem {
  id: string;
  channel: string;
  format: string;
  quantity: number;
  on: boolean;        // included in the plan (user can toggle)
  rationale: string;  // why this format fits this source
}

export function suggestDerivatives(sourceType: string, words: number): DerivItem[] {
  const t = (sourceType || "").toLowerCase();
  const long = words >= 800;
  const veryLong = words >= 1800;
  const isWebinar = /webinar|video|podcast|talk|event/.test(t);
  const isReport = /report|whitepaper|ebook|guide|study|research/.test(t);
  const isRegulatory = /regulat|advisory|law|circular|memo|compliance/.test(t);
  const isPR = /pr|press|announcement|launch|news/.test(t);

  const items: DerivItem[] = [];
  const add = (id: string, channel: string, format: string, quantity: number, on: boolean, rationale: string) =>
    items.push({ id, channel, format, quantity, on, rationale });

  // LinkedIn — the workhorse for B2B repurposing
  add("li-posts", "LinkedIn", "post", veryLong ? 4 : long ? 3 : 2, true,
    "Turn each key insight into a standalone LinkedIn post — the highest-reach repurpose for a B2B audience.");
  add("li-carousel", "LinkedIn", "carousel", 1, long || isReport,
    "A document/carousel of the framework drives saves and dwell time on LinkedIn.");

  // X / Twitter — thread unpacks the argument (best for longer, opinionated sources)
  add("x-thread", "X", "thread", 1, long && !isRegulatory,
    "A thread unpacks the argument step by step for the X audience.");

  // Email — deliver takeaways to the owned list
  add("email", "Email", "newsletter", 1, true,
    isRegulatory ? "An email alert is the fastest way to get a compliance change to your list."
                 : "A newsletter edition delivers the takeaways to your owned audience.");

  // Blog recap — capture search traffic from a long-form or spoken source
  add("blog-recap", "Blog", "recap", 1, isWebinar || isReport || isRegulatory,
    isRegulatory ? "A blog explainer captures search demand around the regulation."
                 : "A short blog recap captures search traffic from the long-form source.");

  // Instagram — only when the topic is broadly relatable (off by default)
  add("ig-carousel", "Instagram", "carousel", 1, false,
    "A visual carousel for Instagram if the topic is broadly relatable beyond HR/finance.");

  // Webinar/video-specific: short clips (handled by the Video Intelligence lane)
  if (isWebinar) add("clips", "Social", "clip", 3, true,
    "Pull 3 short clips from the recording — run these through the Video Intelligence lane.");

  // PR: a single tight LinkedIn announcement instead of a thread
  if (isPR) {
    const x = items.find((i) => i.id === "x-thread"); if (x) x.on = false;
  }

  return items;
}

/** Convert the approved plan into the brief's DesiredOutput[] shape. */
export function planToDesiredOutputs(plan: DerivItem[]): { channel: string; format: string; quantity: number }[] {
  return plan.filter((p) => p.on && p.quantity > 0).map((p) => ({ channel: p.channel, format: p.format, quantity: p.quantity }));
}

/**
 * The FULL catalog of derivative formats a source can become — every content
 * type ContentOS produces, plus channel-native social formats. Repurposing is
 * open: a blog can become an ebook, a press release, a carousel, anything here.
 */
export const FORMAT_CATALOG: { id: string; channel: string; format: string; label: string; group: string }[] = [
  // Long-form / production content
  { id: "blog", channel: "Blog", format: "blog", label: "Blog post", group: "Content" },
  { id: "listicle", channel: "Blog", format: "listicle", label: "Listicle", group: "Content" },
  { id: "ebook", channel: "Content", format: "ebook", label: "Ebook", group: "Content" },
  { id: "whitepaper", channel: "Content", format: "whitepaper", label: "Whitepaper", group: "Content" },
  { id: "case-study", channel: "Content", format: "case study", label: "Case study", group: "Content" },
  { id: "press-release", channel: "PR", format: "press release", label: "Press release", group: "Content" },
  { id: "one-pager", channel: "Content", format: "one-pager", label: "Executive one-pager", group: "Content" },
  { id: "landing-page", channel: "Web", format: "landing page", label: "Landing page", group: "Content" },
  { id: "faq", channel: "Content", format: "FAQ", label: "FAQ page", group: "Content" },
  { id: "slide-deck", channel: "Content", format: "slide deck", label: "Slide deck", group: "Content" },
  { id: "infographic", channel: "Design", format: "infographic", label: "Infographic brief", group: "Content" },
  // Email
  { id: "email-newsletter", channel: "Email", format: "newsletter", label: "Email newsletter", group: "Email" },
  { id: "email-sequence", channel: "Email", format: "sequence", label: "Email sequence", group: "Email" },
  // Social / channel-native
  { id: "li-post", channel: "LinkedIn", format: "post", label: "LinkedIn post", group: "Social" },
  { id: "li-carousel", channel: "LinkedIn", format: "carousel", label: "LinkedIn carousel", group: "Social" },
  { id: "li-article", channel: "LinkedIn", format: "article", label: "LinkedIn article", group: "Social" },
  { id: "x-thread", channel: "X", format: "thread", label: "X thread", group: "Social" },
  { id: "x-post", channel: "X", format: "post", label: "X post", group: "Social" },
  { id: "ig-carousel", channel: "Instagram", format: "carousel", label: "Instagram carousel", group: "Social" },
  { id: "ig-caption", channel: "Instagram", format: "caption", label: "Instagram caption", group: "Social" },
  { id: "fb-post", channel: "Facebook", format: "post", label: "Facebook post", group: "Social" },
  { id: "yt-script", channel: "YouTube", format: "script", label: "YouTube script", group: "Social" },
  { id: "video-clip", channel: "Social", format: "clip", label: "Short video clip", group: "Social" },
];

/** Build a plan item from a catalog entry (user-added → always on). */
export function makeDerivFromCatalog(catalogId: string, suffix: number): DerivItem | null {
  const c = FORMAT_CATALOG.find((x) => x.id === catalogId);
  if (!c) return null;
  return { id: `${c.id}-${suffix}`, channel: c.channel, format: c.format, quantity: 1, on: true, rationale: "Added by you." };
}
