import type { AssessmentKind, CefrLevel } from "./domain-contract.js";
import type { LearnerProfileData } from "./learning-contract.js";
export type AssessmentSectionCode = "listening" | "reading" | "writing" | "speaking";
export type AssessmentScreenState = "preparation" | AssessmentSectionCode | "submitting" | "pending";
export type AssessmentAttemptStatus = "in_progress" | "submitted" | "pending_review" | "approved" | "needs_retry";
export type AssessmentEvidenceType = "choice" | "text" | "audio" | "transcript" | "typed_proxy" | "technical_failure";
export type AssessmentViolationReason = "visibility_hidden" | "window_blur";
export type AssessmentSubmitReason = "manual" | "timeout" | "violations";

export type AssessmentMicrophoneState = "unknown" | "unsupported" | "idle" | "requesting" | "recording" | "playback" | "uploaded" | "error";
export type AssessmentSoundCheckState = "unknown" | "passed" | "failed";

export interface AssessmentDeviceEvidence {
  microphoneSupported: boolean | null;
  microphoneState: AssessmentMicrophoneState;
  soundCheck: AssessmentSoundCheckState;
  checkedAt?: string | null;
}

export interface AssessmentMediaRecordingEvidence {
  taskKey: string;
  artifactKey: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
}

export interface AssessmentMediaEvidence {
  recordings: Record<string, AssessmentMediaRecordingEvidence>;
  uploads: AssessmentMediaRecordingEvidence[];
}

export interface AssessmentRuntimeView {
  /** Server-derived remaining time for the active section; null means untimed. */
  remainingSeconds: number | null;
  violationCount: number;
  violationLimit: number;
  submitReason: AssessmentSubmitReason | null;
  status: AssessmentAttemptStatus;
  currentSection: AssessmentSectionCode | null;
  audioPlayCounts: Record<string, number>;
  deviceEvidence: AssessmentDeviceEvidence;
  mediaEvidence: AssessmentMediaEvidence;
  /** True only when this response crossed the server's automatic-submit threshold. */
  autoSubmitted?: boolean;
}

export interface AssessmentViolationInput {
  requestId: string;
  reason: AssessmentViolationReason;
  occurredAt: string;
}

export interface AssessmentOption {
  value: string;
  label: string;
}

export interface AssessmentStimulus {
  type: "audio_script" | "passage" | "message" | "table";
  text?: string;
  lines?: Array<{ speaker: string; text: string }>;
  headers?: string[];
  rows?: string[][];
}

export interface AssessmentTaskView {
  key: string;
  title?: string;
  prompt: string;
  responseType: "single_choice" | "long_text" | "speaking_evidence";
  maxScore: number;
  options?: AssessmentOption[];
  minWords?: number;
  maxWords?: number;
  hint?: string;
}

export interface AssessmentTaskGroupView {
  key: string;
  title: string;
  instruction: string;
  stimulus?: AssessmentStimulus;
  maxPlays?: number;
  tasks: AssessmentTaskView[];
}

export interface AssessmentSectionView {
  code: AssessmentSectionCode;
  title: string;
  durationMinutes: number;
  maxScore: number;
  instructions: string[];
  groups: AssessmentTaskGroupView[];
}

export interface AssessmentDefinitionView {
  key: string;
  kind: AssessmentKind;
  title: string;
  version: number;
  totalMinutes: number;
  totalScore: number;
  sections: AssessmentSectionView[];
}

export interface AssessmentResponseView {
  section: AssessmentSectionCode;
  taskKey: string;
  value: string;
  evidenceType: AssessmentEvidenceType;
  artifactKey?: string;
  savedAt?: string;
}

export type AssessmentSectionStatus = "locked" | "not_started" | "in_progress" | "completed";

export interface AssessmentAttemptView {
  id: string;
  status: AssessmentAttemptStatus;
  currentSection: AssessmentSectionCode | null;
  startedAt: string;
  sectionEndsAt: string | null;
  responses: AssessmentResponseView[];
  sectionStatuses: Record<AssessmentSectionCode, AssessmentSectionStatus>;
  sectionScores?: Partial<Record<AssessmentSectionCode, number | null>>;
  audioPlayCounts: Record<string, number>;
  runtime?: AssessmentRuntimeView;
  totalScore?: number | null;
  suggestedLevel?: CefrLevel | null;
}

export interface AssessmentView {
  definition: AssessmentDefinitionView;
  screenState: AssessmentScreenState;
  attempt: AssessmentAttemptView | null;
  runtime?: AssessmentRuntimeView;
  appeal?: AssessmentAppealView | null;
}

