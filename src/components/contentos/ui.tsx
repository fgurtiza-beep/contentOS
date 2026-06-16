"use client";

import { useEffect, useRef, useState } from "react";

export interface MSOption {
  value: string;
  label: string;
}

/**
 * Lightweight multi-select dropdown. Shows selected values as chips on a
 * trigger button; opens a checklist panel. Used for Tone and Product(s).
 * Options render in the order given, so callers can place "None" last.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  exclusiveValue,
}: {
  options: MSOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** A value (e.g. "None") that clears all others when chosen, and is cleared by any other choice. */
  exclusiveValue?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (value: string) => {
    if (exclusiveValue && value === exclusiveValue) {
      onChange(selected.includes(value) ? [] : [value]);
      return;
    }
    let next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    if (exclusiveValue) next = next.filter((v) => v !== exclusiveValue);
    onChange(next);
  };

  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="ms" ref={ref}>
      <button type="button" className={`ms-trigger ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="ms-tags">
          {selected.length === 0 ? (
            <span className="ms-ph">{placeholder}</span>
          ) : (
            selected.map((v) => <span key={v} className="ms-tag">{labelFor(v)}</span>)
          )}
        </span>
        <span className="ms-chev">▾</span>
      </button>
      {open && (
        <div className="ms-panel">
          {options.map((o) => (
            <label key={o.value} className="ms-opt">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="stepper-ctl">
      <button type="button" aria-label="decrease" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>–</button>
      <span className="val">{value}</span>
      <button type="button" aria-label="increase" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

export function AccordionSection({
  num,
  title,
  required,
  hint,
  defaultOpen = false,
  children,
}: {
  num: number;
  title: string;
  required?: boolean;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="acc">
      <div
        className={`acc-head ${open ? "open" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
      >
        <span className="num">{num}</span>
        <span className="tt">{title}</span>
        {required ? <span className="req">Required</span> : <span className="opt">Optional</span>}
        {hint && <span className="opt">· {hint}</span>}
        <span className="chev">›</span>
      </div>
      {open && <div className="acc-body">{children}</div>}
    </div>
  );
}
