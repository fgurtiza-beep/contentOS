/**
 * Small shared utilities. ID generation is counter-based (not random) so seed
 * data renders identically on server and client, avoiding hydration mismatches.
 */

import type { ContentBlock } from "./schemas/contentos";

let counter = 1000;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

/** Deterministic seed clock so seeded timestamps are stable across SSR/CSR. */
export const SEED_NOW = "2026-06-02T09:00:00.000Z";

interface Clock {
  iso(): string;
  ms(): number;
}
const realClock: Clock = { iso: () => new Date().toISOString(), ms: () => Date.now() };
let clock: Clock = realClock;

export function now(): string {
  return clock.iso();
}
export function nowMs(): number {
  return clock.ms();
}

/**
 * Run `fn` with a deterministic, monotonically increasing clock. Used during
 * seeding so seeded timestamps/timings are identical on the server and client
 * render, preventing hydration mismatches. Restores the real clock afterward.
 */
export function runWithDeterministicClock<T>(startIso: string, fn: () => T): T {
  let t = Date.parse(startIso);
  const det: Clock = {
    iso: () => {
      const v = new Date(t).toISOString();
      t += 1000;
      return v;
    },
    ms: () => {
      const v = t;
      t += 25;
      return v;
    },
  };
  const prev = clock;
  clock = det;
  try {
    return fn();
  } finally {
    clock = prev;
  }
}

export function block(order: number, kind: ContentBlock["kind"], text: string): ContentBlock {
  return { id: nextId("blk"), order, kind, text };
}

export function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
