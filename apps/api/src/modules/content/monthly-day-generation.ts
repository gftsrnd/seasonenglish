import { monthlyScopeHash, withMonthlyExpandedTerms, withMonthlyGrammarSteps, type CoreTerm, type GrammarStep, type MonthlyCurriculumContract, type MonthlyDaySpec, type PronunciationSound } from "@e4s/domain";
import { MONTHLY_LESSON_PART_CONTENT_CONTRACT, type AiTaskRunner } from "@e4s/ai";
import { evaluateMonthlyLessonQuality, monthlyLockedPlanExpectations, normalizeFormula, type MonthlyLessonCandidate, type MonthlyLockedPlanExpectations, type MonthlyQualityReport, type MonthlyQualityFinding } from "./monthly-quality.js";
import { rebalanceAnswerTextPositions, type AnswerTextChoice } from "../shared/answer-order.js";
import { MONTHLY_REVIEW_COMPONENTS, monthlyReviewTargets } from "./monthly-review-quality.js";

const REVIEW_STUDY_COMPONENTS = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"] as const;

export function monthlyDailyTeachingContract(day: MonthlyDaySpec, cefr: string, coreWords: readonly string[] = []): string {
  const vietnamese = cefr === "A1" || cefr === "A2";
  const language = vietnamese ? "Vietnamese" : "simple English";
  const words = coreWords.length ? ` (${coreWords.join(", ")})` : "";
  return [
    "DAILY TEACHING PLAN V2 overrides generic daily/review shape instructions for grammar and pronunciation only. Keep every other component's existing contract.",
    `Teach day N${day.newLessonNumber}, grammar code ${day.grammarPlan?.code}, mode ${day.grammarPlan?.mode}, objective: ${day.grammarPlan?.objective}. A shared formula does not mean repeating the same teaching lesson. Explain the planned focus in ${language}.`,
    vietnamese ? "" : "The locked objective above may be written in Vietnamese: copy it verbatim only into grammar.objective; never quote or translate it into the objective, instruction or any other learner-facing text, which stays in English.",
    `grammar: return {dailyCode, objective, formula, text, examples, items, steps?}. dailyCode and objective copy the locked daily plan. grammar.examples: at least 3 natural NEW workplace sentences (never copied from lockedScope.grammarStep examples) that together use at least two of today's core words${words}, each word spelled exactly as given. The pool's examples are references; do not copy the entire reference example list into the lesson.`,
    "grammar.items: 3–5 distinct questions, each {id,prompt,options:[4 different strings],answer,explanation,milestoneId}. Use the day's practice mode. Explain why each answer is correct. Do not add unrelated grammar formulas.",
    day.grammarPlan?.recallMilestoneIds.length ? `Include one recall question with milestoneId from ${day.grammarPlan.recallMilestoneIds.join(", ")} (previous topic A); the other questions teach the current topic.` : "",
    `pronunciation: teach stage ${day.pronunciationPlan?.stage}, objective ${day.pronunciationPlan?.objective}. Return stage and objective matching the plan. This is a ${cefr} target: advanced stress/linking/intonation targets remain advanced features, not isolated beginner phoneme lessons.`,
    "pronunciation.focus copies the first locked target. pronunciation.words contains exactly the three examples listed by daySpec.pronunciationExampleIds (the compact standard-format summary). Never substitute another three words from the pool.",
    (day.pronunciationPlan?.targetIds.length ?? 0) > 1 ? "Also return pronunciation.reviewTargets: [{soundId,focus,words:[{word,ipa}]}], in dailyTeachingPlan.pronunciation.targetIds order, including exactly the assigned dailyTeachingPlan.pronunciation.exampleIds for each target. The UI and listening gates use this complete multi-target scope." : "",
    day.pronunciationPlan?.requiredPositions ? "For the read-aloud/mock task also return pronunciation.passage and pronunciation.targetPositions: [{soundId,exampleId}], exactly the eight requiredPositions from the plan, two per target; the passage must actually contain those eight example words." : "",
    day.pronunciationPlan?.stage === "personalize" ? "Use recorded learner error evidence when supplied. With no error evidence, explicitly present this as a diagnostic over the taught targets; do not invent personal mistakes." : "",
    "The speaking task must apply the day's pronunciation stage and grammar objective, using at least two daily core words."
  ].filter(Boolean).join("\n");
}

/**
 * Learner-language rule for every monthly lesson/review request, stated once
 * per level (round 2: first attempts at A1–A2 still wrote English-only prompts,
 * B1+ copied Vietnamese plan notes into learner text).
 */
