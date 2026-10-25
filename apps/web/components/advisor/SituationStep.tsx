"use client";

import type { BankSnapshot } from "@/lib/advisor/service";
import type { AdvisorState } from "@/lib/advisor/state";
import {
  CAR_RELIANCE, CARD_FIELDS, CREDIT_BANDS, DOWN_PAYMENT_MAX, INTERNSHIP_DURATION, JOB_START, KEEP_HORIZON, LIFE_CHANGES,
  OTHER_DETAILS_CARDS, cardComplete, cardsFor, type CardId, type LifeChange, type SituationAnswers,
} from "@/lib/advisor/situation";
import { DEMO_SITUATION } from "@/lib/demo/answers";
import { ring } from "./AdvisorPanel";
import { DemoInsert, MoneyInput, Segmented, StepLayout, TogglePill } from "./controls";
import StepFooter from "./StepFooter";

type Props = { profileId: string; state: AdvisorState; update: (p: Partial<AdvisorState>) => void };

const money = (n: number) => `$${n.toLocaleString()}`;

const TITLES: Record<CardId, [string, string]> = {
  bank: ["Your finances", "Pulled from your bank, so you don't have to type it in."],
  life_change: ["Is anything big coming up in the next year?", "Pick everything that applies. Changes ahead can shift what makes sense today."],
  life_details: ["Tell us a bit more.", "Rough numbers are fine. We won't count future income as guaranteed."],
  keep_horizon: ["How long do you want to keep driving this car?", "If you fix it, how long would you like it to last?"],
  down_payment: ["How much could you put toward this right now?", "Cash you could use for a repair or a down payment without touching emergency savings."],
  credit_band: ["What's your estimated credit score?", "This only sets the loan rate we assume. We don't check your credit."],
  car_reliance: ["How much do you rely on this car?", "Being without it for a while matters more if you drive every day."],
  review: ["Here's what we heard.", "Check your answers. Edit anything before we look at your options."],
};

