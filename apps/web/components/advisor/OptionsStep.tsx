"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/api";
import { getOptions, OPTION_LABELS, type OptionsInputs } from "@/lib/advisor/service";
import { resultsNote } from "@/lib/advisor/results";
import { ring } from "./AdvisorPanel";
import { StepLayout } from "./controls";
import StepFooter from "./StepFooter";

const STAGES = ["Estimating your repair", "Checking your finances", "Scoring your options", "Writing your explanation"];

type Props = {
  profileId: string;
  inputs: OptionsInputs;
  onBack: () => void;
  onStartOver: () => void;
  onResult: (r: Analysis, mocked: boolean, preset: boolean) => void;
  onView: () => void;
};

// Results are re-requested every time this step mounts, so edited answers never show a stale result.
export default function OptionsStep({ profileId, inputs, onBack, onStartOver, onResult, onView }: Props) {
  const [result, setResult] = useState<Analysis | null>(null);
  const [mocked, setMocked] = useState(false);
  const [preset, setPreset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  useEffect(() => {
    let live = true;
    setError(null);
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 650);
    getOptions(profileId, inputsRef.current)
      .then((r) => {
        if (!live) return;
        setResult(r.data); setMocked(r.mocked); setPreset(!!r.preset);
        onResultRef.current(r.data, r.mocked, !!r.preset);
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Something went wrong."); })
      .finally(() => clearInterval(timer));
    return () => { live = false; clearInterval(timer); };
  }, [profileId, attempt]);

  if (error) {
    return (
      <StepLayout footer={<StepFooter step={3} onBack={onBack} />}>
        <div role="alert">
          <h2 id="advisor-title" tabIndex={-1} className="text-[clamp(24px,2.2vw,30px)] font-extrabold tracking-tight outline-none">We couldn&rsquo;t score your options</h2>
          <p className="mt-3 text-[16px] text-neutral-600">{error}</p>
          <button onClick={() => setAttempt((a) => a + 1)}
            className={`mt-6 rounded-full bg-[#EB0A1E] px-8 py-3 font-bold text-white hover:bg-[#c8091a] ${ring}`}>
            Try again
          </button>
        </div>
      </StepLayout>
    );
  }

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
        <p className="mt-3 text-[15px]"><span className="text-neutral-500">Best fit:</span> <span className="font-bold">{OPTION_LABELS[result.recommendation][0]}</span></p>
        <button onClick={onView}
          className={`mt-6 inline-flex items-center gap-3 rounded-full bg-[#EB0A1E] px-10 py-4 xl:px-14 text-xl font-bold text-white shadow-[0_10px_28px_rgba(235,10,30,0.3)] hover:bg-[#c8091a] ${ring}`}>
          View your options <span aria-hidden>→</span>
        </button>
        {resultsNote(mocked, preset) && <p className="mt-3 max-w-sm text-[11px] text-neutral-500">{resultsNote(mocked, preset)}</p>}
      </div>
    </StepLayout>
  );
}
