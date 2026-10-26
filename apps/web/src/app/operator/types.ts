import type { ReactNode } from "react";
import type { AssessmentReviewLearnerView, ContentLessonDraftInput, LessonPartCode } from "@e4s/contracts";

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1";
export type AsyncState = "idle" | "loading" | "success" | "error";

export const OPERATOR_LESSON_PART_ORDER = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const satisfies readonly LessonPartCode[];

export const OPERATOR_REQUIRED_LESSON_PARTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "speaking"
] as const satisfies readonly LessonPartCode[];

export interface LessonJsonValidationResult {
  valid: boolean;
  errors: string[];
  lesson?: ContentLessonDraftInput;
}

export interface LessonJsonEditorProps {
  lesson: ContentLessonDraftInput;
  onSave(lesson: ContentLessonDraftInput): void | Promise<void>;
  onCancel(): void;
  busy?: boolean | undefined;
  readOnly?: boolean | undefined;
  error?: string | null | undefined;
}

export interface SectionScore {
  label: string;
  percent: number | null;
  heuristic?: boolean;
}

export interface PendingPlacement {
  id: string;
  learnerId?: string;
  name: string;
  submittedAt: string;
  total?: number | undefined;
  rawLevel?: Cefr | undefined;
  aiSuggestedCefr?: Cefr | null;
  sectionScores: SectionScore[];
  rationale?: string | null | undefined;
  monthlyGoal?: string | null | undefined;
  profileSummary?: string | null | undefined;
  suggestedLevel?: Cefr | undefined;
  levels: Cefr[];
  aiScored?: boolean | undefined;
  aiScoringStatus?: "queued" | "running" | "succeeded" | "failed" | undefined;
  aiScoringErrorCode?: string | null | undefined;
  humanScored?: boolean | undefined;
  canRescore?: boolean | undefined;
  rescoreBusy?: boolean | undefined;
  deletionPending?: boolean | undefined;
}

export interface LevelRequest {
  id: string;
  learnerName: string;
  from?: Cefr | undefined;
  to?: Cefr | undefined;
  sentAt: string;
  testSummary?: string | null;
  testId?: string | null;
  challengeSummary?: string | null;
  challengeId?: string | null;
}

export interface LevelSignalPerson {
  id: string;
  name: string;
  cefr: Cefr;
  target?: Cefr | null;
  metrics: string;
  pendingLevel?: Cefr | null;
  testId?: string | null;
  challengeId?: string | null;
}

export interface ApprovedLearner {
  id: string;
  name: string;
  cefr: Cefr;
  pendingLevel?: Cefr | null;
  profileSummary?: string | null;
  placementScore?: number | null;
  monthlyGoal?: string | null;
  testId?: string | null;
}

export interface UnassessedLearner {
  id: string;
  name: string;
  profileSummary?: string | null;
  hasProfile?: boolean;
}

export interface TopicReport {
  id: string;
  learnerName: string;
  at: string;
  inputs: Array<{ input: string; reason: string }>;
}

export interface OperatorDashboardView {
  week: { current?: number; total?: number; topic?: string | null | undefined };
  aiConnected: boolean;
  aiConfigured?: boolean;
  aiProvider?: string | null;
  openAppeals: number;
  windowDays?: number;
  topicReports: TopicReport[];
  pending: PendingPlacement[];
  pendingProfiles?: Record<string, AssessmentReviewLearnerView | null>;
  expandedPendingProfiles?: Record<string, true>;
  levelRequests: LevelRequest[];
  ready: LevelSignalPerson[];
  weak: LevelSignalPerson[];
  inFlow: LevelSignalPerson[];
  approved: ApprovedLearner[];
  unassessed: UnassessedLearner[];
  inProgress: UnassessedLearner[];
  retry: UnassessedLearner[];
  deletionRequests?: ReactNode;
  trash?: ReactNode;
}

export interface OperatorDashboardActions {
  onResolveTopicReport(id: string): void;
  onApprovePlacement(id: string, cefr: Cefr): void;
  onViewTest(id: string): void;
  onRescore(id: string): void;
  onDeleteLearner(id: string): void;
  onApproveLevelRequest(id: string): void;
  onRejectLevelRequest(id: string): void;
  onViewChallenge(id: string): void;
  onDemote(id: string): void;
  onChangeLevel(id: string): void;
  onEditGoal(id: string): void;
  onViewProfile(id: string): void;
  onAssignWeeklyPractice?(id: string): void;
  onTogglePendingProfile?: (id: string) => void;
  onSetLevelDirect(id: string): void;
  onOpenAppeals(): void;
  onOpenSettings(): void;
  onOpenWeeks(): void;
  onOpenLevelForms(): void;
}

