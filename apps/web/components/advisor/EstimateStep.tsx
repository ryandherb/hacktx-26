"use client";

import { useState } from "react";
import type { Profile } from "@/lib/api";
import type { AdvisorState } from "@/lib/advisor/state";
import { getQuote } from "@/lib/advisor/service";
import { DEMO_SHOP_QUOTES } from "@/lib/demo/answers";
import { ring } from "./AdvisorPanel";
import { DemoInsert, MoneyInput, StepLayout } from "./controls";
import StepFooter from "./StepFooter";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = { profile: Profile; state: AdvisorState; update: (p: Partial<AdvisorState>) => void };

// Step 1b: the Cost Agent's answer (issue #2). Quotable repairs show an estimate range; symptoms
// show "Inspection needed" and ask for a real shop quote before the user can continue.
export default function EstimateStep({ profile, state, update }: Props) {
  const q = state.quote;
  const [amount, setAmount] = useState<number | null>(state.manualQuote?.amount ?? null);
  const [shop, setShop] = useState(state.manualQuote?.shop ?? "");
  const [editingQuote, setEditingQuote] = useState(!!q && !q.repair);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!q) return null;
  const repair = q.repair;
  const v = q.vehicle;
  const sample = DEMO_SHOP_QUOTES[profile.id];
  const formDirty = amount != null && (amount !== state.manualQuote?.amount || (shop.trim() || null) !== (state.manualQuote?.shop ?? null));

  const applyQuote = async () => {
    if (sending || amount == null || amount <= 0) return;
    setSending(true);
    setError(null);
    try {
      const manualQuote = { amount, shop: shop.trim() || null };
      const r = await getQuote(profile.id, q.quote_input, manualQuote);
      update({ quote: r.data, quoteMocked: r.mocked, manualQuote });
      setEditingQuote(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that quote. Try again.");
    } finally {
      setSending(false);
    }
  };

  const showForm = editingQuote || !repair;
  const footer = (
    <StepFooter step={1} onBack={() => update({ step: "problem" })}
      demo={showForm && sample ? (
        <DemoInsert label="Sample estimate" disabled={amount === sample.amount && shop === sample.shop}
          onClick={() => { setAmount(sample.amount); setShop(sample.shop); }} />
      ) : null}
      busy={sending}
      disabled={showForm ? amount == null || amount <= 0 : !q.complete}
      continueLabel={showForm ? "Use this quote" : "Continue"}
      onContinue={showForm ? applyQuote : () => update({ step: "situation", situationCard: 0, bankModal: !state.bank })} />
  );

  return (
    <StepLayout footer={footer}>
      <h2 id="advisor-title" tabIndex={-1} className="text-[30px] font-extrabold leading-tight tracking-tight outline-none">
        {repair ? "Your repair estimate" : "We need a shop quote"}
      </h2>

      {repair ? (
        <div className="mt-3 rounded-2xl border border-neutral-200 px-5 py-4">
          <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${repair.source === "manual" ? "text-neutral-500" : "text-emerald-700"}`}>
            {repair.source === "manual" ? `From your shop quote${repair.shop ? ` · ${repair.shop}` : ""}` : "We can estimate this"}
          </p>
          <p className="mt-1 text-[17px] font-bold">{repair.label}</p>
          <p className="mt-1 text-[36px] font-extrabold leading-none tracking-tight">
            {repair.repair_cost_low === repair.repair_cost_high
              ? money(repair.repair_cost_estimate)
              : `${money(repair.repair_cost_low)} – ${money(repair.repair_cost_high)}`}
          </p>
          {repair.source === "table" && (
            <p className="mt-2 text-[14px] text-neutral-600">
              We&rsquo;ll plan for <span className="font-bold text-black">{money(repair.repair_cost_estimate)}</span>, the high end, so there are no surprises.
              {repair.region ? ` Based on ${repair.region} labor rates.` : ""}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden><path d="M10 2.5 18 17H2L10 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 8v4M10 14.3v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Inspection needed
          </p>
          {q.classification.label && <p className="mt-1 text-[17px] font-bold">Sounds like: {q.classification.label}</p>}
          <p className="mt-1 text-[14px] leading-snug text-neutral-700">{q.classification.reason}</p>
        </div>
      )}

      {showForm && (
        <div className="mt-4">
          <p className="text-[14px] font-bold">{repair ? "Enter your shop quote" : "Have a quote from a shop? Enter the total."}</p>
          <div className="mt-1.5 grid grid-cols-[1fr_1.4fr] gap-3">
            <MoneyInput label="" value={amount} onChange={(n) => setAmount(n == null ? null : Math.min(n, 100000))} />
            <label className="block">
              <span className="sr-only">Shop name (optional)</span>
              <input value={shop} onChange={(e) => setShop(e.target.value)} maxLength={200} placeholder="Shop name (optional)"
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-4 py-3.5 text-[16px] outline-none placeholder:text-neutral-500 focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800" />
            </label>
          </div>
          {repair && (
            <button onClick={() => { setEditingQuote(false); setAmount(state.manualQuote?.amount ?? null); setShop(state.manualQuote?.shop ?? ""); }}
              className={`mt-2 text-[13px] underline underline-offset-2 ${ring}`}>Cancel</button>
          )}
          {formDirty && !repair && <p className="mt-1 text-[12px] text-neutral-500">Press &ldquo;Use this quote&rdquo; to apply it.</p>}
        </div>
      )}

      {v && (
        <p className="mt-4 text-[14px] text-neutral-700">
          Your {profile.vehicle_model} is worth about{" "}
          <span className="font-bold text-black">{money(v.trade_in_estimate)}</span> as a trade-in, or{" "}
          <span className="font-bold text-black">{money(v.private_sale_estimate)}</span> sold privately.
        </p>
      )}

      {q.nearby_shops.length > 0 && !showForm && (
        <p className="mt-2 text-[14px] text-neutral-700">
          <span className="text-neutral-500">Shops near you: </span>{q.nearby_shops.map((s) => s.name).join(" · ")}
        </p>
      )}

      {repair && !showForm && (
        <button onClick={() => setEditingQuote(true)} className={`mt-2 text-[14px] underline underline-offset-4 hover:text-[#EB0A1E] ${ring}`}>
          {repair.source === "manual" ? "Change my shop quote" : "Already have a shop quote? Enter it instead"}
        </button>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-[#c8091a]">{error}</p>}
      <p className="mt-3 text-[11px] leading-snug text-neutral-500">
        {q.disclaimer}{state.quoteMocked && " Demo mode: repair quote service offline, showing a sample estimate."}
      </p>
    </StepLayout>
  );
}
