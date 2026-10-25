// Turns an /analyze result into what the "Your options" page shows. Pure formatting: every
// number here comes from Ryan's KRT engine or the repair cost the customer confirmed.
import type { Analysis } from "@/lib/api";

export type OptionKey = "keep" | "trade" | "refinance";
export type OptionStatus = "best" | "over_budget" | "unavailable" | null;

export type OptionCard = {
  key: OptionKey;
  title: string;
  monthly: number | null; // null when the option doesn't apply
  status: OptionStatus;
  why: string;
  facts: string[];
};

export type KeyNumber = { value: string; label: string; warn?: boolean };

export type RepairInput = { low: number; high: number; label: string; isQuote: boolean; shop?: string | null };

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export const OPTION_TITLES: Record<OptionKey, string> = { keep: "Keep & repair", trade: "Trade in", refinance: "Refinance" };

export const verdict = (rec: OptionKey, car: string) =>
  ({ keep: `Repair your ${car}.`, trade: `Trade in your ${car}.`, refinance: `Refinance your ${car}.` })[rec];

export const planButton = (rec: OptionKey) =>
  ({ keep: "See your repair plan", trade: "See your trade-in plan", refinance: "See your refinance plan" })[rec];

const repairText = (r: RepairInput) => (r.low === r.high ? money(r.high) : `${money(r.low)}–${money(r.high)}`);

export function optionCards(a: Analysis, car: string, repair: RepairInput): OptionCard[] {
  const k = a.result;
  const rec = a.recommendation;
  const carValue = (a.market.current_vehicle_value_low + a.market.current_vehicle_value_high) / 2;
  const pct = Math.round(k.repair_ratio * 100);
  const life = Math.round(k.remaining_life * 100);
  const comfortable = a.affordability.max_comfortable_payment;
  const best = k.suggested_models[0];
  const noLoan = k.refi_payment === 0;

  const keep: OptionCard = {
    key: "keep",
    title: OPTION_TITLES.keep,
    monthly: k.keepResult,
    status: rec === "keep" ? "best" : null,
    why: rec === "keep"
      ? (k.trade_affordable ? `The repair is about ${pct}% of what your ${car} is worth, so fixing it pays off.`
        : "A contained repair keeps you on the road without taking on a new car payment.")
      : rec === "trade"
        ? `Cheaper each month, but you'd put ${money(repair.high)} into a car worth ${money(carValue)} with about ${life}% of its life left.`
        : "Same car, but you keep paying your current loan rate.",
    facts: [
      `${repair.isQuote ? "Repair quote" : "Repair estimate"}: ${repairText(repair)}`,
      `${pct}% of your ${car}'s ${money(carValue)} value`,
      k.pr_runway < 0 ? "Costs more than your savings right now"
        : `Leaves about ${k.pr_runway.toFixed(1)} months of savings`,
      `About ${life}% of its life left`,
    ],
  };

  const trade: OptionCard = {
    key: "trade",
    title: OPTION_TITLES.trade,
    monthly: k.tradeResult,
    status: rec === "trade" ? "best" : k.trade_affordable ? null : "over_budget",
    why: rec === "trade"
      ? `The repair costs ${pct >= 100 ? "more than" : `about ${pct}% of`} what your ${car} is worth, and a new Toyota fits your budget.`
      : k.trade_affordable ? `About ${money(k.tradeResult)}/mo all in for a ${best?.name ?? "new Toyota"}.`
        : "A new car payment doesn't fit your budget right now.",
    facts: best ? [
      `${best.name} · ${best.kind === "new" ? "New" : best.kind === "cpo" ? "Certified pre-owned" : "Used"} · ${money(best.price)}`,
      `About ${money(best.new_payment)}/mo loan payment with ${money(best.down_payment)} down`,
      `Your ${car}'s trade-in value goes toward it`,
      k.trade_affordable ? `Under your comfortable payment of ${money(comfortable)}/mo`
        : comfortable > 0 ? `Over your comfortable payment of ${money(comfortable)}/mo`
          : `You have about ${money(a.affordability.monthly_surplus)} left over each month`,
    ] : [],
  };

  const refinance: OptionCard = noLoan
    ? {
        key: "refinance",
        title: OPTION_TITLES.refinance,
        monthly: null,
        status: "unavailable",
        why: `Your ${car} is paid off, so there's no loan to refinance.`,
        facts: ["No loan balance on this car", "Refinancing only helps if you still owe on the car"],
      }
    : {
        key: "refinance",
        title: OPTION_TITLES.refinance,
        monthly: k.refinanceResult,
        status: rec === "refinance" ? "best" : null,
        why: `Keep your ${car} and lower your loan payment to about ${money(k.refi_payment)}/mo.`,
        facts: [
          `New loan payment: about ${money(k.refi_payment)}/mo`,
          `All in: about ${money(k.refinanceResult)}/mo, compared with ${money(k.keepResult)}/mo on your current loan`,
          `Repair estimate: ${repairText(repair)}`,
        ],
      };

  const byKey = { keep, trade, refinance };
  const order: OptionKey[] = [rec, ...(["keep", "trade", "refinance"] as OptionKey[]).filter((x) => x !== rec)];
  return order.map((x) => byKey[x]);
}

export function keyNumbers(a: Analysis, repair: RepairInput): KeyNumber[] {
  const k = a.result;
  return [
    { value: repairText(repair), label: repair.isQuote ? (repair.shop ? `Quote from ${repair.shop}` : "Your shop quote") : `${repair.label} estimate` },
    { value: `${Math.round(k.repair_ratio * 100)}%`, label: "Repair compared with car value" },
    k.pr_runway < 0
      ? { value: "Not enough", label: "Savings don't cover the repair", warn: true }
      : { value: `About ${k.pr_runway.toFixed(1)} months`, label: "Savings left after repair" },
    { value: `About ${Math.round(k.remaining_life * 100)}%`, label: "Car life left" },
  ];
}
