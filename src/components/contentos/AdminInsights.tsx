"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useJobs, useAudits } from "@/lib/contentos/store/useStore";
import { useRole } from "@/lib/contentos/store/uiStore";
import { Observability } from "./Observability";
import { AuditTrail } from "./AuditTrail";
import { StateBadge } from "./badges";
import { QA_LAYERS, type Job } from "@/lib/contentos/schemas/contentos";

type View = "overview" | "audit" | "jobs" | "agents" | "qa" | "revision" | "export";

const TABS: [View, string][] = [
  ["overview", "Observability"],
  ["audit", "Audit Log"],
  ["jobs", "Job History"],
  ["agents", "Agent Metrics"],
  ["qa", "QA Analytics"],
  ["revision", "Revision Analytics"],
  ["export", "Export Analytics"],
];

export function AdminInsights() {
  const role = useRole();
  const params = useSearchParams();
  const initial = (params.get("view") ?? "overview") as View;
  const [view, setView] = useState<View>(TABS.some(([v]) => v === initial) ? initial : "overview");
  const jobs = useJobs();
  const audits = useAudits();

  if (role !== "admin") {
    return (
      <div className="content">
        <div className="panel empty">
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <b>Admin only</b>
          <p className="faint tiny" style={{ marginTop: 6 }}>Admin Insights — global job history, audit logs, and observability — is restricted to Admin users. Switch to Admin View in the top bar to preview it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-head">
        <h1>Admin Insights</h1>
        <p>Global, admin-only analytics: every job and user, observability, audit trail, and agent / QA / revision / export analytics. Hidden from standard users.</p>
      </div>

      <div className="tabs">
        {TABS.map(([v, label]) => (
          <button key={v} className={`tab ${view === v ? "active" : ""}`} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>

      {view === "overview" && <Observability embedded />}
      {view === "audit" && <AuditTrail />}
      {view === "jobs" && <JobHistory jobs={jobs} />}
      {view === "agents" && <AgentMetrics jobs={jobs} />}
      {view === "qa" && <QAAnalytics jobs={jobs} />}
      {view === "revision" && <RevisionAnalytics jobs={jobs} audits={audits.length} />}
      {view === "export" && <ExportAnalytics jobs={jobs} />}
    </div>
  );
}

function JobHistory({ jobs }: { jobs: Job[] }) {
  return (
    <div className="panel">
      <div className="panel-head"><h3>Global job history</h3><span className="sub">{jobs.length} jobs · all users</span></div>
      {jobs.map((j) => (
        <div key={j.id} className="job-row" style={{ cursor: "default" }}>
          <div style={{ minWidth: 0 }}>
            <div className="title" style={{ fontSize: 12.5 }}>{j.brief.title}</div>
            <div className="meta">{j.owner.split("@")[0]} · {j.lane} · created {new Date(j.createdAt).toLocaleString()} · {j.metrics.revisionAttempts} revision(s)</div>
          </div>
          <div className="spacer" />
          <span className="faint tiny mono">${j.metrics.costUsd.toFixed(2)}</span>
          <StateBadge state={j.state} />
        </div>
      ))}
    </div>
  );
}

function AgentMetrics({ jobs }: { jobs: Job[] }) {
  const prod = jobs.filter((j) => j.lane === "production" && !j.qaOnly).length;
  const rep = jobs.filter((j) => j.lane === "repurposing").length;
  const qaOnly = jobs.filter((j) => j.qaOnly).length;
  const stage: Record<string, { ms: number; n: number }> = {};
  jobs.forEach((j) => j.metrics.stageTimings.forEach((t) => { stage[t.stage] = stage[t.stage] ?? { ms: 0, n: 0 }; stage[t.stage].ms += t.ms; stage[t.stage].n++; }));
  return (
    <div className="grid grid-2">
      <div className="panel panel-pad">
        <h3 style={{ marginBottom: 10 }}>Runs by agent</h3>
        <Bar label="Production Agent" v={prod} max={jobs.length} />
        <Bar label="Repurposing Agent" v={rep} max={jobs.length} />
        <Bar label="QA Agent (standalone checks)" v={qaOnly} max={jobs.length} />
        <div className="faint tiny" style={{ marginTop: 6 }}>The QA Agent also runs on every Production and Repurposing job.</div>
      </div>
      <div className="panel panel-pad">
        <h3 style={{ marginBottom: 10 }}>Avg latency per stage</h3>
        {Object.entries(stage).map(([s, v]) => <Bar key={s} label={s.replace(/_/g, " ")} v={Math.round(v.ms / v.n)} max={60} unit="ms" />)}
      </div>
    </div>
  );
}

function QAAnalytics({ jobs }: { jobs: Job[] }) {
  const evaluated = jobs.filter((j) => j.qaReport);
  const layerAvg = QA_LAYERS.map((meta) => {
    const scores = evaluated.map((j) => (j.finalQaReport ?? j.qaReport)!.layers.find((l) => l.key === meta.key)?.score ?? 0);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return { name: meta.name, avg };
  });
  return (
    <div className="panel panel-pad">
      <h3 style={{ marginBottom: 10 }}>Average score by QA layer</h3>
      {layerAvg.map((l) => <Bar key={l.name} label={l.name} v={Number(l.avg.toFixed(1))} max={5} />)}
    </div>
  );
}

function RevisionAnalytics({ jobs, audits }: { jobs: Job[]; audits: number }) {
  return (
    <div className="grid grid-4">
      <Stat k="Revision attempts" v={jobs.reduce((a, j) => a + j.metrics.revisionAttempts, 0)} />
      <Stat k="Accepted fixes" v={jobs.reduce((a, j) => a + j.metrics.acceptedSuggestions, 0)} />
      <Stat k="Rejected fixes" v={jobs.reduce((a, j) => a + j.metrics.rejectedSuggestions, 0)} />
      <Stat k="Edited fixes" v={jobs.reduce((a, j) => a + j.metrics.editedSuggestions, 0)} />
      <Stat k="Audit events" v={audits} />
      <Stat k="Escalated to human" v={jobs.filter((j) => j.humanReview?.reasons.includes("failed_revisions")).length} />
    </div>
  );
}

function ExportAnalytics({ jobs }: { jobs: Job[] }) {
  const vol: Record<string, number> = {};
  jobs.forEach((j) => j.exports.forEach((e) => { vol[e.format] = (vol[e.format] ?? 0) + 1; }));
  const overrides = jobs.reduce((a, j) => a + j.exports.filter((e) => e.override).length, 0);
  return (
    <div className="grid grid-2">
      <div className="panel panel-pad">
        <h3 style={{ marginBottom: 10 }}>Export volume by format</h3>
        {Object.keys(vol).length === 0 && <div className="faint">No exports yet.</div>}
        {Object.entries(vol).map(([f, n]) => <Bar key={f} label={f.replace(/_/g, " ")} v={n} max={Math.max(...Object.values(vol), 1)} />)}
      </div>
      <div className="grid grid-2" style={{ alignContent: "start" }}>
        <Stat k="Total exports" v={Object.values(vol).reduce((a, b) => a + b, 0)} />
        <Stat k="Overrides logged" v={overrides} />
      </div>
    </div>
  );
}

function Bar({ label, v, max, unit }: { label: string; v: number; max: number; unit?: string }) {
  return (
    <div className="score-row" style={{ border: "none", padding: "6px 0" }}>
      <span className="nm">{label}</span>
      <div className="score-bar" style={{ width: 120 }}><span style={{ width: `${Math.min((v / Math.max(max, 1)) * 100, 100)}%`, background: "var(--ubas)" }} /></div>
      <span className="score-num">{v}{unit ?? ""}</span>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="panel stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
