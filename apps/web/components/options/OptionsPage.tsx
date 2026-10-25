"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Analysis } from "@/lib/api";
import { OPTION_LABELS, type OptionId } from "@/lib/advisor/service";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const KIND_LABEL: Record<string, string> = { new: "New", cpo: "Certified pre-owned", used: "Used" };

type Props = { open: boolean; vehicleLabel: string; result: Analysis | null; mocked: boolean; onBack: () => void };

// Full-width "Your options" page that slides in from the right of the dashboard.
// Shows POST /analyze: monthly cost per option, the Explanation Agent's summary (with the
// detailed version in a drop-down), and the best-fit Toyota from the KRT engine.
export default function OptionsPage({ open, vehicleLabel, result, mocked, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => heading.current?.focus({ preventScroll: true }), 450); // after the slide
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => setShowDetails(false), [result]);

  if (!result) return null;
  const k = result.result;
  const top = result.recommendation;
  const hasLoan = k.refinanceResult !== k.keepResult; // equal when there's no loan to refinance
  const cost: Record<OptionId, number> = { keep: k.keepResult, trade: k.tradeResult, refinance: k.refinanceResult };
  const note: Record<OptionId, string | null> = {
    keep: null,
    trade: k.trade_affordable ? null : "Over your comfortable payment",
    refinance: hasLoan ? null : "No car loan to refinance",
  };
  const ranked = (["keep", "trade", "refinance"] as OptionId[]).sort((x, y) => (x === top ? -1 : y === top ? 1 : 0));
  const pick = k.suggested_models[0];

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
          const unavailable = id === "refinance" && !hasLoan;
          return (
            <div key={id} className={`rounded-2xl border-2 p-5 sm:p-6 ${best ? "border-[#EB0A1E] shadow-[0_12px_32px_rgba(235,10,30,0.12)]" : "border-neutral-200"}`}>
              <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${best ? "text-[#EB0A1E]" : "text-transparent"}`}>Best fit</p>
              <p className="text-[clamp(32px,3.4vw,46px)] font-extrabold leading-none tracking-tight">
                {unavailable ? "—" : money(cost[id])}{!unavailable && <span className="text-xl">/mo</span>}
              </p>
              <p className="mt-2 text-xl font-extrabold">{OPTION_LABELS[id][0]}</p>
              <p className="text-[15px] text-neutral-600">{OPTION_LABELS[id][1]}</p>
              {note[id] && <p className="mt-2 text-sm font-semibold text-neutral-500">{note[id]}</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-neutral-500">Estimated all-in monthly cost of each option. Lower is better.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr] md:gap-5">
        <div className="flex gap-4 rounded-2xl bg-neutral-100 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/advisor/guide-placeholder.png" alt="" className="h-12 w-12 shrink-0 object-contain mix-blend-multiply" />
          <div>
            <p className="text-[16px] leading-relaxed">{result.explanation}</p>
            {result.explanation_details && (
              <>
                <button onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails} aria-controls={detailsId}
                  className={`mt-3 inline-flex min-h-11 items-center gap-2 font-bold underline-offset-4 hover:underline ${ring}`}>
                  {showDetails ? "Hide details" : "More details"}
                  <span aria-hidden className={`transition-transform ${showDetails ? "rotate-180" : ""}`}>▾</span>
                </button>
                <p id={detailsId} hidden={!showDetails} className="mt-2 text-[15px] leading-relaxed text-neutral-700">
                  {result.explanation_details}
                </p>
              </>
            )}
          </div>
        </div>
        {pick && (
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              {top === "trade" ? "Toyota to consider" : "If you trade in later"} · {KIND_LABEL[pick.kind] ?? pick.kind}
            </p>
            <p className="mt-1 text-lg font-extrabold">{pick.name}</p>
            <p className="mt-2 text-3xl font-extrabold">{money(pick.new_payment)}<span className="text-base font-semibold">/mo loan</span></p>
            <p className="text-sm text-neutral-600">{money(pick.price)} price · {money(pick.down_payment)} down</p>
            {pick.reason && <p className="mt-2 text-sm text-neutral-600">{pick.reason}</p>}
          </div>
        )}
      </div>

      <p className="mt-auto pt-4 text-xs text-neutral-500">
        Estimates only, not financial advice.{mocked && " Sample results: the scoring service isn't reachable from this site, so these come from a saved run of it."}
      </p>
    </div>
  );
}
