"use client";

import { useRef, useState } from "react";
import type { Profile } from "@/lib/api";
import type { AdvisorState } from "@/lib/advisor/state";
import { getQuote } from "@/lib/advisor/service";
import { DEMO_SHOPS, readDemoQuote, type ReadQuote } from "@/lib/demo/shops";
import { ring } from "./AdvisorPanel";
import { MoneyInput, StepLayout } from "./controls";
import ShopFinder from "./ShopFinder";
import StepFooter from "./StepFooter";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const READ_STEPS = ["Scanning document", "Finding line items", "Reading the total"];

type Mode = "summary" | "inspect" | "upload" | "review";
type Props = { profile: Profile; state: AdvisorState; update: (p: Partial<AdvisorState>) => void };

// Step 1b, driven by the Cost Agent (issue #2):
// - quotable repair  -> "summary": estimate range, car value, nearby shops
// - symptom only     -> "inspect": inspection needed + shops to get it diagnosed
// - then "upload" the mechanic's quote (or type the total) -> "review" what was read -> apply it.
export default function EstimateStep({ profile, state, update }: Props) {
  const q = state.quote;
  const [mode, setMode] = useState<Mode>(q?.repair ? "summary" : "inspect");
  const [amount, setAmount] = useState<number | null>(state.manualQuote?.amount ?? null);
  const [shop, setShop] = useState(state.manualQuote?.shop ?? "");
  const [reading, setReading] = useState<{ name: string; step: number } | null>(null);
  const [readQuote, setReadQuote] = useState<ReadQuote | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!q) return null;
  const repair = q.repair;
  const v = q.vehicle;
  const shops = DEMO_SHOPS[profile.id] ?? [];

  const applyQuote = async (total: number, shopName: string | null) => {
    if (sending || total <= 0) return;
    setSending(true);
    setError(null);
    try {
      const manualQuote = { amount: total, shop: shopName };
      const r = await getQuote(profile.id, q.quote_input, manualQuote);
      update({ quote: r.data, quoteMocked: r.mocked, manualQuote });
      setMode("summary");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that quote. Try again.");
    } finally {
      setSending(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file || reading) return;
    setUploadNote(null);
    setReading({ name: file.name, step: 0 });
    const timers = READ_STEPS.map((_, i) => setTimeout(() => setReading((r) => r && { ...r, step: i + 1 }), 550 * (i + 1)));
    const [result] = await Promise.all([readDemoQuote(file), new Promise((r) => setTimeout(r, 550 * READ_STEPS.length + 250))]);
    timers.forEach(clearTimeout);
    setReading(null);
    if (result) {
      setReadQuote(result);
      setMode("review");
    } else {
      setUploadNote(`We couldn't read “${file.name}” automatically. Type the total from your quote below.`);
    }
  };

  const toSituation = () => update({ step: "situation", situationCard: 0, bankModal: !state.bank });
  const footers: Record<Mode, React.ReactNode> = {
    summary: <StepFooter step={1} onBack={() => update({ step: "problem" })} disabled={!q.complete} onContinue={toSituation} />,
    inspect: <StepFooter step={1} onBack={() => update({ step: "problem" })} continueLabel="I have my quote" onContinue={() => setMode("upload")} />,
    upload: (
      <StepFooter step={1} onBack={() => setMode(repair ? "summary" : "inspect")} busy={sending}
        disabled={amount == null || amount <= 0 || !!reading} continueLabel="Use this quote"
        onContinue={() => amount != null && applyQuote(amount, shop.trim() || null)} />
    ),
    review: (
      <StepFooter step={1} onBack={() => setMode("upload")} busy={sending} continueLabel="Use this quote"
        onContinue={() => readQuote && applyQuote(readQuote.total, readQuote.shop)} />
    ),
  };

  return (
    <StepLayout footer={footers[mode]}>
      {mode === "summary" && repair && (
        <>
          <h2 id="advisor-title" tabIndex={-1} className="text-[clamp(24px,2.2vw,30px)] font-extrabold leading-tight tracking-tight outline-none">Your repair estimate</h2>
          <div className="mt-3 rounded-2xl border border-neutral-200 px-5 py-4">
            <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${repair.source === "manual" ? "text-neutral-500" : "text-emerald-700"}`}>
              {repair.source === "manual" ? `From your shop quote${repair.shop ? ` · ${repair.shop}` : ""}` : "We can estimate this"}
            </p>
            <p className="mt-1 text-[17px] font-bold">{repair.label}</p>
            <p className="mt-1 text-[clamp(28px,2.6vw,36px)] font-extrabold leading-none tracking-tight">
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
          {v && (
            <p className="mt-4 text-[14px] text-neutral-700">
              Your {profile.vehicle_model} is worth about <span className="font-bold text-black">{money(v.trade_in_estimate)}</span> as a trade-in, or{" "}
              <span className="font-bold text-black">{money(v.private_sale_estimate)}</span> sold privately.
            </p>
          )}
          {q.nearby_shops.length > 0 && (
            <p className="mt-2 text-[14px] text-neutral-700">
              <span className="text-neutral-500">Shops near you: </span>{q.nearby_shops.map((s) => s.name).join(" · ")}
            </p>
          )}
          <button onClick={() => setMode("upload")} className={`mt-2 text-left text-[14px] underline max-md:min-h-11 underline-offset-4 hover:text-[#EB0A1E] ${ring}`}>
            {repair.source === "manual" ? "Change my shop quote" : "Already have a shop quote? Upload it instead"}
          </button>
        </>
      )}

      {mode === "inspect" && (
        <>
          <h2 id="advisor-title" tabIndex={-1} className="text-[clamp(24px,2.2vw,30px)] font-extrabold leading-tight tracking-tight outline-none">Let&rsquo;s get it diagnosed</h2>
          <div className="mt-3 flex gap-3.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
            <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden><path d="M10 2.5 18 17H2L10 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8v4M10 14.3v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <div>
              <p className="text-[15px] font-bold text-amber-900">Inspection needed{q.classification.label ? ` · ${q.classification.label}` : ""}</p>
              <p className="text-[13px] leading-snug text-amber-900/80">
                This could be several different problems, so we can&rsquo;t price it from a description. A mechanic&rsquo;s diagnosis will give you a real quote.
              </p>
            </div>
          </div>
          <p className="mb-2 mt-4 text-[14px] font-bold">Get it checked near you</p>
          <ShopFinder shops={shops} />
        </>
      )}

      {mode === "upload" && (
        <>
          <h2 id="advisor-title" tabIndex={-1} className="text-[clamp(24px,2.2vw,30px)] font-extrabold leading-tight tracking-tight outline-none">Upload your mechanic&rsquo;s quote</h2>
          <p className="text-[15px] text-neutral-600">A photo or PDF works. We&rsquo;ll read the line items and total.</p>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
            className={`mt-3 flex h-[132px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition ${dragging ? "border-[#EB0A1E] bg-red-50/50" : "border-neutral-300 bg-neutral-50 hover:border-neutral-500"}`}>
            <input ref={fileInput} type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            {reading ? (
              <div className="w-64" aria-live="polite">
                <p className="truncate text-center text-[13px] font-semibold text-neutral-500">{reading.name}</p>
                <ul className="mt-2 space-y-1">
                  {READ_STEPS.map((s, i) => (
                    <li key={s} className={`flex items-center gap-2 text-[14px] ${i < reading.step ? "text-black" : "text-neutral-400"}`}>
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white ${i < reading.step ? "bg-emerald-600" : i === reading.step ? "animate-pulse bg-neutral-400" : "bg-neutral-200"}`}>{i < reading.step ? "✓" : ""}</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-neutral-500" aria-hidden><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <p className="mt-2 text-[15px]"><span className="font-bold underline underline-offset-4">Choose a file</span> or drag it here</p>
                <p className="text-[12px] text-neutral-500">PDF, JPG, or PNG</p>
              </>
            )}
          </label>
          <p role="status" className="mt-1.5 min-h-[18px] text-[13px] text-neutral-600">
            {uploadNote ?? (
              <a href="/demo/sample-mechanic-quote.pdf" download className={`inline-flex items-center max-md:min-h-11 gap-1.5 hover:text-[#EB0A1E] ${ring}`}>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Demo</span>
                <span className="underline underline-offset-4">Download the sample mechanic&rsquo;s quote</span>
              </a>
            )}
          </p>

          <div className="mt-2 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
            <span className="h-px flex-1 bg-neutral-200" /> or type the total <span className="h-px flex-1 bg-neutral-200" />
          </div>
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
            <MoneyInput label="" value={amount} onChange={(n) => setAmount(n == null ? null : Math.min(n, 100000))} />
            <label className="block">
              <span className="sr-only">Shop name (optional)</span>
              <input value={shop} onChange={(e) => setShop(e.target.value)} maxLength={200} placeholder="Shop name (optional)"
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-[16px] outline-none placeholder:text-neutral-500 focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800" />
            </label>
          </div>
        </>
      )}

      {mode === "review" && readQuote && (
        <>
          <h2 id="advisor-title" tabIndex={-1} className="text-[clamp(24px,2.2vw,30px)] font-extrabold leading-tight tracking-tight outline-none">Does this look right?</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200">
            <div className="flex items-start justify-between gap-4 bg-neutral-50 px-4 py-2.5">
              <div>
                <p className="text-[15px] font-bold">{readQuote.shop}</p>
                <p className="text-[12px] text-neutral-600">{readQuote.vehicle} · {readQuote.date}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="m2.5 6.3 2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Read from your quote
              </span>
            </div>
            <ul className="divide-y divide-neutral-100 px-4">
              {readQuote.items.map((it) => (
                <li key={it.description} className="flex justify-between gap-4 py-1 text-[13px]">
                  <span className="text-neutral-700">{it.description}</span>
                  <span className="tabular-nums">{money(it.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-2.5">
              <span className="text-[14px] font-bold">Quote total</span>
              <span className="text-[24px] font-extrabold tabular-nums">{money(readQuote.total)}</span>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-neutral-500">Diagnosis: {readQuote.diagnosis} Demo: sample quote recognized.</p>
        </>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-[#c8091a]">{error}</p>}
      {mode !== "review" && mode !== "upload" && (
        <p className="mt-3 text-[11px] leading-snug text-neutral-500">
          {q.disclaimer}{state.quoteMocked && " Demo mode: repair quote service offline, showing a sample estimate."}
        </p>
      )}
    </StepLayout>
  );
}
