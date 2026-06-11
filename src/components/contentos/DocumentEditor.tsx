"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { QASuggestion } from "@/lib/contentos/schemas/contentos";
import { jobStore } from "@/lib/contentos/store/useStore";
import { blocksToHtml, jsonToBlocks, type SimpleBlock } from "@/lib/contentos/editor/markdownBlocks";
import { SuggestionCard } from "./SuggestionCard";

type SaveState = "saved" | "unsaved" | "saving";
export interface DocEditorHandle { accept: (s: QASuggestion, replacement?: string) => void; dismiss: (s: QASuggestion) => void; activate: (s: QASuggestion) => void; }

/* ---- find a text range in the PM doc (single text-node match) ---- */
function findRange(doc: PMNode, query: string): { from: number; to: number } | null {
  const needle = (query || "").trim();
  if (needle.length < 3) return null;
  let hit: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (hit || !node.isText || !node.text) return;
    const idx = node.text.indexOf(needle);
    if (idx >= 0) { hit = { from: pos + idx, to: pos + idx + needle.length }; return false; }
  });
  return hit;
}

/* ---- inline QA highlight decorations ---- */
const qaKey = new PluginKey("qaHighlight");
const QaHighlight = Extension.create<{ getSuggestions: () => QASuggestion[]; getFlash: () => { from: number; to: number } | null; getActive: () => string | null }>({
  name: "qaHighlight",
  addOptions() { return { getSuggestions: () => [], getFlash: () => null, getActive: () => null }; },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: qaKey,
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            const active = options.getActive();
            for (const s of options.getSuggestions()) {
              const r = findRange(state.doc, s.currentText);
              if (r) decos.push(Decoration.inline(r.from, r.to, { class: `qa-mark sev-${s.severity}${s.id === active ? " active" : ""}`, "data-qa": s.id }));
            }
            const flash = options.getFlash();
            if (flash) decos.push(Decoration.inline(flash.from, flash.to, { class: "qa-applied" }));
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

export const DocumentEditor = forwardRef<DocEditorHandle, {
  jobId: string;
  body: SimpleBlock[];
  suggestions: QASuggestion[];
  activeId: string | null;
  disabled: boolean;
  onSaveState: (s: SaveState) => void;
  onToast: (msg: string) => void;
  onActivate: (id: string | null, clientY?: number) => void;
  draftId?: string;
}>(function DocumentEditor({ jobId, body, suggestions, activeId, disabled, onSaveState, onToast, onActivate, draftId }, ref) {
  const initialHtml = useMemo(() => blocksToHtml(body), [body]);
  const sugRef = useRef<QASuggestion[]>(suggestions);
  const activeRef = useRef<string | null>(activeId);
  const flashRef = useRef<{ from: number; to: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Only REWRITE suggestions (real before→after) highlight inline. Advisory items
  // are guidance with no exact text span, so they live in the side checklist.
  sugRef.current = suggestions.filter((s) => s.decision === "pending" && !s.advisory);
  activeRef.current = activeId;

  const [linkPop, setLinkPop] = useState<{ href: string; top: number; left: number } | null>(null);
  const [card, setCard] = useState<{ id: string; top: number; left: number } | null>(null);

  // Position the inline popover under a given viewport rect, relative to the canvas.
  const placeCard = (id: string, rectTop: number, rectBottom: number, rectLeft: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const top = rectBottom - box.top + 8;
    const left = Math.max(8, Math.min(rectLeft - box.left, box.width - 320));
    setCard({ id, top, left });
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, HTMLAttributes: { class: "doc-link" } } }),
      Highlight,
      TableKit.configure({ table: { resizable: true } }),
      QaHighlight.configure({ getSuggestions: () => sugRef.current, getFlash: () => flashRef.current, getActive: () => activeRef.current }),
    ],
    content: initialHtml,
    onUpdate: ({ editor }) => {
      onSaveState("unsaved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onSaveState("saving");
        const blocks = jsonToBlocks(editor.getJSON() as unknown as Parameters<typeof jsonToBlocks>[0]);
        jobStore.replaceDraftBlocks(jobId, blocks as { kind: SimpleBlock["kind"]; text: string }[], undefined, draftId);
        onSaveState("saved");
      }, 700);
    },
  });

  // Recompute decorations when suggestions or the active selection change.
  useEffect(() => { if (editor) editor.view.dispatch(editor.state.tr); }, [editor, suggestions, activeId]);

  const flash = (range: { from: number; to: number }) => {
    flashRef.current = range; if (editor) editor.view.dispatch(editor.state.tr);
    setTimeout(() => { flashRef.current = null; if (editor) editor.view.dispatch(editor.state.tr); }, 800);
  };

  const accept = (s: QASuggestion, replacement?: string) => {
    if (!editor) return;
    const text = replacement ?? s.suggestedReplacement;
    const r = findRange(editor.state.doc, s.currentText);
    if (r) {
      editor.chain().focus().insertContentAt({ from: r.from, to: r.to }, text).run();
      flash({ from: r.from, to: r.from + text.length });
    }
    jobStore.decideSuggestion(jobId, s.id, replacement ? "edited" : "accepted", replacement);
    setCard(null); onActivate(null);
    onToast("✓ Suggestion applied");
  };
  const dismiss = (s: QASuggestion) => { jobStore.decideSuggestion(jobId, s.id, "rejected"); setCard(null); onActivate(null); onToast("Suggestion dismissed"); };
  const activate = (s: QASuggestion) => {
    if (!editor) return;
    const r = findRange(editor.state.doc, s.currentText);
    if (r) {
      editor.chain().setTextSelection(r.from).scrollIntoView().run();
      const c = editor.view.coordsAtPos(r.from);
      onActivate(s.id);
      // After scroll settles, anchor the popover under the highlighted text.
      requestAnimationFrame(() => { const c2 = editor.view.coordsAtPos(r.from); placeCard(s.id, c2.top, c2.bottom, c2.left); });
    } else onActivate(s.id);
  };
  useImperativeHandle(ref, () => ({ accept, dismiss, activate }));

  if (!editor) return <div className="doc-loading">Loading editor…</div>;

  const onEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest("a.doc-link") as HTMLAnchorElement | null;
    const mark = target.closest(".qa-mark") as HTMLElement | null;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (link) {
      const r = link.getBoundingClientRect();
      setLinkPop({ href: link.getAttribute("href") || "", top: r.bottom - box.top + 6, left: r.left - box.left });
      onActivate(null); setCard(null);
      return;
    }
    if (mark) {
      const id = mark.getAttribute("data-qa");
      const r = mark.getBoundingClientRect();
      if (id) { onActivate(id); placeCard(id, r.top, r.bottom, r.left); }
      setLinkPop(null);
      return;
    }
    onActivate(null); setLinkPop(null); setCard(null);
  };

  return (
    <div className="doc-editor">
      {!disabled && <Toolbar editor={editor} onAddLink={() => addLink(editor)} />}
      <div className="doc-canvas-wrap" ref={wrapRef} onClick={onEditorClick}>
        <EditorContent editor={editor} className="doc-canvas" />
        {linkPop && (
          <div className="link-pop" style={{ top: linkPop.top, left: linkPop.left }} onClick={(e) => e.stopPropagation()}>
            <a href={linkPop.href} target="_blank" rel="noreferrer" className="link-pop-url">{linkPop.href}</a>
            <div className="link-pop-actions">
              <button onClick={() => { addLink(editor); setLinkPop(null); }}>Edit</button>
              <button onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkPop(null); }}>Remove</button>
              <button onClick={() => { window.open(linkPop.href, "_blank"); setLinkPop(null); }}>Open ↗</button>
            </div>
          </div>
        )}

        {card && (() => {
          const s = suggestions.find((x) => x.id === card.id && x.decision === "pending");
          if (!s) return null;
          return (
            <div className="qa-inline-pop" style={{ top: card.top, left: card.left }} onClick={(e) => e.stopPropagation()}>
              <SuggestionCard s={s} onAccept={(t) => accept(s, t)} onDismiss={() => dismiss(s)} onClose={() => { setCard(null); onActivate(null); }} />
            </div>
          );
        })()}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Toolbar                                                            */
