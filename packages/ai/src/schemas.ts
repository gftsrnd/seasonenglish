import { z } from "zod";

export const coachInputSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  persona: z.enum(["informal", "formal"]),
  mode: z.enum(["practice", "challenge"]),
  scenario: z.string().trim().min(1).max(500),
  currentQuestion: z.string().trim().min(1).max(2_000),
  priorTurns: z.array(z.object({
    speaker: z.enum(["learner", "coach"]),
    text: z.string().trim().min(1).max(2_000)
  })).max(8)
});

export const coachOutputSchema = z.object({
  evaluation: z.object({
    status: z.enum(["valid", "insufficient", "off_topic"]),
    result: z.enum(["correct", "partially_correct", "missing_information", "off_topic"]),
    countsTowardGoal: z.boolean(),
    noteVi: z.string().trim().min(1).max(500)
  }),
  seasonReply: z.string().trim().min(1).max(800),
  seasonReplyTranslation: z.string().trim().min(1).max(1_000),
  nextQuestion: z.string().trim().min(1).max(500),
  nextQuestionTranslation: z.string().trim().min(1).max(700),
  rubric: z.object({
    meaning: z.object({ score: z.number().int().min(0).max(5), evidence: z.string().trim().min(1).max(500), improvement: z.string().trim().min(1).max(500) }),
    vocabulary: z.object({ score: z.number().int().min(0).max(5), evidence: z.string().trim().min(1).max(500), improvement: z.string().trim().min(1).max(500) }),
    grammar: z.object({ score: z.number().int().min(0).max(5), evidence: z.string().trim().min(1).max(500), improvement: z.string().trim().min(1).max(500) })
  }),
  corrections: z.array(z.object({
    original: z.string().trim().min(1).max(500),
    corrected: z.string().trim().min(1).max(500),
    translation: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500)
  })).max(3),
  correctedText: z.string().trim().max(2_000),
  suggestedAnswer: z.object({
    text: z.string().trim().min(1).max(500),
    translation: z.string().trim().min(1).max(500)
  }),
  usedWords: z.array(z.string().trim().min(1).max(100)).max(15)
}).superRefine((output, context) => {
  const { status, countsTowardGoal } = output.evaluation;
  if ((status === "valid") !== countsTowardGoal) {
    context.addIssue({ code: "custom", path: ["evaluation", "countsTowardGoal"], message: "Only valid Coach turns count toward goals." });
  }
  const allowedResult = status === "valid"
    ? new Set(["correct", "partially_correct"])
    : new Set([status === "insufficient" ? "missing_information" : "off_topic"]);
  if (!allowedResult.has(output.evaluation.result)) {
    context.addIssue({ code: "custom", path: ["evaluation", "result"], message: "Coach result must match the evaluation status." });
  }
  if (status === "insufficient" && output.rubric.meaning.score !== 0) {
    context.addIssue({ code: "custom", path: ["rubric", "meaning", "score"], message: "Insufficient Coach turns require meaning score 0." });
  }
  if (status === "off_topic" && output.rubric.meaning.score > 1) {
    context.addIssue({ code: "custom", path: ["rubric", "meaning", "score"], message: "Off-topic Coach turns require meaning score at most 1." });
  }
  if (status !== "valid" && output.usedWords.length > 0) {
    context.addIssue({ code: "custom", path: ["usedWords"], message: "Invalid Coach turns cannot unlock vocabulary." });
  }
});

export type CoachTaskInput = z.infer<typeof coachInputSchema>;
export type CoachTaskOutput = z.infer<typeof coachOutputSchema>;

const coachRubricCriterionJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["score", "evidence", "improvement"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 5 },
    evidence: { type: "string" }, improvement: { type: "string" }
  }
} as const;

export const coachOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["evaluation", "seasonReply", "seasonReplyTranslation", "nextQuestion", "nextQuestionTranslation", "rubric", "corrections", "correctedText", "suggestedAnswer", "usedWords"],
  properties: {
    evaluation: {
      type: "object", additionalProperties: false,
      required: ["status", "result", "countsTowardGoal", "noteVi"],
      properties: {
        status: { type: "string", enum: ["valid", "insufficient", "off_topic"] },
        result: { type: "string", enum: ["correct", "partially_correct", "missing_information", "off_topic"] },
        countsTowardGoal: { type: "boolean" }, noteVi: { type: "string" }
      }
    },
    seasonReply: { type: "string", maxLength: 800 },
    seasonReplyTranslation: { type: "string", maxLength: 1_000 },
    nextQuestion: { type: "string", maxLength: 500 },
    nextQuestionTranslation: { type: "string", maxLength: 700 },
    rubric: {
      type: "object", additionalProperties: false,
      required: ["meaning", "vocabulary", "grammar"],
      properties: {
        meaning: coachRubricCriterionJsonSchema,
        vocabulary: coachRubricCriterionJsonSchema,
        grammar: coachRubricCriterionJsonSchema
      }
    },
    corrections: {
      type: "array", maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["original", "corrected", "translation", "reason"],
        properties: {
          original: { type: "string" }, corrected: { type: "string" },
          translation: { type: "string" }, reason: { type: "string" }
        }
      }
    },
    correctedText: { type: "string" },
    suggestedAnswer: {
      type: "object", additionalProperties: false, required: ["text", "translation"],
      properties: { text: { type: "string" }, translation: { type: "string" } }
    },
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
  offTopic: z.boolean(),
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
  required: ["score", "offTopic", "feedback", "suggestions", "correctedText"],
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
    offTopic: { type: "boolean" },
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
  imageQuery: z.string().trim().min(2).max(200).optional()
}).strict();

export const vocabularyInputSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  count: z.literal(20)
});

export const vocabularyOutputSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  words: z.array(vocabularyWordSchema).length(12),
  distractors: z.array(vocabularyWordSchema).length(8)
}).superRefine((output, context) => {
  const ids = new Set<string>();
  const english = new Set<string>();
  for (const item of [...output.words, ...output.distractors]) {
    const normalizedEnglish = item.english.toLocaleLowerCase("en");
    if (ids.has(item.id) || english.has(normalizedEnglish)) {
      context.addIssue({ code: "custom", message: "Vocabulary targets and distractors must be unique." });
      return;
    }
    ids.add(item.id);
    english.add(normalizedEnglish);
  }
});

export type VocabularyTaskInput = z.infer<typeof vocabularyInputSchema>;
export type VocabularyTaskOutput = z.infer<typeof vocabularyOutputSchema>;

const vocabularyWordJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["id", "english", "vietnamese", "definition", "partOfSpeech"],
  properties: {
    id: { type: "string" }, english: { type: "string" }, vietnamese: { type: "string" },
    definition: { type: "string" }, imageQuery: { type: "string", minLength: 2, maxLength: 200 },
    partOfSpeech: { type: "string", enum: ["noun", "verb", "adjective", "adverb", "preposition", "phrase"] }
  }
} as const;

export const vocabularyOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["topic", "words", "distractors"],
  properties: {
    topic: { type: "string" },
    words: {
      type: "array", minItems: 12, maxItems: 12, items: vocabularyWordJsonSchema
    },
    distractors: {
      type: "array", minItems: 8, maxItems: 8, items: vocabularyWordJsonSchema
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
  feedback: z.string().trim().min(1).max(1_000),
  citedError: z.string().trim().min(1).max(300).nullable()
}).strict();

export type MicroGradingTaskOutput = z.infer<typeof microGradingOutputSchema>;

