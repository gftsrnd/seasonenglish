import type { ContentLessonDraftInput, ContentWeekInput } from "@e4s/contracts";
import {
  weeklyLessonFoundationOutputSchema,
  weeklyLessonGrammarClassificationOutputSchema,
  weeklyLessonDayOutputSchema,
  weeklyLessonSkillsOutputSchema,
  weeklyLessonVocabularyOutputSchema,
  type AiRunResult,
  type AiTaskRunner,
  type AiUsage
} from "@e4s/ai";
import { validateLessonDraft, validateLessonObjectives } from "@e4s/domain/content";

const DAYS = [1, 2, 3, 4, 5] as const;
const FOUNDATION_OUTPUT_TOKEN_LIMIT = 1_500;
const GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT = 1_000;
const VOCABULARY_OUTPUT_TOKEN_LIMIT = 2_500;
const SKILLS_OUTPUT_TOKEN_LIMIT = 2_000;
const OBJECTIVE_VERBS_BY_LEVEL = {
  A1: "identify, select, match, name, point to, repeat, say, ask, answer, give, use",
  A2: "ask, answer, describe, write, confirm, request, apologize, arrange, complete",
  B1: "explain, describe, respond, give reasons, summarize, clarify, report, write, suggest, compare",
  B2: "justify, negotiate, handle, propose, compare, recommend, paraphrase, de-escalate, present, persuade, adapt",
  C1: "persuade, mediate, critique, synthesize, reframe, decline, lead, tailor"
} as const;

const FOUNDATION_CONTRACT = [
  "Generate only the compact foundation fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use lessonFocus as the exact teaching focus and allLessonFocuses only to avoid repetition.",
  "If grammarClassification.status is classified, use that narrow target without broadening its scope.",
  "If grammarClassification.status is no_suitable_content or insufficient_evidence, do not invent a grammar target: set title to null and grammar to null. The grammar section will be hidden from learners.",
  "title must name the concrete sentence frame taught by lessonFocus (for example 'It is + adjective' or 'Could I + V?'); never use a generic placeholder such as 'S + V', 'S + V + O', or repeat the same title across days.",
  "objective.items must contain 2-4 measurable objectives. Exactly one is type content; the others are language objectives.",
  "Every objective text uses the prompt-approved learner-facing opener: 'Sau bài học, bạn có thể' for A1-A2 or 'By the end of this lesson, you will be able to' for B1-C1. Use one observable verb and include an explicit condition, criterion, and assessmentCode. Cover both listening and speaking.",
  "Use the level verb bank exactly: A1 identify/select/match/name/point to/repeat/say/ask/answer/give/use; A2 ask/answer/describe/write/confirm/request/apologize/arrange/complete; B1 explain/describe/respond/give reasons/summarize/clarify/report/write/suggest/compare; For B2 objectives, use only justify/negotiate/handle/propose/compare/recommend/paraphrase/de-escalate/present/persuade/adapt; C1 persuade/mediate/critique/synthesize/reframe/decline/lead/tailor.",
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
  "Return exactly three useful words matching lessonFocus and, only when non-null, grammarFormula.",
  "A null grammarFormula and grammarExamples mean the grammar classifier abstained. Do not invent a grammar target; generate vocabulary from lessonFocus.",
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
  "Use vocabularyWords consistently. Use grammarFormula and grammarExamples only when they are non-null; null means the classifier abstained, so do not invent grammar.",
  "For A1-A2, use only vocabulary and grammar supplied in the input, one task per item, and short common sentences.",
  "Listening body must be a natural 12-18 word audio script; reading body must be a coherent 18-30 word passage.",
  "Listening, reading, wordClass, and wordUse each need exactly four short English options of 1-5 words, and answer must exactly copy one option.",
  "Questions must be direct and no more than 10 English words. For A1-A2, writing must be fill or mcq, not an open writing task.",
  "Every exercise must include questionTranslation and answerTranslation in clear Vietnamese, plus one short hint that helps without containing or revealing the answer.",
  "Speaking prompt must be one short Vietnamese instruction. Speaking answer must be one easy English model sentence of no more than 10 words.",
  "Keep every item CEFR-appropriate, practical, and unambiguous. Return no prose outside the tool."
].join("\n");

