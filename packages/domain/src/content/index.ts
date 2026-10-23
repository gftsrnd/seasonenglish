import type { LessonPart, LessonPartCode } from "@e4s/contracts";
import { validateLessonPartOrder } from "../learning/index.js";

const requiredParts = [
  ["objective", "Mục tiêu"],
  ["instruction", "Hướng dẫn"],
  ["vocabulary", "Từ vựng"],
  ["grammar", "Ngữ pháp"],
  ["pronunciation", "Phát âm"],
  ["listening", "Nghe"],
  ["reading", "Đọc"],
  ["writing", "Viết"],
  ["speaking", "Nói"]
] as const satisfies readonly (readonly [LessonPartCode, string])[];

export interface ContentLessonDraft {
  readonly dayNumber: number;
  readonly title: string;
  readonly durationMinutes: number;
  readonly parts: readonly LessonPart[];
}

export interface ContentValidationIssue {
  dayNumber: number;
  code: LessonPartCode | "title" | "order";
  message: string;
}

export function validateLessonDraft(lessons: readonly ContentLessonDraft[]): {
  valid: boolean;
  issues: ContentValidationIssue[];
} {
  const issues: ContentValidationIssue[] = [];
  for (const lesson of lessons) {
    if (!lesson.title.trim()) {
      issues.push({ dayNumber: lesson.dayNumber, code: "title", message: "Thiếu tên bài." });
    }
    const codes = lesson.parts.map((part) => part.code);
    for (const [code, label] of requiredParts) {
      if (!codes.includes(code)) issues.push({ dayNumber: lesson.dayNumber, code, message: `Thiếu phần ${label}.` });
    }
    if (!validateLessonPartOrder(codes).valid) {
      issues.push({ dayNumber: lesson.dayNumber, code: "order", message: "Các phần của bài chưa đúng thứ tự đã thống nhất." });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function submitContentForReview(input: {
  status: "draft" | "review" | "published" | "retired";
  lessons: readonly ContentLessonDraft[];
}): { status: "review" } {
  if (input.status !== "draft") throw new Error("CONTENT_NOT_DRAFT");
  const days = [...new Set(input.lessons.map((lesson) => lesson.dayNumber))].sort((a, b) => a - b);
  if (days.length !== 5 || days.some((day, index) => day !== index + 1)) {
    throw new Error("CONTENT_LESSON_SET_INCOMPLETE");
  }
  const validation = validateLessonDraft(input.lessons);
  if (!validation.valid) throw new Error("CONTENT_VALIDATION_FAILED");
  return { status: "review" };
}

export function approveContentVersion(input: {
  status: "draft" | "review" | "published" | "retired";
  createdBy: string;
  checkerId: string;
}): { status: "published"; approvedBy: string } {
  if (input.status !== "review") throw new Error("CONTENT_NOT_IN_REVIEW");
  return { status: "published", approvedBy: input.checkerId };
}

export function retirePublishedContent<T>(input: {
  status: "draft" | "review" | "published" | "retired";
  payload: T;
}): { status: "retired"; payload: T } {
  if (input.status !== "published") throw new Error("CONTENT_NOT_PUBLISHED");
  return { status: "retired", payload: input.payload };
}

export interface LessonObjectiveInput {
  type: "content" | "language";
  text: string;
  condition: string;
  criterion: string;
  assessmentCode: string;
}

export function validateLessonObjectives(input: {
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  explanationLanguage: "vi" | "en";
  objectives: readonly LessonObjectiveInput[];
  assessmentCodes: readonly string[];
}) {
  const issues = new Set<string>();
  if (input.objectives.length < 2 || input.objectives.length > 4) issues.add("objective_count_must_be_2_to_4");
  if (input.objectives.filter(({ type }) => type === "content").length !== 1) issues.add("exactly_one_content_objective");
  const observable = /\b(?:identify|select|match|list|describe|ask|answer|write|say|give|use|compare|summarize|complete|respond|present|pronounce|produce|distinguish)\b/i;
  for (const objective of input.objectives) {
    if (!/^SWBAT\b/i.test(objective.text.trim())) issues.add("objectives_must_start_with_swbat");
    if (!observable.test(objective.text)) issues.add("objective_verb_not_observable");
    if (!objective.condition.trim() || !objective.criterion.trim()) issues.add("missing_condition_or_criterion");
    if (!objective.assessmentCode.trim()) issues.add("missing_assessment_mapping");
  }
  const covered = new Set(input.objectives.map(({ assessmentCode }) => assessmentCode));
  for (const code of input.assessmentCodes) if (!covered.has(code)) issues.add(`assessment_coverage_gap:${code}`);
  const expectedLanguage = input.cefr === "A1" || input.cefr === "A2" ? "vi" : "en";
  if (input.explanationLanguage !== expectedLanguage) issues.add("wrong_explanation_language");
  return { valid: issues.size === 0, issues: [...issues] };
}

export function validateLexicalRelation(input: {
  target: string;
  targetPartOfSpeech: string;
  relation: string;
  relationPartOfSpeech: string;
  kind: "synonym" | "antonym";
  sameSense: boolean;
  substitutableInContext: boolean;
}) {
  return normalizeLessonAnswer(input.target) !== normalizeLessonAnswer(input.relation)
    && normalizeLessonAnswer(input.targetPartOfSpeech) === normalizeLessonAnswer(input.relationPartOfSpeech)
    && input.sameSense
    && input.substitutableInContext;
}

export function gradeLessonAnswer(input: {
  kind: "objective" | "self_writing" | "open";
  answer: string;
  acceptedAnswers: readonly string[];
  aiAvailable?: boolean;
}): { status: "correct" | "incorrect" | "invalid" | "manual_review"; correct: boolean | null; reason?: "minimum_two_words" } {
  const normalized = normalizeLessonAnswer(input.answer);
  if (input.kind === "self_writing" && normalized.split(/\s+/).filter(Boolean).length < 2) {
    return { status: "invalid", correct: false, reason: "minimum_two_words" };
  }
  if (input.kind === "open" || input.kind === "self_writing") {
    if (input.aiAvailable === false) return { status: "manual_review", correct: null };
  }
  const correct = input.acceptedAnswers.some((answer) => normalizeLessonAnswer(answer) === normalized);
  return { status: correct ? "correct" : "incorrect", correct };
}

export function validateGeneratedFeedback(input: { answer: string; feedback: string; citedError: string | null }) {
  if (!input.feedback.trim()) return false;
  if (input.citedError === null) return true;
  const cited = normalizeLessonAnswer(input.citedError);
  return Boolean(cited) && normalizeLessonAnswer(input.answer).includes(cited);
}

function normalizeLessonAnswer(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
