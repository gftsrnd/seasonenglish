import type {
  AssessmentAppealTargetView, AssessmentAppealView, AssessmentKind, AssessmentMonthlyGoalView, AssessmentResponseView,
  AssessmentRuntimeView, AssessmentSectionCode, AssessmentView, AssessmentViolationInput, CoachMessageInput,
  CoachPersona, CoachView, GameFinishInput, GameHubView, GameKey, GameResultView,
  LearnerHomeView, LearnerNotificationsView, LearnerProfileData, LearnerProfileView, LearnerProgressView, LessonPartAppealView,
  LessonPartAttemptEvidenceInput, LessonPartAttemptView, LessonPartCode, LessonProgressView, LessonView,
  ContentImageView, CourseCompletionView, LevelChallengeView, MicroLessonView, RewardView, SurveyView, WeeklyPracticeView, AudioArtifactInput,
  RequestEvidenceInput, LearnerAcademicAppealView, LearnerComplaintKind, LearnerComplaintView, WeeklyReviewAnswerInput, WeeklyReviewAnswerResult, WeeklyReviewSessionView
} from "@e4s/contracts";
import type { AudioArtifactView, GameWordSetView } from "@e4s/contracts";
import type { AssessmentPlacementRetakeRequestView } from "@e4s/contracts";
import { request, uploadMultipart } from "./runtime.js";
import type { LearnerAudioEvidence } from "../app/learner/contracts.js";

export interface LearnerApiClient {
  getCourseCompletion(): Promise<CourseCompletionView>;
  getAppealableAssessments(): Promise<{ results: AssessmentAppealTargetView[] }>;
  /** Placement: the "Xin thi lại" request state (target while the window is open, the request and its decision). */
  getPlacementRetakeRequest?(): Promise<AssessmentPlacementRetakeRequestView>;
  createPlacementRetakeRequest?(reason?: string): Promise<AssessmentPlacementRetakeRequestView>;
  getLearnerAppeals(): Promise<{ appeals: LearnerAcademicAppealView[] }>;
  getLearnerComplaints(): Promise<{ complaints: LearnerComplaintView[] }>;
  submitLearnerComplaint(kind: LearnerComplaintKind, reason: string, evidence?: RequestEvidenceInput): Promise<{ complaint: LearnerComplaintView }>;
  getProfile(): Promise<LearnerProfileView>;
  saveProfile(profile: LearnerProfileData, version: number): Promise<LearnerProfileView>;
  saveProfileDraft(profile: LearnerProfileData, version: number): Promise<LearnerProfileView>;
  updateLearnerMonthlyGoal(monthlyGoal: string): Promise<AssessmentMonthlyGoalView>;
  getHome(): Promise<LearnerHomeView>;
  getNotifications(): Promise<LearnerNotificationsView>;
  acknowledgeRewardAnnouncement(announcementId: string): Promise<{ acknowledged: true; announcementId: string }>;
  getProgress(): Promise<LearnerProgressView>;
  getLesson(id: string): Promise<LessonView>;
  resolveLessonVocabularyImage(lessonId: string, itemIndex: number): Promise<ContentImageView>;
  completeLessonStudy(id: string): Promise<LessonProgressView>;
  recordPronunciationListen(id: string, word: string): Promise<LessonProgressView>;
  saveLessonProgress(id: string, progress: LessonProgressView): Promise<LessonProgressView>;
  submitLessonPartAttempt(lessonId: string, partCode: LessonPartCode, requestId: string, evidence: LessonPartAttemptEvidenceInput): Promise<LessonPartAttemptView>;
  appealLessonPart(lessonId: string, partCode: LessonPartCode, reason: string, evidence?: RequestEvidenceInput, exerciseVersionId?: string): Promise<LessonPartAppealView>;
  getWeeklyReviewSession(lessonId: string): Promise<WeeklyReviewSessionView>;
  setWeeklyReviewWarmup(lessonId: string, status: "skipped" | "done"): Promise<WeeklyReviewSessionView>;
  answerWeeklyReview(lessonId: string, input: WeeklyReviewAnswerInput): Promise<WeeklyReviewAnswerResult>;
  getMicroLesson(id: string): Promise<MicroLessonView>;
  generateMicroLesson(requestId: string, regenerate?: boolean): Promise<MicroLessonView>;
  submitMicroAttempt(id: string, answer: string): Promise<MicroLessonView>;
  completeMicroLesson(id: string): Promise<MicroLessonView>;
  getCoach(): Promise<CoachView>;
  sendCoachMessage(input: CoachMessageInput & { audio?: AudioArtifactInput }): Promise<CoachView>;
  setCoachPersona(persona: CoachPersona): Promise<CoachView>;
  clearCoach(): Promise<CoachView>;
  getLevelChallenge(): Promise<LevelChallengeView>;
  sendLevelChallengeMessage(input: CoachMessageInput): Promise<LevelChallengeView>;
  getWeeklyPractice(): Promise<WeeklyPracticeView>;
  submitWeeklyPractice(input: { requestId: string; text: string; audio?: AudioArtifactInput }): Promise<WeeklyPracticeView>;
  appealWeeklyPractice(submissionId: string, reason: string, evidence?: RequestEvidenceInput): Promise<WeeklyPracticeView>;
  getGames(): Promise<GameHubView>;
  generateGameWordSet(input: { requestId: string; topic: string }): Promise<GameHubView>;
  useWeeklyGameWordSet(): Promise<GameHubView>;
  deleteGameWordSet(): Promise<GameHubView>;
  resolveGameWordImage(setId: string, wordId: string): Promise<ContentImageView>;
  prepareGameWordExamples(setId: string): Promise<GameWordSetView>;
  submitGameResult(game: GameKey, input: { requestId: string } & GameFinishInput): Promise<GameResultView>;
  getReward(mode: "preview" | "done"): Promise<RewardView>;
  getSurvey(): Promise<SurveyView>;
  submitSurvey(input: { rating: number; comment: string; studyTime: "work" | "outside" | "both" }): Promise<SurveyView>;
  getAssessment(kind: AssessmentKind | "levelup" | "passcourse"): Promise<AssessmentView>;
  startAssessment(kind: AssessmentKind | "levelup" | "passcourse"): Promise<AssessmentView>;
  uploadAssessmentAudio(file: Blob, filename: string): Promise<AudioArtifactView & { url?: string | null }>;
  getAssessmentAudioReadUrl(artifactKey: string): Promise<AudioArtifactView & { url?: string | null }>;
  saveAssessmentResponse(attemptId: string, section: AssessmentSectionCode, taskKey: string, input: {
    value: string; evidenceType: "choice" | "text" | "audio" | "transcript" | "typed_proxy" | "technical_failure"; artifactKey?: string;
  }): Promise<AssessmentResponseView>;
  completeAssessmentSection(attemptId: string, section: AssessmentSectionCode): Promise<AssessmentView>;
  recordAssessmentAudioPlay(attemptId: string, section: AssessmentSectionCode, groupKey: string): Promise<{ playCount: number; remaining: number }>;
  recordAssessmentViolation(attemptId: string, input: AssessmentViolationInput): Promise<AssessmentRuntimeView>;
  submitAssessment(attemptId: string): Promise<AssessmentView>;
  createAssessmentAppeal(attemptId: string, reason: string, evidence?: RequestEvidenceInput): Promise<AssessmentAppealView>;
}