export async function generateWeeklyLessons(
  week: ContentWeekInput,
  cefr: string,
  task: { prompt: string },
  runner: AiTaskRunner,
  options: { excludedVocabulary?: readonly string[]; dayNumbers?: readonly number[] } = {}
) {
  const savedPlan = week.plan?.[cefr as keyof NonNullable<ContentWeekInput["plan"]>];
  const focuses = savedPlan?.length === 5
    ? savedPlan
    : DAYS.map((dayNumber) => `${week.topic} - day ${dayNumber}`);
  const startedAt = Date.now();
  const generationDays = options.dayNumbers
    ? DAYS.filter((dayNumber) => options.dayNumbers!.includes(dayNumber))
    : DAYS;
  const baseInputs = generationDays.map((dayNumber) => ({
    weekNumber: week.weekNumber,
    topic: week.topic,
    description: week.description,
    objectives: week.objectives,
    keyVocabHint: week.keyVocabHint,
    cefr,
    dayNumber,
    lessonFocus: focuses[dayNumber - 1],
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
    let findings: Array<{ path: PropertyKey[]; message: string }> = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const repair = findings.length
        ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")} Return a complete corrected foundation without changing the lesson focus.`
        : "";
      const result = await runner.runTask("weekly_lesson_foundation", resultInput, {
        systemPrompt: `${task.prompt}\n\n${FOUNDATION_CONTRACT}${repair}`,
        maxOutputTokens: FOUNDATION_OUTPUT_TOKEN_LIMIT
      });
      const parsed = weeklyLessonFoundationOutputSchema.safeParse(result.output);
      if (!parsed.success) {
        findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
      } else {
        const normalized = {
          ...parsed.data,
          objective: {
            ...parsed.data.objective,
            items: parsed.data.objective.items.map((item) => ({
              ...item,
              text: normalizeObjectiveText(item.text, input.cefr)
            }))
          }
        };
        if (resultInput.grammarClassification.status === "classified" && (!normalized.title || !normalized.grammar)) {
          findings = [
            ...(!normalized.title ? [{ path: ["title"], message: "A classified target requires a concrete lesson title" }] : []),
            ...(!normalized.grammar ? [{ path: ["grammar"], message: "A classified target requires grammar content" }] : [])
          ];
          if (attempt === 3) throwInvalid(findings, `day${input.dayNumber}.foundation`);
          continue;
        }
        const objectiveValidation = validateLessonObjectives({
          cefr: input.cefr as "A1" | "A2" | "B1" | "B2" | "C1",
          explanationLanguage: normalized.objective.explanationLanguage,
          objectives: normalized.objective.items,
          assessmentCodes: ["listening", "speaking"]
        });
        const objectiveIssues = objectiveValidation.issues.filter((issue) => issue !== "objective_verb_not_observable");
        if (normalized.objective.items.some((item) => (item.text.match(/\bSWBAT\b/gi) ?? []).length !== 1)) {
          objectiveIssues.push("objective_must_be_one_clear_statement");
        }
        if (normalized.objective.items.some((item) => !hasPromptApprovedObservableVerb(item.text, input.cefr)
          || /\b(?:understand|know|learn|appreciate|realise|realize|grasp|master|study|practi[cs]e|review)\b/i.test(item.text))) {
          objectiveIssues.push(`objective_verb_not_observable. Use one ${input.cefr} verb: ${OBJECTIVE_VERBS_BY_LEVEL[input.cefr as keyof typeof OBJECTIVE_VERBS_BY_LEVEL]}`);
        }
        if (objectiveIssues.length === 0) return { result, output: normalized };
        findings = [...new Set(objectiveIssues)].map((message) => ({ path: ["objective"], message }));
      }
      if (attempt === 3) throwInvalid(findings, `day${input.dayNumber}.foundation`);
    }
    throwInvalid(findings, `day${input.dayNumber}.foundation`);
  }));

  const usedVocabulary = new Set((options.excludedVocabulary ?? []).map(normalizeVocabularyKey).filter(Boolean));
  const promptHistory = [...usedVocabulary].slice(0, 80);
  type VocabularyResult = {
    result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
    output: Vocabulary;
  };
  const firstVocabularyResults = await Promise.all(baseInputs.map(async (input, index): Promise<VocabularyResult> => {
    const foundation = foundationResults[index]!.output;
    return runStrictComponent(runner, "weekly_lesson_vocabulary", {
      ...input,
      grammarFormula: foundation.grammar?.formula ?? null,
      grammarExamples: foundation.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
      excludedVocabulary: promptHistory
    }, VOCABULARY_CONTRACT, VOCABULARY_OUTPUT_TOKEN_LIMIT, weeklyLessonVocabularyOutputSchema, input.dayNumber, "vocabulary");
  }));

  const candidates = [...firstVocabularyResults];
  const vocabularyResults: Array<VocabularyResult | undefined> = Array(baseInputs.length).fill(undefined);
  const rejectedWords = baseInputs.map(() => new Set<string>());
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const retryIndexes: number[] = [];
    for (const [index, input] of baseInputs.entries()) {
      if (vocabularyResults[index]) continue;
      const candidate = candidates[index]!;
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
        vocabularyResults[index] = candidate;
      } else {
        duplicates.forEach((word) => rejectedWords[index]!.add(normalizeVocabularyKey(word)));
        retryIndexes.push(index);
      }
    }
    if (retryIndexes.length === 0 || attempt === 8) break;
    const acceptedWords = vocabularyResults.flatMap((item) => item ? vocabularyWords(item.output) : []);
    const retried = await Promise.all(retryIndexes.map(async (index): Promise<[number, VocabularyResult]> => {
      const input = baseInputs[index]!;
      const foundation = foundationResults[index]!.output;
      const excludedVocabulary = [...new Set([
        ...promptHistory,
        ...acceptedWords,
        ...rejectedWords[index]!
      ])].slice(-100);
      const generated = await runStrictComponent(runner, "weekly_lesson_vocabulary", {
        ...input,
        grammarFormula: foundation.grammar?.formula ?? null,
        grammarExamples: foundation.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
        excludedVocabulary
      }, VOCABULARY_CONTRACT, VOCABULARY_OUTPUT_TOKEN_LIMIT, weeklyLessonVocabularyOutputSchema, input.dayNumber, "vocabulary");
      return [index, generated];
    }));
    retried.forEach(([index, candidate]) => { candidates[index] = candidate; });
  }
  const missingVocabularyIndex = vocabularyResults.findIndex((item) => !item);
  if (missingVocabularyIndex >= 0) {
    throwInvalid([{
      path: ["items"],
      message: "AI repeated vocabulary already used in this week, another week, or another CEFR level"
    }], `day${baseInputs[missingVocabularyIndex]!.dayNumber}.vocabulary`);
  }
  const completeVocabularyResults = vocabularyResults as VocabularyResult[];

  const skillsResults = await Promise.all(baseInputs.map(async (input, index) => {
    const foundation = foundationResults[index]!.output;
    const vocabulary = completeVocabularyResults[index]!.output;
    return runStrictComponent(runner, "weekly_lesson_skills", {
      ...input,
      grammarFormula: foundation.grammar?.formula ?? null,
      grammarExamples: foundation.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
      vocabularyWords: [vocabulary.word1.word, vocabulary.word2.word, vocabulary.word3.word]
    }, SKILLS_CONTRACT, SKILLS_OUTPUT_TOKEN_LIMIT, weeklyLessonSkillsOutputSchema, input.dayNumber, "skills");
  }));

  const lessonDrafts = generationDays.map((dayNumber, index) => buildLesson(
    dayNumber,
    foundationResults[index]!.output,
    completeVocabularyResults[index]!.output,
    skillsResults[index]!.output,
    grammarClassificationResults[index]!.output.status,
    baseInputs[index]!.lessonFocus ?? `${week.topic} - day ${dayNumber}`
  ));
  const parsedLessons = lessonDrafts.map((lesson, index) => {
    if (grammarClassificationResults[index]!.output.status !== "classified") return lesson;
      const parsed = weeklyLessonDayOutputSchema.safeParse({ lesson });
      if (!parsed.success) throwInvalid(parsed.error.issues, `day${lesson.dayNumber}`);
      return {
        ...parsed.data.lesson,
        dayNumber: lesson.dayNumber,
        title: foundationResults[index]!.output.title!
      };
  });

  const lessons = parsedLessons as ContentLessonDraftInput[];
  const validation = validateLessonDraft(lessons);
  const days = [...new Set(lessons.map((lesson) => lesson.dayNumber))].sort((a, b) => a - b);
  if (!validation.valid || days.length !== generationDays.length || days.some((day, index) => day !== generationDays[index])) {
    throw Object.assign(new Error("AI_LESSON_SET_INVALID"), {
      code: "AI_LESSON_SET_INVALID",
      issues: validation.issues
    });
  }

  const allResults = [
    ...grammarClassificationResults.map(({ result }) => result),
    ...foundationResults.map(({ result }) => result),
    ...completeVocabularyResults.map(({ result }) => result),
    ...skillsResults.map(({ result }) => result)
  ];
  const first = allResults[0]!.metadata;
  const output = { lessons };
  const result: AiRunResult<typeof output> = {
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

  return { result, output, lessons };
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

async function runStrictComponent<T>(
  runner: AiTaskRunner,
  taskId: string,
  input: unknown,
  basePrompt: string,
  maxOutputTokens: number,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  dayNumber: number,
  component: string
): Promise<{ result: Awaited<ReturnType<AiTaskRunner["runTask"]>>; output: T }> {
  let findings: Array<{ path: PropertyKey[]; message: string }> = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const repair = findings.length
      ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")} Return a complete corrected ${component} result and preserve every valid field.`
      : "";
    try {
      const result = await runner.runTask(taskId, input, {
        systemPrompt: `${basePrompt}${repair}`,
        maxOutputTokens
      });
      const parsed = schema.safeParse(result.output);
      if (parsed.success) return { result, output: parsed.data };
      findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
    } catch (error) {
      if (!isInvalidAiOutput(error)) throw error;
      findings = invalidAiIssues(error);
    }
    if (attempt === 3) throwInvalid(findings, `day${dayNumber}.${component}`);
  }
  throwInvalid(findings, `day${dayNumber}.${component}`);
}

