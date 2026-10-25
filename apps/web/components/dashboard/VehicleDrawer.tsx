"use client";

import type { Profile } from "@/lib/api";
import type { ProfileDisplay } from "@/lib/demo/profiles";
import SideDrawer from "./SideDrawer";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = { open: boolean; onClose: () => void; profile: Profile; display: ProfileDisplay; label: string };

export default function VehicleDrawer({ open, onClose, profile, display, label }: Props) {
  // Trim, color, ownership, and location are frontend demo overlays; the rest comes from the backend.
  const rows: [string, string][] = [
    ["Year", String(profile.vehicle_year)],
    ["Model", profile.vehicle_model],
    ["Trim", display.trim || "Not provided"],
    ["Color", display.color || "Not provided"],
    ["Ownership", display.ownership],
    ["Location", display.location],
    ["Mileage", `${profile.mileage.toLocaleString()} mi`],
    ["Home ZIP", profile.zip_code],
    ["Loan balance", profile.loan_balance ? money(profile.loan_balance) : "None (paid off)"],
    ["Monthly payment", profile.monthly_payment ? `${money(profile.monthly_payment)}/mo` : "None"],
    ["Open issue", profile.open_issue ?? "None reported"],
  ];

  return (
    <SideDrawer open={open} onClose={onClose} title={label} closeLabel="Close vehicle details">
      <dl className="mt-6 divide-y divide-neutral-200">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-3 text-sm">
            <dt className="text-neutral-600">{k}</dt>
            <dd className="text-right font-bold text-black">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-xs text-neutral-500">Fictional demo data.</p>
    </SideDrawer>
  );
}
