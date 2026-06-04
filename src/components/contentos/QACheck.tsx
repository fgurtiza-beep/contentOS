"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { jobStore } from "@/lib/contentos/store/useStore";
import { CURRENT_USER } from "@/lib/contentos/store/uiStore";
import { gtmStudioProductService } from "@/lib/contentos/data/gtmStudioProductService";
import { CopyAssistant } from "./CopyAssistant";
import { GrammarTextEditor } from "./GrammarTextEditor";

type Method = "upload" | "paste" | "url";

export function QACheck() {
  const router = useRouter();
  const products = gtmStudioProductService.listProducts();
  const [method, setMethod] = useState<Method>("upload");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("blog");
  const [product, setProduct] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [grammarActive, setGrammarActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function ingest(file: File) {
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    const isText = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith("text");
    if (isText) {
      const reader = new FileReader();
      reader.onload = () => setText(String(reader.result ?? ""));
      reader.readAsText(file);
    } else {
      setText(`[${file.name} attached — DOCX/PDF text is extracted by a document connector in production. Paste the text below to QA it now.]`);
    }
  }

  function run() {
    let body = text;
    const source = method === "upload" ? fileName || "uploaded file" : method === "url" ? url : "pasted content";
    if (method === "url") body = text || `[Fetched page: ${url}] — URL analysis extracts the page's main content via a fetch connector in production. Paste the text to QA it now.`;
    if (!body.trim()) return;
    const id = jobStore.submitQACheck({ title: title || "QA Check", channel, text: body, product: product || undefined, source }, CURRENT_USER);
    router.push(`/contentos/jobs/${id}`);
  }

  return (
    <div className="content">
      <div className="page-head">
        <h1>QA Check</h1>
        <p>Run Sprout's 8-layer QA on any content — no content job required. Upload a file to get started; the result opens in the QA Review Workspace.</p>
      </div>

      <div className="grid grid-2">
        <div className="panel panel-pad">
          {/* Primary: upload */}
          {method === "upload" && (
            <>
              <div
                className="dropzone"
                style={{ padding: 40, ...(dragging ? { borderColor: "var(--ubas)", background: "var(--ubas-soft)" } : {}) }}
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files?.[0]; if (file) ingest(file); }}
              >
                <div style={{ fontSize: 30, marginBottom: 8 }}>⤓</div>
                {fileName ? <div><b>{fileName}</b><div className="faint tiny" style={{ marginTop: 4 }}>Click or drop to replace</div></div> : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--green-deep)" }}>Drag & drop a file, or click to browse</div>
                    <div className="faint tiny" style={{ marginTop: 6 }}>DOCX · PDF · TXT · Markdown</div>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md,.markdown,text/plain" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) ingest(file); }} />
              {text && <div style={{ marginTop: 12 }}><GrammarTextEditor value={text} onChange={setText} active={grammarActive} minHeight={130} /></div>}
            </>
          )}

          {method === "paste" && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Paste content</label>
              <GrammarTextEditor value={text} onChange={setText} active={grammarActive} minHeight={240} placeholder="Paste the content to QA. Blank line between paragraphs; short standalone lines become headings." />
            </div>
          )}

          {method === "url" && (
            <>
              <div className="field"><label>URL</label><input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sprout.ph/blog/…" /></div>
              <div className="field"><label>Extracted text <span className="hint">· paste to QA now, or the fetch connector extracts it</span></label><GrammarTextEditor value={text} onChange={setText} active={grammarActive} minHeight={150} placeholder="Paste the page content here" /></div>
            </>
          )}

          {/* Secondary options */}
          <div className="faint tiny" style={{ margin: "12px 0 6px", textAlign: "center" }}>
            {method !== "upload" && <button className="btn ghost sm" onClick={() => setMethod("upload")}>⤓ Upload a file instead</button>}
            {method !== "paste" && <button className="btn ghost sm" onClick={() => setMethod("paste")}>✎ Paste content</button>}
            {method !== "url" && <button className="btn ghost sm" onClick={() => setMethod("url")}>🔗 Analyze a URL</button>}
          </div>

          <div className="divider" />
          <div className="row">
            <div className="field"><label>Title</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this?" /></div>
            <div className="field"><label>Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="blog">Blog</option><option value="social_post">Social post</option><option value="email">Email</option><option value="landing_page">Landing page</option><option value="press_release">Press release</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Product <span className="hint">· optional · validates product claims against GTM Studio</span></label>
            <select value={product} onChange={(e) => setProduct(e.target.value)}><option value="">None</option>{products.map((p) => <option key={p.slug} value={p.slug}>{p.displayName}</option>)}</select>
          </div>

          <button className="btn primary" disabled={!text.trim() && method !== "url"} onClick={run}>Run QA →</button>
        </div>

        <div className="panel panel-pad">
          <h3 style={{ marginBottom: 10 }}>What the QA Agent checks</h3>
          <ol className="bullets" style={{ paddingLeft: 18 }}>
            <li className="muted">Strategic & Contextual Alignment</li>
            <li className="muted">Narrative Flow & Readability</li>
            <li className="muted">Brand Voice & Tone</li>
            <li className="muted">Factual & Data Accuracy</li>
            <li className="muted">Channel-Specific Optimization</li>
            <li className="muted">Tone Authenticity & AI Detection</li>
            <li className="muted">Visual & Structural Integrity</li>
            <li className="muted">Product & GTM Accuracy</li>
          </ol>
          <div className="callout" style={{ marginTop: 12 }}>
            The QA Agent grounds itself only on the content you provide. Anything it cannot verify is flagged for human review rather than fabricated. Product claims are checked against GTM Studio when a product is selected.
          </div>
        </div>
      </div>

      {/* Floating copy-improvement assistant — reads the current editor content */}
      <CopyAssistant content={text} onApply={setText} onHighlightGrammar={() => setGrammarActive(true)} />
    </div>
  );
}