/* ------------------------------------------------------------------ */

function addLink(editor: ReturnType<typeof useEditor>) {
  if (!editor) return;
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", prev || "https://sprout.ph/");
  if (url === null) return;
  if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function Toolbar({ editor, onAddLink }: { editor: NonNullable<ReturnType<typeof useEditor>>; onAddLink: () => void }) {
  const B = ({ on, dis, title, run, children }: { on?: boolean; dis?: boolean; title: string; run: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} className={`tb-btn ${on ? "on" : ""}`} disabled={dis} onMouseDown={(e) => e.preventDefault()} onClick={run}>{children}</button>
  );
  return (
    <div className="doc-toolbar">
      <B title="Bold" on={editor.isActive("bold")} run={() => editor.chain().focus().toggleBold().run()}><b>B</b></B>
      <B title="Italic" on={editor.isActive("italic")} run={() => editor.chain().focus().toggleItalic().run()}><i>I</i></B>
      <B title="Underline" on={editor.isActive("underline")} run={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></B>
      <B title="Highlight" on={editor.isActive("highlight")} run={() => editor.chain().focus().toggleHighlight().run()}><span className="tb-hl">H</span></B>
      <span className="tb-sep" />
      <B title="Heading 2" on={editor.isActive("heading", { level: 2 })} run={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</B>
      <B title="Heading 3" on={editor.isActive("heading", { level: 3 })} run={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</B>
      <span className="tb-sep" />
      <B title="Bulleted list" on={editor.isActive("bulletList")} run={() => editor.chain().focus().toggleBulletList().run()}>• List</B>
      <B title="Numbered list" on={editor.isActive("orderedList")} run={() => editor.chain().focus().toggleOrderedList().run()}>1. List</B>
      <B title="Link" on={editor.isActive("link")} run={onAddLink}>🔗 Link</B>
      <B title="Insert table" run={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦ Table</B>
      <span className="tb-sep" />
      <B title="Undo" dis={!editor.can().undo()} run={() => editor.chain().focus().undo().run()}>↶</B>
      <B title="Redo" dis={!editor.can().redo()} run={() => editor.chain().focus().redo().run()}>↷</B>
    </div>
  );
}
