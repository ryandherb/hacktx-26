"use client";

import { useEffect, useRef } from "react";
import { OPTION_LABELS, type OptionId, type OptionsResult } from "@/lib/advisor/service";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = { open: boolean; vehicleLabel: string; result: OptionsResult | null; mocked: boolean; onBack: () => void };

// Full-width "Your options" page that slides in from the right of the dashboard.
// PLACEHOLDER content (sample results) until the scoring and explanation endpoints exist.
export default function OptionsPage({ open, vehicleLabel, result, mocked, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => heading.current?.focus({ preventScroll: true }), 450); // after the slide
    return () => clearTimeout(t);
  }, [open]);

  if (!result) return null;
  const ranked = (Object.keys(result.scores) as OptionId[]).sort((x, y) => result.scores[y] - result.scores[x]);
  const top = ranked[0];
  const v = result.recommended_vehicle;

  return (
    <div className="mx-auto flex h-full max-w-[1200px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <button onClick={onBack} className={`inline-flex items-center gap-2 rounded-full border-2 border-black px-6 py-2.5 font-bold hover:bg-neutral-50 ${ring}`}>
          <span aria-hidden>←</span> Back to my car
        </button>
        <p className="text-sm text-neutral-500">{vehicleLabel}</p>
      </div>

      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-neutral-500">Your options</p>
      <h1 ref={heading} tabIndex={-1} className="text-[clamp(32px,3.2vw,44px)] font-extrabold leading-tight tracking-tight outline-none">
        Your best move: {OPTION_LABELS[top][0]}
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
        {ranked.map((id) => {
          const best = id === top;
          return (
            <div key={id} className={`rounded-2xl border-2 p-5 sm:p-6 ${best ? "border-[#EB0A1E] shadow-[0_12px_32px_rgba(235,10,30,0.12)]" : "border-neutral-200"}`}>
              <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${best ? "text-[#EB0A1E]" : "text-transparent"}`}>Best fit</p>
              <p className="text-[clamp(36px,3.8vw,52px)] font-extrabold leading-none tracking-tight">{result.scores[id]}<span className="text-2xl">%</span></p>
              <p className="mt-2 text-xl font-extrabold">{OPTION_LABELS[id][0]}</p>
              <p className="text-[15px] text-neutral-600">{OPTION_LABELS[id][1]}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
                <div className={`h-full rounded-full ${best ? "bg-[#EB0A1E]" : "bg-neutral-500"}`} style={{ width: `${result.scores[id]}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr] md:gap-5">
        <div className="flex gap-4 rounded-2xl bg-neutral-100 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/advisor/guide-placeholder.png" alt="" className="h-12 w-12 shrink-0 object-contain mix-blend-multiply" />
          <p className="text-[16px] leading-relaxed">{result.explanation}</p>
        </div>
        {v && (
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">Toyota to consider · {v.kind}</p>
            <p className="mt-1 text-lg font-extrabold">{v.name}</p>
            <p className="mt-2 text-3xl font-extrabold">{money(v.monthly_estimate)}<span className="text-base font-semibold">/mo est.</span></p>
            <p className="text-sm text-neutral-600">{money(v.price)} price</p>
          </div>
        )}
      </div>

      <p className="mt-auto pt-4 text-xs text-neutral-500">
        Estimates only, not financial advice.{mocked && " Demo results: scoring and explanation services aren't connected yet."} More detail coming to this page.
      </p>
    </div>
  );
}
