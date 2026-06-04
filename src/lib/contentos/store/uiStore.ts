"use client";

import { useSyncExternalStore } from "react";

/**
 * Lightweight UI store for cross-cutting view state (currently the viewer role).
 * Role gates the Admin Insights section: visible to Admin, hidden for Standard
 * users. Defaults to "admin" so the full surface is explorable; a topbar toggle
 * lets you preview the Standard-user experience.
 */
export type Role = "admin" | "standard";

/** The signed-in user for this prototype session. */
export const CURRENT_USER = "marketing@sprout.ph";

let role: Role = "admin";
const listeners = new Set<() => void>();

export const uiStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getRole(): Role {
    return role;
  },
  setRole(r: Role) {
    role = r;
    listeners.forEach((l) => l());
  },
};

export function useRole(): Role {
  return useSyncExternalStore(uiStore.subscribe, uiStore.getRole, () => "admin");
}
