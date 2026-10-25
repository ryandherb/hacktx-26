import { ring } from "./AdvisorPanel";

// Floating resume control shown while the advisor popup is minimized.
export default function MinimizedPill({ stepLabel, onResume }: { stepLabel: string; onResume: () => void }) {
  return (
    <button onClick={onResume}
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-neutral-200 bg-white py-3 pl-5 pr-3 text-[15px] shadow-[0_12px_32px_rgba(0,0,0,0.18)] hover:shadow-[0_14px_36px_rgba(0,0,0,0.24)] ${ring}`}>
      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#EB0A1E]" />
      <span className="font-bold">Lifecycle Advisor</span>
      <span className="text-neutral-500">· {stepLabel}</span>
      <span className="rounded-full bg-black px-4 py-1.5 text-sm font-bold text-white">Resume</span>
    </button>
  );
}
