import type {
  ArenaView, AssessmentAppealView, AssessmentKind, AssessmentMonthlyGoalView, AssessmentResponseView,
  AssessmentRuntimeView, AssessmentSectionCode, AssessmentView, AssessmentViolationInput, CoachMessageInput,
  CoachPersona, CoachView, DuelView, GameAnswerInput, GameFinishInput, GameHubView, GameKey, GameResultView,
  LearnerHomeView, LearnerProfileData, LearnerProfileView, LearnerProgressView, LessonPartAppealView,
  LessonPartAttemptEvidenceInput, LessonPartAttemptView, LessonPartCode, LessonProgressView, LessonView,
  ContentImageView, LevelChallengeView, MicroLessonView, RewardView, SurveyView, WeeklyPracticeView
} from "@e4s/contracts";
import { request, uploadMultipart } from "./runtime.js";

export interface LearnerApiClient {
  getProfile(): Promise<LearnerProfileView>;
  saveProfile(profile: LearnerProfileData, version: number): Promise<LearnerProfileView>;
  saveProfileDraft(profile: LearnerProfileData, version: number): Promise<LearnerProfileView>;
  updateLearnerMonthlyGoal(monthlyGoal: string): Promise<AssessmentMonthlyGoalView>;
  getHome(): Promise<LearnerHomeView>;
  acknowledgeRewardAnnouncement(announcementId: string): Promise<{ acknowledged: true; announcementId: string }>;
  getProgress(): Promise<LearnerProgressView>;
  getLesson(id: string): Promise<LessonView>;
  resolveLessonVocabularyImage(lessonId: string, itemIndex: number): Promise<ContentImageView>;
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
  resolveGameWordImage(setId: string, wordId: string): Promise<ContentImageView>;
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
}

export const learnerApiClient: LearnerApiClient = {
  getProfile: () => request("/api/v1/learner/profile"),
  saveProfile: (profile, version) => request("/api/v1/learner/profile", { method: "PUT", body: JSON.stringify({ ...profile, version }) }),
  saveProfileDraft: (profile, version) => request("/api/v1/learner/profile/draft", { method: "PUT", body: JSON.stringify({ ...profile, version }) }),
  updateLearnerMonthlyGoal: (monthlyGoal) => request("/api/v1/learner/monthly-goal", { method: "PATCH", body: JSON.stringify({ monthlyGoal }) }),
  getHome: () => request("/api/v1/learner/home"),
  acknowledgeRewardAnnouncement: (announcementId) => request("/api/v1/learner/reward-announcement/acknowledge", { method: "POST", body: JSON.stringify({ announcementId }) }),
  getProgress: () => request("/api/v1/learner/progress"),
  getLesson: (id) => request(`/api/v1/lessons/${encodeURIComponent(id)}`),
  resolveLessonVocabularyImage: (lessonId, itemIndex) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/vocabulary/${itemIndex}/image`),
  saveLessonProgress: (id, progress) => request(`/api/v1/lessons/${encodeURIComponent(id)}/progress`, {
    method: "PUT",
    body: JSON.stringify({ completedPartCodes: progress.completedPartCodes, evidence: progress.evidence, markComplete: progress.status === "completed", ...(progress.score === undefined ? {} : { score: progress.score }) })
  }),
  submitLessonPartAttempt: (lessonId, partCode, requestId, evidence) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/parts/${encodeURIComponent(partCode)}/attempts`, { method: "POST", body: JSON.stringify({ requestId, evidence }) }),
  appealLessonPart: (lessonId, partCode, reason) => request(`/api/v1/lessons/${encodeURIComponent(lessonId)}/parts/${encodeURIComponent(partCode)}/appeals`, { method: "POST", body: JSON.stringify({ reason }) }),
  getMicroLesson: (id) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}`),
  generateMicroLesson: (requestId, regenerate = false) => request("/api/v1/micro-lessons", { method: "POST", body: JSON.stringify({ requestId, ...(regenerate ? { regenerate: true } : {}) }) }),
  submitMicroAttempt: (id, answer) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}/attempts`, { method: "POST", body: JSON.stringify({ answer }) }),
  completeMicroLesson: (id) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}/complete`, { method: "POST", body: "{}" }),
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
  uploadAssessmentAudio: (file, filename) => uploadMultipart("/api/v1/files/assessment-audio", file, filename),
  getAssessmentAudioReadUrl: (artifactKey) => request(`/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`),
  saveAssessmentResponse: (attemptId, section, taskKey, input) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/responses/${encodeURIComponent(section)}/${encodeURIComponent(taskKey)}`, { method: "PUT", body: JSON.stringify(input) }),
  completeAssessmentSection: (attemptId, section) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/sections/${encodeURIComponent(section)}/complete`, { method: "POST", body: "{}" }),
  recordAssessmentAudioPlay: (attemptId, section, groupKey) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/sections/${encodeURIComponent(section)}/groups/${encodeURIComponent(groupKey)}/audio-play`, { method: "POST", body: "{}" }),
  recordAssessmentViolation: (attemptId, input) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/violations`, { method: "POST", body: JSON.stringify(input) }),
  submitAssessment: (attemptId) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/submit`, { method: "POST", body: "{}" }),
  createAssessmentAppeal: (attemptId, reason) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/appeals`, { method: "POST", body: JSON.stringify({ reason }) })
};
