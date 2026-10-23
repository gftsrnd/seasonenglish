import type { ContentLessonDraftInput, ContentWeekInput } from "@e4s/contracts";
import {
  weeklyLessonFoundationOutputSchema,
  weeklyLessonGrammarClassificationOutputSchema,
  weeklyLessonSkillsOutputSchema,
  weeklyLessonVocabularyOutputSchema,
  weeklyLessonsOutputSchema,
  type AiRunResult,
  type AiUsage
} from "@e4s/ai";
import { validateLessonDraft, validateLessonObjectives } from "@e4s/domain/content";
import type { AiTaskRunner } from "../coach/index.js";

const DAYS = [1, 2, 3, 4, 5] as const;
const FOUNDATION_OUTPUT_TOKEN_LIMIT = 1_500;
const GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT = 1_000;
const VOCABULARY_OUTPUT_TOKEN_LIMIT = 2_500;
const SKILLS_OUTPUT_TOKEN_LIMIT = 2_000;

const FOUNDATION_CONTRACT = [
  "Generate only the compact foundation fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use lessonFocus as the exact teaching focus and allLessonFocuses only to avoid repetition.",
  "If grammarClassification.status is classified, use that narrow target without broadening its scope.",
  "If grammarClassification.status is no_suitable_content or insufficient_evidence, derive one narrow CEFR-appropriate sentence frame from lessonFocus and topic so the lesson remains teachable; do not invent an unrelated tense, exception, or advanced grammar rule.",
  "title must name the concrete sentence frame taught by lessonFocus (for example 'It is + adjective' or 'Could I + V?'); never use a generic placeholder such as 'S + V', 'S + V + O', or repeat the same title across days.",
  "objective.items must contain 2-4 measurable objectives. Exactly one is type content; the others are language objectives.",
  "Every objective text starts with SWBAT, uses an observable verb, and has an explicit condition, criterion, and assessmentCode. Cover both listening and speaking.",
  "Set explanationLanguage to vi for A1-A2 and en for B1-C1.",
  "grammar.formula must be a short usable grammar pattern or sentence frame, never a descriptive topic label.",
  "grammar.usage must be exactly one short Vietnamese sentence explaining when to use the pattern; do not append definitions, polarity notes, or a second sentence.",
  "Each grammar example must be one English sentence of at most 10 words. Do not add Vietnamese translations, parentheses, or a second sentence.",
  "Provide exactly three instruction steps, two grammar examples, and three pronunciation words.",
  "Keep the content CEFR-appropriate, practical, concise, and directly teachable. Return no prose outside the tool."
].join("\n");

const GRAMMAR_CLASSIFIER_CONTRACT = [
  "Classify the ONE explicitly taught language target before generating any grammar explanation.",
  "Allowed contentType values are grammar_rule, sentence_pattern, usage_rule, word_formation, pronunciation_rule.",
  "Use classified only when the objective, lessonFocus, or planned practice explicitly or repeatedly supports the target.",
  "Dialogue language that merely occurs once is incidental and must be rejected, not promoted into a lesson target.",
  "Use no_suitable_content for vocabulary-only lessons and insufficient_evidence when the evidence cannot support a reliable target.",
  "Keep scope narrow: do not add negative, question, tense, or exception forms that the evidence does not teach. Return only the strict tool output."
].join("\n");

const VOCABULARY_CONTRACT = [
  "Generate only the vocabulary fields required by the strict tool schema for ONE learner-facing lesson.",
  "Return exactly three useful words matching lessonFocus and grammarFormula.",
  "Never return a word listed in excludedVocabulary. The three words must also be distinct from each other and from vocabulary used by the other lessons in this week.",
  "Before answering, compare every generated word case-insensitively with excludedVocabulary and replace every match; a repeated word makes the entire response invalid.",
  "Each word needs partOfSpeech, slash-delimited IPA, stress, exact ttsText, matching <speak> SSML, Vietnamese meaning, a concrete photographic imageQuery, and exactly three natural collocations.",
  "imageQuery must describe one clear real-world workplace photo with the target visible; no icons, logos, diagrams, screenshots, charts, or text-heavy images.",
  "Every word must include at least one real word-family relation, one umbrella category, and one real synonym so the learner controls are never empty.",
  "Every synonym or antonym must use the same part of speech and same sense as the target, include a concise sense label, and include a contextual example containing that relation word. Derivations are not synonyms.",
  "Use null only for additional optional relations or an antonym that would be false or unnatural; never invent a fake relation. Return no prose outside the tool."
].join("\n");

