import type { CefrLevel } from "./domain-contract.js";

export type CoachPersona = "informal" | "formal";

export interface CoachSuggestionView {
  original: string;
  corrected: string;
  explanation: string;
}

export interface CoachFeedbackView {
  relevant: boolean;
  relevanceNote: string;
  rubric: { meaning: number; vocabulary: number; grammar: number };
  suggestions: CoachSuggestionView[];
  correctedText: string;
}

export interface CoachMessageView {
  id: string;
  speaker: "learner" | "coach";
  text: string;
  createdAt: string;
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
  vocabulary: Array<{ word: string; meaning: string; opened: boolean }>;
}

export interface CoachMessageInput {
  requestId: string;
  message: string;
}