export function monthlyLearnerLanguageContract(cefr: string): string {
  if (cefr === "A1" || cefr === "A2") return [
    `LEARNER LANGUAGE (${cefr}): every prompt, question and instruction string the learner reads - in every part, item and variant, including grammar.items, word_class, word_use, reading and speaking - must start with a Vietnamese instruction. A prompt that is only an English sentence or an English question is rejected.`,
    "Put the English target sentence after the Vietnamese instruction in the same prompt string, e.g. word_class prompt \"Chọn dạng đúng của từ để điền vào chỗ trống: Our ____ meets every Monday.\"; grammar item prompt \"Chọn từ đúng để hoàn thành câu: The client ____ feedback every week.\"; reading prompt \"Đọc email và chọn đáp án đúng: Nhóm đang làm gì?\"; word_use prompt \"Chọn cụm từ đúng nghĩa với 'take a photo':\"; speaking prompt \"Hãy nói 30–45 giây về tiến độ dự án, dùng các từ: meeting, project, task.\".",
    "Options, answers, scripts, passages, sample answers and example sentences stay in English."
  ].join(" ");
  return [
    `LEARNER LANGUAGE (${cefr}): write every learner-facing string in English - lesson title, objective, instruction, prompts, questions, explanations, scripts, passages, samples and grammar/pronunciation notes. Only vocabulary meanings may be Vietnamese.`,
    "Plan notes you receive (daySpec.skillExercises[].focus, the grammar and pronunciation objectives, the theme's communication goal) may be written in Vietnamese: they are guidance for you, never copy or translate them into learner text. The only exception is the locked grammar.objective / pronunciation.objective fields, copied verbatim."
  ].join(" ");
}

export const MONTHLY_DAY_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;
export type MonthlyDayComponent = (typeof MONTHLY_DAY_COMPONENTS)[number];

export async function generateMonthlyDayWithAi(contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string, priorGrammarExamples: readonly string[] = []): Promise<MonthlyDayGenerationResult> {
  return generateMonthlyContentWithAi("new", contract, dayNumber, runner, systemPrompt, priorGrammarExamples);
}

/** Review generation has a separate entry point so ordinary-day callers cannot silently generate a review DaySpec. */
export async function generateMonthlyReviewWithAi(contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string): Promise<MonthlyDayGenerationResult> {
  return generateMonthlyContentWithAi("review", contract, dayNumber, runner, systemPrompt);
}

