// OFFLINE fallback for the judge's own profile, which has no saved run in offline-snapshot.json.
// A small frontend copy of apps/api/app/engine/{cost_tables,repair_costs,vehicle_value}.py so the
// estimate still works when the API is unreachable. The live POST /quote stays authoritative.
import type { Analysis, CostQuoteResult, PFOFactors, RepairClassification, RepairEstimate, SuggestedModel, VehicleValue } from "@/lib/api";
import { bankFixtureFor } from "./bank";
import { CUSTOM_PROFILE_ID, type CustomProfile } from "./customProfile";

const REPAIRS: Record<string, { label: string; low: number; high: number; keywords: string[] }> = {
  brakes: { label: "Brake pads and rotors (one axle)", low: 250, high: 600, keywords: ["brake", "brakes", "brake pads", "pads", "rotor", "rotors", "braking"] },
  battery: { label: "Battery replacement", low: 150, high: 350, keywords: ["battery", "dead battery"] },
  alternator: { label: "Alternator replacement", low: 400, high: 900, keywords: ["alternator"] },
  starter: { label: "Starter motor replacement", low: 350, high: 800, keywords: ["starter", "starter motor"] },
  o2_sensor: { label: "Oxygen (O2) sensor replacement", low: 200, high: 500, keywords: ["oxygen sensor", "o2 sensor", "o2", "02 sensor"] },
  ac_compressor: { label: "A/C compressor replacement", low: 900, high: 1800, keywords: ["ac compressor", "air conditioning compressor", "compressor"] },
  ac_recharge: { label: "A/C refrigerant recharge", low: 150, high: 350, keywords: ["ac recharge", "refrigerant", "freon", "recharge"] },
  water_pump: { label: "Water pump replacement", low: 450, high: 900, keywords: ["water pump"] },
  radiator: { label: "Radiator replacement", low: 500, high: 1100, keywords: ["radiator"] },
  timing_belt: { label: "Timing belt or chain service", low: 500, high: 1100, keywords: ["timing belt", "timing chain"] },
  struts: { label: "Struts or shocks (pair)", low: 600, high: 1500, keywords: ["strut", "struts", "shocks"] },
  tires: { label: "Set of four tires", low: 500, high: 1000, keywords: ["tire", "tires"] },
  wheel_bearing: { label: "Wheel bearing replacement", low: 300, high: 700, keywords: ["wheel bearing", "hub bearing"] },
  spark_plugs: { label: "Spark plugs and ignition coils", low: 150, high: 450, keywords: ["spark plug", "spark plugs", "ignition coil", "coil pack"] },
  fuel_pump: { label: "Fuel pump replacement", low: 600, high: 1300, keywords: ["fuel pump"] },
  catalytic_converter: { label: "Catalytic converter replacement", low: 1000, high: 2500, keywords: ["catalytic converter", "catalytic"] },
  head_gasket: { label: "Head gasket repair", low: 1500, high: 3000, keywords: ["head gasket"] },
  transmission: { label: "Transmission rebuild or replacement", low: 2500, high: 4500, keywords: ["transmission", "gearbox", "slipping gears"] },
};

const SYMPTOMS: Record<string, { label: string; keywords: string[] }> = {
  no_start: { label: "Car won't start", keywords: ["won t start", "wont start", "not starting", "no start", "doesnt start"] },
  electrical: { label: "Electrical problem", keywords: ["electrical", "electric", "no power", "lights flickering"] },
  check_engine: { label: "Check engine light", keywords: ["check engine", "engine light"] },
  warning_light: { label: "Dashboard warning light", keywords: ["warning light", "dashboard light", "dash light"] },
  noise: { label: "Unusual noise", keywords: ["noise", "grinding", "clunk", "rattle", "rattling", "squeak", "squeal", "knocking", "whining"] },
  vibration: { label: "Vibration or shaking", keywords: ["vibration", "vibrating", "shaking", "shakes", "wobble"] },
  leak: { label: "Fluid leak", keywords: ["leak", "leaking", "puddle", "drip", "dripping"] },
  overheating: { label: "Overheating", keywords: ["overheating", "overheats", "running hot"] },
  smoke_smell: { label: "Smoke or burning smell", keywords: ["smoke", "smoking", "burning smell"] },
  performance: { label: "Drivability problem", keywords: ["stalling", "stalls", "hesitates", "rough idle", "sluggish", "losing power", "misfire"] },
};