export default function SituationStep({ profileId, state, update }: Props) {
  const a = state.situation;
  const cards = cardsFor(a);
  const index = Math.min(state.situationCard, cards.length - 1);
  const card = cards[index];
  const set = (patch: Partial<SituationAnswers>) => update({ situation: { ...a, ...patch } });
  const go = (i: number) => update({ situationCard: i });

  const toggleChange = (id: LifeChange) => {
    if (id === "none") return set({ life_change: a.life_change.includes("none") ? [] : ["none"] });
    const rest = a.life_change.filter((c) => c !== "none");
    set({ life_change: rest.includes(id) ? rest.filter((c) => c !== id) : [...rest, id] });
  };

  // Demo insert fills only this card's fields and never advances.
  const preset = DEMO_SITUATION[profileId];
  const fields = card === "review" || card === "bank" ? [] : CARD_FIELDS[card];
  const presetForCard = preset ? Object.fromEntries(fields.filter((f) => f in preset).map((f) => [f, preset[f]])) : {};
  const hasPreset = Object.keys(presetForCard).length > 0;
  const matchesPreset = hasPreset && fields.every((f) => !(f in presetForCard) || JSON.stringify(a[f]) === JSON.stringify(presetForCard[f as keyof typeof presetForCard]));
  const cardHasInput = fields.some((f) => { const v = a[f]; return Array.isArray(v) ? v.length > 0 : v != null; });

  const [title, sub] = TITLES[card];
  const back = () => (index === 0 ? update({ step: "problem" }) : go(index - 1));
  const next = () => (card === "review" ? update({ step: "options" }) : go(index + 1));

  const demo = card === "review" || card === "bank" ? null : (
    <DemoInsert onClick={() => set(presetForCard)} disabled={!hasPreset || matchesPreset}
      label={!hasPreset ? "No demo answer" : cardHasInput && !matchesPreset ? "Replace with demo answer" : "Insert demo answer"} />
  );

  return (
    <StepLayout footer={<StepFooter step={2} onBack={back} onContinue={next} disabled={card === "bank" ? !state.bank && !state.bankSkipped : !cardComplete(card, a)} demo={demo}
      continueLabel={card === "review" ? "See my options" : "Continue"} />}>
      <div className="flex items-center gap-3 text-[15px] text-neutral-600">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advisor/guide-placeholder.png" alt="" className="h-7 w-7 object-contain mix-blend-multiply" />
        <span>Question {index + 1} of {cards.length}</span>
        <span aria-hidden className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
          <span className="block h-full rounded-full bg-[#EB0A1E] transition-all" style={{ width: `${((index + 1) / cards.length) * 100}%` }} />
        </span>
      </div>

      <h2 id="advisor-title" tabIndex={-1} className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight outline-none">{title}</h2>
      <p className="mt-1 text-lg text-neutral-600">{sub}</p>

      <div className="mt-5">
        {card === "life_change" && (
          <div className="flex flex-wrap gap-3">
            {LIFE_CHANGES.map((c) => <TogglePill key={c.id} label={c.label} on={a.life_change.includes(c.id)} onClick={() => toggleChange(c.id)} />)}
          </div>
        )}

        {card === "life_details" && (
          <div className="space-y-4">
            {a.life_change.includes("new_job") && (
              <fieldset className="space-y-3">
                <legend className="sr-only">New job</legend>
                <div>
                  <p className="mb-1.5 text-[14px] font-bold">New job: when does it start?</p>
                  <Segmented label="When does it start?" options={JOB_START} value={a.job_start} onChange={(v) => set({ job_start: v })} />
                </div>
                <MoneyInput label="Expected monthly take-home pay" suffix="/ month" value={a.expected_take_home} onChange={(v) => set({ expected_take_home: v })} />
              </fieldset>
            )}
            {a.life_change.includes("internship") && (
              <fieldset>
                <legend className="mb-2 text-[16px] font-extrabold">Unpaid internship: how long?</legend>
                <Segmented label="Internship length" options={INTERNSHIP_DURATION} value={a.internship_duration} onChange={(v) => set({ internship_duration: v })} />
              </fieldset>
            )}
            {a.life_change.includes("moving") && (
              <fieldset>
                <legend className="sr-only">Moving</legend>
                <MoneyInput label="Moving: about how much will it cost?" value={a.moving_cost} onChange={(v) => set({ moving_cost: v })} />
              </fieldset>
            )}
          </div>
        )}

        {card === "keep_horizon" && <Segmented label="How long to keep the car" options={KEEP_HORIZON} value={a.keep_horizon} onChange={(v) => set({ keep_horizon: v })} />}
        {card === "credit_band" && <Segmented label="Estimated credit score" options={CREDIT_BANDS} value={a.credit_band} onChange={(v) => set({ credit_band: v })} />}
        {card === "car_reliance" && <Segmented label="How much you rely on the car" options={CAR_RELIANCE} value={a.car_reliance} onChange={(v) => set({ car_reliance: v })} />}

        {card === "down_payment" && (
          <div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-lg font-bold">Cash available</span>
              <div className="w-44"><MoneyInput label="" value={a.down_payment} onChange={(v) => set({ down_payment: v == null ? null : Math.min(v, 999999) })} /></div>
            </div>
            <input type="range" min={0} max={DOWN_PAYMENT_MAX} step={250} value={Math.min(a.down_payment ?? 0, DOWN_PAYMENT_MAX)}
              onChange={(e) => set({ down_payment: Number(e.target.value) })} aria-label="Cash available"
              className="mt-6 w-full accent-neutral-700" />
            <div className="mt-1 flex justify-between text-[15px] font-semibold text-neutral-500"><span>$0</span><span>{money(DOWN_PAYMENT_MAX)}+</span></div>
          </div>
        )}

        {card === "bank" && <BankCard state={state} update={update} />}
        {card === "review" && <Review a={a} cards={cards} go={go} bank={state.bank} />}

        {OTHER_DETAILS_CARDS.includes(card) && (
          <label className="mt-4 block">
            <span className="sr-only">Other details</span>
            <input value={a.notes[card] ?? ""} maxLength={300}
              onChange={(e) => set({ notes: { ...a.notes, [card]: e.target.value } })}
              placeholder={card === "life_details" ? "Anything else we should know? (optional)" : "Something else? Type your own answer or other details"}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-[15px] outline-none placeholder:text-neutral-500 focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800" />
          </label>
        )}
      </div>

    </StepLayout>
  );
}

