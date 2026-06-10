"use client";

import { useSyncExternalStore } from "react";
import { jobStore } from "./jobStore";
import { trendStore } from "./trendStore";
import type { Job, AuditEntry } from "../schemas/contentos";

/** Subscribe a component to the whole store snapshot. */
export function useStore() {
  const snapshot = useSyncExternalStore(jobStore.subscribe, jobStore.getSnapshot, jobStore.getSnapshot);
  return snapshot;
}

export function useJobs(): Job[] {
  return useStore().jobs;
}

export function useJob(id: string | undefined): Job | undefined {
  const jobs = useJobs();
  return id ? jobs.find((j) => j.id === id) : undefined;
}

export function useAudits(): AuditEntry[] {
  return useStore().audits;
}

export function useTrendStore() {
  return useSyncExternalStore(trendStore.subscribe, trendStore.getSnapshot, trendStore.getSnapshot);
}

export { jobStore, trendStore };