async function generateMonthlyContentWithAi(kind: "new" | "review", contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string, priorGrammarExamples: readonly string[] = []): Promise<MonthlyDayGenerationResult> {
  const generated = await generateMonthlyDay({
    contract,
    dayNumber,
    kind,
    priorGrammarExamples,
    maxAttempts: 3,
    generate: async ({ daySpec, coreTerms, grammarStep, grammarSteps, sound, sounds, pronunciationExamples, components, priorParts, repairFindings }) => {
      const daySupportTerms = contract.supportTerms.filter((term) => (daySpec.kind === "new" ? daySpec.expandedTermIds : daySpec.reviewExpandedTermIds).includes(term.id));
      const basePrompt = kind === "review" ? `${systemPrompt}

Part content field contract: ${MONTHLY_LESSON_PART_CONTENT_CONTRACT}

Review pronunciation output contract: Keep pronunciation.focus equal to the first locked review sound IPA and pronunciation.words equal to that sound's first three allocated examples (or all allocated examples when fewer than three), so it remains compatible with the standard lesson format. Also include pronunciation.reviewTargets as an array in lockedScope.sounds order; each item must have { soundId, focus, words }, and words must contain every locked pronunciation example for that sound with its exact word and IPA. Include every allocated review sound and example exactly once. Do not use the review calendar day's ordinary sound/examples.

${monthlyReviewExerciseContract(coreTerms.length, grammarSteps.length, contract.cefr, monthlyReviewWordFormCandidates(coreTerms, daySupportTerms))}

${monthlyLearnerLanguageContract(contract.cefr)}` : `${systemPrompt}

Part content field contract: ${MONTHLY_LESSON_PART_CONTENT_CONTRACT}

${monthlyLearnerLanguageContract(contract.cefr)}`;
      const call = async (requested: readonly string[], note: string, maxOutputTokens: number) => {
        let result;
        try { result = await runner.runTask("monthly_lesson_day", {
          month: contract.month,
          cefr: contract.cefr,
          daySpec,
          components: requested,
          lockedScope: { coreTerms, grammarStep, grammarSteps, sound, sounds, pronunciationExamples, theme: contract.theme, supportTerms: daySupportTerms },
          priorParts,
          priorGrammarExamples,
          repairIssues: repairFindings,
          dailyTeachingPlan: { grammar: daySpec.grammarPlan, pronunciation: daySpec.pronunciationPlan },
          ...(kind === "review" ? { reviewListeningChecklist: coreTerms.map(term => ({ audioText: term.word, meaning: term.meaning })) } : {})
        }, { systemPrompt: `${note ? `${basePrompt}

${note}` : basePrompt}${contract.planSchemaVersion === 2 && kind === "new" ? `\n${monthlyDailyTeachingContract(daySpec, contract.cefr, coreTerms.map((term) => term.word))}` : ""}${repairFindings.length ? `\nREPAIR REQUIRED FOR REQUESTED COMPONENTS: ${repairFindings.map(finding => `${finding.component}: ${finding.message}`).join("; ")}. Correct every listed issue; do not repeat the same incomplete output. Preserve accepted components.` : ""}`, maxOutputTokens, temperature: 0.2, maxAttempts: 2 });
        } catch (error) {
          if (error && typeof error === "object") Object.assign(error, { monthlyComponents: [...requested] });
          throw error;
        }
        const lesson = (result.output as { lesson?: { title?: string; parts?: Array<{ code: string; title?: string; content: Record<string, unknown> }> } }).lesson;
        if (!lesson || !Array.isArray(lesson.parts)) throw new Error("Monthly lesson AI returned no lesson parts");
        return { title: lesson.title ?? "", parts: lesson.parts };
      };
      let title = "";
      let rawParts: Array<{ code: string; title?: string; content: Record<string, unknown> }>;
      const studyCodes = REVIEW_STUDY_COMPONENTS.filter((code) => components.includes(code));
      const exerciseCodes = components.filter((code) => !(REVIEW_STUDY_COMPONENTS as readonly string[]).includes(code) || code === "grammar");
      if (kind === "review" && studyCodes.length && exerciseCodes.some((code) => code !== "grammar")) {
        // One call for the study tab (12 cards) and ~30 exercise items is too large; split them like the monthly exam.
        const [study, exercises] = await Promise.all([
          call(studyCodes, "This request returns only the study-tab parts listed in components. For grammar return formula, text, examples and steps, without items.", 10_000),
          call(exerciseCodes, "This request returns only the review exercise sections listed in components. For grammar return only { items } (the study formula is produced separately). Keep the title short.", 14_000)
        ]);
        title = study.title;
        const byCode = new Map(study.parts.map((part) => [part.code, part]));
        for (const part of exercises.parts) {
          const existing = byCode.get(part.code);
          byCode.set(part.code, existing && part.code === "grammar" ? { ...existing, content: { ...existing.content, ...(Array.isArray(part.content.items) ? { items: part.content.items } : {}) } } : part);
        }
        rawParts = [...byCode.values()];
      } else {
        const single = await call(components, "", kind === "review" ? 14_000 : 8_000);
        title = single.title;
        rawParts = single.parts;
      }
      // The plan, not the model, decides each core word's expanded terms: attach them deterministically.
      const vocabularyParts = withMonthlyExpandedTerms(rawParts, coreTerms, daySupportTerms);
      const dailyParts = vocabularyParts.map(part => part.code === "grammar" && daySpec.grammarPlan ? { ...part, content: { ...part.content, milestoneIds: daySpec.grammarPlan.milestoneIds, recallMilestoneIds: daySpec.grammarPlan.recallMilestoneIds } } : part);
      const enriched = contract.planSchemaVersion === 2 && kind === "new" ? dailyParts : withMonthlyGrammarSteps(vocabularyParts, grammarSteps);
      const parts = kind === "review" ? normalizeMonthlyReviewParts(enriched) : enriched;
      return { title, parts: parts.map((part) => ({ code: part.code, ...(part.title ? { title: part.title } : {}), content: part.content })) };
    }
  });
  return generated;
}

/** A week word that can carry a Word form item, with the real family words the plan lists for it. */
export interface MonthlyWordFormCandidate { word: string; type: string; family: string[] }

/**
 * Week words suitable for Word form: verbs (base / -s / past / -ing are real
 * forms) and words with a planned word_family support. Other words - typically
 * nouns such as feedback, deadline or colleague - have no real family to choose
 * from, and building one invents words (feedbacking, deadlined).
 */
