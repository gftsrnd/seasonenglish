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

export type LevelVocabularyTermKind = "primary" | "family" | "synonym" | "antonym" | "sibling" | "lexical_detail";

export interface LevelVocabularyRegistryEntry {
  readonly dayNumber: number;
  readonly word: string;
  readonly key: string;
  readonly kind: LevelVocabularyTermKind;
  readonly groupKey: string;
}

export interface LevelVocabularyRegistry {
  readonly entries: readonly LevelVocabularyRegistryEntry[];
  readonly duplicateEntries: ReadonlyArray<{ entry: LevelVocabularyRegistryEntry; prior: LevelVocabularyRegistryEntry }>;
}

/**
 * Records every learner-facing lexical term, not prose inside an exercise or
 * an umbrella category label. Umbrellas group cards; they are not cards.
 * A same-day primary/sibling reference inside one umbrella group is a group
 * membership link, not a second lexical introduction.
 */
export function buildLevelVocabularyRegistry(lessons: readonly ContentLessonDraftInput[]): LevelVocabularyRegistry {
  const entries: LevelVocabularyRegistryEntry[] = [];
  const duplicateEntries: Array<{ entry: LevelVocabularyRegistryEntry; prior: LevelVocabularyRegistryEntry }> = [];
  const ownerByKey = new Map<string, LevelVocabularyRegistryEntry>();
  const add = (dayNumber: number, word: unknown, kind: LevelVocabularyTermKind, groupKey: string) => {
    const value = text(word);
    const key = normalizeVocabularyKey(value);
    if (!key) return;
    const entry = { dayNumber, word: value, key, kind, groupKey } as const;
    const prior = ownerByKey.get(key);
    if (!prior) {
      ownerByKey.set(key, entry);
      entries.push(entry);
      return;
    }
    if (sameUmbrellaMembership(prior, entry)) return;
    duplicateEntries.push({ entry, prior });
  };

  for (const lesson of [...lessons].sort((left, right) => left.dayNumber - right.dayNumber)) {
    const vocabulary = recordOf(lesson.parts.find((part) => part.code === "vocabulary")?.content);
    const items = Array.isArray(vocabulary?.items) ? vocabulary.items.map(recordOf).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
    for (const item of items) {
      const umbrella = recordOf(item.umbrella);
      const groupKey = normalizeVocabularyKey(text(umbrella?.word));
      add(lesson.dayNumber, item.word, "primary", groupKey);
      for (const family of arrayRecords(item.family)) add(lesson.dayNumber, family.word, "family", groupKey);
      const relationKeys = new Set<string>();
      for (const synonym of arrayRecords(item.synonyms)) {
        add(lesson.dayNumber, synonym.word, "synonym", groupKey);
        relationKeys.add(normalizeVocabularyKey(text(synonym.word)));
      }
      for (const antonym of arrayRecords(item.antonyms)) {
        add(lesson.dayNumber, antonym.word, "antonym", groupKey);
        relationKeys.add(normalizeVocabularyKey(text(antonym.word)));
      }
      for (const sibling of arrayRecords(umbrella?.siblings)) add(lesson.dayNumber, sibling.word, "sibling", groupKey);
      for (const detail of arrayRecords(item.lexicalDetails)) {
        if (!relationKeys.has(normalizeVocabularyKey(text(detail.word)))) add(lesson.dayNumber, detail.word, "lexical_detail", groupKey);
      }
    }
  }
  return { entries, duplicateEntries };
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
      if (!present(item.family)) lightIssues.push({ kind: "light", dayNumber: lesson.dayNumber, code: "vocabulary", message: `${word}: thiếu word family.` });
      if (!present(item.umbrella)) lightIssues.push({ kind: "light", dayNumber: lesson.dayNumber, code: "vocabulary", message: `${word}: thiếu từ bao trùm.` });
      if (!lexicalRelationCoverageSatisfied(item, input.cefr)) {
        lightIssues.push({ kind: "light", dayNumber: lesson.dayNumber, code: "vocabulary", message: `${word}: thiếu một quan hệ đồng nghĩa hoặc trái nghĩa.` });
      }
    }
  }
  for (const { entry, prior } of buildLevelVocabularyRegistry(input.lessons).duplicateEntries) {
    const primaryRepeat = entry.kind === "primary" && prior.kind === "primary";
    addBlocking({
      dayNumber: entry.dayNumber,
      code: "vocabulary",
      message: primaryRepeat
        ? `${entry.word} đã được dạy ở T${prior.dayNumber}; từ trọng tâm chỉ được dạy mới một lần trong cùng level.`
        : `${entry.word} đã được giới thiệu là ${vocabularyTermLabel(prior.kind)} ở T${prior.dayNumber}; không được lặp lại như ${vocabularyTermLabel(entry.kind)}.`
    });
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

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordOf).filter((entry): entry is Record<string, unknown> => Boolean(entry)) : [];
}

function sameUmbrellaMembership(left: LevelVocabularyRegistryEntry, right: LevelVocabularyRegistryEntry): boolean {
  if (left.dayNumber !== right.dayNumber || !left.groupKey || left.groupKey !== right.groupKey) return false;
  return (left.kind === "primary" || left.kind === "sibling") && (right.kind === "primary" || right.kind === "sibling");
}

function vocabularyTermLabel(kind: LevelVocabularyTermKind): string {
  return ({
    primary: "từ trọng tâm",
    family: "word family",
    synonym: "từ đồng nghĩa",
    antonym: "từ trái nghĩa",
    sibling: "từ cùng nhóm",
    lexical_detail: "từ mở rộng"
  } as const)[kind];
}

function present(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return Boolean(value.trim()) && value.trim() !== "—";
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((entry) => present(entry));
}
