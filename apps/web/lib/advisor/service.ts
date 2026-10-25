import { BANK_FIXTURES, type BankAccount } from "@/lib/demo/bank";
// Single frontend boundary to the backend for the advisor flow.
// Real endpoint: Sheikh's POST /pre-quote-survey (issue #1). Types copied from
// issue_1_pre_quote_survey/pre_quote_contract.ts on origin/sheikh; keep in sync with it.
// Until that router is mounted in apps/api, calls fall back to a clearly labeled local mock.

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
  return {
    mocked: true,
    data: {
      institution: "Capital One",
      accounts: f.accounts.filter((a) => accountIds.includes(a.id)),
      monthlyIncome: Math.round(monthlyAvg(f.deposits)),
      monthlySpending: Math.round(monthlyAvg(f.purchases)),
      carInsurance: insurance.length ? Math.round(monthlyAvg(insurance)) : null,
      transactionCount: f.deposits.length + f.purchases.length,
    },
  };
}