export const microGradingOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["correct", "score", "feedback", "citedError"],
  properties: {
    correct: { type: "boolean" }, score: { type: "integer", minimum: 0, maximum: 10 }, feedback: { type: "string" },
    citedError: { anyOf: [{ type: "string" }, { type: "null" }] }
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

function isGrammarPatternTitle(value: string): boolean {
  const normalized = value.trim();
  if (/[.!;]/.test(normalized)) return false;
  if (/\b(?:about|describing|talking|learning|practicing|using)\b/i.test(normalized)) return false;
  return /[+/?…]|\b(?:S|V|O|subject|verb)\b|^\s*(?:I|you|we|they|he|she|it|do|does|can|could|will|would|should|have|has|be|there|what|how|where)\b/i.test(normalized);
}

const generatedLessonPartsSchema = z.array(z.object({
  code: lessonPartCodeSchema,
  title: z.string().trim().min(1).max(100),
  content: z.record(z.string(), z.unknown())
})).length(11).superRefine((parts, ctx) => {
  const codes = parts.map((part) => part.code);
  const codeSet = new Set(codes);

  for (const code of legacyLessonPartCodes) {
    if (!codeSet.has(code)) {
      ctx.addIssue({ code: "custom", message: `Missing required lesson part: ${code}` });
    }
  }

  if (!codeSet.has("word_class") || !codeSet.has("word_use")) {
    ctx.addIssue({ code: "custom", message: "Enriched lessons must include word_class and word_use" });
  }

  if (codeSet.size !== codes.length) {
    ctx.addIssue({ code: "custom", message: "Lesson part codes must be unique" });
  }

  const expectedOrder = [...legacyLessonPartCodes.slice(0, -1), "word_class", "word_use", "speaking"] as const;
  if (codes.some((code, index) => code !== expectedOrder[index])) {
    ctx.addIssue({ code: "custom", message: "Lesson part codes must follow the required order" });
  }

  for (const [index, part] of parts.entries()) validateGeneratedPartContent(part.code, part.content, ctx, index);
});

function validateGeneratedPartContent(code: z.infer<typeof lessonPartCodeSchema>, content: Record<string, unknown>, ctx: z.RefinementCtx, index: number): void {
  const path = (key: string) => [index, "content", key] as (string | number)[];
  const stringField = (key: string, max = 2_000) => {
    const value = content[key];
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) ctx.addIssue({ code: "custom", path: path(key), message: `${code}.content.${key} must be a non-empty string` });
    return typeof value === "string" ? value.trim() : "";
  };
  const stringList = (key: string, min: number, max: number) => {
    const value = content[key];
    if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => typeof item !== "string" || !item.trim())) {
      ctx.addIssue({ code: "custom", path: path(key), message: `${code}.content.${key} must contain ${min === max ? min : `${min}-${max}`} non-empty strings` });
      return [] as string[];
    }
    return value.map((item) => String(item).trim());
  };
  const choiceQuestion = (bodyKey: "audio" | "text") => {
    stringField(bodyKey, 4_000);
    stringField("prompt", 1_000);
    const options = stringList("options", 4, 4);
    const answer = stringField("answer", 500);
    if (options.length === 4 && answer && !options.includes(answer)) ctx.addIssue({ code: "custom", path: path("answer"), message: "answer must exactly match one option" });
  };

  switch (code) {
    // This is a display summary assembled from 2-4 individually bounded
    // objective items, so it must not inherit one item's 500-character cap.
    case "objective": stringField("text", 2_000); return;
    case "instruction": stringList("steps", 3, 5); return;
    case "vocabulary": {
      const items = content.items;
      if (!Array.isArray(items) || items.length !== 3) {
        ctx.addIssue({ code: "custom", path: path("items"), message: "vocabulary.content.items must contain exactly 3 words" });
        return;
      }
      for (const [itemIndex, raw] of items.entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          ctx.addIssue({ code: "custom", path: [...path("items"), itemIndex], message: "vocabulary item must be an object" });
          continue;
        }
        const item = raw as Record<string, unknown>;
        for (const key of ["word", "pronunciation", "meaning", "imageQuery"] as const) {
          const value = item[key];
          if (typeof value !== "string" || !value.trim()) ctx.addIssue({ code: "custom", path: [...path("items"), itemIndex, key], message: `${key} is required` });
        }
        const collocations = item.collocations;
        if (!Array.isArray(collocations) || collocations.length !== 3 || collocations.some((value) => typeof value !== "string" || !value.trim())) ctx.addIssue({ code: "custom", path: [...path("items"), itemIndex, "collocations"], message: "exactly 3 collocations are required" });
        for (const key of ["family", "synonyms", "antonyms"] as const) {
          const value = item[key];
          if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) ctx.addIssue({ code: "custom", path: [...path("items"), itemIndex, key], message: `${key} must be an array of word objects` });
        }
        const umbrella = item.umbrella;
        if (!umbrella || typeof umbrella !== "object" || Array.isArray(umbrella)) ctx.addIssue({ code: "custom", path: [...path("items"), itemIndex, "umbrella"], message: "umbrella word is required" });
      }
      return;
    }
    case "grammar": {
      const unavailable = content.hidden === true
        && content.status === "unavailable"
        && (content.reason === "no_suitable_content" || content.reason === "insufficient_evidence");
      if (unavailable) return;
      stringField("formula", 300); stringField("usage", 1_000); stringList("examples", 2, 3); return;
    }
    case "pronunciation": {
      stringField("focus", 100); stringField("tip", 500);
      const words = content.words;
      if (!Array.isArray(words) || words.length !== 3 || words.some((item) => !item || typeof item !== "object" || Array.isArray(item))) ctx.addIssue({ code: "custom", path: path("words"), message: "exactly 3 pronunciation word objects are required" });
      return;
    }
    case "listening": choiceQuestion("audio"); return;
    case "reading": choiceQuestion("text"); return;
    case "writing": {
      const type = stringField("type", 20);
      if (!new Set(["fill", "mcq", "write"]).has(type)) ctx.addIssue({ code: "custom", path: path("type"), message: "writing.type must be fill, mcq or write" });
      stringField("prompt", 1_000); stringField("answer", 1_000);
      if (type === "mcq") stringList("options", 4, 4);
      return;
    }
    case "word_class":
    case "word_use": {
      stringField("prompt", 1_000);
      const options = stringList("options", 4, 4);
      const answer = stringField("answer", 500);
      if (options.length === 4 && answer && !options.includes(answer)) ctx.addIssue({ code: "custom", path: path("answer"), message: "answer must exactly match one option" });
      return;
    }
    case "speaking": stringField("prompt", 1_000); stringField("answer", 500); return;
  }
}

const generatedLessonSchema = z.object({
  dayNumber: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(60).refine(isGrammarPatternTitle, {
    message: "Lesson title must be a short grammar pattern or sentence frame, not a descriptive phrase"
  }),
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
  plan: z.array(z.string().trim().max(500)).length(5).optional(),
  lessonCount: z.literal(5)
});

export const weeklyLessonDayInputSchema = weeklyLessonsInputSchema
  .omit({ plan: true, lessonCount: true })
  .extend({
    dayNumber: z.number().int().min(1).max(5),
    lessonFocus: z.string().trim().min(1).max(500),
    allLessonFocuses: z.array(z.string().trim().min(1).max(500)).length(5),
    dayContract: z.object({
      version: z.literal("weekly-day-contract-v1"),
      weekNumber: z.number().int().min(1).max(52),
      cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
      learnerLanguage: z.enum(["Vietnamese-supported English", "English except Vietnamese vocabulary meanings"]),
      difficultyLane: z.string().trim().min(1),
      weekContext: z.object({
        topic: z.string().trim().min(1),
        description: z.string(),
        objectives: z.string(),
        keyVocabHint: z.string()
      }).strict(),
      day: z.object({
        dayNumber: z.number().int().min(1).max(5),
        lessonFocus: z.string().trim().min(1).max(500)
      }).strict(),
      scopeRule: z.string().trim().min(1)
    }).strict().optional()
  });

