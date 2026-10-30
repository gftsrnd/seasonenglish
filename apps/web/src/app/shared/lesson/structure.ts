export type SharedLessonTab = "study" | "practice";

export type SharedLessonPart = {
  code: string;
  content: Record<string, unknown>;
};

export const lessonStudyCodes = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"] as const;
export const lessonPracticeCodes = ["listening", "reading", "writing", "word_class", "word_use", "speaking"] as const;

const studyOrder = new Map<string, number>(lessonStudyCodes.map((code, index) => [code, index]));
const practiceOrder = new Map<string, number>(lessonPracticeCodes.map((code, index) => [code, index]));

export function isLessonPracticePart(code: string): boolean {
  return practiceOrder.has(code);
}

export function isSharedLessonPartVisible(part: SharedLessonPart): boolean {
  return !(part.code === "grammar" && part.content.hidden === true && part.content.status === "unavailable");
}

/** One visibility and ordering policy for Learner and Operator preview. */
export function lessonPartsForTab<T extends SharedLessonPart>(parts: readonly T[], tab: SharedLessonTab): T[] {
  return parts
    .filter(isSharedLessonPartVisible)
    .filter((part) => tab === "study" ? studyOrder.has(part.code) : part.code === "instruction" || practiceOrder.has(part.code))
    .sort((left, right) => {
      const order = tab === "study" ? studyOrder : practiceOrder;
      const leftIndex = tab === "practice" && left.code === "instruction" ? -1 : (order.get(left.code) ?? Number.MAX_SAFE_INTEGER);
      const rightIndex = tab === "practice" && right.code === "instruction" ? -1 : (order.get(right.code) ?? Number.MAX_SAFE_INTEGER);
      return leftIndex - rightIndex;
    });
}

export function sharedLessonGrammarAvailable(parts: readonly SharedLessonPart[]): boolean {
  const grammar = parts.find((part) => part.code === "grammar");
  return Boolean(grammar
    && isSharedLessonPartVisible(grammar)
    && typeof grammar.content.formula === "string"
    && grammar.content.formula.trim());
}
