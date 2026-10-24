"use client";

import { useEffect, useState } from "react";
import CostChart from "@/components/CostChart";
import {
  analyze,
  createCarFund,
  getProfiles,
  type Analysis,
  type CarFund,
  type Profile,
} from "@/lib/api";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function Home() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [fund, setFund] = useState<CarFund | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfiles()
      .then((p) => {
        setProfiles(p);
        if (p.length) setSelected(p[0].id);
      })
      .catch((e) => setError(`Could not reach the API: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setFund(null);
    analyze(selected)
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selected]);

  const profile = profiles.find((p) => p.id === selected);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold">Next Move</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Keep it, repair it, or replace it, and when you can afford to.
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-400 p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              p.id === selected ? "bg-blue-600 text-white" : ""
            }`}
            style={{ borderColor: "var(--border)" }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {profile && (
        <section className="rounded-lg border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="font-medium">
            {profile.vehicle_year} Toyota {profile.vehicle_model}
          </h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {profile.mileage.toLocaleString()} miles · ZIP {profile.zip_code}
            {profile.open_issue ? ` · Issue: ${profile.open_issue}` : ""}
          </p>
        </section>
      )}

      {loading && <p className="text-sm">Analyzing…</p>}

      {result && !loading && (
        <>
          <section className="rounded-lg border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="mb-1 font-medium">
              Recommendation: {result.recommendation.replace("_", " ")}
            </h2>
            <p className="mb-4 text-sm">{result.explanation}</p>
            <CostChart curve={result.curve} crossover={result.crossover_month} />
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-lg border p-4 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h2 className="mb-2 font-medium">Affordability (from Nessie)</h2>
              <ul className="space-y-1">
                <li>Income: {money(result.affordability.monthly_income)}/mo</li>
                <li>Spending: {money(result.affordability.monthly_spend)}/mo</li>
                <li>Savings: {money(result.affordability.savings_balance)}</li>
                <li>Runway: {result.affordability.runway_months} months</li>
                <li>
                  Comfortable payment: {money(result.affordability.max_comfortable_payment)}/mo
                </li>
              </ul>
              <button
                className="mt-3 rounded bg-green-600 px-3 py-1.5 text-white"
                onClick={() =>
                  createCarFund(selected, 300, 5000)
                    .then(setFund)
                    .catch((e) => setError(e.message))
                }
              >
                Start a Car Fund
              </button>
              {fund && (
                <p className="mt-2">
                  Car Fund created ({fund.simulated ? "simulated" : "live"}): {money(fund.monthly_amount)}
                  /mo toward {money(fund.target_amount)}.
                </p>
              )}
            </section>

            <section className="rounded-lg border p-4 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h2 className="mb-2 font-medium">Market (from SerpApi)</h2>
              <p>
                Current car value: {money(result.market.current_vehicle_value_low)}–
                {money(result.market.current_vehicle_value_high)}
              </p>
              <h3 className="mt-3 font-medium">Replacement options</h3>
              <ul>
                {result.market.replacement_options.map((o) => (
                  <li key={o.name}>
                    {o.name}: {money(o.price)} ({o.kind})
                  </li>
                ))}
              </ul>
              <h3 className="mt-3 font-medium">Repair quotes</h3>
              <ul>
                {result.market.repair_quotes.map((q) => (
                  <li key={q.shop}>
                    {q.shop}: {money(q.estimate)}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Synthetic data. Estimates only, not financial advice.
          </p>
        </>
      )}
    </main>
  );
}
