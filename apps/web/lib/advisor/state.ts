"use client";

import { useCallback, useEffect, useState } from "react";
import type { Analysis } from "@/lib/api";
import type { BankSnapshot, CostQuoteResult, ManualQuote, PreQuoteSurveyResult } from "./service";
import { EMPTY_SITUATION, type SituationAnswers } from "./situation";

// Under the nextmove:v1:assessment prefix so clearAssessment() in lib/demo/session.ts wipes it.
const KEY = "nextmove:v1:assessment:advisor";

export type AdvisorView = "open" | "minimized" | "closed";
export type AdvisorStep = "intro" | "problem" | "estimate" | "situation" | "options";

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
  // Cost Agent result for the reported problem (issue #2), and any shop quote the user entered.
  quote: CostQuoteResult | null;
  quoteMocked: boolean;
  manualQuote: ManualQuote | null;
  // Bank connection (mock Nessie). bankModal opens the connect window over the page.
  bank: BankSnapshot | null;
  bankSkipped: boolean;
  bankModal: boolean;
  // /analyze result for step 3, and which full-width page is slid into view
  // (optionsPage: the "Your options" overview; planPage: the plan for the recommended option).
  options: Analysis | null;
  optionsMocked: boolean;
  optionsPage: boolean;
  planPage: boolean;
};

const INITIAL: AdvisorState = { view: "closed", step: "intro", problem: "", survey: null, surveyMocked: false, estimateFileName: null, situation: EMPTY_SITUATION, situationCard: 0, reportedIssue: null, quote: null, quoteMocked: false, manualQuote: null, bank: null, bankSkipped: false, bankModal: false, options: null, optionsMocked: false, optionsPage: false, planPage: false };

export function useAdvisorState() {
  const [state, setState] = useState<AdvisorState>(INITIAL);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AdvisorState>;
        const step = saved.step && ["problem", "estimate", "situation", "options"].includes(saved.step) ? saved.step : "intro";
        // Results saved by an older build had a different shape; drop them.
        const options = saved.options && "result" in saved.options ? saved.options : null;
        setState({ ...INITIAL, ...saved, step, options, ...(options ? {} : { optionsPage: false, planPage: false }), situation: { ...EMPTY_SITUATION, ...saved.situation } });
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
