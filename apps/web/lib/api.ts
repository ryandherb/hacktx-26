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
  replacement_options: { name: string; price: number; kind: string }[];
  repair_quotes: { shop: string; estimate: number; source: string }[];
};

export type KRTResult = {
  keepResult: number;
  refinanceResult: number;
  tradeResult: number;
}

export type Analysis = {
  profile_id: string;
  curve: CurvePoint[];
  crossover_month: number | null;
  result: KRTResult
  recommendation: "keep" | "replace_now" | "replace_later";
  affordability: Affordability;
  market: Market;
  explanation: string;
};

export type CarFund = {
  account_id: string;
  monthly_amount: number;
  target_amount: number;
  simulated: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const getProfiles = () => request<Profile[]>("/profiles");

export const analyze = (profile_id: string, horizon_months = 36) =>
  request<Analysis>("/analyze", {
    method: "POST",
    body: JSON.stringify({ profile_id, horizon_months }),
  });

export const createCarFund = (
  profile_id: string,
  monthly_amount: number,
  target_amount: number,
) =>
  request<CarFund>("/car-fund", {
    method: "POST",
    body: JSON.stringify({ profile_id, monthly_amount, target_amount }),
  });