export function monthlyReviewWordFormCandidates(
  coreTerms: ReadonlyArray<{ id: string; word: string; type: string }>,
  supportTerms: ReadonlyArray<{ word: string; relation: string; relatedCoreTermId: string }>
): { suitable: MonthlyWordFormCandidate[]; unsuitable: string[] } {
  const suitable: MonthlyWordFormCandidate[] = [];
  const unsuitable: string[] = [];
  for (const term of coreTerms) {
    const family = [...new Set(supportTerms.filter((support) => support.relatedCoreTermId === term.id && support.relation === "word_family").map((support) => support.word.trim()).filter(Boolean))];
    if (family.length || /\bverb\b/iu.test(term.type)) suitable.push({ word: term.word, type: term.type, family });
    else unsuitable.push(term.word);
  }
  return { suitable, unsuitable };
}

/**
 * Friday review exercises (e4s_cau_truc_bai_on_cuoi_tuan, 03/11): six sections
 * of review-until-correct items. Counts scale with the week's core words.
 */
export function monthlyReviewExerciseContract(coreCount: number, grammarStepCount: number, cefr: string, wordForm?: { suitable: readonly MonthlyWordFormCandidate[]; unsuitable: readonly string[] }): string {
  const target = monthlyReviewTargets(coreCount, grammarStepCount);
  const vietnamese = cefr === "A1" || cefr === "A2";
  const explain = vietnamese ? "Vietnamese" : "simple English";
  const listeningPrompt = vietnamese ? "Nghe và chọn nghĩa đúng" : "Listen and choose the meaning";
  const readAloudPrompt = vietnamese ? "Đọc to câu sau" : "Read this sentence aloud";
  const candidates = wordForm?.suitable.length
    ? ` Use only these week words for Word form: ${wordForm.suitable.map((candidate) => candidate.family.length ? `${candidate.word} (family: ${candidate.family.join(", ")})` : `${candidate.word} (${candidate.type}: real forms such as -s, past, -ing)`).join("; ")}.${wordForm.unsuitable.length ? ` Never build Word form items on ${wordForm.unsuitable.join(", ")}: they have no real word family here.` : ""}`
    : "";
  return [
    "Friday review exercise contract (overrides the daily single-question shape for listening, word_use, word_class, grammar, reading, speaking; do not return a writing part):",
    `EXACT ITEM COUNTS (each section is { items: [...] } with all of its items in this one response; never a single question, never a partial list): listening ${target.listening}, word_use ${target.wordUse}, word_class ${target.wordForm}, grammar ${target.grammar} (+1 previous-week item when there is one), reading 3, speaking 4 (2 minimal pairs, 1 read-aloud, 1 free response).`,
    "Keep objective, instruction, vocabulary (every core word of the week as a card with collocations), grammar (formula, text, examples, steps) and pronunciation as the study tab.",
    `Each exercise section's content has items: [{ id, prompt, options, answer, explanation, variants }]. explanation: at most 2 sentences in ${explain}, why the answer is right. variants: exactly 1 alternative item testing the same point in a different workplace context (same fields, different sentence, never a copy). Never copy daily-lesson sentences verbatim.`,
    vietnamese
      ? "Every prompt the learner reads is written in Vietnamese (e.g. \"Chọn dạng đúng của từ để điền vào chỗ trống: …\", \"Đọc tin nhắn và chọn đáp án đúng.\"); only the English target sentence, options and answers stay in English."
      : "Every prompt, question, instruction and explanation is written in English; only the listening options/answers (word meanings) are Vietnamese.",
    "Distractors: every option is a real, correctly spelled English word or phrase of the same kind as the answer (never invented forms such as sended, maked, gived, feedbacked, accurating); options are similar in length so the correct answer is not simply the longest one.",
    `listening.items: exactly ${target.listening} items, one per core word: audioText = the English core word (spoken by the app, not shown), prompt "${listeningPrompt}", options = 4 Vietnamese meanings of week words of similar length, answer = the meaning of the spoken word.`,
    `word_use.items: exactly ${target.wordUse} items mixing: choose the synonym/antonym, choose the word that belongs under an umbrella word, fill a week word into a workplace sentence (blank as ____). 4 English options.`,
    `word_class.items (Word form): exactly ${target.wordForm} items: a workplace sentence with one blank (____, never dashes) where the learner chooses the correct form of a week word (e.g. decide / decision / decisive / decisively, or the right tense: send / sends / sent / sending). Choose only week words that really have several forms: a verb or a word with a real word family; a noun without a family (e.g. feedback, deadline, colleague) is never used, and never gets -ing, -ed, -ly or -ship added.${candidates} 4 English options, each a real English word that is a form of the same word or its family; the sentence must accept only one of them. Never ask for the word class or part of speech, never use labels such as noun/verb/adjective/adverb as options, and never give the answer word unchanged in brackets.`,
    `grammar.items: exactly ${target.grammar} items, one per locked grammar step in order, each in that step's exercise type and using week words; add 1 more item reviewing the previous week's topic when there is one. 4 English options.`,
    `reading: passage = one workplace message or email of ${target.readingWords.min}-${target.readingWords.max} words that uses at least ${target.readingWeekWords} week words and this week's grammar; items = exactly 3 comprehension questions with 4 English options.`,
    `speaking.items: exactly 4 items in this order: (a) 2 minimal-pair items for this week's sounds: audioText = one word, options = the 2 words of the minimal pair: one of this week's pronunciation example words (lockedScope.pronunciationExamples) and a real, common, polite English word that sounds exactly the same except for the target sound, which is replaced by one neighbouring sound (same number of sounds, all other sounds identical and in the same order: ship / sheep, think / sink, fan / van, light / right; never pairs such as event / segment, bat / box or sheet / shift); never a vulgar or offensive word; answer = the spoken word, explanation; (b) 1 read-aloud item: prompt "${readAloudPrompt}", passage = one natural, grammatical, meaningful workplace sentence (at most 20 words, not a list of words) containing at least 2 of this week's pronunciation example words, no options, no answer; (c) 1 free-response item: prompt = a workplace situation asking for 1-2 sentences, requiredWords = 4-6 words copied exactly from this week's core words (never other words such as could, already, effective), minRequiredWords = 2, no options, no answer, never name a grammar formula.`,
    "Every core word appears at least twice across the review (listening plus one other section).",
    "Learner-facing text never mentions internal planning terms (core term, expanded term, người học) and never pastes the theme's communication goal."
  ].filter(Boolean).join("\n");
}

