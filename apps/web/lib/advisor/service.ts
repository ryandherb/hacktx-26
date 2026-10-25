// Single frontend boundary to the backend for the advisor flow.
// Real endpoint: Sheikh's POST /pre-quote-survey (issue #1). Types copied from
// issue_1_pre_quote_survey/pre_quote_contract.ts on origin/sheikh; keep in sync with it.
// Until that router is mounted in apps/api, calls fall back to a clearly labeled local mock.
import { BANK_FIXTURES, type BankAccount } from "@/lib/demo/bank";

export type PreQuoteInput = {
  repair_type: string;
  vehicle_model: string;
  vehicle_year: number;
  location: string;
};

export type PreQuoteSurveyAnswers = { [K in keyof PreQuoteInput]: PreQuoteInput[K] | null };

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

export type Served<T> = { data: T; mocked: boolean };

const SURVEY_API = process.env.NEXT_PUBLIC_SURVEY_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type VehicleFacts = { vehicle_model: string; vehicle_year: number; zip_code: string };

export async function submitProblem(profileId: string, text: string, vehicle: VehicleFacts): Promise<Served<PreQuoteSurveyResult>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${SURVEY_API}/pre-quote-survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, answers: { repair_type: text } }),
      signal: ctrl.signal,
    });
    if (res.ok) return { data: (await res.json()) as PreQuoteSurveyResult, mocked: false };
    if (res.status !== 404) throw new Error(`Survey service error ${res.status}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Survey service error")) throw e;
  } finally {
    clearTimeout(timer);
  }
  // MOCK: mirrors the real contract's "complete" response using the profile's own facts.
  const quote_input = { repair_type: text, vehicle_model: vehicle.vehicle_model, vehicle_year: vehicle.vehicle_year, location: vehicle.zip_code };
  return {
    mocked: true,
    data: { profile_id: profileId, answers: quote_input, missing_fields: [], questions: [], complete: true, quote_input },
  };
}

// ---- Repair quote (issue #2 Cost Agent: POST /quote) -----------------------------------
// Types mirror issue_2_cost_agent/web/lib/cost_api.ts on main; fold into lib/api.ts when the
// team unpacks the Cost Agent. Falls back to a labeled mock if the service is unreachable.

export type ManualQuote = { amount: number; shop?: string | null };

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
  region: string | null;
  shop: string | null;
};

export type VehicleValue = {
  vehicle_age_years: number;
  mileage: number;
  private_sale_low: number;
  private_sale_high: number;
  private_sale_estimate: number;
  trade_in_low: number;
  trade_in_high: number;
  trade_in_estimate: number;
};

export type CostQuoteResult = {
  profile_id: string | null;
  quote_input: PreQuoteInput;
  classification: RepairClassification;
  needs_manual: boolean;
  questions: { field: "manual_quote" | "mileage"; prompt: string; input_type: "number" }[];
  repair: RepairEstimate | null;
  vehicle: VehicleValue | null;
  nearby_shops: { name: string; source: "fixture" }[];
  complete: boolean;
  disclaimer: string;
};

export async function getQuote(profileId: string, quoteInput: PreQuoteInput, manualQuote: ManualQuote | null): Promise<Served<CostQuoteResult>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SURVEY_API}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, quote_input: quoteInput, manual_quote: manualQuote }),
      signal: ctrl.signal,
    });
    if (res.ok) return { data: (await res.json()) as CostQuoteResult, mocked: false };
    if (res.status !== 404) throw new Error(`Repair quote service error ${res.status}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Repair quote service error")) throw e;
  } finally {
    clearTimeout(timer);
  }
  return { mocked: true, data: mockQuote(profileId, quoteInput, manualQuote) };
}

// MOCK: copies of the real Cost Agent's output for the demo profiles (captured from POST /quote).
const QUOTE_DISCLAIMER = "Estimates based on synthetic data, not financial advice. Get a real shop quote before deciding.";
const MOCK_QUOTES: Record<string, Pick<CostQuoteResult, "classification" | "repair" | "vehicle" | "nearby_shops">> = {
  maria: {
    classification: { category: "transmission", label: "Transmission rebuild or replacement", kind: "repair", quotable: true, confidence: 0.9, method: "keyword", reason: "Matched to Transmission rebuild or replacement." },
    repair: { source: "table", category: "transmission", label: "Transmission rebuild or replacement", repair_cost_low: 2750, repair_cost_high: 4950, repair_cost_estimate: 4950, region: "TX", shop: null },
    vehicle: { vehicle_age_years: 14, mileage: 148000, private_sale_low: 4275, private_sale_high: 5225, private_sale_estimate: 4750, trade_in_low: 3420, trade_in_high: 4180, trade_in_estimate: 3800 },
    nearby_shops: [{ name: "Austin Transmission Co.", source: "fixture" }, { name: "Central TX Auto Care", source: "fixture" }],
  },
  dev: {
    classification: { category: "noise", label: "Unusual noise", kind: "symptom", quotable: false, confidence: 0.9, method: "keyword", reason: "This describes a symptom that could come from several different problems. A shop diagnosis will give you a real quote." },
    repair: null,
    vehicle: { vehicle_age_years: 16, mileage: 171000, private_sale_low: 2565, private_sale_high: 3135, private_sale_estimate: 2850, trade_in_low: 2025, trade_in_high: 2475, trade_in_estimate: 2250 },
    nearby_shops: [{ name: "South Austin Auto A/C", source: "fixture" }, { name: "Quick Fix Garage", source: "fixture" }],
  },
};