export interface AssessmentAppealView {
  id: string;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SaveAssessmentResponseInput {
  value: string;
  evidenceType: AssessmentEvidenceType;
  artifactKey?: string;
}

export interface AssessmentReviewQueueItem {
  attemptId: string;
  learnerId: string;
  learnerName: string;
  /** Same profile-completion projection used by the unassessed learner lists. */
  profileComplete?: boolean;
  kind: AssessmentKind;
  title: string;
  submittedAt: string;
  sectionScores: Partial<Record<AssessmentSectionCode, number>>;
  suggestedLevel: CefrLevel | null;
  challenge?: { completedTurns: number; requiredTurns: 6; average: number; offTopic: number; complete: boolean; passed: boolean };
}

export interface AssessmentDecisionInput {
  status: "approved" | "needs_retry";
  approvedLevel?: CefrLevel;
  reason: string;
}

export interface AssessmentDecisionView {
  attemptId: string;
  status: "approved" | "needs_retry";
  approvedLevel: CefrLevel | null;
  reason: string;
  decidedBy: string;
  decidedAt: string;
}

export interface AssessmentApprovedLearnerView {
  learnerId: string;
  learnerName: string;
  currentLevel: CefrLevel;
  placementScore: number | null;
  monthlyGoal: string | null;
}

export interface AssessmentUnassessedLearnerView {
  learnerId: string;
  learnerName: string;
  profileComplete: boolean;
  lifecycle?: "not_started" | "in_progress" | "needs_retry";
  lastAttemptAt?: string | null;
}

export type AssessmentReviewFlowPhase = "testing" | "ungraded" | "challenge" | "failed";

export interface AssessmentReviewFlowView {
  learnerId: string;
  learnerName: string;
  currentLevel: CefrLevel;
  targetLevel: CefrLevel;
  phase: AssessmentReviewFlowPhase;
  /** Persisted evidence summary shown beside the prototype flow actions. */
  metrics: string;
  assessmentAttemptId: string;
  /** The assessment attempt key used by the challenge detail endpoint, when a challenge exists. */
  challengeAttemptId: string | null;
}

export interface AssessmentReviewOverviewView {
  pendingAssessments: AssessmentReviewQueueItem[];
  pendingLevelUp: AssessmentReviewQueueItem[];
  approvedLearners: AssessmentApprovedLearnerView[];
  unassessedLearners: AssessmentUnassessedLearnerView[];
  inProgressLearners?: AssessmentUnassessedLearnerView[];
  retryLearners?: AssessmentUnassessedLearnerView[];
  levelSignals: {
    windowDays: 14;
    ready: Array<{
      learnerId: string;
      learnerName: string;
      currentLevel: CefrLevel;
      targetLevel: CefrLevel;
      metrics: Array<{
        key: "lessonCompletion" | "firstTryAccuracy" | "weeklyPractice" | "coachRubric";
        label: string;
        current: number;
        target: number;
        display: string;
        met: boolean;
      }>;
    }>;
    weak: Array<{
      learnerId: string;
      learnerName: string;
      currentLevel: CefrLevel;
      wrongWeeks: Array<{ weekNumber: number; partCount: number; wrongPercent: number }>;
    }>;
    inFlow: AssessmentReviewFlowView[];
  };
  topicReports?: Array<{
    id: string;
    learnerId: string;
    learnerName: string;
    topic: string;
    reason: string;
    strikeCount: number;
    status: "open" | "resolved";
    createdAt: string;
  }>;
}

export interface AssessmentLevelFormView {
  definitionId: string;
  versionId: string;
  title: string;
  version: number;
  publishedAt: string | null;
  listeningTaskCount: number;
  readingTaskCount: number;
  attemptCount: number;
  status: "draft" | "published" | "retired";
}

export interface AssessmentLevelFormSlotView {
  targetLevel: Exclude<CefrLevel, "A1">;
  publishedForm: AssessmentLevelFormView | null;
  draftForm: AssessmentLevelFormView | null;
}

/**
 * Full authoring evidence for a level-up form.  The list endpoint deliberately
 * stays summary-only; this view is returned by the preview endpoint so answer
 * keys and warnings are only exposed when an Operator opens a concrete version.
 */
export interface AssessmentLevelFormDetailView extends AssessmentLevelFormView {
  targetLevel: Exclude<CefrLevel, "A1">;
  sections: Array<{
    code: AssessmentSectionCode;
    title: string;
    durationMinutes: number;
    maxScore: number;
    instructions: string[];
    groups: Array<{
      key: string;
      title: string;
      instruction: string;
      stimulus?: AssessmentStimulus;
      maxPlays?: number;
      tasks: Array<AssessmentTaskView & { correctAnswer?: string | null }>;
    }>;
  }>;
  warnings: Array<{
    code: "missing_section" | "short_section" | "missing_answer_key" | "in_use";
    message: string;
    severity: "warning" | "error";
  }>;
  versions: AssessmentLevelFormView[];
  deletable: boolean;
  deleteReason: string | null;
}

export interface AssessmentLevelFormDeleteView {
  deleted: true;
  versionId: string;
}

/** The evidence an Operator needs when deciding a learner's level. */
export interface AssessmentReviewAttemptSummaryView {
  id: string;
  kind: "placement" | "final" | "level_up";
  title: string;
  status: AssessmentAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  totalScore: number | null;
  sectionScores: Partial<Record<AssessmentSectionCode, number>>;
  suggestedLevel: CefrLevel | null;
  approvedLevel: CefrLevel | null;
}

export interface AssessmentReviewLearnerView {
  learner: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    createdAt: string;
    currentLevel: CefrLevel | null;
    cefrApproved: boolean;
    pendingLevel: { targetLevel: CefrLevel; effectiveAt: string; mode: "scheduled" | "recommend_lower"; reason: string } | null;
  };
  profile: Partial<LearnerProfileData>;
  monthlyGoal: string | null;
  levelHistory: Array<{
    from: CefrLevel | null;
    to: CefrLevel;
    changedAt: string;
    mode: "direct" | "scheduled" | "recommend_lower";
    reason: string;
    evidence: string;
    changedBy: string | null;
  }>;
  attempts: AssessmentReviewAttemptSummaryView[];
  deletionRequests: AssessmentDeletionRequestView[];
}

