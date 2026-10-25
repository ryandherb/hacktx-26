"use client";

import { useEffect, useRef } from "react";
import type { Analysis } from "@/lib/api";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";

type Props = { open: boolean; result: Analysis | null; onBack: () => void };

// The plan for the recommended option (trade-in, repair, or refinance plan).
// PLACEHOLDER until its reference designs and car photos are in.
export default function PlanPage({ open, result, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => heading.current?.focus({ preventScroll: true }), 450); // after the slide
    return () => clearTimeout(t);
  }, [open]);

  if (!result) return null;
  const title = { keep: "Your repair plan", trade: "Your trade-in plan", refinance: "Your refinance plan" }[result.recommendation];

  return (
    <div className="mx-auto flex h-full max-w-[1240px] flex-col">
      <div>
        <button onClick={onBack} className={`inline-flex items-center gap-2 rounded-full border-2 border-black px-5 py-2 font-bold hover:bg-neutral-50 ${ring}`}>
          <span aria-hidden>←</span> Back to options
        </button>
      </div>
      <h1 ref={heading} tabIndex={-1} className="mt-6 text-[clamp(32px,3.2vw,48px)] font-extrabold leading-tight tracking-tight outline-none">{title}</h1>
      <p className="mt-2 text-lg text-neutral-600">Details coming next.</p>
    </div>
  );
}