function mockQuote(profileId: string, quoteInput: PreQuoteInput, manualQuote: ManualQuote | null): CostQuoteResult {
  const base = MOCK_QUOTES[profileId] ?? MOCK_QUOTES.dev;
  const c = base.classification;
  const repair: RepairEstimate | null = manualQuote
    ? { source: "manual", category: c.category, label: c.label ?? "Shop quote", repair_cost_low: manualQuote.amount, repair_cost_high: manualQuote.amount, repair_cost_estimate: manualQuote.amount, region: null, shop: manualQuote.shop ?? null }
    : base.repair;
  return {
    profile_id: profileId,
    quote_input: quoteInput,
    classification: c,
    needs_manual: !repair,
    questions: repair ? [] : [{ field: "manual_quote", prompt: `${c.reason} If you already have a quote, enter the total amount.`, input_type: "number" }],
    repair,
    vehicle: base.vehicle,
    nearby_shops: base.nearby_shops,
    complete: !!repair && !!base.vehicle,
    disclaimer: QUOTE_DISCLAIMER,
  };
}

// ---- Results (issues #3 scoring + #4 explanation) -------------------------------------
// PROPOSED response shape; Ryan (#3) and Eni (#4) have not published contracts yet.
// Everything below is an ILLUSTRATIVE MOCK, not real financial math.

export type OptionId = "keep_repair" | "trade_in" | "private_sale";

export type OptionsResult = {
  scores: Record<OptionId, number>; // percentages, sum to 100
  explanation: string;
  recommended_vehicle: { name: string; kind: string; price: number; monthly_estimate: number } | null;
  what_would_change: string[];
};

const MOCK_RESULTS: Record<string, OptionsResult> = {
  maria: {
    scores: { keep_repair: 24, trade_in: 61, private_sale: 15 },
    explanation:
      "A transmission repair on a 148,000-mile Camry could cost close to what the car is worth. With a confirmed new job, a healthy down payment, and strong credit, trading in for a newer Toyota keeps your monthly costs predictable without draining savings.",
    recommended_vehicle: { name: "2023 Toyota Camry LE (Certified Used)", kind: "Certified used", price: 24500, monthly_estimate: 375 },
    what_would_change: ["If the job offer fell through, repairing becomes the safer choice.", "A repair quote under $2,000 would favor keeping the car."],
  },
  dev: {
    scores: { keep_repair: 68, trade_in: 12, private_sale: 20 },
    explanation:
      "An A/C repair is a contained cost, and an unpaid internship means a new car payment would stretch your budget during the months you'll have the least income. Fixing the Corolla keeps you on the road while you graduate, and you can revisit replacing it once your next job starts.",
    recommended_vehicle: { name: "2021 Toyota Corolla LE (Used)", kind: "Used, for later", price: 17900, monthly_estimate: 310 },
    what_would_change: ["A confirmed full-time job offer would make trading in more realistic.", "If the repair turns out to include the compressor and condenser, private sale gains ground."],
  },
};

export async function getOptions(profileId: string): Promise<Served<OptionsResult>> {
  await new Promise((r) => setTimeout(r, 2600)); // lets the "crunching numbers" screen read naturally
  return { mocked: true, data: MOCK_RESULTS[profileId] ?? MOCK_RESULTS.dev };
}

// ---- Bank connection (Capital One Nessie) ---------------------------------------------
// ILLUSTRATIVE MOCK: reads lib/demo/bank.ts. The summary below is display-only; the team's
// affordability math (apps/api/app/engine/affordability.py) stays authoritative.


export type BankSnapshot = {
  institution: string;
  accounts: BankAccount[];
  monthlyIncome: number;
  monthlySpending: number;
  carInsurance: number | null;
  transactionCount: number;
  // Display-only estimate: savings above a one-month spending cushion, rounded down to $250.
  availableCash: number;
  // "ToyotaAI found" observations, computed by plain code from the transactions (no AI, nothing invented).
  insights: string[];
};

export function bankAccountsFor(profileId: string) {
  const f = BANK_FIXTURES[profileId] ?? BANK_FIXTURES.dev;
  return { customerMask: f.customerMask, accounts: f.accounts };
}

const monthlyAvg = (items: { amount: number; date: string }[]) => {
  const months = new Set(items.map((i) => i.date.slice(0, 7))).size || 1;
  return items.reduce((s, i) => s + i.amount, 0) / months;
};

export async function connectBank(profileId: string, accountIds: string[]): Promise<Served<BankSnapshot>> {
  const f = BANK_FIXTURES[profileId] ?? BANK_FIXTURES.dev;
  const insurance = f.purchases.filter((p) => /insurance/i.test(p.description));
  const accounts = f.accounts.filter((a) => accountIds.includes(a.id));
  const income = Math.round(monthlyAvg(f.deposits));
  const spending = Math.round(monthlyAvg(f.purchases));
  const carInsurance = insurance.length ? Math.round(monthlyAvg(insurance)) : null;
  const savings = accounts.filter((a) => a.type === "Savings").reduce((s, a) => s + a.balance, 0);
  const availableCash = Math.max(0, Math.floor((savings - spending) / 250) * 250);
  const pay = f.deposits.map((d) => d.amount);
  const steady = Math.max(...pay) - Math.min(...pay) <= 0.05 * income;
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const insights = [
    steady ? `Steady paycheck of ${money(income)} a month` : `Paychecks vary from ${money(Math.min(...pay))} to ${money(Math.max(...pay))} a month`,
    income >= spending ? `You keep about ${money(income - spending)} a month after spending` : `Spending runs about ${money(spending - income)} a month above income`,
    ...(carInsurance ? [`Car insurance: ${money(carInsurance)} a month`] : []),
  ];
  return {
    mocked: true,
    data: {
      institution: "Capital One",
      accounts,
      monthlyIncome: income,
      monthlySpending: spending,
      carInsurance,
      transactionCount: f.deposits.length + f.purchases.length,
      availableCash,
      insights,
    },
  };
}