export type DashboardActionKey = "resolveTopicReport" | "approvePlacement" | "viewTest" | "rescore" | "deleteLearner" | "decideLevelRequest" | "viewChallenge" | "demote" | "changeLevel" | "editGoal" | "viewProfile" | "assignWeeklyPractice" | "setLevelDirect";

export interface LevelFormSummary {
  id: string;
  title: string;
  status: "draft" | "approved";
  short?: boolean;
  createdAt: string;
  byName: string;
  listeningQuestions: number;
  readingQuestions: number;
  attempts: number;
  inUse?: boolean;
}

export interface OperatorLevelFormsView {
  aiConnected: boolean;
  generatingTarget: Cefr | null;
  generateState?: AsyncState | undefined;
  generateError?: string | null | undefined;
  targets: Array<{ target: Exclude<Cefr, "A1">; forms: LevelFormSummary[] }>;
}

export interface OperatorLevelFormsActions {
  onBack(): void;
  onOpenSettings(): void;
  onGenerate(target: Cefr): void;
  onView(id: string): void;
  onApprove(id: string): void;
  onDelete(id: string): void;
}
export type LevelFormActionKey = "generate" | "view" | "approve" | "delete";

export interface WeekSuggestionOption {
  topic: string;
  description: string;
  objectives: string;
  keyVocabHint: string;
  plan: Partial<Record<Cefr, string[]>>;
}

export type WeekSuggestion =
  | { state: "closed" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "confirmed"; topic: string; levels?: Cefr[]; options?: WeekSuggestionOption[] }
  | { state: "options"; levels: Cefr[]; options: WeekSuggestionOption[] };

export interface WeekFrame {
  number: number;
  dateRange: string;
  current: boolean;
  topic: string;
  description: string;
  objectives: string;
  keyVocabHint: string;
  suggestion?: WeekSuggestion | undefined;
}

export interface OperatorWeeksView {
  pilotStartDate: string;
  pilotWeeks: number;
  aiConnected: boolean;
  status: string;
  saveState?: AsyncState | undefined;
  saveError?: string | null | undefined;
  generationDialog?: { weeks: number[]; selectedWeeks: number[]; replacementWeeks: number[]; levelCount: number } | undefined;
  weeks: WeekFrame[];
}

export interface OperatorWeeksActions {
  onSuggestAll(): void;
  onSuggestWeek(week: number): void;
  onCloseSuggestion(week: number): void;
  onConfirmSuggestion(week: number, index: number): void;
  onReopenSuggestion(week: number): void;
  onChangeWeek(week: number, patch: Partial<Pick<WeekFrame, "topic" | "description" | "objectives" | "keyVocabHint">>): void;
  onSave(): void;
  onToggleGenerationWeek?(week: number): void;
  onCancelGeneration?(): void;
  onStartGeneration?(weeks: number[]): void;
  onOpenLessons(): void;
}

export interface LessonMatrixDay {
  day: string;
  title: string | null;
  planned?: boolean;
}

export interface LessonMatrixCell {
  cefr: Cefr;
  status: "empty" | "draft" | "review" | "approved";
  generatedAt?: string | null;
  incomplete?: boolean;
  lessons: number;
  days: LessonMatrixDay[];
}

export interface OperatorLessonsView {
  aiConnected: boolean;
  generating?: { week: number; cefr: Cefr; message?: string | undefined } | null | undefined;
  generateError?: string | null | undefined;
  extraLevels: Cefr[];
  levels: Array<{ cefr: Cefr; learnerCount: number }>;
  weeks: Array<{ number: number; topic?: string | null; cells: LessonMatrixCell[] }>;
}

export interface OperatorLessonsActions {
  onOpenSettings(): void;
  onAddLevel(cefr: Cefr): void;
  onRemoveLevel(cefr: Cefr): void;
  onGenerate(week: number, cefr: Cefr): void;
  onCreateManual(week: number, cefr: Cefr): void;
  onOpenSet(week: number, cefr: Cefr): void;
}
export type LessonMatrixActionKey = "generate" | "manual" | "open";

export interface LessonSetLesson {
  id: string;
  day: number;
  dayLabel: string;
  title: string;
  durationMin: number;
  practiceKind: "tự viết" | "điền từ" | "trắc nghiệm";
  practiceAnswer: string;
  manual?: boolean;
  complete: boolean;
  intro?: string;
  content: ReactNode;
}

export interface OperatorLessonSetView {
  week: number;
  cefr: Cefr;
  status: "draft" | "review" | "approved";
  topic: string;
  explanationLanguage: "tiếng Việt" | "tiếng Anh";
  aiConnected: boolean;
  mutationState?: AsyncState | undefined;
  mutationMessage?: string | null | undefined;
  activeMutation?: LessonSetActionKey | undefined;
  warnings: {
    incomplete: number;
    level: string[];
    phrases: number;
    details: number;
    detailIssues?: Array<{ lessonId: string; dayLabel: string; title: string; missing: string[] }> | undefined;
  };
  weeklyPractice: {
    task: string;
    guidance: string;
    inputModeLabel: string;
    requiredVocabulary: string[];
  };
  lessons: LessonSetLesson[];
}

