import type { CefrLevel } from "./domain-contract.js";

export type CoachPersona = "informal" | "formal";

export type CoachTurnClassification = "normal" | "corrected" | "off-topic" | "insufficient" | "curt" | "error";

export interface CoachVocabularyView {
  word: string;
  meaning: string;
  opened: boolean;
}

export interface CoachSuggestionView {
  original: string;
  corrected: string;
  translation?: string;
  explanation: string;
}

export interface CoachRubricCriterionView {
  score: number;
  evidence: string;
  improvement: string;
}

export interface CoachCorrectionView {
  original: string;
  corrected: string;
  translation: string;
  reason: string;
}

export interface CoachFeedbackView {
  /** Legacy compatibility for challenge/progress readers; prefer evaluation.status. */
  relevant: boolean;
  relevanceNote: string;
  evaluation: {
    status: "valid" | "insufficient" | "off_topic";
    result: "correct" | "partially_correct" | "missing_information" | "off_topic";
    countsTowardGoal: boolean;
    noteVi: string;
  };
  classification?: CoachTurnClassification;
  seasonReply: string;
  seasonReplyTranslation: string;
  nextQuestion: string;
  nextQuestionTranslation: string;
  rubric: { meaning: CoachRubricCriterionView; vocabulary: CoachRubricCriterionView; grammar: CoachRubricCriterionView };
  corrections: CoachCorrectionView[];
  correctedText: string;
  suggestedAnswer: { text: string; translation: string };
}

export interface CoachMessageView {
  id: string;
  speaker: "learner" | "coach";
  text: string;
  createdAt: string;
  classification?: CoachTurnClassification;
  feedback?: CoachFeedbackView;
}

export interface CoachView {
  sessionId: string;
  topic: string;
  cefr: CefrLevel;
  persona: CoachPersona;
  aiAvailable: boolean;
  daily: { used: number; limit: number };
  weekly: { turns: number; target: number };
  messages: CoachMessageView[];
  vocabulary: CoachVocabularyView[];
}

export interface CoachMessageInput {
  requestId: string;
  message: string;
}

export interface LevelChallengeView {
  sessionId: string;
  assessmentAttemptId: string;
  targetLevel: CefrLevel;
  aiAvailable: boolean;
  daily: { used: number; limit: number };
  progress: {
    completedTurns: number;
    requiredTurns: 6;
    average: number;
    offTopic: number;
    complete: boolean;
    passed: boolean;
  };
  /** Server-owned lifecycle state; React must not infer it from turn counts. */
  phase?: "new" | "resume" | "complete";
  result?: LevelChallengeResultView | null;
  request?: LevelChallengeRequestView | null;
  retakePlan?: LevelChallengeRetakeView | null;
  messages: CoachMessageView[];
}

export interface LevelChallengeResultView {
  id: string;
  assessmentAttemptId: string;
  sessionId: string;
  completedTurns: number;
  average: number;
  offTopic: number;
  passed: boolean;
  createdAt: string;
}

export interface LevelChallengeRequestView {
  id: string;
  assessmentAttemptId: string;
  targetLevel: CefrLevel;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string | null;
}

export interface LevelChallengeRetakeView {
  status: "available";
  message: string;
}
