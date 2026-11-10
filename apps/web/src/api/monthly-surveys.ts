import type {
  LearnerMonthlySurveysView,
  ManagerMonthlySurveyView,
  MonthlySurveyDraft,
  MonthlySurveyDraftInput,
  MonthlySurveyPublished,
  MonthlySurveySubmission,
  MonthlySurveySubmissionInput
} from "@e4s/contracts";
import { request } from "./runtime.js";

const managerPath = "/api/v1/manager/monthly-surveys";
const learnerPath = "/api/v1/learner/monthly-surveys";

export const monthlySurveyApi = {
  getManager: (month?: string, signal?: AbortSignal) =>
    request<ManagerMonthlySurveyView>(month ? `${managerPath}?month=${encodeURIComponent(month)}` : managerPath, { signal: signal ?? null }),
  saveDraft: (month: string, input: MonthlySurveyDraftInput) =>
    request<MonthlySurveyDraft>(`${managerPath}/${month}/draft`, { method: "PUT", body: JSON.stringify(input) }),
  copyPrevious: (month: string, baseRevision: number) =>
    request<MonthlySurveyDraft>(`${managerPath}/${month}/copy-previous`, { method: "POST", body: JSON.stringify({ baseRevision }) }),
  publish: (month: string, revision: number, version: number) =>
    request<MonthlySurveyPublished>(`${managerPath}/${month}/publish`, { method: "POST", body: JSON.stringify({ revision, version }) }),
  getLearner: (signal?: AbortSignal) => request<LearnerMonthlySurveysView>(learnerPath, { signal: signal ?? null }),
  submit: (month: string, input: MonthlySurveySubmissionInput) =>
    request<MonthlySurveySubmission>(`${learnerPath}/${month}/submissions`, { method: "POST", body: JSON.stringify(input) })
};
