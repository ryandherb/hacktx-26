"use client";

import { useState } from "react";
import type { Analysis, Profile } from "@/lib/api";
import { startCarFund } from "@/lib/advisor/service";
import { whatWouldChange } from "@/lib/advisor/results";
import { SAMPLE_QUOTE_DOCS } from "@/lib/demo/answers";
import { carPhoto } from "@/lib/demo/carPhotos";
import { zipCenter } from "@/lib/demo/shops";
import ShopFinder from "@/components/advisor/ShopFinder";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const KIND: Record<string, string> = { new: "New", cpo: "Certified pre-owned", used: "Used" };

// "Your repair plan" (recommendation = keep): the repair, where to get it done, how to cover
// it, a Car Fund for the next car, and the car to revisit later. Numbers come from /analyze.
export default function RepairPlan({ result, profile }: { result: Analysis; profile: Profile }) {
  const r = result.repair;
  const afford = result.affordability;
  const later = result.result.suggested_models[0];
  const isQuote = r?.source === "manual";
  const doc = isQuote ? SAMPLE_QUOTE_DOCS.find((d) => d.shop === r?.shop && d.amount === r?.repair_cost_high) : undefined;
  const cost = r?.repair_cost_high ?? 0;
  const short = Math.max(0, cost - afford.savings_balance);
  // Save what's left over each month; aim for a 20% down payment on the car to revisit.
  const monthly = Math.max(25, Math.round(afford.monthly_surplus / 5) * 5);
  const target = later ? Math.round((later.price * 0.2) / 100) * 100 : 3000;
  const [fund, setFund] = useState<{ simulated: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const openFund = async () => {
    setSaving(true);
    const f = await startCarFund(profile.id, monthly, target).catch(() => null);
    setSaving(false);
    if (f) setFund({ simulated: f.data.simulated || f.mocked });
  };

  return (
    <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3 max-lg:contents">
        <section aria-label="The repair" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-neutral-200 px-5 py-3">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full bg-emerald-600 text-sm font-bold text-white">✓</span>
          <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-3rem)]">
            <p className="text-[14px] font-semibold text-neutral-600">{isQuote ? "Uploaded mechanic's quote" : "Repair estimate"}</p>
            <p className="text-[22px] font-extrabold leading-tight">{doc?.title ?? r?.label ?? "Repair"}</p>
            {r?.shop && <p className="text-[14px] text-neutral-600">{r.shop}</p>}
          </div>
          <p className="text-[34px] font-extrabold tracking-tight md:border-l md:border-neutral-200 md:pl-6">
            {r && r.repair_cost_low !== r.repair_cost_high ? `${money(r.repair_cost_low)}–${money(r.repair_cost_high)}` : money(cost)}
          </p>
          {doc && (
            <a href={doc.href} target="_blank" rel="noopener noreferrer"
              className={`rounded-full border-2 border-black px-6 py-2 font-bold hover:bg-neutral-50 ${ring}`}>View quote</a>
          )}
        </section>

        <section aria-labelledby="fix-title" className="rounded-2xl border border-neutral-200 px-5 py-3">
          <h2 id="fix-title" className="text-[20px] font-extrabold">Where to get it fixed</h2>
          <p className="mb-2 text-[13px] text-neutral-500">Nearest Toyota service centers · verify hours before you go</p>
          <ShopFinder origin={zipCenter(profile.zip_code)} />
        </section>
        <section aria-labelledby="change-title" className="px-1 max-lg:order-last">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-1">
            <div>
              <h2 id="change-title" className="text-[15px] font-bold">What would change this?</h2>
              <ul className="text-[13px] text-neutral-700 md:flex md:gap-8">
                {whatWouldChange(result).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
            <p className="text-xs text-neutral-500">Estimates, not financial advice.</p>
          </div>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <section aria-labelledby="cover-title" className="rounded-2xl bg-neutral-100 px-5 py-3">
          <h2 id="cover-title" className="text-[18px] font-extrabold">Covering the cost</h2>
          <dl className="mt-1 space-y-0.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-neutral-600">{isQuote ? "Repair quote" : "Repair estimate"}</dt><dd className="font-semibold">{money(cost)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Your savings</dt><dd className="font-semibold">{money(afford.savings_balance)}</dd></div>
            <div className="flex justify-between border-t border-neutral-300 pt-1.5">
              <dt className="font-bold">{short > 0 ? "Amount still needed" : "Left after the repair"}</dt>
              <dd className={`text-[20px] font-extrabold ${short > 0 ? "text-[#b45309]" : ""}`}>{money(short > 0 ? short : afford.savings_balance - cost)}</dd>
            </div>
          </dl>
          {short > 0 && (
            <p className="mt-1.5 flex items-start gap-2 text-[13px] text-neutral-700">
              <span aria-hidden className="text-[#b45309]">⚠</span> You&rsquo;re about {money(short)} short. Plan for the gap before booking.
            </p>
          )}
        </section>

        <section aria-labelledby="fund-title" className="relative overflow-hidden rounded-2xl border border-neutral-200 px-5 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/advisor/guide-savings.png" alt="" className="absolute bottom-1 right-2 h-[104px] w-[96px] object-contain mix-blend-multiply" />
          <h2 id="fund-title" className="pr-24 text-[18px] font-extrabold leading-tight">A little now. Your next car later.</h2>
          <p className="pr-24 text-[14px] text-neutral-700">Set aside {money(monthly)}/mo toward a {money(target)} down payment.</p>
          <p className="pr-24 text-[12px] text-neutral-500">Simulated savings account · Connected bank</p>
          {fund ? (
            <p role="status" className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-[14px] font-bold text-emerald-800">
              ✓ Car Fund started · {money(monthly)}/mo{fund.simulated && " (simulated)"}
            </p>
          ) : (
            <button onClick={openFund} disabled={saving}
              className={`mt-2 inline-flex items-center gap-2 rounded-full bg-[#EB0A1E] px-6 py-2.5 font-bold text-white hover:bg-[#c8091a] disabled:opacity-60 ${ring}`}>
              {saving ? "Starting…" : "Start my Car Fund"} <span aria-hidden>→</span>
            </button>
          )}
        </section>

        {later && (
          <section aria-labelledby="later-title" className="rounded-2xl border border-neutral-200 px-5 py-3">
            <h2 id="later-title" className="text-[18px] font-extrabold">When your income returns</h2>
            <div className="mt-1.5 flex gap-4">
              {carPhoto(later.name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={carPhoto(later.name)!} alt={`Toyota ${later.name}`} className="h-[76px] w-[140px] shrink-0 object-contain" />
              ) : (
                <div className="flex h-[76px] w-[140px] shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-[11px] text-neutral-500">Photo coming</div>
              )}
              <div className="min-w-0">
                <p className="text-[12px] text-neutral-500">{[KIND[later.kind] ?? later.kind, later.name.match(/^\d{4}/)?.[0]].filter(Boolean).join(" · ")}</p>
                <p className="font-bold leading-tight">Toyota {later.name.replace(/^\d{4} /, "")}</p>
                <p className="text-[13px] text-neutral-600">{money(later.price)}</p>
                <p className="text-[22px] font-extrabold leading-tight">{money(later.new_payment)}<span className="text-[14px] font-semibold">/mo</span></p>
                <p className="text-[12px] text-neutral-500">est. loan payment</p>
              </div>
            </div>
          </section>
        )}
      </div>

    </div>
  );
}
