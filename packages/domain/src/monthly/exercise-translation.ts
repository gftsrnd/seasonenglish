/**
 * Vietnamese translation of exercise questions and answers (product decision
 * 12/11, all levels A1–C1). Every monthly exercise question that has a correct
 * answer carries `questionTranslation` (the question/prompt) and
 * `answerTranslation` (the correct answer), both short Vietnamese. They are
 * shown only once the question is finished — answered correctly, or every
 * attempt used — and never before: the learner API strips them until then and
 * hands them over with the result. They are never read aloud.
 *
 * Daily lessons: one question per practice part (listening, reading, writing,
 * word_class, word_use), fields on the part content. Friday reviews: every
 * choice/answer item of a section, and each of its variants.
 */

export const MONTHLY_QUESTION_TRANSLATION_MAX_CHARS = 240;
export const MONTHLY_ANSWER_TRANSLATION_MAX_CHARS = 160;
export const MONTHLY_TRANSLATED_DAILY_PARTS = ["listening", "reading", "writing", "word_class", "word_use"] as const;
export const MONTHLY_TRANSLATED_REVIEW_SECTIONS = ["listening", "word_use", "word_class", "grammar", "reading", "speaking"] as const;
/** Part statuses after which the translation may be shown (correct, or the attempt limit reached). */
export const EXERCISE_TRANSLATION_REVEAL_STATUSES = ["correct", "wrong_exhausted"] as const;

const VIETNAMESE_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúý]/iu;
const TRANSLATION_KEYS = ["questionTranslation", "answerTranslation"] as const;

type Content = Record<string, unknown>;

function isRecord(value: unknown): value is Content {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function answerText(value: unknown): string {
  if (Array.isArray(value)) return text(value[0]);
  return typeof value === "number" ? String(value) : text(value);
}

/** True for a translation key (`questionTranslation` / `answerTranslation`): Vietnamese by design at every level. */
export function isExerciseTranslationKey(key: string): boolean {
  return (TRANSLATION_KEYS as readonly string[]).includes(key);
}

/** The translation pair of one question, or null when it has none (older content). */
export function readExerciseTranslation(content: unknown): { question: string; answer: string } | null {
  if (!isRecord(content)) return null;
  const question = text(content.questionTranslation);
  const answer = text(content.answerTranslation);
  return question && answer ? { question, answer } : null;
}

/** Whether a part status lets the learner see the translation. */
export function exerciseTranslationRevealed(status: string | undefined): boolean {
  return Boolean(status && (EXERCISE_TRANSLATION_REVEAL_STATUSES as readonly string[]).includes(status));
}

/** Copy of a part content without any translation field (top level, items and their variants). */
export function withoutExerciseTranslations(content: Content): Content {
  const strip = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const next: Content = {};
    for (const [key, item] of Object.entries(value)) {
      if (isExerciseTranslationKey(key)) continue;
      next[key] = (key === "items" || key === "variants") && Array.isArray(item) ? item.map(strip) : item;
    }
    return next;
  };
  return strip(content) as Content;
}

/**
 * December 2026 rule: an answer that is one token (no space) - a grammar word
 * or contraction (am, is, isn't, don't), a hyphenated word (co-worker), a
 * name, number or acronym (AI, 9:30) - needs no Vietnamese: its
 * answerTranslation may repeat the answer as it is or give a short gloss. An
 * answer of two or more words is always translated. ("isn't" used to count as
 * two words through the apostrophe, so the gate demanded a Vietnamese gloss the
 * model kept refusing to give.)
 */
export function isSingleTokenAnswer(answer: string): boolean {
  return /^\S+$/u.test(answer.trim());
}

/** Prompt rule stating the answerTranslation requirement exactly as the gate checks it. */
export const MONTHLY_ANSWER_TRANSLATION_RULE = "answerTranslation: an answer of two or more words (are preparing, a short report) always gets a short natural Vietnamese translation; a one-word answer with no space (am, is, isn't, don't, co-worker, a name, a number, an acronym) keeps answerTranslation equal to the answer itself, e.g. answer \"isn't\" -> answerTranslation \"isn't\".";

/** Problems with one question's translation pair (empty when fine). */
function questionTranslationIssues(label: string, question: Content): string[] {
  const issues: string[] = [];
  const prompt = text(question.prompt) || text(question.question);
  const answer = answerText(question.answer);
  if (!prompt || !answer) return issues;
  const questionTranslation = text(question.questionTranslation);
  const answerTranslation = text(question.answerTranslation);
  if (!questionTranslation || !VIETNAMESE_LETTER.test(questionTranslation)) issues.push(`${label}.questionTranslation must be a short Vietnamese translation of the question`);
  else if (questionTranslation.length > MONTHLY_QUESTION_TRANSLATION_MAX_CHARS) issues.push(`${label}.questionTranslation must be short (at most ${MONTHLY_QUESTION_TRANSLATION_MAX_CHARS} characters)`);
  if (!answerTranslation && isSingleTokenAnswer(answer)) issues.push(`${label}.answerTranslation is missing: for the one-word answer "${answer.slice(0, 60)}" repeat the answer itself`);
  else if (!answerTranslation || (!isSingleTokenAnswer(answer) && !VIETNAMESE_LETTER.test(answerTranslation))) issues.push(`${label}.answerTranslation must be a short Vietnamese translation of the correct answer "${answer.slice(0, 60)}"`);
  else if (answerTranslation.length > MONTHLY_ANSWER_TRANSLATION_MAX_CHARS) issues.push(`${label}.answerTranslation must be short (at most ${MONTHLY_ANSWER_TRANSLATION_MAX_CHARS} characters)`);
  return issues;
}

/**
 * Gate: every exercise question with a correct answer in this part has a
 * short Vietnamese question translation and answer translation.
 * `kind` "new" checks the daily single question; "review" every item and variant.
 */
export function monthlyExerciseTranslationIssues(kind: "new" | "review", code: string, content: unknown): string[] {
  if (!isRecord(content)) return [];
  if (kind === "new") {
    if (!(MONTHLY_TRANSLATED_DAILY_PARTS as readonly string[]).includes(code)) return [];
    return questionTranslationIssues(code, content);
  }
  if (!(MONTHLY_TRANSLATED_REVIEW_SECTIONS as readonly string[]).includes(code) || !Array.isArray(content.items)) return [];
  return content.items.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const label = `${code}.items[${index}]`;
    const variants = Array.isArray(item.variants) ? item.variants : [];
    return [
      ...questionTranslationIssues(label, item),
      ...variants.flatMap((variant, variantIndex) => isRecord(variant) ? questionTranslationIssues(`${label}.variants[${variantIndex}]`, variant) : [])
    ];
  });
}
