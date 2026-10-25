const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Profile = {
  id: string;
  name: string;
  vehicle_model: string;
  vehicle_year: number;
  mileage: number;
  zip_code: string;
  loan_balance: number;
  monthly_payment: number;
  open_issue: string | null;
  insurance_premium?: number | null;
};

export type CurvePoint = { month: number; keep_cost: number; replace_cost: number };

export type Affordability = {
  monthly_income: number;
  monthly_spend: number;
  savings_balance: number;
  monthly_surplus: number;
  runway_months: number;
  can_afford_payment: boolean;
  max_comfortable_payment: number;
};

export type Market = {
  current_vehicle_value_low: number;
  current_vehicle_value_high: number;
  scheduled_maintenance: { cost: number; interval: number }[];
  replacement_options: { name: string; price: number; kind: string }[];
  repair_quotes: { shop: string; estimate: number; source: string }[];
};

export type SuggestedModel = {
  name: string;
  price: number;
  kind: string;
  seats: number;
  mpg: number;
  body: string;
  down_payment: number;
  new_payment: number;
  insurance_delta: number;
  fuel_delta: number;
  monthly_cost: number;
  reason: string;
};

export type KRTResult = {
  keepResult: number;
  refinanceResult: number;
  tradeResult: number;
  repair_ratio: number;
  pr_runway: number;
  remaining_life: number;
  new_payment: number;
  refi_payment: number;
  suggested_models: SuggestedModel[];
  trade_affordable: boolean;
};

export type PFOFactors = {
  apr?: number | null;
  down_payment?: number | null;
  income_outlook?: "increasing" | "stable" | "decreasing" | "uncertain";
  job_stability?: "secure" | "at_risk" | "unknown";
  upcoming_major_expense?: boolean;
  other_debt_load?: "none" | "light" | "heavy";
  windfall_expected?: boolean;
  payment_risk_tolerance?: "low" | "medium" | "high";
  household_members?: number | null;
  car_usage?: "low" | "medium" | "high";
  credit_confidence?: "low" | "medium" | "high";
};

export type OptionExplanation = { brief: string; details: string };

export type Analysis = {
  profile_id: string;
  recommendation: "keep" | "trade" | "refinance";
  result: KRTResult;
  new_monthly_payment: number;
  suggested_models: SuggestedModel[] | null; // only when recommendation === "trade"
  apr: number | null;
  down_payment: number | null;
  affordability: Affordability; // always set by /analyze
  market: Market; // always set by /analyze
  explanation: string; // short summary for the results card
  explanation_details: string; // longer version for the "more details" drop-down
  // Brief + detailed explanation per option, keyed keep | trade | refinance.
  option_explanations: Record<"keep" | "trade" | "refinance", OptionExplanation>;
  curve: CurvePoint[]; // legacy chart data; empty now
  crossover_month: number | null;
};

// ---- Pre-quote survey (issue #1): POST /pre-quote-survey ----

export type PreQuoteInput = {
  repair_type: string;
  vehicle_model: string;
  vehicle_year: number;
  location: string;
};

export type PreQuoteSurveyAnswers = {
  [K in keyof PreQuoteInput]: PreQuoteInput[K] | null;
};

export type PreQuoteSurveyRequest = {
  profile_id?: string | null;
  answers?: Partial<PreQuoteSurveyAnswers>;
};

export type PreQuoteSurveyQuestion = {
  field: keyof PreQuoteInput;
  prompt: string;
  input_type: "text" | "number";
};

export type PreQuoteSurveyResult = {
  profile_id: string | null;
  answers: PreQuoteSurveyAnswers;
  missing_fields: (keyof PreQuoteInput)[];
  questions: PreQuoteSurveyQuestion[];
  complete: boolean;
  quote_input: PreQuoteInput | null;
};

// ---- Cost Agent + PFO Agent (issue #2): POST /quote, POST /onboarding ----

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

// ---- POST /analyze ----

export type AnalysisRequest = {
  profile_id: string;
  horizon_months?: number;
  replacement_price?: number | null;
  down_payment?: number | null; // used only when pfo_factors is not sent
  quote?: CostQuoteResult | null; // complete POST /quote result; omitted -> backend quotes the profile's open issue
  pfo_factors?: PFOFactors | null; // POST /onboarding factors; omitted -> defaults
};

export type CarFund = {
  account_id: string;
  monthly_amount: number;
  target_amount: number;
  simulated: boolean;
};

type Init = { signal?: AbortSignal };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown, init?: Init) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body), ...init });

export const getProfiles = () => request<Profile[]>("/profiles");

export const preQuoteSurvey = (body: PreQuoteSurveyRequest, init?: Init) =>
  post<PreQuoteSurveyResult>("/pre-quote-survey", body, init);

export const quote = (body: CostQuoteRequest, init?: Init) =>
  post<CostQuoteResult>("/quote", body, init);

export const onboarding = (body: OnboardingRequest, init?: Init) =>
  post<OnboardingResult>("/onboarding", body, init);

export const analyze = (
  profile_id: string,
  extra: Omit<AnalysisRequest, "profile_id"> = {},
  init?: Init,
) => post<Analysis>("/analyze", { profile_id, horizon_months: 36, ...extra }, init);

export const createCarFund = (
  profile_id: string,
  monthly_amount: number,
  target_amount: number,
) => post<CarFund>("/car-fund", { profile_id, monthly_amount, target_amount });
