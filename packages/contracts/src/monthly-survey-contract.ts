export const MONTHLY_SURVEY_LIMITS = {
  title: 120,
  prompt: 300,
  questions: 20,
  options: 10,
  option: 120,
  answer: 2_000,
  ratingMax: 5
} as const;

export type MonthlySurveyQuestion = {
  prompt: string;
  required: boolean;
} & ({ kind: "text" | "rating" } | { kind: "single_choice"; options: string[] });

export interface MonthlySurveyDefinition {
  title: string;
  questions: MonthlySurveyQuestion[];
}

interface MonthlySurveyRevision extends MonthlySurveyDefinition {
  month: string;
  revision: number;
  version: number;
}

export interface MonthlySurveyDraft extends MonthlySurveyRevision {
  publishedAt: null;
}

export interface MonthlySurveyPublished extends MonthlySurveyRevision {
  publishedAt: string;
}

export interface MonthlySurveyDraftInput extends MonthlySurveyDefinition {
  baseRevision: number;
  version: number | null;
}

export interface MonthlySurveyAnswer {
  questionIndex: number;
  value: number | string;
}

export interface MonthlySurveySubmissionInput {
  revision: number;
  answers: MonthlySurveyAnswer[];
}

export interface MonthlySurveySubmission extends MonthlySurveySubmissionInput {
  submittedAt: string;
}

export interface ManagerMonthlySurveyView {
  currentMonth: string;
  month: string;
  previousPublishedMonth: string | null;
  draft: MonthlySurveyDraft | null;
  publishedForms: MonthlySurveyPublished[];
  submissions: (MonthlySurveySubmission & { learnerId: string; learnerName: string })[];
}

export interface LearnerMonthlySurveysView {
  currentMonth: string;
  surveys: { form: MonthlySurveyPublished; submission: MonthlySurveySubmission | null }[];
}