function isInvalidAiOutput(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID");
}

function invalidAiIssues(error: unknown): Array<{ path: PropertyKey[]; message: string }> {
  const candidate = error && typeof error === "object" && "details" in error
    ? (error as { details?: { issues?: unknown } }).details?.issues
    : undefined;
  if (!Array.isArray(candidate)) return [{ path: [], message: "The structured result was incomplete or invalid" }];
  return candidate.slice(0, 8).map((issue) => {
    const value = issue && typeof issue === "object" ? issue as { path?: unknown; message?: unknown } : {};
    const path = Array.isArray(value.path) ? value.path.map(String) : typeof value.path === "string" ? value.path.split(".") : [];
    const message = typeof value.message === "string"
      ? value.message.replace(/[\r\n\t]+/g, " ").trim().slice(0, 240)
      : "The structured result was incomplete or invalid";
    return { path, message };
  });
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

function buildLesson(
  dayNumber: number,
  foundation: Foundation,
  vocabulary: Vocabulary,
  skills: Skills,
  grammarStatus: "classified" | "no_suitable_content" | "insufficient_evidence",
  lessonFocus: string
) {
  const grammar = grammarStatus === "classified" && foundation.grammar
    ? {
        formula: foundation.grammar.formula,
        usage: foundation.grammar.usage,
        examples: [foundation.grammar.example1, foundation.grammar.example2]
      }
    : { status: "unavailable", hidden: true, reason: grammarStatus };
  return {
    dayNumber,
    title: grammarStatus === "classified" && foundation.title
      ? foundation.title
      : compactWords(lessonFocus, 8).replace(/[.!?]+$/, ""),
    durationMinutes: foundation.durationMinutes,
    parts: [
      { code: "objective", title: foundation.objective.title, content: {
        text: foundation.objective.items.map(({ text }) => text).join("\n"),
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
        code: "grammar", title: foundation.grammar?.title ?? "Language focus",
        content: grammar
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
          answer: skills.writing.answer,
          hint: skills.writing.hint,
          questionTranslation: skills.writing.questionTranslation,
          answerTranslation: skills.writing.answerTranslation
        }
      },
      { code: "word_class", title: skills.wordClass.title, content: toQuestion(skills.wordClass) },
      { code: "word_use", title: skills.wordUse.title, content: toQuestion(skills.wordUse) },
      { code: "speaking", title: skills.speaking.title, content: {
        prompt: skills.speaking.prompt, answer: skills.speaking.answer, hint: skills.speaking.hint,
        questionTranslation: skills.speaking.questionTranslation, answerTranslation: skills.speaking.answerTranslation
      } }
    ]
  };
}

function compactWords(value: string, limit: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? value.trim() : `${words.slice(0, limit).join(" ").replace(/[,:;.!?]+$/, "")}.`;
}

function normalizeObjectiveText(value: string, cefr: string): string {
  const trimmed = value.trim();
  if (/^SWBAT\b/i.test(trimmed)) return trimmed;
  const learnerFacingPrefix = cefr === "A1" || cefr === "A2"
    ? /^Sau bài học,?\s+bạn có thể\s+/i
    : /^By the end of this lesson,?\s+you will be able to\s+/i;
  if (learnerFacingPrefix.test(trimmed)) return `SWBAT ${trimmed.replace(learnerFacingPrefix, "")}`;
  return trimmed;
}

function hasPromptApprovedObservableVerb(value: string, cefr: string): boolean {
  void cefr;
  return /\b(?:identify|select|match|name|point\s+to|repeat|say|ask|answer|give|use|describe|write|confirm|request|apologi[sz]e|arrange|complete|explain|respond|give\s+reasons|summari[sz]e|clarify|report|suggest|compare|justify|negotiate|handle|propose|recommend|paraphrase|de-escalate|present|persuade|adapt|mediate|critique|synthesi[sz]e|reframe|decline|lead|tailor|send|state|choose|check)\b/i.test(value);
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
    answer: value.answer,
    hint: value.hint,
    questionTranslation: value.questionTranslation,
    answerTranslation: value.answerTranslation
  };
}

function toQuestion(value: Skills["wordClass"] | Skills["wordUse"]) {
  return {
    prompt: value.prompt,
    options: [value.option1, value.option2, value.option3, value.option4],
    answer: value.answer,
    hint: value.hint,
    questionTranslation: value.questionTranslation,
    answerTranslation: value.answerTranslation
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
