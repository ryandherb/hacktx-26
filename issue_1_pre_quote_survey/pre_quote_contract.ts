// Pre-quote backend contract for the frontend team; no survey UI is implemented here.
export type PreQuoteInput = {
  repair_type: string;
  vehicle_model: string;
  vehicle_year: number;
  location: string;
};

export type PreQuoteSurveyAnswers = {
  [K in keyof PreQuoteInput]: PreQuoteInput[K] | null;
};

export type PreQuoteSurveyRequest = {
  profile_id?: string | null;
  answers?: Partial<PreQuoteSurveyAnswers>;
};

export type PreQuoteSurveyQuestion = {
  field: keyof PreQuoteInput;
  prompt: string;
  input_type: "text" | "number";
};

export type PreQuoteSurveyResult = {
  profile_id: string | null;
  answers: PreQuoteSurveyAnswers;
  missing_fields: (keyof PreQuoteInput)[];
  questions: PreQuoteSurveyQuestion[];
  complete: boolean;
  quote_input: PreQuoteInput | null;
};
