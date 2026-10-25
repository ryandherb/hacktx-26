"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/api";
import type { CostQuoteResult, ManualQuote } from "@/lib/advisor/service";
import { keyNumbers, optionCards, planButton, verdict, type OptionCard, type RepairInput } from "@/lib/advisor/results";
import SideDrawer from "@/components/dashboard/SideDrawer";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = {
  open: boolean;
  vehicleLabel: string;
  car: string; // short model name for copy, e.g. "Camry"
  result: Analysis | null;
  mocked: boolean;
  quote: CostQuoteResult | null;
  manualQuote: ManualQuote | null;
  onBack: () => void;
  onViewPlan: () => void;
};

// The repair cost the customer confirmed: their shop quote, else the Cost Agent range.
// Matches what getAnalysis() sent to /analyze.
function repairInput(quote: CostQuoteResult | null, manualQuote: ManualQuote | null, a: Analysis): RepairInput {
  const label = quote?.repair?.label ?? quote?.classification.label ?? "Repair";
  if (manualQuote) return { low: manualQuote.amount, high: manualQuote.amount, label, isQuote: true, shop: manualQuote.shop };
  if (quote?.repair) {
    const r = quote.repair;
    return { low: r.repair_cost_low, high: r.repair_cost_high, label, isQuote: r.source === "manual", shop: r.shop };
  }
  // No quote on record (e.g. a restored session): the engine's repair_ratio still reflects what it used.
  const value = (a.market.current_vehicle_value_low + a.market.current_vehicle_value_high) / 2;
  const cost = Math.round(a.result.repair_ratio * value);
  return { low: cost, high: cost, label, isQuote: false };
}

// "Your options" overview: the recommendation, all three options with a "Why?" dropdown each,
// and the numbers behind the decision. The recommended option's button slides to its plan.
export default function OptionsPage({ open, vehicleLabel, car, result, mocked, quote, manualQuote, onBack, onViewPlan }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [explanation, setExplanation] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => heading.current?.focus({ preventScroll: true }), 450); // after the slide
    return () => clearTimeout(t);
  }, [open]);

  if (!result) return null;
  const repair = repairInput(quote, manualQuote, result);
  const cards = optionCards(result, car, repair);
  const numbers = keyNumbers(result, repair);

  return (
    <div className="mx-auto flex h-full max-w-[1240px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <button onClick={onBack} className={`inline-flex items-center gap-2 rounded-full border-2 border-black px-5 py-2 font-bold hover:bg-neutral-50 ${ring}`}>
          <span aria-hidden>←</span> Back to my car
        </button>
        <p className="text-[15px] font-semibold text-neutral-600">{vehicleLabel}</p>
      </div>

      <p className="mt-2 text-[15px] font-semibold text-neutral-500">Your options</p>
      <h1 ref={heading} tabIndex={-1} className="text-[clamp(32px,3.2vw,42px)] font-extrabold leading-[1.05] tracking-tight outline-none">
        {verdict(result.recommendation, car)}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 md:flex-nowrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advisor/guide-placeholder.png" alt="" className="h-[60px] w-[60px] shrink-0 object-contain mix-blend-multiply" />
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="text-[17px] font-bold">Your AI guide</p>
          <p className="max-w-[720px] text-[15px] leading-snug text-neutral-700">{result.explanation}</p>
        </div>
        <button onClick={onViewPlan}
          className={`inline-flex shrink-0 items-center justify-center gap-3 rounded-full max-md:w-full bg-[#EB0A1E] px-9 py-3.5 text-[17px] font-bold text-white shadow-[0_10px_28px_rgba(235,10,30,0.28)] hover:bg-[#c8091a] ${ring}`}>
          {planButton(result.recommendation)} <span aria-hidden>→</span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => <Card key={c.key} card={c} />)}
      </div>

      <section aria-labelledby="behind-title" className="mt-2.5">
        <h2 id="behind-title" className="text-[15px] font-bold">Behind the decision</h2>
        <dl className="mt-1 grid grid-cols-2 gap-y-3 md:grid-cols-4 md:divide-x md:divide-neutral-200">
          {numbers.map((n) => (
            <div key={n.label} className="flex flex-col-reverse pr-4 md:px-5 md:first:pl-0">
              <dt className={`text-[13px] ${n.warn ? "font-semibold text-[#c8091a]" : "text-neutral-500"}`}>{n.label}</dt>
              <dd className={`text-[24px] font-extrabold leading-tight tracking-tight ${n.warn ? "text-[#c8091a]" : ""}`}>{n.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-neutral-200 pt-2.5 max-md:mt-4">
        <button onClick={() => setExplanation(true)} className={`inline-flex items-center gap-1.5 text-[14px] font-semibold underline underline-offset-4 ${ring}`}>
          Read the full explanation <span aria-hidden>›</span>
        </button>
        <p className="text-xs text-neutral-500">
          Estimates, not financial advice.{mocked && " Demo data: recorded results, backend not connected."}
        </p>
      </div>

      <SideDrawer open={explanation} onClose={() => setExplanation(false)} title="The full explanation" closeLabel="Close explanation">
        <div className="mt-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/advisor/guide-placeholder.png" alt="" className="h-10 w-10 object-contain mix-blend-multiply" />
          <p className="text-sm font-bold">From your AI guide</p>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-800">{result.explanation_details}</p>
      </SideDrawer>
    </div>
  );
}

function Card({ card }: { card: OptionCard }) {
  const best = card.status === "best";
  const [open, setOpen] = useState(best);
  const id = `why-${card.key}`;
  return (
    <div className={`flex flex-col rounded-2xl border px-5 py-4 ${best ? "border-2 border-[#EB0A1E] bg-white shadow-[0_12px_32px_rgba(235,10,30,0.10)]" : "border-neutral-200 bg-neutral-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[21px] font-extrabold">{card.title}</h3>
        {best && <span className="rounded-md bg-[#EB0A1E] px-2.5 py-1 text-[13px] font-bold text-white">Best fit</span>}
        {card.status === "over_budget" && <span className="rounded-md bg-neutral-200 px-2.5 py-1 text-[13px] font-bold text-neutral-700">Over your budget</span>}
      </div>
      {card.monthly != null ? (
        <p className="mt-1 leading-none">
          <span className="text-[38px] font-extrabold tracking-tight">{money(card.monthly)}</span>
          <span className="text-xl text-neutral-600"> /mo</span>
          <span className="ml-2 text-[13px] text-neutral-500">estimated total</span>
        </p>
      ) : (
        <p className="mt-1 text-[34px] font-extrabold leading-none tracking-tight text-neutral-500">Not available</p>
      )}
      <p className="mt-1.5 text-[14px] leading-snug text-neutral-800">{card.why}</p>
      {card.facts.length > 0 && (
        <div className="mt-auto border-t border-neutral-200 pt-1.5">
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
            className={`inline-flex items-center gap-1.5 text-[15px] font-bold ${ring}`}>
            Why? <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
          </button>
          <ul id={id} hidden={!open} className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-neutral-700">
            {card.facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