/** Copies the reading passage onto each reading item (the review runtime shows it per question) and fills missing ids. */
export function normalizeMonthlyReviewParts<T extends { code: string; content: Record<string, unknown> }>(parts: readonly T[]): T[] {
  return parts.map((part) => {
    const items = Array.isArray(part.content.items) ? part.content.items : null;
    if (!items || part.code === "vocabulary" || part.code === "objective") return part;
    const passage = typeof part.content.passage === "string" ? part.content.passage : typeof part.content.text === "string" && part.code === "reading" ? part.content.text : "";
    const fixed = items.map((raw, index) => {
      if (!raw || typeof raw !== "object") return raw;
      const item = { ...(raw as Record<string, unknown>) };
      if (typeof item.id !== "string" || !item.id.trim()) item.id = `${part.code}-${index + 1}`;
      if (part.code === "reading" && passage && !item.passage) item.passage = passage;
      if (Array.isArray(item.variants)) {
        item.variants = item.variants.map((variant, variantIndex) => {
          if (!variant || typeof variant !== "object") return variant;
          const copy = { ...(variant as Record<string, unknown>) };
          if (typeof copy.id !== "string" || !copy.id.trim()) copy.id = `${item.id as string}-v${variantIndex + 1}`;
          if (part.code === "reading" && passage && !copy.passage) copy.passage = passage;
          return copy;
        });
      }
      return item;
    });
    return { ...part, content: { ...part.content, ...(part.code === "reading" && passage ? { passage } : {}), items: fixed } };
  });
}

export interface MonthlyDayGenerationInput {
  contract: MonthlyCurriculumContract;
  dayNumber: number;
  components: readonly MonthlyDayComponent[];
  daySpec: MonthlyDaySpec;
  coreTerms: readonly CoreTerm[];
  grammarStep: GrammarStep;
  grammarSteps: readonly GrammarStep[];
  sound: PronunciationSound;
  sounds: readonly PronunciationSound[];
  pronunciationExamples: readonly { id: string; word: string; ipa: string }[];
  priorParts: readonly MonthlyLessonCandidate["parts"][number][];
  repairFindings: readonly MonthlyQualityFinding[];
}

export interface MonthlyDayGenerationResult {
  status: "ready" | "failed";
  lesson: MonthlyLessonCandidate | null;
  report: MonthlyQualityReport;
  scopeHash: string;
  attempts: number;
}

