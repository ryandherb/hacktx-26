// Turns an /analyze result into what the "Your options" page shows. Pure formatting: numbers
// come from Ryan's KRT engine and the Cost Agent quote it scored; the words for each option
// come from Eni's Explanation Agent (option_explanations).
import type { Analysis } from "@/lib/api";
import type { OptionId } from "./service";

export type OptionStatus = "best" | "over_budget" | "unavailable" | null;

export type OptionCard = {
  key: OptionId;
  title: string;
  monthly: number | null; // null when the option doesn't apply
  status: OptionStatus;
  brief: string;
  details: string;
};

export type KeyNumber = { value: string; label: string; warn?: boolean };

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export const OPTION_TITLES: Record<OptionId, string> = { keep: "Keep & repair", trade: "Trade in", refinance: "Refinance" };

export const verdict = (rec: OptionId, car: string) =>
  ({ keep: `Repair your ${car}.`, trade: `Trade in your ${car}.`, refinance: `Refinance your ${car}.` })[rec];

export const planButton = (rec: OptionId) =>
  ({ keep: "See your repair plan", trade: "See your trade-in plan", refinance: "See your refinance plan" })[rec];

export function optionCards(a: Analysis): OptionCard[] {
  const k = a.result;
  const rec = a.recommendation;
  const noLoan = k.refi_payment === 0;
  const monthly: Record<OptionId, number | null> = { keep: k.keepResult, trade: k.tradeResult, refinance: noLoan ? null : k.refinanceResult };
  const status = (key: OptionId): OptionStatus =>
    key === rec ? "best"
      : key === "refinance" && noLoan ? "unavailable"
        : key === "trade" && !k.trade_affordable ? "over_budget"
          : null;
  const order: OptionId[] = [rec, ...(["keep", "trade", "refinance"] as OptionId[]).filter((x) => x !== rec)];
  return order.map((key) => ({
    key,
    title: OPTION_TITLES[key],
    monthly: monthly[key],
    status: status(key),
    brief: a.option_explanations?.[key]?.brief ?? "",
    details: a.option_explanations?.[key]?.details ?? "",
  }));
}

export function keyNumbers(a: Analysis): KeyNumber[] {
  const k = a.result;
  const r = a.repair;
  const repair: KeyNumber = !r
    ? { value: "—", label: "Repair estimate" }
    : r.source === "manual"
      ? { value: money(r.repair_cost_high), label: r.shop ? `Quote from ${r.shop}` : "Your shop quote" }
      : { value: `${money(r.repair_cost_low)}–${money(r.repair_cost_high)}`, label: `${r.label} estimate` };
  return [
    repair,
    { value: `${Math.round(k.repair_ratio * 100)}%`, label: "Repair compared with car value" },
    k.pr_runway < 0
      ? { value: "Not enough", label: "Savings don't cover the repair", warn: true }
      : { value: `About ${k.pr_runway.toFixed(1)} months`, label: "Savings left after repair" },
    { value: `About ${Math.round(k.remaining_life * 100)}%`, label: "Car life left" },
  ];
}

// Conditions that would flip the recommendation, from the same numbers the engine used
// (the 50% rule and the affordability check in simulate.set_recommendation).
export function whatWouldChange(a: Analysis): string[] {
  const k = a.result;
  if (a.recommendation === "trade") {
    const half = a.car_value ? ` (about ${money(a.car_value / 2)})` : "";
    return [`If the repair came in under half your car's value${half}, keeping it would win.`,
      "If your income drops, repairing becomes the safer choice."];
  }
  if (a.recommendation === "keep") {
    return [
      k.trade_affordable ? "If the repair grows past half your car's value, trading in gains ground."
        : "A steady full-time income would make trading in realistic.",
      "If more big repairs come up, replacing the car gains ground.",
    ];
  }
  return ["If rates rise before you refinance, the savings shrink.", "A large repair on top of the loan could make trading in the better move."];
}
