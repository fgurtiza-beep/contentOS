"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrendStore, trendStore } from "@/lib/contentos/store/useStore";
import { TREND_CATEGORY_LABELS, JOB_TYPES } from "@/lib/contentos/schemas/contentos";
import { TYPE_META } from "@/lib/contentos/uiMeta";
import type { TrendSignal, TrendSignalCategory, JobType, AgentLane } from "@/lib/contentos/schemas/contentos";

// ---------------------------------------------------------------------------
// Category colours — accent used on card tops and chips
// ---------------------------------------------------------------------------

const CAT_COLOR: Record<TrendSignalCategory, string> = {
  hr_technology_ph:         "#7392e3",
  payroll_compliance_ph:    "#31ce13",
  dole_sss_bir_philhealth:  "#8139ee",
  b2b_saas_sea:             "#f5a623",
  workforce_management:     "#9364f8",
  ai_in_hr:                 "#dff566",
};

const CAT_TEXT: Record<TrendSignalCategory, string> = {
  hr_technology_ph:         "#1a2a5e",
  payroll_compliance_ph:    "#043a0c",
  dole_sss_bir_philhealth:  "#2d0066",
  b2b_saas_sea:             "#5a2d00",
  workforce_management:     "#2d006a",
  ai_in_hr:                 "#3a3a00",
};

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

function CategoryChip({ category }: { category: TrendSignalCategory }) {
  const bg  = CAT_COLOR[category];
  const txt = CAT_TEXT[category];
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 700,
      padding: "2px 7px", borderRadius: 10,
      background: bg + "28", color: bg,
      border: `1px solid ${bg}44`,
      letterSpacing: "0.03em", whiteSpace: "nowrap",
    }}>
      {TREND_CATEGORY_LABELS[category]}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const bg    = score >= 8.5 ? "#e6fce0" : score >= 6.5 ? "#eef0fd" : "var(--bg-subtle)";
  const color = score >= 8.5 ? "#1a5e24" : score >= 6.5 ? "#2d3d8e" : "var(--text-muted)";
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, padding: "2px 8px",
      borderRadius: 10, background: bg, color,
      letterSpacing: "0.02em", whiteSpace: "nowrap",
    }}>
      {score.toFixed(1)} / 10
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct   = (score / 10) * 100;
  const color = score >= 8.5 ? "var(--green)" : score >= 6.5 ? "#7392e3" : "var(--text-faint)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: "right" }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal card — compact, clickable
// ---------------------------------------------------------------------------

