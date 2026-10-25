// Cost Agent (issue #2) types for the frontend; mirrors app/models/cost_schemas.py.
// Path is correct once both issues are unpacked into apps/web/lib/.
import type { PreQuoteInput } from "./pre_quote_api";

export type ManualQuote = { amount: number; shop?: string | null };

export type CostQuoteRequest = {
  profile_id?: string | null;
  quote_input: PreQuoteInput;
  mileage?: number | null;
  manual_quote?: ManualQuote | null;
};

export type RepairClassification = {
  category: string | null;
  label: string | null;
  kind: "repair" | "symptom" | "multiple" | "unknown";
  quotable: boolean;
  confidence: number;
  method: "llm" | "keyword";
  reason: string;
};

export type RepairEstimate = {
  source: "table" | "manual";
  category: string | null;
  label: string;
  repair_cost_low: number;
  repair_cost_high: number;
  repair_cost_estimate: number;
  model_multiplier: number | null;
  age_multiplier: number | null;
  region_multiplier: number | null;
  region: string | null;
  shop: string | null;
};

export type VehicleValue = {
  model_recognized: boolean;
  vehicle_age_years: number;
  mileage: number;
  mileage_source: "profile" | "user";
  private_sale_low: number;
  private_sale_high: number;
  private_sale_estimate: number;
  trade_in_low: number;
  trade_in_high: number;
  trade_in_estimate: number;
};

export type RepairShop = { name: string; source: "fixture" };

export type CostQuestion = {
  field: "manual_quote" | "mileage";
  prompt: string;
  input_type: "number";
};

export type CostQuoteResult = {
  profile_id: string | null;
  quote_input: PreQuoteInput;
  classification: RepairClassification;
  needs_manual: boolean;
  questions: CostQuestion[];
  repair: RepairEstimate | null;
  vehicle: VehicleValue | null;
  nearby_shops: RepairShop[];
  complete: boolean;
  disclaimer: string;
};

export type CreditBand = "excellent" | "good" | "fair" | "poor" | "unknown";
export type IncomeStability = "growing" | "steady" | "at_risk" | "unsure";
export type DebtLoad = "none" | "light" | "heavy";
export type Level = "low" | "medium" | "high";
export type PfoField =
  | "down_payment"
  | "credit_band"
  | "other_debt_load"
  | "upcoming_major_expense"
  | "income_stability"
  | "car_usage";

// What the survey asks. For the yes/no question send true/false (options carry "yes"/"no").
export type PfoAnswers = {
  down_payment: number | null;
  credit_band: CreditBand | null;
  other_debt_load: DebtLoad | null;
  upcoming_major_expense: boolean | null;
  income_stability: IncomeStability | null;
  car_usage: Level | null;
};

// Same fields as issue #3's PFOFactors (apps/api/app/models/schemas.py).
export type PFOFactors = {
  apr: number | null;
  down_payment: number | null;
  income_outlook: "increasing" | "stable" | "decreasing" | "uncertain";
  job_stability: "secure" | "at_risk" | "unknown";
  upcoming_major_expense: boolean;
  other_debt_load: DebtLoad;
  windfall_expected: boolean;
  payment_risk_tolerance: Level;
  household_members: number | null;
  car_usage: Level;
  credit_confidence: Level;
};

export type OnboardingRequest = {
  answers?: Partial<PfoAnswers>;
  reply?: { field: PfoField; text: string } | null;
};

export type PfoQuestion = {
  field: PfoField;
  prompt: string;
  input_type: "number" | "choice";
  unit: "dollars" | null;
  options: { value: string; label: string }[];
};

export type OnboardingResult = {
  answers: PfoAnswers;
  question: PfoQuestion | null;
  retry: boolean;
  message: string | null;
  answered: number;
  total: number;
  accepts_free_text: boolean;
  complete: boolean;
  factors: PFOFactors | null;
};

// Built by cost_agent.build_handoff(); repair_cost, car_value and pfo_factors are krt.score() inputs.
export type CostAgentHandoff = {
  profile_id: string | null;
  quote_input: PreQuoteInput;
  repair: RepairEstimate;
  vehicle: VehicleValue;
  pfo_factors: PFOFactors;
  repair_cost: number;
  car_value: number;
};