export interface OperatorLessonSetActions {
  onBack(): void;
  onApprove(): void;
  onUnapprove(): void;
  onRegenerate(): void;
  onDeleteSet(): void;
  onFillPhrases(): void;
  onEnrich(): void;
  onEditLesson(id: string): void;
  onDeleteLesson(id: string): void;
  onComposeDay(day: number): void;
}
export type LessonSetActionKey = "approve" | "unapprove" | "regenerate" | "deleteSet" | "fillPhrases" | "enrich" | "editLesson" | "deleteLesson" | "composeDay";

export type ReviewTab = "subs" | "coach" | "weekly" | "appeals" | "attempts" | "tests";

export interface ReviewWeeklyPractice {
  id: string;
  week: number;
  cefr: Cefr;
  topic: string;
  status: "draft" | "review" | "approved";
  version: number;
  task: string;
  guidance: string;
  requiredVocabulary: string[];
}

export interface ReviewWeeklyPracticeInput {
  week: number;
  cefr: Cefr;
  expectedVersion: number;
  task: string;
  guidance: string;
  requiredVocabulary: string[];
}

export interface RubricScore { meaning: number; vocab: number; grammar: number }
export interface Suggestion { original: string; corrected: string; explanation: string }

export interface ReviewSubmission {
  id: string;
  learnerName: string;
  cefr?: Cefr | undefined;
  week: number;
  type?: "dialogue" | "writing" | undefined;
  submittedAt: string;
  operatorChecked: boolean;
  task?: string | undefined;
  text: string;
  total?: number | null;
  rubric?: RubricScore | null;
  aiGraded?: boolean;
  feedback?: string | null;
  suggestions?: Suggestion[];
}

export interface ReviewCoachTurn {
  id: string;
  sessionId: string;
  learnerName: string;
  cefr?: Cefr | undefined;
  week?: number | undefined;
  at: string;
  checked: boolean;
  userText: string;
  reply: string;
  rubric?: RubricScore | null;
  suggestions?: Suggestion[];
}

export interface ReviewAppeal {
  id: string;
  learnerName: string;
  cefr?: Cefr | undefined;
  title?: string | undefined;
  part?: string | undefined;
  at: string;
  kind?: "part" | "sub" | undefined;
  attempts?: number;
  status: "pending" | "accepted" | "rejected";
  statusLabel?: string | undefined;
  question?: string | undefined;
  options?: string[];
  answer?: string | undefined;
  key?: string | null;
  aiFeedback?: string | null;
  reason: string;
  decidedSummary?: string | null;
}

export interface ReviewAttempt {
  id: string;
  learnerId: string;
  learnerName: string;
  cefr?: Cefr | undefined;
  lesson: string;
  listening: string;
  reading: string;
  writing: string;
  speaking: string;
  total: number;
}

export interface ReviewTest {
  id: string;
  learnerName: string;
  kind: "placement" | "level_up";
  submittedAt?: string | undefined;
  total?: number | undefined;
  rawLevel?: Cefr | undefined;
  aiSuggestedCefr?: Cefr | null;
}

export interface OperatorReviewView {
  activeTab: ReviewTab;
  counts: Record<ReviewTab, number>;
  submissions: ReviewSubmission[];
  coachTurns: ReviewCoachTurn[];
  weeklyPractices: ReviewWeeklyPractice[];
  appeals: ReviewAppeal[];
  attempts: ReviewAttempt[];
  tests: ReviewTest[];
  aiConnected?: boolean | undefined;
}

export interface OperatorReviewActions {
  onTabChange(tab: ReviewTab): void;
  onMarkSubmission(id: string, checked: boolean): void;
  onMarkCoachTurn(id: string, checked: boolean): void;
  onGradeAi(id: string): void;
  onGradeManual(id: string): void;
  onDecideAppeal(id: string, accepted: boolean): void;
  onViewTest(id: string): void;
  onSaveWeeklyPractice?(input: ReviewWeeklyPracticeInput): void | Promise<void>;
}
export type ReviewActionKey = "checkSubmission" | "checkCoach" | "gradeAi" | "gradeManual" | "decideAppeal" | "viewTest";

export type PromptKey = "base" | "placement" | "lesson" | "weeks" | "coach" | "grade";
export interface OperatorPromptsView { prompts: Array<[PromptKey, string, string, "draft" | "active" | "retired", number]>; saveState?: AsyncState | undefined; saveError?: string | null | undefined }
export interface OperatorPromptsActions {
  onBack(): void;
  onReset(key: PromptKey): void;
  onSave(prompts: Record<PromptKey, string>): void;
  onPublish(key: PromptKey, version: number): void;
}
