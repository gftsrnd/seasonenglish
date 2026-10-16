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
  partOfSpeech: z.enum(["noun", "verb", "adjective", "adverb", "preposition", "phrase"]),
  imageUrl: z.string().url().max(1_000).optional()
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
          definition: { type: "string" }, imageUrl: { type: "string" },
          partOfSpeech: { type: "string", enum: ["noun", "verb", "adjective", "adverb", "preposition", "phrase"] }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export const microLessonInputSchema = z.object({
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  weekTopic: z.string().trim().min(1).max(300),
  goals: z.array(z.string().trim().min(1).max(300)).max(10),
  workContext: z.string().trim().max(500),
  learningStyles: z.array(z.string().trim().min(1).max(100)).max(10),
  explanationLanguage: z.enum(["auto", "vi", "en"]),
  durationMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)])
});

export const microLessonOutputSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  durationMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  theory: z.string().trim().min(20).max(2_000),
  vocabulary: z.array(z.string().trim().min(1).max(150)).min(3).max(5),
  practice: z.object({
    prompt: z.string().trim().min(5).max(1_000),
    type: z.enum(["mcq", "write", "fill"]),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(5).optional(),
    answer: z.string().trim().min(1).max(1_000)
  })
}).superRefine((value, context) => {
  if (value.practice.type === "mcq" && (!value.practice.options || value.practice.options.length < 2)) {
    context.addIssue({ code: "custom", path: ["practice", "options"], message: "MCQ requires options" });
  }
});

export type MicroLessonTaskOutput = z.infer<typeof microLessonOutputSchema>;

export const microLessonOutputJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["topic", "durationMinutes", "theory", "vocabulary", "practice"],
  properties: {
    topic: { type: "string" },
    durationMinutes: { type: "integer", enum: [5, 10, 15, 20] },
    theory: { type: "string" },
    vocabulary: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    practice: {
      type: "object", additionalProperties: false,
      required: ["prompt", "type", "answer"],
      properties: {
        prompt: { type: "string" }, type: { type: "string", enum: ["mcq", "write", "fill"] },
        options: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
        answer: { type: "string" }
      }
    }
  }
} satisfies Record<string, unknown>;

export const microGradingInputSchema = z.object({
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  theory: z.string().trim().min(1).max(2_000),
  vocabulary: z.array(z.string()).min(1).max(10),
  practice: z.object({ prompt: z.string(), type: z.enum(["mcq", "write", "fill"]), answer: z.string() }),
  learnerAnswer: z.string().trim().min(1).max(2_000)
});

export const microGradingOutputSchema = z.object({
  correct: z.boolean(),
  score: z.number().int().min(0).max(10),
  feedback: z.string().trim().min(1).max(1_000)
});

export type MicroGradingTaskOutput = z.infer<typeof microGradingOutputSchema>;

export const microGradingOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["correct", "score", "feedback"],
  properties: {
    correct: { type: "boolean" }, score: { type: "integer", minimum: 0, maximum: 10 }, feedback: { type: "string" }
  }
} satisfies Record<string, unknown>;

const lessonPartCodeSchema = z.enum([
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
]);

const legacyLessonPartCodes = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "speaking"
] as const;

const generatedLessonPartsSchema = z.array(z.object({
  code: lessonPartCodeSchema,
  title: z.string().trim().min(1).max(100),
  content: z.record(z.string(), z.unknown())
})).min(9).max(11).superRefine((parts, ctx) => {
  const codes = parts.map((part) => part.code);
  const codeSet = new Set(codes);

  for (const code of legacyLessonPartCodes) {
    if (!codeSet.has(code)) {
      ctx.addIssue({ code: "custom", message: `Missing required lesson part: ${code}` });
    }
  }

  if (codes.length > legacyLessonPartCodes.length && (!codeSet.has("word_class") || !codeSet.has("word_use"))) {
    ctx.addIssue({ code: "custom", message: "Enriched lessons must include word_class and word_use" });
  }

  if (codeSet.size !== codes.length) {
    ctx.addIssue({ code: "custom", message: "Lesson part codes must be unique" });
  }
});

const generatedLessonSchema = z.object({
  dayNumber: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(200),
  durationMinutes: z.number().int().min(5).max(20),
  parts: generatedLessonPartsSchema
});

export const weeklyLessonsInputSchema = z.object({
  weekNumber: z.number().int().min(1).max(52),
  topic: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000),
  objectives: z.string().trim().max(2_000),
  keyVocabHint: z.string().trim().max(1_000),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  lessonCount: z.literal(5)
});

export const weeklyLessonsOutputSchema = z.object({ lessons: z.array(generatedLessonSchema).length(5) });
export type WeeklyLessonsTaskOutput = z.infer<typeof weeklyLessonsOutputSchema>;

