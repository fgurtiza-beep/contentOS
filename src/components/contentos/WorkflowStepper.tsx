"use client";

import type { JobState } from "@/lib/contentos/schemas/contentos";

const FLOW: { state: JobState; label: string }[] = [
  { state: "BRIEFED", label: "Briefed" },
  { state: "NARRATIVE_READY", label: "Narrative" },
  { state: "BLUEPRINT_READY", label: "Blueprint" },
  { state: "DRAFTED", label: "Draft" },
  { state: "QA_REVIEW_READY", label: "QA review" },
  { state: "CHANGES_APPLIED", label: "Changes" },
  { state: "QA_PASSED", label: "QA passed" },
  { state: "EXPORTED", label: "Export" },
];

// Approximate ordering used only to color the stepper.
const ORDER: JobState[] = [
  "INTAKE", "BRIEFED", "PIM_READY", "NARRATIVE_READY", "BLUEPRINT_READY", "DRAFTED",
  "QA_RUNNING", "QA_REVIEW_READY", "CHANGES_PENDING", "CHANGES_APPLIED", "FINAL_QA_RUNNING",
  "QA_PASSED", "APPROVED", "SHIPPED", "EXPORTED",
];

export function WorkflowStepper({ state }: { state: JobState }) {
  const isSideTrack = state === "HELD" || state === "HUMAN_REVIEW" || state === "QA_REVISION" || state === "KILLED";
  const currentIdx = ORDER.indexOf(state);

  return (
    <div>
      <div className="stepper">
        {FLOW.map((s, i) => {
          const idx = ORDER.indexOf(s.state);
          const done = currentIdx > idx && currentIdx >= 0;
          const current = state === s.state;
          return (
            <div key={s.state} className={`step ${current ? "current" : done ? "done" : ""}`}>
              <span className="n">{done ? "✓" : i + 1}</span>
              {s.label}
            </div>
          );
        })}
      </div>
      {isSideTrack && (
        <div className={`callout ${state === "KILLED" || state === "HELD" ? "danger" : "warn"}`} style={{ marginTop: 10 }}>
          {state === "HUMAN_REVIEW" && "Routed off the happy path to the Human Review Queue."}
          {state === "HELD" && "Held — blocked before reaching the queue."}
          {state === "QA_REVISION" && "QA returned a revision; apply changes and resubmit."}
          {state === "KILLED" && "This job was killed by a reviewer."}
        </div>
      )}
    </div>
  );
}
