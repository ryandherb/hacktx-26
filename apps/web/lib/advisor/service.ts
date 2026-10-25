// Single frontend boundary to the backend for the advisor flow.
// Live: POST /pre-quote-survey -> /quote -> /onboarding -> /analyze on the main API (lib/api.ts).
// Offline: the Vercel demo has no backend, so when the API is unreachable each call falls back to
// lib/demo/offline-snapshot.json, a saved run of the real backend for the demo profiles
// (regenerate with apps/api/scripts/export_demo_snapshot.py). Fallbacks are flagged `mocked: true`.
//
// The judge's own profile (id "custom", lib/demo/customProfile.ts) isn't in the backend seeds:
// the survey and quote get its vehicle facts with no profile_id, /analyze gets the whole profile
// as custom_profile, and offline it falls back to lib/demo/estimate.ts instead of the snapshot.
import * as api from "@/lib/api";
import type {
  Analysis,
  CostQuoteResult,
  CustomProfileIn,
  GuideContext,
  GuideMessage,
  ManualQuote,
  PFOFactors,
  PreQuoteInput,
  PreQuoteSurveyResult,
  RepairEstimate,
} from "@/lib/api";
import { bankFixtureFor, toBankSnapshotIn, type BankAccount } from "@/lib/demo/bank";
import { CUSTOM_PROFILE_ID, loadCustomProfile, type CustomProfile } from "@/lib/demo/customProfile";
import { classifyRepair, estimateRepair, offlineCustomAnalysis, valueVehicle } from "@/lib/demo/estimate";
import snapshotJson from "@/lib/demo/offline-snapshot.json";
import { faqAnswer } from "./guideFaq";
import { toPfoAnswers, type SituationAnswers } from "./situation";

export type { CostQuoteResult, ManualQuote, PreQuoteInput, PreQuoteSurveyResult } from "@/lib/api";

export type Served<T> = { data: T; mocked: boolean };

type Snapshot = Record<string, { survey: PreQuoteSurveyResult; quote: CostQuoteResult; analysis: Analysis }>;
const SNAPSHOT = snapshotJson as unknown as Snapshot;
const snapshotFor = (profileId: string) => SNAPSHOT[profileId] ?? SNAPSHOT.dev;

const custom = (profileId: string): CustomProfile | null => (profileId === CUSTOM_PROFILE_ID ? loadCustomProfile() : null);

