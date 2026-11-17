import type { RequestEvidenceView } from "./request-evidence-contract.js";
import type { AssessmentKind, CefrLevel } from "./domain-contract.js";
import type { LearnerProfileData } from "./learning-contract.js";
export type AssessmentSectionCode = "listening" | "reading" | "writing" | "speaking";
export type AssessmentScreenState = "preparation" | AssessmentSectionCode | "submitting" | "pending";
export type AssessmentAttemptStatus = "in_progress" | "submitted" | "pending_review" | "approved" | "needs_retry";
export type AssessmentEvidenceType = "choice" | "text" | "audio" | "transcript" | "typed_proxy" | "technical_failure";
export type AssessmentViolationReason =
  | "visibility_hidden"
  | "window_blur"
  | "context_menu"
  | "copy"
  | "paste"
  | "new_window"
  | "logout";
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
  audioSrc?: string;
  /** Automatic Edge TTS after AI generation; "failed" keeps the script for the manual buttons. */
  audioSynthesis?: { status: "generated" | "failed"; code?: string; scriptHash?: string; at?: string; engine?: string };
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
  interaction?: {
    mode: "roleplay";
    openingMessage: string;
    maxLearnerTurns: number;
    durationSeconds: number;
    endConditions: Array<"time_limit" | "turn_limit" | "customer_accepted">;
    fallback: "one_way_manual_review";
  };
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
  appealTarget?: AssessmentAppealTargetView | null;
  /** Placement only: the learner's one Operator-granted retake, when there is one. */
  placementRetake?: AssessmentPlacementRetakeView | null;
}

/** Per-learner state of the one allowed retake: never granted, granted but not started, or used. */
export type AssessmentRetakeStatus = "not_granted" | "granted" | "used";

/**
 * The single placement retake (owner decision 11/2026). "granted": the next start creates a NEW
 * attempt on the published placement-retake form. "used": the retake attempt exists; after it is
 * submitted the Operator places the learner and that placement is final.
 */
export interface AssessmentPlacementRetakeView {
  status: "granted" | "used";
  reason: string;
  grantedAt: string;
  usedAt: string | null;
  retakeAttemptId: string | null;
}

/**
 * Learner support for placement. The original submission remains viewable after the retake
 * request window ends and while the learner is taking the retake.
 */
export interface AssessmentPlacementRetakeRequestView {
  original: {
    definition: AssessmentDefinitionView;
    attempt: AssessmentAttemptView;
    submittedAt?: string | null;
    feedback: string | null;
    objectiveAnswerKeys?: Partial<Record<"listening" | "reading", Record<string, string>>>;
  } | null;
  target: { attemptId: string; title: string; availableUntil: string | null } | null;
  request: { id: string; reason?: string; status: "pending" | "accepted" | "rejected"; resolution: string | null; createdAt: string; resolvedAt: string | null } | null;
  retake: AssessmentRetakeStatus;
  retakeActivity?: "in_progress" | "pending_review";
}

export interface AssessmentPlacementRetakeGrantInput {
  reason: string;
}

export interface AssessmentPlacementRetakeGrantView {
  learnerId: string;
  status: "granted";
  sourceAttemptId: string | null;
  reason: string;
  grantedBy: string;
  grantedAt: string;
}

export interface AssessmentAppealTargetView {
  attemptId: string;
  title: string;
  availableUntil: string | null;
  requiresProposedLevel?: boolean;
}

export interface AssessmentAppealView extends RequestEvidenceView {
  id: string;
  reason: string;
  proposedLevel?: CefrLevel | null;
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
  reviewFlags?: Array<"pending_score" | "incomplete" | "typed_speaking" | "borderline" | "skill_gap">;
  /** Placement only: retake state of this learner; a used retake makes this decision final. */
  placementRetake?: AssessmentRetakeStatus;
  /** True when this attempt is the learner's one placement retake (the Operator's final placement). */
  isPlacementRetake?: boolean;
  challenge?: { completedTurns: number; requiredTurns: 6; average: number; offTopic: number; complete: boolean; passed: boolean };
}

export interface AssessmentDecisionInput {
  status: "approved" | "needs_retry";
  approvedLevel?: CefrLevel;
  reason: string;
  /** Placement + needs_retry only: also grant the one retake ("Cho thi lại 1 lần"). */
  grantRetake?: boolean;
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
  trialCountsFrom?: string;
  /** Open staff exception letting the learner take the level-up test now. */
  levelUpOverride?: AssessmentLevelUpOverrideSummary | null;
  placementRetake?: AssessmentRetakeStatus;
}

export interface AssessmentUnassessedLearnerView {
  learnerId: string;
  learnerName: string;
  profileComplete: boolean;
  lifecycle?: "not_started" | "in_progress" | "needs_retry";
  lastAttemptAt?: string | null;
  placementRetake?: AssessmentRetakeStatus;
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
  placementTrial?: { month: string; countsFrom: string; levels: CefrLevel[] };
  openAppeals?: number;
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
        key: "lessonCompletion" | "firstTryAccuracy" | "weeklyPractice" | "coachRubric" | "wrongRate";
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
  /** Derived from the same publication gates the server enforces. */
  publicationReady?: boolean;
  publicationBlockerCount?: number;
}