export const learnerApiClient: LearnerApiClient = {
  getCourseCompletion: () => request("/api/v1/learner/course-completion"),
  getAppealableAssessments: () => request("/api/v1/learner/appealable-assessments"),
  getPlacementRetakeRequest: () => request("/api/v1/learner/placement-retake-request"),
  createPlacementRetakeRequest: (reason) => request("/api/v1/learner/placement-retake-request", { method: "POST", body: JSON.stringify({ reason }) }),
  getLearnerAppeals: () => request("/api/v1/learner/appeals"),
  getLearnerComplaints: () => request("/api/v1/learner/complaints"),
  submitLearnerComplaint: (kind, reason, evidence) => request("/api/v1/learner/complaints", { method: "POST", body: JSON.stringify({ kind, reason, ...evidence }) }),
  getProfile: () => request("/api/v1/learner/profile"),
  saveProfile: (profile, version) => request("/api/v1/learner/profile", { method: "PUT", body: JSON.stringify({ ...profile, version }) }),
  saveProfileDraft: (profile, version) => request("/api/v1/learner/profile/draft", { method: "PUT", body: JSON.stringify({ ...profile, version }) }),
  updateLearnerMonthlyGoal: (monthlyGoal) => request("/api/v1/learner/monthly-goal", { method: "PATCH", body: JSON.stringify({ monthlyGoal }) }),
  getHome: () => request("/api/v1/learner/home"),
  getNotifications: () => request("/api/v1/notifications"),
  acknowledgeRewardAnnouncement: (announcementId) => request("/api/v1/learner/reward-announcement/acknowledge", { method: "POST", body: JSON.stringify({ announcementId }) }),
  getProgress: () => request("/api/v1/learner/progress"),
  getLesson: (id) => request(`/api/v1/lessons/${encodeURIComponent(id)}`),
  resolveLessonVocabularyImage: (lessonId, itemIndex) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/vocabulary/${itemIndex}/image`),
  completeLessonStudy: (id) => request(`/api/v1/lessons/${encodeURIComponent(id)}/study-completion`, { method: "POST", body: "{}" }),
  recordPronunciationListen: (id, word) => request(`/api/v1/lessons/${encodeURIComponent(id)}/pronunciation/listens`, { method: "POST", body: JSON.stringify({ word }) }),
  saveLessonProgress: (id, progress) => request(`/api/v1/lessons/${encodeURIComponent(id)}/progress`, {
    method: "PUT",
    body: JSON.stringify({ completedPartCodes: progress.completedPartCodes, evidence: progress.evidence, markComplete: progress.status === "completed", ...(progress.score === undefined ? {} : { score: progress.score }) })
  }),
  submitLessonPartAttempt: (lessonId, partCode, requestId, evidence) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/parts/${encodeURIComponent(partCode)}/attempts`, { method: "POST", body: JSON.stringify({ requestId, evidence }) }),
  appealLessonPart: (lessonId, partCode, reason, evidence, exerciseVersionId) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/parts/${encodeURIComponent(partCode)}/appeals`, { method: "POST", body: JSON.stringify({ reason, ...evidence, exerciseVersionId }) }),
  getWeeklyReviewSession: (lessonId) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/review-session`),
  setWeeklyReviewWarmup: (lessonId, status) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/review-session/warmup`, { method: "POST", body: JSON.stringify({ status }) }),
  answerWeeklyReview: (lessonId, input) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/review-session/answers`, { method: "POST", body: JSON.stringify(input) }),
  getMicroLesson: (id) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}`),
  generateMicroLesson: (requestId, regenerate = false) => request("/api/v1/micro-lessons", { method: "POST", body: JSON.stringify({ requestId, ...(regenerate ? { regenerate: true } : {}) }) }),
  submitMicroAttempt: (id, answer) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}/attempts`, { method: "POST", body: JSON.stringify({ answer }) }),
  completeMicroLesson: (id) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}/complete`, { method: "POST", body: "{}" }),
  getCoach: () => request("/api/v1/coach"),
  sendCoachMessage: (input) => request("/api/v1/coach/messages", { method: "POST", body: JSON.stringify(input) }),
  setCoachPersona: (persona) => request("/api/v1/coach/persona", { method: "PUT", body: JSON.stringify({ persona }) }),
  clearCoach: () => request("/api/v1/coach/session", { method: "DELETE", body: "{}" }),
  getLevelChallenge: () => request("/api/v1/challenge"),
  sendLevelChallengeMessage: (input) => request("/api/v1/challenge/messages", { method: "POST", body: JSON.stringify(input) }),
  getWeeklyPractice: () => request("/api/v1/engagement/practice"),
  submitWeeklyPractice: (input) => request("/api/v1/engagement/practice/submit", { method: "POST", body: JSON.stringify(input) }),
  appealWeeklyPractice: (submissionId, reason, evidence) => request(`/api/v1/engagement/practice/${encodeURIComponent(submissionId)}/appeals`, { method: "POST", body: JSON.stringify({ reason, ...evidence }) }),
  getGames: () => request("/api/v1/engagement/games"),
  generateGameWordSet: (input) => request("/api/v1/engagement/games/word-set", { method: "POST", body: JSON.stringify(input) }),
  useWeeklyGameWordSet: () => request("/api/v1/engagement/games/word-set/weekly", { method: "POST", body: "{}" }),
  deleteGameWordSet: () => request("/api/v1/engagement/games/word-set", { method: "DELETE", body: "{}" }),
  resolveGameWordImage: (setId, wordId) => request(`/api/v1/engagement/game-sets/${encodeURIComponent(setId)}/words/${encodeURIComponent(wordId)}/image`),
  prepareGameWordExamples: (setId) => request(`/api/v1/engagement/game-sets/${encodeURIComponent(setId)}/examples`, { method: "POST", body: "{}" }),
  submitGameResult: (game, input) => request(`/api/v1/engagement/games/${encodeURIComponent(game)}/results`, { method: "POST", body: JSON.stringify(input) }),
  getReward: (mode) => request(`/api/v1/engagement/rewards/${mode}`),
  getSurvey: () => request("/api/v1/engagement/survey"),
  submitSurvey: (input) => request("/api/v1/engagement/survey", { method: "POST", body: JSON.stringify(input) }),
  getAssessment: (kind) => request(`/api/v1/assessments/${encodeURIComponent(kind)}`),
  startAssessment: (kind) => request(`/api/v1/assessments/${encodeURIComponent(kind)}/start`, { method: "POST", body: "{}" }),
  uploadAssessmentAudio: (file, filename) => uploadMultipart("/api/v1/files/assessment-audio", file, filename),
  getAssessmentAudioReadUrl: (artifactKey) => request(`/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`),
  saveAssessmentResponse: (attemptId, section, taskKey, input) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/responses/${encodeURIComponent(section)}/${encodeURIComponent(taskKey)}`, { method: "PUT", body: JSON.stringify(input) }),
  completeAssessmentSection: (attemptId, section) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/sections/${encodeURIComponent(section)}/complete`, { method: "POST", body: "{}" }),
  recordAssessmentAudioPlay: (attemptId, section, groupKey) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/sections/${encodeURIComponent(section)}/groups/${encodeURIComponent(groupKey)}/audio-play`, { method: "POST", body: "{}" }),
  recordAssessmentViolation: (attemptId, input) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/violations`, { method: "POST", body: JSON.stringify(input) }),
  submitAssessment: (attemptId) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/submit`, { method: "POST", body: "{}" }),
  createAssessmentAppeal: (attemptId, reason, evidence) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/appeals`, { method: "POST", body: JSON.stringify({ reason, ...evidence }) })
};
