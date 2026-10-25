"use client";

import { useState } from "react";
import type { Analysis, Profile, SuggestedModel } from "@/lib/api";
import { whatWouldChange } from "@/lib/advisor/results";
import { carPage, carPhoto } from "@/lib/demo/carPhotos";
import { directionsUrl, nearestDealers, zipCenter } from "@/lib/demo/shops";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const KIND: Record<string, string> = { new: "New", cpo: "Certified pre-owned", used: "Used" };
const BODY: Record<string, string> = { sedan: "Sedan", suv: "SUV", hatchback: "Hatchback", minivan: "Minivan", truck: "Truck" };
const HORIZON_MONTHS = 36; // the engine spreads the down payment over its 3-year horizon (krt.HORIZON)
const LOAN_MONTHS = 60; // krt.LOAN_TERM_MONTHS
const year = (m: SuggestedModel) => m.name.match(/^\d{4}/)?.[0] ?? "";
const model = (m: SuggestedModel) => m.name.replace(/^\d{4} /, "");
const delta = (n: number) => `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
const reasons = (m: SuggestedModel) =>
  m.reason.split(";").map((r) => r.trim()).filter(Boolean).map((r) => r[0].toUpperCase() + r.slice(1));

// "Your trade-in plan" (recommendation = trade): the engine's top picks with photos, what each
// costs per month and why, the current car's trade-in value, and next steps. Numbers come from
// /analyze (Ryan's KRT engine); picking another car swaps the hero card.
export default function TradePlan({ result, profile }: { result: Analysis; profile: Profile }) {
  const picks = result.result.suggested_models.slice(0, 3);
  const [sel, setSel] = useState(0);
  const car = picks[sel] ?? picks[0];
  if (!car) return null;

  const tradeIn = result.car_value ?? 0;
  const financed = Math.max(0, car.price - car.down_payment - tradeIn);
  const spreadDown = car.down_payment / HORIZON_MONTHS;
  const parts = car.new_payment + car.insurance_delta + car.fuel_delta + spreadDown;
  const cushion = car.monthly_cost - parts; // the engine's margin for income/debt risk, if any
  const comfortable = result.affordability.max_comfortable_payment;
  const dealer = nearestDealers(zipCenter(profile.zip_code), 1)[0];
  const photo = carPhoto(car.name);

  return (
    <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3 max-lg:contents">
        {/* Hero: the selected pick */}
        <section aria-labelledby="pick-title" className={`grid grid-cols-1 gap-x-5 rounded-2xl border-2 px-5 py-4 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] ${sel === 0 ? "border-[#EB0A1E] shadow-[0_12px_32px_rgba(235,10,30,0.10)]" : "border-neutral-900"}`}>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2.5 py-1 text-[12px] font-bold text-white ${sel === 0 ? "bg-[#EB0A1E]" : "bg-neutral-900"}`}>{sel === 0 ? "Best fit" : "Your pick"}</span>
              <span className="rounded-md bg-neutral-100 px-2.5 py-1 text-[12px] font-bold text-neutral-700">{KIND[car.kind] ?? car.kind} · {year(car)}</span>
            </div>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo} src={photo} alt={`Toyota ${car.name}`} className="mt-1 h-[150px] w-full object-contain" />
            ) : (
              <div className="mt-1 flex h-[150px] items-center justify-center rounded-xl bg-neutral-100 text-xs text-neutral-500">Photo coming</div>
            )}
            <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-neutral-600">
              <li><span className="font-bold text-black">{car.mpg}</span> MPG</li>
              <li><span className="font-bold text-black">{car.seats}</span> seats</li>
              <li>{BODY[car.body] ?? car.body}</li>
            </ul>
          </div>

          <div className="flex min-w-0 flex-col">
            <h2 id="pick-title" className="text-[24px] font-extrabold leading-tight">Toyota {model(car)}</h2>
            <p className="text-[15px] text-neutral-600">{money(car.price)} MSRP</p>
            <p className="mt-1.5 leading-none">
              <span className="text-[40px] font-extrabold tracking-tight">{money(car.monthly_cost)}</span>
              <span className="text-lg text-neutral-600"> /mo</span>
              <span className="ml-2 text-[13px] text-neutral-500">estimated total</span>
            </p>
            <p className="mt-1.5 text-[14px] text-neutral-700">
              <span className="font-bold text-black">{money(car.new_payment)}/mo</span> loan · {money(car.down_payment)} down + your {profile.vehicle_model}
            </p>
            <ul className="mt-2 space-y-0.5 text-[14px] text-neutral-800">
              {reasons(car).map((r) => <li key={r} className="flex gap-1.5"><span aria-hidden className="text-[#EB0A1E]">✓</span>{r}</li>)}
            </ul>
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              {dealer && (
                <a href={directionsUrl(dealer)} target="_blank" rel="noopener noreferrer" title={`${dealer.name} · ~${dealer.distanceMi.toFixed(1)} mi`}
                  className={`inline-flex items-center gap-2 rounded-full bg-[#EB0A1E] px-5 py-2.5 text-[15px] font-bold text-white hover:bg-[#c8091a] ${ring}`}>
                  Find one near me <span aria-hidden>→</span>
                </a>
              )}
              <a href={carPage(car.name)} target="_blank" rel="noopener noreferrer"
                className={`rounded-full border-2 border-black px-5 py-2 text-[15px] font-bold hover:bg-neutral-50 ${ring}`}>Build &amp; price</a>
            </div>
          </div>
        </section>

        {/* The other picks; choosing one swaps the hero */}
        <section aria-labelledby="others-title">
          <h2 id="others-title" className="sr-only">Other good fits</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {picks.map((m, i) => i === sel ? null : (
              <button key={m.name} onClick={() => setSel(i)} aria-label={`Show Toyota ${m.name}`}
                className={`group flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-left transition hover:border-neutral-900 hover:bg-white ${ring}`}>
                {carPhoto(m.name) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={carPhoto(m.name)!} alt="" className="h-[56px] w-[104px] shrink-0 object-contain transition-transform group-hover:scale-105" />
                ) : <span className="h-[56px] w-[104px] shrink-0 rounded-lg bg-neutral-100" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">{i === 0 ? "Best fit" : "Also fits"} · {KIND[m.kind] ?? m.kind}</span>
                  <span className="block text-[15px] font-bold sm:truncate">Toyota {model(m)}</span>
                  <span className="block text-[13px] text-neutral-600">
                    <span className="font-bold text-black">{money(m.monthly_cost)}</span>/mo · {m.mpg} MPG
                  </span>
                </span>
                <span aria-hidden className="text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-black">→</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="change-title" className="px-1 max-lg:order-last">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-1">
            <div>
              <h2 id="change-title" className="text-[15px] font-bold">What would change this?</h2>
              <ul className="text-[13px] text-neutral-700">
                {whatWouldChange(result).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
            <p className="text-xs text-neutral-500">Estimates, not financial advice.</p>
          </div>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <section aria-labelledby="tradein-title" className="rounded-2xl bg-neutral-100 px-5 py-3">
          <h2 id="tradein-title" className="text-[18px] font-extrabold">Your {profile.vehicle_model}&rsquo;s trade-in</h2>
          <p className="text-[34px] font-extrabold leading-tight tracking-tight">{money(tradeIn)}</p>
          <p className="text-[13px] text-neutral-600">
            Estimated trade-in value. It goes toward your new car, so you skip the {money(result.repair?.repair_cost_high ?? 0)} repair.
          </p>
        </section>

        <section aria-labelledby="cost-title" className="rounded-2xl border border-neutral-200 px-5 py-3">
          <h2 id="cost-title" className="text-[18px] font-extrabold">Your monthly cost</h2>
          <dl className="mt-1 space-y-0.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-neutral-600">Loan payment</dt><dd className="font-semibold">{money(car.new_payment)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Insurance change</dt><dd className="font-semibold">{delta(car.insurance_delta)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Gas change</dt><dd className={`font-semibold ${car.fuel_delta < 0 ? "text-emerald-700" : ""}`}>{delta(car.fuel_delta)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Down payment, spread over 3 years</dt><dd className="font-semibold">{money(spreadDown)}</dd></div>
            {cushion >= 1 && (
              <div className="flex justify-between"><dt className="text-neutral-600">Cushion for your situation</dt><dd className="font-semibold">{money(cushion)}</dd></div>
            )}
            <div className="flex items-baseline justify-between border-t border-neutral-300 pt-1.5">
              <dt className="font-bold">Estimated total</dt>
              <dd className="text-[22px] font-extrabold">{money(car.monthly_cost)}<span className="text-[13px] font-semibold">/mo</span></dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="loan-title" className="rounded-2xl border border-neutral-200 px-5 py-3">
          <h2 id="loan-title" className="text-[18px] font-extrabold">The loan</h2>
          <dl className="mt-1 space-y-0.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-neutral-600">Amount financed</dt><dd className="font-semibold">{money(financed)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Term{result.apr != null && " and rate"}</dt><dd className="font-semibold">{LOAN_MONTHS / 12} years{result.apr != null && ` · ${(result.apr * 100).toFixed(1)}% APR`}</dd></div>
          </dl>
          <p className={`mt-1.5 flex items-start gap-2 text-[13px] ${car.new_payment <= comfortable ? "text-emerald-800" : "text-[#b45309]"}`}>
            <span aria-hidden>{car.new_payment <= comfortable ? "✓" : "⚠"}</span>
            {car.new_payment <= comfortable
              ? `Under your comfortable payment of ${money(comfortable)}/mo.`
              : `Over your comfortable payment of ${money(comfortable)}/mo.`}
          </p>
        </section>
      </div>
    </div>
  );
}