export const weeklyLessonsOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["lessons"],
  properties: {
    lessons: {
      type: "array", minItems: 5, maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        required: ["dayNumber", "title", "durationMinutes", "parts"],
        properties: {
          dayNumber: { type: "integer", minimum: 1, maximum: 5 },
          title: { type: "string" },
          durationMinutes: { type: "integer", minimum: 5, maximum: 20 },
          parts: {
            type: "array", minItems: 9, maxItems: 11,
            items: {
              type: "object", additionalProperties: false, required: ["code", "title", "content"],
              properties: {
                code: { type: "string", enum: ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"] },
                title: { type: "string" }, content: { type: "object" }
              }
            }
          }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

const assessmentChoiceSchema = z.object({
  prompt: z.string().trim().min(1).max(1_000),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  correctIndex: z.number().int().min(0).max(3)
});

export const levelFormInputSchema = z.object({
  targetLevel: z.enum(["A2", "B1", "B2", "C1"]),
  context: z.literal("workplace_english"), listeningQuestions: z.literal(5), readingQuestions: z.literal(5)
});

export const levelFormOutputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  listening: z.object({ script: z.string().trim().min(80).max(4_000), questions: z.array(assessmentChoiceSchema).length(5) }),
  reading: z.object({ passage: z.string().trim().min(80).max(4_000), questions: z.array(assessmentChoiceSchema).length(5) }),
  writingPrompt: z.string().trim().min(20).max(1_000),
  speakingPrompt: z.string().trim().min(20).max(1_000)
});

export type LevelFormTaskOutput = z.infer<typeof levelFormOutputSchema>;

export const levelFormOutputJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["title", "listening", "reading", "writingPrompt", "speakingPrompt"],
  properties: {
    title: { type: "string" },
    listening: sectionSchema("script"), reading: sectionSchema("passage"),
    writingPrompt: { type: "string" }, speakingPrompt: { type: "string" }
  }
} satisfies Record<string, unknown>;

function sectionSchema(textKey: "script" | "passage") {
  return {
    type: "object", additionalProperties: false, required: [textKey, "questions"],
    properties: {
      [textKey]: { type: "string" },
      questions: { type: "array", minItems: 5, maxItems: 5, items: {
        type: "object", additionalProperties: false, required: ["prompt", "options", "correctIndex"],
        properties: { prompt: { type: "string" }, options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } }, correctIndex: { type: "integer", minimum: 0, maximum: 3 } }
      } }
    }
  };
}

const cefrSuggestionLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1"]);
const weekSuggestionPlanSchema = z.partialRecord(
  cefrSuggestionLevelSchema,
  z.array(z.string().trim().min(1).max(500)).length(5)
).refine((plan) => Object.keys(plan).length > 0, { message: "At least one active CEFR plan is required" });
const weekSuggestionOptionSchema = z.object({
  topic: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(2_000),
  objectives: z.string().trim().min(1).max(2_000), keyVocabHint: z.string().trim().min(1).max(1_000),
  plan: weekSuggestionPlanSchema
});
export const weekSuggestionsInputSchema = z.object({
  weekNumbers: z.array(z.number().int().min(1).max(52)).min(1).max(12),
  levels: z.array(cefrSuggestionLevelSchema).min(1), usedTopics: z.array(z.string()).max(52)
});
export const weekSuggestionsOutputSchema = z.object({ weeks: z.array(z.object({
  weekNumber: z.number().int().min(1).max(52), levels: z.array(cefrSuggestionLevelSchema).min(1), options: z.array(weekSuggestionOptionSchema).length(3)
})).min(1).max(12) });
export const weekSuggestionsOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["weeks"], properties: { weeks: {
    type: "array", items: { type: "object", additionalProperties: false, required: ["weekNumber", "levels", "options"], properties: {
      weekNumber: { type: "integer" }, levels: { type: "array", minItems: 1, items: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1"] } }, options: { type: "array", minItems: 3, maxItems: 3, items: {
        type: "object", additionalProperties: false, required: ["topic", "description", "objectives", "keyVocabHint", "plan"],
        properties: {
          topic: { type: "string" }, description: { type: "string" }, objectives: { type: "string" }, keyVocabHint: { type: "string" },
          plan: { type: "object", minProperties: 1, additionalProperties: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } } }
        }
      } }
    } }
  } }
} satisfies Record<string, unknown>;

export const assessmentGradingInputSchema = z.object({
  kind: z.enum(["placement", "final", "level-up"]),
  writing: z.array(z.object({ prompt: z.string(), answer: z.string() })).min(1),
  speaking: z.array(z.object({ prompt: z.string(), answer: z.string(), evidenceType: z.string() })).min(1),
  writingMaxScore: z.number().int().min(1).max(25), speakingMaxScore: z.number().int().min(1).max(25)
});
export const assessmentGradingOutputSchema = z.object({
  writingScore: z.number().min(0).max(25), speakingScore: z.number().min(0).max(25),
  suggestedLevel: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  rationale: z.string().trim().min(1).max(2_000), monthlyGoal: z.string().trim().min(1).max(1_000)
});
export const assessmentGradingOutputJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["writingScore", "speakingScore", "suggestedLevel", "rationale", "monthlyGoal"],
  properties: {
    writingScore: { type: "number", minimum: 0, maximum: 25 }, speakingScore: { type: "number", minimum: 0, maximum: 25 },
    suggestedLevel: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1"] },
    rationale: { type: "string" }, monthlyGoal: { type: "string" }
  }
} satisfies Record<string, unknown>;
