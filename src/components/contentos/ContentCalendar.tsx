"use client";

import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { useJobs } from "@/lib/contentos/store/useStore";
import type { Job } from "@/lib/contentos/schemas/contentos";
import { toHubSpotDate, toHubSpotAccount } from "@/lib/contentos/export/exporters";

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
}

interface Slot { date: string; time: string }
type Schedule = Record<string, Slot | undefined>;

/* ------------------------------------------------------------------ */
/* Platform colour map                                                 */
/* ------------------------------------------------------------------ */

const PLATFORM_STYLE: Record<string, CSSProperties> = {
  linkedin:  { backgroundColor: "#e8f0fb", color: "#0a66c2" },
  instagram: { backgroundColor: "#fce8f3", color: "#c13584" },
  facebook:  { backgroundColor: "#dce8fc", color: "#1877f2" },
  x:         { backgroundColor: "#f2f2f2", color: "#14171a" },
};
const platformStyle = (key: string): CSSProperties =>
  PLATFORM_STYLE[key] ?? { backgroundColor: "#f0f0f0", color: "#555" };

/* ------------------------------------------------------------------ */
/* Extract posts from approved jobs                                    */
/* ------------------------------------------------------------------ */

const SOCIAL_KEYS = new Set(["linkedin", "x", "twitter", "instagram", "facebook"]);