// repair multiplier, synthetic original MSRP, annual depreciation
const MODELS: Record<string, [number, number, number]> = {
  yaris: [0.85, 16000, 0.11], corolla: [0.9, 16500, 0.11], prius: [1, 25000, 0.11], chr: [0.95, 23000, 0.11],
  camry: [1, 22000, 0.11], avalon: [1.1, 33000, 0.11], rav4: [1.05, 24000, 0.09], venza: [1.1, 28000, 0.11],
  highlander: [1.15, 30000, 0.1], sienna: [1.15, 28000, 0.11], "4runner": [1.2, 33000, 0.08], tacoma: [1.15, 26000, 0.08],
  tundra: [1.25, 33000, 0.09], sequoia: [1.3, 42000, 0.1], landcruiser: [1.4, 60000, 0.07],
};
const DEFAULT_MODEL: [number, number, number] = [1, 25000, 0.11];

const LABOR: Record<string, number> = { TX: 1, CA: 1.25, NY: 1.2, MA: 1.2, WA: 1.15, IL: 1.1, CO: 1.05, FL: 1, AZ: 1, GA: 0.95, LA: 0.95, OK: 0.9 };
const ZIP_STATES: [number, number, string][] = [
  [10, 27, "MA"], [100, 149, "NY"], [300, 319, "GA"], [398, 399, "GA"], [320, 349, "FL"], [600, 629, "IL"], [700, 714, "LA"],
  [730, 749, "OK"], [750, 799, "TX"], [885, 885, "TX"], [800, 816, "CO"], [850, 865, "AZ"], [900, 961, "CA"], [980, 994, "WA"],
];

const normalize = (t: string) => t.toLowerCase().replace(/a\/c/g, "ac").replace(/[^a-z0-9]+/g, " ").trim();
const hasKeyword = (text: string, kws: string[]) => kws.some((k) => ` ${text} `.includes(` ${k} `));
const round10 = (n: number) => Math.round(n / 10) * 10;
const round50 = (n: number) => Math.round(n / 50) * 50;

export function modelData(vehicleModel: string) {
  const compact = vehicleModel.toLowerCase().replace(/[^a-z0-9]/g, "").replace("toyota", "");
  const key = Object.keys(MODELS).filter((k) => compact.includes(k)).sort((a, b) => b.length - a.length)[0];
  const [repairMultiplier, msrp, depreciation] = key ? MODELS[key] : DEFAULT_MODEL;
  return { repairMultiplier, msrp, depreciation };
}

export function stateFromZip(zip: string): string | null {
  const prefix = Number(zip.slice(0, 3));
  return /^\d{5}$/.test(zip) ? ZIP_STATES.find(([lo, hi]) => prefix >= lo && prefix <= hi)?.[2] ?? null : null;
}

// A named part beats a symptom ("check engine light, oxygen sensor" -> O2 sensor).
export function classifyRepair(description: string): RepairClassification {
  const text = normalize(description);
  const repairs = Object.entries(REPAIRS).filter(([, r]) => hasKeyword(text, r.keywords));
  if (repairs.length === 1) {
    const [category, r] = repairs[0];
    return { category, label: r.label, kind: "repair", quotable: true, confidence: 0.9, method: "keyword", reason: `Matched to ${r.label}.` };
  }
  if (repairs.length > 1) {
    return { category: null, label: null, kind: "multiple", quotable: false, confidence: 0.6, method: "keyword", reason: "This sounds like more than one repair, so a shop should quote it." };
  }
  const symptom = Object.entries(SYMPTOMS).find(([, s]) => hasKeyword(text, s.keywords));
  if (symptom) {
    return { category: symptom[0], label: symptom[1].label, kind: "symptom", quotable: false, confidence: 0.9, method: "keyword", reason: "This describes a symptom that could come from several different problems. A shop diagnosis will give you a real quote." };
  }
  return { category: null, label: null, kind: "unknown", quotable: false, confidence: 0, method: "keyword", reason: "We couldn't match this to a known repair. A shop diagnosis will give you a real quote." };
}

export function estimateRepair(category: string, vehicleModel: string, vehicleYear: number, zip: string): RepairEstimate {
  const r = REPAIRS[category];
  const age = Math.max(0, new Date().getFullYear() - vehicleYear);
  const ageMult = age <= 5 ? 1 : age <= 10 ? 1.05 : age <= 15 ? 1.1 : 1.15;
  const region = stateFromZip(zip);
  const modelMult = modelData(vehicleModel).repairMultiplier;
  const regionMult = region ? LABOR[region] ?? 1 : 1;
  const factor = modelMult * ageMult * regionMult;
  const low = round10(r.low * factor), high = round10(r.high * factor);
  return {
    source: "table", category, label: r.label, repair_cost_low: low, repair_cost_high: high, repair_cost_estimate: high,
    model_multiplier: modelMult, age_multiplier: ageMult, region_multiplier: regionMult, region, shop: null,
  };
}

