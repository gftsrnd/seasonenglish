import { z } from "zod";

export const coachInputSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  scenario: z.string().trim().min(1).max(500),
  priorTurns: z.array(z.object({
    speaker: z.enum(["learner", "coach"]),
    text: z.string().trim().min(1).max(2_000)
  })).max(8)
});

export const coachOutputSchema = z.object({
  relevant: z.boolean(),
  relevanceNote: z.string().trim().max(500),
  reply: z.string().trim().min(1).max(2_000),
  rubric: z.object({
    meaning: z.number().int().min(1).max(5),
    vocabulary: z.number().int().min(1).max(5),
    grammar: z.number().int().min(1).max(5)
  }),
  suggestions: z.array(z.object({
    original: z.string().trim().min(1).max(500),
    corrected: z.string().trim().min(1).max(500),
    explanation: z.string().trim().min(1).max(500)
  })).max(3),
  correctedText: z.string().trim().max(2_000),
  usedWords: z.array(z.string().trim().min(1).max(100)).max(15)
});

export type CoachTaskInput = z.infer<typeof coachInputSchema>;
export type CoachTaskOutput = z.infer<typeof coachOutputSchema>;

export const coachOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relevant", "relevanceNote", "reply", "rubric", "suggestions", "correctedText", "usedWords"],
  properties: {
    relevant: { type: "boolean" },
    relevanceNote: { type: "string" },
    reply: { type: "string" },
    rubric: {
      type: "object", additionalProperties: false,
      required: ["meaning", "vocabulary", "grammar"],
      properties: {
        meaning: { type: "integer", minimum: 1, maximum: 5 },
        vocabulary: { type: "integer", minimum: 1, maximum: 5 },
        grammar: { type: "integer", minimum: 1, maximum: 5 }
      }
    },
    suggestions: {
      type: "array", maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["original", "corrected", "explanation"],
        properties: { original: { type: "string" }, corrected: { type: "string" }, explanation: { type: "string" } }
      }
    },
    correctedText: { type: "string" },
    usedWords: { type: "array", maxItems: 15, items: { type: "string" } }
  }
} satisfies Record<string, unknown>;

export const weeklyPracticeInputSchema = z.object({
  text: z.string().trim().min(8).max(10_000),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  topic: z.string().trim().min(1).max(500),
  rubric: z.array(z.enum(["meaning", "vocabulary", "grammar"])).length(3)
});

export const weeklyPracticeOutputSchema = z.object({
  score: z.object({
    total: z.number().int().min(0).max(100),
    rubric: z.object({
      meaning: z.number().int().min(1).max(5),
      vocabulary: z.number().int().min(1).max(5),
      grammar: z.number().int().min(1).max(5)
    })
  }),
  feedback: z.string().trim().min(1).max(2_000),
  suggestions: z.array(z.object({
    original: z.string().trim().min(1).max(500),
    corrected: z.string().trim().min(1).max(500),
    explanation: z.string().trim().min(1).max(500)
  })).max(3),
  correctedText: z.string().trim().max(10_000)
});

export type WeeklyPracticeTaskInput = z.infer<typeof weeklyPracticeInputSchema>;
export type WeeklyPracticeTaskOutput = z.infer<typeof weeklyPracticeOutputSchema>;

export const weeklyPracticeOutputJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["score", "feedback", "suggestions", "correctedText"],
  properties: {
    score: {
      type: "object", additionalProperties: false, required: ["total", "rubric"],
      properties: {
        total: { type: "integer", minimum: 0, maximum: 100 },
        rubric: {
          type: "object", additionalProperties: false, required: ["meaning", "vocabulary", "grammar"],
          properties: {
            meaning: { type: "integer", minimum: 1, maximum: 5 },
            vocabulary: { type: "integer", minimum: 1, maximum: 5 },
            grammar: { type: "integer", minimum: 1, maximum: 5 }
          }
        }
      }
    },
    feedback: { type: "string" },
    suggestions: {
      type: "array", maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["original", "corrected", "explanation"],
        properties: { original: { type: "string" }, corrected: { type: "string" }, explanation: { type: "string" } }
      }
    },
    correctedText: { type: "string" }
  }
} satisfies Record<string, unknown>;

const vocabularyWordSchema = z.object({
  id: z.string().trim().min(1).max(100),
  english: z.string().trim().min(1).max(100),
  vietnamese: z.string().trim().min(1).max(200),
  definition: z.string().trim().min(1).max(300),
  partOfSpeech: z.enum(["noun", "verb", "adjective", "adverb", "preposition", "phrase"])
});

export const vocabularyInputSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  count: z.literal(15)
});

export const vocabularyOutputSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  words: z.array(vocabularyWordSchema).length(15)
});

export type VocabularyTaskInput = z.infer<typeof vocabularyInputSchema>;
export type VocabularyTaskOutput = z.infer<typeof vocabularyOutputSchema>;

export const vocabularyOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["topic", "words"],
  properties: {
    topic: { type: "string" },
    words: {
      type: "array", minItems: 15, maxItems: 15,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "english", "vietnamese", "definition", "partOfSpeech"],
        properties: {
          id: { type: "string" }, english: { type: "string" }, vietnamese: { type: "string" },
          definition: { type: "string" },
          partOfSpeech: { type: "string", enum: ["noun", "verb", "adjective", "adverb", "preposition", "phrase"] }
        }
      }
    }
  }
} satisfies Record<string, unknown>;
