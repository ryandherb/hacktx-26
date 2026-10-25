// Maps the "Your situation" answers onto the KRT engine's PFOFactors (apps/api schemas.py).
// Same fixed tables as Sheikh's PFO agent (issue_2_cost_agent/app/engine/cost_tables.py):
// credit band -> (APR, credit confidence); life change -> income outlook and job stability.
import type { PFOFactors } from "@/lib/api";
import type { SituationAnswers } from "./situation";

const CREDIT: Record<string, Pick<PFOFactors, "apr" | "credit_confidence">> = {
  "740+": { apr: 0.055, credit_confidence: "high" },
  "670–739": { apr: 0.07, credit_confidence: "high" },
  "580–669": { apr: 0.11, credit_confidence: "medium" },
  "Below 580": { apr: 0.16, credit_confidence: "low" },
};

const USAGE: Record<string, PFOFactors["car_usage"]> = {
  "Daily commute": "medium",
  "A few times a week": "low",
  Rarely: "low",
};

export function toPfoFactors(a: SituationAnswers): PFOFactors {
  const life = a.life_change;
  const income: Pick<PFOFactors, "income_outlook" | "job_stability"> =
    life.includes("internship") ? { income_outlook: "decreasing", job_stability: "unknown" }
    : life.includes("new_job") ? { income_outlook: "increasing", job_stability: "secure" }
    : life.includes("graduating") ? { income_outlook: "uncertain", job_stability: "unknown" }
    : { income_outlook: "stable", job_stability: "secure" };

  return {
    ...(a.credit_band ? CREDIT[a.credit_band] : { credit_confidence: "low" }),
    ...income,
    upcoming_major_expense: life.includes("moving"),
    car_usage: (a.car_reliance && USAGE[a.car_reliance]) || "medium",
    down_payment: a.down_payment,
  };
}
