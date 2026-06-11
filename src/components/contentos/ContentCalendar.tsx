"use client";

import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useJobs, useCalendarSchedule, jobStore } from "@/lib/contentos/store/useStore";
import type { Job } from "@/lib/contentos/schemas/contentos";
import { toHubSpotDate, toHubSpotAccount } from "@/lib/contentos/export/exporters";
import PILLARS from "@/lib/contentos/config/contentPillars";

/* ------------------------------------------------------------------ */
/* Data model                                                          */
/* ------------------------------------------------------------------ */

interface CalendarPost {
  id: string;
  jobId: string;
  jobTitle: string;
  platform: string;
  platformKey: string;
  bodyText: string;
  hashtags: string[];
  link: string;
  postType: string;
  formatNote: string;
  qaScore: string;
  pillar: string;
  jobState: string;
}

type Schedule = Record<string, { date: string; time: string } | undefined>;

/* ------------------------------------------------------------------ */
/* Platform colour map                                                 */
/* ------------------------------------------------------------------ */

const PLATFORM_STYLE: Record<string, CSSProperties> = {
  linkedin:  { backgroundColor: "#e8f0fb", color: "#0a66c2" },
  instagram: { backgroundColor: "#fce8f3", color: "#c13584" },
  facebook:  { backgroundColor: "#dce8fc", color: "#1877f2" },
  x:         { backgroundColor: "#f2f2f2", color: "#14171a" },
  threads:   { backgroundColor: "#f0f0f0", color: "#333333" },
};
const platformStyle = (key: string): CSSProperties =>
  PLATFORM_STYLE[key] ?? { backgroundColor: "#f0f0f0", color: "#555" };

/* ------------------------------------------------------------------ */
/* Pillar helpers                                                      */
/* ------------------------------------------------------------------ */

const PILLAR_MAP = Object.fromEntries(PILLARS.map(p => [p.slug, p]));
const UNTAGGED = { slug: "", name: "Untagged", color: "#9ca3af", icon: "·" };
const getPillar = (slug: string) => (slug ? PILLAR_MAP[slug] ?? UNTAGGED : UNTAGGED);

/* ------------------------------------------------------------------ */
/* Extract posts from approved jobs                                    */
/* ------------------------------------------------------------------ */

const SOCIAL_KEYS = new Set(["linkedin", "x", "twitter", "instagram", "facebook"]);

function extractPosts(jobs: Job[]): CalendarPost[] {
  const posts: CalendarPost[] = [];
  for (const job of jobs) {
    if (!["QA_PASSED", "APPROVED", "SHIPPED", "EXPORTED"].includes(job.state)) continue;
    const qa     = (job.finalQaReport ?? job.qaReport)?.overallScore.toFixed(1) ?? "—";
    const pillar = job.brief.contentPillar ?? "";

    if (job.lane === "repurposing" && job.repurposing) {
      for (const d of job.repurposing.derivatives) {
        const key = d.channel.toLowerCase() === "twitter" ? "x" : d.channel.toLowerCase();
        if (!SOCIAL_KEYS.has(key)) continue;
        const body = d.blocks.filter(b => b.kind === "paragraph").map(b => b.text).join(" ");
        const cta  = d.blocks.filter(b => b.kind === "cta").map(b => b.text).join("; ") || job.brief.cta;
        posts.push({ id: `${job.id}-${d.id}`, jobId: job.id, jobTitle: job.brief.title, platform: d.channel, platformKey: key, bodyText: body, hashtags: [], link: cta, postType: d.format, formatNote: "", qaScore: qa, pillar, jobState: job.state });
      }
    } else if (job.brief.jobType === "social_post" && job.production?.draft) {
      const blocks = job.production.draft.blocks;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.kind !== "h3") continue;
        const nextPara = blocks[i + 1];
        if (!nextPara || nextPara.kind !== "paragraph") continue;
        const captionMatch = b.text.match(/^(\w+)\s+caption$/i);
        const platform    = captionMatch ? captionMatch[1] : b.text;
        const platformKey = captionMatch ? (captionMatch[1].toLowerCase() === "twitter" ? "x" : captionMatch[1].toLowerCase()) : "social";
        posts.push({ id: `${job.id}-${b.id}`, jobId: job.id, jobTitle: job.brief.title, platform, platformKey, bodyText: nextPara.text, hashtags: [], link: job.brief.cta || "", postType: "social_post", formatNote: b.text, qaScore: qa, pillar, jobState: job.state });
      }
    }
  }
  return posts;
}

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

