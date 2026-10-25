// MOCK Cost Agent for profiles without a captured /quote response (the judge's own profile).
// A small frontend copy of issue_2_cost_agent/app/engine/{cost_tables,repair_costs,vehicle_value}.py
// so any car gets a plausible estimate offline. Delete once POST /quote is mounted on main; the real
// endpoint stays authoritative.
import type { RepairClassification, RepairEstimate, VehicleValue } from "@/lib/advisor/service";

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
  const factor = modelData(vehicleModel).repairMultiplier * ageMult * (region ? LABOR[region] ?? 1 : 1);
  const low = round10(r.low * factor), high = round10(r.high * factor);
  return { source: "table", category, label: r.label, repair_cost_low: low, repair_cost_high: high, repair_cost_estimate: high, region, shop: null };
}

export function valueVehicle(vehicleModel: string, vehicleYear: number, mileage: number): VehicleValue {
  const { msrp, depreciation } = modelData(vehicleModel);
  const age = Math.max(0, new Date().getFullYear() - vehicleYear);
  const mileageAdj = Math.min(1.2, Math.max(0.7, 1 + (0.05 * (age * 12000 - mileage)) / 10000));
  const priv = Math.max(500, msrp * (1 - depreciation) ** age * mileageAdj);
  const trade = Math.max(500, priv * 0.8);
  return {
    vehicle_age_years: age, mileage,
    private_sale_low: round50(priv * 0.9), private_sale_high: round50(priv * 1.1), private_sale_estimate: round50(priv),
    trade_in_low: round50(trade * 0.9), trade_in_high: round50(trade * 1.1), trade_in_estimate: round50(trade),
  };
}
