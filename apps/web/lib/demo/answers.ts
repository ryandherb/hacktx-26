// Preset demo INPUTS (never results), keyed by profile id and stable topic id.
// "Insert demo answer" fills these into the active question; the presenter still submits.
import type { SituationAnswers } from "@/lib/advisor/situation";

export type DemoTopic = "repair_description";

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
