"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/api";
import { getAnalysis, type CostQuoteResult, type ManualQuote } from "@/lib/advisor/service";
import { OPTION_TITLES } from "@/lib/advisor/results";
import type { SituationAnswers } from "@/lib/advisor/situation";
import { ring } from "./AdvisorPanel";
import { StepLayout } from "./controls";
import StepFooter from "./StepFooter";

const STAGES = ["Estimating your repair", "Checking your finances", "Scoring your options", "Writing your explanation"];

type Props = {
  profileId: string; situation: SituationAnswers; quote: CostQuoteResult | null; manualQuote: ManualQuote | null;
  onBack: () => void; onStartOver: () => void; onResult: (r: Analysis, mocked: boolean) => void; onView: () => void;
};

// Results are re-requested every time this step mounts, so edited answers never show a stale result.
export default function OptionsStep({ profileId, situation, quote, manualQuote, onBack, onStartOver, onResult, onView }: Props) {
  const [result, setResult] = useState<Analysis | null>(null);
  const [mocked, setMocked] = useState(false);
  const [stage, setStage] = useState(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let live = true;
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 650);
    getAnalysis(profileId, situation, quote, manualQuote)
      .then((r) => { if (live) { setResult(r.data); setMocked(r.mocked); onResultRef.current(r.data, r.mocked); } });
    return () => { live = false; clearInterval(timer); };
    // Runs once per visit to this step; the answers can't change while it's showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  if (!result) {
    return (
      <StepLayout footer={<StepFooter step={3} />}>
      <div aria-live="polite">
        <h2 id="advisor-title" tabIndex={-1} className="text-[clamp(24px,2.2vw,30px)] font-extrabold tracking-tight outline-none">Crunching the numbers…</h2>
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

  return (
    <StepLayout footer={
      <StepFooter step={3} onBack={onBack}
        left={<button onClick={onStartOver} className={`min-h-11 font-bold text-black underline-offset-4 hover:underline ${ring}`}>Start over</button>} />
    }>
      <div className="flex h-full flex-col items-center justify-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advisor/guide-placeholder.png" alt="" className="w-[clamp(80px,14vh,112px)] object-contain mix-blend-multiply" />
        <h2 id="advisor-title" tabIndex={-1} className="mt-4 text-[clamp(26px,2.6vw,34px)] font-extrabold leading-tight tracking-tight outline-none">Your options are ready</h2>
        <p className="mt-2 max-w-sm text-[16px] text-neutral-600">We compared keeping and repairing, trading in, and refinancing.</p>
        <p className="mt-3 text-[15px]"><span className="text-neutral-500">Best fit:</span> <span className="font-bold">{OPTION_TITLES[result.recommendation]}</span></p>
        <button onClick={onView}
          className={`mt-6 inline-flex items-center gap-3 rounded-full bg-[#EB0A1E] px-10 py-4 xl:px-14 text-xl font-bold text-white shadow-[0_10px_28px_rgba(235,10,30,0.3)] hover:bg-[#c8091a] ${ring}`}>
          View your options <span aria-hidden>→</span>
        </button>
        {mocked && <p className="mt-3 text-[11px] text-neutral-500">Demo data: recorded results, backend not connected.</p>}
      </div>
    </StepLayout>
  );
}
