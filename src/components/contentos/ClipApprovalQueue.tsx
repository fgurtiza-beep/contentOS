"use client";

import { useState } from "react";
import { useJobs, jobStore } from "@/lib/contentos/store/useStore";
import type { ClipApprovalEntry, ClipType, Job } from "@/lib/contentos/schemas/contentos";

const REVIEWER = "marketing@sprout.ph";

type QueueItem = { job: Job; entry: ClipApprovalEntry };
type OpenRef  = { jobId: string; entryId: string };

const CLIP_TYPE_LABEL: Record<ClipType, string> = {
  hook: "Hook", insight: "Insight", soundbite: "Soundbite", "story-beat": "Story Beat", cta: "CTA",
};

const CLIP_TYPE_CLASS: Record<ClipType, string> = {
  hook: "clip-hook", insight: "clip-insight", soundbite: "clip-soundbite",
  "story-beat": "clip-story", cta: "clip-cta",
};

function trunc(text: string, n: number) {
  return text.length <= n ? text : text.slice(0, n - 1) + "…";
}

function PlatformScore({ label, score }: { label: string; score: number }) {
  const color = score >= 4.5 ? "var(--green)" : score >= 3 ? "var(--carrot)" : "var(--text-faint)";
  return (
    <span style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3 }}>
      {label && <span style={{ color: "var(--text-muted)" }}>{label}</span>}
      <span style={{ fontWeight: 700, color }}>{score.toFixed(1)}</span>
      <span style={{ color: "var(--text-faint)" }}>/5</span>
    </span>
  );
}

