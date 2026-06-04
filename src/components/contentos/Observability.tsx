"use client";

import { useJobs } from "@/lib/contentos/store/useStore";
import { EXPORT_FORMATS } from "@/lib/contentos/schemas/contentos";

export function Observability({ embedded = false }: { embedded?: boolean }) {
  const jobs = useJobs();
  const evaluated = jobs.filter((j) => j.qaReport);
  const passed = evaluated.filter((j) => (j.finalQaReport ?? j.qaReport)!.routing === "pass" || j.state === "QA_PASSED" || j.state === "EXPORTED" || j.state === "APPROVED");
  const revisions = jobs.reduce((a, j) => a + j.metrics.revisionAttempts, 0);
  const accepted = jobs.reduce((a, j) => a + j.metrics.acceptedSuggestions, 0);
  const rejected = jobs.reduce((a, j) => a + j.metrics.rejectedSuggestions, 0);
  const cost = jobs.reduce((a, j) => a + j.metrics.costUsd, 0);
  const productFailures = jobs.reduce((a, j) => a + j.metrics.productClaimFailures, 0);
  const tier2 = jobs.filter((j) => j.risk?.tier === 2).length;

  // stage timing averages
  const stageTotals: Record<string, { ms: number; n: number }> = {};
  jobs.forEach((j) => j.metrics.stageTimings.forEach((t) => {
    stageTotals[t.stage] = stageTotals[t.stage] ?? { ms: 0, n: 0 };
    stageTotals[t.stage].ms += t.ms;
    stageTotals[t.stage].n += 1;
  }));

  // export volume by format
  const exportVolume: Record<string, number> = {};
  jobs.forEach((j) => j.exports.forEach((e) => { exportVolume[e.format] = (exportVolume[e.format] ?? 0) + 1; }));

  return (
    <div className={embedded ? "" : "content"}>
      {!embedded && (
        <div className="page-head">
          <h1>Observability</h1>
          <p>Cost per job, time per stage, QA pass rate, revision rate, accepted/rejected QA suggestions, product claim failures, Tier 2 volume, and export volume.</p>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat k="Cost (run to date)" v={`$${cost.toFixed(2)}`} d={`~$${(cost / Math.max(jobs.length, 1)).toFixed(2)} per job`} />
        <Stat k="QA pass rate" v={`${Math.round((passed.length / Math.max(evaluated.length, 1)) * 100)}%`} d={`${passed.length}/${evaluated.length} evaluated`} />
        <Stat k="Revision attempts" v={`${revisions}`} d="across all jobs" />
        <Stat k="Tier 2 volume" v={`${tier2}`} d="held for human review" />
        <Stat k="Accepted QA fixes" v={`${accepted}`} d="reviewer-accepted suggestions" />
        <Stat k="Rejected QA fixes" v={`${rejected}`} d="reviewer-rejected suggestions" />
        <Stat k="Product claim failures" v={`${productFailures}`} d="unverified against GTM Studio" />
        <Stat k="Exports" v={`${Object.values(exportVolume).reduce((a, b) => a + b, 0)}`} d="total export actions" />
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Avg latency per stage</h3></div>
          <div className="panel-pad">
            {Object.entries(stageTotals).map(([stage, v]) => (
              <div key={stage} className="score-row" style={{ border: "none", padding: "6px 0" }}>
                <span className="nm">{stage.replace(/_/g, " ")}</span>
                <div className="score-bar" style={{ width: 140 }}>
                  <span style={{ width: `${Math.min((v.ms / v.n) / 50 * 100, 100)}%`, background: "var(--ubas)" }} />
                </div>
                <span className="score-num">{Math.round(v.ms / v.n)}ms</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Export volume by format</h3></div>
          <div className="panel-pad">
            {Object.keys(exportVolume).length === 0 && <div className="faint">No exports yet.</div>}
            {EXPORT_FORMATS.filter((f) => exportVolume[f.value]).map((f) => (
              <div key={f.value} className="score-row" style={{ border: "none", padding: "6px 0" }}>
                <span className="nm">{f.label}</span>
                <span className="score-num">{exportVolume[f.value]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="panel stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}
