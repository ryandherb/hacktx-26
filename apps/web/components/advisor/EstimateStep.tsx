"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/api";
import type { AdvisorState } from "@/lib/advisor/state";
import { getQuote } from "@/lib/advisor/service";
import { zipCenter } from "@/lib/demo/shops";
import { ring } from "./AdvisorPanel";
import { MoneyInput, StepLayout } from "./controls";
import ShopFinder from "./ShopFinder";
import StepFooter from "./StepFooter";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
// The quote upload is a mockup for now: any click "uploads" this file, then we ask for the total.
const DEMO_FILE = { name: "mechanic-quote.pdf", size: "248 KB" };

type Mode = "summary" | "inspect" | "upload";
type Props = { profile: Profile; state: AdvisorState; update: (p: Partial<AdvisorState>) => void };

// Step 1b, driven by the Cost Agent (issue #2):
// - quotable repair  -> "summary": estimate range, car value, nearby shops
// - symptom only     -> "inspect": inspection needed + Toyota dealers on a map to get it diagnosed
// - then "upload" the mechanic's quote (mock PDF upload) and type its total -> apply it.
export default function EstimateStep({ profile, state, update }: Props) {
  const q = state.quote;
  const [mode, setMode] = useState<Mode>(q?.repair ? "summary" : "inspect");
  const [amount, setAmount] = useState<number | null>(state.manualQuote?.amount ?? null);
  const [shop, setShop] = useState(state.manualQuote?.shop ?? "");
  const [upload, setUpload] = useState<"idle" | "uploading" | "done">(state.manualQuote ? "done" : "idle");
  const [progress, setProgress] = useState(0);
  const [dealer, setDealer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => {
    if (upload !== "uploading" || progress < 100) return;
    if (timer.current) clearInterval(timer.current);
    const t = setTimeout(() => setUpload("done"), 250);
    return () => clearTimeout(t);
  }, [upload, progress]);

  if (!q) return null;
  const repair = q.repair;
  const v = q.vehicle;

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

  const fakeUpload = () => {
    if (upload !== "idle") return;
    setUpload("uploading");
    setProgress(0);
    timer.current = setInterval(() => {
      setProgress((p) => Math.min(100, p + 9 + Math.random() * 14));
    }, 160);
  };

  const toUpload = () => {
    if (!shop && dealer) setShop(dealer);
    setMode("upload");
  };

  const toSituation = () => update({ step: "situation", situationCard: 0, bankModal: !state.bank });
  const footers: Record<Mode, React.ReactNode> = {
    summary: <StepFooter step={1} onBack={() => update({ step: "problem" })} disabled={!q.complete} onContinue={toSituation} />,
    inspect: <StepFooter step={1} onBack={() => update({ step: "problem" })} continueLabel="I have my quote" onContinue={toUpload} />,
    upload: (
      <StepFooter step={1} onBack={() => setMode(repair ? "summary" : "inspect")} busy={sending}
        disabled={upload !== "done" || amount == null || amount <= 0} continueLabel="Use this quote"
        onContinue={() => amount != null && applyQuote(amount, shop.trim() || null)} />
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
                {q.classification.reason}
              </p>
            </div>
          </div>
          <p className="mb-2 mt-4 text-[14px] font-bold">Get it checked at a Toyota dealer near you</p>
          <ShopFinder origin={zipCenter(profile.zip_code)} onSelect={setDealer} />
        </>
      )}

      {mode === "upload" && (
        <>
          <h2 id="advisor-title" tabIndex={-1} className="text-[clamp(24px,2.2vw,30px)] font-extrabold leading-tight tracking-tight outline-none">Upload your mechanic&rsquo;s quote</h2>
          <p className="text-[15px] text-neutral-600">Add the PDF your shop gave you, then confirm the total.</p>

          {upload === "idle" ? (
            <button onClick={fakeUpload}
              className={`mt-3 flex h-[120px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 transition hover:border-neutral-500 ${ring}`}>
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-neutral-500" aria-hidden><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="mt-2 text-[15px]"><span className="font-bold underline underline-offset-4">Upload PDF</span></span>
              <span className="text-[12px] text-neutral-500">Your mechanic&rsquo;s written quote</span>
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3" aria-live="polite">
              <span className="flex h-10 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-[10px] font-extrabold text-[#c8091a]">PDF</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{DEMO_FILE.name}</p>
                {upload === "uploading" ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                    <div className="h-full rounded-full bg-[#EB0A1E] transition-[width] duration-200" style={{ width: `${progress}%` }} />
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="m2.5 6.3 2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Uploaded · {DEMO_FILE.size}
                  </p>
                )}
              </div>
              {upload === "done" && (
                <button onClick={() => setUpload("idle")} className={`text-[13px] text-neutral-500 underline max-md:min-h-11 underline-offset-4 hover:text-[#EB0A1E] ${ring}`}>Remove</button>
              )}
            </div>
          )}

          {upload === "done" && (
            <>
              <p className="mt-4 text-[14px] font-bold">What&rsquo;s the total on your quote?</p>
              <p className="text-[13px] text-neutral-600">We can&rsquo;t read quotes automatically yet, so type the total and shop from the PDF.</p>
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
                <MoneyInput label="" ariaLabel="Quote total in dollars" value={amount} onChange={(n) => setAmount(n == null ? null : Math.min(n, 100000))} />
                <label className="block">
                  <span className="sr-only">Shop name (optional)</span>
                  <input value={shop} onChange={(e) => setShop(e.target.value)} maxLength={200} placeholder="Shop name (optional)"
                    className="mt-1.5 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-[16px] outline-none placeholder:text-neutral-500 focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800" />
                </label>
              </div>
            </>
          )}
        </>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-[#c8091a]">{error}</p>}
      {mode !== "upload" && (
        <p className="mt-3 text-[11px] leading-snug text-neutral-500">
          {q.disclaimer}{state.quoteMocked && " Demo mode: repair quote service offline, showing a sample estimate."}
        </p>
      )}
    </StepLayout>
  );
}