const SKILLS_CONTRACT = [
  "Generate only the skill and exercise fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use grammarFormula, grammarExamples, and vocabularyWords consistently.",
  "For A1-A2, use only vocabulary and grammar supplied in the input, one task per item, and short common sentences.",
  "Listening body must be a natural 12-18 word audio script; reading body must be a coherent 18-30 word passage.",
  "Listening, reading, wordClass, and wordUse each need exactly four short English options of 1-5 words, and answer must exactly copy one option.",
  "Questions must be direct and no more than 10 English words. For A1-A2, writing must be fill or mcq, not an open writing task.",
  "Speaking prompt must be one short Vietnamese instruction. Speaking answer must be one easy English model sentence of no more than 10 words.",
  "Keep every item CEFR-appropriate, practical, and unambiguous. Return no prose outside the tool."
].join("\n");

export async function generateWeeklyLessons(
  week: ContentWeekInput,
  cefr: string,
  task: { prompt: string },
  runner: AiTaskRunner,
  options: { excludedVocabulary?: readonly string[] } = {}
) {
  const savedPlan = week.plan?.[cefr as keyof NonNullable<ContentWeekInput["plan"]>];
  const focuses = savedPlan?.length === 5
    ? savedPlan
    : DAYS.map((dayNumber) => `${week.topic} - day ${dayNumber}`);
  const startedAt = Date.now();
  const baseInputs = DAYS.map((dayNumber, index) => ({
    weekNumber: week.weekNumber,
    topic: week.topic,
    description: week.description,
    objectives: week.objectives,
    keyVocabHint: week.keyVocabHint,
    cefr,
    dayNumber,
    lessonFocus: focuses[index],
    allLessonFocuses: focuses
  }));

  const grammarClassificationResults = await Promise.all(baseInputs.map(async (input) => {
    const result = await runner.runTask("weekly_lesson_grammar_classifier", input, {
      systemPrompt: GRAMMAR_CLASSIFIER_CONTRACT,
      maxOutputTokens: GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT
    });
    const output = parseComponent(weeklyLessonGrammarClassificationOutputSchema, result.output, input.dayNumber, "grammarClassification");
    return { result, output };
  }));

  const foundationResults = await Promise.all(baseInputs.map(async (input, index) => {
    const resultInput = { ...input, grammarClassification: grammarClassificationResults[index]!.output };
    const result = await runner.runTask("weekly_lesson_foundation", resultInput, {
      systemPrompt: `${task.prompt}\n\n${FOUNDATION_CONTRACT}`,
      maxOutputTokens: FOUNDATION_OUTPUT_TOKEN_LIMIT
    });
    const output = normalizeFoundationObjectives(
      parseComponent(weeklyLessonFoundationOutputSchema, normalizeFoundationInstruction(result.output), input.dayNumber, "foundation"),
      input.cefr
    );
    const objectiveValidation = validateLessonObjectives({
      cefr: input.cefr as "A1" | "A2" | "B1" | "B2" | "C1",
      explanationLanguage: output.objective.explanationLanguage,
      objectives: output.objective.items,
      assessmentCodes: ["listening", "speaking"]
    });
    if (!objectiveValidation.valid) throwInvalid(
      objectiveValidation.issues.map((message) => ({ path: ["objective"], message })),
      `day${input.dayNumber}.foundation`
    );
    return { result, output };
  }));

  const usedVocabulary = new Set((options.excludedVocabulary ?? []).map(normalizeVocabularyKey).filter(Boolean));
  const promptHistory = [...usedVocabulary].slice(0, 80);
  type VocabularyResult = {
    result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
    output: Vocabulary;
  };
  const firstVocabularyResults = await Promise.all(baseInputs.map(async (input, index): Promise<VocabularyResult> => {
    const foundation = foundationResults[index]!.output;
    const result = await runner.runTask("weekly_lesson_vocabulary", {
      ...input,
      grammarFormula: foundation.grammar.formula,
      grammarExamples: [foundation.grammar.example1, foundation.grammar.example2],
      excludedVocabulary: promptHistory
    }, {
      systemPrompt: VOCABULARY_CONTRACT,
      maxOutputTokens: VOCABULARY_OUTPUT_TOKEN_LIMIT
    });
    return {
      result,
      output: parseComponent(weeklyLessonVocabularyOutputSchema, result.output, input.dayNumber, "vocabulary")
    };
  }));

  const vocabularyResults: VocabularyResult[] = [];
  for (const [index, input] of baseInputs.entries()) {
    const foundation = foundationResults[index]!.output;
    const rejectedWords = new Set<string>();
    let candidate = firstVocabularyResults[index]!;
    let accepted: VocabularyResult | undefined;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const words = vocabularyWords(candidate.output);
      const local = new Set<string>();
      const duplicates = words.filter((word) => {
        const key = normalizeVocabularyKey(word);
        const duplicate = !key || usedVocabulary.has(key) || local.has(key);
        local.add(key);
        return duplicate;
      });
      if (duplicates.length === 0) {
        words.forEach((word) => usedVocabulary.add(normalizeVocabularyKey(word)));
        accepted = candidate;
        break;
      }
      duplicates.forEach((word) => rejectedWords.add(normalizeVocabularyKey(word)));
      if (attempt === 8) break;
      const excludedVocabulary = [...new Set([
        ...promptHistory,
        ...vocabularyResults.flatMap(({ output }) => vocabularyWords(output)),
        ...rejectedWords
      ])].slice(-100);
      const result = await runner.runTask("weekly_lesson_vocabulary", {
        ...input,
        grammarFormula: foundation.grammar.formula,
        grammarExamples: [foundation.grammar.example1, foundation.grammar.example2],
        excludedVocabulary
      }, {
        systemPrompt: VOCABULARY_CONTRACT,
        maxOutputTokens: VOCABULARY_OUTPUT_TOKEN_LIMIT
      });
      candidate = {
        result,
        output: parseComponent(weeklyLessonVocabularyOutputSchema, result.output, input.dayNumber, "vocabulary")
      };
    }
    if (!accepted) {
      throwInvalid([{
        path: ["items"],
        message: "AI repeated vocabulary already used in this week, another week, or another CEFR level"
      }], `day${input.dayNumber}.vocabulary`);
    }
    vocabularyResults.push(accepted);
  }

  const skillsResults = await Promise.all(baseInputs.map(async (input, index) => {
    const foundation = foundationResults[index]!.output;
    const vocabulary = vocabularyResults[index]!.output;
    const result = await runner.runTask("weekly_lesson_skills", {
      ...input,
      grammarFormula: foundation.grammar.formula,
      grammarExamples: [foundation.grammar.example1, foundation.grammar.example2],
      vocabularyWords: [vocabulary.word1.word, vocabulary.word2.word, vocabulary.word3.word]
    }, {
      systemPrompt: SKILLS_CONTRACT,
      maxOutputTokens: SKILLS_OUTPUT_TOKEN_LIMIT
    });
    return { result, output: parseComponent(weeklyLessonSkillsOutputSchema, result.output, input.dayNumber, "skills") };
  }));

  const lessonDrafts = DAYS.map((dayNumber, index) => buildLesson(
    dayNumber,
    foundationResults[index]!.output,
    vocabularyResults[index]!.output,
    skillsResults[index]!.output
  ));
  const combined = weeklyLessonsOutputSchema.safeParse({ lessons: lessonDrafts });
  if (!combined.success) throwInvalid(combined.error.issues, "lessons");

  const lessons = combined.data.lessons.map((lesson, index) => ({
    ...lesson,
    title: concreteLessonTitle(foundationResults[index]!.output)
  })) as ContentLessonDraftInput[];
  const validation = validateLessonDraft(lessons);
  const days = [...new Set(lessons.map((lesson) => lesson.dayNumber))].sort((a, b) => a - b);
  if (!validation.valid || days.length !== 5 || days.some((day, index) => day !== index + 1)) {
    throw Object.assign(new Error("AI_LESSON_SET_INVALID"), {
      code: "AI_LESSON_SET_INVALID",
      issues: validation.issues
    });
  }

  const allResults = [
    ...grammarClassificationResults.map(({ result }) => result),
    ...foundationResults.map(({ result }) => result),
    ...vocabularyResults.map(({ result }) => result),
    ...skillsResults.map(({ result }) => result)
  ];
  const first = allResults[0]!.metadata;
  const result: AiRunResult<typeof combined.data> = {
    output: { lessons },
    metadata: {
      traceId: first.traceId,
      taskId: "weekly_lessons",
      provider: first.provider,
      model: first.model,
      attempts: allResults.reduce((total, item) => total + item.metadata.attempts, 0),
      latencyMs: Math.max(0, Date.now() - startedAt),
      inputHash: first.inputHash,
      schemaValid: true,
      usage: sumUsage(allResults.map((item) => item.metadata.usage))
    }
  };

  return { result, output: { lessons }, lessons };
}