function Review({ a, cards, go, bank }: { a: SituationAnswers; cards: CardId[]; go: (i: number) => void; bank: BankSnapshot | null }) {
  const changes = a.life_change.map((c) => LIFE_CHANGES.find((x) => x.id === c)?.label).join(", ");
  const details = [
    a.life_change.includes("new_job") && `New job starts ${a.job_start}, ${money(a.expected_take_home ?? 0)}/mo take-home`,
    a.life_change.includes("internship") && `Unpaid internship, ${a.internship_duration}`,
    a.life_change.includes("moving") && `Moving cost about ${money(a.moving_cost ?? 0)}`,
  ].filter(Boolean).join(" · ");
  // Show typed "other details" next to the picked answer.
  const withNote = (id: CardId, v: string) => [v, a.notes[id]?.trim() && `“${a.notes[id]!.trim()}”`].filter(Boolean).join(" · ");
  const rows: [CardId, string, string][] = ([
    ["bank", "Bank", bank ? `${bank.institution} · ${bank.accounts.length} account${bank.accounts.length === 1 ? "" : "s"} connected` : "Not connected"],
    ["life_change", "Coming up", changes],
    ...(cards.includes("life_details") ? [["life_details", "Details", details] as [CardId, string, string]] : []),
    ["keep_horizon", "Keep the car", a.keep_horizon ?? ""],
    ["down_payment", "Cash available", money(a.down_payment ?? 0)],
    ["credit_band", "Credit estimate", a.credit_band ?? ""],
    ["car_reliance", "Reliance on car", a.car_reliance ?? ""],
  ] as [CardId, string, string][]).map(([id, k, v]) => [id, k, withNote(id, v)]);
  return (
    <dl className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 px-5">
      {rows.map(([id, k, v]) => (
        <div key={id} className="flex items-center gap-6 py-1.5 text-[15px]">
          <dt className="w-36 shrink-0 text-neutral-600">{k}</dt>
          <dd className="flex-1 font-bold">{v}</dd>
          <button onClick={() => go(cards.indexOf(id))} className={`text-sm underline underline-offset-2 hover:text-[#EB0A1E] ${ring}`}>Edit</button>
        </div>
      ))}
    </dl>
  );
}

// First card of step 2: the bank snapshot (mock Nessie), or a prompt to connect.
function BankCard({ state, update }: { state: AdvisorState; update: (p: Partial<AdvisorState>) => void }) {
  const b = state.bank;
  if (!b) {
    return (
      <div className="rounded-2xl border border-neutral-200 p-6 text-center">
        <p className="text-[16px] font-bold">Connect your bank to skip the money questions.</p>
        <p className="mt-1 text-[14px] text-neutral-600">Read-only and secure. It takes about 10 seconds.</p>
        <button onClick={() => update({ bankModal: true, bankSkipped: false })}
          className={`mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-7 py-3 font-bold text-white hover:bg-neutral-800 ${ring}`}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" /><path d="M5.2 7V5.2a2.8 2.8 0 015.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          Connect bank
        </button>
        <div>
          <button onClick={() => update({ bankSkipped: true })} className={`mt-3 text-[14px] underline underline-offset-4 ${state.bankSkipped ? "font-bold" : "text-neutral-600"} ${ring}`}>
            {state.bankSkipped ? "✓ I'll enter my finances myself" : "Enter my finances myself instead"}
          </button>
        </div>
      </div>
    );
  }
  const savings = b.accounts.filter((x) => x.type === "Savings").reduce((s, x) => s + x.balance, 0);
  const checking = b.accounts.filter((x) => x.type === "Checking").reduce((s, x) => s + x.balance, 0);
  const tiles: [string, string][] = [
    ["Monthly income", `${money(b.monthlyIncome)}`],
    ["Monthly spending", `${money(b.monthlySpending)}`],
    ["Savings", money(savings)],
    ["Checking", money(checking)],
  ];
  return (
    <div>
      <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 text-[14px]">
        <span className="flex items-center gap-2 font-bold text-emerald-800">
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="m6 10.2 2.6 2.6L14.2 7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Connected to {b.institution}
        </span>
        <span className="text-emerald-800/80">{b.accounts.map((x) => `•••• ${x.mask}`).join("  ")}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-neutral-200 px-4 py-3">
            <dt className="text-[13px] text-neutral-600">{k}</dt>
            <dd className="text-[24px] font-extrabold tracking-tight">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[13px] text-neutral-600">
        {b.carInsurance ? `Car insurance detected: ${money(b.carInsurance)}/mo. ` : ""}Averages from the last 3 months.
        <button onClick={() => update({ bankModal: true })} className={`ml-2 underline underline-offset-2 ${ring}`}>Reconnect</button>
      </p>
    </div>
  );
}
