import type {
  AssessmentAppealView, AssessmentDecisionInput, AssessmentDecisionView, AssessmentKind, AssessmentLevelFormDeleteView, AssessmentLevelFormDetailView, AssessmentLevelFormSlotView, AssessmentLevelFormView,
  AssessmentDeletionRequestView, AssessmentLevelChangeInput, AssessmentLevelChangeView, AssessmentMonthlyGoalView,
  AssessmentResponseView, AssessmentReviewOverviewView, AssessmentRuntimeView, AssessmentSectionCode, AssessmentView,
  AssessmentReviewAttemptDetailView, AssessmentReviewChallengeView, AssessmentReviewLearnerView,
  AssessmentViolationInput,
  CefrLevel, ContentLessonDraftInput, ContentLessonMatrixView, ContentLessonMutationResult, ContentLessonSetVersionView, ContentPromptKey,
  ContentPromptSettingsView, ContentReviewAiGradeJobView, ContentReviewAssessmentDetailView, ContentReviewView, ContentWeekFrameView, ContentWeekInput, ContentWeekSuggestionView,
  CoachMessageInput, CoachPersona, CoachView, LevelChallengeView,
  ArenaView, DuelView, GameFinishInput, GameAnswerInput, GameHubView, GameKey, GameResultView, RewardView, SurveyView, WeeklyPracticeView,
  LearnerAvatarData, LearnerHomeView, LearnerProfileData, LearnerProfileView, LearnerProgressView,
  LessonPartAppealView, LessonPartAttemptEvidenceInput, LessonPartAttemptView, LessonPartCode, LessonProgressView, LessonView, ManagerAccountView, ManagerAccountsView, ManagerDataExportView, ManagerDataImportView, ManagerDeleteRequestsView, ManagerImageTestView, ManagerLearnerProfileView, ManagerMaintenanceConfirmationInput, ManagerMaintenanceConfirmationView, ManagerMaintenanceResultView, ManagerMusicTestView, ManagerOperationsView, ManagerPinReportsView, ManagerPinReportView, ManagerProgressView, ManagerProviderSettingsInput, ManagerProviderSettingsTestInput, ManagerProviderSettingsView, ManagerProviderTestView, ManagerPurgeConfirmationInput, ManagerPurgeConfirmationView, ManagerReminderCopyView, ManagerReminderDismissView, ManagerReminderSendView, ManagerRemindersView, ManagerReportView, ManagerSettingsView, ManagerTrashView, ManagerWebhookTestView, MicroLessonView, ProductPreferencesView, SessionView, SystemCapabilitiesView
} from "@e4s/contracts";
import type { AuthClient, LoginCredentials } from "./features/auth/index.js";
import { request } from "./api/runtime.js";

