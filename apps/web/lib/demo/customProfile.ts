// The judge's own profile ("Create your own profile"), saved in this browser's localStorage so it
// survives reloads. Frontend-only: the backend seeds don't know it, so service.ts sends its vehicle
// facts directly (no profile_id) and every mock has a path for it. Nothing here leaves the browser.
import type { Profile } from "@/lib/api";
import type { ProfileDisplay } from "./profiles";

export const CUSTOM_PROFILE_ID = "custom";

// Not under nextmove:v1:assessment, so clearAssessment() never wipes the profile itself.
const KEY = "nextmove:v1:custom-profile";

export type CustomFinances = {
  monthlyIncome: number; // take-home, USD/month
  monthlySpending: number; // everything, including car insurance, USD/month
  checking: number;
  savings: number;
  carInsurance: number | null; // USD/month
};

export type CustomProfile = { profile: Profile; display: ProfileDisplay; finances: CustomFinances };

// Raw form values (strings, as typed). toCustomProfile() validates and converts them.
export type CustomProfileForm = {
  firstName: string;
  vehicleModel: string;
  vehicleYear: string;
  trim: string;
  color: string;
  mileage: string;
  zipCode: string;
  city: string;
  loanBalance: string;
  monthlyPayment: string;
  openIssue: string;
  monthlyIncome: string;
  monthlySpending: string;
  checking: string;
  savings: string;
  carInsurance: string;
};

// Locked to the Camry: those are the only car photos we have.
export const CUSTOM_MODEL = "Camry";
export const MIN_YEAR = 1990;

// Older Camrys use the 2012 photo, newer ones the current-generation photo.
const camryImage = (year: number) =>
  year <= 2017
    ? { imageSrc: "/cars/camry-2012.png", imagePlaceholder: year !== 2012 }
    : { imageSrc: "/cars/placeholder.png", imagePlaceholder: year < 2025 };
export const MAX_YEAR = new Date().getFullYear() + 1;

export const EMPTY_FORM: CustomProfileForm = {
  firstName: "", vehicleModel: CUSTOM_MODEL, vehicleYear: "", trim: "", color: "", mileage: "", zipCode: "", city: "",
  loanBalance: "", monthlyPayment: "", openIssue: "", monthlyIncome: "", monthlySpending: "", checking: "", savings: "", carInsurance: "",
};

// "Fill with sample" values for a quick demo.
export const SAMPLE_FORM: CustomProfileForm = {
  firstName: "Alex", vehicleModel: CUSTOM_MODEL, vehicleYear: "2015", trim: "XSE", color: "Celestial Silver Metallic", mileage: "126000", zipCode: "78702", city: "Austin, TX",
  loanBalance: "", monthlyPayment: "", openIssue: "Brakes grinding and the pedal feels soft", monthlyIncome: "3900", monthlySpending: "3100", checking: "1800", savings: "5200", carInsurance: "115",
};

export function loadCustomProfile(): CustomProfile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw) as CustomProfile;
      if (c?.profile?.id === CUSTOM_PROFILE_ID && c.profile.vehicle_model === CUSTOM_MODEL && c.display && c.finances) return c;
    }
  } catch {}
  return null;
}

export function saveCustomProfile(c: CustomProfile) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}

export function toForm(c: CustomProfile): CustomProfileForm {
  const s = (n: number | null | undefined) => (n ? String(n) : "");
  const { profile: p, display: d, finances: f } = c;
  return {
    firstName: d.firstName, vehicleModel: p.vehicle_model, vehicleYear: String(p.vehicle_year), trim: d.trim, color: d.color,
    mileage: String(p.mileage), zipCode: p.zip_code, city: d.location === `ZIP ${p.zip_code}` ? "" : d.location,
    loanBalance: s(p.loan_balance), monthlyPayment: s(p.monthly_payment), openIssue: p.open_issue ?? "",
    monthlyIncome: String(f.monthlyIncome), monthlySpending: String(f.monthlySpending), checking: s(f.checking), savings: s(f.savings), carInsurance: s(f.carInsurance),
  };
}

export type FormErrors = Partial<Record<keyof CustomProfileForm, string>>;

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[,$\s]/g, "")));

// Returns the profile, or the per-field errors to show.
export function toCustomProfile(f: CustomProfileForm): { ok: true; value: CustomProfile } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const need = (k: keyof CustomProfileForm, max: number, label: string, required = true) => {
    const n = num(f[k]);
    if (n == null) { if (required) errors[k] = `Enter ${label}.`; return 0; }
    if (!Number.isFinite(n) || n < 0 || n > max) { errors[k] = `Enter ${label} between 0 and ${max.toLocaleString()}.`; return 0; }
    return Math.round(n);
  };

  const firstName = f.firstName.trim();
  if (!firstName) errors.firstName = "Enter a first name.";
  const year = num(f.vehicleYear);
  if (year == null || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) errors.vehicleYear = `Enter a year from ${MIN_YEAR} to ${MAX_YEAR}.`;
  const mileage = need("mileage", 500000, "the mileage");
  const zip = f.zipCode.trim();
  if (!/^\d{5}$/.test(zip)) errors.zipCode = "Enter a 5-digit ZIP code.";
  const loanBalance = need("loanBalance", 200000, "a loan balance", false);
  const monthlyPayment = need("monthlyPayment", 5000, "a monthly payment", false);
  if (loanBalance > 0 && monthlyPayment === 0 && !errors.monthlyPayment) errors.monthlyPayment = "Enter the monthly payment for your loan.";
  const monthlyIncome = need("monthlyIncome", 100000, "your monthly take-home pay");
  const monthlySpending = need("monthlySpending", 100000, "your monthly spending");
  const checking = need("checking", 1000000, "a checking balance", false);
  const savings = need("savings", 1000000, "a savings balance", false);
  const insurance = need("carInsurance", 2000, "a monthly insurance cost", false);

  if (Object.keys(errors).length) return { ok: false, errors };

  const profile: Profile = {
    id: CUSTOM_PROFILE_ID,
    name: `${firstName} (your profile)`,
    vehicle_model: CUSTOM_MODEL,
    vehicle_year: year!,
    mileage,
    zip_code: zip,
    loan_balance: loanBalance,
    monthly_payment: monthlyPayment,
    open_issue: f.openIssue.trim() || null,
    insurance_premium: insurance || null,
  };
  const display: ProfileDisplay = {
    firstName,
    trim: f.trim.trim(),
    color: f.color.trim(),
    ownership: loanBalance > 0 ? "Financed" : "Owned",
    location: f.city.trim() || `ZIP ${zip}`,
    ...camryImage(year!),
  };
  const finances: CustomFinances = { monthlyIncome, monthlySpending, checking, savings, carInsurance: insurance || null };
  return { ok: true, value: { profile, display, finances } };
}
