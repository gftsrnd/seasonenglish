import type {
  AssessmentDecisionInput, AssessmentDecisionView, AssessmentKind, AssessmentLevelFormSlotView,
  AssessmentResponseView, AssessmentReviewOverviewView, AssessmentSectionCode, AssessmentView,
  CefrLevel, ContentLessonDraftInput, ContentLessonMatrixView, ContentLessonSetVersionView, ContentPromptKey,
  ContentPromptSettingsView, ContentReviewView, ContentWeekFrameView, ContentWeekInput,
  CoachMessageInput, CoachPersona, CoachView,
  ArenaView, DuelView, GameAnswerInput, GameHubView, GameKey, GameResultView, RewardView, SurveyView, WeeklyPracticeView,
  LearnerHomeView, LearnerProfileData, LearnerProfileView, LearnerProgressView,
  LessonProgressView, LessonView, MicroLessonView, SessionView
} from "@e4s/contracts";
import type { AuthClient, LoginCredentials } from "./features/auth/index.js";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    throw new Error(body.code ?? `HTTP_${response.status}`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const apiClient: AuthClient & {
  currentSession(): Promise<SessionView>;
  logout(): Promise<void>;
  getProfile(): Promise<LearnerProfileView>;
  saveProfile(profile: LearnerProfileData, version: number): Promise<LearnerProfileView>;
  getHome(): Promise<LearnerHomeView>;
  getProgress(): Promise<LearnerProgressView>;
  getLesson(id: string): Promise<LessonView>;
  saveLessonProgress(id: string, progress: LessonProgressView): Promise<LessonProgressView>;
  getMicroLesson(id: string): Promise<MicroLessonView>;
  submitMicroAttempt(id: string, answer: string): Promise<MicroLessonView>;
  completeMicroLesson(id: string): Promise<MicroLessonView>;
  getCoach(): Promise<CoachView>;
  sendCoachMessage(input: CoachMessageInput): Promise<CoachView>;
  setCoachPersona(persona: CoachPersona): Promise<CoachView>;
  clearCoach(): Promise<CoachView>;
  getWeeklyPractice(): Promise<WeeklyPracticeView>;
  submitWeeklyPractice(input: { requestId: string; text: string }): Promise<WeeklyPracticeView>;
  getGames(): Promise<GameHubView>;
  generateGameWordSet(input: { requestId: string; topic: string }): Promise<GameHubView>;
  useWeeklyGameWordSet(): Promise<GameHubView>;
  submitGameResult(game: GameKey, input: { requestId: string; answers: GameAnswerInput[]; hintsUsed?: number }): Promise<GameResultView>;
  getArena(): Promise<ArenaView>;
  createDuel(input: { opponentId: string; game: Exclude<GameKey, "crossword"> }): Promise<DuelView>;
  getDuel(id: string): Promise<DuelView>;
  submitDuelResult(id: string, input: { requestId: string; answers: GameAnswerInput[] }): Promise<DuelView>;
  getReward(mode: "preview" | "done"): Promise<RewardView>;
  getSurvey(): Promise<SurveyView>;
  submitSurvey(input: { rating: number; comment: string; studyTime: "work" | "outside" | "both" }): Promise<SurveyView>;
  getAssessment(kind: AssessmentKind | "levelup"): Promise<AssessmentView>;
  startAssessment(kind: AssessmentKind | "levelup"): Promise<AssessmentView>;
  saveAssessmentResponse(attemptId: string, section: AssessmentSectionCode, taskKey: string, input: {
    value: string; evidenceType: "choice" | "text" | "audio" | "transcript" | "typed_proxy" | "technical_failure"; artifactKey?: string;
  }): Promise<AssessmentResponseView>;
  completeAssessmentSection(attemptId: string, section: AssessmentSectionCode): Promise<AssessmentView>;
  recordAssessmentAudioPlay(attemptId: string, section: AssessmentSectionCode, groupKey: string): Promise<{ playCount: number; remaining: number }>;
  submitAssessment(attemptId: string): Promise<AssessmentView>;
  getAssessmentReviewOverview(): Promise<AssessmentReviewOverviewView>;
  decideAssessment(attemptId: string, input: AssessmentDecisionInput): Promise<AssessmentDecisionView>;
  getAssessmentLevelForms(): Promise<AssessmentLevelFormSlotView[]>;
  getContentWeeks(): Promise<ContentWeekFrameView>;
  saveContentWeeks(weeks: ContentWeekInput[]): Promise<ContentWeekFrameView>;
  getContentLessonMatrix(): Promise<ContentLessonMatrixView>;
  getContentLessonSet(week: number, cefr: CefrLevel): Promise<ContentLessonSetVersionView>;
  saveContentLessonDraft(week: number, cefr: CefrLevel, lessons: ContentLessonDraftInput[]): Promise<ContentLessonSetVersionView>;
  submitContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  publishContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  retireContentLessonSet(versionId: string): Promise<ContentLessonSetVersionView>;
  getContentReview(): Promise<ContentReviewView>;
  getContentPrompts(): Promise<ContentPromptSettingsView>;
  saveContentPrompts(groups: Array<{ key: ContentPromptKey; content: string }>): Promise<ContentPromptSettingsView>;
} = {
  learnerLogin: (input: LoginCredentials) => request("/api/auth/learner/login", { method: "POST", body: JSON.stringify(input) }),
  staffLogin: (input: LoginCredentials) => request("/api/auth/staff/login", { method: "POST", body: JSON.stringify(input) }),
  demoLogin: () => request("/api/auth/demo", { method: "POST", body: "{}" }),
  currentSession: () => request("/api/session"),
  logout: () => request("/api/logout", { method: "POST", body: "{}" }),
  getProfile: () => request("/api/v1/learner/profile"),
  saveProfile: (profile, version) => request("/api/v1/learner/profile", { method: "PUT", body: JSON.stringify({ ...profile, version }) }),
  getHome: () => request("/api/v1/learner/home"),
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
  getMicroLesson: (id) => request(`/api/v1/micro-lessons/${encodeURIComponent(id)}`),
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
  getWeeklyPractice: () => request("/api/v1/engagement/practice"),
  submitWeeklyPractice: (input) => request("/api/v1/engagement/practice/submit", { method: "POST", body: JSON.stringify(input) }),
  getGames: () => request("/api/v1/engagement/games"),
  generateGameWordSet: (input) => request("/api/v1/engagement/games/word-set", { method: "POST", body: JSON.stringify(input) }),
  useWeeklyGameWordSet: () => request("/api/v1/engagement/games/word-set", { method: "DELETE", body: "{}" }),
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
  submitAssessment: (attemptId) => request(`/api/v1/assessment-attempts/${encodeURIComponent(attemptId)}/submit`, {
    method: "POST", body: "{}"
  }),
  getAssessmentReviewOverview: () => request("/api/v1/assessment-reviews/overview"),
  decideAssessment: (attemptId, input) => request(`/api/v1/assessment-reviews/${encodeURIComponent(attemptId)}/decision`, {
    method: "POST", body: JSON.stringify(input)
  }),
  getAssessmentLevelForms: () => request("/api/v1/assessment-level-forms"),
  getContentWeeks: () => request("/api/v1/content/weeks"),
  saveContentWeeks: (weeks) => request("/api/v1/content/weeks", { method: "PUT", body: JSON.stringify({ weeks }) }),
  getContentLessonMatrix: () => request("/api/v1/content/lesson-matrix"),
  getContentLessonSet: (week, cefr) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}`),
  saveContentLessonDraft: (week, cefr, lessons) => request(`/api/v1/content/lesson-sets/${week}/${encodeURIComponent(cefr)}/draft`, {
    method: "PUT", body: JSON.stringify({ lessons })
  }),
  submitContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/review`, { method: "POST", body: "{}" }),
  publishContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/publication`, { method: "POST", body: "{}" }),
  retireContentLessonSet: (versionId) => request(`/api/v1/content/lesson-set-versions/${encodeURIComponent(versionId)}/retirement`, { method: "POST", body: "{}" }),
  getContentReview: () => request("/api/v1/content/review"),
  getContentPrompts: () => request("/api/v1/content/prompts"),
  saveContentPrompts: (groups) => request("/api/v1/content/prompts", { method: "PUT", body: JSON.stringify({ groups }) })
};
