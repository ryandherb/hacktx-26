"use client";

import { useEffect, useRef } from "react";

export const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";

export const ADVISOR_STEPS = ["Your car", "Your situation", "Your options"] as const;

// step 0 = intro screen (no stepper); 1–3 = the assessment steps.
type Props = { step: number; onMinimize: () => void; onClose: () => void; children: React.ReactNode };

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mx-auto flex max-w-[560px] items-start" aria-label="Progress">
      {ADVISOR_STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex flex-1 items-start last:flex-none" aria-current={active ? "step" : undefined}>
            <div className="flex w-[84px] flex-col items-center sm:w-24 xl:w-28">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold text-white ${active || done ? "bg-[#EB0A1E]" : "bg-neutral-500"}`}>
                {done ? "✓" : n}
              </span>
              <span className={`mt-1.5 text-center text-[13px] sm:text-[14px] ${active ? "font-bold text-black" : "text-neutral-600"}`}>{label}</span>
            </div>
            {n < ADVISOR_STEPS.length && <span aria-hidden className={`mt-4 h-px flex-1 ${done ? "bg-[#EB0A1E]" : "bg-neutral-300"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

// Right-hand side panel for the advisor flow (non-modal: the car stays visible on the left).
// Esc minimizes it; nothing is ever discarded by closing.
export default function AdvisorPanel({ step, onMinimize, onClose, children }: Props) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = panel.current;
    (el?.querySelector<HTMLElement>("textarea") ?? el?.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
  }, [step]);

  return (
    <section ref={panel} aria-label="Lifecycle Advisor" className="flex h-full min-h-0 flex-col"
      onKeyDown={(e) => { if (e.key === "Escape") onMinimize(); }}>
      <div className="flex items-start justify-between">
        <p className={`text-[13px] font-bold uppercase tracking-[0.16em] text-neutral-800 ${step ? "" : "invisible"}`}>Lifecycle Advisor</p>
        <div className="-mr-3 -mt-2 flex">
          <button onClick={onMinimize} aria-label="Minimize" title="Minimize" className={`flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 ${ring}`}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
          <button onClick={onClose} aria-label="Close" title="Close (your answers are kept)" className={`flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 ${ring}`}>
            <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" aria-hidden><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
      {step > 0 && <div className="mt-2"><Stepper step={step} /></div>}
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${step ? "mt-4" : ""}`}>{children}</div>
    </section>
  );
}
