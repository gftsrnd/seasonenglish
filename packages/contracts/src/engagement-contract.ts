import type { CefrLevel } from "./domain-contract.js";
import type { LearnerAvatarData } from "./learning-contract.js";
import type { ContentImageAttribution } from "./media-contract.js";

export type WeeklyPracticeState = "locked" | "open" | "draft" | "submitted" | "reviewed";

export type WeeklyPracticeReviewState = "ungraded" | "graded-ai" | "graded-manual" | "appeal-pending" | "appeal-decided";

export interface WeeklyPracticeAppealView {
  id: string;
  submissionId: string;
  status: "pending" | "accepted" | "rejected";
  reason: string;
  resolution?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface WeeklyPracticeHistoryItem {
  id: string;
  weekId: string;
  weekNumber: number;
  topic: string;
  task: string;
  submittedAt: string | null;
  score: null | { total: number; rubric?: { meaning: number; vocabulary: number; grammar: number } };
}

export interface WeeklyPracticeView {
  state: WeeklyPracticeState;
  weekId: string;
  weekNumber: number;
  topic: string;
  completedLessons: number;
  totalLessons: number;
  task: string;
  guidance: string;
  submission: null | {
    id: string;
    status: "draft" | "submitted" | "reviewed";
    text: string;
    submittedAt: string | null;
    score: null | { total: number; rubric?: { meaning: number; vocabulary: number; grammar: number } };
    gradingSource?: "ai" | "manual";
    reviewState?: WeeklyPracticeReviewState;
    feedback: string;
    suggestions: Array<{ original: string; corrected: string; explanation: string }>;
    correctedText: string;
  };
  reviewState?: WeeklyPracticeReviewState;
  appeal?: WeeklyPracticeAppealView | null;
  inputMode?: "write" | "dialogue";
  speechSupported?: boolean;
  history?: WeeklyPracticeHistoryItem[];
}

export interface WeeklyPracticeAssignmentView {
  status: "assigned" | "already_assigned";
  learnerId: string;
  submissionId: string;
  weekId: string;
  weekNumber: number;
  topic: string;
  task: string;
  guidance: string;
}

export type GameKey = "scramble" | "crossword" | "eggs" | "mario" | "sort" | "typing";

export type GameTopicModeration =
  | { state: "empty" }
  | { state: "invalid"; message: string }
  | { state: "unsafe"; strike: 1 | 2 | 3; message: string }
  | { state: "reported"; strike: 3; message: string; reportId?: string }
  | { state: "ai_rejected"; message: string }
  | { state: "loading" }
  | { state: "success"; topic: string }
  | { state: "error"; message: string };

export interface GameWordView {
  id: string;
  english: string;
  vietnamese: string;
  definition: string;
  partOfSpeech: string;
  /** Resolved by the server through the configured image provider and persisted with the word set. */
  imageUrl?: string;
  imageQuery?: string;
  imageAttribution?: ContentImageAttribution;
}

export interface GameDescriptor {
  key: GameKey;
  icon: string;
  name: string;
  description: string;
  goal: string;
  instructions: string[];
  scoring: string;
  best: null | { score: number; maxScore: number };
}

export interface GameWordSetView {
  id: string;
  topic: string;
  cefr: CefrLevel;
  source: "weekly" | "custom";
  words: GameWordView[];
  /** Custom AI sets contain eight off-topic options for multiple-choice game rounds. */
  distractors?: GameWordView[];
}

export interface GameHubView {
  cefr: CefrLevel;
  aiAvailable?: boolean;
  topicModeration?: GameTopicModeration;
  wordSet: GameWordSetView | null;
  games: GameDescriptor[];
  arena: { eligible: boolean; requiredLevel: "B1"; points: number; pendingDuels: number };
}

export interface GameAnswerInput {
  wordId: string;
  answer: string;
  attempts?: number;
  usedHint?: boolean;
  combo?: number;
}

export interface GameEvidenceEventInput {
  type: "wrong_catch" | "timeout";
  wordId: string;
  answer: string;
}

export interface GameFinishInput {
  answers: GameAnswerInput[];
  attemptSeed?: number;
  hintsUsed?: number;
  events?: GameEvidenceEventInput[];
}

export interface GameResultView {
  id: string;
  game: GameKey;
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  completedAt: string;
}

export interface ArenaView {
  eligible: boolean;
  requiredLevel: "B1";
  currentLevel: CefrLevel;
  learnerId: string;
  points: number;
  wordSetTopic: string | null;
  leaderboard: Array<{ rank: number; learnerId: string; displayName: string; avatar?: LearnerAvatarData; cefr: CefrLevel; points: number; played: number; won: number; lost: number }>;
  opponents: Array<{ id: string; displayName: string; avatar?: LearnerAvatarData; cefr: CefrLevel }>;
  duels: DuelSummaryView[];
}

export interface DuelSummaryView {
  id: string;
  game: GameKey;
  opponent: { id: string; displayName: string };
  state: "open" | "completed" | "expired" | "cancelled";
  myScore: null | { score: number; maxScore: number };
  opponentScore: null | { score: number; maxScore: number };
  outcome: "win" | "lose" | "draw" | "waiting" | "play";
  challengedByMe: boolean;
  wordSetTopic: string;
  createdAt: string;
}

export interface DuelView extends DuelSummaryView {
  wordSet: GameWordSetView;
  result?: GameResultView;
}

export interface RewardView {
  mode: "preview" | "done";
  learnerName: string;
  cefr: CefrLevel;
  cefrLabel: string;
  points: number;
  displayPoints: number;
  season: { name: string; description: string };
  simulated: boolean;
  earnedBadgeCount: number;
  requiredBadgeCount: number;
  printable: boolean;
  certificateNumber: string;
  completedAt: string;
  organizationName: string;
  operatorName: string;
  managerName: string;
  badges: Array<{ key: string; label: string; description: string; earned: boolean }>;
}

export interface SurveyView {
  state: "open" | "submitted";
  surveyKey: "pilot_end";
  answers?: { rating: number; comment: string; studyTime: "work" | "outside" | "both" };
  submittedAt?: string;
}
