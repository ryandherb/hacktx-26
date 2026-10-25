"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/api";
import { keyNumbers, optionCards, planButton, verdict, type OptionCard } from "@/lib/advisor/results";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = {
  open: boolean;
  vehicleLabel: string; // e.g. "2012 Camry SE"
  car: string; // short model name for the headline, e.g. "Camry"
  result: Analysis | null;
  mocked: boolean;
  onBack: () => void;
  onViewPlan: () => void;
};

// "Your options" page (POST /analyze): the recommendation with the Explanation Agent's summary,
// each option with its brief and a "Why?" drop-down for the detailed explanation, the numbers
// behind the decision, and a drop-down with the full explanation. The recommended option's
// button slides on to its plan.
export default function OptionsPage({ open, vehicleLabel, car, result, mocked, onBack, onViewPlan }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [explanation, setExplanation] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => heading.current?.focus({ preventScroll: true }), 450); // after the slide
    return () => clearTimeout(t);
  }, [open]);

  if (!result) return null;
  const cards = optionCards(result);
  const numbers = keyNumbers(result);

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

      <div className={`mt-2 flex flex-wrap gap-x-6 gap-y-3 md:flex-nowrap ${explanation ? "items-start" : "items-center"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advisor/guide-placeholder.png" alt="" className="h-[60px] w-[60px] shrink-0 object-contain mix-blend-multiply" />
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="text-[17px] font-bold">Your AI guide</p>
          <p className="max-w-[720px] text-[15px] leading-snug text-neutral-700">{result.explanation}</p>
          {result.explanation_details && (
            <>
              <button onClick={() => setExplanation((v) => !v)} aria-expanded={explanation} aria-controls="full-explanation"
                className={`mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold text-black underline underline-offset-4 ${ring}`}>
                {explanation ? "Hide the full explanation" : "Read the full explanation"}
                <span aria-hidden className={`inline-block no-underline transition-transform ${explanation ? "rotate-180" : ""}`}>⌄</span>
              </button>
              <p id="full-explanation" hidden={!explanation} className="mt-1.5 max-w-[720px] text-[14px] leading-relaxed text-neutral-700">
                {result.explanation_details}
              </p>
            </>
          )}
        </div>
        <button onClick={onViewPlan}
          className={`inline-flex shrink-0 items-center justify-center gap-3 rounded-full bg-[#EB0A1E] px-9 py-3.5 text-[17px] font-bold text-white shadow-[0_10px_28px_rgba(235,10,30,0.28)] hover:bg-[#c8091a] max-md:w-full ${ring}`}>
          {planButton(result.recommendation)} <span aria-hidden>→</span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-3">
        {cards.map((c) => <Card key={c.key} card={c} />)}
      </div>

      <section aria-labelledby="behind-title" className="mt-3">
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

      <p className="mt-auto border-t border-neutral-200 pt-2.5 text-right text-xs text-neutral-500 max-md:mt-4 max-md:text-left">
        Estimates, not financial advice.{mocked && " Demo profile: preset results."}
      </p>

    </div>
  );
}

function Card({ card }: { card: OptionCard }) {
  const best = card.status === "best";
  const [open, setOpen] = useState(false);
  const id = `why-${card.key}`;
  return (
    <div className={`flex h-full flex-col rounded-2xl border px-5 py-4 ${best ? "border-2 border-[#EB0A1E] bg-white shadow-[0_12px_32px_rgba(235,10,30,0.10)]" : "border-neutral-200 bg-neutral-50"}`}>
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
      <p className="mt-1.5 text-[14px] leading-snug text-neutral-800">{card.brief}</p>
      {card.details && (
        <div className="mt-auto border-t border-neutral-200 pt-1.5">
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
            className={`mt-1 inline-flex items-center gap-1.5 text-[15px] font-bold ${ring}`}>
            Why? <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
          </button>
          <p id={id} hidden={!open} className="mt-1 text-[13px] leading-relaxed text-neutral-700">{card.details}</p>
        </div>
      )}
    </div>
  );
}
