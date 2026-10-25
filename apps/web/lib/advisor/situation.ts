import type { CreditBand, IncomeStability, Level, PfoAnswers } from "@/lib/api";

// "Your situation" questions. toPfoAnswers() at the bottom turns them into the PFO Agent's
// answers for POST /onboarding.

export type LifeChange = "new_job" | "graduating" | "internship" | "moving" | "none";

export type SituationAnswers = {
  life_change: LifeChange[];
  job_start: string | null;
  expected_take_home: number | null; // USD per month
  internship_duration: string | null;
  moving_cost: number | null; // USD, one-time
  keep_horizon: string | null;
  down_payment: number | null; // USD
  credit_band: string | null;
  car_reliance: string | null;
  // Free-text "other details" per question; on choice questions it also counts as an answer.
  notes: Partial<Record<CardId, string>>;
};

export const EMPTY_SITUATION: SituationAnswers = {
  life_change: [],
  job_start: null,
  expected_take_home: null,
  internship_duration: null,
  moving_cost: null,
  keep_horizon: null,
  down_payment: null,
  credit_band: null,
  car_reliance: null,
  notes: {},
};

export const LIFE_CHANGES: { id: LifeChange; label: string }[] = [
  { id: "new_job", label: "Starting a new job" },
  { id: "graduating", label: "Graduating" },
  { id: "internship", label: "Unpaid internship" },
  { id: "moving", label: "Moving" },
  { id: "none", label: "Nothing big" },
];

export const JOB_START = ["Within a month", "1–3 months", "3–6 months", "6+ months"];
export const INTERNSHIP_DURATION = ["1–3 months", "3–6 months", "6+ months"];
export const KEEP_HORIZON = ["Under 1 year", "1–3 years", "3+ years", "As long as it runs"];
export const CREDIT_BANDS = ["Below 580", "580–669", "670–739", "740+"];
export const CAR_RELIANCE = ["Daily commute", "A few times a week", "Rarely"];
export const DOWN_PAYMENT_MAX = 15000;

export type CardId = "bank" | "life_change" | "life_details" | "keep_horizon" | "down_payment" | "credit_band" | "car_reliance" | "review";

// Which fields each card owns. "Insert demo answer" fills only these.
export const CARD_FIELDS: Record<Exclude<CardId, "review" | "bank">, (keyof SituationAnswers)[]> = {
  life_change: ["life_change"],
  life_details: ["job_start", "expected_take_home", "internship_duration", "moving_cost"],
  keep_horizon: ["keep_horizon"],
  down_payment: ["down_payment"],
  credit_band: ["credit_band"],
  car_reliance: ["car_reliance"],
};

const needsDetails = (a: SituationAnswers) => a.life_change.some((c) => c === "new_job" || c === "internship" || c === "moving");

// With a bank connected, the cash question is answered from the bank, so its card is skipped.
export function cardsFor(a: SituationAnswers, bankConnected = false): CardId[] {
  return ["bank", "life_change", ...(needsDetails(a) ? (["life_details"] as const) : []), "keep_horizon", ...(bankConnected ? [] : (["down_payment"] as const)), "credit_band", "car_reliance", "review"];
}

// Choice questions that show an "Other details" box; typing there can stand in for picking an option.
export const OTHER_DETAILS_CARDS: CardId[] = ["life_change", "life_details", "keep_horizon", "credit_band", "car_reliance"];

export function cardComplete(card: CardId, a: SituationAnswers): boolean {
  if (card !== "life_details" && a.notes[card]?.trim()) return true;
  switch (card) {
    case "life_change": return a.life_change.length > 0;
    case "life_details":
      return (!a.life_change.includes("new_job") || (!!a.job_start && a.expected_take_home != null))
        && (!a.life_change.includes("internship") || !!a.internship_duration)
        && (!a.life_change.includes("moving") || a.moving_cost != null);
    case "down_payment": return a.down_payment != null;
    case "review": case "bank": return true; // bank completion is checked against advisor state
    default: return a[card] != null;
  }
}

// ---- "Your situation" answers -> PFO Agent answers (POST /onboarding) ----------------------
// Plain lookups, no math. Questions the cards don't ask get a neutral default.
// scripts/export_demo_snapshot.py (apps/api) mirrors this for the offline demo snapshot.

const CREDIT_TO_BAND: Record<string, CreditBand> = {
  "740+": "excellent",
  "670–739": "good",
  "580–669": "fair",
  "Below 580": "poor",
};

const RELIANCE_TO_USAGE: Record<string, Level> = {
  "Daily commute": "high",
  "A few times a week": "medium",
  "Rarely": "low",
};

function incomeStability(changes: LifeChange[]): IncomeStability {
  if (changes.includes("internship")) return "at_risk"; // unpaid months ahead
  if (changes.includes("new_job")) return "growing";
  if (changes.includes("graduating")) return "unsure";
  return "steady";
}

// availableCash comes from the bank step; it stands in when the down-payment card was skipped.
export function toPfoAnswers(a: SituationAnswers, availableCash: number | null): PfoAnswers {
  return {
    down_payment: a.down_payment ?? availableCash ?? 0,
    credit_band: (a.credit_band && CREDIT_TO_BAND[a.credit_band]) || "unknown",
    other_debt_load: "none", // not asked yet
    upcoming_major_expense: a.life_change.includes("moving"),
    income_stability: incomeStability(a.life_change),
    car_usage: (a.car_reliance && RELIANCE_TO_USAGE[a.car_reliance]) || "medium",
  };
}
