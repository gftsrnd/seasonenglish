import { z } from "zod";
import { monthlyLessonDayOutputSchema } from "./schemas.js";

/**
 * Friday review exercises (12/11). The generic monthly lesson schema types
 * `items` loosely (vocabulary and objective items share it), so `variants` was
 * optional there and the model left it out on 5–22 review items per lesson
 * (MONTHLY_REVIEW_VARIANT_MISSING), which the two-light-finding approval cap
 * then blocked. The review exercise call has its own schema: one property per
 * section and an item shape that requires exactly one variant.
 */
export const MONTHLY_REVIEW_EXERCISE_SECTIONS = ["listening", "word_use", "word_class", "grammar", "reading", "speaking"] as const;
/** Sections whose items are graded choices and carry a retry variant. */
export const MONTHLY_REVIEW_CHOICE_SECTIONS = ["listening", "word_use", "word_class", "grammar", "reading"] as const;
export type MonthlyReviewChoiceSection = (typeof MONTHLY_REVIEW_CHOICE_SECTIONS)[number];

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const choiceFields = {
  prompt: str("the question the learner reads"),
  options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" }, description: "exactly 4 different options of similar length" },
  answer: str("copied exactly from options"),
  explanation: str("at most 2 sentences: why the answer is right"),
  questionTranslation: str("A1-A2 only (omit from B1): short Vietnamese translation of the prompt (blank kept as ____); hidden until answered"),
  answerTranslation: str("A1-A2 only (omit from B1): short Vietnamese translation of the answer; hidden until answered")
};
/** 13/11: the translations are A1–A2 only, so the shared schema no longer requires them (the A1–A2 quality gate does). */
const choiceRequired = ["prompt", "options", "answer", "explanation"];
/** Listen-and-choose-the-meaning: A1–A2 read Vietnamese meanings, B1+ English definitions (B1+ learners see no Vietnamese). */
const listeningChoiceFields = {
  ...choiceFields,
  options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" }, description: "exactly 4 different meanings of week words, similar length: A1-A2 short Vietnamese meanings; B1 and above short simple-English definitions, never Vietnamese" },
  answer: str("the meaning of the spoken word, copied exactly from options (B1 and above: an English definition, never Vietnamese)")
};

function choiceVariantJsonSchema(listening: boolean) {
  return {
    type: "object", additionalProperties: true,
    required: [...(listening ? ["audioText"] : []), ...choiceRequired],
    properties: {
      id: str(),
      ...(listening ? { audioText: str("the SAME core word as the item: the retry tests the word the learner missed") } : {}),
      ...(listening ? listeningChoiceFields : choiceFields),
      passage: str("reading only: the same passage as the item")
    }
  };
}

function choiceItemJsonSchema(listening: boolean) {
  return {
    type: "object", additionalProperties: true,
    required: ["id", ...(listening ? ["audioText"] : []), ...choiceRequired, "variants"],
    properties: {
      id: str(),
      ...(listening ? { audioText: str("the English core word the app speaks (not shown)") } : {}),
      ...(listening ? listeningChoiceFields : choiceFields),
      variants: {
        type: "array", minItems: 1, maxItems: 1, items: choiceVariantJsonSchema(listening),
        description: "REQUIRED on every item: exactly 1 retry item testing the same point in a different context (never a copy of the item); shown when the learner answers wrong."
      }
    }
  };
}

const speakingItemJsonSchema = {
  type: "object", additionalProperties: true, required: ["id", "prompt"],
  properties: {
    id: str(), prompt: str(),
    audioText: str("minimal pair: the option the app speaks"),
    options: { type: "array", items: { type: "string" }, description: "minimal pair only: EXACTLY 2 strings" },
    answer: str("minimal pair only: equal to audioText"),
    explanation: str("minimal pair only"),
    passage: str("read-aloud only: one workplace sentence"),
    requiredWords: { type: "array", items: { type: "string" }, description: "free response only: 4-6 week core words" },
    minRequiredWords: { type: "integer", description: "free response only: 2" },
    questionTranslation: str("minimal pair only"), answerTranslation: str("minimal pair only")
  }
};

