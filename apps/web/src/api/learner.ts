import type { ApiClient } from "../api-client.js";
import { request, uploadMultipart } from "./runtime.js";

export type LearnerApiClient = Pick<ApiClient,
  "getProfile" | "saveProfile" | "updateLearnerMonthlyGoal" | "getHome" | "acknowledgeRewardAnnouncement" | "getProgress" |
  "getLesson" | "saveLessonProgress" | "submitLessonPartAttempt" | "appealLessonPart" | "getMicroLesson" | "generateMicroLesson" |
  "submitMicroAttempt" | "completeMicroLesson" | "getCoach" | "sendCoachMessage" | "setCoachPersona" | "clearCoach" |
  "unlockCoachVocabulary" | "getLevelChallenge" | "sendLevelChallengeMessage" | "getWeeklyPractice" | "submitWeeklyPractice" |
  "appealWeeklyPractice" | "getGames" | "generateGameWordSet" | "useWeeklyGameWordSet" | "deleteGameWordSet" |
  "resolveGameWordImage" | "submitGameResult" | "getArena" | "createDuel" | "getDuel" | "submitDuelResult" | "getReward" |
  "getSurvey" | "submitSurvey" | "getAssessment" | "startAssessment" | "uploadAssessmentAudio" | "getAssessmentAudioReadUrl" |
  "saveAssessmentResponse" | "completeAssessmentSection" | "recordAssessmentAudioPlay" | "recordAssessmentViolation" |
  "submitAssessment" | "createAssessmentAppeal"
>;

export const learnerApiClient: LearnerApiClient = {
  getProfile: () => request("/api/v1/learner/profile"),
  saveProfile: (profile, version) => request("/api/v1/learner/profile", { method: "PUT", body: JSON.stringify({ ...profile, version }) }),
  updateLearnerMonthlyGoal: (monthlyGoal) => request("/api/v1/learner/monthly-goal", { method: "PATCH", body: JSON.stringify({ monthlyGoal }) }),
  getHome: () => request("/api/v1/learner/home"),
  acknowledgeRewardAnnouncement: (announcementId) => request("/api/v1/learner/reward-announcement/acknowledge", { method: "POST", body: JSON.stringify({ announcementId }) }),
  getProgress: () => request("/api/v1/learner/progress"),
  getLesson: (id) => request(`/api/v1/lessons/${encodeURIComponent(id)}`),
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
