import type { AssessmentLevelFormUpdateInput, AssessmentSectionCode } from "./assessment-contract.js";
import type { CefrLevel } from "./domain-contract.js";

/**
 * Monthly final exam v2.0 ("Cấu trúc bài thi cuối tháng & quy tắc AI v2.0").
 * These types describe the Operator-only review package that is stored next to
 * the learner-facing blueprint. None of it may reach the learner package.
 */
export type MonthlyFinalExamStatus = "INPUT_ERROR" | "DRAFT" | "NEEDS_REVIEW" | "READY";
export type MonthlyFinalCheckStatus = "pass" | "fail" | "needs_review";
export type MonthlyFinalGenCode = `GEN${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23"}`;

export interface MonthlyFinalCheckView {
  code: MonthlyFinalGenCode;
  title: string;
  /** auto = decided by code; manual = needs an Operator's judgement (may have an automatic pre-check). */
  mode: "auto" | "manual";
  status: MonthlyFinalCheckStatus;
  detail: string;
}

export interface MonthlyFinalMappingRow {
  /** V01…VN in plan order. */
  code: string;
  termId: string;
  word: string;
  type: string;
  meaning: string;
  skill: AssessmentSectionCode;
  /** L01…, R01…, W2 or S3. */
  position: string;
  taskKey: string;
}

export interface MonthlyFinalGrammarComponent {
  stepId: string;
  label: string;
  acceptedPatterns: string[];
}

export interface MonthlyFinalGrammarTarget {
  code: "GA" | "GB";
  topicId: string;
  topicTitle: string;
  main: MonthlyFinalGrammarComponent;
  secondary: MonthlyFinalGrammarComponent;
  /** Steps of this topic that were taught this month; main/secondary are chosen from these. */
  taughtSteps: Array<{ stepId: string; focus: string; formula: string }>;
  /** Grammar roadmap month: main is fixed to step 1 and secondary to step 2 (docs/grammar-roadmap.md); absent on older exams. */
  roadmapLocked?: true;
}

export interface MonthlyFinalPronunciationTarget {
  code: "P1" | "P2" | "P3" | "P4";
  soundId: string;
  ipa: string;
  label: string;
  positions: Array<{ word: string; exampleId: string; target: string }>;
  /** The month's taught example words for this item (GEN11 source set). */
  taughtExamples: Array<{ exampleId: string; word: string }>;
}

export interface MonthlyFinalGraderPackage {
  listening: Array<{ groupKey: string; gaSentence: string; gbSentence: string }>;
  items: Record<string, { explanation: string; evidence?: string }>;
  writingSample: string;
  writingGrammarEvidence: { gaMain: string; gaSecondary: string; gbMain: string; gbSecondary: string };
  speakingSample: string;
  speakingGrammarEvidence: { gaMain: string; gbMain: string };
  rubric: Array<{ code: string; skill: "writing" | "speaking"; maxScore: number; description: string }>;
}

export interface MonthlyFinalExamMeta {
  specVersion: "2.0";
  status: MonthlyFinalExamStatus;
  source: "ai" | "manual";
  /** Phase hand-off: the exact approved plan this exam was built from. */
  framework: {
    id: string; version: number; scopeHash: string; month: string; cefr: CefrLevel; examDate: string;
    /** Content-only fingerprint of what the exam tests (no version numbers); absent on exams generated before 13/11/2026. */
    examScopeHash?: string;
  };
  formCode: string;
  allocation: { n: number; l: number; r: number; w: number; s: number };
  instructionLanguage: "vi" | "en";
  grammar: MonthlyFinalGrammarTarget[];
  pronunciation: MonthlyFinalPronunciationTarget[];
  mapping: MonthlyFinalMappingRow[];
  grader: MonthlyFinalGraderPackage;
  audio: { status: "SCRIPT_ONLY" | "REVIEWED"; reviewedAt: string | null; reviewedBy: string | null };
  /** GEN codes whose human-judgement review the Operator confirmed. */
  manualConfirmations: MonthlyFinalGenCode[];
  /**
   * Who confirmed each code and when (December 2026: a script ticked every
   * manual confirmation through the bulk update API without a reviewer opening
   * the items). The UI ticks one code at a time; this log keeps the API
   * accountable. Absent on drafts saved before the log existed.
   */
  manualConfirmationLog?: Array<{ code: MonthlyFinalGenCode; confirmedBy: string; confirmedAt: string }>;
  checks: MonthlyFinalCheckView[];
  generatedAt: string;
  /** What the generation fixed by itself before the draft was shown ("Hệ thống đã tự sửa: …"). */
  autoFixed?: string[];
}

export interface MonthlyFinalDraftView {
  definitionId: string;
  versionId: string;
  version: number;
  status: "draft" | "published";
  blueprint: AssessmentLevelFormUpdateInput & { targetLevel?: CefrLevel };
  exam: MonthlyFinalExamMeta | null;
  examDate: string;
  /** false after 00:00 of the exam date or once published. */
  editable: boolean;
  /** What the exam tests (terms, grammar, sounds, theme) no longer matches the approved plan. A version bump alone is not stale. */
  stale: boolean;
  /** Learners who have started the live published version (0 when none is published). */
  startedLearners?: number;
  /** A published, stale exam nobody has started: "Sinh lại đề" makes a new draft while this one stays live. */
  regenerable?: boolean;
  /** This draft replaces a published version that stays live until the draft is approved and published. */
  livePublishedVersion?: number | null;
}

export interface MonthlyFinalReviewInput {
  grammar?: Array<{ code: "GA" | "GB"; mainStepId: string; secondaryStepId: string; mainPatterns?: string[]; secondaryPatterns?: string[] }>;
  /** GA/GB sentences quoted from each listening script (GEN21). */
  listeningEvidence?: Array<{ groupKey: string; gaSentence: string; gbSentence: string }>;
  /** Grader explanation / script evidence per objective item (GEN15). */
  items?: Record<string, { explanation: string; evidence?: string }>;
  audioReviewed?: boolean;
  manualConfirmations?: MonthlyFinalGenCode[];
}

export interface MonthlyFinalUpdateInput extends AssessmentLevelFormUpdateInput {
  review?: MonthlyFinalReviewInput;
}
