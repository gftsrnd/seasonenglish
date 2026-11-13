import type {
  AssessmentDecisionInput, AssessmentDecisionView, AssessmentDeletionRequestView, AssessmentLevelChangeInput,
  AssessmentLevelChangeView, AssessmentLevelFormDeleteView, AssessmentLevelFormDetailView,
  AssessmentLevelFormSlotView, AssessmentLevelFormUpdateInput, AssessmentLevelFormView, AssessmentLevelUpOverrideView, AssessmentMonthlyGoalView, AssessmentFormPreviewCollectionView,
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
import type { ReopenRequestView, MonthFrameworkReopenRequestView, MonthlyResourceEditInput, MonthlyFinalDraftView, MonthlyFinalUpdateInput, MonthlyOperatorOverviewView, SharedMonthBriefView } from "@e4s/contracts";
import type { MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { request, uploadMultipart } from "./runtime.js";

export type AssessmentAudioReadView = AudioArtifactView & {
  url?: string | null;
  sourceFlow?: "placement" | "daily_lesson" | "weekly_practice" | "season" | null;
  sourceEntityId?: string | null;
  taskKey?: string | null;
  questionKey?: string | null;
};

/** What the manual resource pool took over from an unfinished AI generation checkpoint. */
export type MonthlyResourceCheckpointPrefillView = {
  source: "checkpoint";
  generationId: string;
  updatedAt: string;
  categories: Record<"coreTerms" | "expandedTerms" | "grammarTopics" | "pronunciationTargets", number>;
};

export type MonthlyResourceCheckpointView = {
  progress?: import("@e4s/contracts").MonthlyResourceGenerationProgress | null;
  state: "draft_checkpoint" | "not_started";
  draftOnly: true;
  publishable: false;
  retryOnlyMissing: true;
  generationId: string | null;
  version: number | null;
  briefVersion: number | null;
  updatedAt: string | null;
  /** Consecutive unfinished generation runs on this checkpoint (older APIs omit it). */
  failedAttempts?: number;
  categories: Record<"coreTerms" | "expandedTerms" | "grammarTopics" | "pronunciationTargets", { state: "complete" | "missing"; count: number; target: number }>;
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
  setAssessmentReviewLevelUpOverride?(learnerId: string, input: { allowed: boolean; reason: string }): Promise<AssessmentLevelUpOverrideView>;
  requestAssessmentReviewLearnerDeletion(learnerId: string, reason: string): Promise<AssessmentDeletionRequestView>;
  decideAssessment(attemptId: string, input: AssessmentDecisionInput): Promise<AssessmentDecisionView>;
  resolveTopicReport(reportId: string): Promise<{ saved: boolean }>;
  getAssessmentLevelForms(): Promise<AssessmentLevelFormSlotView[]>;
  getAssessmentFormPreviews(kind: "placement" | "level_up" | "final" | "pass_course"): Promise<AssessmentFormPreviewCollectionView>;
  getAssessmentLevelForm(versionId: string): Promise<AssessmentLevelFormDetailView>;
  generateAssessmentLevelForm(targetLevel: Exclude<CefrLevel, "A1">): Promise<AssessmentLevelFormView>;
  createManualAssessmentLevelForm(targetLevel: Exclude<CefrLevel, "A1">): Promise<AssessmentLevelFormView>;
  updateAssessmentLevelForm(versionId: string, input: AssessmentLevelFormUpdateInput): Promise<AssessmentLevelFormDetailView>;
  copyAssessmentLevelFormToDraft(versionId: string): Promise<AssessmentLevelFormDetailView>;
  publishAssessmentLevelForm(versionId: string, confirmation?: { answersReviewed: true }): Promise<AssessmentLevelFormView>;
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
  getContentMonth(month: string): Promise<MonthlyOperatorOverviewView>;
  getCurrentContentMonth?(): Promise<MonthlyOperatorOverviewView>;
  previewContentMonthPublication?(id: string): Promise<import("@e4s/contracts").MonthlyPublicationPreviewView>;
  publishContentMonth?(id: string, confirmedOn: string): Promise<{ publishedOn: string }>;
  dismissExerciseWarning?(id: string): Promise<void>;
  correctExerciseWarning?(id: string, exerciseVersionId: string, correction: import("@e4s/contracts").LessonExerciseCorrectionInput): Promise<void>;
  suggestContentMonthBrief(month: string): Promise<SharedMonthBriefView>;
  saveContentMonthBrief(month: string, input: { title: string; brief: string; context: string; communicationGoal: string }): Promise<SharedMonthBriefView>;
  approveContentMonthBrief(month: string): Promise<void>;
  saveContentMonthFramework(month: string, contract: MonthlyCurriculumContract): Promise<{ id: string; cefr: CefrLevel; version: number; status: "draft"; scopeHash: string }>;
  generateContentMonthResources(month: string, criteria: { cefr: CefrLevel; vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number }): Promise<{ id: string; cefr: CefrLevel; version: number; status: "draft"; scopeHash: string }>;
  getContentMonthResourceCheckpoint(month: string, cefr: CefrLevel): Promise<MonthlyResourceCheckpointView>;
  /** 409 MONTHLY_ILLUSTRATIONS_IN_PROGRESS (with `pending`) while pictures are drawn, unless `confirmIllustrationsInProgress`. */
  approveContentMonthFramework(id: string, input?: { confirmIllustrationsInProgress?: boolean }): Promise<void>;
  /** Asks a Manager to reopen approved monthly resources (409 when a request is already pending). */
  getOwnReopenRequests(): Promise<{ requests: ReopenRequestView[] }>;
  getOwnDeletionRequests(): Promise<{ requests: AssessmentDeletionRequestView[] }>;
  requestContentMonthResourcesReopen(id: string, reason: string): Promise<MonthFrameworkReopenRequestView>;
  /** Saves an Operator hand-edit of a DRAFT resource pool; 422 carries per-row `issues`. */
  saveContentMonthResources?(id: string, input: MonthlyResourceEditInput): Promise<{ id: string; cefr: CefrLevel; version: number; status: "draft"; scopeHash: string }>;
  getManualContentMonthResources?(month: string, cefr: CefrLevel): Promise<NonNullable<import("@e4s/contracts").MonthFrameworkView["resources"]> & { theme: { version: number }; prefill?: MonthlyResourceCheckpointPrefillView }>;
  createManualContentMonthResources?(month: string, cefr: CefrLevel, input: MonthlyResourceEditInput): Promise<unknown>;
  getMonthlyFinal(id: string): Promise<MonthlyFinalDraftView>;
  /** Core-word illustrations of a monthly framework (generated while resources are a draft, frozen on approval). */
  getMonthlyIllustrations?(id: string): Promise<MonthlyIllustrationsView>;
  generateMonthlyIllustrations?(id: string, input?: { words?: string[]; hint?: string }): Promise<{ started: boolean; count: number }>;
  setMonthlyIllustration?(id: string, input: { word: string; artifactKey: string }): Promise<{ images: MonthlyIllustrationView[] }>;
  /** Removes one core word's picture while the resources are still a draft. */
  removeMonthlyIllustration?(id: string, input: { word: string }): Promise<{ images: MonthlyIllustrationView[] }>;
  generateMonthlyFinal(id: string): Promise<MonthlyFinalDraftView>;
  composeMonthlyFinal(id: string): Promise<MonthlyFinalDraftView>;
  updateMonthlyFinal(versionId: string, input: MonthlyFinalUpdateInput): Promise<MonthlyFinalDraftView>;
  publishMonthlyFinal(versionId: string): Promise<{ versionId: string; publishedAt: string }>;
  synthesizeAssessmentEdgeTts(input: { text: string; voice: string }): Promise<{ filename: string; mimeType: string; base64: string }>;
  saveContentMonthDay(id: string, dayNumber: number, lesson: { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> }): Promise<{ severe: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; light: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; contractVersion: number }>;
  generateContentMonthDay(id: string, dayNumber: number): Promise<{ lesson: { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> }; report: { severe: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; light: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; contractVersion: number } }>;
  generateContentMonthReview(id: string, dayNumber: number): Promise<{ lesson: { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> }; report: { severe: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; light: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; contractVersion: number } }>;
  acknowledgeContentMonthQuality(id: string, dayNumber: number, findingKeys: string[]): Promise<void>;
  approveContentMonthDay(id: string, dayNumber: number): Promise<void>;
  createContentMonthCorrection(id: string, dayNumber: number, reason: string): Promise<{ id: string; status: "authorized" }>;
  saveContentMonthCorrection(id: string, dayNumber: number, correctionId: string, lesson: { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> }): Promise<{ severe: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; light: Array<{ severity: "severe" | "light"; code: string; message: string; dayNumber?: number; component?: string }>; contractVersion: number }>;
  acknowledgeContentMonthCorrection(correctionId: string, findingKeys: string[]): Promise<void>;
  approveContentMonthCorrection(correctionId: string): Promise<void>;
  saveContentLessonDraft(week: number, cefr: CefrLevel, lessons: ContentLessonDraftInput[]): Promise<ContentLessonSetVersionView>;
  generateContentLessonDraft(week: number, cefr: CefrLevel): Promise<ContentLessonSetVersionView>;
  generateContentLessonWeekBatch?(week: number, levels?: CefrLevel[]): Promise<{
    weekNumber: number;
    levels: Array<{
      cefr: CefrLevel;
      status: "completed" | "resumed" | "partial" | "failed";
      completedDays?: number[];
      resumedDays?: number[];
      version?: ContentLessonSetVersionView;
      partialDraft?: ContentLessonSetVersionView;
      error?: { code: string; message?: string };
    }>;
  }>;
  submitContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  publishContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  retireContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  getContentReview(): Promise<ContentReviewView>;
  getContentReviewAppeals(input: { id: string } | { status: "all" | "pending" | "handled"; offset: number }): Promise<{ appeals: ContentReviewView["appeals"]; hasMore: boolean }>;
  getContentReviewAssessment(attemptId: string): Promise<ContentReviewAssessmentDetailView>;
  setContentReviewChecked(kind: "submission" | "coach", id: string, checked: boolean): Promise<{ checked: boolean }>;
  deleteReviewedMicroLesson(id: string): Promise<void>;
  gradeReviewedSubmission(id: string, input: { meaning: number; vocabulary: number; grammar: number; feedback: string }): Promise<{ saved: boolean }>;
  gradeReviewedSubmissionAi(id: string, requestId?: string): Promise<ContentReviewAiGradeJobView>;
  deleteContentReviewAppeal(id: string): Promise<void>;
  decideAssessmentAppeal(id: string, input: { status: "accepted" | "rejected"; resolution: string }): Promise<unknown>;
  decideReviewedAppeal(id: string, input: { status: "accepted" | "rejected"; resolution: string; newScore?: number; exerciseCorrection?: import("@e4s/contracts").LessonExerciseCorrectionInput }): Promise<{ saved: boolean }>;
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
  setAssessmentReviewLevelUpOverride: (learnerId, input) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/level-up-override`, { method: "PUT", body: JSON.stringify(input) }),
  requestAssessmentReviewLearnerDeletion: (learnerId, reason) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/deletion-requests`, { method: "POST", body: JSON.stringify({ reason }) }),
  decideAssessment: (attemptId, input) => request(`/api/v1/assessment-reviews/${encodeURIComponent(attemptId)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  resolveTopicReport: (reportId) => request(`/api/v1/assessment-reviews/topic-reports/${encodeURIComponent(reportId)}/resolution`, { method: "POST", body: "{}" }),
  getAssessmentLevelForms: () => request("/api/v1/assessment-level-forms"),
  getAssessmentFormPreviews: (kind) => request(`/api/v1/assessment-form-previews/${encodeURIComponent(kind)}`),
  getAssessmentLevelForm: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}`),
  generateAssessmentLevelForm: (targetLevel) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(targetLevel)}/generate`, { method: "POST", body: "{}" }),
  createManualAssessmentLevelForm: (targetLevel) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(targetLevel)}/manual-draft`, { method: "POST", body: "{}" }),
  updateAssessmentLevelForm: (versionId, input) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}`, { method: "PUT", body: JSON.stringify(input) }),
  copyAssessmentLevelFormToDraft: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}/draft`, { method: "POST", body: "{}" }),
  publishAssessmentLevelForm: (versionId, confirmation) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}/publication`, { method: "POST", body: JSON.stringify(confirmation ?? {}) }),
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
  getContentMonth: (month) => request(`/api/v1/content/months/${encodeURIComponent(month)}`),
  suggestContentMonthBrief: (month) => request(`/api/v1/content/months/${encodeURIComponent(month)}/brief/suggest`, { method: "POST", body: "{}" }),
  saveContentMonthBrief: (month, input) => request(`/api/v1/content/months/${encodeURIComponent(month)}/brief`, { method: "PUT", body: JSON.stringify(input) }),
  approveContentMonthBrief: async (month) => { await request(`/api/v1/content/months/${encodeURIComponent(month)}/brief/approve`, { method: "POST", body: "{}" }); },
  saveContentMonthFramework: (month, contract) => request(`/api/v1/content/months/${encodeURIComponent(month)}/frameworks/generate`, { method: "POST", body: JSON.stringify({ contract }) }),
  generateContentMonthResources: (month, criteria) => request(`/api/v1/content/months/${encodeURIComponent(month)}/resources/generate`, { method: "POST", body: JSON.stringify(criteria) }),
  getContentMonthResourceCheckpoint: (month, cefr) => request(`/api/v1/content/months/${encodeURIComponent(month)}/resources/checkpoint?cefr=${encodeURIComponent(cefr)}`),
  approveContentMonthFramework: async (id, input = {}) => { await request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify(input) }); },
  getOwnReopenRequests: () => request("/api/v1/content/reopen-requests"),
  getOwnDeletionRequests: () => request("/api/v1/assessment-reviews/deletion-requests"),
  requestContentMonthResourcesReopen: (id, reason) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/reopen-requests`, { method: "POST", body: JSON.stringify({ reason }) }),
  saveContentMonthResources: (id, input) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/resources`, { method: "PUT", body: JSON.stringify(input) }),
  getCurrentContentMonth: () => request("/api/v1/content/months"),
  getManualContentMonthResources: (month, cefr) => request(`/api/v1/content/months/${encodeURIComponent(month)}/resources/manual?cefr=${encodeURIComponent(cefr)}`),
  createManualContentMonthResources: (month, cefr, input) => request(`/api/v1/content/months/${encodeURIComponent(month)}/resources/manual?cefr=${encodeURIComponent(cefr)}`, { method: "PUT", body: JSON.stringify(input) }),
  previewContentMonthPublication: (id) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/publication-preview`),
  publishContentMonth: (id, confirmedOn) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/publication`, { method: "POST", body: JSON.stringify({ confirmedOn }) }),
  dismissExerciseWarning: (id) => request(`/api/v1/content/review/exercise-warnings/${encodeURIComponent(id)}/no-issue`, { method: "POST", body: "{}" }),
  correctExerciseWarning: (id, exerciseVersionId, correction) => request(`/api/v1/content/review/exercise-warnings/${encodeURIComponent(id)}/correction`, { method: "PUT", body: JSON.stringify({ exerciseVersionId, correction }) }),
  getMonthlyFinal: (id) => request(`/api/v1/month-frameworks/${encodeURIComponent(id)}/monthly-final`),
  getMonthlyIllustrations: (id) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/illustrations`),
  generateMonthlyIllustrations: (id, input = {}) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/illustrations/generate`, { method: "POST", body: JSON.stringify(input) }),
  setMonthlyIllustration: (id, input) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/illustrations`, { method: "PUT", body: JSON.stringify(input) }),
  removeMonthlyIllustration: (id, input) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/illustrations`, { method: "DELETE", body: JSON.stringify(input) }),
  generateMonthlyFinal: (id) => request(`/api/v1/month-frameworks/${encodeURIComponent(id)}/monthly-final`, { method: "POST", body: "{}" }),
  composeMonthlyFinal: (id) => request(`/api/v1/month-frameworks/${encodeURIComponent(id)}/monthly-final/manual`, { method: "POST", body: "{}" }),
  updateMonthlyFinal: (versionId, input) => request(`/api/v1/monthly-final-forms/${encodeURIComponent(versionId)}`, { method: "PUT", body: JSON.stringify(input) }),
  publishMonthlyFinal: (versionId) => request(`/api/v1/monthly-final-forms/${encodeURIComponent(versionId)}/publication`, { method: "POST", body: "{}" }),
  synthesizeAssessmentEdgeTts: (input) => request("/api/v1/assessment-audio/edge-tts", { method: "POST", body: JSON.stringify(input) }),
  saveContentMonthDay: (id, dayNumber, lesson) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/days/${dayNumber}`, { method: "PUT", body: JSON.stringify(lesson) }),
  generateContentMonthDay: (id, dayNumber) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/days/${dayNumber}/generate`, { method: "POST", body: "{}" }),
  generateContentMonthReview: (id, dayNumber) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/reviews/${dayNumber}/generate`, { method: "POST", body: "{}" }),
  acknowledgeContentMonthQuality: async (id, dayNumber, findingKeys) => { await request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/days/${dayNumber}/quality-acknowledgement`, { method: "POST", body: JSON.stringify({ findingKeys }) }); },
  approveContentMonthDay: async (id, dayNumber) => { await request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/days/${dayNumber}/approve`, { method: "POST", body: "{}" }); },
  createContentMonthCorrection: (id, dayNumber, reason) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/days/${dayNumber}/corrections`, { method: "POST", body: JSON.stringify({ reason }) }),
  saveContentMonthCorrection: (id, dayNumber, correctionId, lesson) => request(`/api/v1/content/month-frameworks/${encodeURIComponent(id)}/days/${dayNumber}/corrections/${encodeURIComponent(correctionId)}`, { method: "PUT", body: JSON.stringify(lesson) }),
  acknowledgeContentMonthCorrection: async (correctionId, findingKeys) => { await request(`/api/v1/content/monthly-corrections/${encodeURIComponent(correctionId)}/quality-acknowledgement`, { method: "POST", body: JSON.stringify({ findingKeys }) }); },
  approveContentMonthCorrection: async (correctionId) => { await request(`/api/v1/content/monthly-corrections/${encodeURIComponent(correctionId)}/approve`, { method: "POST", body: "{}" }); },
  saveContentLessonDraft: (week, cefr, lessons) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft`, { method: "PUT", body: JSON.stringify({ lessons }) }),
  generateContentLessonDraft: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/generate`, { method: "POST", body: "{}" }),
  generateContentLessonWeekBatch: (week, levels) => request(`/api/v1/content/lesson-sets/${week}/generate`, { method: "POST", body: JSON.stringify(levels?.length ? { levels } : {}) }),
  submitContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/review`, { method: "POST", body: "{}" }),
  publishContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/publication`, { method: "POST", body: "{}" }),
  retireContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/retirement`, { method: "POST", body: "{}" }),
  getContentReview: () => request("/api/v1/content/review"),
  getContentReviewAppeals: input => {
    const query = "id" in input
      ? new URLSearchParams({ id: input.id })
      : new URLSearchParams({ status: input.status, offset: String(input.offset) });
    return request(`/api/v1/content/review/appeals?${query}`);
  },
  getContentReviewAssessment: (attemptId) => request(`/api/v1/content/review/assessments/${encodeURIComponent(attemptId)}`),
  setContentReviewChecked: (kind, id, checked) => request(`/api/v1/content/review/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ checked }) }),
  deleteReviewedMicroLesson: (id) => request(`/api/v1/content/review/micro/${encodeURIComponent(id)}`, { method: "DELETE" }),
  gradeReviewedSubmission: (id, input) => request(`/api/v1/content/review/submissions/${encodeURIComponent(id)}/manual-grade`, { method: "POST", body: JSON.stringify(input) }),
  gradeReviewedSubmissionAi: (id, requestId) => request(`/api/v1/content/review/submissions/${encodeURIComponent(id)}/ai-grade`, { method: "POST", body: JSON.stringify(requestId ? { requestId } : {}) }),
  deleteContentReviewAppeal: id => request(`/api/v1/content/review/appeals/${encodeURIComponent(id)}`, { method: "DELETE" }),
  decideAssessmentAppeal: (id, input) => request(`/api/v1/assessment-appeals/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  decideReviewedAppeal: (id, input) => request(`/api/v1/content/review/appeals/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  getContentPrompts: () => request("/api/v1/content/prompts"),
  saveContentPrompts: (groups) => request("/api/v1/content/prompts", { method: "PUT", body: JSON.stringify({ groups }) }),
  publishContentPrompt: (key, version) => request(`/api/v1/content/prompts/${encodeURIComponent(key)}/${version}/publication`, { method: "POST", body: "{}" }),
  getSystemCapabilities: () => request("/api/v1/system/capabilities"),
  uploadContentMedia: (kind, file, filename) => uploadMultipart(`/api/v1/files/content-media/${kind}`, file, filename)
};

export interface MonthlyIllustrationView {
  coreTermId: string;
  word: string;
  meaning: string;
  status: "missing" | "pending" | "generating" | "ready" | "failed";
  source?: "ai" | "upload";
  url?: string;
  error?: string;
  /** This word's picture can no longer change (approved with a picture). A word without one stays fillable after approval. */
  locked: boolean;
}

export interface MonthlyIllustrationsView {
  images: MonthlyIllustrationView[];
  running: boolean;
  available: boolean;
  model: string | null;
  /** Resources approved: existing pictures are frozen. */
  locked?: boolean;
  /** Words that can still get a picture (missing/failed/interrupted). */
  fillable?: number;
}
