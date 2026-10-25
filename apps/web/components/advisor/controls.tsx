"use client";

import { ring } from "./AdvisorPanel";

// Toyota estimator-style segmented control (gray boxes, dark active segment).
export function Segmented({ label, options, value, onChange }: { label: string; options: string[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-lg border border-neutral-300">
      {options.map((o, i) => {
        const on = o === value;
        return (
          <button key={o} role="radio" aria-checked={on} onClick={() => onChange(o)}
            className={`flex-1 px-3 py-3 text-[15px] font-semibold ${i ? "border-l border-neutral-300" : ""} ${on ? "bg-neutral-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"} ${ring}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function TogglePill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button aria-pressed={on} onClick={onClick}
      className={`rounded-full border-2 px-6 py-3 text-[16px] font-bold ${on ? "border-black bg-black text-white" : "border-neutral-300 bg-white hover:border-black"} ${ring}`}>
      {on && <span aria-hidden className="mr-1.5">✓</span>}{label}
    </button>
  );
}

// `label` is the visible caption; when a layout hides it (label=""), pass `ariaLabel` so the
// field still has a name for screen readers.
export function MoneyInput({ label, ariaLabel, value, onChange, suffix }: { label: string; ariaLabel?: string; value: number | null; onChange: (v: number | null) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-[15px] font-bold">{label}</span>
      <span className="mt-2 flex items-center rounded-lg border border-neutral-300 px-4 focus-within:border-neutral-800 focus-within:ring-1 focus-within:ring-neutral-800">
        <span className="text-lg text-neutral-500">$</span>
        <input inputMode="numeric" value={value ?? ""} placeholder="0" aria-label={label ? undefined : ariaLabel}
          onChange={(e) => { const n = e.target.value.replace(/[^\d]/g, ""); onChange(n ? Number(n) : null); }}
          className="w-full min-w-0 bg-transparent px-2 py-3.5 text-lg outline-none" />
        {suffix && <span className="whitespace-nowrap text-neutral-500">{suffix}</span>}
      </span>
    </label>
  );
}

// Compact "Insert demo answer" link for the pinned footer bar.
export function DemoInsert({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex min-h-11 items-center gap-1.5 text-[15px] text-neutral-800 hover:text-[#EB0A1E] disabled:opacity-40 ${ring}`}>
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Demo</span>
      <span className="underline underline-offset-4">{label}</span>
    </button>
  );
}

// Body scrolls only if it must; the footer bar stays pinned at the bottom of the panel.
export function StepLayout({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">{children}</div>
      {footer}
    </div>
  );
}
