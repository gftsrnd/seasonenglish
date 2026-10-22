import type { ContentLessonDraftInput, ContentWeekInput } from "@e4s/contracts";
import {
  weeklyLessonFoundationOutputSchema,
  weeklyLessonSkillsOutputSchema,
  weeklyLessonVocabularyOutputSchema,
  weeklyLessonsOutputSchema,
  type AiRunResult,
  type AiUsage
} from "@e4s/ai";
import { validateLessonDraft } from "@e4s/domain/content";
import type { AiTaskRunner } from "../coach/index.js";

const DAYS = [1, 2, 3, 4, 5] as const;
const FOUNDATION_OUTPUT_TOKEN_LIMIT = 1_500;
const VOCABULARY_OUTPUT_TOKEN_LIMIT = 2_500;
const SKILLS_OUTPUT_TOKEN_LIMIT = 2_000;

const FOUNDATION_CONTRACT = [
  "Generate only the compact foundation fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use lessonFocus as the exact teaching focus and allLessonFocuses only to avoid repetition.",
  "title must name the concrete sentence frame taught by lessonFocus (for example 'It is + adjective' or 'Could I + V?'); never use a generic placeholder such as 'S + V', 'S + V + O', or repeat the same title across days.",
  "objective.text must be one focused Vietnamese sentence of at most 12 words so it fits on one desktop line, without a 'Sau bài học, bạn có thể' preamble.",
  "grammar.formula must be a short usable grammar pattern or sentence frame, never a descriptive topic label.",
  "grammar.usage must be exactly one short Vietnamese sentence explaining when to use the pattern; do not append definitions, polarity notes, or a second sentence.",
  "Each grammar example must be one English sentence of at most 10 words. Do not add Vietnamese translations, parentheses, or a second sentence.",
  "Provide exactly three instruction steps, two grammar examples, and three pronunciation words.",
  "Keep the content CEFR-appropriate, practical, concise, and directly teachable. Return no prose outside the tool."
].join("\n");

const VOCABULARY_CONTRACT = [
  "Generate only the vocabulary fields required by the strict tool schema for ONE learner-facing lesson.",
  "Return exactly three useful words matching lessonFocus and grammarFormula.",
  "Never return a word listed in excludedVocabulary. The three words must also be distinct from each other and from vocabulary used by the other lessons in this week.",
  "Before answering, compare every generated word case-insensitively with excludedVocabulary and replace every match; a repeated word makes the entire response invalid.",
  "Each word needs a concise English partOfSpeech label such as noun, verb, or adjective, plus IPA, Vietnamese meaning, a concrete photographic imageQuery, and exactly three natural collocations.",
  "imageQuery must describe one clear real-world workplace photo with the target visible; no icons, logos, diagrams, screenshots, charts, or text-heavy images.",
  "Every word must include at least one real word-family relation, one umbrella category, and one real synonym so the learner controls are never empty.",
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

  const foundationResults = await Promise.all(baseInputs.map(async (input) => {
    const result = await runner.runTask("weekly_lesson_foundation", input, {
      systemPrompt: `${task.prompt}\n\n${FOUNDATION_CONTRACT}`,
      maxOutputTokens: FOUNDATION_OUTPUT_TOKEN_LIMIT
    });
    return { result, output: parseComponent(weeklyLessonFoundationOutputSchema, result.output, input.dayNumber, "foundation") };
  }));

  const usedVocabulary = new Set((options.excludedVocabulary ?? []).map(normalizeVocabularyKey).filter(Boolean));
  const promptHistory = [...usedVocabulary].slice(0, 80);
  const vocabularyResults: Array<{
    result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
    output: Vocabulary;
  }> = [];
  for (const [index, input] of baseInputs.entries()) {
    const foundation = foundationResults[index]!.output;
    const rejectedWords = new Set<string>();
    let accepted: (typeof vocabularyResults)[number] | undefined;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
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
      const output = parseComponent(weeklyLessonVocabularyOutputSchema, result.output, input.dayNumber, "vocabulary");
      const words = vocabularyWords(output);
      const local = new Set<string>();
      const duplicates = words.filter((word) => {
        const key = normalizeVocabularyKey(word);
        const duplicate = !key || usedVocabulary.has(key) || local.has(key);
        local.add(key);
        return duplicate;
      });
      if (duplicates.length === 0) {
        words.forEach((word) => usedVocabulary.add(normalizeVocabularyKey(word)));
        accepted = { result, output };
        break;
      }
      duplicates.forEach((word) => rejectedWords.add(normalizeVocabularyKey(word)));
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

function buildLesson(dayNumber: number, foundation: Foundation, vocabulary: Vocabulary, skills: Skills) {
  return {
    dayNumber,
    title: concreteLessonTitle(foundation),
    durationMinutes: foundation.durationMinutes,
    parts: [
      { code: "objective", title: foundation.objective.title, content: { text: compactWords(foundation.objective.text, 12) } },
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
