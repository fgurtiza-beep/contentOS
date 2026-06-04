"use client";

import type { FactualClaim, ProductClaim, SourceMapEntry } from "@/lib/contentos/schemas/contentos";

export function ClaimsPanel({
  productClaims,
  factualClaims,
  sourceMap,
}: {
  productClaims: ProductClaim[];
  factualClaims: FactualClaim[];
  sourceMap: SourceMapEntry[];
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Claims & provenance</h3>
        <span className="sub">product claims must trace to GTM Studio</span>
      </div>
      <div className="panel-pad">
        <div className="field">
          <label>Product claims</label>
          {productClaims.length === 0 && <div className="faint tiny">No product claims in this asset.</div>}
          {productClaims.map((c) => (
            <div key={c.id} className={`callout ${c.status === "verified" ? "" : "danger"}`} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`state ${c.status === "verified" ? "go" : "stop"}`}>{c.status === "verified" ? "Verified" : "UNVERIFIED"}</span>
                <span className="tiny">{c.text || "(claim text omitted)"}</span>
              </div>
              {c.status === "verified" ? (
                <div className="meta-line">
                  <span><b>Source:</b> {c.gtmSourceDocument}</span>
                  <span><b>Product:</b> {c.productId}</span>
                  <span><b>Feature:</b> {c.featureId}</span>
                  <span><b>Section:</b> {c.sourceSection}</span>
                  <span><b>Version:</b> {c.retrievedVersion}</span>
                </div>
              ) : (
                <div className="tiny" style={{ marginTop: 4 }}>{c.note}</div>
              )}
            </div>
          ))}
        </div>

        {factualClaims.length > 0 && (
          <div className="field">
            <label>Factual / data claims</label>
            {factualClaims.map((c) => (
              <div key={c.id} className={`callout ${c.status === "verified" ? "" : "warn"}`} style={{ marginBottom: 8 }}>
                <div className="tiny">{c.text}</div>
                <div className="meta-line">
                  {c.sourceName && <span><b>Dataset:</b> {c.sourceName}</span>}
                  {c.dateRange && <span><b>Range:</b> {c.dateRange}</span>}
                  {c.sampleSize != null && <span><b>n=</b>{c.sampleSize}</span>}
                  {c.note && <span>{c.note}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Source map</label>
          {sourceMap.map((s, i) => (
            <div key={i} className="tiny muted" style={{ marginBottom: 2 }}>
              <span className="state flow" style={{ marginRight: 6 }}>{s.type.replace("_", " ")}</span>
              {s.anchorText || s.ref} <span className="faint mono">{s.ref}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
