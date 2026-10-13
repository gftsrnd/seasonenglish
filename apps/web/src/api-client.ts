import type {
  AssessmentDecisionInput, AssessmentDecisionView, AssessmentKind, AssessmentLevelFormSlotView,
  AssessmentResponseView, AssessmentReviewOverviewView, AssessmentSectionCode, AssessmentView,
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
  getAssessmentLevelForms: () => request("/api/v1/assessment-level-forms")
};
