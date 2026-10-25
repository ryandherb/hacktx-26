// Frontend-only display data for demo profiles. Backend profile fields (name, vehicle, mileage,
// loan) come from GET /profiles; this file adds presentation (greeting, trim, image) keyed by
// the backend profile id. Edit freely: everything here is placeholder demo data.
import type { Profile } from "@/lib/api";

// The two profiles shown in the demo. The backend seeds three; the third is unintended.
export const DEMO_PROFILE_IDS = ["maria", "dev"];

export type ProfileDisplay = {
  firstName: string;
  trim: string;
  color: string;
  ownership: string;
  location: string;
  // Preset "on file" credit estimate for the demo (financial info is preset, not asked).
  creditOnFile: string;
  // PLACEHOLDER: same 2025 Camry image for everyone until real model-year photos are supplied.
  imageSrc: string;
};

export const PROFILE_DISPLAY: Record<string, ProfileDisplay> = {
  maria: { firstName: "Maria", trim: "LE", color: "Barcelona Red Metallic", ownership: "Owned", location: "Austin, TX", creditOnFile: "740+", imageSrc: "/cars/placeholder.png" },
  dev: { firstName: "Dev", trim: "LE", color: "Barcelona Red Metallic", ownership: "Owned", location: "Austin, TX", creditOnFile: "580–669", imageSrc: "/cars/placeholder.png" },
};

export const displayFor = (p: Profile): ProfileDisplay =>
  PROFILE_DISPLAY[p.id] ?? {
    firstName: p.name.split(" ")[0],
    trim: "",
    color: "",
    ownership: p.loan_balance ? "Financed" : "Owned",
    location: p.zip_code,
    creditOnFile: "Unknown",
    imageSrc: "/cars/placeholder.png",
  };

// MOCK fallback copy of apps/api/app/seeds/toyota_profiles.json, used only when the API is unreachable.
export const MOCK_PROFILES: Profile[] = [
  { id: "maria", name: "Maria (stable earner)", vehicle_model: "Camry", vehicle_year: 2012, mileage: 148000, zip_code: "78705", loan_balance: 0, monthly_payment: 0, open_issue: "transmission slipping" },
  { id: "dev", name: "Dev (tight budget)", vehicle_model: "Corolla", vehicle_year: 2010, mileage: 171000, zip_code: "78741", loan_balance: 0, monthly_payment: 0, open_issue: "A/C compressor failing" },
];
