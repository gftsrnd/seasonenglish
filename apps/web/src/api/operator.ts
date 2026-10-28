import type {
  AssessmentDecisionInput, AssessmentDecisionView, AssessmentDeletionRequestView, AssessmentLevelChangeInput,
  AssessmentLevelChangeView, AssessmentLevelFormDeleteView, AssessmentLevelFormDetailView,
  AssessmentLevelFormSlotView, AssessmentLevelFormView, AssessmentMonthlyGoalView,
  AssessmentReviewAttemptDetailView, AssessmentReviewChallengeView, AssessmentReviewLearnerView,
  AssessmentReviewOverviewView, CefrLevel, ContentLessonDraftInput, ContentLessonMatrixView,
  ContentLessonMutationResult, ContentLessonSetVersionView, ContentPromptKey, ContentPromptSettingsView,
  ContentWeeklyPracticeDraftInput,
  ContentReviewAiGradeJobView, ContentReviewAssessmentDetailView, ContentReviewView, ContentWeekFrameView,
  ContentImageView,
  AudioArtifactView,
  ManualAssessmentScoreInput,
  ContentWeekInput, ContentWeekSuggestionView, SystemCapabilitiesView, WeeklyPracticeAssignmentView
} from "@e4s/contracts";
import { request, uploadMultipart } from "./runtime.js";

export type AssessmentAudioReadView = AudioArtifactView & {
  url?: string | null;
  sourceFlow?: "placement" | "daily_lesson" | "weekly_practice" | "season" | null;
  sourceEntityId?: string | null;
  taskKey?: string | null;
  questionKey?: string | null;
};

export interface OperatorApiClient {
  getAssessmentReviewOverview(): Promise<AssessmentReviewOverviewView>;
  getAssessmentReviewLearner(learnerId: string): Promise<AssessmentReviewLearnerView>;
  assignAssessmentReviewWeeklyPractice(learnerId: string): Promise<WeeklyPracticeAssignmentView>;
  getAssessmentReviewAttempt(attemptId: string): Promise<AssessmentReviewAttemptDetailView>;
  getAssessmentReviewChallenge(attemptId: string): Promise<AssessmentReviewChallengeView>;
  listAssessmentAudio?(filters?: { learnerId?: string; sourceFlow?: "placement" | "daily_lesson" | "weekly_practice" | "season" }): Promise<{ items: AssessmentAudioReadView[] }>;
  getAssessmentAudioReadUrl?(artifactKey: string): Promise<AssessmentAudioReadView>;
  confirmAssessmentAudioDeletion?(fileId: string): Promise<{ confirmationToken: string; expiresAt: string }>;
  deleteAssessmentAudio?(fileId: string, confirmationToken: string): Promise<AssessmentAudioReadView & { deleted?: boolean }>;
  manualScoreAssessment?(attemptId: string, input: ManualAssessmentScoreInput): Promise<AssessmentReviewAttemptDetailView>;
  rescoreAssessment(attemptId: string, requestId: string): Promise<AssessmentReviewAttemptDetailView>;
  changeAssessmentReviewLearnerLevel(learnerId: string, input: AssessmentLevelChangeInput): Promise<AssessmentLevelChangeView>;
  updateAssessmentReviewMonthlyGoal(learnerId: string, monthlyGoal: string): Promise<AssessmentMonthlyGoalView>;
  requestAssessmentReviewLearnerDeletion(learnerId: string, reason: string): Promise<AssessmentDeletionRequestView>;
  decideAssessment(attemptId: string, input: AssessmentDecisionInput): Promise<AssessmentDecisionView>;
  resolveTopicReport(reportId: string): Promise<{ saved: boolean }>;
  getAssessmentLevelForms(): Promise<AssessmentLevelFormSlotView[]>;
  getAssessmentLevelForm(versionId: string): Promise<AssessmentLevelFormDetailView>;
  generateAssessmentLevelForm(targetLevel: Exclude<CefrLevel, "A1">): Promise<AssessmentLevelFormView>;
  publishAssessmentLevelForm(versionId: string): Promise<AssessmentLevelFormView>;
  deleteAssessmentLevelForm(versionId: string): Promise<AssessmentLevelFormDeleteView>;
  getContentWeeks(): Promise<ContentWeekFrameView>;
  saveContentWeeks(weeks: ContentWeekInput[]): Promise<ContentWeekFrameView>;
  suggestContentWeeks(weekNumbers: number[]): Promise<{ weeks: ContentWeekSuggestionView[] }>;
  getContentLessonMatrix(): Promise<ContentLessonMatrixView>;
  setContentLessonLevels(levels: CefrLevel[]): Promise<ContentLessonMatrixView>;
  getContentLessonSet(week: number, cefr: CefrLevel): Promise<ContentLessonSetVersionView>;
  resolveContentLessonVocabularyImage?(week: number, cefr: CefrLevel, lessonId: string, itemIndex: number): Promise<ContentImageView>;
  upsertContentLessonDay(week: number, cefr: CefrLevel, dayNumber: number, lesson: ContentLessonDraftInput, expectedVersion?: number): Promise<ContentLessonMutationResult>;
  deleteContentLessonDay(week: number, cefr: CefrLevel, dayNumber: number, expectedVersion?: number): Promise<ContentLessonMutationResult>;
  saveContentLessonJson(week: number, cefr: CefrLevel, lessons: ContentLessonDraftInput[], expectedVersion?: number): Promise<ContentLessonMutationResult>;
  saveContentWeeklyPractice(week: number, cefr: CefrLevel, input: ContentWeeklyPracticeDraftInput): Promise<ContentLessonMutationResult>;
  enrichContentLessonDraft(week: number, cefr: CefrLevel, expectedVersion?: number): Promise<ContentLessonMutationResult>;
  enrichContentLessonDay?(week: number, cefr: CefrLevel, dayNumber: number, expectedVersion?: number): Promise<ContentLessonMutationResult>;
  fillContentLessonPhrases(week: number, cefr: CefrLevel, expectedVersion?: number): Promise<ContentLessonMutationResult>;
  deleteContentLessonDraftSet(week: number, cefr: CefrLevel): Promise<{ deleted: true }>;
  saveContentLessonDraft(week: number, cefr: CefrLevel, lessons: ContentLessonDraftInput[]): Promise<ContentLessonSetVersionView>;
  generateContentLessonDraft(week: number, cefr: CefrLevel): Promise<ContentLessonSetVersionView>;
  submitContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  publishContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  retireContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  getContentReview(): Promise<ContentReviewView>;
  getContentReviewAssessment(attemptId: string): Promise<ContentReviewAssessmentDetailView>;
  setContentReviewChecked(kind: "submission" | "coach", id: string, checked: boolean): Promise<{ checked: boolean }>;
  deleteReviewedMicroLesson(id: string): Promise<void>;
  gradeReviewedSubmission(id: string, input: { meaning: number; vocabulary: number; grammar: number; feedback: string }): Promise<{ saved: boolean }>;
  gradeReviewedSubmissionAi(id: string, requestId?: string): Promise<ContentReviewAiGradeJobView>;
  decideReviewedAppeal(id: string, input: { status: "accepted" | "rejected"; resolution: string; newScore?: number }): Promise<{ saved: boolean }>;
  getContentPrompts(): Promise<ContentPromptSettingsView>;
  saveContentPrompts(groups: Array<{ key: ContentPromptKey; content: string }>): Promise<ContentPromptSettingsView>;
  publishContentPrompt(key: ContentPromptKey, version: number): Promise<ContentPromptSettingsView["groups"][number]>;
  getSystemCapabilities(): Promise<SystemCapabilitiesView>;
  uploadContentMedia(kind: "audio" | "image", file: Blob, filename: string): Promise<{ artifactKey: string; url: string }>;
}

