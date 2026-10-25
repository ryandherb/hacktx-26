import { ADVISOR_STEPS, ring } from "./AdvisorPanel";

type Props = { step: number; onContinue?: () => void; onBack?: () => void; disabled?: boolean; busy?: boolean; continueLabel?: string; left?: React.ReactNode; demo?: React.ReactNode };

export default function StepFooter({ step, onContinue, onBack, disabled, busy, continueLabel = "Continue", left, demo }: Props) {
  return (
    <div className="mt-3 flex shrink-0 items-center justify-between gap-4 border-t border-neutral-200 pt-4">
      <div className="flex items-center gap-4 whitespace-nowrap text-[15px] text-neutral-600">
        {onBack && <button onClick={onBack} className={`font-bold text-black underline-offset-4 hover:underline ${ring}`}>← Back</button>}
        {left}
        <span>Step {step} of {ADVISOR_STEPS.length}</span>
      </div>
      <div className="flex items-center gap-5 whitespace-nowrap">
      {demo}
      {onContinue && (
        <button onClick={onContinue} disabled={disabled || busy}
          className={`inline-flex items-center gap-3 rounded-full bg-[#EB0A1E] px-10 py-3.5 text-lg font-bold text-white hover:bg-[#c8091a] disabled:cursor-not-allowed disabled:bg-neutral-300 ${ring}`}>
          {busy ? "Sending…" : <>{continueLabel} <span aria-hidden>→</span></>}
        </button>
      )}
      </div>
    </div>
  );
}
