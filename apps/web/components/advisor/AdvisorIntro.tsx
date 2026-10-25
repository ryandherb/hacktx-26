import { ring } from "./AdvisorPanel";

type Props = { firstName: string; inProgress: boolean; onStart: () => void };

export default function AdvisorIntro({ firstName, inProgress, onStart }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-6 text-center">
      {/* PLACEHOLDER mascot cropped from the design mockup; swap for a final asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/advisor/guide-placeholder.png" alt="" className="w-44 mix-blend-multiply" />
      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-neutral-600">Your AI guide</p>
      <h2 id="advisor-title" tabIndex={-1} className="mt-2 text-[44px] font-extrabold leading-[1.08] tracking-tight outline-none">
        Your car.<br />Your next move.
      </h2>
      <p className="mt-4 max-w-sm text-lg text-neutral-600">
        Hi {firstName}, let&rsquo;s find the right next step for you and your Toyota.
      </p>
      <button onClick={onStart} className={`mt-7 inline-flex items-center gap-3 rounded-full bg-[#EB0A1E] px-12 py-4 text-lg font-bold text-white hover:bg-[#c8091a] ${ring}`}>
        {inProgress ? "Continue My Assessment" : "Start My Assessment"} <span aria-hidden>→</span>
      </button>
    </div>
  );
}