function extractPosts(jobs: Job[]): CalendarPost[] {
  const posts: CalendarPost[] = [];
  for (const job of jobs) {
    if (!["QA_PASSED", "APPROVED", "SHIPPED", "EXPORTED"].includes(job.state)) continue;
    const qa = (job.finalQaReport ?? job.qaReport)?.overallScore.toFixed(1) ?? "—";

    if (job.lane === "repurposing" && job.repurposing) {
      for (const d of job.repurposing.derivatives) {
        const key = d.channel.toLowerCase() === "twitter" ? "x" : d.channel.toLowerCase();
        if (!SOCIAL_KEYS.has(key)) continue;
        const body = d.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text).join(" ");
        const cta  = d.blocks.filter((b) => b.kind === "cta").map((b) => b.text).join("; ") || job.brief.cta;
        posts.push({
          id: `${job.id}-${d.id}`,
          jobId: job.id,
          jobTitle: job.brief.title,
          platform: d.channel,
          platformKey: key,
          bodyText: body,
          hashtags: [],
          link: cta,
          postType: d.format,
          formatNote: "",
          qaScore: qa,
        });
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
  const dow = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ------------------------------------------------------------------ */
/* CSV builder                                                         */
/* ------------------------------------------------------------------ */

// HubSpot Social bulk scheduling columns:
// Account, Date (mm/dd/yy hh:mm), Message, Link, Photo URL, Campaign
// + two trailing reference columns HubSpot will ignore on import.
function buildCsv(posts: CalendarPost[], schedule: Schedule): string {
  const q = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const header = ["Account","Date","Message","Link","Photo URL","Campaign","content_format_recommendation","qa_score"];
  const rows = [
    header.map(q).join(","),
    ...posts.map((p) => {
      const s = schedule[p.id];
      const message = [p.bodyText, ...p.hashtags.map((h) => `#${h}`)].filter(Boolean).join("\n\n");
      return [
        toHubSpotAccount(p.platform, p.platformKey),
        s ? toHubSpotDate(s.date, s.time) : "",
        message,
        p.link,
        "",   // Photo URL — not managed here
        "",   // Campaign — not tracked per-post
        [p.postType, p.formatNote].filter(Boolean).join(" · "),
        p.qaScore,
      ].map(q).join(",");
    }),
  ];
  return rows.join("\n");
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `content-calendar-${toISO(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function ContentCalendar() {
  const jobs  = useJobs();
  const posts = useMemo(() => extractPosts(jobs), [jobs]);

  const [schedule, setSchedule] = useState<Schedule>({});
  const [weekOf,   setWeekOf]   = useState<Date>(() => mondayOf(new Date()));
  const [editing,  setEditing]  = useState<string | null>(null);
  const [pickDate, setPickDate] = useState("");
  const [pickTime, setPickTime] = useState("09:00");

  const days       = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
  const todayStr   = toISO(new Date());
  const weekLabel  = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const unscheduled = posts.filter((p) => !schedule[p.id]);
  const scheduled   = posts.filter((p) =>  schedule[p.id]);

  function openPicker(postId: string) {
    const existing = schedule[postId];
    setPickDate(existing?.date ?? todayStr);
    setPickTime(existing?.time ?? "09:00");
    setEditing(postId);
  }

  function confirmSchedule() {
    if (!editing || !pickDate) return;
    setSchedule((prev) => ({ ...prev, [editing]: { date: pickDate, time: pickTime } }));
    setEditing(null);
  }

  function removeFromCalendar(postId: string) {
    setSchedule((prev) => { const n = { ...prev }; delete n[postId]; return n; });
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
          No approved social posts yet. Pass QA on a <strong>Multi-Channel Social</strong> or <strong>Content Repurposing</strong> job to see posts here.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>

        {/* ---- Unscheduled sidebar ---- */}
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

          {unscheduled.map((post) => (
            <div key={post.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ ...platformStyle(post.platformKey), padding: "1px 7px", borderRadius: 10, fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>
                  {post.platform}
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
                  <input
                    type="date" value={pickDate}
                    onChange={(e) => setPickDate(e.target.value)}
                    style={{ fontSize: 11, padding: "4px 7px", border: "1px solid var(--border-strong)", borderRadius: 5, width: "100%", fontFamily: "inherit" }}
                  />
                  <input
                    type="time" value={pickTime}
                    onChange={(e) => setPickTime(e.target.value)}
                    style={{ fontSize: 11, padding: "4px 7px", border: "1px solid var(--border-strong)", borderRadius: 5, width: "100%", fontFamily: "inherit" }}
                  />
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
          ))}

          {/* Scheduled summary in sidebar */}
          {scheduled.length > 0 && (
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 8 }}>
                Scheduled ({scheduled.length})
              </div>
              {scheduled.map((post) => {
                const s = schedule[post.id]!;
                return (
                  <div key={post.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, fontSize: 11 }}>
                    <span style={{ ...platformStyle(post.platformKey), padding: "1px 6px", borderRadius: 9, fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>
                      {post.platform}
                    </span>
                    <span style={{ color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.date} {s.time}
                    </span>
                    <button
                      onClick={() => removeFromCalendar(post.id)}
                      style={{ color: "var(--text-faint)", fontSize: 12, lineHeight: 1, padding: "1px 4px", flexShrink: 0, cursor: "pointer", background: "none", border: "none" }}
                      title="Remove from calendar"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- Calendar grid ---- */}
        <div className="panel" style={{ overflow: "hidden" }}>
          {/* Week nav bar */}
          <div className="panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn sm" onClick={() => setWeekOf((d) => addDays(d, -7))}>‹ Prev</button>
              <span style={{ fontWeight: 600, fontSize: 13, minWidth: 200, textAlign: "center" }}>{weekLabel}</span>
              <button className="btn sm" onClick={() => setWeekOf((d) => addDays(d, 7))}>Next ›</button>
            </div>
            <span className="sub">{scheduled.length} of {posts.length} scheduled</span>
          </div>

          {/* Day columns */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--border)" }}>
            {days.map((day, i) => {
              const ds       = toISO(day);
              const isToday  = ds === todayStr;
              const dayPosts = scheduled
                .filter((p) => schedule[p.id]?.date === ds)
                .sort((a, b) => (schedule[a.id]?.time ?? "").localeCompare(schedule[b.id]?.time ?? ""));

              return (
                <div
                  key={ds}
                  style={{ borderRight: i < 6 ? "1px solid var(--border)" : "none", minHeight: 200 }}
                >
                  {/* Day header */}
                  <div style={{
                    padding: "8px 6px 6px",
                    borderBottom: "1px solid var(--border)",
                    textAlign: "center",
                    background: isToday ? "var(--ubas-soft)" : "transparent",
                  }}>
                    <div style={{ fontSize: 9.5, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {DAY_LABELS[i]}
                    </div>
                    <div style={{
                      fontSize: 20, fontWeight: 800, lineHeight: 1.15, marginTop: 1,
                      color: isToday ? "var(--ubas)" : "var(--green-deep)",
                    }}>
                      {day.getDate()}
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--text-faint)" }}>
                      {day.toLocaleDateString("en-US", { month: "short" })}
                    </div>
                  </div>

                  {/* Post chips */}
                  <div style={{ padding: 5, display: "flex", flexDirection: "column", gap: 4 }}>
                    {dayPosts.map((post) => {
                      const s  = schedule[post.id]!;
                      const ps = platformStyle(post.platformKey);
                      return (
                        <div
                          key={post.id}
                          style={{
                            padding: "5px 6px", borderRadius: 6, fontSize: 10, lineHeight: 1.35,
                            background: ps.backgroundColor as string,
                            border: `1px solid ${ps.color as string}33`,
                          }}
                          title={post.bodyText}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, color: ps.color as string, fontSize: 9 }}>{post.platform}</span>
                            <span style={{ color: "var(--text-faint)", fontSize: 9 }}>{s.time}</span>
                          </div>
                          <div style={{ color: "var(--text)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {post.bodyText.slice(0, 60)}{post.bodyText.length > 60 ? "…" : ""}
                          </div>
                          <button
                            onClick={() => removeFromCalendar(post.id)}
                            style={{ marginTop: 3, fontSize: 9, color: "var(--text-faint)", background: "none", border: "none", padding: 0, cursor: "pointer", display: "block" }}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}

                    {/* Drop hint on empty days */}
                    {dayPosts.length === 0 && (
                      <div style={{ padding: "8px 4px", color: "var(--text-faint)", fontSize: 10, textAlign: "center", lineHeight: 1.3 }}>
                        —
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)" }}>
            <p className="faint tiny" style={{ margin: 0 }}>
              Export CSV matches <strong style={{ color: "var(--text-muted)" }}>HubSpot Social</strong> bulk scheduling format (Account, Date, Message, Link, Photo URL, Campaign). Before uploading: set dates as <code>mm/dd/yy hh:mm</code> and replace the Account placeholder with your actual connected HubSpot account name — e.g. <em>Sprout Solutions - LinkedIn Page</em>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
