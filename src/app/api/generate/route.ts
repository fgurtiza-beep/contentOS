/**
 * POST /api/generate
 * -------------------
 * Server-side article writer. Takes a StandardizedBrief, assembles the editorial
 * write package, calls Claude to produce a complete article, runs a pre-display
 * QUALITY GATE, and does one revision pass if the draft fails. Returns parsed
 * ContentBlocks only when the draft is publication-ready.
 *
 * It NEVER returns a fake/built-in draft. If no key, generation, or the quality
 * gate fails, it returns { ok: false, reason } so the UI shows the real reason —
 * not a fallback article.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { StandardizedBrief } from "@/lib/contentos/schemas/contentos";
import {
  EDITORIAL_SYSTEM_PROMPT,
  buildWritePackage,
  buildUserPrompt,
  buildRevisionPrompt,
  parseArticleToBlocks,
  qualityCheck,
} from "@/lib/contentos/agents/editorialPrompt";
import { findDevFixture } from "@/lib/contentos/agents/devFixtures";

export const runtime = "nodejs";
export const maxDuration = 180;

const MODEL = "claude-opus-4-8";
const log = (...a: unknown[]) => console.log("[api/generate]", ...a);

function targetWords(brief: StandardizedBrief): number {
  const m = brief.agencyExtract?.wordCount?.replace(/,/g, "").match(/(\d{3,5})/);
  return m ? parseInt(m[1], 10) : brief.jobType === "blog" ? 1200 : 600;
}

export async function POST(req: Request) {
  let brief: StandardizedBrief;
  try {
    brief = (await req.json()).brief;
    if (!brief?.title) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  // No live key → DEV MODE: serve a Claude-written fixture if one matches this
  // brief, so the app shows real-quality output without spending credits. The
  // live API path below always wins when a key is present.
  if (!process.env.ANTHROPIC_API_KEY) {
    const fixture = findDevFixture(brief);
    if (fixture) {
      const gate = qualityCheck(fixture.blocks, targetWords(brief));
      log(`no key — serving dev fixture "${fixture.id}" (${fixture.blocks.length} blocks, gate ${gate.passed ? "PASSED" : "FAILED"})`);
      return NextResponse.json({ ok: true, blocks: fixture.blocks, model: "Claude Code (dev fixture)", simulated: true });
    }
    log("no ANTHROPIC_API_KEY and no matching dev fixture — returning no_key");
    return NextResponse.json({ ok: false, reason: "no_key" }, { status: 200 });
  }

  log("generating for:", brief.title);
  const client = new Anthropic();
  const pkg = buildWritePackage(brief);
  const target = targetWords(brief);

  const call = async (messages: Anthropic.MessageParam[]) => {
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: EDITORIAL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
    });
    const md = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    return { md, raw: r };
  };

  try {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserPrompt(pkg) }];
    let { md, raw } = await call(messages);
    let blocks = parseArticleToBlocks(md);
    let gate = qualityCheck(blocks, target);
    log(`pass 1: ${blocks.length} blocks, ${raw.usage.output_tokens} out tokens, gate ${gate.passed ? "PASSED" : "FAILED"}`, gate.issues);

    // One revision pass if the gate fails.
    if (!gate.passed) {
      messages.push({ role: "assistant", content: md });
      messages.push({ role: "user", content: buildRevisionPrompt(gate.issues) });
      ({ md, raw } = await call(messages));
      blocks = parseArticleToBlocks(md);
      gate = qualityCheck(blocks, target);
      log(`pass 2 (revision): gate ${gate.passed ? "PASSED" : "FAILED"}`, gate.issues);
    }

    if (blocks.length < 4) return NextResponse.json({ ok: false, reason: "thin_output" }, { status: 200 });
    if (!gate.passed) {
      log("quality gate failed after revision — NOT displaying");
      return NextResponse.json({ ok: false, reason: "quality", issues: gate.issues }, { status: 200 });
    }

    log("success — returning publication-ready draft");
    return NextResponse.json({ ok: true, blocks, model: raw.model, usage: raw.usage });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      log("auth error — bad/expired key");
      return NextResponse.json({ ok: false, reason: "bad_key", message: "Anthropic rejected the API key (401)." }, { status: 200 });
    }
    const message = err instanceof Error ? err.message : "generation failed";
    log("error:", message);
    return NextResponse.json({ ok: false, reason: "error", message }, { status: 200 });
  }
}