function ClipTypeBadge({ type }: { type: ClipType }) {
  return (
    <span className={`chip ${CLIP_TYPE_CLASS[type]}`} style={{ fontSize: 11, padding: "2px 8px" }}>
      {CLIP_TYPE_LABEL[type]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Queue root (standalone page — also embedded as section in HumanReviewQueue)
// ---------------------------------------------------------------------------

export function ClipApprovalQueue() {
  const jobs   = useJobs();
  const [openRef, setOpenRef] = useState<OpenRef | null>(null);

  const pendingItems: QueueItem[] = jobs.flatMap((j) =>
    (j.clipApprovalQueue ?? [])
      .filter((e) => e.status === "pending")
      .map((e) => ({ job: j, entry: e })),
  );

  const openItem: QueueItem | null = openRef
    ? (() => {
        const job   = jobs.find((j) => j.id === openRef.jobId);
        const entry = job?.clipApprovalQueue?.find((e) => e.id === openRef.entryId);
        return job && entry ? { job, entry } : null;
      })()
    : null;

  return (
    <div className="content wide">
      <div className="page-head">
        <h1>Clip Approval</h1>
        <p>
          {openItem
            ? openItem.entry.status === "approved"
              ? "Clip approved — editor brief updated. View it in Job Workspace → Agent outputs."
              : "Review the clip, adjust timestamps if needed, then approve or reject."
            : `Clean clip candidates awaiting sign-off. ${pendingItems.length} pending.`}
        </p>
      </div>

      {!openItem && pendingItems.length === 0 && (
        <div className="panel empty">Queue is clear. No clips awaiting approval.</div>
      )}

      {!openItem && pendingItems.length > 0 && (
        <div className="choice-grid three">
          {pendingItems.map((item) => (
            <ClipCard
              key={item.entry.id}
              item={item}
              onOpen={() => setOpenRef({ jobId: item.job.id, entryId: item.entry.id })}
            />
          ))}
        </div>
      )}

      {openItem && (
        <ClipDetail item={openItem} onBack={() => setOpenRef(null)} />
      )}
    </div>
  );
}

export type { QueueItem };

// ---------------------------------------------------------------------------
// Queue card
// ---------------------------------------------------------------------------

export function ClipCard({ item, onOpen }: { item: QueueItem; onOpen: () => void }) {
  const { job, entry } = item;
  const c = entry.candidate;
  return (
    <div className="rcard">
      <div className="rrow">
        <ClipTypeBadge type={c.clipType} />
        <span className="faint tiny" style={{ marginLeft: "auto" }}>{trunc(job.brief.title, 28)}</span>
      </div>
      <div className="rrow" style={{ gap: 6 }}>
        <span className="tiny" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
          ⏱ {c.startTime} – {c.endTime}
        </span>
        <span className="tiny" style={{ color: "var(--text-faint)" }}>ch. {c.chapterIndex + 1}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.5 }}>{trunc(c.excerpt, 140)}</div>
      <div className="rrow" style={{ gap: 10, marginTop: 2 }}>
        <PlatformScore label="LI" score={c.platformFit.linkedin} />
        <PlatformScore label="IG" score={c.platformFit.instagram} />
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)" }}>rank {c.rankScore.toFixed(1)}</span>
      </div>
      <button className="btn primary sm" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={onOpen}>
        Review →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

export function ClipDetail({ item, onBack }: { item: QueueItem; onBack: () => void }) {
  const { job, entry } = item;
  const c = entry.candidate;

  const [rejectNote,  setRejectNote]  = useState("");
  const [editingTs,   setEditingTs]   = useState(false);
  const [tsStart,     setTsStart]     = useState(c.startTime);
  const [tsEnd,       setTsEnd]       = useState(c.endTime);

  const isApproved = entry.status === "approved";
  const isRejected = entry.status === "rejected";

  function handleApprove() {
    jobStore.clipApprove(job.id, entry.id, REVIEWER);
  }

  function handleReject() {
    jobStore.clipReject(job.id, entry.id, REVIEWER, rejectNote);
    onBack();
  }

  function handleSaveTimestamps() {
    jobStore.clipEditTimestamps(job.id, entry.id, tsStart, tsEnd, REVIEWER);
    setEditingTs(false);
  }

  const approvedCount = (job.clipApprovalQueue ?? []).filter((e) => e.status === "approved").length;

  return (
    <>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back to queue
      </button>

      {isApproved && (
        <div className="callout" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <b>Editor brief updated.</b> This clip is now part of the sequence ({approvedCount} clip{approvedCount !== 1 ? "s" : ""} approved).
            {" "}View the full brief in <b>Job Workspace → Agent outputs</b>.
          </div>
        </div>
      )}

      <div className="qa-split">
        {/* LEFT — clip content */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <ClipTypeBadge type={c.clipType} />
              <span className="sub" style={{ marginLeft: 8 }}>
                Chapter {c.chapterIndex + 1} · {job.brief.title}
              </span>
            </div>
            {isApproved && (
              <span className="chip" style={{ background: "var(--green)", color: "#04240a", fontSize: 11 }}>
                ✓ Approved
              </span>
            )}
            {isRejected && (
              <span className="chip" style={{ background: "var(--red-soft)", color: "var(--red)", fontSize: 11 }}>
                Rejected
              </span>
            )}
          </div>
          <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Timestamps */}
            <div className="field">
              <label>Timestamp range</label>
              {editingTs && !isApproved ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="text" value={tsStart} onChange={(e) => setTsStart(e.target.value)}
                    placeholder="0:00" style={{ width: 80 }} />
                  <span style={{ color: "var(--text-faint)" }}>–</span>
                  <input type="text" value={tsEnd} onChange={(e) => setTsEnd(e.target.value)}
                    placeholder="0:30" style={{ width: 80 }} />
                  <button className="btn sm" onClick={handleSaveTimestamps}>Save</button>
                  <button className="btn ghost sm" onClick={() => { setEditingTs(false); setTsStart(c.startTime); setTsEnd(c.endTime); }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 600 }}>
                    {c.startTime} – {c.endTime}
                  </span>
                  {!isApproved && !isRejected && (
                    <button className="btn ghost sm" onClick={() => setEditingTs(true)}>Edit timestamps</button>
                  )}
                </div>
              )}
            </div>

            {/* Excerpt */}
            <div className="field">
              <label>Transcript excerpt</label>
              <div style={{
                background: "var(--bg-subtle)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "10px 12px", fontSize: 13, lineHeight: 1.65,
                color: "var(--text)", whiteSpace: "pre-wrap",
              }}>
                {c.excerpt}
              </div>
            </div>

            {/* Platform fit */}
            <div className="field">
              <label>Platform fit</label>
              <dl className="kv tiny" style={{ maxWidth: 260 }}>
                <dt>LinkedIn</dt><dd><PlatformScore label="" score={c.platformFit.linkedin} /></dd>
                <dt>Instagram</dt><dd><PlatformScore label="" score={c.platformFit.instagram} /></dd>
                <dt>Rank score</dt><dd style={{ fontWeight: 600 }}>{c.rankScore.toFixed(1)} / 5</dd>
              </dl>
            </div>

            {/* Risk flags */}
            <div className="field">
              <label>Risk flags</label>
              {c.riskFlag ? (
                <div className="callout warn" style={{ marginTop: 4 }}>
                  {c.riskFlag.reasons.map((r) => (
                    <div key={r} style={{ fontSize: 12, marginBottom: 4 }}>
                      <b>{r === "product_claim" ? "Product claim" : "Regulatory language"}</b>
                    </div>
                  ))}
                  {c.riskFlag.signals.map((s, i) => (
                    <div key={i} className="muted" style={{ fontSize: 12 }}>{s}</div>
                  ))}
                </div>
              ) : (
                <span className="faint tiny">None — clean clip, no risk signals detected.</span>
              )}
            </div>

          </div>
        </div>

        {/* RIGHT — actions or post-approval summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!isApproved && !isRejected && (
            <>
              <div className="panel panel-pad">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ marginBottom: 6 }}>Reject note (optional)</label>
                  <input type="text" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Reason for rejection…" />
                </div>
              </div>

              <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Reviewer actions</div>
                <button className="btn green" onClick={handleApprove}>
                  Approve → EditorBriefAgent
                </button>
                <button className="btn danger" onClick={handleReject}>
                  Reject
                </button>
                <button className="btn ghost sm" style={{ marginTop: 4 }}
                  onClick={() => { setEditingTs(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  Edit timestamps
                </button>
                <div className="faint tiny" style={{ marginTop: 8, lineHeight: 1.5 }}>
                  Approving adds this clip to the sequence and regenerates the job-level editor brief.
                </div>
              </div>
            </>
          )}

          <div className="panel panel-pad">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Source job</label>
              <dl className="kv tiny" style={{ marginTop: 4 }}>
                <dt>Title</dt><dd>{job.brief.title}</dd>
                <dt>Job type</dt><dd>{job.brief.jobType}</dd>
                <dt>Source</dt><dd>{job.videoTranscript?.videoSource.urlType ?? "—"}</dd>
                <dt>Submitted</dt><dd>{new Date(entry.submittedAt).toLocaleString()}</dd>
                {entry.reviewedBy && <><dt>Reviewed by</dt><dd>{entry.reviewedBy}</dd></>}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
