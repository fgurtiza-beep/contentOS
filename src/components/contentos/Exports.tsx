"use client";

import Link from "next/link";
import { useJobs } from "@/lib/contentos/store/useStore";
import { EXPORT_FORMATS } from "@/lib/contentos/schemas/contentos";
import { StateBadge } from "./badges";

export function Exports() {
  const jobs = useJobs();
  const ready = jobs.filter((j) => ["QA_PASSED", "APPROVED"].includes(j.state));
  const exported = jobs.filter((j) => j.exports.length > 0);

  return (
    <div className="content">
      <div className="page-head">
        <h1>Exports</h1>
        <p>Content cleared to ship, and everything already exported. Export is gated: QA must pass, a human must approve, or an override must be logged.</p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>Ready to export</h3><span className="sub">{ready.length} cleared</span></div>
        {ready.length === 0 && <div className="empty">Nothing is export-ready yet. Pass QA or get human approval first.</div>}
        {ready.map((j) => (
          <Link key={j.id} href={`/contentos/jobs/${j.id}`} className="job-row" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ minWidth: 0 }}>
              <div className="title">{j.brief.title}</div>
              <div className="meta">{j.lane} agent · QA {(j.finalQaReport ?? j.qaReport)?.overallScore.toFixed(1)}/5</div>
            </div>
            <div className="spacer" />
            <StateBadge state={j.state} />
            <span className="btn sm">Open & export →</span>
          </Link>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Export history</h3><span className="sub">{exported.reduce((a, j) => a + j.exports.length, 0)} exports</span></div>
        {exported.length === 0 && <div className="empty">No exports yet.</div>}
        {exported.flatMap((j) =>
          j.exports.map((e) => (
            <div key={e.id} className="job-row" style={{ cursor: "default" }}>
              <div style={{ minWidth: 0 }}>
                <div className="title" style={{ fontSize: 12.5 }}>{j.brief.title}</div>
                <div className="meta">{EXPORT_FORMATS.find((f) => f.value === e.format)?.label} · {new Date(e.at).toLocaleString()} · {e.by.split("@")[0]}</div>
              </div>
              <div className="spacer" />
              <span className={`state ${e.override ? "warn" : "go"}`}>{e.override ? "override" : "clean"}</span>
              <Link href={`/contentos/jobs/${j.id}`} className="btn sm">Open</Link>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