export type ApiClient = AuthClient & {
  currentSession(): Promise<SessionView>;
  saveSessionAvatar(avatar: LearnerAvatarData): Promise<SessionView>;
  logout(): Promise<void>;
  getProfile(): Promise<LearnerProfileView>;
  saveProfile(profile: LearnerProfileData, version: number): Promise<LearnerProfileView>;
  updateLearnerMonthlyGoal(monthlyGoal: string): Promise<AssessmentMonthlyGoalView>;
  getHome(): Promise<LearnerHomeView>;
  acknowledgeRewardAnnouncement(announcementId: string): Promise<{ acknowledged: true; announcementId: string }>;
  getProgress(): Promise<LearnerProgressView>;
  getLesson(id: string): Promise<LessonView>;
  saveLessonProgress(id: string, progress: LessonProgressView): Promise<LessonProgressView>;
  submitLessonPartAttempt(lessonId: string, partCode: LessonPartCode, requestId: string, evidence: LessonPartAttemptEvidenceInput): Promise<LessonPartAttemptView>;
  appealLessonPart(lessonId: string, partCode: LessonPartCode, reason: string): Promise<LessonPartAppealView>;
  getMicroLesson(id: string): Promise<MicroLessonView>;
  generateMicroLesson(requestId: string, regenerate?: boolean): Promise<MicroLessonView>;
  submitMicroAttempt(id: string, answer: string): Promise<MicroLessonView>;
  completeMicroLesson(id: string): Promise<MicroLessonView>;
  getCoach(): Promise<CoachView>;
  sendCoachMessage(input: CoachMessageInput): Promise<CoachView>;
  setCoachPersona(persona: CoachPersona): Promise<CoachView>;
  clearCoach(): Promise<CoachView>;
  unlockCoachVocabulary(word: string): Promise<CoachView>;
  getLevelChallenge(): Promise<LevelChallengeView>;
  sendLevelChallengeMessage(input: CoachMessageInput): Promise<LevelChallengeView>;
  getWeeklyPractice(): Promise<WeeklyPracticeView>;
  submitWeeklyPractice(input: { requestId: string; text: string }): Promise<WeeklyPracticeView>;
  appealWeeklyPractice(submissionId: string, reason: string): Promise<WeeklyPracticeView>;
  getGames(): Promise<GameHubView>;
  generateGameWordSet(input: { requestId: string; topic: string }): Promise<GameHubView>;
  useWeeklyGameWordSet(): Promise<GameHubView>;
  deleteGameWordSet(): Promise<GameHubView>;
  resolveGameWordImage(setId: string, wordId: string): Promise<{ imageUrl: string | null }>;
  submitGameResult(game: GameKey, input: { requestId: string } & GameFinishInput): Promise<GameResultView>;
  getArena(): Promise<ArenaView>;
  createDuel(input: { opponentId: string; game: Exclude<GameKey, "crossword"> }): Promise<DuelView>;
  getDuel(id: string): Promise<DuelView>;
  submitDuelResult(id: string, input: { requestId: string; answers: GameAnswerInput[] }): Promise<DuelView>;
  getReward(mode: "preview" | "done"): Promise<RewardView>;
  getSurvey(): Promise<SurveyView>;
  submitSurvey(input: { rating: number; comment: string; studyTime: "work" | "outside" | "both" }): Promise<SurveyView>;
  getAssessment(kind: AssessmentKind | "levelup"): Promise<AssessmentView>;
  startAssessment(kind: AssessmentKind | "levelup"): Promise<AssessmentView>;
  uploadAssessmentAudio(file: Blob, filename: string): Promise<{ artifactKey: string }>;
  getAssessmentAudioReadUrl(artifactKey: string): Promise<{ url: string; expiresAt: string }>;
  saveAssessmentResponse(attemptId: string, section: AssessmentSectionCode, taskKey: string, input: {
    value: string; evidenceType: "choice" | "text" | "audio" | "transcript" | "typed_proxy" | "technical_failure"; artifactKey?: string;
  }): Promise<AssessmentResponseView>;
  completeAssessmentSection(attemptId: string, section: AssessmentSectionCode): Promise<AssessmentView>;
  recordAssessmentAudioPlay(attemptId: string, section: AssessmentSectionCode, groupKey: string): Promise<{ playCount: number; remaining: number }>;
  recordAssessmentViolation(attemptId: string, input: AssessmentViolationInput): Promise<AssessmentRuntimeView>;
  submitAssessment(attemptId: string): Promise<AssessmentView>;
  createAssessmentAppeal(attemptId: string, reason: string): Promise<AssessmentAppealView>;
  getAssessmentReviewOverview(): Promise<AssessmentReviewOverviewView>;
  getAssessmentReviewLearner(learnerId: string): Promise<AssessmentReviewLearnerView>;
  getAssessmentReviewAttempt(attemptId: string): Promise<AssessmentReviewAttemptDetailView>;
  getAssessmentReviewChallenge(attemptId: string): Promise<AssessmentReviewChallengeView>;
  rescoreAssessment(attemptId: string, requestId: string): Promise<AssessmentReviewAttemptDetailView>;
  changeAssessmentReviewLearnerLevel(learnerId: string, input: AssessmentLevelChangeInput): Promise<AssessmentLevelChangeView>;
  updateAssessmentReviewMonthlyGoal(learnerId: string, monthlyGoal: string): Promise<AssessmentMonthlyGoalView>;
  requestAssessmentReviewLearnerDeletion(learnerId: string, reason: string): Promise<AssessmentDeletionRequestView>;
  decideAssessment(attemptId: string, input: AssessmentDecisionInput): Promise<AssessmentDecisionView>;
  resolveTopicReport(reportId: string): Promise<{ saved: boolean }>;
  getAssessmentLevelForms(): Promise<AssessmentLevelFormSlotView[]>;
  getAssessmentLevelForm(versionId: string): Promise<AssessmentLevelFormDetailView>;
  getAssessmentLevelFormVersions(targetLevel: Exclude<CefrLevel, "A1">): Promise<AssessmentLevelFormView[]>;
  generateAssessmentLevelForm(targetLevel: Exclude<CefrLevel, "A1">): Promise<AssessmentLevelFormView>;
  publishAssessmentLevelForm(versionId: string): Promise<AssessmentLevelFormView>;
  deleteAssessmentLevelForm(versionId: string): Promise<AssessmentLevelFormDeleteView>;
  getContentWeeks(): Promise<ContentWeekFrameView>;
  saveContentWeeks(weeks: ContentWeekInput[]): Promise<ContentWeekFrameView>;
  suggestContentWeeks(weekNumbers: number[]): Promise<{ weeks: ContentWeekSuggestionView[] }>;
  getContentLessonMatrix(): Promise<ContentLessonMatrixView>;
  getContentLessonSet(week: number, cefr: CefrLevel): Promise<ContentLessonSetVersionView>;
  upsertContentLessonDay(week: number, cefr: CefrLevel, dayNumber: number, lesson: ContentLessonDraftInput, expectedVersion?: number): Promise<ContentLessonMutationResult>;
  deleteContentLessonDay(week: number, cefr: CefrLevel, dayNumber: number, expectedVersion?: number): Promise<ContentLessonMutationResult>;
  saveContentLessonJson(week: number, cefr: CefrLevel, lessons: ContentLessonDraftInput[], expectedVersion?: number): Promise<ContentLessonMutationResult>;
  enrichContentLessonDraft(week: number, cefr: CefrLevel, expectedVersion?: number): Promise<ContentLessonMutationResult>;
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
  decideReviewedAppeal(id: string, input: { status: "accepted" | "rejected"; resolution: string }): Promise<{ saved: boolean }>;
  getContentPrompts(): Promise<ContentPromptSettingsView>;
  saveContentPrompts(groups: Array<{ key: ContentPromptKey; content: string }>): Promise<ContentPromptSettingsView>;
  getManagerProgress(): Promise<ManagerProgressView>;
  getManagerLearnerProfile(learnerId: string): Promise<ManagerLearnerProfileView>;
  getManagerOperations(): Promise<ManagerOperationsView>;
  getManagerDeleteRequests(): Promise<ManagerDeleteRequestsView>;
  decideManagerDeleteRequest(requestId: string, input: { status: "approved" | "rejected"; note: string }): Promise<import("@e4s/contracts").AssessmentDeletionRequestView>;
  getManagerTrash(): Promise<ManagerTrashView>;
  restoreManagerTrashAccount(accountId: string): Promise<ManagerAccountView>;
  requestManagerTrashPurgeConfirmation(accountId: string): Promise<ManagerPurgeConfirmationView>;
  purgeManagerTrashAccount(accountId: string, input: ManagerPurgeConfirmationInput): Promise<void>;
  getManagerPinReports(): Promise<ManagerPinReportsView>;
  createManagerPinReport(input: { accountId: string; note: string }): Promise<ManagerPinReportView>;
  resolveManagerPinReport(reportId: string): Promise<ManagerPinReportView>;
  testManagerImage(input: { source: ProductPreferencesView["vocabImageSource"]; word?: string }): Promise<ManagerImageTestView>;
  clearManagerImageCache(): Promise<{ cleared: number }>;
  testManagerMusic(input: ManagerSettingsView["backgroundMusic"]): Promise<ManagerMusicTestView>;
  resetManagerMusic(): Promise<ManagerSettingsView["backgroundMusic"]>;
  testManagerWebhook(input: { url: string; template: string }): Promise<ManagerWebhookTestView>;
  exportManagerData(): Promise<ManagerDataExportView>;
  importManagerData(snapshot: unknown): Promise<ManagerDataImportView>;
  requestManagerSeedConfirmation(): Promise<ManagerMaintenanceConfirmationView>;
  seedManagerData(input: ManagerMaintenanceConfirmationInput): Promise<ManagerMaintenanceResultView>;
  requestManagerWipeConfirmation(): Promise<ManagerMaintenanceConfirmationView>;
  wipeManagerData(input: ManagerMaintenanceConfirmationInput): Promise<ManagerMaintenanceResultView>;
  getManagerProviderSettings(): Promise<ManagerProviderSettingsView>;
  saveManagerProviderSettings(input: ManagerProviderSettingsInput): Promise<ManagerProviderSettingsView>;
  testManagerProviderSettings(input?: ManagerProviderSettingsTestInput): Promise<ManagerProviderTestView>;
  getManagerAccounts(): Promise<ManagerAccountsView>;
  createManagerAccount(input: { displayName: string; email: string; role: ManagerAccountView["role"]; password: string }): Promise<ManagerAccountView>;
  updateManagerAccountRole(accountId: string, role: ManagerAccountView["role"]): Promise<ManagerAccountView>;
  updateManagerAccountStatus(accountId: string, status: "active" | "disabled" | "deleted"): Promise<ManagerAccountView>;
  resetManagerAccountPassword(accountId: string, password: string): Promise<{ saved: boolean }>;
  getManagerReminders(): Promise<ManagerRemindersView>;
  sendManagerReminder(learnerId: string, requestId: string): Promise<ManagerReminderSendView>;
  dismissManagerReminder(learnerId: string): Promise<ManagerReminderDismissView>;
  copyManagerReminder(learnerId: string): Promise<ManagerReminderCopyView>;
  getManagerReport(): Promise<ManagerReportView>;
  getManagerSettings(): Promise<ManagerSettingsView>;
  saveManagerSettings(input: Omit<ManagerSettingsView, "organizationName">): Promise<ManagerSettingsView>;
  getSystemCapabilities(): Promise<SystemCapabilitiesView>;
  getProductPreferences(): Promise<ProductPreferencesView>;
  saveProductPreferences(input: ProductPreferencesView): Promise<ProductPreferencesView>;
};

