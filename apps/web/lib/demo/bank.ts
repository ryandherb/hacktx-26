// MOCK bank data for the demo "connect your bank" flow. Numbers copied from the team's
// apps/api/app/fixtures/nessie.json (origin/main) so the frontend matches the backend fixtures.
// Replace with a real Nessie-backed endpoint once the backend exposes one.

export type BankTxn = { amount: number; date: string; description: string };
export type BankAccount = { id: string; type: "Checking" | "Savings"; mask: string; balance: number };
export type BankFixture = { customerMask: string; accounts: BankAccount[]; deposits: BankTxn[]; purchases: BankTxn[] };

export const BANK_FIXTURES: Record<string, BankFixture> = {
  maria: {
    customerMask: "3F2A",
    accounts: [
      { id: "acc-maria-chk", type: "Checking", mask: "4821", balance: 4200 },
      { id: "acc-maria-sav", type: "Savings", mask: "1190", balance: 9800 },
    ],
    deposits: [
      { amount: 4600, date: "2026-08-01", description: "Payroll" },
      { amount: 4600, date: "2026-09-01", description: "Payroll" },
      { amount: 4600, date: "2026-10-01", description: "Payroll" },
    ],
    purchases: [
      { amount: 128, date: "2026-08-05", description: "GEICO auto insurance" },
      { amount: 2972, date: "2026-08-15", description: "Monthly spending" },
      { amount: 128, date: "2026-09-05", description: "GEICO auto insurance" },
      { amount: 3122, date: "2026-09-15", description: "Monthly spending" },
      { amount: 128, date: "2026-10-05", description: "GEICO auto insurance" },
      { amount: 2922, date: "2026-10-15", description: "Monthly spending" },
    ],
  },
  dev: {
    customerMask: "9C71",
    accounts: [
      { id: "acc-dev-chk", type: "Checking", mask: "2207", balance: 650 },
      { id: "acc-dev-sav", type: "Savings", mask: "5534", balance: 900 },
    ],
    deposits: [
      { amount: 2300, date: "2026-08-01", description: "Payroll" },
      { amount: 2100, date: "2026-09-01", description: "Payroll" },
      { amount: 2400, date: "2026-10-01", description: "Payroll" },
    ],
    purchases: [
      { amount: 96, date: "2026-08-05", description: "GEICO auto insurance" },
      { amount: 2054, date: "2026-08-15", description: "Monthly spending" },
      { amount: 96, date: "2026-09-05", description: "GEICO auto insurance" },
      { amount: 2204, date: "2026-09-15", description: "Monthly spending" },
      { amount: 96, date: "2026-10-05", description: "GEICO auto insurance" },
      { amount: 2104, date: "2026-10-15", description: "Monthly spending" },
    ],
  },
};