function vocabularyWords(vocabulary: Vocabulary): string[] {
  return [vocabulary.word1.word, vocabulary.word2.word, vocabulary.word3.word];
}

function normalizeVocabularyKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function parseComponent<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  value: unknown,
  dayNumber: number,
  component: string
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throwInvalid(parsed.error.issues, `day${dayNumber}.${component}`);
  return parsed.data;
}

function throwInvalid(issues: Array<{ path: PropertyKey[]; message: string }>, prefix: string): never {
  throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
    code: "AI_OUTPUT_INVALID",
    issues: issues.slice(0, 8).map((issue) => ({
      path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
      message: issue.message
    }))
  });
}

type Foundation = ReturnType<typeof weeklyLessonFoundationOutputSchema.parse>;
type Vocabulary = ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>;
type Skills = ReturnType<typeof weeklyLessonSkillsOutputSchema.parse>;
type VocabularyItem = Vocabulary["word1"];

const OBSERVABLE_OBJECTIVE_VERB = /\b(?:identify|select|match|list|describe|ask|answer|write|say|give|use|compare|summarize|complete|respond|present|pronounce|produce|distinguish)\b/i;

function normalizeFoundationInstruction(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const foundation = value as Record<string, unknown>;
  const rawInstruction = foundation.instruction;
  const instruction = rawInstruction && typeof rawInstruction === "object" && !Array.isArray(rawInstruction)
    ? rawInstruction as Record<string, unknown>
    : {};
  const steps = Array.isArray(instruction.steps) ? instruction.steps : [];
  return {
    ...foundation,
    instruction: {
      ...instruction,
      title: nonEmptyString(instruction.title) ?? "Hướng dẫn",
      step1: nonEmptyString(instruction.step1) ?? nonEmptyString(steps[0]) ?? "Đọc mục tiêu và mẫu câu trọng tâm của bài.",
      step2: nonEmptyString(instruction.step2) ?? nonEmptyString(steps[1]) ?? "Ôn từ vựng rồi luyện nghe, đọc và nói theo hướng dẫn.",
      step3: nonEmptyString(instruction.step3) ?? nonEmptyString(steps[2]) ?? "Hoàn thành các bài tập rồi kiểm tra đáp án."
    }
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeFoundationObjectives(foundation: Foundation, cefr: string): Foundation {
  const items = foundation.objective.items.map((objective) => ({
    ...objective,
    text: normalizeObjectiveText(objective.text)
  }));
  if (items.filter(({ type }) => type === "content").length !== 1) {
    items.forEach((objective, index) => { objective.type = index === 0 ? "content" : "language"; });
  }
  const mapped = new Set(items.map(({ assessmentCode }) => assessmentCode));
  if (!mapped.has("listening") && items[0]) items[0].assessmentCode = "listening";
  if (!mapped.has("speaking") && items[1]) items[1].assessmentCode = "speaking";
  return {
    ...foundation,
    objective: {
      ...foundation.objective,
      explanationLanguage: cefr === "A1" || cefr === "A2" ? "vi" : "en",
      items
    }
  };
}

function normalizeObjectiveText(value: string): string {
  const body = value.trim().replace(/^SWBAT\s+/i, "");
  const text = `SWBAT ${body}`;
  return OBSERVABLE_OBJECTIVE_VERB.test(text) ? text : `SWBAT use English to ${body}`;
}

function buildLesson(dayNumber: number, foundation: Foundation, vocabulary: Vocabulary, skills: Skills) {
  return {
    dayNumber,
    title: concreteLessonTitle(foundation),
    durationMinutes: foundation.durationMinutes,
    parts: [
      { code: "objective", title: foundation.objective.title, content: {
        text: foundation.objective.items.map(({ text }) => text).join(" "),
        explanationLanguage: foundation.objective.explanationLanguage,
        items: foundation.objective.items
      } },
      {
        code: "instruction", title: foundation.instruction.title,
        content: { steps: [foundation.instruction.step1, foundation.instruction.step2, foundation.instruction.step3] }
      },
      {
        code: "vocabulary", title: vocabulary.title,
        content: { items: [vocabulary.word1, vocabulary.word2, vocabulary.word3].map(toVocabularyItem) }
      },
      {
        code: "grammar", title: foundation.grammar.title,
        content: {
          formula: foundation.grammar.formula,
          usage: firstSentence(foundation.grammar.usage),
          examples: [compactEnglishExample(foundation.grammar.example1), compactEnglishExample(foundation.grammar.example2)]
        }
      },
      {
        code: "pronunciation", title: foundation.pronunciation.title,
        content: {
          focus: foundation.pronunciation.focus,
          tip: foundation.pronunciation.tip,
          words: [foundation.pronunciation.word1, foundation.pronunciation.word2, foundation.pronunciation.word3]
        }
      },
      { code: "listening", title: skills.listening.title, content: toChoice(skills.listening, "audio") },
      { code: "reading", title: skills.reading.title, content: toChoice(skills.reading, "text") },
      {
        code: "writing", title: skills.writing.title,
        content: {
          type: skills.writing.type,
          prompt: skills.writing.prompt,
          options: compact([skills.writing.option1, skills.writing.option2, skills.writing.option3, skills.writing.option4]),
          answer: skills.writing.answer
        }
      },
      { code: "word_class", title: skills.wordClass.title, content: toQuestion(skills.wordClass) },
      { code: "word_use", title: skills.wordUse.title, content: toQuestion(skills.wordUse) },
      { code: "speaking", title: skills.speaking.title, content: { prompt: skills.speaking.prompt, answer: skills.speaking.answer } }
    ]
  };
}

function concreteLessonTitle(foundation: Foundation): string {
  const title = foundation.title.trim();
  if (!/^S\s*\+\s*V(?:\s*\+\s*O)?$/i.test(title)) return title;
  return foundation.grammar.example1.trim().replace(/[.!?]+$/, "").slice(0, 60);
}

function compactWords(value: string, limit: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? value.trim() : `${words.slice(0, limit).join(" ").replace(/[,:;.!?]+$/, "")}.`;
}

function firstSentence(value: string): string {
  return value.trim().match(/^.*?[.!?](?=\s|$)/)?.[0] ?? value.trim();
}

function compactEnglishExample(value: string): string {
  const withoutTranslation = value.replace(/\s*\([^)]*[À-ỹ][^)]*\)\s*$/iu, "").trim();
  return compactWords(firstSentence(withoutTranslation), 10);
}

