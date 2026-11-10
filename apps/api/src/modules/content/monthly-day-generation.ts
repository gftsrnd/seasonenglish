import { monthlyScopeHash, withMonthlyExpandedTerms, withMonthlyGrammarSteps, type CoreTerm, type GrammarStep, type MonthlyCurriculumContract, type MonthlyDaySpec, type PronunciationSound } from "@e4s/domain";
import { MONTHLY_LESSON_PART_CONTENT_CONTRACT, type AiTaskRunner } from "@e4s/ai";
import { evaluateMonthlyLessonQuality, type MonthlyLessonCandidate, type MonthlyQualityReport, type MonthlyQualityFinding } from "./monthly-quality.js";
import { MONTHLY_REVIEW_COMPONENTS, monthlyReviewTargets } from "./monthly-review-quality.js";

const REVIEW_STUDY_COMPONENTS = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"] as const;

export function monthlyDailyTeachingContract(day: MonthlyDaySpec, cefr: string): string {
  const language = cefr === "A1" || cefr === "A2" ? "Vietnamese" : "simple English";
  return [
    "DAILY TEACHING PLAN V2 overrides generic daily/review shape instructions for grammar and pronunciation only. Keep every other component's existing contract.",
    `Teach day N${day.newLessonNumber}, grammar code ${day.grammarPlan?.code}, mode ${day.grammarPlan?.mode}, objective: ${day.grammarPlan?.objective}. A shared formula does not mean repeating the same teaching lesson. Explain the planned focus in ${language}.`,
    "grammar: return {dailyCode, objective, formula, text, examples, items, steps?}. dailyCode and objective copy the locked daily plan. Write 3 natural NEW workplace examples using at least two of today's core words across them. The pool's examples are references; do not copy the entire reference example list into the lesson.",
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

${monthlyReviewExerciseContract(coreTerms.length, grammarSteps.length, contract.cefr)}` : `${systemPrompt}

Part content field contract: ${MONTHLY_LESSON_PART_CONTENT_CONTRACT}`;
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

${note}` : basePrompt}${contract.planSchemaVersion === 2 && kind === "new" ? `\n${monthlyDailyTeachingContract(daySpec, contract.cefr)}` : ""}${repairFindings.length ? `\nREPAIR REQUIRED FOR REQUESTED COMPONENTS: ${repairFindings.map(finding => `${finding.component}: ${finding.message}`).join("; ")}. Correct every listed issue; do not repeat the same incomplete output. Preserve accepted components.` : ""}`, maxOutputTokens, temperature: 0.2, maxAttempts: 2 });
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
          byCode.set(part.code, existing && part.code === "grammar" ? { ...existing, content: { ...existing.content, items: part.content.items } } : part);
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

/**
 * Friday review exercises (e4s_cau_truc_bai_on_cuoi_tuan, 03/11): six sections
 * of review-until-correct items. Counts scale with the week's core words.
 */
export function monthlyReviewExerciseContract(coreCount: number, grammarStepCount: number, cefr: string): string {
  const target = monthlyReviewTargets(coreCount, grammarStepCount);
  const explain = cefr === "A1" || cefr === "A2" ? "Vietnamese" : "simple English";
  return [
    "Friday review exercise contract (overrides the daily single-question shape for listening, word_use, word_class, grammar, reading, speaking; do not return a writing part):",
    "Keep objective, instruction, vocabulary (every core word of the week as a card with collocations), grammar (formula, text, examples, steps) and pronunciation as the study tab.",
    `Each exercise section's content has items: [{ id, prompt, options, answer, explanation, variants }]. explanation: at most 2 sentences in ${explain}, why the answer is right. variants: exactly 1 alternative item testing the same point in a different workplace context (same fields, different sentence, never a copy). Never copy daily-lesson sentences verbatim.`,
    `listening.items: exactly ${target.listening} items, one per core word: audioText = the English core word (spoken by the app, not shown), prompt "Nghe và chọn nghĩa đúng" (B1+: "Listen and choose the meaning"), options = 4 Vietnamese meanings of week words, answer = the meaning of the spoken word.`,
    `word_use.items: ${target.wordUse}-${target.wordUse + 1} items mixing: choose the synonym/antonym, choose the word that belongs under an umbrella word, fill a week word into a workplace sentence (blank as ____). 4 English options.`,
    `word_class.items (Word form): ${target.wordForm}-${target.wordForm + 1} items: choose the right form of a week word in a sentence (noun/verb/adjective/adverb, tense, plural). Do not name the target word class in the prompt; the blank is ____ (never dashes). 4 English options.`,
    `grammar.items: ${target.grammar} items, one per locked grammar step in order, each in that step's exercise type and using week words; add 1 more item reviewing the previous week's topic when there is one. 4 English options.`,
    `reading: passage = one workplace message or email of ${target.readingWords.min}-${target.readingWords.max} words that uses at least ${target.readingWeekWords} week words and this week's grammar; items = exactly 3 comprehension questions with 4 English options.`,
    "speaking.items: exactly 4 items in this order: (a) 2 minimal-pair items for this week's sounds: audioText = one word, options = the 2 words of the minimal pair, answer = the spoken word, explanation; (b) 1 read-aloud item: prompt \"Đọc to câu sau\" (B1+: \"Read this sentence aloud\"), passage = one sentence containing the week's sounds at least twice, no options, no answer; (c) 1 free-response item: prompt = a workplace situation asking for 1-2 sentences, requiredWords = 4-6 core words of the week, minRequiredWords = 2, no options, no answer, never name a grammar formula.",
    "Every core word appears at least twice across the review (listening plus one other section)."
  ].join("\n");
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
    parts = mergeParts(parts, generated.parts);
    const candidate = { title, parts };
    report = evaluateMonthlyLessonQuality(input.contract, input.dayNumber, candidate, input.priorGrammarExamples);
    if (report.severe.length === 0) return { status: "ready", lesson: candidate, report, scopeHash, attempts: attempt };
    requestedComponents = componentsToRepair(report, daySpec.kind === "review");
  }
  return { status: "failed", lesson: null, report, scopeHash, attempts: maxAttempts };
}

export function monthlyCheckpointKey(scopeHash: string, dayNumber: number, component: MonthlyDayComponent): string {
  return `monthly-lessons-checkpoint:${scopeHash}:day${dayNumber}:${component}`;
}

function mergeParts(
  prior: MonthlyLessonCandidate["parts"],
  generated: MonthlyLessonCandidate["parts"]
): MonthlyLessonCandidate["parts"] {
  const byCode = new Map(prior.map((part) => [part.code, part]));
  for (const part of generated) byCode.set(part.code, part);
  return MONTHLY_DAY_COMPONENTS.flatMap((code) => byCode.get(code) ?? []);
}

function componentsToRepair(report: MonthlyQualityReport, review = false): MonthlyDayComponent[] {
  const all: readonly MonthlyDayComponent[] = review ? MONTHLY_REVIEW_COMPONENTS : MONTHLY_DAY_COMPONENTS;
  const mapped = report.severe.map((finding) => finding.component).filter((component): component is MonthlyDayComponent => all.includes(component as MonthlyDayComponent));
  return mapped.length ? [...new Set(mapped)] : [...all];
}
