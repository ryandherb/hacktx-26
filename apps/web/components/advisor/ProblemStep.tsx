"use client";

import { useRef, useState } from "react";
import type { Profile } from "@/lib/api";
import type { AdvisorState } from "@/lib/advisor/state";
import { getQuote, submitProblem } from "@/lib/advisor/service";
import { demoAnswer } from "@/lib/demo/answers";
import { ring } from "./AdvisorPanel";
import { StepLayout } from "./controls";
import StepFooter from "./StepFooter";

type Props = {
  profile: Profile;
  state: AdvisorState;
  update: (p: Partial<AdvisorState>) => void;
};

export default function ProblemStep({ profile, state, update }: Props) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const text = state.problem;
  const preset = demoAnswer(profile.id, "repair_description");

  const insertDemo = () => {
    if (!preset) return setDemoNote("No demo answer for this profile. Type one instead.");
    update({ problem: preset });
    setDemoNote(null);
  };

  // Upload is UI-only until the Cost Agent (issue #2) exposes an extraction endpoint; the file is not read.
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) update({ estimateFileName: f.name });
    e.target.value = "";
  };

  const submit = async () => {
    if (sending || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const problem = text.trim();
      const r = await submitProblem(profile.id, problem, profile);
      const quoteInput = r.data.quote_input ?? { repair_type: problem, vehicle_model: profile.vehicle_model, vehicle_year: profile.vehicle_year, location: profile.zip_code };
      // A shop quote only carries over if the problem description didn't change.
      const manualQuote = state.reportedIssue?.text === problem ? state.manualQuote : null;
      const quote = await getQuote(profile.id, quoteInput, manualQuote);
      update({
        survey: r.data,
        surveyMocked: r.mocked,
        quote: quote.data,
        quoteMocked: quote.mocked,
        manualQuote,
        step: "estimate",
        reportedIssue: { text: problem, reportedAt: new Date().toISOString(), estimateFileName: state.estimateFileName },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <StepLayout footer={<StepFooter step={1} onBack={() => update({ step: "intro" })} onContinue={submit} disabled={!text.trim()} busy={sending} />}>
      <h2 id="advisor-title" tabIndex={-1} className="text-[34px] font-extrabold leading-tight tracking-tight outline-none">What&rsquo;s happening with your car?</h2>
      <p className="mt-1 text-lg text-neutral-600">Describe the issue, or share a repair estimate if you have one.</p>

      <div className="relative mt-5">
        <label htmlFor="problem" className="sr-only">Describe the issue</label>
        <textarea id="problem" value={text} onChange={(e) => update({ problem: e.target.value })} rows={3} maxLength={500}
          placeholder="For example: My car shakes when I accelerate…"
          className={`w-full resize-none rounded-xl border border-neutral-300 px-5 py-4 pr-14 text-lg placeholder:text-neutral-500 outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800`} />
        <button onClick={() => fileInput.current?.click()} aria-label="Attach a repair estimate" title="Attach a repair estimate"
          className={`absolute bottom-4 right-4 rounded-full p-1.5 text-neutral-600 hover:bg-neutral-100 ${ring}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
      <input ref={fileInput} type="file" accept=".pdf,image/*" className="hidden" onChange={onFile} tabIndex={-1} />

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <button onClick={() => fileInput.current?.click()}
          className={`inline-flex items-center gap-3 rounded-full border-2 border-black px-8 py-3 text-[17px] font-bold hover:bg-neutral-50 ${ring}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Upload repair estimate
        </button>
        <div className="text-right">
          <p className="mr-[150px] text-sm text-neutral-600">Demo</p>
          <button onClick={insertDemo} disabled={!!preset && text === preset}
            className={`inline-flex items-center gap-2 text-lg underline underline-offset-4 hover:text-[#EB0A1E] disabled:opacity-40 ${ring}`}>
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden><rect x="4" y="2.5" width="12" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.4" /></svg>
            {text.trim() && text !== preset ? "Replace with demo answer" : "Insert demo answer"}
          </button>
        </div>
      </div>

      <div role="status" className="mt-3 space-y-1 text-[15px] text-neutral-600">
        {state.estimateFileName ? (
          <p>
            Attached: <span className="font-semibold text-black">{state.estimateFileName}</span>. Reading estimates isn&rsquo;t connected yet, so please describe the issue too.{" "}
            <button onClick={() => update({ estimateFileName: null })} className={`underline ${ring}`}>Remove</button>
          </p>
        ) : (
          <p>An inspection may be needed before a repair can be estimated.</p>
        )}
        {demoNote && <p>{demoNote}</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-[#c8091a]">{error}</p>}

    </StepLayout>
  );
}
