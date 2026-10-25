"use client";

import { useEffect, useState } from "react";
import { getOptions, type OptionId, type OptionsResult } from "@/lib/advisor/service";
import { ring } from "./AdvisorPanel";
import { StepLayout } from "./controls";
import StepFooter from "./StepFooter";

const STAGES = ["Estimating your repair", "Checking your finances", "Scoring your options", "Writing your explanation"];
const OPTION_LABELS: Record<OptionId, [string, string]> = {
  keep_repair: ["Keep & Repair", "Fix it and keep driving"],
  trade_in: ["Trade In & Upgrade", "Put this car toward a newer Toyota"],
  private_sale: ["Private Sale & Refinance", "Sell it yourself and finance a replacement"],
};
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = { profileId: string; onBack: () => void; onStartOver: () => void; onDone: () => void };

// Results are re-requested every time this step mounts, so edited answers never show a stale result.
export default function OptionsStep({ profileId, onBack, onStartOver, onDone }: Props) {
  const [result, setResult] = useState<OptionsResult | null>(null);
  const [mocked, setMocked] = useState(false);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let live = true;
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 650);
    getOptions(profileId).then((r) => { if (live) { setResult(r.data); setMocked(r.mocked); } });
    return () => { live = false; clearInterval(timer); };
  }, [profileId]);

  if (!result) {
    return (
      <StepLayout footer={<StepFooter step={3} />}>
      <div aria-live="polite">
        <h2 id="advisor-title" tabIndex={-1} className="text-[30px] font-extrabold tracking-tight outline-none">Crunching the numbers…</h2>
        <ul className="mt-8 space-y-4">
          {STAGES.map((s, i) => (
            <li key={s} className={`flex items-center gap-4 text-lg ${i <= stage ? "text-black" : "text-neutral-400"}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < stage ? "bg-[#EB0A1E] text-white" : i === stage ? "border-2 border-[#EB0A1E]" : "border-2 border-neutral-300"}`}>
                {i < stage ? "✓" : i === stage ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#EB0A1E]" /> : ""}
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
      </StepLayout>
    );
  }

  const ranked = (Object.keys(result.scores) as OptionId[]).sort((x, y) => result.scores[y] - result.scores[x]);
  const top = ranked[0];
  const v = result.recommended_vehicle;

  return (
    <StepLayout footer={
      <StepFooter step={3} onBack={onBack}
        left={<button onClick={onStartOver} className={`font-bold text-black underline-offset-4 hover:underline ${ring}`}>Start over</button>}
        onContinue={onDone} continueLabel="Done" />
    }>
      <h2 id="advisor-title" tabIndex={-1} className="text-[26px] font-extrabold leading-tight tracking-tight outline-none">
        Your best move: {OPTION_LABELS[top][0]}
      </h2>

      <div className="mt-2.5 grid grid-cols-3 gap-3">
        {ranked.map((id) => {
          const best = id === top;
          return (
            <div key={id} title={OPTION_LABELS[id][1]}
              className={`rounded-xl border-2 px-3.5 py-2.5 ${best ? "border-[#EB0A1E] shadow-[0_8px_24px_rgba(235,10,30,0.12)]" : "border-neutral-200"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${best ? "text-[#EB0A1E]" : "text-transparent"}`}>Best fit</p>
              <p className="text-[34px] font-extrabold leading-none tracking-tight">{result.scores[id]}<span className="text-lg">%</span></p>
              <p className="mt-1.5 text-[14px] font-extrabold leading-tight">{OPTION_LABELS[id][0]}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
                <div className={`h-full rounded-full ${best ? "bg-[#EB0A1E]" : "bg-neutral-500"}`} style={{ width: `${result.scores[id]}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex gap-3 rounded-xl bg-neutral-100 px-4 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advisor/guide-placeholder.png" alt="" className="h-8 w-8 shrink-0 object-contain mix-blend-multiply" />
        <p className="text-[14px] leading-snug">{result.explanation}</p>
      </div>

      {v && (
        <div className="mt-2.5 flex items-center justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">Toyota to consider · {v.kind}</p>
            <p className="text-[15px] font-extrabold">{v.name}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-extrabold leading-tight">{money(v.monthly_estimate)}<span className="text-sm font-semibold">/mo</span></p>
            <p className="text-xs text-neutral-600">est. · {money(v.price)}</p>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-start justify-between gap-6">
        <details className="shrink-0 text-[14px]">
          <summary className={`cursor-pointer font-bold ${ring}`}>What would change this?</summary>
          <ul className="mt-1 max-w-[300px] list-disc space-y-0.5 pl-5 text-neutral-700">
            {result.what_would_change.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </details>
        <p className="text-right text-[11px] leading-snug text-neutral-500">
          Estimates only, not financial advice.{mocked && " Demo results: scoring and explanation services aren't connected yet."}
        </p>
      </div>
    </StepLayout>
  );
}
