import type { AssessmentKind, CefrLevel } from "./domain-contract.js";
export type AssessmentSectionCode = "listening" | "reading" | "writing" | "speaking";
export type AssessmentScreenState = "preparation" | AssessmentSectionCode | "submitting" | "pending";
export type AssessmentAttemptStatus = "in_progress" | "submitted" | "pending_review" | "approved" | "needs_retry";
export type AssessmentEvidenceType = "choice" | "text" | "audio" | "transcript" | "typed_proxy" | "technical_failure";

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
  totalScore?: number | null;
  suggestedLevel?: CefrLevel | null;
}

export interface AssessmentView {
  definition: AssessmentDefinitionView;
  screenState: AssessmentScreenState;
  attempt: AssessmentAttemptView | null;
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
  kind: AssessmentKind;
  title: string;
  submittedAt: string;
  sectionScores: Partial<Record<AssessmentSectionCode, number>>;
  suggestedLevel: CefrLevel | null;
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
}

export interface AssessmentReviewOverviewView {
  pendingAssessments: AssessmentReviewQueueItem[];
  pendingLevelUp: AssessmentReviewQueueItem[];
  approvedLearners: AssessmentApprovedLearnerView[];
  unassessedLearners: AssessmentUnassessedLearnerView[];
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
}

export interface AssessmentLevelFormSlotView {
  targetLevel: Exclude<CefrLevel, "A1">;
  publishedForm: AssessmentLevelFormView | null;
}