export const operatorApiClient: OperatorApiClient = {
  getAssessmentReviewOverview: () => request("/api/v1/assessment-reviews/overview"),
  getAssessmentReviewLearner: (learnerId) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}`),
  assignAssessmentReviewWeeklyPractice: (learnerId) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/weekly-practice`, { method: "POST", body: "{}" }),
  getAssessmentReviewAttempt: (attemptId) => request(`/api/v1/assessment-reviews/attempts/${encodeURIComponent(attemptId)}`),
  getAssessmentReviewChallenge: (attemptId) => request(`/api/v1/assessment-reviews/challenges/${encodeURIComponent(attemptId)}`),
  listAssessmentAudio: (filters) => {
    const query = new URLSearchParams();
    if (filters?.learnerId) query.set("learnerId", filters.learnerId);
    if (filters?.sourceFlow) query.set("sourceFlow", filters.sourceFlow);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/api/v1/files/assessment-audio${suffix}`);
  },
  getAssessmentAudioReadUrl: (artifactKey) => request(`/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`),
  confirmAssessmentAudioDeletion: (fileId) => request(`/api/v1/files/assessment-audio/${encodeURIComponent(fileId)}/delete-confirmation`, { method: "POST", body: "{}" }),
  deleteAssessmentAudio: (fileId, confirmationToken) => request(`/api/v1/files/assessment-audio/${encodeURIComponent(fileId)}`, { method: "DELETE", body: JSON.stringify({ confirmationToken }) }),
  manualScoreAssessment: (attemptId, input) => request(`/api/v1/assessment-reviews/${encodeURIComponent(attemptId)}/manual-score`, { method: "POST", body: JSON.stringify(input) }),
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
  setContentLessonLevels: (levels) => request("/api/v1/content/lesson-levels", { method: "PUT", body: JSON.stringify({ levels }) }),
  getContentLessonSet: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}`),
  resolveContentLessonVocabularyImage: (week, cefr, lessonId, itemIndex) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/lessons/${encodeURIComponent(lessonId)}/vocabulary/${itemIndex}/image`),
  upsertContentLessonDay: (week, cefr, dayNumber, lesson, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/lessons/${dayNumber}`, { method: "PUT", body: JSON.stringify({ ...lesson, ...(expectedVersion === undefined ? {} : { expectedVersion }) }) }),
  deleteContentLessonDay: (week, cefr, dayNumber, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/lessons/${dayNumber}`, { method: "DELETE", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion }) }),
  saveContentLessonJson: (week, cefr, lessons, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/json`, { method: "PUT", body: JSON.stringify({ lessons, ...(expectedVersion === undefined ? {} : { expectedVersion }) }) }),
  saveContentWeeklyPractice: (week, cefr, input) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/weekly-practice`, { method: "PUT", body: JSON.stringify(input) }),
  enrichContentLessonDraft: (week, cefr, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/enrich`, { method: "POST", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion }) }),
  enrichContentLessonDay: (week, cefr, dayNumber, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/enrich`, { method: "POST", body: JSON.stringify({ dayNumber, ...(expectedVersion === undefined ? {} : { expectedVersion }) }) }),
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
  publishContentPrompt: (key, version) => request(`/api/v1/content/prompts/${encodeURIComponent(key)}/${version}/publication`, { method: "POST", body: "{}" }),
  getSystemCapabilities: () => request("/api/v1/system/capabilities"),
  uploadContentMedia: (kind, file, filename) => uploadMultipart(`/api/v1/files/content-media/${kind}`, file, filename)
};
