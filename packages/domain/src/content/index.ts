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
  ["word_class", "Từ loại"],
  ["word_use", "Dùng từ"],
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
  code: LessonPartCode | "title" | "order" | "weekly_practice";
  message: string;
}

export interface WeeklyPracticePublicationInput {
  readonly task: string;
  readonly guidance: string;
  readonly requiredVocabulary: readonly string[];
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

/**
 * Validates the learner-facing payload. Drafts may remain incomplete while an
 * operator is editing; review/publication must never expose an unusable lesson.
 */
export function validateLessonPublication(
  lessons: readonly ContentLessonDraft[],
  weeklyPractice?: WeeklyPracticePublicationInput
): { valid: boolean; issues: ContentValidationIssue[] } {
  const issues = [...validateLessonDraft(lessons).issues];
  const add = (lesson: ContentLessonDraft, code: ContentValidationIssue["code"], message: string) => {
    if (!issues.some((issue) => issue.dayNumber === lesson.dayNumber && issue.code === code && issue.message === message)) {
      issues.push({ dayNumber: lesson.dayNumber, code, message });
    }
  };

  for (const lesson of lessons) {
    const parts = new Map(lesson.parts.map((part) => [part.code, asRecord(part.content)]));
    const objective = parts.get("objective");
    if (objective && !hasText(objective.text) && !nonEmptyArray(objective.items)) add(lesson, "objective", "Mục tiêu bài học chưa có nội dung.");

    const instruction = parts.get("instruction");
    if (instruction && !hasText(instruction.text) && !nonEmptyArray(instruction.steps) && !hasNumberedSteps(instruction)) add(lesson, "instruction", "Hướng dẫn học chưa có bước thực hiện.");

    const vocabulary = parts.get("vocabulary");
    if (vocabulary) {
      const items = Array.isArray(vocabulary.items) ? vocabulary.items : [];
      const usable = items.filter((item) => typeof item === "string" ? Boolean(item.trim()) : hasText(asRecord(item).word ?? asRecord(item).e));
      if (usable.length < 3) add(lesson, "vocabulary", "Từ vựng cần đủ ít nhất 3 từ có nội dung.");
    }

    const grammar = parts.get("grammar");
    if (grammar && !grammarIsUnavailable(grammar) && !hasText(grammar.formula) && !hasText(grammar.text)) add(lesson, "grammar", "Ngữ pháp chưa có công thức hoặc mẫu câu; nếu bài không có ngữ pháp phù hợp, hãy chọn “không có nội dung ngữ pháp phù hợp”.");

    const pronunciation = parts.get("pronunciation");
    if (pronunciation) {
      if (!hasText(pronunciation.focus)) add(lesson, "pronunciation", "Phát âm chưa có âm mục tiêu.");
      if (textArray(pronunciation.words).length < 3) add(lesson, "pronunciation", "Phát âm cần đủ 3 từ luyện.");
    }

    validateChoicePart(lesson, "listening", parts.get("listening"), add, true);
    validateChoicePart(lesson, "reading", parts.get("reading"), add, false);
    validateChoicePart(lesson, "word_class", parts.get("word_class"), add, false, true);
    validateChoicePart(lesson, "word_use", parts.get("word_use"), add, false, true);

    const writing = parts.get("writing");
    if (writing) {
      if (!hasText(writing.prompt ?? writing.question)) add(lesson, "writing", "Bài tập Viết chưa có đề bài.");
      if (!hasText(writing.answer ?? writing.modelAnswer)) add(lesson, "writing", "Bài tập Viết chưa có đáp án hoặc câu mẫu.");
      const kind = text(writing.type).toLowerCase();
      if ((kind === "mcq" || kind === "choice") && !validChoice(writing)) add(lesson, "writing", "Bài tập Viết trắc nghiệm cần 4 lựa chọn khác nhau và đáp án trùng nguyên văn một lựa chọn.");
    }

    const speaking = parts.get("speaking");
    if (speaking) {
      if (!hasText(speaking.prompt ?? speaking.instruction)) add(lesson, "speaking", "Phần Nói chưa có yêu cầu cho học viên.");
      if (!hasText(speaking.sample ?? speaking.modelAnswer ?? speaking.answer)) add(lesson, "speaking", "Phần Nói chưa có câu mẫu để học và chấm.");
    }
  }

  if (weeklyPractice) {
    const dayNumber = 6;
    if (!weeklyPractice.task.trim()) issues.push({ dayNumber, code: "weekly_practice", message: "Bài cuối tuần chưa có đề bài." });
    if (!weeklyPractice.guidance.trim()) issues.push({ dayNumber, code: "weekly_practice", message: "Bài cuối tuần chưa có hướng dẫn." });
    if (!weeklyPractice.requiredVocabulary.some((item) => item.trim())) issues.push({ dayNumber, code: "weekly_practice", message: "Bài cuối tuần chưa có từ bắt buộc." });
  }
  return { valid: issues.length === 0, issues };
}

export function submitContentForReview(input: {
  status: "draft" | "review" | "published" | "retired";
  lessons: readonly ContentLessonDraft[];
  weeklyPractice?: WeeklyPracticePublicationInput;
}): { status: "review" } {
  if (input.status !== "draft") throw new Error("CONTENT_NOT_DRAFT");
  const days = [...new Set(input.lessons.map((lesson) => lesson.dayNumber))].sort((a, b) => a - b);
  if (days.length !== 5 || days.some((day, index) => day !== index + 1)) {
    throw new Error("CONTENT_LESSON_SET_INCOMPLETE");
  }
  const validation = validateLessonPublication(input.lessons, input.weeklyPractice);
  if (!validation.valid) throw new Error("CONTENT_VALIDATION_FAILED");
  return { status: "review" };
}

function validateChoicePart(
  lesson: ContentLessonDraft,
  code: "listening" | "reading" | "word_class" | "word_use",
  content: Record<string, unknown> | undefined,
  add: (lesson: ContentLessonDraft, code: ContentValidationIssue["code"], message: string) => void,
  requireAudio: boolean,
  bodyOptional = false
) {
  if (!content) return;
  if (requireAudio && !hasPlayableListeningSource(content)) add(lesson, code, "Phần Nghe chưa có nguồn âm thanh hoặc kịch bản để máy đọc.");
  if (!requireAudio && !bodyOptional && !hasText(content.text ?? content.passage ?? content.script)) add(lesson, code, "Nội dung đọc đang để trống.");
  if (!hasText(content.prompt ?? content.question)) add(lesson, code, `${labelFor(code)} chưa có câu hỏi.`);
  if (!validChoice(content)) add(lesson, code, `${labelFor(code)} cần 4 lựa chọn khác nhau và đáp án trùng nguyên văn một lựa chọn.`);
}

function validChoice(content: Record<string, unknown>): boolean {
  const options = textArray(content.options);
  if (options.length !== 4 || new Set(options.map(normalizeComparable)).size !== 4) return false;
  const answer = normalizeComparable(text(content.answer));
  return Boolean(answer) && options.some((option) => normalizeComparable(option) === answer);
}

function hasPlayableListeningSource(content: Record<string, unknown>): boolean {
  if (hasText(content.audioUrl) || hasText(content.script) || hasText(content.text)) return true;
  if (typeof content.audio === "string") return Boolean(content.audio.trim());
  const audio = asRecord(content.audio);
  const source = asRecord(content.source);
  return hasText(audio.src ?? audio.url ?? audio.text ?? audio.script)
    || hasText(source.src ?? source.url ?? source.text ?? source.script);
}

function hasNumberedSteps(content: Record<string, unknown>): boolean {
  return ["step1", "step2", "step3"].some((key) => hasText(content[key]));
}

function grammarIsUnavailable(content: Record<string, unknown>): boolean {
  return content.hidden === true
    && (text(content.status) === "unavailable" || ["no_suitable_content", "insufficient_evidence"].includes(text(content.reason)));
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === "string" ? Boolean(item.trim()) : Boolean(item && typeof item === "object"));
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    const record = asRecord(item);
    const value = text(record.word ?? record.text);
    return value ? [value] : [];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function hasText(value: unknown): boolean { return Boolean(text(value)); }
function normalizeComparable(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim(); }
function labelFor(code: "listening" | "reading" | "word_class" | "word_use"): string {
  return ({ listening: "Phần Nghe", reading: "Phần Đọc", word_class: "Bài tập Từ loại", word_use: "Bài tập Dùng từ" })[code];
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