function toVocabularyItem(item: VocabularyItem) {
  return {
    word: item.word,
    type: item.partOfSpeech,
    pronunciation: item.pronunciation,
    stress: item.stress,
    ttsText: item.ttsText,
    ssml: item.ssml,
    meaning: item.meaning,
    imageQuery: item.imageQuery,
    collocations: [item.collocation1, item.collocation2, item.collocation3],
    family: compact([item.family1, item.family2]),
    umbrella: {
      word: item.umbrellaWord,
      meaning: item.umbrellaMeaning,
      siblings: compact([item.sibling1, item.sibling2, item.sibling3])
    },
    synonyms: compact([item.synonym1, item.synonym2]),
    antonyms: compact([item.antonym1])
  };
}

function toChoice(value: Skills["listening"] | Skills["reading"], bodyKey: "audio" | "text") {
  return {
    [bodyKey]: value.body,
    prompt: value.prompt,
    options: [value.option1, value.option2, value.option3, value.option4],
    answer: value.answer
  };
}

function toQuestion(value: Skills["wordClass"] | Skills["wordUse"]) {
  return {
    prompt: value.prompt,
    options: [value.option1, value.option2, value.option3, value.option4],
    answer: value.answer
  };
}

function compact<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null);
}

function sumUsage(usages: AiUsage[]): AiUsage {
  const sum = (key: keyof AiUsage) => usages.reduce((total, usage) => total + (usage[key] ?? 0), 0);
  const has = (key: keyof AiUsage) => usages.some((usage) => usage[key] !== undefined);
  return {
    ...(has("inputTokens") ? { inputTokens: sum("inputTokens") } : {}),
    ...(has("outputTokens") ? { outputTokens: sum("outputTokens") } : {}),
    ...(has("totalTokens") ? { totalTokens: sum("totalTokens") } : {})
  };
}