const grammarContentTypeSchema = z.enum([
  "grammar_rule", "sentence_pattern", "usage_rule", "word_formation", "pronunciation_rule"
]);
export const weeklyLessonGrammarClassificationOutputSchema = z.object({
  status: z.enum(["classified", "no_suitable_content", "insufficient_evidence"]),
  contentType: grammarContentTypeSchema.nullable(),
  targetName: z.string().trim().min(1).max(200).nullable(),
  scope: z.string().trim().min(1).max(500).nullable(),
  support: z.enum(["explicit", "repeated", "incidental", "none"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.array(z.object({ sourceRef: z.string().trim().min(1), quote: z.string().trim().min(1).max(500) }).strict()).max(8),
  rejectedCandidates: z.array(z.object({ candidate: z.string().trim().min(1), reason: z.enum(["incidental_language", "unrelated_to_objective", "lower_priority", "vocabulary_only", "out_of_scope"]) }).strict()).max(20)
}).strict().superRefine((value, context) => {
  if (value.status === "classified") {
    if (!value.contentType || !value.targetName || !value.scope || value.evidence.length === 0) context.addIssue({ code: "custom", message: "A classified grammar target requires type, target, scope and evidence" });
    if (!(["explicit", "repeated"] as const).includes(value.support as "explicit" | "repeated")) context.addIssue({ code: "custom", path: ["support"], message: "Incidental language cannot be the primary target" });
    if (value.confidence === "low") context.addIssue({ code: "custom", path: ["confidence"], message: "Low-confidence targets require review" });
  } else if (value.contentType !== null || value.targetName !== null || value.scope !== null) {
    context.addIssue({ code: "custom", message: "No-suitable and insufficient classifications cannot include a primary target" });
  }
});
export type WeeklyLessonGrammarClassificationOutput = z.infer<typeof weeklyLessonGrammarClassificationOutputSchema>;
export const weeklyLessonFoundationInputSchema = weeklyLessonDayInputSchema.extend({
  grammarClassification: weeklyLessonGrammarClassificationOutputSchema,
  pronunciationPlan: z.object({
    focus: z.string().trim().min(1),
    word1: z.object({ word: z.string().trim().min(1), ipa: z.string().trim().min(1) }).strict(),
    word2: z.object({ word: z.string().trim().min(1), ipa: z.string().trim().min(1) }).strict(),
    word3: z.object({ word: z.string().trim().min(1), ipa: z.string().trim().min(1) }).strict()
  }).strict()
});

export const weeklyLessonVocabularyInputSchema = weeklyLessonDayInputSchema.extend({
  grammarFormula: z.string().trim().min(1).max(300).nullable(),
  grammarExamples: z.array(z.string().trim().min(1).max(500)).length(2).nullable(),
  excludedVocabulary: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  forbiddenVocabulary: z.array(z.string().trim().min(1).max(100)).max(30).optional()
});

const weeklyLessonSkillsInputBaseSchema = weeklyLessonVocabularyInputSchema.extend({
  vocabularyWords: z.array(z.string().trim().min(1).max(100)).length(3),
  generationConstraints: z.object({
    learnerLanguage: z.enum(["vi", "en"]),
    writingType: z.enum(["mcq", "write"]),
    listeningWordMin: z.number().int().positive(),
    listeningWordMax: z.number().int().positive(),
    readingWordMin: z.number().int().positive(),
    readingWordMax: z.number().int().positive(),
    speakingAnswerWordMax: z.number().int().positive(),
    inferenceRequired: z.boolean(),
    speakingConstraintCount: z.number().int().nonnegative()
  }).strict()
});

export const weeklyLessonLengthRepairPathSchema = z.enum(["listening.body", "reading.body", "speaking.answer"]);
export const weeklyLessonLengthRepairInputSchema = z.object({
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  lessonFocus: z.string().trim().min(1).max(300),
  repairs: z.array(z.object({
    path: weeklyLessonLengthRepairPathSchema,
    targetWordCount: z.number().int().min(1).max(160),
    allowedWordMin: z.number().int().min(1).max(160),
    allowedWordMax: z.number().int().min(1).max(160),
    originalText: z.string().trim().min(1).max(4_000),
    prompt: z.string().trim().min(1).max(1_000),
    answer: z.string().trim().min(1).max(1_000)
  }).strict()).min(1).max(3)
}).strict();
const weeklyLessonLengthRepairTokensSchema = z.preprocess(
  (value) => Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" ? item.trim().split(/\s+/u).filter(Boolean) : [item])
    : value,
  z.array(z.string().trim().min(1).regex(/^\S+$/u, "Each item must contain exactly one space-free token")).min(1).max(160)
);

export const weeklyLessonLengthRepairOutputSchema = z.object({
  listeningBody: weeklyLessonLengthRepairTokensSchema.nullable(),
  readingBody: weeklyLessonLengthRepairTokensSchema.nullable(),
  speakingAnswer: weeklyLessonLengthRepairTokensSchema.nullable()
}).strict();

const weeklyLessonsBaseOutputSchema = z.object({ lessons: z.array(generatedLessonSchema).length(5) });
export const weeklyLessonsOutputSchema = z.preprocess(normalizeWeeklyLessonTitles, weeklyLessonsBaseOutputSchema);
export type WeeklyLessonsTaskOutput = z.infer<typeof weeklyLessonsOutputSchema>;

const weeklyLessonDayBaseOutputSchema = z.object({ lesson: generatedLessonSchema });
export const weeklyLessonDayOutputSchema = z.preprocess((value) => {
  const parsed = parseModelJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const output = parsed as Record<string, unknown>;
  const normalized = normalizeWeeklyLessonTitles({ lessons: [output.lesson] });
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return parsed;
  const lessons = (normalized as { lessons?: unknown }).lessons;
  return { lesson: Array.isArray(lessons) ? lessons[0] : output.lesson };
}, weeklyLessonDayBaseOutputSchema);
export type WeeklyLessonDayTaskOutput = z.infer<typeof weeklyLessonDayOutputSchema>;

const strictWordSlotSchema = z.object({
  word: z.string().trim().min(1),
  ipa: z.string().trim().regex(/^\/.+\/$/u, "IPA must be enclosed in slashes")
});
const weeklyLessonObjectiveOutputSchema = z.object({
  title: z.string().trim().min(1),
  explanationLanguage: z.enum(["vi", "en"]),
  lesson_goal: z.string().trim().min(1).max(500),
  assessment_gap: z.string().trim().min(1).max(500).nullable(),
  items: z.array(z.object({
    id: z.string().trim().regex(/^[CL]\d+$/),
    type: z.enum(["content", "language"]),
    text: z.string().trim().min(1).max(500),
    action_verb: z.string().trim().min(1).max(80),
    target_language: z.array(z.string().trim().min(1).max(160)).min(1).max(10).nullable(),
    condition: z.string().trim().min(1).max(320),
    criterion: z.string().trim().min(1).max(320),
    assessed_by: z.string().trim().min(1).max(320),
    success_evidence: z.string().trim().min(1).max(500),
    assessmentCode: z.enum(["listening", "reading", "writing", "word_class", "word_use", "speaking"])
  }).strict().superRefine((item, context) => {
    if (item.type === "language" && !item.target_language?.length) {
      context.addIssue({ code: "custom", path: ["target_language"], message: "Language objectives require concrete target language" });
    }
    if (item.type === "content" && item.target_language !== null) {
      context.addIssue({ code: "custom", path: ["target_language"], message: "Content objectives use null target_language" });
    }
  })).min(2).max(4)
});

export const weeklyLessonObjectivesOutputSchema = z.object({ objective: weeklyLessonObjectiveOutputSchema });
export const weeklyLessonSkillsInputSchema = weeklyLessonSkillsInputBaseSchema.extend({
  lessonObjectives: weeklyLessonObjectiveOutputSchema.optional()
});

const weeklyLessonFoundationBodyBaseOutputSchema = z.object({
  title: z.string().trim().min(1).max(120).nullable(),
  durationMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  instruction: z.object({ title: z.string().trim().min(1), step1: z.string().trim().min(1), step2: z.string().trim().min(1), step3: z.string().trim().min(1) }),
  grammar: z.object({
    title: z.string().trim().min(1), contentType: grammarContentTypeSchema,
    targetName: z.string().trim().min(1).max(200), scope: z.string().trim().min(1).max(500),
    formula: z.string().trim().min(1), usage: z.string().trim().min(1),
    example1: z.string().trim().min(1), example2: z.string().trim().min(1)
  }).nullable(),
  pronunciation: z.object({
    title: z.string().trim().min(1), focus: z.string().trim().min(1), tip: z.string().trim().min(1),
    word1: strictWordSlotSchema, word2: strictWordSlotSchema, word3: strictWordSlotSchema
  })
}).superRefine((foundation, context) => {
  if (foundation.title && /^S\s*\+\s*V(?:\s*\+\s*O)?$/i.test(foundation.title)) {
    context.addIssue({ code: "custom", path: ["title"], message: "Title must name the concrete lesson focus" });
  }
});
export const weeklyLessonFoundationBodyOutputSchema = weeklyLessonFoundationBodyBaseOutputSchema;
export const weeklyLessonFoundationOutputSchema = z.object({
  objective: weeklyLessonObjectiveOutputSchema,
  title: z.string().trim().min(1).max(60).nullable(),
  durationMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  instruction: z.object({ title: z.string().trim().min(1), step1: z.string().trim().min(1), step2: z.string().trim().min(1), step3: z.string().trim().min(1) }),
  grammar: z.object({
    title: z.string().trim().min(1), contentType: grammarContentTypeSchema,
    targetName: z.string().trim().min(1).max(200), scope: z.string().trim().min(1).max(500),
    formula: z.string().trim().min(1), usage: z.string().trim().min(1),
    example1: z.string().trim().min(1), example2: z.string().trim().min(1)
  }).nullable(),
  pronunciation: z.object({
    title: z.string().trim().min(1), focus: z.string().trim().min(1), tip: z.string().trim().min(1),
    word1: strictWordSlotSchema, word2: strictWordSlotSchema, word3: strictWordSlotSchema
  })
}).superRefine((foundation, context) => {
  if (foundation.title && /^S\s*\+\s*V(?:\s*\+\s*O)?$/i.test(foundation.title)) {
    context.addIssue({ code: "custom", path: ["title"], message: "Title must name the concrete lesson focus" });
  }
});

export const lexicalRelationStatusSchema = z.enum([
  "provided",
  "no_natural_relation",
  "above_cefr_level",
  "generation_missed"
]);
export type LexicalRelationStatus = z.infer<typeof lexicalRelationStatusSchema>;
const strictVocabularyRelationSchema = z.object({ word: z.string().trim().min(1), type: z.string().trim().min(1), meaning: z.string().trim().min(1) });
const strictVocabularyLevelRelationSchema = z.object({
  word: z.string().trim().min(1), level: z.string().trim().min(1), note: z.string().trim().min(1),
  partOfSpeech: z.string().trim().min(1).max(40), sense: z.string().trim().min(1).max(240), example: z.string().trim().min(1).max(240)
});
const strictWordMeaningSchema = z.object({ word: z.string().trim().min(1), meaning: z.string().trim().min(1) });
const strictVocabularyItemSchema = z.object({
  word: z.string().trim().min(1), partOfSpeech: z.string().trim().min(1).max(40),
  pronunciation: z.string().trim().regex(/^\/.+\/$/), stress: z.string().trim().min(1),
  ttsText: z.string().trim().min(1), ssml: z.string().trim().regex(/^<speak>[\s\S]+<\/speak>$/),
  meaning: z.string().trim().min(1), imageQuery: z.string().trim().min(1),
  collocation1: z.string().trim().min(1), collocation2: z.string().trim().min(1), collocation3: z.string().trim().min(1),
  family1: strictVocabularyRelationSchema.nullable(), family2: strictVocabularyRelationSchema.nullable(),
  umbrellaWord: z.string().trim().min(1), umbrellaMeaning: z.string().trim().min(1),
  sibling1: strictWordMeaningSchema.nullable(), sibling2: strictWordMeaningSchema.nullable(), sibling3: strictWordMeaningSchema.nullable(),
  synonym1: strictVocabularyLevelRelationSchema.nullable(), synonym2: strictVocabularyLevelRelationSchema.nullable(),
  antonym1: strictVocabularyLevelRelationSchema.nullable(),
  relationStatus: lexicalRelationStatusSchema.nullable().optional(),
  synonymStatus: lexicalRelationStatusSchema.nullable().optional(),
  antonymStatus: lexicalRelationStatusSchema.nullable().optional()
}).superRefine((item, ctx) => {
  const word = item.word.toLocaleLowerCase("en-US");
  const collocations = [item.collocation1, item.collocation2, item.collocation3];
  if (new Set(collocations.map((value) => value.toLocaleLowerCase("en-US"))).size !== 3) {
    ctx.addIssue({ code: "custom", path: ["collocation1"], message: "The three examples must be different" });
  }
  if (normalizedText(spokenTextFromSsml(item.ssml)) !== normalizedText(item.ttsText)) {
    ctx.addIssue({ code: "custom", path: ["ssml"], message: "SSML must contain the exact TTS text" });
  }
  for (const [kind, relations] of [["synonym", [item.synonym1, item.synonym2]], ["antonym", [item.antonym1]]] as const) {
    for (const relation of relations) {
      if (!relation) continue;
      if (relation.partOfSpeech.toLocaleLowerCase("en-US") !== item.partOfSpeech.toLocaleLowerCase("en-US")) {
        ctx.addIssue({ code: "custom", path: [`${kind}1`, "partOfSpeech"], message: `${kind} must have the same part of speech` });
      }
      if (relation.word.toLocaleLowerCase("en-US") === word) {
        ctx.addIssue({ code: "custom", path: [`${kind}1`, "word"], message: `${kind} must be distinct from the target word` });
      }
    }
  }
});
export const weeklyLessonVocabularyOutputSchema = z.object({
  title: z.string().trim().min(1),
  word1: strictVocabularyItemSchema,
  word2: strictVocabularyItemSchema,
  word3: strictVocabularyItemSchema
});

const strictChoiceBaseSchema = z.object({
  title: z.string().trim().min(1), body: z.string().trim().min(1), prompt: z.string().trim().min(1),
  option1: z.string().trim().min(1), option2: z.string().trim().min(1), option3: z.string().trim().min(1), option4: z.string().trim().min(1),
  answer: z.string().trim().min(1), hint: z.string().trim().min(1),
  questionTranslation: z.string().trim().min(1), answerTranslation: z.string().trim().min(1)
});
function validateStrictChoice(value: { option1: string; option2: string; option3: string; option4: string; answer: string; hint: string }, context: z.RefinementCtx) {
  const options = [value.option1, value.option2, value.option3, value.option4];
  const normalized = options.map((option) => option.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim());
  if (new Set(normalized).size !== 4) context.addIssue({ code: "custom", path: ["option1"], message: "All four options must be distinct" });
  if (!options.includes(value.answer)) context.addIssue({ code: "custom", path: ["answer"], message: "Answer must exactly match one option" });
  const normalizedHint = ` ${normalizedText(value.hint)} `;
  const normalizedAnswer = ` ${normalizedText(value.answer)} `;
  if (normalizedAnswer.trim() && normalizedHint.includes(normalizedAnswer)) context.addIssue({ code: "custom", path: ["hint"], message: "Hint must not reveal the answer" });
}
const strictChoiceOutputSchema = strictChoiceBaseSchema.superRefine(validateStrictChoice);
const strictQuestionBaseSchema = strictChoiceBaseSchema.omit({ body: true });
const strictQuestionOutputSchema = strictQuestionBaseSchema.superRefine(validateStrictChoice);
const weeklyLessonSkillsBaseOutputSchema = z.object({
  listening: strictChoiceOutputSchema,
  reading: strictChoiceOutputSchema,
  writing: z.object({
    title: z.string().trim().min(1), type: z.enum(["fill", "mcq", "write"]), prompt: z.string().trim().min(1),
    option1: z.string().trim().nullable(), option2: z.string().trim().nullable(), option3: z.string().trim().nullable(), option4: z.string().trim().nullable(),
    answer: z.string().trim().min(1), hint: z.string().trim().min(1),
    questionTranslation: z.string().trim().min(1), answerTranslation: z.string().trim().min(1)
  }).superRefine((value, context) => {
    const options = [value.option1, value.option2, value.option3, value.option4].filter((option): option is string => option !== null);
    if (value.type === "fill" && (value.prompt.match(/___+/g)?.length ?? 0) !== 1) context.addIssue({ code: "custom", path: ["prompt"], message: "Fill writing requires exactly one blank" });
    if (value.type === "mcq" && (options.length !== 4 || new Set(options.map((option) => option.toLocaleLowerCase("en-US"))).size !== 4 || !options.includes(value.answer))) context.addIssue({ code: "custom", path: ["answer"], message: "Writing MCQ requires four distinct options and an exact key" });
    if (value.type === "write" && value.answer.trim().split(/\s+/).length < 2) context.addIssue({ code: "custom", path: ["answer"], message: "Open writing needs a model answer of at least two words" });
  }),
  wordClass: strictQuestionOutputSchema,
  wordUse: strictQuestionOutputSchema,
  speaking: z.object({
    title: z.string().trim().min(1), prompt: z.string().trim().min(1), answer: z.string().trim().min(1),
    hint: z.string().trim().min(1), questionTranslation: z.string().trim().min(1), answerTranslation: z.string().trim().min(1)
  })
});
export const weeklyLessonSkillsOutputSchema = weeklyLessonSkillsBaseOutputSchema.superRefine((value, context) => {
  if (value.listening.body.trim().toLocaleLowerCase("en-US") === value.reading.body.trim().toLocaleLowerCase("en-US")) {
    context.addIssue({ code: "custom", path: ["reading", "body"], message: "Reading content must differ from listening" });
  }
});
export const weeklyLessonComprehensionOutputSchema = weeklyLessonSkillsBaseOutputSchema
  .pick({ listening: true, reading: true })
  .superRefine((value, context) => {
    if (value.listening.body.trim().toLocaleLowerCase("en-US") === value.reading.body.trim().toLocaleLowerCase("en-US")) {
      context.addIssue({ code: "custom", path: ["reading", "body"], message: "Reading content must differ from listening" });
    }
  });
export const weeklyLessonLanguagePracticeOutputSchema = weeklyLessonSkillsBaseOutputSchema.pick({ writing: true, wordClass: true, wordUse: true });
export const weeklyLessonSpeakingOutputSchema = weeklyLessonSkillsBaseOutputSchema.pick({ speaking: true });
export const weeklyLessonListeningRepairOutputSchema = z.object({ listening: strictChoiceBaseSchema }).strict();
export const weeklyLessonReadingRepairOutputSchema = z.object({ reading: strictChoiceBaseSchema }).strict();
export const weeklyLessonWritingRepairOutputSchema = weeklyLessonSkillsBaseOutputSchema.pick({ writing: true });
export const weeklyLessonWordClassRepairOutputSchema = z.object({ wordClass: strictQuestionBaseSchema }).strict();
export const weeklyLessonWordUseRepairOutputSchema = z.object({ wordUse: strictQuestionBaseSchema }).strict();
export const weeklyLessonSpeakingRepairOutputSchema = weeklyLessonSkillsBaseOutputSchema.pick({ speaking: true });

const weeklyLessonExerciseCodeSchema = z.enum(["listening", "reading", "writing", "wordClass", "wordUse", "speaking"]);
const weeklyLessonReviewReasonSchema = z.enum([
  "multiple_valid_answers", "key_mismatch", "insufficient_context", "outside_taught_scope",
  "invalid_distractor", "hint_reveals_answer", "level_mismatch", "feedback_mismatch"
]);
/**
 * Reviewer finding category. The first four are defects that must be repaired;
 * cross_exercise_mismatch and style_preference are recorded as warnings;
 * self_withdrawn findings are discarded.
 */
export const weeklyLessonReviewCategorySchema = z.enum([
  "source_contradiction", "answer_key_mismatch", "objective_mismatch", "translation_mismatch",
  "cross_exercise_mismatch", "style_preference", "self_withdrawn"
]);
export const weeklyLessonReviewEvidenceSchema = z.object({
  path: z.string().trim().min(1).max(80),
  actual: z.string().trim().max(800),
  expected: z.string().trim().max(800)
}).strict();
export const weeklyLessonSkillsReviewInputSchema = weeklyLessonSkillsInputSchema.extend({
  skills: weeklyLessonSkillsOutputSchema
});
export const weeklyLessonSkillsReviewOutputSchema = z.object({
  status: z.enum(["approved", "needs_revision"]),
  findings: z.array(z.object({
    exerciseCode: weeklyLessonExerciseCodeSchema,
    reasonCode: weeklyLessonReviewReasonSchema,
    message: z.string().trim().min(1).max(800),
    category: weeklyLessonReviewCategorySchema.optional(),
    evidence: weeklyLessonReviewEvidenceSchema.optional()
  }).strict()).max(12),
  solvedAnswers: z.object({
    listening: z.string().trim().min(1), reading: z.string().trim().min(1), writing: z.string().trim().min(1),
    wordClass: z.string().trim().min(1), wordUse: z.string().trim().min(1)
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.status === "approved" && value.findings.length > 0) {
    context.addIssue({ code: "custom", path: ["findings"], message: "Approved reviews cannot contain findings" });
  }
  if (value.status === "needs_revision" && value.findings.length === 0) {
    context.addIssue({ code: "custom", path: ["findings"], message: "A revision decision requires at least one finding" });
  }
});

function normalizedText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function spokenTextFromSsml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Make the learner-facing title deterministic; model-generated headings are never authoritative. */
function normalizeWeeklyLessonTitles(value: unknown): unknown {
  value = parseModelJson(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const output = value as Record<string, unknown>;
  let rawLessons = parseModelJson(output.lessons);
  if (rawLessons && typeof rawLessons === "object" && !Array.isArray(rawLessons)) {
    const lessonObject = rawLessons as Record<string, unknown>;
    rawLessons = lessonObject.lessons ?? fixedSlotValues(lessonObject, ["day1", "day2", "day3", "day4", "day5"]);
  }
  if (!Array.isArray(rawLessons)) return value;
  return {
    ...output,
    lessons: rawLessons.map((rawLesson, lessonIndex) => {
      if (!rawLesson || typeof rawLesson !== "object" || Array.isArray(rawLesson)) return rawLesson;
      const lesson = rawLesson as Record<string, unknown>;
      const parts = normalizeLessonParts(lesson.parts);
      if (!Array.isArray(parts)) return lesson;
      const grammar = parts.find((part) => part && typeof part === "object" && !Array.isArray(part)
        && (part as Record<string, unknown>).code === "grammar") as Record<string, unknown> | undefined;
      const content = grammar?.content;
      const grammarContent = content && typeof content === "object" && !Array.isArray(content)
        ? content as Record<string, unknown> : {};
      const formula = typeof grammarContent.formula === "string" ? grammarContent.formula.trim() : "";
      const examples = Array.isArray(grammarContent.examples) ? grammarContent.examples : [];
      const title = [formula, ...examples.map(inferGrammarPatternFromExample), lesson.title]
        .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length <= 60 && isGrammarPatternTitle(candidate));
      return {
        ...lesson,
        dayNumber: lessonIndex + 1,
        parts,
        title: title?.trim() ?? inferGrammarPatternFromDescription(`${lesson.title ?? ""} ${formula} ${grammarContent.usage ?? ""}`)
      };
    })
  };
}

const lessonPartOrder = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;

function normalizeLessonParts(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return lessonPartOrder.map((code) => normalizeLessonPart(code, object[code]));
}

function normalizeLessonPart(code: typeof lessonPartOrder[number], value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const part = value as Record<string, unknown>;
  const rawContent = part.content;
  if (!rawContent || typeof rawContent !== "object" || Array.isArray(rawContent)) return { ...part, code };
  const content = { ...(rawContent as Record<string, unknown>) };

  if (code === "instruction") content.steps = fixedSlotValues(content.steps, ["step1", "step2", "step3"]);
  if (code === "grammar") content.examples = fixedSlotValues(content.examples, ["example1", "example2"]);
  if (code === "pronunciation") content.words = fixedSlotValues(content.words, ["word1", "word2", "word3"]);
  if (["listening", "reading", "word_class", "word_use"].includes(code)) {
    content.options = fixedSlotValues(content.options, ["option1", "option2", "option3", "option4"]);
  }
  if (code === "writing") {
    content.options = fixedSlotValues(content.options, ["option1", "option2", "option3", "option4"], true);
  }
  if (code === "vocabulary") {
    const items = fixedSlotValues(content.items, ["word1", "word2", "word3"]);
    content.items = Array.isArray(items) ? items.map(normalizeVocabularyItem) : items;
  }
  return { ...part, code, content };
}

function normalizeVocabularyItem(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = value as Record<string, unknown>;
  const umbrella = item.umbrella && typeof item.umbrella === "object" && !Array.isArray(item.umbrella)
    ? item.umbrella as Record<string, unknown> : undefined;
  return {
    ...item,
    collocations: fixedSlotValues(item.collocations, ["collocation1", "collocation2", "collocation3"]),
    family: fixedSlotValues(item.family, ["item1", "item2"], true),
    synonyms: fixedSlotValues(item.synonyms, ["item1", "item2"], true),
    antonyms: fixedSlotValues(item.antonyms, ["item1"], true),
    ...(umbrella
      ? { umbrella: { ...umbrella, siblings: fixedSlotValues(umbrella.siblings, ["item1", "item2", "item3"], true) } }
      : {})
  };
}

function fixedSlotValues(value: unknown, names: string[], omitNull = false): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const values = names.map((name) => object[name]);
  return omitNull ? values.filter((item) => item !== null && item !== undefined) : values;
}

function parseModelJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function inferGrammarPatternFromExample(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const example = value.trim().replace(/[.!?]+$/, "");
  if (!example) return undefined;
  if (/^(?:what|where|when|why|who|how)\b/i.test(example)) return "Wh- + auxiliary + S + V?";

  const words = example.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  if (words.length < 2) return undefined;
  const subject = /^(?:i|you|we|they|he|she|it|[A-Z][a-z]+)$/i.test(words[0]!);
  if (!subject) return undefined;
  const second = words[1]!.toLowerCase();
  if (["am", "is", "are", "was", "were"].includes(second)) return "S + be + complement";
  if (["can", "could", "will", "would", "should", "must", "may", "might"].includes(second)) return "S + modal + V";
  if (["have", "has", "had"].includes(second) && words.length > 2 && /(?:ed|en|known|done|made|seen|gone|been)$/i.test(words[2]!)) return "S + have/has + V3";
  if (["do", "does", "did"].includes(second)) return "Do/Does/Did + S + V?";
  return words.length > 2 ? "S + V + O" : "S + V";
}

function inferGrammarPatternFromDescription(value: string): string {
  const description = value.toLowerCase();
  if (/present\s+continuous|present\s+progressive/.test(description)) return "S + am/is/are + V-ing";
  if (/past\s+continuous|past\s+progressive/.test(description)) return "S + was/were + V-ing";
  if (/present\s+perfect/.test(description)) return "S + have/has + V3";
  if (/past\s+simple|simple\s+past/.test(description)) return "S + V2/ed";
  if (/future|be going to/.test(description)) return "S + will/be going to + V";
  if (/present\s+simple|simple\s+present|routine|habit/.test(description)) return "S + V(s)";
  if (/question|interrogative/.test(description)) return "Auxiliary + S + V?";
  return "S + V";
}

const strictObject = (required: string[], properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, required, properties
});
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const fixedSlots = (names: string[], schema: Record<string, unknown>, nullableItems = false) => strictObject(
  names,
  Object.fromEntries(names.map((name) => [name, nullableItems ? nullable(schema) : schema]))
);
const stringSchema = { type: "string" };

const foundationWordJsonSchema = strictObject(
  ["word", "ipa"],
  { word: stringSchema, ipa: stringSchema }
);

export const weeklyLessonGrammarClassificationOutputJsonSchema = strictObject(
  ["status", "contentType", "targetName", "scope", "support", "confidence", "evidence", "rejectedCandidates"],
  {
    status: { type: "string", enum: ["classified", "no_suitable_content", "insufficient_evidence"] },
    contentType: nullable({ type: "string", enum: ["grammar_rule", "sentence_pattern", "usage_rule", "word_formation", "pronunciation_rule"] }),
    targetName: nullable(stringSchema), scope: nullable(stringSchema),
    support: { type: "string", enum: ["explicit", "repeated", "incidental", "none"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    evidence: { type: "array", items: strictObject(["sourceRef", "quote"], { sourceRef: stringSchema, quote: stringSchema }) },
    rejectedCandidates: { type: "array", items: strictObject(["candidate", "reason"], {
      candidate: stringSchema,
      reason: { type: "string", enum: ["incidental_language", "unrelated_to_objective", "lower_priority", "vocabulary_only", "out_of_scope"] }
    }) }
  }
) satisfies Record<string, unknown>;

const weeklyLessonObjectiveJsonSchema = strictObject(["explanationLanguage", "lesson_goal", "assessment_gap", "items"], {
      explanationLanguage: { type: "string", enum: ["vi", "en"] },
      lesson_goal: stringSchema,
      assessment_gap: nullable(stringSchema),
      items: { type: "array", items: strictObject(
        ["type", "text", "action_verb", "target_language", "condition", "criterion", "assessed_by", "success_evidence", "assessmentCode"],
        {
          type: { type: "string", enum: ["content", "language"] },
          text: stringSchema, action_verb: stringSchema,
          target_language: nullable({ type: "array", items: stringSchema }),
          condition: stringSchema, criterion: stringSchema, assessed_by: stringSchema, success_evidence: stringSchema,
          assessmentCode: { type: "string", enum: ["listening", "reading", "writing", "word_class", "word_use", "speaking"] }
        }
      ) }
    });

export const weeklyLessonObjectivesOutputJsonSchema = strictObject(
  ["objective"],
  { objective: weeklyLessonObjectiveJsonSchema }
) satisfies Record<string, unknown>;

export const weeklyLessonFoundationBodyOutputJsonSchema = strictObject(
  ["title", "durationMinutes", "grammar", "pronunciation"],
  {
    title: nullable(stringSchema),
    durationMinutes: { type: "integer", enum: [5, 10, 15, 20] },
    grammar: nullable(strictObject(
      ["title", "contentType", "targetName", "scope", "formula", "usage", "example1", "example2"],
      {
        title: stringSchema,
        contentType: { type: "string", enum: ["grammar_rule", "sentence_pattern", "usage_rule", "word_formation", "pronunciation_rule"] },
        targetName: stringSchema, scope: stringSchema, formula: stringSchema, usage: stringSchema,
        example1: stringSchema, example2: stringSchema
      }
    )),
    pronunciation: strictObject(["tip"], { tip: stringSchema })
  }
) satisfies Record<string, unknown>;

export const weeklyLessonFoundationOutputJsonSchema = strictObject(
  ["title", "durationMinutes", "objective", "grammar", "pronunciation"],
  {
    ...(weeklyLessonFoundationBodyOutputJsonSchema.properties as Record<string, unknown>),
    objective: weeklyLessonObjectiveJsonSchema
  }
) satisfies Record<string, unknown>;

const compactVocabularyItemJsonSchema = strictObject(
  [
    "word", "partOfSpeech", "pronunciation", "stress", "ttsText", "ssml", "meaning", "imageQuery",
    "collocation1", "collocation2", "collocation3",
    "family1", "family2", "umbrellaWord", "umbrellaMeaning",
    "sibling1", "sibling2", "sibling3",
    "synonym1", "synonym2", "antonym1"
  ],
  {
    word: stringSchema, partOfSpeech: stringSchema, pronunciation: stringSchema, stress: stringSchema,
    ttsText: stringSchema, ssml: stringSchema, meaning: stringSchema, imageQuery: stringSchema,
    collocation1: stringSchema, collocation2: stringSchema, collocation3: stringSchema,
    family1: nullable({ $ref: "#/$defs/relation" }), family2: nullable({ $ref: "#/$defs/relation" }),
    umbrellaWord: stringSchema, umbrellaMeaning: stringSchema,
    sibling1: nullable({ $ref: "#/$defs/wordMeaning" }),
    sibling2: nullable({ $ref: "#/$defs/wordMeaning" }),
    sibling3: nullable({ $ref: "#/$defs/wordMeaning" }),
    synonym1: nullable({ $ref: "#/$defs/levelRelation" }),
    synonym2: nullable({ $ref: "#/$defs/levelRelation" }),
    antonym1: nullable({ $ref: "#/$defs/levelRelation" }),
    relationStatus: nullable({ type: "string", enum: ["provided", "no_natural_relation", "above_cefr_level", "generation_missed"] })
  }
);

export const weeklyLessonVocabularyOutputJsonSchema = {
  ...strictObject(
    ["title", "word1", "word2", "word3"],
    {
      title: stringSchema,
      word1: { $ref: "#/$defs/item" },
      word2: { $ref: "#/$defs/item" },
      word3: { $ref: "#/$defs/item" }
    }
  ),
  $defs: {
    item: compactVocabularyItemJsonSchema,
    relation: strictObject(["word", "type", "meaning"], { word: stringSchema, type: stringSchema, meaning: stringSchema }),
    levelRelation: strictObject(["word", "level", "note", "partOfSpeech", "sense", "example"], {
      word: stringSchema, level: stringSchema, note: stringSchema, partOfSpeech: stringSchema, sense: stringSchema, example: stringSchema
    }),
    wordMeaning: strictObject(["word", "meaning"], { word: stringSchema, meaning: stringSchema })
  }
} satisfies Record<string, unknown>;

const compactChoiceJsonSchema = (includeBody: boolean) => strictObject(
  includeBody
    ? ["title", "body", "prompt", "option1", "option2", "option3", "option4", "answer", "hint", "questionTranslation", "answerTranslation"]
    : ["title", "prompt", "option1", "option2", "option3", "option4", "answer", "hint", "questionTranslation", "answerTranslation"],
  {
    title: stringSchema,
    ...(includeBody ? { body: stringSchema } : {}),
    prompt: stringSchema,
    option1: stringSchema, option2: stringSchema, option3: stringSchema, option4: stringSchema,
    answer: stringSchema, hint: stringSchema, questionTranslation: stringSchema, answerTranslation: stringSchema
  }
);

const compactWritingJsonSchema = strictObject(
      ["title", "type", "prompt", "option1", "option2", "option3", "option4", "answer", "hint", "questionTranslation", "answerTranslation"],
      {
        title: stringSchema, type: { type: "string", enum: ["fill", "mcq", "write"] }, prompt: stringSchema,
        option1: nullable(stringSchema), option2: nullable(stringSchema),
        option3: nullable(stringSchema), option4: nullable(stringSchema), answer: stringSchema,
        hint: stringSchema, questionTranslation: stringSchema, answerTranslation: stringSchema
      }
    );
const compactSpeakingJsonSchema = strictObject(
      ["title", "prompt", "answer", "hint", "questionTranslation", "answerTranslation"],
      { title: stringSchema, prompt: stringSchema, answer: stringSchema, hint: stringSchema, questionTranslation: stringSchema, answerTranslation: stringSchema }
    );

export const weeklyLessonComprehensionOutputJsonSchema = strictObject(
  ["listening", "reading"],
  { listening: compactChoiceJsonSchema(true), reading: compactChoiceJsonSchema(true) }
) satisfies Record<string, unknown>;
export const weeklyLessonLanguagePracticeOutputJsonSchema = strictObject(
  ["writing", "wordClass", "wordUse"],
  { writing: compactWritingJsonSchema, wordClass: compactChoiceJsonSchema(false), wordUse: compactChoiceJsonSchema(false) }
) satisfies Record<string, unknown>;
export const weeklyLessonSpeakingOutputJsonSchema = strictObject(
  ["speaking"],
  { speaking: compactSpeakingJsonSchema }
) satisfies Record<string, unknown>;

export const weeklyLessonListeningRepairOutputJsonSchema = strictObject(
  ["listening"],
  { listening: compactChoiceJsonSchema(true) }
) satisfies Record<string, unknown>;
export const weeklyLessonReadingRepairOutputJsonSchema = strictObject(
  ["reading"],
  { reading: compactChoiceJsonSchema(true) }
) satisfies Record<string, unknown>;
export const weeklyLessonWritingRepairOutputJsonSchema = strictObject(
  ["writing"],
  { writing: compactWritingJsonSchema }
) satisfies Record<string, unknown>;
export const weeklyLessonWordClassRepairOutputJsonSchema = strictObject(
  ["wordClass"],
  { wordClass: compactChoiceJsonSchema(false) }
) satisfies Record<string, unknown>;
export const weeklyLessonWordUseRepairOutputJsonSchema = strictObject(
  ["wordUse"],
  { wordUse: compactChoiceJsonSchema(false) }
) satisfies Record<string, unknown>;
export const weeklyLessonSpeakingRepairOutputJsonSchema = strictObject(
  ["speaking"],
  { speaking: compactSpeakingJsonSchema }
) satisfies Record<string, unknown>;

export const weeklyLessonLengthRepairOutputJsonSchema = strictObject(
  ["listeningBody", "readingBody", "speakingAnswer"],
  {
    listeningBody: nullable({ type: "array", items: { type: "string" } }),
    readingBody: nullable({ type: "array", items: { type: "string" } }),
    speakingAnswer: nullable({ type: "array", items: { type: "string" } })
  }
) satisfies Record<string, unknown>;

export const weeklyLessonSkillsOutputJsonSchema = strictObject(
  ["listening", "reading", "writing", "wordClass", "wordUse", "speaking"],
  {
    listening: compactChoiceJsonSchema(true),
    reading: compactChoiceJsonSchema(true),
    writing: compactWritingJsonSchema,
    wordClass: compactChoiceJsonSchema(false),
    wordUse: compactChoiceJsonSchema(false),
    speaking: compactSpeakingJsonSchema
  }
) satisfies Record<string, unknown>;

export const weeklyLessonSkillsReviewOutputJsonSchema = strictObject(
  ["status", "findings", "solvedAnswers"],
  {
    status: { type: "string", enum: ["approved", "needs_revision"] },
    findings: { type: "array", items: strictObject(["exerciseCode", "reasonCode", "category", "message", "evidence"], {
      exerciseCode: { type: "string", enum: ["listening", "reading", "writing", "wordClass", "wordUse", "speaking"] },
      reasonCode: { type: "string", enum: [
        "multiple_valid_answers", "key_mismatch", "insufficient_context", "outside_taught_scope",
        "invalid_distractor", "hint_reveals_answer", "level_mismatch", "feedback_mismatch"
      ] },
      category: { type: "string", enum: [
        "source_contradiction", "answer_key_mismatch", "objective_mismatch", "translation_mismatch",
        "cross_exercise_mismatch", "style_preference", "self_withdrawn"
      ] },
      message: stringSchema,
      evidence: strictObject(["path", "actual", "expected"], { path: stringSchema, actual: stringSchema, expected: stringSchema })
    }) },
    solvedAnswers: strictObject(["listening", "reading", "writing", "wordClass", "wordUse"], {
      listening: stringSchema, reading: stringSchema, writing: stringSchema, wordClass: stringSchema, wordUse: stringSchema
    })
  }
) satisfies Record<string, unknown>;

const vocabularyRelationJsonSchema = strictObject(
  ["word", "type", "meaning"],
  { word: stringSchema, type: stringSchema, meaning: stringSchema }
);
const vocabularyLevelRelationJsonSchema = strictObject(
  ["word", "level", "note"],
  { word: stringSchema, level: stringSchema, note: stringSchema }
);
const wordMeaningJsonSchema = strictObject(
  ["word", "meaning"],
  { word: stringSchema, meaning: stringSchema }
);
const optionSlotsJsonSchema = fixedSlots(["option1", "option2", "option3", "option4"], stringSchema);
const nullableOptionSlotsJsonSchema = fixedSlots(["option1", "option2", "option3", "option4"], stringSchema, true);
const lessonPartJsonSchema = (content: Record<string, unknown>) => strictObject(
  ["title", "content"],
  { title: stringSchema, content }
);
const choiceJsonSchema = (bodyKey: "audio" | "text") => strictObject(
  [bodyKey, "prompt", "options", "answer"],
  { [bodyKey]: stringSchema, prompt: stringSchema, options: optionSlotsJsonSchema, answer: stringSchema }
);

const weeklyLessonJsonSchema = strictObject(
  ["title", "durationMinutes", "parts"],
  {
    title: { type: "string", description: "Short grammar formula copied from parts.grammar.content.formula; never a descriptive topic label." },
    durationMinutes: { type: "integer", enum: [5, 10, 15, 20] },
    parts: strictObject(
      [...lessonPartOrder],
      {
        objective: lessonPartJsonSchema(strictObject(["text"], { text: stringSchema })),
        instruction: lessonPartJsonSchema(strictObject(["steps"], {
          steps: fixedSlots(["step1", "step2", "step3"], stringSchema)
        })),
        vocabulary: lessonPartJsonSchema(strictObject(["items"], {
          items: fixedSlots(["word1", "word2", "word3"], { $ref: "#/$defs/vocabularyItem" })
        })),
        grammar: lessonPartJsonSchema(strictObject(["formula", "usage", "examples"], {
          formula: stringSchema,
          usage: stringSchema,
          examples: fixedSlots(["example1", "example2"], stringSchema)
        })),
        pronunciation: lessonPartJsonSchema(strictObject(["focus", "tip", "words"], {
          focus: stringSchema,
          tip: stringSchema,
          words: fixedSlots(["word1", "word2", "word3"], strictObject(["word", "ipa"], { word: stringSchema, ipa: stringSchema }))
        })),
        listening: lessonPartJsonSchema(choiceJsonSchema("audio")),
        reading: lessonPartJsonSchema(choiceJsonSchema("text")),
        writing: lessonPartJsonSchema(strictObject(["type", "prompt", "options", "answer"], {
          type: { type: "string", enum: ["fill", "mcq", "write"] },
          prompt: stringSchema,
          options: nullableOptionSlotsJsonSchema,
          answer: stringSchema
        })),
        word_class: lessonPartJsonSchema(strictObject(["prompt", "options", "answer"], {
          prompt: stringSchema, options: optionSlotsJsonSchema, answer: stringSchema
        })),
        word_use: lessonPartJsonSchema(strictObject(["prompt", "options", "answer"], {
          prompt: stringSchema, options: optionSlotsJsonSchema, answer: stringSchema
        })),
        speaking: lessonPartJsonSchema(strictObject(["prompt", "answer"], { prompt: stringSchema, answer: stringSchema }))
      }
    )
  }
);

const weeklyLessonVocabularyItemJsonSchema = strictObject(
  ["word", "pronunciation", "meaning", "imageQuery", "collocations", "family", "umbrella", "synonyms", "antonyms"],
  {
    word: stringSchema,
    pronunciation: stringSchema,
    meaning: stringSchema,
    imageQuery: stringSchema,
    collocations: fixedSlots(["collocation1", "collocation2", "collocation3"], stringSchema),
    family: fixedSlots(["item1", "item2"], vocabularyRelationJsonSchema, true),
    umbrella: strictObject(["word", "meaning", "siblings"], {
      word: stringSchema,
      meaning: stringSchema,
      siblings: fixedSlots(["item1", "item2", "item3"], wordMeaningJsonSchema, true)
    }),
    synonyms: fixedSlots(["item1", "item2"], vocabularyLevelRelationJsonSchema, true),
    antonyms: fixedSlots(["item1"], vocabularyLevelRelationJsonSchema, true)
  }
);

const weeklyLessonJsonDefinitions = {
  lesson: weeklyLessonJsonSchema,
  vocabularyItem: weeklyLessonVocabularyItemJsonSchema
};

export const weeklyLessonsOutputJsonSchema = {
  ...strictObject(["lessons"], {
    lessons: fixedSlots(["day1", "day2", "day3", "day4", "day5"], { $ref: "#/$defs/lesson" })
  }),
  $defs: weeklyLessonJsonDefinitions
} satisfies Record<string, unknown>;

export const weeklyLessonDayOutputJsonSchema = {
  ...strictObject(["lesson"], { lesson: { $ref: "#/$defs/lesson" } }),
  $defs: weeklyLessonJsonDefinitions
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
const weeklyLessonBlueprintPlanSchema = z.object({
  A1: z.array(z.string().trim().min(1).max(500)).length(5),
  A2: z.array(z.string().trim().min(1).max(500)).length(5),
  B1: z.array(z.string().trim().min(1).max(500)).length(5),
  B2: z.array(z.string().trim().min(1).max(500)).length(5),
  C1: z.array(z.string().trim().min(1).max(500)).length(5)
}).strict();
const weeklyLessonBlueprintSourcePlanSchema = z.object({
  A1: z.array(z.string().trim().min(1).max(500)).length(5).optional(),
  A2: z.array(z.string().trim().min(1).max(500)).length(5).optional(),
  B1: z.array(z.string().trim().min(1).max(500)).length(5).optional(),
  B2: z.array(z.string().trim().min(1).max(500)).length(5).optional(),
  C1: z.array(z.string().trim().min(1).max(500)).length(5).optional()
}).strict();
export const weeklyLessonPlanBlueprintInputSchema = z.object({
  weekNumber: z.number().int().min(1).max(52),
  topic: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000),
  objectives: z.string().trim().max(2_000),
  keyVocabHint: z.string().trim().max(1_000),
  plan: weeklyLessonBlueprintSourcePlanSchema
}).strict();
export const weeklyLessonPlanBlueprintOutputSchema = z.object({ plan: weeklyLessonBlueprintPlanSchema }).strict();
const blueprintPlanJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["A1", "A2", "B1", "B2", "C1"],
  properties: Object.fromEntries(["A1", "A2", "B1", "B2", "C1"].map((level) => [level, {
    type: "array", minItems: 5, maxItems: 5, items: { type: "string" }
  }]))
};
export const weeklyLessonPlanBlueprintOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["plan"],
  properties: { plan: blueprintPlanJsonSchema }
} satisfies Record<string, unknown>;
const weekSuggestionPlanSchema = z.partialRecord(
  cefrSuggestionLevelSchema,
  z.array(z.string().trim().min(1).max(500)).length(5)
).refine((plan) => Object.keys(plan).length > 0, { message: "At least one active CEFR plan is required" });
const weekSuggestionOptionSchema = z.object({
  topic: z.string().trim().min(1).max(60).refine((value) => value.split(/\s+/).filter(Boolean).length <= 6, { message: "Topic must be a concise learning title" }), description: z.string().trim().min(1).max(2_000),
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
          topic: { type: "string", maxLength: 60 }, description: { type: "string" }, objectives: { type: "string" }, keyVocabHint: { type: "string" },
          plan: { type: "object", minProperties: 1, additionalProperties: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } } }
        }
      } }
    } }
  } }
} satisfies Record<string, unknown>;

const assessmentObjectiveScoreSchema = z.object({
  score: z.number().min(0),
  maxScore: z.number().int().min(1),
  answered: z.number().int().min(0),
  total: z.number().int().min(1),
  groups: z.array(z.object({
    groupKey: z.string().trim().min(1),
    taskKeys: z.array(z.string().trim().min(1)).min(1)
  }))
});

export const assessmentGradingInputSchema = z.object({
  kind: z.enum(["placement", "level-up"]),
  objectiveScores: z.object({
    listening: assessmentObjectiveScoreSchema,
    reading: assessmentObjectiveScoreSchema
  }),
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
