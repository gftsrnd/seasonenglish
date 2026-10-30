import { z } from "zod";

/**
 * Task AI mới `month_framework`: sinh khung tháng (N từ, Y chủ điểm ngữ pháp có scaffolding, Z âm) cho một level.
 * Không sửa task cũ đang chạy; worker gọi trực tiếp provider với schema này.
 */
export const MONTH_FRAMEWORK_TASK_KEY = "month_framework";

export const monthFrameworkInputSchema = z.object({
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  lessonCount: z.number().int().min(1).max(23),
  vocabularyCount: z.number().int().min(1).max(89),
  grammarTopicCount: z.number().int().min(1).max(12),
  soundCount: z.number().int().min(1).max(12),
  /** Mỗi âm cần ít nhất ngần này ví dụ khác nhau để không trùng trong tháng. */
  examplesPerSound: z.number().int().min(3).max(60),
  excludedVocabulary: z.array(z.string()).max(400),
  theme: z.string().max(200)
});
export type MonthFrameworkInput = z.infer<typeof monthFrameworkInputSchema>;

const ipaString = z.string().min(1).max(60);

export const monthFrameworkOutputSchema = z.object({
  vocabulary: z.array(z.object({
    word: z.string().min(1).max(60),
    type: z.string().min(1).max(30),
    ipa: ipaString,
    meaning: z.string().min(1).max(200),
    example: z.string().min(1).max(240),
    abstract: z.boolean()
  })).min(1),
  grammarTopics: z.array(z.object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    steps: z.array(z.object({
      step: z.number().int().min(1),
      focus: z.string().min(1).max(120),
      formula: z.string().min(1).max(240),
      usage: z.string().min(1).max(400),
      examples: z.array(z.string().min(1).max(240)).min(1).max(4)
    })).min(2).max(6)
  })).min(1),
  sounds: z.array(z.object({
    ipa: ipaString,
    label: z.string().min(1).max(120),
    tip: z.string().min(1).max(300),
    tipEn: z.string().min(1).max(300),
    examples: z.array(z.object({ word: z.string().min(1).max(60), ipa: ipaString })).min(3)
  })).min(1)
});
export type MonthFrameworkOutput = z.infer<typeof monthFrameworkOutputSchema>;

export const monthFrameworkOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["vocabulary", "grammarTopics", "sounds"],
  properties: {
    vocabulary: { type: "array", items: { type: "object", additionalProperties: false, required: ["word", "type", "ipa", "meaning", "example", "abstract"], properties: {
      word: { type: "string" }, type: { type: "string" }, ipa: { type: "string" }, meaning: { type: "string" }, example: { type: "string" }, abstract: { type: "boolean" }
    } } },
    grammarTopics: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "summary", "steps"], properties: {
      title: { type: "string" }, summary: { type: "string" },
      steps: { type: "array", items: { type: "object", additionalProperties: false, required: ["step", "focus", "formula", "usage", "examples"], properties: {
        step: { type: "integer" }, focus: { type: "string" }, formula: { type: "string" }, usage: { type: "string" }, examples: { type: "array", items: { type: "string" } }
      } } }
    } } },
    sounds: { type: "array", items: { type: "object", additionalProperties: false, required: ["ipa", "label", "tip", "tipEn", "examples"], properties: {
      ipa: { type: "string" }, label: { type: "string" }, tip: { type: "string" }, tipEn: { type: "string" },
      examples: { type: "array", items: { type: "object", additionalProperties: false, required: ["word", "ipa"], properties: { word: { type: "string" }, ipa: { type: "string" } } } }
    } } }
  }
} as const;

export const MONTH_FRAMEWORK_PROMPT = [
  "Return valid JSON only. You design ONE month of workplace English for a single CEFR level.",
  "Produce exactly vocabularyCount vocabulary items (unique words or short phrases, workplace context, each with IPA without slashes, a short Vietnamese meaning, one natural example sentence, and abstract=true when the word has no concrete picture).",
  "Produce exactly grammarTopicCount grammar topics. Each topic is a scaffolding sequence of 3 steps that build on each other across the month: step 1 introduces the form, step 2 extends it, step 3 contrasts or combines. Give a formula, usage note and 2 examples per step.",
  "Produce exactly soundCount pronunciation sounds. Use only IPA symbols from this inventory: p b t d k g f v θ ð s z ʃ ʒ h tʃ dʒ m n ŋ l r j w ɪ iː ʊ uː e ə ɜː ɔː æ ʌ ɑː ɒ eɪ aɪ ɔɪ aʊ əʊ ɪə eə ʊə. Each sound needs at least examplesPerSound distinct example words whose IPA contains that sound.",
  "Never reuse any word from excludedVocabulary. For A1/A2 write tips and meanings in Vietnamese; for B1+ keep learner-facing text in English except vocabulary meanings."
].join(" ");
