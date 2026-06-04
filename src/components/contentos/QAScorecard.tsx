"use client";

import { useState } from "react";
import type { QAReport } from "@/lib/contentos/schemas/contentos";
import { QA_LAYERS } from "@/lib/contentos/schemas/contentos";

function scoreColor(score: number): string {
  if (score >= 4.5) return "var(--green)";
  if (score >= 3) return "var(--amber)";
  return "var(--red)";
}

export function QAScorecard({ report }: { report: QAReport }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>8-layer QA scorecard</h3>
        <span className="sub">overall {report.overallScore.toFixed(1)}/5 · {Math.round(report.confidence * 100)}% confidence</span>
      </div>
      <div className="panel-pad">
        <div className="scorecard">
          {QA_LAYERS.map((meta) => {
            const layer = report.layers.find((l) => l.key === meta.key)!;
            const isOpen = open === meta.key;
            return (
              <div key={meta.key}>
                <div className="score-row" style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : meta.key)}>
                  <span className="faint tiny" style={{ width: 14 }}>{meta.index}</span>
                  <span className="nm">{meta.name}</span>
                  <span className={`state ${layer.status === "pass" ? "go" : layer.status === "revision" ? "warn" : "stop"}`}>{layer.status}</span>
                  <div className="score-bar"><span style={{ width: `${(layer.score / 5) * 100}%`, background: scoreColor(layer.score) }} /></div>
                  <span className="score-num">{layer.score.toFixed(1)}</span>
                </div>
                {isOpen && (
                  <div style={{ padding: "8px 12px 12px 26px" }}>
                    {layer.strengths.length > 0 && (
                      <div className="tiny"><b className="muted">Strengths:</b>
                        <ul className="bullets">{layer.strengths.map((s, i) => <li key={i} className="muted">{s}</li>)}</ul>
                      </div>
                    )}
                    {layer.weaknesses.length > 0 && (
                      <div className="tiny"><b style={{ color: "var(--red)" }}>Weaknesses:</b>
                        <ul className="bullets">{layer.weaknesses.map((s, i) => <li key={i} className="muted">{s}</li>)}</ul>
                      </div>
                    )}
                    {layer.recommendedFixes.length > 0 && (
                      <div className="tiny"><b className="muted">Recommended fixes:</b>
                        <ul className="bullets">{layer.recommendedFixes.map((s, i) => <li key={i} className="muted">{s}</li>)}</ul>
                      </div>
                    )}
                    <div className="faint tiny">Confidence {Math.round(layer.confidence * 100)}%</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
