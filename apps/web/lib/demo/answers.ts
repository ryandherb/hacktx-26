// Preset demo INPUTS (never results), keyed by profile id and stable topic id.
// "Insert demo answer" fills these into the active question; the presenter still submits.
import type { SituationAnswers } from "@/lib/advisor/situation";

export type DemoTopic = "repair_description";

// Sample shop quotes for "Use sample dealer estimate" when the Cost Agent says a quote is needed.
export const DEMO_SHOP_QUOTES: Record<string, { amount: number; shop: string }> = {
  maria: { amount: 1850, shop: "Central TX Auto Care" },
  dev: { amount: 1450, shop: "South Austin Auto A/C" },
};

// The sample mechanic's quote documents in public/demo, matched by shop and amount, so the
// repair plan can name the job and link the document.
export const SAMPLE_QUOTE_DOCS: { shop: string; amount: number; title: string; href: string }[] = [
  { shop: "South Austin Auto A/C", amount: 1450, title: "A/C compressor replacement", href: "/demo/sample-mechanic-quote.pdf" },
];

export const DEMO_ANSWERS: Record<string, Partial<Record<DemoTopic, string>>> = {
  maria: { repair_description: "Transmission slips when shifting from 2nd to 3rd, and the RPMs jump on the highway." },
  dev: { repair_description: "A/C blows warm air, and there's a grinding noise when it kicks on." },
};

export const demoAnswer = (profileId: string, topic: DemoTopic) => DEMO_ANSWERS[profileId]?.[topic] ?? null;

export const DEMO_SITUATION: Record<string, Partial<SituationAnswers>> = {
  maria: {
    life_change: ["new_job"],
    job_start: "1–3 months",
    expected_take_home: 4800,
    keep_horizon: "1–3 years",
    down_payment: 6000,
    credit_band: "740+",
    car_reliance: "Daily commute",
  },
  dev: {
    life_change: ["graduating", "internship"],
    internship_duration: "3–6 months",
    keep_horizon: "As long as it runs",
    down_payment: 500,
    credit_band: "580–669",
    car_reliance: "Daily commute",
  },
};
