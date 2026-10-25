"use client";

import { useCallback, useEffect, useState } from "react";
import type { BankSnapshot, PreQuoteSurveyResult } from "./service";
import { EMPTY_SITUATION, type SituationAnswers } from "./situation";

// Under the nextmove:v1:assessment prefix so clearAssessment() in lib/demo/session.ts wipes it.
const KEY = "nextmove:v1:assessment:advisor";

export type AdvisorView = "open" | "minimized" | "closed";
export type AdvisorStep = "intro" | "problem" | "situation" | "options";

export type ReportedIssue = { text: string; reportedAt: string; estimateFileName: string | null };

export type AdvisorState = {
  view: AdvisorView;
  step: AdvisorStep;
  problem: string;
  survey: PreQuoteSurveyResult | null;
  surveyMocked: boolean;
  estimateFileName: string | null;
  situation: SituationAnswers;
  situationCard: number;
  // Saved when step 1 is submitted; shown under "Current issues" on the dashboard.
  reportedIssue: ReportedIssue | null;
  // Bank connection (mock Nessie). bankModal opens the connect window over the page.
  bank: BankSnapshot | null;
  bankSkipped: boolean;
  bankModal: boolean;
};

const INITIAL: AdvisorState = { view: "closed", step: "intro", problem: "", survey: null, surveyMocked: false, estimateFileName: null, situation: EMPTY_SITUATION, situationCard: 0, reportedIssue: null, bank: null, bankSkipped: false, bankModal: false };

export function useAdvisorState() {
  const [state, setState] = useState<AdvisorState>(INITIAL);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AdvisorState>;
        const step = saved.step === "problem" || saved.step === "situation" || saved.step === "options" ? saved.step : "intro";
        setState({ ...INITIAL, ...saved, step, situation: { ...EMPTY_SITUATION, ...saved.situation } });
      }
    } catch {}
  }, []);

  const update = useCallback((patch: Partial<AdvisorState>) => {
    setState((s) => {
      const next = { ...s, ...patch };
      try { window.sessionStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Storage is cleared by clearAssessment(); this resets the in-memory copy to match.
  const reset = useCallback(() => setState(INITIAL), []);

  return { state, update, reset };
}
