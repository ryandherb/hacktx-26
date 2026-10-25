"use client";

import { useEffect, useRef } from "react";
import type { Analysis, Profile } from "@/lib/api";
import RepairPlan from "./RepairPlan";
import TradePlan from "./TradePlan";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";

type Props = { open: boolean; result: Analysis | null; profile: Profile; ownerLine: string; onBack: () => void };

// The plan for the recommended option, one slide past "Your options".
// Repair and trade-in plans are built; the refinance plan is a PLACEHOLDER (no demo profile
// gets it yet).
export default function PlanPage({ open, result, profile, ownerLine, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => heading.current?.focus({ preventScroll: true }), 450); // after the slide
    return () => clearTimeout(t);
  }, [open]);

  if (!result) return null;
  const rec = result.recommendation;
  const title = { keep: "Your repair plan.", trade: "Your trade-in plan.", refinance: "Your refinance plan." }[rec];
  const subtitle = { keep: `Keep your ${profile.vehicle_model} ready for what's next.`, trade: `A new Toyota that fits your budget, with your ${profile.vehicle_model}'s value toward it.`, refinance: "Details coming next." }[rec];

  return (
    <div className="mx-auto flex h-full max-w-[1240px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <button onClick={onBack} className={`inline-flex items-center gap-2 rounded-full border-2 border-black px-5 py-2 font-bold hover:bg-neutral-50 ${ring}`}>
          <span aria-hidden>←</span> Back to options
        </button>
        <p className="text-[15px] font-semibold text-neutral-600">{ownerLine}</p>
      </div>
      <h1 ref={heading} tabIndex={-1} className="mt-1.5 text-[clamp(30px,2.8vw,40px)] font-extrabold leading-[1.05] tracking-tight outline-none">{title}</h1>
      <p className="text-[16px] text-neutral-600">{subtitle}</p>
      {rec === "keep" && <RepairPlan result={result} profile={profile} />}
      {rec === "trade" && <TradePlan result={result} profile={profile} />}
    </div>
  );
}
