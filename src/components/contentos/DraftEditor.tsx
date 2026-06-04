"use client";

import type { Draft, Derivative } from "@/lib/contentos/schemas/contentos";

export function DraftView({ draft, derivatives }: { draft: Draft | null; derivatives?: Derivative[] }) {
  if (derivatives && derivatives.length > 0) {
    return (
      <div className="grid grid-2">
        {derivatives.map((d) => (
          <div key={d.id} className="panel">
            <div className="panel-head">
              <h3>{d.channel} · {d.format}</h3>
              <span className="sub">{d.intent}</span>
            </div>
            <div className="panel-pad">
              <Blocks draft={d} />
              <div className="faint tiny" style={{ marginTop: 8 }}>derived from source asset {d.derivedFromSourceAssetId}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!draft) return <div className="empty">No draft yet.</div>;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{draft.title}</h3>
        <span className="sub">{draft.channel} · {draft.versions.length} version(s)</span>
      </div>
      <div className="panel-pad"><Blocks draft={draft} /></div>
    </div>
  );
}

function Blocks({ draft }: { draft: Draft }) {
  return (
    <div>
      {draft.blocks.map((b) => {
        if (b.kind === "h1") return <h2 key={b.id} style={{ marginBottom: 8 }}>{b.text}</h2>;
        if (b.kind === "h2" || b.kind === "h3") return <h4 key={b.id} style={{ margin: "10px 0 4px" }}>{b.text}</h4>;
        if (b.kind === "meta") return <div key={b.id} className="faint tiny mono" style={{ marginBottom: 8 }}>{b.text}</div>;
        if (b.kind === "cta") return <p key={b.id}><span className="state flow">CTA → {b.text}</span></p>;
        return <p key={b.id} className="muted" style={{ margin: "6px 0" }}>{b.text}</p>;
      })}
    </div>
  );
}
