/**
 * Trend Store
 * -----------
 * In-memory reactive store for TrendDigest records produced by
 * TrendSignalMonitorAgent. Follows the same subscribe/getSnapshot pattern as
 * jobStore so it's consumable via useSyncExternalStore.
 *
 * Seeded on first load with one digest for the current week so the dashboard
 * is never empty. In production, replace the seed + runNow with a cron-triggered
 * serverless function that writes to a database.
 */

import type { TrendDigest } from "../schemas/contentos";
import { runTrendSignalMonitorAgent } from "../agents/trendSignalMonitorAgent";
import { now } from "../util";

interface TrendStoreState {
  digests: TrendDigest[];
  lastRunAt: string | null;
  nextScheduledAt: string;
}

function initialState(): TrendStoreState {
  const seed = runTrendSignalMonitorAgent(now());
  const nextRun = nextWeeklyRun();
  return {
    digests: [seed],
    lastRunAt: seed.generatedAt,
    nextScheduledAt: nextRun,
  };
}

let state: TrendStoreState = initialState();
const listeners = new Set<() => void>();

function emit() {
  state = { ...state, digests: [...state.digests] };
  listeners.forEach((l) => l());
}

function nextWeeklyRun(): string {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay() + 1) % 7 || 7); // next Monday
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

export const trendStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): TrendStoreState {
    return state;
  },

  /** Manually trigger a new digest run (e.g. from the Trends page). */
  runNow(): void {
    const ts = now();
    const digest = runTrendSignalMonitorAgent(ts);
    state.digests.unshift(digest);
    state.lastRunAt = ts;
    state.nextScheduledAt = nextWeeklyRun();
    emit();
  },

  getLatestDigest(): TrendDigest | null {
    return state.digests[0] ?? null;
  },

  getTopSignals(n: number): TrendDigest["signals"] {
    const latest = state.digests[0];
    if (!latest) return [];
    return [...latest.signals]
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, n);
  },
};