export interface AssessmentReviewAttemptDetailView extends AssessmentReviewAttemptSummaryView {
  learnerId: string;
  learnerName: string;
  taskPrompts?: Array<{
    section: AssessmentSectionCode;
    taskKey: string;
    title?: string;
    prompt: string;
  }>;
  responses: Array<AssessmentResponseView & { prompt?: string; title?: string }>;
  overallCefr?: CefrLevel | null;
  totalTimeSeconds?: number | null;
  totalTimeLimitMinutes?: number;
  scores: Array<{
    section: AssessmentSectionCode;
    score: number;
    source: "deterministic" | "ai" | "human";
    criteria: Record<string, unknown>;
  }>;
  sections?: Array<{
    section: AssessmentSectionCode;
    label: string;
    maxScore?: number;
    durationMinutes?: number;
    actualSeconds?: number | null;
    score: number | null;
    cefr?: CefrLevel | null;
    source: "deterministic" | "ai" | "human" | null;
    criteria: Record<string, unknown>;
    comment?: string | null;
    state: "scored" | "not_scored";
    groups?: Array<{
      key: string;
      label: string;
      tasks: Array<{ taskKey: string; title?: string; prompt: string; answer: string | null }>;
    }>;
  }>;
  integrityEvents: Array<Record<string, unknown>>;
  activity?: Array<{ at: string; label: string; detail?: string }>;
  decision: AssessmentDecisionView | null;
}

export interface ManualAssessmentScoreInput {
  writingCriteria: {
    taskAchievement: number;
    organization: number;
    vocabulary: number;
    grammar: number;
    workplaceCommunication: number;
  };
  speakingCriteria: {
    fluency: number;
    grammar: number;
    vocabulary: number;
    professionalCommunication: number;
  };
  comment: string;
}

export interface AssessmentReviewChallengeView {
  sessionId: string;
  assessmentAttemptId: string;
  targetLevel: CefrLevel;
  status: "active" | "completed";
  progress: {
    completedTurns: number;
    requiredTurns: 6;
    average: number;
    offTopic: number;
    complete: boolean;
    passed: boolean;
  };
  turns: Array<{
    id: string;
    turnNumber: number;
    speaker: "learner" | "coach";
    text: string;
    coachText: string | null;
    feedback: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export type AssessmentLevelChangeMode = "direct" | "scheduled" | "recommend_lower";

export interface AssessmentLevelChangeInput {
  mode: AssessmentLevelChangeMode;
  targetLevel: CefrLevel;
  reason: string;
  evidence: string;
}

export interface AssessmentLevelChangeView extends AssessmentLevelChangeInput {
  learnerId: string;
  previousLevel: CefrLevel | null;
  effectiveAt: string;
  changedBy: string;
  changedAt: string;
}

export interface AssessmentMonthlyGoalView {
  learnerId: string;
  monthlyGoal: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AssessmentDeletionRequestView {
  id: string;
  learnerId: string;
  learnerName: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  note?: string | null;
}
