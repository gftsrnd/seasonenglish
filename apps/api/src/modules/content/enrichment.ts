import type { ContentLessonDraftInput } from "@e4s/contracts";

export type LessonRepairMode = "enrich" | "fill-phrases";

const PART_ORDER = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;

type JsonRecord = Record<string, unknown>;

export function lessonDaysNeedingRepair(
  lessons: readonly ContentLessonDraftInput[],
  mode: LessonRepairMode
): number[] {
  const byDay = new Map(lessons.map((lesson) => [lesson.dayNumber, lesson]));
  return [1, 2, 3, 4, 5].filter((dayNumber) => {
    const lesson = byDay.get(dayNumber);
    if (!lesson) return true;
    const parts = new Map(lesson.parts.map((part) => [part.code, part]));
    const vocabulary = asRecord(parts.get("vocabulary")?.content);
    const items = asArray(vocabulary.items).map(asRecord);
    if (mode === "fill-phrases") {
      return items.some((item) => stringArray(item.collocations ?? item.phrases ?? item.examples).length < 3);
    }
    const optionsAreIncomplete = (code: "listening" | "reading") => asArray(asRecord(parts.get(code)?.content).options).length < 4;
    const missingExercise = !parts.has("word_class") || !parts.has("word_use") || optionsAreIncomplete("listening") || optionsAreIncomplete("reading");
    const missingWordStructure = items.some((item) => !meaningful(item.family) || !meaningful(item.umbrella));
    const missingRelations = items.length > 0 && !items.some((item) => meaningful(item.synonyms));
    return missingExercise || missingWordStructure || missingRelations;
  });
}

export function mergeGeneratedLessons(
  existing: readonly ContentLessonDraftInput[],
  generated: readonly ContentLessonDraftInput[],
  mode: LessonRepairMode
): ContentLessonDraftInput[] {
  const existingByDay = new Map(existing.map((lesson) => [lesson.dayNumber, lesson]));
  const generatedByDay = new Map(generated.map((lesson) => [lesson.dayNumber, lesson]));
  const days = [...new Set([...existingByDay.keys(), ...generatedByDay.keys()])].sort((left, right) => left - right);
  return days.map((dayNumber) => {
    const generatedLesson = generatedByDay.get(dayNumber);
    return generatedLesson ? mergeGeneratedLesson(existingByDay.get(dayNumber), generatedLesson, mode) : existingByDay.get(dayNumber)!;
  });
}

export function mergeGeneratedLesson(
  existing: ContentLessonDraftInput | undefined,
  generated: ContentLessonDraftInput,
  mode: LessonRepairMode
): ContentLessonDraftInput {
  if (!existing) return generated;
  const existingParts = new Map(existing.parts.map((part) => [part.code, part]));
  const parts = generated.parts.map((part) => {
    const previous = existingParts.get(part.code);
    if (!previous) return part;
    return {
      ...part,
      title: meaningful(previous.title) ? previous.title : part.title,
      content: mode === "fill-phrases"
        ? mergePhraseContent(previous.content, part.content)
        : mergeLessonContent(previous.content, part.content)
    };
  });
  const knownCodes = new Set(parts.map((part) => part.code));
  parts.push(...existing.parts.filter((part) => !knownCodes.has(part.code)));
  parts.sort((left, right) => PART_ORDER.indexOf(left.code as typeof PART_ORDER[number]) - PART_ORDER.indexOf(right.code as typeof PART_ORDER[number]));
  return {
    ...generated,
    title: meaningful(existing.title) ? existing.title : generated.title,
    durationMinutes: meaningful(existing.durationMinutes) ? existing.durationMinutes : generated.durationMinutes,
    parts
  };
}

function mergeLessonContent(previousValue: Record<string, unknown>, generatedValue: Record<string, unknown>): JsonRecord {
  const previous = asRecord(previousValue);
  const generated = asRecord(generatedValue);
  const merged: JsonRecord = { ...generated, ...previous };
  for (const [key, value] of Object.entries(generated)) {
    if (!meaningful(previous[key])) merged[key] = value;
  }
  if (Array.isArray(previous.options) && previous.options.length < 4 && Array.isArray(generated.options) && generated.options.length >= 4) {
    merged.options = generated.options;
    if (meaningful(generated.answer)) merged.answer = generated.answer;
  }
  if (previous.items !== undefined || generated.items !== undefined) merged.items = mergeVocabularyItems(previous.items, generated.items);
  return merged;
}

function mergePhraseContent(previousValue: Record<string, unknown>, generatedValue: Record<string, unknown>): JsonRecord {
  const merged = mergeLessonContent(previousValue, generatedValue);
  if (Array.isArray(previousValue.items) || Array.isArray(generatedValue.items)) {
    const generatedItems = asArray(generatedValue.items);
    const previousItems = asArray(previousValue.items);
    const byWord = new Map(previousItems.map((item) => [wordKey(item), item]));
    merged.items = generatedItems.map((item) => {
      const previous = byWord.get(wordKey(item));
      if (!previous) return item;
      const current = asRecord(previous);
      const next = asRecord(item);
      const priorPhrases = stringArray(current.collocations ?? current.phrases ?? current.examples);
      const generatedPhrases = stringArray(next.collocations ?? next.phrases ?? next.examples);
      return { ...next, ...current, collocations: priorPhrases.length >= 3 ? priorPhrases.slice(0, 3) : uniqueStrings([...priorPhrases, ...generatedPhrases]).slice(0, 3) };
    });
  }
  return merged;
}

function mergeVocabularyItems(previousValue: unknown, generatedValue: unknown): unknown[] {
  const generatedItems = asArray(generatedValue);
  const previousItems = asArray(previousValue);
  const byWord = new Map(previousItems.map((item) => [wordKey(item), item]));
  return generatedItems.map((item) => {
    const previous = byWord.get(wordKey(item));
    if (!previous) return item;
    const current = asRecord(previous);
    const generated = asRecord(item);
    const merged: JsonRecord = { ...generated, ...current };
    for (const key of ["word", "type", "pronunciation", "meaning", "imageQuery", "umbrella"] as const) {
      if (!meaningful(current[key])) merged[key] = generated[key];
    }
    for (const key of ["collocations", "family", "synonyms", "antonyms"] as const) {
      const oldList = Array.isArray(current[key]) ? current[key] : [];
      merged[key] = oldList.length ? oldList : generated[key] ?? [];
    }
    const oldPhrases = stringArray(current.collocations ?? current.phrases ?? current.examples);
    const newPhrases = stringArray(generated.collocations ?? generated.phrases ?? generated.examples);
    merged.collocations = oldPhrases.length >= 3 ? oldPhrases.slice(0, 3) : uniqueStrings([...oldPhrases, ...newPhrases]).slice(0, 3);
    return merged;
  });
}

function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function wordKey(value: unknown): string { const word = asRecord(value).word; return typeof word === "string" ? word.trim().toLocaleLowerCase() : ""; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : typeof value === "string" && value.trim() ? [value.trim()] : []; }
function uniqueStrings(values: string[]): string[] { return [...new Set(values)]; }
function meaningful(value: unknown): boolean { return Array.isArray(value) ? value.length > 0 : typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined; }