/**
 * A level-form slot: one per level-up target, plus "placement-retake" for the AI-generated
 * placement retake form (mixed A1–C1 banding, same 20/40/2/4 structure as placement-a).
 */
export type AssessmentLevelFormTarget = Exclude<CefrLevel, "A1"> | "placement-retake";

export interface AssessmentLevelFormSlotView {
  targetLevel: AssessmentLevelFormTarget;
  publishedForm: AssessmentLevelFormView | null;
  draftForm: AssessmentLevelFormView | null;
}

/**
 * Full authoring evidence for a level-up form.  The list endpoint deliberately
 * stays summary-only; this view is returned by the preview endpoint so answer
 * keys and warnings are only exposed when an Operator opens a concrete version.
 */
export interface AssessmentLevelFormDetailView extends AssessmentLevelFormView {
  targetLevel: AssessmentLevelFormTarget;
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
    code: "missing_section" | "short_section" | "missing_task_prompt" | "missing_answer_key" | "missing_audio" | "in_use" | "quality_check";
    message: string;
    severity: "warning" | "error";
  }>;
  versions: AssessmentLevelFormView[];
  deletable: boolean;
  deleteReason: string | null;
  /** What the generation auto-fix changed before the draft was shown ("Hệ thống đã tự sửa: …"). */
  autoFixed?: string[];
}

/**
 * Operator-only, persisted form definition used by the shared assessment
 * viewer.  It is intentionally based on the saved version blueprint rather
 * than a browser-side template, so fixed forms and generated forms are shown
 * with the exact same four-skill structure learners will receive.
 */
export interface AssessmentFormPreviewView {
  definitionId: string;
  versionId: string;
  /** The approved month framework owning this monthly final, when available. */
  monthlyFrameworkId?: string;
  /** Database spelling is kept here so a category can be mapped without guessing. */
  kind: "placement" | "level_up" | "final" | "pass_course";
  title: string;
  version: number;
  status: "draft" | "published" | "retired";
  publishedAt: string | null;
  targetLevel: CefrLevel | null;
  totalMinutes: number;
  totalScore: number;
  /** Audio is only reported configured when every listening source is present in the saved blueprint. */
  audioConfigured: boolean;
  /** Only a draft may be edited; fixed placement and exit forms are read-only. */
  editable: boolean;
  sections: AssessmentLevelFormDetailView["sections"];
}

export interface AssessmentFormPreviewCollectionView {
  kind: AssessmentFormPreviewView["kind"];
  forms: AssessmentFormPreviewView[];
}

export interface AssessmentLevelFormDeleteView {
  deleted: true;
  versionId: string;
}

export interface AssessmentLevelFormUpdateInput {
  title: string;
  sections: AssessmentLevelFormDetailView["sections"];
}

/** The evidence an Operator needs when deciding a learner's level. */
export interface AssessmentReviewAttemptSummaryView {
  id: string;
  /** Database kinds use underscores; final and pass_course use this same detail shell. */
  kind: "placement" | "level_up" | "final" | "pass_course";
  title: string;
  status: AssessmentAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  totalScore: number | null;
  sectionScores: Partial<Record<AssessmentSectionCode, number>>;
  suggestedLevel: CefrLevel | null;
  approvedLevel: CefrLevel | null;
  /** Placement retake only, tied to the original attempt that granted it. */
  originalPlacementAttemptId?: string;
  placementDecision?: { reason: string; decidedAt: string; decidedBy: string | null };
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
  productiveRubric?: AssessmentProductiveRubricItem[];
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
  aiScoring?: {
    status: "queued" | "running" | "succeeded" | "failed";
    requestId: string;
    errorCode: string | null;
    updatedAt: string;
  } | null;
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
      tasks: Array<{
        taskKey: string;
        title?: string;
        prompt: string;
        answer: string | null;
        maxScore?: number;
        correctAnswer?: string;
      }>;
    }>;
  }>;
  integrityEvents: Array<Record<string, unknown>>;
  activity?: Array<{ at: string; label: string; detail?: string }>;
  decision: AssessmentDecisionView | null;
}

export interface ManualAssessmentScoreInput {
  rubricScores?: AssessmentRubricScore[];
  writingTasks: Array<{
    taskKey: string;
    criteria: {
      taskCompletion: number;
      organization: number;
      vocabulary: number;
      grammar: number;
      workplaceRegister: number;
    };
  }>;
  speakingTasks: Array<{
    taskKey: string;
    evidenceType: "audio" | "transcript" | "typed_proxy" | "technical_failure" | "skipped";
    criteria: {
      taskCompletionRelevance: number;
      grammarVocabulary: number;
      coherenceClarity: number;
      interactionProfessionalRegister: number;
    } | null;
  }>;
  comment: string;
}

export interface AssessmentRubricScore {
  code: string;
  score: number;
}

export interface AssessmentProductiveRubricItem {
  code: string;
  skill: "writing" | "speaking";
  maxScore: number;
  description: string;
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

export interface AssessmentLevelUpOverrideSummary {
  targetLevel: CefrLevel;
  reason: string;
  grantedBy: string | null;
  grantedAt: string;
}

export interface AssessmentLevelUpOverrideInput {
  reason: string;
}

export interface AssessmentLevelUpOverrideView {
  learnerId: string;
  currentLevel: CefrLevel;
  override: AssessmentLevelUpOverrideSummary | null;
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
