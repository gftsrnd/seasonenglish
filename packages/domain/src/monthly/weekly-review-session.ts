import type {
  CefrLevel, LessonPart, WeeklyReviewItem, WeeklyReviewItemVariant, WeeklyReviewSectionCode, WeeklyReviewWarmupCard
} from "@e4s/contracts";

/**
 * Review-until-correct session state for the Friday weekly review.
 *
 * Persisted per learner and review lesson. It deliberately stores no attempt
 * count and no score: a section is complete once every item has been answered
 * correctly once. A wrong item goes to the end of its section's queue and
 * comes back with its next alternative-context variant (or the same item when
 * the content has no variants).
 */

/** Canonical section order: recognition → word use → form → grammar → reading → produce. */
export const WEEKLY_REVIEW_SECTION_ORDER: readonly WeeklyReviewSectionCode[] = [
  "listening", "word_use", "word_class", "grammar", "reading", "writing", "speaking"
];

export const WEEKLY_REVIEW_SECTION_TITLES: Record<WeeklyReviewSectionCode, string> = {
  listening: "Nghe & nhận biết từ",
  word_use: "Word use",
  word_class: "Word form",
  grammar: "Ngữ pháp",
  reading: "Nghe – Đọc hiểu",
  writing: "Viết",
  speaking: "Phát âm & Nói – Viết"
};

export interface WeeklyReviewSectionDefinition {
  code: WeeklyReviewSectionCode;
  items: WeeklyReviewItem[];
}

export interface WeeklyReviewQueueEntry {
  itemId: string;
  /** 0 = the item itself; n = items.variants[n - 1]. A presentation pointer, not an attempt count. */
  variant: number;
  retry: boolean;
}

export interface WeeklyReviewSectionState {
  code: WeeklyReviewSectionCode;
  queue: WeeklyReviewQueueEntry[];
  correctItemIds: string[];
  /** Latest answer per item, kept so a resumed session loses nothing. */
  answers: Record<string, string>;
}

export interface WeeklyReviewSessionState {
  version: 1;
  warmup: "pending" | "skipped" | "done";
  sections: WeeklyReviewSectionState[];
  completedAt: string | null;
}

/** Builds review sections from the published lesson parts. */
export function weeklyReviewSectionsFromParts(parts: readonly LessonPart[]): WeeklyReviewSectionDefinition[] {
  return WEEKLY_REVIEW_SECTION_ORDER.flatMap((code) => {
    const part = parts.find((candidate) => candidate.code === code);
    if (!part) return [];
    const items = reviewItemsFromContent(code, part.content);
    return items.length ? [{ code, items }] : [];
  });
}

/** Flip cards for the optional, ungraded part 0. */
export function weeklyReviewWarmupCards(parts: readonly LessonPart[]): WeeklyReviewWarmupCard[] {
  const vocabulary = parts.find((part) => part.code === "vocabulary")?.content;
  const items = Array.isArray(vocabulary?.items) ? vocabulary.items : [];
  return items.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.word !== "string" || !item.word.trim()) return [];
    return [{
      word: item.word,
      ...(typeof item.meaning === "string" ? { meaning: item.meaning } : {}),
      ...(typeof item.pronunciation === "string" ? { pronunciation: item.pronunciation } : {}),
      ...(typeof item.imageUrl === "string" ? { imageUrl: item.imageUrl } : {}),
      ...(typeof item.audioUrl === "string" ? { audioUrl: item.audioUrl } : {})
    }];
  });
}

/**
 * Starts a session, or resumes a stored one against the current content.
 * Correct answers survive; items that disappeared from the content are dropped
 * and new items are queued.
 */
export function resumeWeeklyReviewSession(stored: unknown, sections: readonly WeeklyReviewSectionDefinition[]): WeeklyReviewSessionState {
  const previous = isSessionState(stored) ? stored : null;
  const nextSections = sections.map((section): WeeklyReviewSectionState => {
    const prior = previous?.sections.find((candidate) => candidate.code === section.code);
    const itemIds = new Set(section.items.map((item) => item.id));
    const correctItemIds = (prior?.correctItemIds ?? []).filter((id) => itemIds.has(id));
    const queued = (prior?.queue ?? []).filter((entry) => itemIds.has(entry.itemId) && !correctItemIds.includes(entry.itemId));
    const missing = section.items
      .filter((item) => !correctItemIds.includes(item.id) && !queued.some((entry) => entry.itemId === item.id))
      .map((item): WeeklyReviewQueueEntry => ({ itemId: item.id, variant: 0, retry: false }));
    const answers = Object.fromEntries(Object.entries(prior?.answers ?? {}).filter(([id]) => itemIds.has(id)));
    return { code: section.code, queue: [...queued, ...missing], correctItemIds, answers };
  });
  const allDone = nextSections.every((section) => section.queue.length === 0);
  return {
    version: 1,
    warmup: previous?.warmup ?? "pending",
    sections: nextSections,
    completedAt: allDone ? previous?.completedAt ?? null : null
  };
}