export async function generateMonthlyDay(input: {
  contract: MonthlyCurriculumContract;
  dayNumber: number;
  /** Defaults to `new` for backwards-compatible ordinary generation. */
  kind?: "new" | "review";
  generate: (input: MonthlyDayGenerationInput) => Promise<MonthlyLessonCandidate>;
  maxAttempts?: number;
  priorGrammarExamples?: readonly string[];
}): Promise<MonthlyDayGenerationResult> {
  const daySpec = input.contract.daySpecs.find((day) => day.lessonNumber === input.dayNumber);
  if (!daySpec) throw new Error(`Monthly DaySpec ${input.dayNumber} was not found`);
  const kind = input.kind ?? "new";
  if (daySpec.kind !== kind) throw new Error(kind === "new" ? "MONTHLY_DAY_KIND_MISMATCH: ordinary generation requires a new DaySpec" : "MONTHLY_DAY_KIND_MISMATCH: review generation requires a review DaySpec");
  const grammarIds = kind === "review" ? daySpec.reviewGrammarStepIds ?? [] : daySpec.grammarStepIds ?? [daySpec.grammarStepId];
  const soundIds = kind === "review" ? daySpec.reviewSoundIds ?? [] : daySpec.pronunciationPlan?.targetIds ?? [daySpec.soundId];
  const pronunciationExampleIds = kind === "review" ? daySpec.reviewPronunciationExampleIds ?? [] : [...new Set([...(daySpec.pronunciationPlan?.exampleIds ?? []), ...daySpec.pronunciationExampleIds])];
  const grammarSteps = grammarIds.map((id) => input.contract.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === id)).filter((step): step is GrammarStep => Boolean(step));
  const grammarStep = grammarSteps[0];
  const sounds = soundIds.map((id) => input.contract.sounds.find((candidate) => candidate.id === id)).filter((sound): sound is PronunciationSound => Boolean(sound));
  const examplesById = new Map(sounds.flatMap((candidate) => candidate.examples.map((example) => [example.id, example] as const)));
  const pronunciationExamples = pronunciationExampleIds.map((id) => examplesById.get(id)).filter((example): example is NonNullable<typeof example> => Boolean(example));
  if (!grammarStep || grammarSteps.length !== grammarIds.length || !sounds.length || sounds.length !== soundIds.length || !pronunciationExampleIds.length || pronunciationExamples.length !== pronunciationExampleIds.length) {
    throw new Error(`Monthly DaySpec ${input.dayNumber} has unresolved grammar or pronunciation scope`);
  }
  const sound = sounds[0]!;
  const coreTerms = (daySpec.kind === "new" ? daySpec.coreTermIds : daySpec.reviewTermIds).map((id) => input.contract.coreTerms.find((term) => term.id === id)).filter((term): term is CoreTerm => Boolean(term));
  const maxAttempts = input.maxAttempts ?? 3;
  const scopeHash = monthlyScopeHash(input.contract);
  let parts: MonthlyLessonCandidate["parts"] = [];
  let title = "";
  let requestedComponents: MonthlyDayComponent[] = daySpec.kind === "review" ? [...MONTHLY_REVIEW_COMPONENTS] : [...MONTHLY_DAY_COMPONENTS];
  let report: MonthlyQualityReport = { severe: [], light: [], contractVersion: input.contract.version };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await input.generate({ contract: input.contract, dayNumber: input.dayNumber, components: requestedComponents, daySpec, coreTerms, grammarStep, grammarSteps, sound, sounds, pronunciationExamples, priorParts: parts, repairFindings: report.severe });
    title = generated.title || title;
    // D1 (approved 11/11): the plan, not the model, owns the locked fields; the gate below still verifies them.
    parts = applyMonthlyLockedPlanFields(input.contract, daySpec, dropSupportTermVocabularyCards(input.contract, mergeParts(parts, generated.parts, requestedComponents, kind === "review")));
    const candidate = { title, parts };
    report = evaluateMonthlyLessonQuality(input.contract, input.dayNumber, candidate, input.priorGrammarExamples);
    if (report.severe.length === 0) return { status: "ready", lesson: { title, parts: shuffleMonthlyAnswerOrder(parts, scopeHash, input.dayNumber) }, report, scopeHash, attempts: attempt };
    requestedComponents = componentsToRepair(report, daySpec.kind === "review");
  }
  return { status: "failed", lesson: null, report, scopeHash, attempts: maxAttempts };
}

type LessonPartRecord = MonthlyLessonCandidate["parts"][number];

/**
 * D1 / WP1: copies every plan-locked field into the generated parts before the
 * quality gate — grammar.dailyCode/objective and step formulas,
 * pronunciation.stage/objective/focus/words/reviewTargets/targetPositions.
 * Missing parts are never created and model-written extras (text, examples,
 * per-word notes) are kept.
 */
export function applyMonthlyLockedPlanFields<T extends LessonPartRecord>(contract: MonthlyCurriculumContract, day: MonthlyDaySpec, parts: readonly T[]): T[] {
  const expected = monthlyLockedPlanExpectations(contract, day);
  return parts.map((part) => {
    if (!isRecord(part.content)) return part;
    if (part.code === "grammar") return { ...part, content: lockedGrammar(part.content, expected) };
    if (part.code === "pronunciation") return { ...part, content: lockedPronunciation(part.content, expected) };
    return part;
  });
}

