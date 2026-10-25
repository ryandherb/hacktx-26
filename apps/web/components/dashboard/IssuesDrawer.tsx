"use client";

import type { ReportedIssue } from "@/lib/advisor/state";
import SideDrawer from "./SideDrawer";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";

type Props = { open: boolean; onClose: () => void; label: string; issue: ReportedIssue | null; optionsReady: boolean; onOpenAdvisor: () => void };

// Issues the owner reported in the Lifecycle Advisor (saved when step 1 is submitted).
export default function IssuesDrawer({ open, onClose, label, issue, optionsReady, onOpenAdvisor }: Props) {
  const go = () => { onClose(); onOpenAdvisor(); };
  return (
    <SideDrawer open={open} onClose={onClose} title="Current issues" closeLabel="Close current issues">
      <p className="mt-1 text-sm text-neutral-600">{label}</p>
      {issue ? (
        <div className="mt-6 rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#EB0A1E]">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[#EB0A1E]" /> Reported by you
            </span>
            <span className="text-xs text-neutral-500">
              {new Date(issue.reportedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <p className="mt-3 text-[17px] font-bold leading-snug">{issue.text}</p>
          {issue.estimateFileName && <p className="mt-2 text-sm text-neutral-600">Estimate attached: {issue.estimateFileName}</p>}
          <p className="mt-3 text-sm text-neutral-600">Status: {optionsReady ? "Options ready in Lifecycle Advisor" : "Assessment in progress"}</p>
          <button onClick={go} className={`mt-5 w-full rounded-full bg-black px-6 py-3 font-bold text-white hover:bg-neutral-800 ${ring}`}>
            {optionsReady ? "See my options" : "Continue in Lifecycle Advisor"}
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-neutral-100 p-5 text-center">
          <p className="font-bold">No current issues reported.</p>
          <p className="mt-1 text-sm text-neutral-600">Something wrong with your car? Tell us and we&rsquo;ll help you weigh your options.</p>
          <button onClick={go} className={`mt-4 rounded-full bg-[#EB0A1E] px-6 py-3 font-bold text-white hover:bg-[#c8091a] ${ring}`}>Find My Next Move</button>
        </div>
      )}
    </SideDrawer>
  );
}
