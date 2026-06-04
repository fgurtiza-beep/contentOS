"use client";

import { useAudits, useJobs } from "@/lib/contentos/store/useStore";
import { recent, formatAction } from "@/lib/contentos/audit/auditLog";

export function AuditTrail({ jobId }: { jobId?: string }) {
  const audits = useAudits();
  const jobs = useJobs();
  const entries = recent(jobId ? audits.filter((a) => a.jobId === jobId) : audits, 200);
  const titleFor = (id: string) => jobs.find((j) => j.id === id)?.brief.title ?? id;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Audit log</h3>
        <span className="sub">{entries.length} entries · append-only</span>
      </div>
      <div className="panel-pad" style={{ padding: 0 }}>
        {entries.length === 0 && <div className="empty">No audit entries.</div>}
        {entries.map((e) => (
          <div key={e.id} className="job-row" style={{ cursor: "default" }}>
            <div style={{ width: 130 }} className="faint tiny mono">{new Date(e.at).toLocaleString()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="tiny">
                <b>{formatAction(e.action)}</b>
                {e.fromState && e.toState && (
                  <span className="faint"> · {e.fromState} → {e.toState}</span>
                )}
              </div>
              <div className="meta">{e.detail}</div>
              {!jobId && <div className="faint tiny">{titleFor(e.jobId)}</div>}
            </div>
            <div className="faint tiny">{e.actor.split("@")[0]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