function lockedGrammar(content: Record<string, unknown>, expected: MonthlyLockedPlanExpectations): Record<string, unknown> {
  const next = { ...content };
  if (expected.grammarCode) next.dailyCode = expected.grammarCode;
  if (expected.grammarObjective) next.objective = expected.grammarObjective;
  const formulas = expected.grammarFormulas;
  if (!formulas.length) return next;
  if (Array.isArray(next.steps) && next.steps.length === formulas.length && next.steps.every(isRecord)) {
    next.steps = next.steps.map((step, index) => ({ ...(step as Record<string, unknown>), formula: formulas[index] }));
  }
  const stepFormulas = Array.isArray(next.steps) ? next.steps.map((step) => isRecord(step) && typeof step.formula === "string" ? step.formula : "") : [];
  const combined = normalizeFormula([typeof next.formula === "string" ? next.formula : "", ...stepFormulas].join("\n"));
  if (formulas.some((formula) => !combined.includes(normalizeFormula(formula)))) next.formula = formulas.join("; ");
  return next;
}

function lockedPronunciation(content: Record<string, unknown>, expected: MonthlyLockedPlanExpectations): Record<string, unknown> {
  const next = { ...content };
  if (expected.pronunciationStage) next.stage = expected.pronunciationStage;
  if (expected.pronunciationObjective) next.objective = expected.pronunciationObjective;
  if (expected.focus) next.focus = expected.focus;
  if (expected.words.length) {
    next.words = lockedWords(content.words, expected.words);
    // The gate reads `items` before `words`; keep both views identical when the model used `items`.
    if (Array.isArray(content.items) && content.items.some((item) => isRecord(item) && typeof item.word === "string")) next.items = lockedWords(content.items, expected.words);
  }
  if (expected.reviewTargets) {
    const own = Array.isArray(content.reviewTargets) ? content.reviewTargets.filter(isRecord) : [];
    next.reviewTargets = expected.reviewTargets.map((target, index) => {
      const match = own.find((candidate) => candidate.soundId === target.soundId) ?? (own[index]?.soundId === undefined ? own[index] : undefined) ?? {};
      return { ...match, soundId: target.soundId, focus: target.focus, words: lockedWords(match.words, target.words) };
    });
  }
  if (expected.targetPositions) next.targetPositions = expected.targetPositions.map((position) => ({ ...position }));
  return next;
}

function lockedWords(own: unknown, expected: ReadonlyArray<{ word: string; ipa: string }>): Array<Record<string, unknown>> {
  const records = Array.isArray(own) ? own.filter(isRecord) : [];
  return expected.map((example) => {
    const match = records.find((record) => typeof record.word === "string" && record.word.trim().toLocaleLowerCase("en-US") === example.word.trim().toLocaleLowerCase("en-US"));
    return { ...(match ?? {}), word: example.word, ipa: example.ipa };
  });
}

const SINGLE_CHOICE_PARTS = ["listening", "reading", "writing", "word_class", "word_use"] as const;
const ITEM_CHOICE_PARTS = ["listening", "reading", "writing", "word_class", "word_use", "grammar", "speaking"] as const;
type ShuffleChoice = Record<string, unknown> & AnswerTextChoice;

function isAnswerTextChoice(value: unknown): value is ShuffleChoice {
  return isRecord(value) && Array.isArray(value.options) && value.options.length >= 2 && value.options.every((option) => typeof option === "string") && typeof value.answer === "string";
}

function balanceChoices(list: readonly unknown[], seed: string): unknown[] {
  const indexes = list.flatMap((value, index) => isAnswerTextChoice(value) ? [index] : []);
  if (!indexes.length) return [...list];
  const balanced = rebalanceAnswerTextPositions(indexes.map((index) => list[index] as ShuffleChoice), seed);
  const next = [...list];
  indexes.forEach((index, position) => { next[index] = balanced[position]; });
  return next;
}

/**
 * WP2 for daily lessons and reviews: after the gate passes, every objective
 * choice is re-ordered with the shared seeded balancer (option texts and
 * answers unchanged). A list is balanced as a whole, seeded
 * `scopeHash:day:part` — the lesson's top-level single questions together
 * (`…:single`), each part's items[] and, independently, all of its variants[]
 * (`…:part:variants`), minimal pairs included.
 */