// Only call a backend when one is configured, or when the site itself runs on this machine.
// A deployed page that calls http://localhost makes Chrome hold the request for a local-network
// permission prompt, so it never resolves; fall straight back to the offline snapshot instead.
export function backendReachable(): boolean {
  if (process.env.NEXT_PUBLIC_API_URL) return true;
  return typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

// Runs a live call with a timeout. Network failures and timeouts return null (-> offline
// snapshot); HTTP errors from a reachable backend are real problems and are thrown.
// Timeouts are short enough for a live presentation: if the backend is slow (e.g. Render's free
// tier waking up), the page shows the saved sample results instead of stalling. Normal responses
// take well under 5s; the backend caps the Muse explanation at 10s and falls back to its template.
async function live<T>(call: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  if (!backendReachable()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await call(ctrl.signal);
  } catch (e) {
    if (e instanceof Error && /^\d{3} /.test(e.message)) throw new Error(`Service error ${e.message}`);
    return null; // unreachable or timed out
  } finally {
    clearTimeout(timer);
  }
}

// ---- Step 1: pre-quote survey (issue #1) -----------------------------------------------

type VehicleFacts = { vehicle_model: string; vehicle_year: number; zip_code: string };

export async function submitProblem(profileId: string, text: string, vehicle: VehicleFacts): Promise<Served<PreQuoteSurveyResult>> {
  const body = profileId === CUSTOM_PROFILE_ID
    ? { answers: { repair_type: text, vehicle_model: vehicle.vehicle_model, vehicle_year: vehicle.vehicle_year, location: vehicle.zip_code } }
    : { profile_id: profileId, answers: { repair_type: text } };
  const r = await live((signal) => api.preQuoteSurvey(body, { signal }), 10000);
  if (r) return { data: r, mocked: false };
  // Offline: same shape the survey returns for a complete profile, with the text the user typed.
  const quote_input = { repair_type: text, vehicle_model: vehicle.vehicle_model, vehicle_year: vehicle.vehicle_year, location: vehicle.zip_code };
  return {
    mocked: true,
    data: { profile_id: profileId, answers: quote_input, missing_fields: [], questions: [], complete: true, quote_input },
  };
}

// ---- Step 2: repair quote (issue #2 Cost Agent) ------------------------------------------

export async function getQuote(profileId: string, quoteInput: PreQuoteInput, manualQuote: ManualQuote | null): Promise<Served<CostQuoteResult>> {
  const c = custom(profileId);
  const body = c
    ? { profile_id: null, quote_input: quoteInput, mileage: c.profile.mileage, manual_quote: manualQuote }
    : { profile_id: profileId, quote_input: quoteInput, manual_quote: manualQuote };
  const r = await live((signal) => api.quote(body, { signal }), 20000); // Muse retries + Render cold starts
  if (r) return { data: r, mocked: false };
  return { mocked: true, data: offlineQuote(profileId, quoteInput, manualQuote) };
}

// Offline estimate for the judge's own Camry (lib/demo/estimate.ts), shaped like the snapshot's.
function customQuoteBase(c: CustomProfile, quoteInput: PreQuoteInput): CostQuoteResult {
  const classification = classifyRepair(quoteInput.repair_type);
  const repair = classification.quotable && classification.category
    ? estimateRepair(classification.category, quoteInput.vehicle_model, quoteInput.vehicle_year, quoteInput.location)
    : null;
  return {
    profile_id: CUSTOM_PROFILE_ID,
    quote_input: quoteInput,
    classification,
    needs_manual: !repair,
    questions: repair ? [] : [{ field: "manual_quote", prompt: `${classification.reason} If you already have a quote, enter the total amount.`, input_type: "number" }],
    repair,
    vehicle: valueVehicle(quoteInput.vehicle_model, quoteInput.vehicle_year, c.profile.mileage),
    nearby_shops: [],
    complete: !!repair,
    disclaimer: snapshotFor("maria").quote.disclaimer,
  };
}

// Offline: the saved Cost Agent result for this profile. A shop quote replaces the table
// estimate the same way the backend does (source "manual").
function offlineQuote(profileId: string, quoteInput: PreQuoteInput, manualQuote: ManualQuote | null): CostQuoteResult {
  const own = custom(profileId);
  const base = own ? customQuoteBase(own, quoteInput) : snapshotFor(profileId).quote;
  const c = base.classification;
  const repair: RepairEstimate | null = manualQuote
    ? { source: "manual", category: c.category, label: c.label ?? "Shop quote", repair_cost_low: manualQuote.amount, repair_cost_high: manualQuote.amount, repair_cost_estimate: manualQuote.amount, model_multiplier: null, age_multiplier: null, region_multiplier: null, region: null, shop: manualQuote.shop ?? null }
    : base.repair;
  return {
    ...base,
    profile_id: profileId,
    quote_input: quoteInput,
    needs_manual: !repair,
    questions: repair ? base.questions.filter((q) => q.field !== "manual_quote") : base.questions,
    repair,
    complete: !!repair && !!base.vehicle,
  };
}

// ---- Step 3: results (PFO Agent -> KRT engine -> Explanation Agent) ----------------------

export type OptionId = Analysis["recommendation"];

export const OPTION_LABELS: Record<OptionId, [string, string]> = {
  keep: ["Keep & Repair", "Fix it and keep driving"],
  trade: ["Trade In & Upgrade", "Put this car toward a newer Toyota"],
  refinance: ["Keep & Refinance", "Fix it and lower your loan payment"],
};

export type OptionsInputs = {
  quote: CostQuoteResult | null;
  quoteMocked: boolean;
  situation: SituationAnswers;
  availableCash: number | null; // from the bank step
};

// Demo profiles always show their preset results (a saved run of the real backend with the
// demo answers), so the demo tells the same story every time, with or without a backend.
const PRESET_PROFILES = new Set(["maria", "dev"]);

export async function getOptions(profileId: string, inputs: OptionsInputs): Promise<Served<Analysis>> {
  if (PRESET_PROFILES.has(profileId) && SNAPSHOT[profileId]) {
    await new Promise((r) => setTimeout(r, 2600)); // lets the "crunching numbers" screen read naturally
    return { mocked: true, data: SNAPSHOT[profileId].analysis };
  }
  const c = custom(profileId);
  // A backend deployed before custom_profile support answers the judge's profile with 404;
  // show the offline estimate instead of an error (the seeded profiles still surface errors).
  const call = c ? <T,>(p: Promise<T>) => p.catch(() => null) : <T,>(p: Promise<T>) => p;
  const r = await call(live(async (signal) => {
    const pfo = await api.onboarding({ answers: toPfoAnswers(inputs.situation, inputs.availableCash) }, { signal });
    // Send the user's quote only if it's a complete, live one; otherwise the backend quotes
    // the profile's open issue itself. The judge's profile always sends a complete quote,
    // since its open issue is optional.
    const quote = inputs.quote?.complete && (!inputs.quoteMocked || !!c) ? inputs.quote : null;
    return api.analyze(profileId, { quote, pfo_factors: pfo.factors, custom_profile: c && customProfileIn(c) }, { signal });
  }, 20000)); // includes the Explanation Agent call
  if (r) return { data: r, mocked: false };
  if (c) return { mocked: true, data: offlineCustomAnalysis(c, inputs.quote, offlinePfo(inputs)) };
  return { mocked: true, data: snapshotFor(profileId).analysis };
}

function customProfileIn({ profile: p, display }: CustomProfile): CustomProfileIn {
  return {
    name: display.firstName,
    vehicle_model: "Camry",
    vehicle_year: p.vehicle_year,
    mileage: p.mileage,
    zip_code: p.zip_code,
    loan_balance: p.loan_balance,
    monthly_payment: p.monthly_payment,
    insurance_premium: p.insurance_premium ?? null,
    open_issue: p.open_issue,
    bank: toBankSnapshotIn(bankFixtureFor(CUSTOM_PROFILE_ID)),
  };
}

// Offline stand-in for POST /onboarding: the same credit-band -> APR table as the PFO Agent.
const BAND_APR: Record<string, number> = { excellent: 0.055, good: 0.07, fair: 0.11, poor: 0.16 };

function offlinePfo(inputs: OptionsInputs): PFOFactors {
  const a = toPfoAnswers(inputs.situation, inputs.availableCash);
  return { apr: (a.credit_band && BAND_APR[a.credit_band]) ?? null, down_payment: a.down_payment, car_usage: a.car_usage ?? "medium" };
}

// ---- Car Fund (Capital One Nessie savings account, simulated in fixture mode) ------------

export async function startCarFund(profileId: string, monthly: number, target: number): Promise<Served<api.CarFund>> {
  // The judge's profile has no Nessie customer, so its Car Fund is always simulated.
  const r = custom(profileId) ? null : await live(() => api.createCarFund(profileId, monthly, target), 5000);
  if (r) return { data: r, mocked: false };
  return { mocked: true, data: { account_id: "demo-car-fund", monthly_amount: monthly, target_amount: target, simulated: true } };
}

// ---- Guide chat (Muse on the backend; built-in FAQ when offline or no key) ----------------

export async function askGuide(messages: GuideMessage[], context: GuideContext): Promise<Served<string>> {
  const r = await live((signal) => api.guideChat(messages, context, { signal }), 15000).catch(() => null);
  if (r?.reply) return { data: r.reply, mocked: false };
  return { mocked: true, data: faqAnswer(messages[messages.length - 1].content, context) };
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
  const f = bankFixtureFor(profileId);
  return { customerMask: f.customerMask, accounts: f.accounts };
}

const monthlyAvg = (items: { amount: number; date: string }[]) => {
  const months = new Set(items.map((i) => i.date.slice(0, 7))).size || 1;
  return items.reduce((s, i) => s + i.amount, 0) / months;
};

export async function connectBank(profileId: string, accountIds: string[]): Promise<Served<BankSnapshot>> {
  const f = bankFixtureFor(profileId);
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
