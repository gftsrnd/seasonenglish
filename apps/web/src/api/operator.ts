import type { ApiClient } from "../api-client.js";
import { request } from "./runtime.js";

export type OperatorApiClient = Pick<ApiClient,
  "getAssessmentReviewOverview" | "getAssessmentReviewLearner" | "getAssessmentReviewAttempt" | "getAssessmentReviewChallenge" |
  "rescoreAssessment" | "changeAssessmentReviewLearnerLevel" | "updateAssessmentReviewMonthlyGoal" |
  "requestAssessmentReviewLearnerDeletion" | "decideAssessment" | "resolveTopicReport" |
  "getAssessmentLevelForms" | "getAssessmentLevelForm" | "generateAssessmentLevelForm" | "publishAssessmentLevelForm" | "deleteAssessmentLevelForm" |
  "getContentWeeks" | "saveContentWeeks" | "suggestContentWeeks" | "getContentLessonMatrix" | "getContentLessonSet" |
  "upsertContentLessonDay" | "deleteContentLessonDay" | "saveContentLessonJson" | "enrichContentLessonDraft" |
  "fillContentLessonPhrases" | "deleteContentLessonDraftSet" | "saveContentLessonDraft" | "generateContentLessonDraft" |
  "submitContentLessonSet" | "publishContentLessonSet" | "retireContentLessonSet" | "getContentReview" |
  "getContentReviewAssessment" | "setContentReviewChecked" | "deleteReviewedMicroLesson" | "gradeReviewedSubmission" |
  "gradeReviewedSubmissionAi" | "decideReviewedAppeal" | "getContentPrompts" | "saveContentPrompts" | "getSystemCapabilities"
>;

export const operatorApiClient: OperatorApiClient = {
  getAssessmentReviewOverview: () => request("/api/v1/assessment-reviews/overview"),
  getAssessmentReviewLearner: (learnerId) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}`),
  getAssessmentReviewAttempt: (attemptId) => request(`/api/v1/assessment-reviews/attempts/${encodeURIComponent(attemptId)}`),
  getAssessmentReviewChallenge: (attemptId) => request(`/api/v1/assessment-reviews/challenges/${encodeURIComponent(attemptId)}`),
  rescoreAssessment: (attemptId, requestId) => request(`/api/v1/assessment-reviews/${encodeURIComponent(attemptId)}/rescore`, { method: "POST", body: JSON.stringify({ requestId }) }),
  changeAssessmentReviewLearnerLevel: (learnerId, input) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/level`, { method: "PATCH", body: JSON.stringify(input) }),
  updateAssessmentReviewMonthlyGoal: (learnerId, monthlyGoal) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/monthly-goal`, { method: "PATCH", body: JSON.stringify({ monthlyGoal }) }),
  requestAssessmentReviewLearnerDeletion: (learnerId, reason) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/deletion-requests`, { method: "POST", body: JSON.stringify({ reason }) }),
  decideAssessment: (attemptId, input) => request(`/api/v1/assessment-reviews/${encodeURIComponent(attemptId)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  resolveTopicReport: (reportId) => request(`/api/v1/assessment-reviews/topic-reports/${encodeURIComponent(reportId)}/resolution`, { method: "POST", body: "{}" }),
  getAssessmentLevelForms: () => request("/api/v1/assessment-level-forms"),
  getAssessmentLevelForm: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}`),
  generateAssessmentLevelForm: (targetLevel) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(targetLevel)}/generate`, { method: "POST", body: "{}" }),
  publishAssessmentLevelForm: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}/publication`, { method: "POST", body: "{}" }),
  deleteAssessmentLevelForm: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}`, { method: "DELETE" }),
  getContentWeeks: () => request("/api/v1/content/weeks"),
  saveContentWeeks: (weeks) => request("/api/v1/content/weeks", { method: "PUT", body: JSON.stringify({ weeks }) }),
  suggestContentWeeks: (weekNumbers) => request("/api/v1/content/weeks/suggestions", { method: "POST", body: JSON.stringify({ weekNumbers }) }),
  getContentLessonMatrix: () => request("/api/v1/content/lesson-matrix"),
  getContentLessonSet: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}`),
  upsertContentLessonDay: (week, cefr, dayNumber, lesson, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/lessons/${dayNumber}`, { method: "PUT", body: JSON.stringify({ ...lesson, ...(expectedVersion === undefined ? {} : { expectedVersion }) }) }),
  deleteContentLessonDay: (week, cefr, dayNumber, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/lessons/${dayNumber}`, { method: "DELETE", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion }) }),
  saveContentLessonJson: (week, cefr, lessons, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/json`, { method: "PUT", body: JSON.stringify({ lessons, ...(expectedVersion === undefined ? {} : { expectedVersion }) }) }),
  enrichContentLessonDraft: (week, cefr, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/enrich`, { method: "POST", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion }) }),
  fillContentLessonPhrases: (week, cefr, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/fill-phrases`, { method: "POST", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion }) }),
  deleteContentLessonDraftSet: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft`, { method: "DELETE", body: "{}" }),
  saveContentLessonDraft: (week, cefr, lessons) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft`, { method: "PUT", body: JSON.stringify({ lessons }) }),
  generateContentLessonDraft: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/generate`, { method: "POST", body: "{}" }),
  submitContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/review`, { method: "POST", body: "{}" }),
  publishContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/publication`, { method: "POST", body: "{}" }),
  retireContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/retirement`, { method: "POST", body: "{}" }),
  getContentReview: () => request("/api/v1/content/review"),
  getContentReviewAssessment: (attemptId) => request(`/api/v1/content/review/assessments/${encodeURIComponent(attemptId)}`),
  setContentReviewChecked: (kind, id, checked) => request(`/api/v1/content/review/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ checked }) }),
  deleteReviewedMicroLesson: (id) => request(`/api/v1/content/review/micro/${encodeURIComponent(id)}`, { method: "DELETE" }),
  gradeReviewedSubmission: (id, input) => request(`/api/v1/content/review/submissions/${encodeURIComponent(id)}/manual-grade`, { method: "POST", body: JSON.stringify(input) }),
  gradeReviewedSubmissionAi: (id, requestId) => request(`/api/v1/content/review/submissions/${encodeURIComponent(id)}/ai-grade`, { method: "POST", body: JSON.stringify(requestId ? { requestId } : {}) }),
  decideReviewedAppeal: (id, input) => request(`/api/v1/content/review/appeals/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  getContentPrompts: () => request("/api/v1/content/prompts"),
  saveContentPrompts: (groups) => request("/api/v1/content/prompts", { method: "PUT", body: JSON.stringify({ groups }) }),
  getSystemCapabilities: () => request("/api/v1/system/capabilities")
};