export function shuffleMonthlyAnswerOrder<T extends LessonPartRecord>(parts: readonly T[], scopeHash: string, dayNumber: number): T[] {
  const seed = (scope: string) => `${scopeHash}:${dayNumber}:${scope}`;
  const singleIndexes = parts.flatMap((part, index) => (SINGLE_CHOICE_PARTS as readonly string[]).includes(part.code) && isAnswerTextChoice(part.content) ? [index] : []);
  const singles = balanceChoices(singleIndexes.map((index) => parts[index]!.content), seed("single"));
  return parts.map((part, index) => {
    let content = part.content;
    const single = singleIndexes.indexOf(index);
    if (single >= 0) content = { ...content, ...(singles[single] as Record<string, unknown>) };
    if ((ITEM_CHOICE_PARTS as readonly string[]).includes(part.code) && Array.isArray(content.items)) {
      const items = balanceChoices(content.items, seed(part.code));
      const variantSlots = items.flatMap((item, itemIndex) => isRecord(item) && Array.isArray(item.variants) ? item.variants.map((_, variantIndex) => [itemIndex, variantIndex] as const) : []);
      const variants = balanceChoices(variantSlots.map(([itemIndex, variantIndex]) => ((items[itemIndex] as Record<string, unknown>).variants as unknown[])[variantIndex]), seed(`${part.code}:variants`));
      const withVariants = items.map((item, itemIndex) => {
        if (!isRecord(item) || !Array.isArray(item.variants)) return item;
        return { ...item, variants: item.variants.map((variant, variantIndex) => variants[variantSlots.findIndex(([i, v]) => i === itemIndex && v === variantIndex)] ?? variant) };
      });
      content = { ...content, items: withVariants };
    }
    return content === part.content ? part : { ...part, content };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function monthlyCheckpointKey(scopeHash: string, dayNumber: number, component: MonthlyDayComponent): string {
  return `monthly-lessons-checkpoint:${scopeHash}:day${dayNumber}:${component}`;
}

/**
 * Merges a (repair) response into the accepted parts. Only requested
 * components replace accepted ones: a repair answer that also re-sends an
 * accepted part (seen in reviews: an objective/instruction repair returned a
 * study-only grammar part and wiped the grammar items) must not overwrite it.
 * A review grammar repair keeps accepted fields the response left out.
 */
function mergeParts(
  prior: MonthlyLessonCandidate["parts"],
  generated: MonthlyLessonCandidate["parts"],
  requested: readonly string[] = MONTHLY_DAY_COMPONENTS,
  review = false
): MonthlyLessonCandidate["parts"] {
  const byCode = new Map(prior.map((part) => [part.code, part]));
  for (const part of generated) {
    const existing = byCode.get(part.code);
    if (existing && !requested.includes(part.code)) continue;
    byCode.set(part.code, review && existing && part.code === "grammar" && isRecord(existing.content) && isRecord(part.content) ? { ...part, content: { ...existing.content, ...Object.fromEntries(Object.entries(part.content).filter(([, value]) => value !== undefined)) } } : part);
  }
  return MONTHLY_DAY_COMPONENTS.flatMap((code) => byCode.get(code) ?? []);
}

/**
 * Support (expanded) terms are attached to their core card by the plan; a
 * separate vocabulary card for one is never allowed. Drop such cards before the
 * gate instead of spending a repair round on them (round 2: 29 first-try
 * MONTHLY_SUPPORT_TERM_AS_CORE_CARD findings at A2/B2). Core words are kept.
 */
export function dropSupportTermVocabularyCards<T extends LessonPartRecord>(contract: MonthlyCurriculumContract, parts: readonly T[]): T[] {
  const key = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
  const core = new Set(contract.coreTerms.map((term) => key(term.word)));
  const support = new Set(contract.supportTerms.map((term) => key(term.word)).filter((word) => !core.has(word)));
  return parts.map((part) => {
    if (part.code !== "vocabulary" || !isRecord(part.content) || !Array.isArray(part.content.items)) return part;
    const items = part.content.items.filter((item) => !(isRecord(item) && support.has(key(item.word))));
    return items.length === part.content.items.length ? part : { ...part, content: { ...part.content, items } };
  });
}

function componentsToRepair(report: MonthlyQualityReport, review = false): MonthlyDayComponent[] {
  const all: readonly MonthlyDayComponent[] = review ? MONTHLY_REVIEW_COMPONENTS : MONTHLY_DAY_COMPONENTS;
  const mapped = report.severe.map((finding) => finding.component).filter((component): component is MonthlyDayComponent => all.includes(component as MonthlyDayComponent));
  return mapped.length ? [...new Set(mapped)] : [...all];
}
