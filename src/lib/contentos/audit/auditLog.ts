/**
 * Audit Log
 * ---------
 * Pure selectors over the AuditEntry stream that the store persists. The
 * orchestrator and the human-review actions emit AuditEntries; this module
 * provides grouping/formatting used by the Audit Trail view. Keeping it as
 * selectors (not a second source of truth) avoids drift with the store.
 */

import type { AuditEntry } from "../schemas/contentos";

export function forJob(entries: AuditEntry[], jobId: string): AuditEntry[] {
  return entries.filter((e) => e.jobId === jobId).sort((a, b) => a.at.localeCompare(b.at));
}

export function recent(entries: AuditEntry[], limit = 50): AuditEntry[] {
  return [...entries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function byActor(entries: AuditEntry[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.actor] = (acc[e.actor] ?? 0) + 1;
    return acc;
  }, {});
}

export function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
