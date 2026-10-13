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