/** The first unfinished section; learners resume here. */
export function currentWeeklyReviewSection(state: WeeklyReviewSessionState): WeeklyReviewSectionState | null {
  return state.sections.find((section) => section.queue.length > 0) ?? null;
}

export function isWeeklyReviewComplete(state: WeeklyReviewSessionState): boolean {
  return state.sections.length > 0 && state.sections.every((section) => section.queue.length === 0);
}

/** The warm-up is optional: skipping or finishing it never affects completion. */
export function setWeeklyReviewWarmup(state: WeeklyReviewSessionState, status: "skipped" | "done"): WeeklyReviewSessionState {
  return { ...state, warmup: status };
}

export function variantFor(item: WeeklyReviewItem, variant: number): WeeklyReviewItemVariant {
  if (variant <= 0) return item;
  return item.variants?.[variant - 1] ?? item;
}

export type WeeklyReviewAnswerOutcome =
  | { ok: true; correct: boolean; feedback: string; willRetry: boolean; state: WeeklyReviewSessionState; translation?: { question: string; answer: string } }
  | { ok: false; code: "REVIEW_SECTION_NOT_CURRENT" | "REVIEW_ITEM_NOT_CURRENT" | "REVIEW_ALREADY_COMPLETE" | "REVIEW_ITEM_NOT_FOUND" };

/**
 * Applies one answer to the item at the head of the current section's queue.
 * Correct: the item is done. Wrong: the explanation is returned and the item
 * moves to the end of the section with its next variant. No attempt limit.
 */
export function answerWeeklyReviewItem(input: {
  state: WeeklyReviewSessionState;
  sections: readonly WeeklyReviewSectionDefinition[];
  sectionCode: WeeklyReviewSectionCode;
  itemId: string;
  answer?: string;
  artifactKey?: string;
  cefr?: CefrLevel | null;
  now?: Date;
}): WeeklyReviewAnswerOutcome {
  const current = currentWeeklyReviewSection(input.state);
  if (!current) return { ok: false, code: "REVIEW_ALREADY_COMPLETE" };
  if (current.code !== input.sectionCode) return { ok: false, code: "REVIEW_SECTION_NOT_CURRENT" };
  const head = current.queue[0]!;
  if (head.itemId !== input.itemId) return { ok: false, code: "REVIEW_ITEM_NOT_CURRENT" };
  const item = input.sections.find((section) => section.code === current.code)?.items.find((candidate) => candidate.id === head.itemId);
  if (!item) return { ok: false, code: "REVIEW_ITEM_NOT_FOUND" };
  const variant = variantFor(item, head.variant);
  const correct = gradeWeeklyReviewAnswer(variant, { ...(input.answer === undefined ? {} : { answer: input.answer }), ...(input.artifactKey === undefined ? {} : { artifactKey: input.artifactKey }) });
  const rest = current.queue.slice(1);
  const variantCount = item.variants?.length ?? 0;
  const nextSection: WeeklyReviewSectionState = {
    ...current,
    answers: { ...current.answers, [item.id]: input.answer ?? input.artifactKey ?? "" },
    correctItemIds: correct ? [...current.correctItemIds, item.id] : current.correctItemIds,
    queue: correct ? rest : [...rest, { itemId: item.id, variant: variantCount ? (head.variant % variantCount) + 1 : 0, retry: true }]
  };
  const sections = input.state.sections.map((section) => section.code === current.code ? nextSection : section);
  const draft: WeeklyReviewSessionState = { ...input.state, sections };
  const state = isWeeklyReviewComplete(draft) ? { ...draft, completedAt: draft.completedAt ?? (input.now ?? new Date()).toISOString() } : draft;
  const english = input.cefr ? !["A1", "A2"].includes(input.cefr) : false;
  const feedback = correct
    ? (english ? "Correct." : "Đúng rồi.")
    : variant.explanation?.trim() || (english ? "Not quite. Read the explanation and try this point again at the end of the section." : "Chưa đúng. Câu này sẽ quay lại ở cuối phần để bạn làm lại.");
  // A finished (correct) item reveals its Vietnamese question/answer translation; a wrong one never does.
  // B1+ learners see none (13/11), even when older content still carries one.
  const translation = correct && !english && variant.questionTranslation && variant.answerTranslation ? { question: variant.questionTranslation, answer: variant.answerTranslation } : undefined;
  return { ok: true, correct, feedback, willRetry: !correct, state, ...(translation ? { translation } : {}) };
}

