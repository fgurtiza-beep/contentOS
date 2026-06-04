"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useJobs } from "@/lib/contentos/store/useStore";
import { CURRENT_USER } from "@/lib/contentos/store/uiStore";
import { isMyJob, boardStage, BOARD_STAGES } from "@/lib/contentos/jobStage";
import { RiskBadge, StateBadge, ScorePill } from "./badges";
import { JOB_TYPES, type Job } from "@/lib/contentos/schemas/contentos";
import { JOB_STATE_LABELS } from "@/lib/contentos/schemas/contentos";

type ViewMode = "table" | "board" | "list";

const FILTERS: { key: string; label: string; test: (j: Job) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "qa", label: "Awaiting QA", test: (j) => ["QA_REVIEW_READY", "CHANGES_PENDING", "QA_REVISION"].includes(j.state) },
  { key: "review", label: "In review", test: (j) => j.state === "HUMAN_REVIEW" || j.state === "HELD" },
  { key: "exports", label: "Export-ready", test: (j) => ["QA_PASSED", "APPROVED"].includes(j.state) },
  { key: "done", label: "Done", test: (j) => ["EXPORTED", "SHIPPED"].includes(j.state) },
];

function jobTypeLabel(value: string) {
  return JOB_TYPES.find((j) => j.value === value)?.label ?? value;
}
function assignedTo(j: Job) {
  return (j.humanReview?.assignedReviewer && j.humanReview.assignedReviewer !== "Unassigned" ? j.humanReview.assignedReviewer : j.owner).split("@")[0];
}

export function MyJobs() {
  const params = useSearchParams();
  const initial = params.get("filter") ?? "all";
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initial) ? initial : "all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("table");

  // Remember the user's selected view.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("contentos:jobsView") as ViewMode | null) : null;
    if (saved === "table" || saved === "board" || saved === "list") setView(saved);
  }, []);
  const pickView = (v: ViewMode) => { setView(v); if (typeof window !== "undefined") localStorage.setItem("contentos:jobsView", v); };

  const mine = useJobs().filter((j) => isMyJob(j, CURRENT_USER));
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const list = mine
    .filter(active.test)
    .filter((j) => (q ? (j.brief.title + j.brief.primaryICP + j.brief.jobType).toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="content wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>My Jobs</h1>
          <p>Jobs you created, are assigned to, or that await your action. ({mine.length} total)</p>
        </div>
        <Link href="/contentos/intake" className="btn primary">＋ New Content Job</Link>
      </div>

      <div className="panel-head" style={{ flexWrap: "wrap", gap: 10, padding: "0 0 14px", border: "none", background: "transparent" }}>
        <div className="btn-row">
          {FILTERS.map((f) => (
            <button key={f.key} className={`btn sm ${filter === f.key ? "primary" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label} <span style={{ opacity: 0.6 }}>{mine.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ maxWidth: 200, padding: "7px 10px", border: "1px solid var(--border-strong)", borderRadius: 6 }} />
        <div className="view-switch">
          <button className={view === "table" ? "on" : ""} onClick={() => pickView("table")}>▦ Table</button>
          <button className={view === "board" ? "on" : ""} onClick={() => pickView("board")}>▤ Board</button>
          <button className={view === "list" ? "on" : ""} onClick={() => pickView("list")}>☰ List</button>
        </div>
      </div>

      {list.length === 0 && <div className="panel empty">No jobs match this filter.</div>}

      {list.length > 0 && view === "table" && <TableView list={list} />}
      {list.length > 0 && view === "board" && <BoardView list={list} />}
      {list.length > 0 && view === "list" && <ListView list={list} />}
    </div>
  );
}

function TableView({ list }: { list: Job[] }) {
  const router = useRouter();
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <table className="ntable">
        <thead>
          <tr><th>Title</th><th>Content Type</th><th>Status</th><th>Risk Tier</th><th>Last Updated</th><th>Assigned To</th></tr>
        </thead>
        <tbody>
          {list.map((j) => (
            <tr key={j.id} onClick={() => router.push(`/contentos/jobs/${j.id}`)}>
              <td className="tt">{j.brief.title || "Untitled"}</td>
              <td>{j.qaOnly ? "QA Check" : jobTypeLabel(j.brief.jobType)}</td>
              <td><StateBadge state={j.state} /></td>
              <td><RiskBadge tier={j.risk?.tier ?? null} /></td>
              <td className="faint">{new Date(j.updatedAt).toLocaleDateString()}</td>
              <td>{assignedTo(j)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardView({ list }: { list: Job[] }) {
  const router = useRouter();
  return (
    <div className="board">
      {BOARD_STAGES.map((stage) => {
        const cards = list.filter((j) => boardStage(j.state) === stage.key);
        return (
          <div key={stage.key} className="bcol">
            <div className="bhead">{stage.label}<span className="bcount">{cards.length}</span></div>
            {cards.map((j) => (
              <div key={j.id} className="bcard" onClick={() => router.push(`/contentos/jobs/${j.id}`)}>
                <div className="bt">{j.brief.title || "Untitled"}</div>
                <div className="bm">
                  <RiskBadge tier={j.risk?.tier ?? null} />
                  {(j.finalQaReport ?? j.qaReport) && <ScorePill score={(j.finalQaReport ?? j.qaReport)!.overallScore} />}
                </div>
              </div>
            ))}
            {cards.length === 0 && <div className="faint tiny" style={{ padding: "4px 2px" }}>—</div>}
          </div>
        );
      })}
    </div>
  );
}

function ListView({ list }: { list: Job[] }) {
  return (
    <div className="panel">
      {list.map((j) => (
        <Link key={j.id} href={`/contentos/jobs/${j.id}`} className="job-row" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ minWidth: 0 }}>
            <div className="title">{j.brief.title || "Untitled job"}</div>
            <div className="meta">{j.qaOnly ? "QA Check" : jobTypeLabel(j.brief.jobType)} · {JOB_STATE_LABELS[j.state]} · updated {new Date(j.updatedAt).toLocaleDateString()}</div>
          </div>
          <div className="spacer" />
          {(j.finalQaReport ?? j.qaReport) && <ScorePill score={(j.finalQaReport ?? j.qaReport)!.overallScore} />}
          <RiskBadge tier={j.risk?.tier ?? null} />
          <StateBadge state={j.state} />
        </Link>
      ))}
    </div>
  );
}
