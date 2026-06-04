"use client";

import { useRouter } from "next/navigation";
import { useJobs, useAudits } from "@/lib/contentos/store/useStore";
import { CURRENT_USER } from "@/lib/contentos/store/uiStore";
import { isMyJob } from "@/lib/contentos/jobStage";
import type { AuditEntry, Job } from "@/lib/contentos/schemas/contentos";

export function ContentOSDashboard() {
  const jobs = useJobs().filter((j) => isMyJob(j, CURRENT_USER));
  const audits = useAudits();
  const router = useRouter();

  const draftsAwaitingQA = jobs.filter((j) => ["CHANGES_PENDING", "QA_REVISION"].includes(j.state));
  const qaAwaitingAction = jobs.filter((j) => j.state === "QA_REVIEW_READY");
  const humanPending = jobs.filter((j) => j.state === "HUMAN_REVIEW" || j.state === "HELD");
  const approvedForExport = jobs.filter((j) => ["QA_PASSED", "APPROVED"].includes(j.state));
  const recentlyCompleted = jobs.filter((j) => ["EXPORTED", "SHIPPED"].includes(j.state));

  const cards = [
    { n: draftsAwaitingQA.length, t: "Drafts Awaiting QA", s: "edited, need a QA re-run", href: "/contentos/jobs?filter=qa", cls: "hot" },
    { n: qaAwaitingAction.length, t: "QA Reviews Awaiting Action", s: "ready for you to triage", href: "/contentos/jobs?filter=qa", cls: "hot" },
    { n: humanPending.length, t: "Human Reviews Pending", s: "in the review queue", href: "/contentos/review", cls: "review" },
    { n: approvedForExport.length, t: "Approved for Export", s: "cleared to ship", href: "/contentos/exports", cls: "" },
    { n: recentlyCompleted.length, t: "Recently Completed", s: "exported or shipped", href: "/contentos/jobs?filter=done", cls: "" },
  ];

  const notifications = buildNotifications(audits, jobs);

  return (
    <div className="content">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Dashboard</h1>
          <p>Your attention center. Everything that needs you, in one place.</p>
        </div>
        <button className="btn primary" onClick={() => router.push("/contentos/intake")}>＋ New Content Job</button>
      </div>

      <div className="attn-center" style={{ marginBottom: 20 }}>
        {cards.map((c) => (
          <div key={c.t} className={`attn-tile ${c.cls}`} role="button" tabIndex={0} onClick={() => router.push(c.href)} onKeyDown={(e) => { if (e.key === "Enter") router.push(c.href); }}>
            <div className="n">{c.n}</div>
            <div className="t">{c.t}</div>
            <div className="s">{c.s}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head"><h3>Notifications</h3><span className="sub">recent activity</span></div>
        <div className="panel-pad">
          {notifications.length === 0 && <div className="faint tiny">No recent activity.</div>}
          {notifications.map((nf, i) => (
            <div key={i} className="notif">
              <div className="ni">{nf.icon}</div>
              <div>
                <div className="nt">{nf.text}</div>
                <div className="ns">{nf.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildNotifications(audits: AuditEntry[], jobs: Job[]): { icon: string; text: string; when: string }[] {
  const titleFor = (id: string) => jobs.find((j) => j.id === id)?.brief.title ?? "A job";
  const WATCH: Record<string, { icon: string; verb: string }> = {
    review_approve: { icon: "✅", verb: "approved" },
    qa_passed: { icon: "🎯", verb: "passed QA" },
    export: { icon: "📤", verb: "exported" },
    export_override: { icon: "📤", verb: "exported (override)" },
    review_kill: { icon: "🛑", verb: "killed" },
    qa_complete: { icon: "✓", verb: "completed QA" },
    route_human: { icon: "⚑", verb: "routed to human review" },
  };
  return [...audits]
    .filter((a) => WATCH[a.action] && jobs.some((j) => j.id === a.jobId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6)
    .map((a) => ({
      icon: WATCH[a.action].icon,
      text: `${titleFor(a.jobId)} ${WATCH[a.action].verb}`,
      when: new Date(a.at).toLocaleString(),
    }));
}
