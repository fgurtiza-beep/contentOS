"use client";

import { uiStore, useRole, CURRENT_USER } from "@/lib/contentos/store/uiStore";

export function TopBar() {
  const role = useRole();
  return (
    <div className="topbar">
      <div className="crumb">
        <b>ContentOS</b> · content production & repurposing OS
      </div>
      <div className="who">
        <div className="role-toggle" title="Preview role-based access. Admin unlocks Admin Insights, audit logs, observability, and global job history.">
          <button className={role === "standard" ? "on" : ""} onClick={() => uiStore.setRole("standard")}>
            <span className="rdot" /> Standard View
          </button>
          <button className={role === "admin" ? "on" : ""} onClick={() => uiStore.setRole("admin")}>
            <span className="rdot" /> Admin View
          </button>
        </div>
        <span className="avatar" title={CURRENT_USER}>GT</span>
      </div>
    </div>
  );
}