/** Deterministic grading. Free responses pass when valid English that uses enough weekly words. */
export function gradeWeeklyReviewAnswer(variant: WeeklyReviewItemVariant, input: { answer?: string; artifactKey?: string }): boolean {
  const answer = input.answer?.trim() ?? "";
  const expected = variant.answer === undefined ? [] : Array.isArray(variant.answer) ? variant.answer : [variant.answer];
  if (expected.length) return expected.some((candidate) => normalizeAnswer(candidate) === normalizeAnswer(answer));
  if (variant.acceptsAudio && input.artifactKey) return true;
  if (!answer || looksVietnamese(answer)) return false;
  const words = answer.toLocaleLowerCase("en").match(/[a-z]+(?:['’-][a-z]+)*/gu) ?? [];
  if (words.length < 2) return false;
  const required = (variant.requiredWords ?? []).map((word) => word.toLocaleLowerCase("en"));
  if (!required.length) return true;
  const minimum = Math.min(required.length, Math.max(1, variant.minRequiredWords ?? 2));
  const text = ` ${words.join(" ")} `;
  return required.filter((word) => text.includes(` ${word}`)).length >= minimum;
}

/** Vietnamese diacritics (or đ) mean the response is not English. */
function looksVietnamese(value: string): boolean {
  return /[Đđ]/u.test(value) || /[̀-ͯ]/u.test(value.normalize("NFD"));
}

function normalizeAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[.!?]+$/gu, "").replace(/\s+/gu, " ").trim();
}

function reviewItemsFromContent(code: WeeklyReviewSectionCode, content: Record<string, unknown>): WeeklyReviewItem[] {
  if (Array.isArray(content.items)) {
    return content.items.flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const item = toVariant(raw as Record<string, unknown>, `${code}-${index + 1}`, code);
      if (!item) return [];
      const rawVariants = (raw as Record<string, unknown>).variants;
      const variants = Array.isArray(rawVariants)
        ? rawVariants.flatMap((variant, variantIndex) => {
          if (!variant || typeof variant !== "object") return [];
          const parsed = toVariant(variant as Record<string, unknown>, `${item.id}-v${variantIndex + 1}`, code);
          return parsed ? [parsed] : [];
        })
        : [];
      return [{ ...item, ...(variants.length ? { variants } : {}) }];
    });
  }
  const single = toVariant(content, `${code}-1`, code);
  return single ? [single] : [];
}

function toVariant(raw: Record<string, unknown>, fallbackId: string, code: WeeklyReviewSectionCode): WeeklyReviewItemVariant | null {
  const prompt = firstText(raw.prompt, raw.question, raw.instruction, raw.text);
  if (!prompt) return null;
  const answer = Array.isArray(raw.answer) ? raw.answer.map(String) : typeof raw.answer === "string" || typeof raw.answer === "number" ? String(raw.answer) : undefined;
  const passage = firstText(raw.passage, raw.script, raw.prompt === undefined ? undefined : raw.text);
  const options = Array.isArray(raw.options) ? raw.options.map(String) : undefined;
  const requiredWords = Array.isArray(raw.requiredWords) ? raw.requiredWords.map(String) : undefined;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
    prompt,
    ...(passage && passage !== prompt ? { passage } : {}),
    ...(typeof raw.audioText === "string" && raw.audioText.trim() ? { audioText: raw.audioText.trim() } : {}),
    ...(typeof raw.audioText === "string" && raw.audioText.trim() && typeof raw.audioUrl === "string" && raw.audioUrl.trim() ? { audioUrl: raw.audioUrl.trim() } : {}),
    ...(options?.length ? { options } : {}),
    ...(answer === undefined ? {} : { answer }),
    ...(typeof raw.explanation === "string" && raw.explanation.trim() ? { explanation: raw.explanation } : {}),
    ...(requiredWords?.length ? { requiredWords } : {}),
    ...(typeof raw.minRequiredWords === "number" ? { minRequiredWords: raw.minRequiredWords } : {}),
    ...(code === "speaking" || raw.acceptsAudio === true ? { acceptsAudio: true } : {}),
    // Server-side only: handed to the learner with a correct answer, never in the question view.
    ...(typeof raw.questionTranslation === "string" && raw.questionTranslation.trim() ? { questionTranslation: raw.questionTranslation.trim() } : {}),
    ...(typeof raw.answerTranslation === "string" && raw.answerTranslation.trim() ? { answerTranslation: raw.answerTranslation.trim() } : {})
  };
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function isSessionState(value: unknown): value is WeeklyReviewSessionState {
  return Boolean(value && typeof value === "object" && (value as WeeklyReviewSessionState).version === 1 && Array.isArray((value as WeeklyReviewSessionState).sections));
}