const itemsSection = (items: Record<string, unknown>, description: string) => ({
  type: "object", additionalProperties: true, required: ["items"],
  properties: { items: { type: "array", minItems: 1, items, description } }
});

export const monthlyReviewExercisesOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["title", "sections"],
  properties: {
    title: { type: "string", description: "Short review title." },
    sections: {
      type: "object", additionalProperties: false,
      description: "Exactly the review exercise sections listed in components, each with its complete item list.",
      properties: {
        listening: itemsSection(choiceItemJsonSchema(true), "one item per core word; every item has variants"),
        word_use: itemsSection(choiceItemJsonSchema(false), "every item has variants"),
        word_class: itemsSection(choiceItemJsonSchema(false), "Word form items; every item has variants"),
        grammar: itemsSection(choiceItemJsonSchema(false), "one item per locked grammar step; every item has variants"),
        reading: {
          type: "object", additionalProperties: true, required: ["passage", "items"],
          properties: {
            passage: str("one workplace message or email"),
            items: { type: "array", minItems: 3, maxItems: 3, items: choiceItemJsonSchema(false), description: "exactly 3 comprehension questions; every item has variants" }
          }
        },
        speaking: itemsSection(speakingItemJsonSchema, "exactly 4 items: 2 minimal pairs, 1 read-aloud, 1 free response")
      }
    }
  }
} satisfies Record<string, unknown>;

function decoded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** `{ title, sections: { listening: {...}, ... } }` → the monthly lesson shape `{ title, parts: [{ code, content }] }` (already-flat output passes through). */
export function normalizeMonthlyReviewExercisesOutput(value: unknown): unknown {
  const output = decoded(value);
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const record = output as Record<string, unknown>;
  const sections = decoded(record.sections);
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return output;
  const { sections: _sections, ...rest } = record;
  const bySection = sections as Record<string, unknown>;
  const parts = MONTHLY_REVIEW_EXERCISE_SECTIONS.flatMap((code) => bySection[code] === undefined ? [] : [{ code, content: decoded(bySection[code]) }]);
  return { ...rest, parts };
}

export const monthlyReviewExercisesOutputSchema = z.preprocess(normalizeMonthlyReviewExercisesOutput, monthlyLessonDayOutputSchema);
export type MonthlyReviewExercisesTaskOutput = z.infer<typeof monthlyReviewExercisesOutputSchema>;

/**
 * Targeted repair for light review findings: the model rewrites only the listed
 * items (a missing variant); the application merges the returned variant into the accepted item.
 */
export const monthlyReviewItemRepairOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array", minItems: 1,
      description: "One entry per item listed in repairItems, same section and id.",
      items: {
        type: "object", additionalProperties: false, required: ["section", "id", "item"],
        properties: {
          section: { type: "string", enum: [...MONTHLY_REVIEW_CHOICE_SECTIONS] },
          id: str("the item id from repairItems, unchanged"),
          item: {
            ...choiceItemJsonSchema(false),
            properties: { ...choiceItemJsonSchema(false).properties, audioText: str("listening only: unchanged core word") },
            description: "The complete item: unchanged audioText/answer meaning, options fixed as asked, and exactly 1 variant."
          }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export const monthlyReviewItemRepairOutputSchema = z.preprocess((value) => {
  const output = decoded(value);
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const items = decoded((output as Record<string, unknown>).items);
  return { items: Array.isArray(items) ? items.map((entry) => {
    const record = decoded(entry);
    return record && typeof record === "object" && !Array.isArray(record) ? { ...(record as Record<string, unknown>), item: decoded((record as Record<string, unknown>).item) } : record;
  }) : items };
}, z.object({
  items: z.array(z.object({
    section: z.enum(MONTHLY_REVIEW_CHOICE_SECTIONS),
    id: z.string().trim().min(1).max(200),
    item: z.record(z.string(), z.unknown())
  })).min(1).max(80)
}));
export type MonthlyReviewItemRepairTaskOutput = z.infer<typeof monthlyReviewItemRepairOutputSchema>;