export function valueVehicle(vehicleModel: string, vehicleYear: number, mileage: number): VehicleValue {
  const { msrp, depreciation } = modelData(vehicleModel);
  const age = Math.max(0, new Date().getFullYear() - vehicleYear);
  const mileageAdj = Math.min(1.2, Math.max(0.7, 1 + (0.05 * (age * 12000 - mileage)) / 10000));
  const priv = Math.max(500, msrp * (1 - depreciation) ** age * mileageAdj);
  const trade = Math.max(500, priv * 0.8);
  return {
    model_recognized: true, vehicle_age_years: age, mileage, mileage_source: "profile",
    private_sale_low: round50(priv * 0.9), private_sale_high: round50(priv * 1.1), private_sale_estimate: round50(priv),
    trade_in_low: round50(trade * 0.9), trade_in_high: round50(trade * 1.1), trade_in_estimate: round50(trade),
  };
}

// ---- Offline results: a simplified copy of apps/api/app/engine/krt.py --------------------
// Same structure (monthly cost of keep / trade / refinance over 36 months, lowest affordable
// wins, keep wins ties) without the insurance, fuel, and risk-margin details. Only used when the
// API is unreachable; POST /analyze stays authoritative.

const HORIZON = 36;
const LOAN_MONTHS = 60;
// $/mile from market.json's "custom" maintenance schedule.
const MAINT_PER_MILE = 75 / 5000 + 30 / 5000 + 90 / 30000 + 300 / 40000 + 150 / 100000;
const USAGE = { low: 0.75, medium: 1, high: 1.3 } as const;
// market.json "custom" replacement options, with specs from seeds/toyota_catalog.json.
const REPLACEMENTS = [
  { name: "2026 Corolla LE", price: 24500, kind: "new", seats: 5, mpg: 35, body: "sedan" },
  { name: "2026 Corolla Cross L", price: 25335, kind: "new", seats: 5, mpg: 32, body: "suv" },
  { name: "2026 Camry Hybrid LE", price: 29000, kind: "new", seats: 5, mpg: 51, body: "sedan" },
  { name: "2026 RAV4 Hybrid LE", price: 31900, kind: "new", seats: 5, mpg: 40, body: "suv" },
  { name: "2026 Sienna LE", price: 40120, kind: "new", seats: 8, mpg: 36, body: "minivan" },
];