function mondayOf(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ------------------------------------------------------------------ */
/* CSV builder (unchanged format)                                      */
/* ------------------------------------------------------------------ */

function buildCsv(posts: CalendarPost[], schedule: Schedule): string {
  const q = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const header = ["Account", "Date", "Message", "Link", "Photo URL", "Campaign", "content_format_recommendation", "qa_score"];
  const rows = [
    header.map(q).join(","),
    ...posts.map(p => {
      const s       = schedule[p.id];
      const message = [p.bodyText, ...p.hashtags.map(h => `#${h}`)].filter(Boolean).join("\n\n");
      return [toHubSpotAccount(p.platform, p.platformKey), s ? toHubSpotDate(s.date, s.time) : "", message, p.link, "", "", [p.postType, p.formatNote].filter(Boolean).join(" · "), p.qaScore].map(q).join(",");
    }),
  ];
  return rows.join("\n");
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `content-calendar-${toISO(new Date())}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Pillar filter bar                                                   */
/* ------------------------------------------------------------------ */

function PillarFilterBar({ active, onFilter }: { active: string | null; onFilter: (slug: string | null) => void }) {
  const pill = (on: boolean, color?: string): CSSProperties => ({
    padding: "4px 12px", borderRadius: 20, border: "1px solid", cursor: "pointer",
    fontSize: 11.5, fontWeight: on ? 700 : 400, transition: "all 0.12s",
    borderColor: on ? (color ?? "var(--ubas)") : "var(--border)",
    background:  on ? (color ? color + "22" : "var(--ubas)") : "transparent",
    color:       on ? (color ?? "#fff") : "var(--text-muted)",
  });
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
      <button style={pill(active == null)} onClick={() => onFilter(null)}>All pillars</button>
      {PILLARS.map(p => (
        <button key={p.slug} style={pill(active === p.slug, p.color)}
          onClick={() => onFilter(active === p.slug ? null : p.slug)}>
          {p.icon} {p.name}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Weekly coverage bar                                                 */
/* ------------------------------------------------------------------ */

function CoverageBar({ posts, days, schedule }: { posts: CalendarPost[]; days: Date[]; schedule: Schedule }) {
  const daySet    = new Set(days.map(toISO));
  const weekPosts = posts.filter(p => { const s = schedule[p.id]; return s ? daySet.has(s.date) : false; });
  const total     = weekPosts.length;

  if (total === 0) return (
    <div style={{ marginBottom: 12, padding: "7px 12px", background: "var(--bg-panel, #fafafa)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>No posts scheduled this week yet.</span>
    </div>
  );

  const counts: Record<string, number> = {};
  for (const p of weekPosts) counts[p.pillar] = (counts[p.pillar] ?? 0) + 1;
  const segments = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const dom      = segments[0];
  const dominated = dom && dom[1] / total > 0.5;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10, marginBottom: 7, border: "1px solid var(--border)" }}>
        {segments.map(([slug, count]) => {
          const p = getPillar(slug);
          return <div key={slug} style={{ width: `${(count / total) * 100}%`, background: p.color }} title={`${p.name}: ${count}`} />;
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {segments.map(([slug, count]) => {
          const p = getPillar(slug);
          return (
            <div key={slug} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "var(--text-muted)" }}>{p.name}</span>
              <span style={{ color: "var(--text-faint)" }}>{count}</span>
            </div>
          );
        })}
      </div>
      {dominated && (
        <div style={{ marginTop: 7, fontSize: 11, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 10px" }}>
          Heavy on <b>{getPillar(dom[0]).name}</b> this week. Consider balancing with other pillars.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Unscheduled tray                                                    */
/* ------------------------------------------------------------------ */

function UnscheduledTray({ posts, onOpenPicker }: { posts: CalendarPost[]; onOpenPicker: (id: string) => void }) {
  if (posts.length === 0) return (
    <div style={{ marginBottom: 14, padding: "7px 14px", background: "var(--bg-panel, #fafafa)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-faint)" }}>
      All approved posts are on the calendar.
    </div>
  );

  return (
    <div style={{ marginBottom: 14, padding: "8px 14px", background: "var(--bg-panel, #fafafa)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-faint)", marginBottom: 7 }}>
        Unscheduled · {posts.length} — drag onto a day or click to schedule
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {posts.map(p => {
          const pl      = getPillar(p.pillar);
          const snippet = p.bodyText.replace(/\n/g, " ").slice(0, 52);
          return (
            <div key={p.id} draggable
              onDragStart={e => e.dataTransfer.setData("postId", p.id)}
              onClick={() => onOpenPicker(p.id)}
              title={`${p.platform} · ${p.jobTitle}\n${p.bodyText.slice(0, 140)}`}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 14, cursor: "grab", border: `1px solid ${pl.color}44`, background: pl.color + "18", fontSize: 11, maxWidth: 220 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: pl.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {snippet}{p.bodyText.length > 52 ? "…" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function ContentCalendar() {
  const router   = useRouter();
  const jobs     = useJobs();
  const posts    = useMemo(() => extractPosts(jobs), [jobs]);
  const schedule = useCalendarSchedule();

  const [weekOf,       setWeekOf]       = useState<Date>(() => mondayOf(new Date()));
  const [editing,      setEditing]      = useState<string | null>(null);
  const [pickDate,     setPickDate]     = useState("");
  const [pickTime,     setPickTime]     = useState("09:00");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [dragOverDay,  setDragOverDay]  = useState<string | null>(null);

  const days      = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
  const todayStr  = toISO(new Date());
  const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const displayPosts = activeFilter ? posts.filter(p => p.pillar === activeFilter) : posts;
  const unscheduled  = displayPosts.filter(p => !schedule[p.id]);
  const scheduled    = displayPosts.filter(p =>  !!schedule[p.id]);

  function openPicker(postId: string) {
    const existing = schedule[postId];
    setPickDate(existing?.date ?? todayStr);
    setPickTime(existing?.time ?? "09:00");
    setEditing(postId);
  }

  function confirmSchedule() {
    if (!editing || !pickDate) return;
    jobStore.schedulePost(editing, pickDate, pickTime);
    setEditing(null);
  }

  function removeFromCalendar(postId: string) { jobStore.unschedulePost(postId); }

  function handleDrop(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    setDragOverDay(null);
    const postId = e.dataTransfer.getData("postId");
    if (postId) jobStore.schedulePost(postId, dateStr, "09:00");
  }

  return (
    <div className="content wide">

      {/* Page header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Content Calendar</h1>
          <p>Assign approved social posts to dates, then export a scheduling CSV for Hootsuite or Buffer.</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setWeekOf(mondayOf(new Date()))}>Today</button>
          <button className="btn primary" onClick={() => downloadCsv(buildCsv(posts, schedule))} disabled={posts.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {posts.length === 0 && (
        <div className="callout" style={{ marginBottom: 16 }}>
          No approved social posts yet. Pass QA on a <strong>Social post</strong> or <strong>Content Repurposing</strong> job to see posts here.
        </div>
      )}

      {/* Pillar filter bar */}
      <PillarFilterBar active={activeFilter} onFilter={setActiveFilter} />

      {/* Coverage bar — always shows all posts, not just filtered */}
      <CoverageBar posts={posts} days={days} schedule={schedule} />

      {/* Unscheduled tray */}
      <UnscheduledTray posts={unscheduled} onOpenPicker={openPicker} />

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>

        {/* ---- Scheduling sidebar ---- */}
        <div className="panel" style={{ position: "sticky", top: 68, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
          <div className="panel-head">
            <h3>Unscheduled</h3>
            <span className="sub">{unscheduled.length}</span>
          </div>

          {unscheduled.length === 0 && (
            <div style={{ padding: 18, textAlign: "center", color: "var(--text-faint)", fontSize: 12 }}>
              All posts are on the calendar.
            </div>
          )}

          {unscheduled.map(post => {
            const pl = getPillar(post.pillar);
            return (
              <div key={post.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <span style={{ ...platformStyle(post.platformKey), padding: "1px 7px", borderRadius: 10, fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>
                    {post.platform}
                  </span>
                  <span style={{ padding: "1px 6px", borderRadius: 9, fontSize: 9, fontWeight: 600, background: pl.color + "18", color: pl.color, flexShrink: 0 }}>
                    {pl.icon} {pl.name}
                  </span>
                  <span style={{ color: "var(--text-faint)", fontSize: 10, marginLeft: "auto" }}>QA {post.qaScore}</span>
                </div>
                <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--text)", marginBottom: 5 }}>
                  {post.bodyText.slice(0, 88)}{post.bodyText.length > 88 ? "…" : ""}
                </div>
                <div style={{ color: "var(--text-faint)", fontSize: 10, marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {post.jobTitle}
                </div>

                {editing === post.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <input type="date" value={pickDate} onChange={e => setPickDate(e.target.value)} style={{ fontSize: 11, padding: "4px 7px", border: "1px solid var(--border-strong)", borderRadius: 5, width: "100%", fontFamily: "inherit" }} />
                    <input type="time" value={pickTime} onChange={e => setPickTime(e.target.value)} style={{ fontSize: 11, padding: "4px 7px", border: "1px solid var(--border-strong)", borderRadius: 5, width: "100%", fontFamily: "inherit" }} />
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn primary sm" style={{ flex: 1, fontSize: 11 }} onClick={confirmSchedule} disabled={!pickDate}>Add →</button>
                      <button className="btn sm" style={{ flex: 1, fontSize: 11 }} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn sm" style={{ width: "100%", fontSize: 11 }} onClick={() => openPicker(post.id)}>
                    + Add to calendar
                  </button>
                )}
              </div>
            );
          })}

          {scheduled.length > 0 && (
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 8 }}>
                Scheduled ({scheduled.length})
              </div>
              {scheduled.map(post => {
                const s = schedule[post.id]!;
                return (
                  <div key={post.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, fontSize: 11 }}>
                    <span style={{ ...platformStyle(post.platformKey), padding: "1px 6px", borderRadius: 9, fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>{post.platform}</span>
                    <span style={{ color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.date} {s.time}</span>
                    <button onClick={() => removeFromCalendar(post.id)} style={{ color: "var(--text-faint)", fontSize: 12, lineHeight: 1, padding: "1px 4px", flexShrink: 0, cursor: "pointer", background: "none", border: "none" }} title="Remove">×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- Calendar grid ---- */}
        <div className="panel" style={{ overflow: "hidden" }}>
          <div className="panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn sm" onClick={() => setWeekOf(d => addDays(d, -7))}>‹ Prev</button>
              <span style={{ fontWeight: 600, fontSize: 13, minWidth: 200, textAlign: "center" }}>{weekLabel}</span>
              <button className="btn sm" onClick={() => setWeekOf(d => addDays(d, 7))}>Next ›</button>
            </div>
            <span className="sub">{scheduled.length} of {posts.length} scheduled</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--border)" }}>
            {days.map((day, i) => {
              const ds         = toISO(day);
              const isToday    = ds === todayStr;
              const isDragOver = dragOverDay === ds;
              const dayPosts   = scheduled
                .filter(p => schedule[p.id]?.date === ds)
                .sort((a, b) => (schedule[a.id]?.time ?? "").localeCompare(schedule[b.id]?.time ?? ""));

              return (
                <div key={ds}
                  style={{ borderRight: i < 6 ? "1px solid var(--border)" : "none", minHeight: 200, background: isDragOver ? "var(--ubas-soft, #f0eaff)" : "transparent", transition: "background 0.1s" }}
                  onDragOver={e => { e.preventDefault(); setDragOverDay(ds); }}
                  onDragLeave={() => setDragOverDay(null)}
                  onDrop={e => handleDrop(e, ds)}
                >
                  {/* Day header */}
                  <div style={{ padding: "8px 6px 6px", borderBottom: "1px solid var(--border)", textAlign: "center", background: isToday ? "var(--ubas-soft, #f0eaff)" : "transparent" }}>
                    <div style={{ fontSize: 9.5, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{DAY_LABELS[i]}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, marginTop: 1, color: isToday ? "var(--ubas)" : "var(--green-deep)" }}>{day.getDate()}</div>
                    <div style={{ fontSize: 9.5, color: "var(--text-faint)" }}>{day.toLocaleDateString("en-US", { month: "short" })}</div>
                  </div>

                  {/* Post cards + Add post */}
                  <div style={{ padding: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                    {dayPosts.map(post => {
                      const s         = schedule[post.id]!;
                      const ps        = platformStyle(post.platformKey);
                      const pl        = getPillar(post.pillar);
                      const approved  = ["APPROVED", "EXPORTED", "SHIPPED"].includes(post.jobState);
                      const snippet   = post.bodyText.replace(/\n/g, " ").slice(0, 80);
                      return (
                        <div key={post.id}
                          style={{ padding: "5px 6px", borderRadius: 6, fontSize: 10, lineHeight: 1.35, background: ps.backgroundColor as string, border: `1px solid ${ps.color as string}33`, maxHeight: 80, overflow: "hidden" }}
                          title={post.bodyText}
                        >
                          {/* Pillar tag + time + status dot */}
                          <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 2, overflow: "hidden" }}>
                            <span style={{ padding: "0 5px", borderRadius: 8, fontSize: 8, fontWeight: 700, background: pl.color + "22", color: pl.color, flexShrink: 0, whiteSpace: "nowrap" }}>
                              {pl.icon} {pl.name}
                            </span>
                            <span style={{ flex: 1 }} />
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: approved ? "#22c55e" : "#f59e0b", display: "inline-block", flexShrink: 0 }} title={post.jobState} />
                            <span style={{ color: "var(--text-faint)", fontSize: 8.5, flexShrink: 0 }}>{s.time}</span>
                          </div>
                          {/* Body — 2-line clamp */}
                          <div style={{ color: "var(--text)", fontSize: 9.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 2 }}>
                            {snippet}{post.bodyText.length > 80 ? "…" : ""}
                          </div>
                          {/* Platform + remove */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, color: ps.color as string, fontSize: 8.5 }}>{post.platform}</span>
                            <button onClick={() => removeFromCalendar(post.id)} style={{ color: "var(--text-faint)", fontSize: 10, background: "none", border: "none", padding: 0, cursor: "pointer" }}>×</button>
                          </div>
                        </div>
                      );
                    })}

                    {dayPosts.length === 0 && (
                      <div style={{ padding: "6px 4px", color: "var(--text-faint)", fontSize: 10, textAlign: "center" }}>—</div>
                    )}

                    {/* Add post placeholder */}
                    <button
                      onClick={() => router.push("/contentos/intake?lane=production&type=social_post")}
                      style={{ width: "100%", padding: "5px 4px", border: "1px dashed var(--border-strong, #ccc)", borderRadius: 6, background: "transparent", color: "var(--text-faint)", fontSize: 10, cursor: "pointer", textAlign: "center", marginTop: 2 }}
                    >
                      + Add post
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)" }}>
            <p className="faint tiny" style={{ margin: 0 }}>
              Export CSV matches <strong style={{ color: "var(--text-muted)" }}>HubSpot Social</strong> bulk scheduling format (Account, Date, Message, Link, Photo URL, Campaign). Before uploading: replace the Account placeholder with your actual connected HubSpot account name — e.g. <em>Sprout Solutions - LinkedIn Page</em>.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
