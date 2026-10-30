import type { ContentGenerationFindingView, ContentLessonDraftInput, LessonPartCode } from "@e4s/contracts";
import { lexicalRelationCoverageSatisfied } from "./lexical-relations.js";
import { validateLessonDraft, validateLessonPublication, type ContentValidationIssue } from "./index.js";

export interface GeneratedLessonQualityIssue {
  readonly kind: "blocking" | "light";
  readonly dayNumber: number;
  readonly code: ContentValidationIssue["code"] | LessonPartCode | "lesson_set" | "vocabulary";
  readonly message: string;
}

export interface GeneratedLessonQuality {
  readonly ready: boolean;
  readonly blockingIssues: readonly GeneratedLessonQualityIssue[];
  readonly lightIssues: readonly GeneratedLessonQualityIssue[];
}

/**
 * The sole operator-readiness policy for one CEFR level.
 * Only a single absent lexical relation or extended-vocabulary field is light.
 * Everything that can make a lesson unusable remains blocking.
 */
export function evaluateGeneratedLessonQuality(input: {
  readonly cefr: string;
  readonly lessons: readonly ContentLessonDraftInput[];
  readonly findings?: readonly ContentGenerationFindingView[];
}): GeneratedLessonQuality {
  const blockingIssues: GeneratedLessonQualityIssue[] = [];
  const lightIssues: GeneratedLessonQualityIssue[] = [];
  const addBlocking = (issue: ContentValidationIssue) => {
    if (!blockingIssues.some((entry) => entry.dayNumber === issue.dayNumber && entry.code === issue.code && entry.message === issue.message)) {
      blockingIssues.push({ kind: "blocking", ...issue });
    }
  };

  const uniqueDays = new Set(input.lessons.map((lesson) => lesson.dayNumber));
  if (uniqueDays.size !== 5 || [1, 2, 3, 4, 5].some((dayNumber) => !uniqueDays.has(dayNumber))) {
    blockingIssues.push({ kind: "blocking", dayNumber: 0, code: "lesson_set", message: "Bộ bài phải có đủ 5 bài T2–T6 trước khi giao cho Operator." });
  }
  for (const issue of validateLessonDraft(input.lessons).issues) addBlocking(issue);
  for (const issue of validateLessonPublication(input.lessons, undefined, input.cefr).issues) addBlocking(issue);

  const vocabularyOwnerByWord = new Map<string, number>();
  for (const lesson of input.lessons) {
    const parts = new Map(lesson.parts.map((part) => [part.code, part.content]));
    const grammar = recordOf(parts.get("grammar"));
    if (grammar?.status === "unavailable" || grammar?.hidden === true) {
      addBlocking({ dayNumber: lesson.dayNumber, code: "grammar", message: "Ngữ pháp chưa có nội dung dùng được." });
    }
    const vocabulary = recordOf(parts.get("vocabulary"));
    const items = Array.isArray(vocabulary?.items) ? vocabulary.items.map(recordOf).filter((item): item is Record<string, unknown> => Boolean(item?.word && text(item.word))) : [];
    for (const item of items) {
      const word = text(item.word) || "Từ vựng";
      const vocabularyKey = normalizeVocabularyKey(word);
      const priorDay = vocabularyOwnerByWord.get(vocabularyKey);
      if (priorDay !== undefined && priorDay !== lesson.dayNumber) {
        addBlocking({
          dayNumber: lesson.dayNumber,
          code: "vocabulary",
          message: `${word} đã được dạy ở T${priorDay}; từ trọng tâm chỉ được dạy mới một lần trong cùng level.`
        });
      } else if (vocabularyKey) {
        vocabularyOwnerByWord.set(vocabularyKey, lesson.dayNumber);
      }
      if (!present(item.family)) lightIssues.push({ kind: "light", dayNumber: lesson.dayNumber, code: "vocabulary", message: `${word}: thiếu word family.` });
      if (!present(item.umbrella)) lightIssues.push({ kind: "light", dayNumber: lesson.dayNumber, code: "vocabulary", message: `${word}: thiếu từ bao trùm.` });
      if (!lexicalRelationCoverageSatisfied(item, input.cefr)) {
        lightIssues.push({ kind: "light", dayNumber: lesson.dayNumber, code: "vocabulary", message: `${word}: thiếu một quan hệ đồng nghĩa hoặc trái nghĩa.` });
      }
    }
  }

  for (const finding of input.findings ?? []) {
    if (finding.severity !== "warning" || finding.code === "VOCABULARY_LEXICAL_COVERAGE_LOW") continue;
    blockingIssues.push({
      kind: "blocking",
      dayNumber: finding.dayNumber ?? 0,
      code: "generation",
      message: finding.message
    });
  }
  for (const finding of input.findings ?? []) {
    if (finding.severity !== "error") continue;
    blockingIssues.push({
      kind: "blocking",
      dayNumber: finding.dayNumber ?? 0,
      code: "generation",
      message: finding.message
    });
  }

  return { ready: blockingIssues.length === 0 && lightIssues.length <= 2, blockingIssues, lightIssues };
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeVocabularyKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function present(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return Boolean(value.trim()) && value.trim() !== "—";
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((entry) => present(entry));
}