const amortize = (principal: number, apr: number, months: number) =>
  principal <= 0 ? 0 : apr === 0 ? principal / months : (principal * (apr / 12)) / (1 - (1 + apr / 12) ** -months);
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function offlineCustomAnalysis(c: CustomProfile, quote: CostQuoteResult | null, pfo: PFOFactors): Analysis {
  const p = c.profile;
  const vehicle = quote?.vehicle ?? valueVehicle(p.vehicle_model, p.vehicle_year, p.mileage);
  const carValue = vehicle.trade_in_estimate;
  const repairCost = quote?.repair?.repair_cost_estimate ?? 0;
  const apr = pfo.apr ?? 0.07;
  const usage = USAGE[pfo.car_usage ?? "medium"];

  // Affordability, as apps/api/app/engine/affordability.py computes it from the bank data.
  const bank = bankFixtureFor(CUSTOM_PROFILE_ID);
  const monthly = (xs: { amount: number; date: string }[]) => xs.reduce((s, x) => s + x.amount, 0) / (new Set(xs.map((x) => x.date.slice(0, 7))).size || 1);
  const income = monthly(bank.deposits), spend = monthly(bank.purchases);
  const savings = bank.accounts.filter((a) => a.type === "Savings").reduce((s, a) => s + a.balance, 0);
  const maxPayment = Math.max(income - spend - 300, 0);

  // Keep: repair spread over the horizon + maintenance + unscheduled repairs + current loan payment.
  const age = Math.max(0, new Date().getFullYear() - p.vehicle_year);
  const milesPerMonth = (p.mileage / (12 * age + 6)) * usage;
  const m = p.mileage / 100000;
  const unscheduled = (0.3 * (1 + 0.54 * m ** 1.5) * 1000 * (1 + 0.15 * m) * (carValue / 15000) ** 0.3 * usage) / 12;
  const keep = repairCost / HORIZON + MAINT_PER_MILE * milesPerMonth + unscheduled + p.monthly_payment;

  // Trade: each replacement financed over 60 months after the down payment and the car's equity.
  const equity = carValue - p.loan_balance;
  const options: SuggestedModel[] = REPLACEMENTS.map((o) => {
    const down = pfo.down_payment ?? 0.2 * o.price;
    const payment = amortize(Math.max(0, o.price - down - equity), apr, LOAN_MONTHS);
    const insuranceDelta = ((o.price - carValue) * 0.035) / 12;
    return {
      ...o, down_payment: r2(down), new_payment: r2(payment), insurance_delta: r2(insuranceDelta), fuel_delta: 0,
      monthly_cost: r2(down / HORIZON + payment + insuranceDelta), reason: "",
    };
  }).sort((a, b) => a.monthly_cost - b.monthly_cost);
  const best = options[0];
  const tradeAffordable = best.new_payment <= maxPayment;

  // Refinance: keep the car and re-amortize the remaining balance (equal to keep with no loan).
  const refiPayment = amortize(p.loan_balance, apr, LOAN_MONTHS);
  const refinance = keep - p.monthly_payment + refiPayment;

  const candidates: [Analysis["recommendation"], number][] = [["keep", keep]];
  if (refinance < keep) candidates.push(["refinance", refinance]);
  if (tradeAffordable && best.monthly_cost < keep) candidates.push(["trade", best.monthly_cost]);
  const recommendation = candidates.reduce((a, b) => (b[1] < a[1] ? b : a))[0];

  const car = `${p.vehicle_year} ${p.vehicle_model}`;
  const summary = {
    keep: `Repairing your ${car} costs about ${money(keep)} a month over three years, less than trading in (${money(best.monthly_cost)}).`,
    refinance: `Keeping your ${car} and refinancing the loan brings it to about ${money(refinance)} a month, the lowest of your options.`,
    trade: `Trading in for a ${best.name} costs about ${money(best.monthly_cost)} a month, less than keeping your ${car} (${money(keep)}).`,
  }[recommendation];

  return {
    profile_id: CUSTOM_PROFILE_ID,
    recommendation,
    result: {
      keepResult: r2(keep), refinanceResult: r2(refinance), tradeResult: best.monthly_cost,
      repair_ratio: carValue ? repairCost / carValue : 0, pr_runway: spend ? (savings - repairCost) / spend : 0,
      remaining_life: Math.max(0, 1 - p.mileage / 200000), new_payment: best.new_payment, refi_payment: r2(refiPayment),
      suggested_models: options, trade_affordable: tradeAffordable,
    },
    new_monthly_payment: best.new_payment,
    suggested_models: recommendation === "trade" ? options : null,
    apr,
    down_payment: pfo.down_payment ?? null,
    affordability: {
      monthly_income: r2(income), monthly_spend: r2(spend), savings_balance: savings, monthly_surplus: r2(income - spend),
      runway_months: spend ? Math.round((savings / spend) * 10) / 10 : 0, can_afford_payment: maxPayment > 0, max_comfortable_payment: r2(maxPayment),
    },
    market: {
      current_vehicle_value_low: vehicle.private_sale_low, current_vehicle_value_high: vehicle.private_sale_high,
      scheduled_maintenance: [], replacement_options: REPLACEMENTS.map(({ name, price, kind }) => ({ name, price, kind })), repair_quotes: [],
    },
    option_explanations: {
      keep: { brief: `Fix it and keep driving for about ${money(keep)} a month.`, details: `The ${money(repairCost)} repair spread over three years, plus maintenance and likely repairs on a ${p.mileage.toLocaleString()}-mile car${p.monthly_payment ? `, plus your ${money(p.monthly_payment)} car payment` : ""}.` },
      trade: { brief: `A ${best.name} for about ${money(best.monthly_cost)} a month.`, details: `${money(best.down_payment)} down, then ${money(best.new_payment)} a month for 60 months after your ${money(carValue)} trade-in.${tradeAffordable ? "" : ` That's more than the ${money(maxPayment)} a month your budget comfortably allows.`}` },
      refinance: { brief: p.loan_balance ? `Refinance your loan: about ${money(refinance)} a month.` : "No car loan to refinance.", details: p.loan_balance ? `Your ${money(p.loan_balance)} balance re-spread over 60 months at ${(apr * 100).toFixed(1)}% APR is ${money(refiPayment)} a month.` : "Refinancing only helps when there's a loan on the car." },
    },
    option_notes: {
      keep: { available: true, pros: ["No new loan", `About ${money(keep)} a month`], cons: [`${money(repairCost)} up front for the repair`] },
      trade: { available: true, pros: [`A new ${best.name}`, `${money(carValue)} trade-in toward it`], cons: [`${money(best.new_payment)} a month for 60 months`, ...(tradeAffordable ? [] : ["More than your budget comfortably allows"])] },
      refinance: p.loan_balance
        ? { available: true, pros: [`Lower payment: ${money(refiPayment)} a month`], cons: ["Still pay for the repair", "Longer loan term"] }
        : { available: false, pros: [], cons: [] },
    },
    repair: quote?.repair ?? null,
    car_value: carValue,
    explanation: `${summary} Estimates, not financial advice.`,
    explanation_details: `Repair estimate ${money(repairCost)} on a car worth about ${money(carValue)} as a trade-in. Monthly cost over three years: keep ${money(keep)}, trade ${money(best.monthly_cost)}${p.loan_balance ? `, refinance ${money(refinance)}` : ""}. Comfortable new payment: up to ${money(maxPayment)} a month.`,
    curve: [],
    crossover_month: null,
  };
}
