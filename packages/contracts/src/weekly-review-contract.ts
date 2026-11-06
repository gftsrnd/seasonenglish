/**
 * Friday weekly review ("bài ôn thứ Sáu") contracts.
 *
 * A review is six ordered sections answered with a review-until-correct loop:
 * a wrong answer is explained, then the item returns at the end of its
 * section (using an alternative-context variant when the content has one).
 * Reviews never count as lessons, never feed level-up progress, and never
 * create Operator exercise alerts.
 */

/** Section codes reuse the learner lesson part codes. */
export type WeeklyReviewSectionCode =
  | "listening"
  | "word_use"
  | "word_class"
  | "grammar"
  | "reading"
  | "writing"
  | "speaking";

/** One presentable form of a review question. */
export interface WeeklyReviewItemVariant {
  id: string;
  prompt: string;
  /** Shared passage or script (for reading/listening sections). */
  passage?: string;
  /** Spoken by the app (listen-and-choose items); never shown as text. */
  audioText?: string;
  options?: string[];
  /**
   * Answer key. Omitted for free responses, which pass when the response is
   * valid English and uses at least `minRequiredWords` of `requiredWords`.
   */
  answer?: string | string[];
  /** Short (≤ 2 sentences) explanation shown after a wrong answer. */
  explanation?: string;
  requiredWords?: string[];
  minRequiredWords?: number;
  /** Free responses may be submitted as audio (6b/6c). */
  acceptsAudio?: boolean;
}

/**
 * A review item. `variants` are alternative contexts for the same knowledge
 * point; the retry after a wrong answer uses the next variant. When content
 * has no variants yet, the same item is asked again.
 */
export interface WeeklyReviewItem extends WeeklyReviewItemVariant {
  variants?: WeeklyReviewItemVariant[];
}

export interface WeeklyReviewSectionContent {
  items: WeeklyReviewItem[];
}

export interface WeeklyReviewWarmupCard {
  word: string;
  meaning?: string;
  pronunciation?: string;
  imageUrl?: string;
  audioUrl?: string;
}

/** Learner-visible question; the answer key is never sent to the client. */
export interface WeeklyReviewQuestionView {
  sectionCode: WeeklyReviewSectionCode;
  itemId: string;
  variantId: string;
  /** True when this item was answered wrong before and came back. */
  retry: boolean;
  prompt: string;
  passage?: string;
  /** Spoken by the app (listen-and-choose items); never shown as text. */
  audioText?: string;
  options?: string[];
  freeResponse: boolean;
  acceptsAudio: boolean;
}

export interface WeeklyReviewSectionView {
  code: WeeklyReviewSectionCode;
  title: string;
  totalItems: number;
  correctItems: number;
  completed: boolean;
}

export interface WeeklyReviewSessionView {
  lessonId: string;
  /** Optional ungraded flip-card warm-up (part 0). */
  warmup: { status: "pending" | "skipped" | "done"; cards: WeeklyReviewWarmupCard[] };
  sections: WeeklyReviewSectionView[];
  /** First unfinished section; null once every section is complete. */
  currentSectionCode: WeeklyReviewSectionCode | null;
  currentQuestion: WeeklyReviewQuestionView | null;
  completed: boolean;
  completedAt: string | null;
}

export interface WeeklyReviewAnswerInput {
  sectionCode: WeeklyReviewSectionCode;
  itemId: string;
  answer?: string;
  artifactKey?: string;
}

export interface WeeklyReviewAnswerResult {
  correct: boolean;
  /** Explanation for a wrong answer, or a short confirmation. */
  feedback: string;
  /** For a wrong answer: the item returns at the end of the section. */
  willRetry: boolean;
  session: WeeklyReviewSessionView;
}