export const apiClient: ApiClient = {
  learnerLogin: (input: LoginCredentials) => request("/api/auth/learner/login", { method: "POST", body: JSON.stringify(input) }),
  staffLogin: (input: LoginCredentials) => request("/api/auth/staff/login", { method: "POST", body: JSON.stringify(input) }),
  currentSession: () => request("/api/session"),
  saveSessionAvatar: (avatar) => request("/api/v1/me/avatar", { method: "PATCH", body: JSON.stringify(avatar) }),
  logout: () => request("/api/logout", { method: "POST", body: "{}" }),
  getProfile: () => request("/api/v1/learner/profile"),
  saveProfile: (profile, version) => request("/api/v1/learner/profile", { method: "PUT", body: JSON.stringify({ ...profile, version }) }),
  updateLearnerMonthlyGoal: (monthlyGoal) => request("/api/v1/learner/monthly-goal", { method: "PATCH", body: JSON.stringify({ monthlyGoal }) }),
  getHome: () => request("/api/v1/learner/home"),
  acknowledgeRewardAnnouncement: (announcementId) => request("/api/v1/learner/reward-announcement/acknowledge", {
    method: "POST", body: JSON.stringify({ announcementId })
  }),
  getProgress: () => request("/api/v1/learner/progress"),
  getLesson: (id) => request(`/api/v1/lessons/${encodeURIComponent(id)}`),
  saveLessonProgress: (id, progress) => request(`/api/v1/lessons/${encodeURIComponent(id)}/progress`, {
    method: "PUT",
    body: JSON.stringify({
      completedPartCodes: progress.completedPartCodes,
      evidence: progress.evidence,
      markComplete: progress.status === "completed",
      ...(progress.score === undefined ? {} : { score: progress.score })
    })
  }),
  submitLessonPartAttempt: (lessonId, partCode, requestId, evidence) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/parts/${encodeURIComponent(partCode)}/attempts`, {
    method: "POST", body: JSON.stringify({ requestId, evidence })
  }),
  appealLessonPart: (lessonId, partCode, reason) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/parts/${encodeURIComponent(partCode)}/appeals`, {
    method: "POST", body: JSON.stringify({ reason })
  }),
  getMicroLesson: (id) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}`),
  generateMicroLesson: (requestId, regenerate = false) => request("/api/v1/micro-lessons", {
    method: "POST", body: JSON.stringify({ requestId, ...(regenerate ? { regenerate: true } : {}) })
  }),
  submitMicroAttempt: (id, answer) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}/attempts`, {
    method: "POST", body: JSON.stringify({ answer })
  }),
  completeMicroLesson: (id) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}/complete`, {
    method: "POST", body: "{}"
  }),
  getCoach: () => request("/api/v1/coach"),
  sendCoachMessage: (input) => request("/api/v1/coach/messages", { method: "POST", body: JSON.stringify(input) }),
  setCoachPersona: (persona) => request("/api/v1/coach/persona", { method: "PUT", body: JSON.stringify({ persona }) }),
  clearCoach: () => request("/api/v1/coach/session", { method: "DELETE", body: "{}" }),
  unlockCoachVocabulary: (word) => request(`/api/v1/coach/vocabulary/${encodeURIComponent(word)}/unlock`, { method: "POST", body: "{}" }),
  getLevelChallenge: () => request("/api/v1/challenge"),
  sendLevelChallengeMessage: (input) => request("/api/v1/challenge/messages", { method: "POST", body: JSON.stringify(input) }),
  getWeeklyPractice: () => request("/api/v1/engagement/practice"),
  submitWeeklyPractice: (input) => request("/api/v1/engagement/practice/submit", { method: "POST", body: JSON.stringify(input) }),
  appealWeeklyPractice: (submissionId, reason) => request(`/api/v1/engagement/practice/${encodeURIComponent(submissionId)}/appeals`, { method: "POST", body: JSON.stringify({ reason }) }),
  getGames: () => request("/api/v1/engagement/games"),
  generateGameWordSet: (input) => request("/api/v1/engagement/games/word-set", { method: "POST", body: JSON.stringify(input) }),
  useWeeklyGameWordSet: () => request("/api/v1/engagement/games/word-set", { method: "DELETE", body: "{}" }),
  deleteGameWordSet: () => request("/api/v1/engagement/games/word-set", { method: "DELETE", body: "{}" }),
  resolveGameWordImage: (setId, wordId) => request(`/api/v1/engagement/game-sets/${encodeURIComponent(setId)}/words/${encodeURIComponent(wordId)}/image`),
  submitGameResult: (game, input) => request(`/api/v1/engagement/games/${encodeURIComponent(game)}/results`, { method: "POST", body: JSON.stringify(input) }),
  getArena: () => request("/api/v1/engagement/arena"),
  createDuel: (input) => request("/api/v1/engagement/duels", { method: "POST", body: JSON.stringify(input) }),
  getDuel: (id) => request(`/api/v1/engagement/duels/${encodeURIComponent(id)}`),
  submitDuelResult: (id, input) => request(`/api/v1/engagement/duels/${encodeURIComponent(id)}/result`, { method: "POST", body: JSON.stringify(input) }),
  getReward: (mode) => request(`/api/v1/engagement/rewards/${mode}`),
  getSurvey: () => request("/api/v1/engagement/survey"),
  submitSurvey: (input) => request("/api/v1/engagement/survey", { method: "POST", body: JSON.stringify(input) }),
  getAssessment: (kind) => request(`/api/v1/assessments/${encodeURIComponent(kind)}`),
  startAssessment: (kind) => request(`/api/v1/assessments/${encodeURIComponent(kind)}/start`, { method: "POST", body: "{}" }),
  uploadAssessmentAudio: async (file, filename) => {
    const body = new FormData();
    body.append("file", file, filename);
    const response = await fetch("/api/v1/files/assessment-audio", { method: "POST", credentials: "include", body });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { code?: string };
      throw new Error(payload.code ?? `HTTP_${response.status}`);
    }
    return response.json() as Promise<{ artifactKey: string }>;
  },
  getAssessmentAudioReadUrl: (artifactKey) => request(
    `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`
  ),
  saveAssessmentResponse: (attemptId, section, taskKey, input) => request(
    `/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/responses/${encodeURIComponent(section)}/${encodeURIComponent(taskKey)}`,
    { method: "PUT", body: JSON.stringify(input) }
  ),
  completeAssessmentSection: (attemptId, section) => request(
    `/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/sections/${encodeURIComponent(section)}/complete`,
    { method: "POST", body: "{}" }
  ),
  recordAssessmentAudioPlay: (attemptId, section, groupKey) => request(
    `/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/sections/${encodeURIComponent(section)}/groups/${encodeURIComponent(groupKey)}/audio-play`,
    { method: "POST", body: "{}" }
  ),
  recordAssessmentViolation: (attemptId, input) => request(
    `/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/violations`,
    { method: "POST", body: JSON.stringify(input) }
  ),
  submitAssessment: (attemptId) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/submit`, {
    method: "POST", body: "{}"
  }),
  createAssessmentAppeal: (attemptId, reason) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/appeals`, {
    method: "POST", body: JSON.stringify({ reason })
  }),
  getAssessmentReviewOverview: () => request("/api/v1/assessment-reviews/overview"),
  getAssessmentReviewLearner: (learnerId) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}`),
  getAssessmentReviewAttempt: (attemptId) => request(`/api/v1/assessment-reviews/attempts/${encodeURIComponent(attemptId)}`),
  getAssessmentReviewChallenge: (attemptId) => request(`/api/v1/assessment-reviews/challenges/${encodeURIComponent(attemptId)}`),
  rescoreAssessment: (attemptId, requestId) => request(`/api/v1/assessment-reviews/${encodeURIComponent(attemptId)}/rescore`, {
    method: "POST", body: JSON.stringify({ requestId })
  }),
  changeAssessmentReviewLearnerLevel: (learnerId, input) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/level`, {
    method: "PATCH", body: JSON.stringify(input)
  }),
  updateAssessmentReviewMonthlyGoal: (learnerId, monthlyGoal) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/monthly-goal`, {
    method: "PATCH", body: JSON.stringify({ monthlyGoal })
  }),
  requestAssessmentReviewLearnerDeletion: (learnerId, reason) => request(`/api/v1/assessment-reviews/learners/${encodeURIComponent(learnerId)}/deletion-requests`, {
    method: "POST", body: JSON.stringify({ reason })
  }),
  decideAssessment: (attemptId, input) => request(`/api/v1/assessment-reviews/${encodeURIComponent(attemptId)}/decision`, {
    method: "POST", body: JSON.stringify(input)
  }),
  resolveTopicReport: (reportId) => request(`/api/v1/assessment-reviews/topic-reports/${encodeURIComponent(reportId)}/resolution`, {
    method: "POST", body: "{}"
  }),
  getAssessmentLevelForms: () => request("/api/v1/assessment-level-forms"),
  getAssessmentLevelForm: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}`),
  getAssessmentLevelFormVersions: (targetLevel) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(targetLevel)}/versions`),
  generateAssessmentLevelForm: (targetLevel) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(targetLevel)}/generate`, { method: "POST", body: "{}" }),
  publishAssessmentLevelForm: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}/publication`, { method: "POST", body: "{}" }),
  deleteAssessmentLevelForm: (versionId) => request(`/api/v1/assessment-level-forms/${encodeURIComponent(versionId)}`, { method: "DELETE" }),
  getContentWeeks: () => request("/api/v1/content/weeks"),
  saveContentWeeks: (weeks) => request("/api/v1/content/weeks", { method: "PUT", body: JSON.stringify({ weeks }) }),
  suggestContentWeeks: (weekNumbers) => request("/api/v1/content/weeks/suggestions", { method: "POST", body: JSON.stringify({ weekNumbers }) }),
  getContentLessonMatrix: () => request("/api/v1/content/lesson-matrix"),
  getContentLessonSet: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}`),
  upsertContentLessonDay: (week, cefr, dayNumber, lesson, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/lessons/${dayNumber}`, {
    method: "PUT", body: JSON.stringify({ ...lesson, ...(expectedVersion === undefined ? {} : { expectedVersion }) })
  }),
  deleteContentLessonDay: (week, cefr, dayNumber, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/lessons/${dayNumber}`, {
    method: "DELETE", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion })
  }),
  saveContentLessonJson: (week, cefr, lessons, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/json`, {
    method: "PUT", body: JSON.stringify({ lessons, ...(expectedVersion === undefined ? {} : { expectedVersion }) })
  }),
  enrichContentLessonDraft: (week, cefr, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/enrich`, {
    method: "POST", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion })
  }),
  fillContentLessonPhrases: (week, cefr, expectedVersion) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft/fill-phrases`, {
    method: "POST", body: JSON.stringify(expectedVersion === undefined ? {} : { expectedVersion })
  }),
  deleteContentLessonDraftSet: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft`, {
    method: "DELETE", body: "{}"
  }),
  saveContentLessonDraft: (week, cefr, lessons) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft`, {
    method: "PUT", body: JSON.stringify({ lessons })
  }),
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
  getManagerProgress: () => request("/api/v1/manager/progress"),
  getManagerLearnerProfile: (learnerId) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}`),
  getManagerOperations: () => request("/api/v1/manager/operations"),
  getManagerDeleteRequests: () => request("/api/v1/manager/delete-requests"),
  decideManagerDeleteRequest: (requestId, input) => request(`/api/v1/manager/delete-requests/${encodeURIComponent(requestId)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  getManagerTrash: () => request("/api/v1/manager/trash"),
  restoreManagerTrashAccount: (accountId) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}/restore`, { method: "POST", body: "{}" }),
  requestManagerTrashPurgeConfirmation: (accountId) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}/purge-confirmation`, { method: "POST", body: "{}" }),
  purgeManagerTrashAccount: (accountId, input) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}`, { method: "DELETE", body: JSON.stringify(input) }),
  getManagerPinReports: () => request("/api/v1/manager/pin-reports"),
  createManagerPinReport: (input) => request("/api/v1/manager/pin-reports", { method: "POST", body: JSON.stringify(input) }),
  resolveManagerPinReport: (reportId) => request(`/api/v1/manager/pin-reports/${encodeURIComponent(reportId)}/resolve`, { method: "POST", body: "{}" }),
  testManagerImage: (input) => request("/api/v1/manager/settings/image-test", { method: "POST", body: JSON.stringify(input) }),
  clearManagerImageCache: () => request("/api/v1/manager/settings/image-cache", { method: "POST", body: "{}" }),
  testManagerMusic: (input) => request("/api/v1/manager/settings/music-test", { method: "POST", body: JSON.stringify(input) }),
  resetManagerMusic: () => request("/api/v1/manager/settings/music-reset", { method: "POST", body: "{}" }),
  testManagerWebhook: (input) => request("/api/v1/manager/settings/webhook-test", { method: "POST", body: JSON.stringify(input) }),
  exportManagerData: () => request("/api/v1/manager/settings/export"),
  importManagerData: (snapshot) => request("/api/v1/manager/settings/import", { method: "POST", body: JSON.stringify({ snapshot }) }),
  requestManagerSeedConfirmation: () => request("/api/v1/manager/settings/seed-confirmation", { method: "POST", body: "{}" }),
  seedManagerData: (input) => request("/api/v1/manager/settings/seed", { method: "POST", body: JSON.stringify(input) }),
  requestManagerWipeConfirmation: () => request("/api/v1/manager/settings/wipe-confirmation", { method: "POST", body: "{}" }),
  wipeManagerData: (input) => request("/api/v1/manager/settings/wipe", { method: "POST", body: JSON.stringify(input) }),
  getManagerProviderSettings: () => request("/api/v1/manager/provider-settings"),
  saveManagerProviderSettings: (input) => request("/api/v1/manager/provider-settings", { method: "PUT", body: JSON.stringify(input) }),
  testManagerProviderSettings: (input) => request("/api/v1/manager/provider-settings/test", { method: "POST", body: JSON.stringify(input ?? {}) }),
  getManagerAccounts: () => request("/api/v1/manager/accounts"),
  createManagerAccount: (input) => request("/api/v1/manager/accounts", { method: "POST", body: JSON.stringify(input) }),
  updateManagerAccountRole: (accountId, role) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/role`, {
    method: "PATCH", body: JSON.stringify({ role })
  }),
  updateManagerAccountStatus: (accountId, status) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/status`, {
    method: "PATCH", body: JSON.stringify({ status })
  }),
  resetManagerAccountPassword: (accountId, password) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/password-reset`, {
    method: "POST", body: JSON.stringify({ password })
  }),
  getManagerReminders: () => request("/api/v1/manager/reminders"),
  sendManagerReminder: (learnerId, requestId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}`, {
    method: "POST", body: JSON.stringify({ requestId })
  }),
  dismissManagerReminder: (learnerId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}/dismiss`, {
    method: "POST", body: "{}"
  }),
  copyManagerReminder: (learnerId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}/copy`, {
    method: "POST", body: "{}"
  }),
  getManagerReport: () => request("/api/v1/manager/report"),
  getManagerSettings: () => request("/api/v1/manager/settings"),
  saveManagerSettings: (input) => request("/api/v1/manager/settings", { method: "PUT", body: JSON.stringify(input) }),
  getSystemCapabilities: () => request("/api/v1/system/capabilities"),
  getProductPreferences: () => request("/api/v1/product-preferences"),
  saveProductPreferences: (input) => request("/api/v1/product-preferences", { method: "PUT", body: JSON.stringify(input) })
};
