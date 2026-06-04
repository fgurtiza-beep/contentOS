"use client";

import { useState } from "react";

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