function SignalCard({
  signal,
  selected,
  onClick,
}: {
  signal: TrendSignal;
  selected: boolean;
  onClick: () => void;
}) {
  const accent = CAT_COLOR[signal.category];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      style={{
        border: `1.5px solid ${selected ? accent : "var(--border)"}`,
        borderRadius: 12,
        background: selected ? accent + "08" : "var(--bg-panel)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "transform 0.12s ease, box-shadow 0.15s ease, border-color 0.15s ease",
        outline: "none",
      }}
      className="trend-card"
    >
      {/* category colour bar */}
      <div style={{ height: 4, background: accent, flexShrink: 0 }} />

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {/* header row */}
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", justifyContent: "space-between" }}>
          <CategoryChip category={signal.category} />
          {signal.riskFlag?.hasRisk && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 8,
              background: "#fff3cd", color: "#856404", border: "1px solid #ffd97d",
              whiteSpace: "nowrap",
            }}>
              ⚠ Regulatory
            </span>
          )}
        </div>

        {/* topic title */}
        <div style={{
          fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: "var(--text)",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {signal.topicName}
        </div>

        {/* footer row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: "auto" }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {signal.source}
          </span>
          <ScorePill score={signal.relevanceScore} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format picker — job types grouped by lane for the detail panel
// ---------------------------------------------------------------------------

const PRODUCTION_FORMATS: { value: JobType; icon: string; label: string }[] = JOB_TYPES
  .filter((t) => t.lane === "production")
  .map((t) => ({ value: t.value, icon: TYPE_META[t.value].icon, label: t.label }));

const REPURPOSE_FORMATS: { value: JobType; icon: string; label: string }[] = JOB_TYPES
  .filter((t) => t.lane === "repurposing")
  .map((t) => ({ value: t.value, icon: TYPE_META[t.value].icon, label: t.label }));

const LANE_FOR_TYPE: Record<JobType, AgentLane> = Object.fromEntries(
  JOB_TYPES.map((t) => [t.value, t.lane])
) as Record<JobType, AgentLane>;

function FormatPicker({
  signal,
  onSelect,
}: {
  signal: TrendSignal;
  onSelect: (type: JobType, lane: AgentLane) => void;
}) {
  const [selected, setSelected] = useState<JobType | null>(null);
  const [laneTab, setLaneTab] = useState<"production" | "repurposing">("production");

  const formats = laneTab === "production" ? PRODUCTION_FORMATS : REPURPOSE_FORMATS;

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected, LANE_FOR_TYPE[selected]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
        Choose a format
      </div>

      {/* Lane tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {(["production", "repurposing"] as const).map((l) => (
          <button
            key={l}
            onClick={() => { setLaneTab(l); setSelected(null); }}
            style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 8, border: "none", cursor: "pointer",
              background: laneTab === l ? "var(--ubas)" : "transparent",
              color: laneTab === l ? "#fff" : "var(--text-muted)",
            }}>
            {l === "production" ? "New Content" : "Repurpose"}
          </button>
        ))}
      </div>

      {/* Format grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {formats.map((f) => {
          const active = selected === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setSelected(active ? null : f.value)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontWeight: active ? 700 : 400,
                border: `1.5px solid ${active ? "var(--ubas)" : "var(--border)"}`,
                background: active ? "var(--ubas-soft)" : "var(--bg-subtle)",
                color: active ? "var(--ubas-deep)" : "var(--text)",
                textAlign: "left", transition: "border-color 0.1s, background 0.1s",
              }}>
              <span style={{ fontSize: 14 }}>{f.icon}</span>
              <span style={{ lineHeight: 1.3 }}>{f.label}</span>
              {active && <span style={{ marginLeft: "auto", fontSize: 10 }}>✓</span>}
            </button>
          );
        })}
      </div>

      <button
        className="btn primary"
        disabled={!selected}
        style={{ width: "100%", justifyContent: "center", marginTop: 4, opacity: selected ? 1 : 0.45 }}
        onClick={handleConfirm}>
        {selected
          ? `Create ${PRODUCTION_FORMATS.concat(REPURPOSE_FORMATS).find((f) => f.value === selected)?.label} →`
          : "Select a format above"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — shown when a card is selected
// ---------------------------------------------------------------------------

function SignalDetail({
  signal,
  onClose,
  onCreateJob,
}: {
  signal: TrendSignal;
  onClose: () => void;
  onCreateJob: (type: JobType, lane: AgentLane) => void;
}) {
  const accent = CAT_COLOR[signal.category];
  return (
    <div style={{
      position: "sticky", top: 16,
      border: "1.5px solid var(--border)", borderRadius: 14,
      background: "var(--bg-panel)", overflow: "hidden",
    }}>
      <div style={{ height: 5, background: accent }} />

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <CategoryChip category={signal.category} />
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 16, lineHeight: 1, padding: 0, marginTop: 2 }}
            aria-label="Close">×</button>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.45, color: "var(--text)" }}>
          {signal.topicName}
        </div>

        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Source: <a href={signal.sourceUrl} target="_blank" rel="noreferrer"
            style={{ color: accent, fontWeight: 600, textDecoration: "none" }}>
            {signal.source} ↗
          </a>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
            Relevance to Sprout ICP
          </div>
          <ScoreBar score={signal.relevanceScore} />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
            Suggested Content Angle
          </div>
          <div style={{
            background: accent + "10", borderLeft: `3px solid ${accent}`,
            borderRadius: "0 6px 6px 0", padding: "10px 12px",
            fontSize: 13, lineHeight: 1.6, color: "var(--text)",
          }}>
            {signal.contentAngle}
          </div>
        </div>

        {signal.riskFlag?.hasRisk && (
          <div style={{ background: "#fff8e1", border: "1px solid #ffd97d", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 8 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#856404", marginBottom: 3 }}>Regulatory risk</div>
              <div style={{ fontSize: 12, color: "#6b4c00", lineHeight: 1.5 }}>{signal.riskFlag.reason}</div>
            </div>
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <FormatPicker signal={signal} onSelect={onCreateJob} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard widget — top 5 compact cards, linking to full trends page
// ---------------------------------------------------------------------------

export function TrendSignalWidget() {
  const { digests, lastRunAt, nextScheduledAt } = useTrendStore();
  const router = useRouter();
  const latest = digests[0];
  if (!latest) return null;

  const top5 = [...latest.signals]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);

  const runDate = lastRunAt
    ? new Date(lastRunAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const nextDate = new Date(nextScheduledAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <div>
          <h3>Trend Signal Monitor</h3>
          <span className="sub" style={{ marginLeft: 8 }}>Top 5 this week · last run {runDate}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="faint tiny">Next: {nextDate}</span>
          <button className="btn ghost sm" onClick={() => router.push("/contentos/trends")}>
            View all →
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, padding: "12px 16px 16px" }}>
        {top5.map((s) => (
          <MiniSignalCard
            key={s.id}
            signal={s}
            onClick={() => router.push("/contentos/trends")}
          />
        ))}
      </div>
    </div>
  );
}

function MiniSignalCard({ signal, onClick }: { signal: TrendSignal; onClick: () => void }) {
  const accent = CAT_COLOR[signal.category];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      className="trend-card"
      style={{
        border: "1.5px solid var(--border)", borderRadius: 10,
        background: "var(--bg-panel)", cursor: "pointer",
        display: "flex", flexDirection: "column", overflow: "hidden",
        outline: "none",
      }}>
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      <div style={{ padding: "10px 11px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <CategoryChip category={signal.category} />
        <div style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: "var(--text)",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {signal.topicName}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {signal.source}
          </span>
          {signal.riskFlag?.hasRisk && (
            <span style={{ fontSize: 10, color: "#856404" }}>⚠</span>
          )}
        </div>
        <ScoreBar score={signal.relevanceScore} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full-page panel
// ---------------------------------------------------------------------------

export function TrendSignalFullPanel() {
  const { digests, lastRunAt, nextScheduledAt } = useTrendStore();
  const router = useRouter();
  const [filterCat, setFilterCat] = useState<TrendSignalCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const latest = digests[0];
  const allCategories = Object.keys(TREND_CATEGORY_LABELS) as TrendSignalCategory[];

  const filtered = latest
    ? [...latest.signals]
        .filter((s) => filterCat === "all" || s.category === filterCat)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
    : [];

  const selectedSignal = selectedId ? latest?.signals.find((s) => s.id === selectedId) : null;

  const runDate  = lastRunAt ? new Date(lastRunAt).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Never";
  const nextDate = new Date(nextScheduledAt).toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric" });

  function handleRunNow() {
    setRunning(true);
    setSelectedId(null);
    setTimeout(() => { trendStore.runNow(); setRunning(false); }, 1200);
  }

  function handleCreateJob(signal: TrendSignal, type: JobType, lane: AgentLane) {
    const params = new URLSearchParams({
      lane,
      type,
      trend: signal.topicName,
      angle: signal.contentAngle,
    });
    router.push(`/contentos/intake?${params.toString()}`);
  }

  return (
    <div className="content wide">

      {/* Page header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Trend Signal Monitor</h1>
          <p>Weekly digest of trending topics mapped to Sprout's ICP. Click any card to explore.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ textAlign: "right" }} className="faint tiny">
            Last run: {runDate}<br />Next: {nextDate} · weekly
          </div>
          <button className="btn primary" onClick={handleRunNow} disabled={running}>
            {running ? "Running…" : "↻ Run now"}
          </button>
        </div>
      </div>

      {/* Schedule strip */}
      <div className="panel panel-pad" style={{ marginBottom: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="tiny" style={{ color: "var(--text-muted)", marginBottom: 2 }}>Schedule</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Weekly · every Monday 8:00 AM</div>
        </div>
        <div style={{ width: 1, height: 32, background: "var(--border)" }} />
        <div>
          <div className="tiny" style={{ color: "var(--text-muted)", marginBottom: 4 }}>Keyword categories</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {allCategories.map((c) => <CategoryChip key={c} category={c} />)}
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="tiny" style={{ color: "var(--text-muted)", marginBottom: 2 }}>Signals this week</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--green-deep)" }}>{latest?.signals.length ?? 0}</div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          className={`btn sm ${filterCat === "all" ? "primary" : "ghost"}`}
          onClick={() => { setFilterCat("all"); setSelectedId(null); }}>
          All ({latest?.signals.length ?? 0})
        </button>
        {allCategories.map((c) => {
          const count  = latest?.signals.filter((s) => s.category === c).length ?? 0;
          const active = filterCat === c;
          return (
            <button
              key={c}
              className={`btn sm ${active ? "primary" : "ghost"}`}
              onClick={() => { setFilterCat(c); setSelectedId(null); }}
              style={active ? { background: CAT_COLOR[c] + "22", color: CAT_COLOR[c], borderColor: CAT_COLOR[c] + "66" } : {}}>
              {TREND_CATEGORY_LABELS[c]} ({count})
            </button>
          );
        })}
      </div>

      {/* Main content: card grid + detail */}
      <div style={{ display: "grid", gridTemplateColumns: selectedSignal ? "1fr 340px" : "1fr", gap: 16, alignItems: "start" }}>

        {/* Card grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {filtered.length === 0 && (
            <div className="faint tiny" style={{ padding: "24px 0", gridColumn: "1 / -1" }}>No signals for this category.</div>
          )}
          {filtered.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              selected={s.id === selectedId}
              onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
            />
          ))}
        </div>

        {/* Detail panel */}
        {selectedSignal && (
          <SignalDetail
            signal={selectedSignal}
            onClose={() => setSelectedId(null)}
            onCreateJob={(type, lane) => handleCreateJob(selectedSignal, type, lane)}
          />
        )}
      </div>

      {/* Hover style */}
      <style>{`
        .trend-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 22px rgba(16,10,40,0.10);
          border-color: var(--border-strong) !important;
        }
        .trend-card:focus-visible {
          box-shadow: 0 0 0 2px var(--ubas);
        }
      `}</style>
    </div>
  );
}
