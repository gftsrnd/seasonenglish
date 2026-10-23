import type { AssessmentSectionCode, CefrLevel } from "@e4s/contracts";

export interface ObjectiveScoreInput {
  taskKey: string;
  answer: string | null | undefined;
  correctAnswer: string;
  maxScore: number;
}

export function calculateAutomaticSectionScore(items: readonly ObjectiveScoreInput[]) {
  const score = items.reduce((total, item) =>
    total + (item.answer === item.correctAnswer ? item.maxScore : 0), 0);
  return {
    score: roundScore(score),
    maxScore: roundScore(items.reduce((total, item) => total + item.maxScore, 0)),
    answered: items.filter((item) => item.answer !== null && item.answer !== undefined && item.answer !== "").length,
    total: items.length
  };
}

export interface WritingTaskScoreInput {
  taskKey: string;
  criterionScores: readonly number[];
  weight: number;
}

export function calculateWritingScore(tasks: readonly WritingTaskScoreInput[]) {
  if (tasks.length === 0 || tasks.some((task) => task.criterionScores.length !== 5)) {
    return { score: null, maxScore: 20, status: "pending_review" as const };
  }
  const invalid = tasks.some((task) => task.criterionScores.some((score) => score < 0 || score > 4));
  if (invalid) throw new RangeError("Writing criterion scores must be between 0 and 4");
  const score = tasks.reduce((total, task) => {
    const raw = task.criterionScores.reduce((sum, value) => sum + value, 0);
    return total + (raw / 20) * task.weight;
  }, 0);
  return { score: roundScore(score), maxScore: 20, status: "scored" as const };
}

export interface SpeakingTaskScoreInput {
  taskKey: string;
  criterionScores: readonly number[] | null;
  evidenceType: "audio" | "transcript" | "typed_proxy" | "technical_failure" | "skipped";
}

export function calculateSpeakingScore(tasks: readonly SpeakingTaskScoreInput[]) {
  if (tasks.some((task) => task.evidenceType === "technical_failure" || task.criterionScores === null && task.evidenceType !== "skipped")) {
    return { score: null, maxScore: 20, status: "pending_evidence" as const };
  }
  if (tasks.length !== 4) return { score: null, maxScore: 20, status: "pending_review" as const };
  const score = tasks.reduce((total, task) => {
    if (task.evidenceType === "skipped") return total;
    const criteria = task.criterionScores ?? [];
    if (criteria.length !== 4 || criteria.some((value) => value < 0 || value > 5)) {
      throw new RangeError("Speaking task requires four criterion scores between 0 and 5");
    }
    return total + criteria.reduce((sum, value) => sum + value, 0) / 4;
  }, 0);
  return { score: roundScore(score), maxScore: 20, status: "scored" as const };
}

export function mapPlacementCefr(totalScore: number): CefrLevel {
  if (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > 100) {
    throw new RangeError("Placement score must be between 0 and 100");
  }
  if (totalScore < 25) return "A1";
  if (totalScore < 45) return "A2";
  if (totalScore < 65) return "B1";
  if (totalScore < 85) return "B2";
  return "C1";
}

export function calculatePlacementResult(scores: Record<AssessmentSectionCode, number | null>) {
  if (Object.values(scores).some((score) => score === null)) {
    return { status: "pending_review" as const, totalScore: null, cefr: null };
  }
  const totalScore = roundScore(Object.values(scores).reduce<number>((total, score) => total + Number(score), 0));
  return { status: "scored" as const, totalScore, cefr: mapPlacementCefr(totalScore) };
}

export type PlacementManualReviewReason =
  | "missing_productive_score"
  | "technical_failure"
  | "typed_proxy"
  | "material_skill_gap"
  | "cefr_boundary";

export function placementManualReviewReasons(input: {
  scores: Record<AssessmentSectionCode, number | null>;
  speakingEvidence: readonly ("audio" | "transcript" | "typed_proxy" | "technical_failure" | "skipped")[];
}): PlacementManualReviewReason[] {
  const reasons = new Set<PlacementManualReviewReason>();
  if (input.scores.writing === null || input.scores.speaking === null) reasons.add("missing_productive_score");
  if (input.speakingEvidence.includes("technical_failure")) reasons.add("technical_failure");
  if (input.speakingEvidence.includes("typed_proxy")) reasons.add("typed_proxy");

  const maxima: Record<AssessmentSectionCode, number> = { listening: 20, reading: 40, writing: 20, speaking: 20 };
  const normalized = (Object.keys(maxima) as AssessmentSectionCode[])
    .map((section) => input.scores[section] === null ? null : Number(input.scores[section]) / maxima[section] * 100);
  if (normalized.every((score): score is number => score !== null)) {
    if (Math.max(...normalized) - Math.min(...normalized) >= 25) reasons.add("material_skill_gap");
    const total = Object.values(input.scores).reduce<number>((sum, score) => sum + Number(score), 0);
    if ([25, 45, 65, 85].some((boundary) => Math.abs(total - boundary) <= 0.5)) reasons.add("cefr_boundary");
  }
  return [...reasons];
}

export function passesLevelUp(scores: Record<AssessmentSectionCode, number>): boolean {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  return total >= 70 && Object.values(scores).every((value) => value >= 12.5);
}

function roundScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
