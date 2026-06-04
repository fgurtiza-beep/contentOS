"use client";

import { useState } from "react";
import type { ExportFormat, Job } from "@/lib/contentos/schemas/contentos";
import { EXPORT_FORMATS } from "@/lib/contentos/schemas/contentos";
import { jobStore } from "@/lib/contentos/store/useStore";
import { canExport } from "@/lib/contentos/orchestrator/contentOrchestrator";
import { renderExport } from "@/lib/contentos/export/exporters";

export function ExportPanel({ job }: { job: Job }) {
  const gate = canExport(job);
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [overrideReason, setOverrideReason] = useState("");
  const preview = renderExport(job, format);

  return (
    <div className="grid grid-2">
      <div className="panel">
        <div className="panel-head">
          <h3>Export</h3>
          <span className={`state ${gate.allowed ? "go" : "stop"}`}>{gate.allowed ? "Allowed" : "Blocked"}</span>
        </div>
        <div className="panel-pad">
          <div className={`callout ${gate.allowed ? "" : "warn"}`} style={{ marginBottom: 12 }}>{gate.reason}</div>

          <div className="field">
            <label>Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              {EXPORT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          {!gate.allowed && (
            <div className="field">
              <label>Override reason <span className="hint">· required to export without QA pass / approval (logged)</span></label>
              <input type="text" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why are you overriding the gate?" />
            </div>
          )}

          <div className="btn-row">
            <button
              className="btn primary"
              onClick={() => jobStore.exportJob(job.id, format, gate.allowed ? undefined : overrideReason || undefined)}
              disabled={!gate.allowed && !overrideReason}
            >
              {gate.allowed ? "Export" : "Export with logged override"}
            </button>
          </div>

          {job.exports.length > 0 && (
            <div className="field" style={{ marginTop: 16 }}>
              <label>Export history</label>
              {job.exports.map((e) => (
                <div key={e.id} className="tiny muted" style={{ marginBottom: 3 }}>
                  <span className={`state ${e.override ? "warn" : "go"}`} style={{ marginRight: 6 }}>{e.override ? "override" : "ok"}</span>
                  {e.format} · {new Date(e.at).toLocaleString()} {e.overrideReason ? `· ${e.overrideReason}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{EXPORT_FORMATS.find((f) => f.value === format)?.label} preview</h3>
          <span className="sub">placeholder render</span>
        </div>
        <div className="panel-pad">
          <pre className="export">{preview}</pre>
        </div>
      </div>
    </div>
  );
}
