import { fillBlankCount, MONTHLY_GRAMMAR_EXAMPLE_MARKS_RULE, MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH, monthlyGrammarFormulaExampleIssueCount, monthlyGrammarFormulaExampleIssues, monthlyGrammarFormulaRows, normalizeFillBlankPrompt, MONTHLY_ANSWER_TRANSLATION_RULE, MONTHLY_COLLOCATION_TRANSLATION_MAX_CHARS, monthlyLessonDisplayTitle, monthlyReadablePlanObjective, monthlyModelRelationEntry, monthlyScopeHash, withMonthlyExpandedTerms, withMonthlyGrammarSteps, withoutAdvancedGrammarExampleTranslations, type CoreTerm, type GrammarStep, type MonthlyCurriculumContract, type MonthlyDaySpec, type PronunciationSound } from "@e4s/domain";
import { MONTHLY_LESSON_PART_CONTENT_CONTRACT, MONTHLY_REVIEW_CHOICE_SECTIONS, type AiTaskRunner, type MonthlyReviewChoiceSection } from "@e4s/ai";
import { evaluateMonthlyLessonQuality, monthlyLockedPlanExpectations, normalizeFormula, type MonthlyLessonCandidate, type MonthlyLockedPlanExpectations, type MonthlyQualityReport, type MonthlyQualityFinding } from "./monthly-quality.js";
import { rebalanceAnswerTextPositions, type AnswerTextChoice } from "../shared/answer-order.js";
import { monthlyGrammarRoadmapDayContract } from "./monthly-grammar-roadmap.js";
import { MONTHLY_REVIEW_COMPONENTS, monthlyReviewSpeakingContrastGuidance, monthlyReviewTargets } from "./monthly-review-quality.js";
import { collectMonthlyVerifiableItems, MONTHLY_ANSWER_VERIFICATION_PROMPT, monthlyAnswerVerificationFindings, type MonthlyAnswerVerificationVerdict } from "./monthly-answer-checks.js";

const REVIEW_STUDY_COMPONENTS = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"] as const;

export function monthlyDailyTeachingContract(day: MonthlyDaySpec, cefr: string, coreWords: readonly string[] = [], targetPositionWords: readonly string[] = [], grammarSteps: readonly Pick<GrammarStep, "formula" | "focus">[] = []): string {
  const vietnamese = cefr === "A1" || cefr === "A2";
  const language = vietnamese ? "Vietnamese" : "simple English";
  const words = coreWords.length ? ` (${coreWords.join(", ")})` : "";
  // Objectives in the current readable wording; the core words have their own line below, never inside the objective.
  const grammarObjective = day.grammarPlan ? monthlyReadablePlanObjective(day.grammarPlan.objective, coreWords) : undefined;
  const pronunciationObjective = day.pronunciationPlan ? monthlyReadablePlanObjective(day.pronunciationPlan.objective, coreWords) : undefined;
  return [
    "DAILY TEACHING PLAN V2 overrides generic daily/review shape instructions for grammar and pronunciation only. Keep every other component's existing contract.",
    `Teach day N${day.newLessonNumber}, grammar code ${day.grammarPlan?.code}, mode ${day.grammarPlan?.mode}, objective: ${grammarObjective}. A shared formula does not mean repeating the same teaching lesson. Explain the planned focus in ${language}.`,
    vietnamese ? "" : "The locked objective above may be written in Vietnamese: copy it verbatim only into grammar.objective; never quote or translate it into the objective, instruction or any other learner-facing text, which stays in English.",
    `grammar: return {dailyCode, objective, formula, text, examples, exampleMarks, items, steps?}. dailyCode and objective copy the locked daily plan. grammar.examples: at least 3 natural NEW workplace sentences (never copied from lockedScope.grammarStep examples) that together use at least two of today's core words${words}, each word spelled exactly as given. The pool's examples are references; do not copy the entire reference example list into the lesson. grammar.text is shown to learners as written: never put roadmap step labels in it (no "Bước 3 (Lỗi thường gặp):" or "Step 1 (Identify):"); write one or two short sentences for the rule, then at most one short tip sentence (for example how Vietnamese differs). Keep grammar.formula short: one pattern per line, or at most three patterns joined with " → " (the app shows each on its own line). ${MONTHLY_GRAMMAR_FORMULA_EXAMPLE_RULE}`,
    monthlyGrammarFormulaRowsContract(grammarSteps),
    "grammar.items: 3–5 distinct questions, each {id,prompt,options:[4 different strings],answer,explanation,milestoneId}. Use the day's practice mode. Explain why each answer is correct. Do not add unrelated grammar formulas.",
    day.grammarPlan?.recallMilestoneIds.length ? `Include one recall question with milestoneId from ${day.grammarPlan.recallMilestoneIds.join(", ")} (previous topic A); the other questions teach the current topic.` : "",
    `pronunciation: teach stage ${day.pronunciationPlan?.stage}, objective ${pronunciationObjective}. Return stage and objective matching the plan. This is a ${cefr} target: advanced stress/linking/intonation targets remain advanced features, not isolated beginner phoneme lessons.`,
    "pronunciation.focus copies the first locked target. pronunciation.words contains exactly the three examples listed by daySpec.pronunciationExampleIds (the compact standard-format summary). Never substitute another three words from the pool.",
    (day.pronunciationPlan?.targetIds.length ?? 0) > 1 ? "Also return pronunciation.reviewTargets: [{soundId,focus,words:[{word,ipa}]}], in dailyTeachingPlan.pronunciation.targetIds order, including exactly the assigned dailyTeachingPlan.pronunciation.exampleIds for each target. The UI and listening gates use this complete multi-target scope." : "",
    day.pronunciationPlan?.requiredPositions ? `For the read-aloud/mock task also return pronunciation.passage and pronunciation.targetPositions: [{soundId,exampleId}], exactly the eight requiredPositions from the plan, two per target; the passage must actually contain those eight example words.${targetPositionWords.length ? ` Write them in the passage exactly as spoken, each exactly once as a whole word or phrase, without notes such as (noun)/(verb): ${targetPositionWords.map((word) => `"${word}"`).join(", ")}. ${monthlyReadAloudPositionsContract(targetPositionWords, day.pronunciationPlan.requiredPositions)}` : ""}` : "",
    day.pronunciationPlan?.stage === "personalize" ? "Use recorded learner error evidence when supplied. With no error evidence, explicitly present this as a diagnostic over the taught targets; do not invent personal mistakes." : "",
    monthlyGrammarRoadmapDayContract(day, cefr),
    MONTHLY_WRITING_FILL_RULE,
    "The speaking task must apply the day's pronunciation stage and grammar objective, using at least two daily core words."
  ].filter(Boolean).join("\n");
}

/**
 * Read-aloud positions up front (23/12 B1 N14, three failed regenerations): the
 * exact count per surface form, the targetPositions array, and - when a single
 * target word is also inside a linking phrase target ("checked" and "checked it")
 * - that the word is written once on its own AND once inside the phrase. Until now
 * only the repair message said so, after the first failure.
 */
export function monthlyReadAloudPositionsContract(targetPositionWords: readonly string[], requiredPositions: readonly { soundId: string; exampleId: string }[] = []): string {
  const words = targetPositionWords.map((word) => word.trim()).filter(Boolean);
  if (!words.length) return "";
  const counts = [...words.reduce((map, word) => map.set(word, (map.get(word) ?? 0) + 1), new Map<string, number>())];
  const lower = (value: string) => value.toLocaleLowerCase("en-US");
  const insidePhrase = (word: string, phrase: string) => phrase !== word && new RegExp(`(?<![a-z])${lower(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "u").test(lower(phrase));
  const overlaps = counts.flatMap(([word]) => counts.filter(([phrase]) => insidePhrase(word, phrase)).map(([phrase]) => ({ word, phrase })));
  const overlapText = overlaps.length
    ? ` A word inside a listed phrase counts only for that phrase, so ${overlaps.map(({ word, phrase }) => `"${word}" is written once on its own (in another clause, not as part of "${phrase}") AND "${phrase}" once`).join("; ")}.`
    : "";
  const positions = requiredPositions.length ? ` pronunciation.targetPositions is exactly [${requiredPositions.map((position) => `{"soundId":"${position.soundId}","exampleId":"${position.exampleId}"}`).join(",")}].` : "";
  return `READ-ALOUD COUNT (checked word by word; any other count is rejected): the passage contains ${counts.map(([word, count]) => `"${word}" ×${count}`).join(", ")}, and no listed word or phrase occurs any other time (never repeat one, e.g. no second "${counts[counts.length - 1]![0]}").${overlapText} Other words with the same sounds may be used freely. Count every target in your passage before returning it.${positions}`;
}

/**
 * Grammar rows up front (23/12 B1 N14): the examples follow each step's FORMULA rows,
 * listed one by one, not the daily objective or the topic titles (the K2 objective
 * says "present simple vs continuous" while the step formulas are error-check rows).
 */
export function monthlyGrammarFormulaRowsContract(steps: readonly Pick<GrammarStep, "formula" | "focus">[]): string {
  const blocks = steps.map((step, index) => ({ index, focus: step.focus, rows: monthlyGrammarFormulaRows(step.formula) })).filter((block) => block.rows.length);
  if (!blocks.length) return "";
  const where = (index: number) => steps.length >= 2 ? `grammar.steps[${index}]` : "grammar";
  const lines = blocks.map((block) => `${where(block.index)} (${block.focus ? `focus: ${block.focus}; ` : ""}at least ${Math.max(2, block.rows.length)} examples): ${block.rows.map((row, position) => `row ${position + 1} "${row}"`).join(", ")}`);
  return `EXAMPLES FOLLOW THE FORMULA ROWS, NOT THE OBJECTIVE: the daily objective and the topic titles name the month's topics; the examples and the explanation text of each step teach only the rows of that step's formula.${steps.length >= 2 ? " Return grammar.steps with one entry per locked step, in this order, each { formula, text, examples, exampleMarks }." : ""} Write at least one example per row, and no example of a structure no row lists: ${lines.join(" | ")}. Each example's exampleMarks entry { row, marks } names one of these row numbers of its own block and the exact words that realise it. Each step's text explains its own rows (its focus), never a different tense contrast.`;
}

/** Writing fill task (23/12 B1 N14: three blanks and a four-part answer, three attempts in a row). */
export const MONTHLY_WRITING_FILL_RULE = "WRITING FILL: when writing.type is \"fill\", writing.prompt is one workplace sentence (an instruction before it is fine) with exactly ONE blank written as ____, and writing.answer is the single word or short phrase that fills it: no slashes, no list of answers. Never write two or more blanks, even when the grammar objective mentions filling the gaps in an email: that multi-gap practice belongs in grammar.items.";

/** The repair text sent to the model for one finding: its message, plus a concrete English fix where the message is only the Operator's Vietnamese label. */
export function monthlyRepairFindingText(finding: Pick<MonthlyQualityFinding, "code" | "component" | "message">, priorParts: readonly { code: string; content: Record<string, unknown> }[] = []): string {
  if (finding.code === "MONTHLY_CONTENT_INVALID" && finding.component === "writing" && finding.message.startsWith("Bài điền cần có đúng một chỗ trống")) {
    const prompt = priorParts.find((part) => part.code === "writing")?.content.prompt;
    const blanks = typeof prompt === "string" ? fillBlankCount(normalizeFillBlankPrompt(prompt)) : null;
    return `${finding.message} (writing.prompt ${blanks === null ? "does not have exactly one blank" : `has ${blanks} blank${blanks === 1 ? "" : "s"}`}; it needs exactly one blank ____. Rewrite writing as one workplace sentence with a single ____ and writing.answer as the one word or short phrase for it, no slashes or list of answers.)`;
  }
  return finding.message;
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
    "Options, answers, scripts, passages, sample answers and example sentences stay in English; the Vietnamese translation of a question and its answer goes only in questionTranslation / answerTranslation."
  ].join(" ");
  return [
    `LEARNER LANGUAGE (${cefr}): write every learner-facing string in English - lesson title, objective, instruction, prompts, questions, explanations, scripts, passages, samples and grammar/pronunciation notes. Only vocabulary meanings may be Vietnamese. Do not return questionTranslation or answerTranslation on any exercise, item or variant: from B1 the learner sees no Vietnamese translation.`,
    "Plan notes you receive (daySpec.skillExercises[].focus, the grammar and pronunciation objectives, the theme's communication goal) may be written in Vietnamese: they are guidance for you, never copy or translate them into learner text. The only exception is the locked grammar.objective / pronunciation.objective fields, copied verbatim."
  ].join(" ");
}

/**
 * Synonyms/antonyms on a vocabulary card (12/11): the plan's are attached with
 * their meaning automatically; one the model adds must carry the level's meaning
 * or it is removed (attachMonthlyExpandedTerms) and gated (MONTHLY_RELATION_MEANING_MISSING).
 */
export function monthlyVocabularyRelationContract(cefr: string): string {
  const shape = cefr === "A1" || cefr === "A2"
    ? "{ word, note } where note is its short Vietnamese meaning (e.g. { \"word\": \"finish\", \"note\": \"hoàn thành\" })"
    : "{ word, definition } where definition is a short simple-English definition of that word in this sense (2-14 words, no Vietnamese, never using the word itself; e.g. { \"word\": \"assist\", \"definition\": \"help someone do something\" })";
  const collocations = cefr === "A1" || cefr === "A2"
    ? `VOCABULARY COLLOCATIONS (${cefr}): each vocabulary item also returns collocationTranslations = one short natural Vietnamese meaning (at most ${MONTHLY_COLLOCATION_TRANSLATION_MAX_CHARS} characters) per collocations phrase, in the same order (e.g. collocations ["meet a client","a new client","client feedback"] -> collocationTranslations ["gặp khách hàng","khách hàng mới","phản hồi của khách hàng"]). It is shown as a popup only; the English phrases are read aloud, so never put Vietnamese inside collocations.`
    : `VOCABULARY COLLOCATIONS (${cefr}): collocations are English only; do not return collocationTranslations (no Vietnamese translations from B1).`;
  return `VOCABULARY SYNONYMS/ANTONYMS (${cefr}): the plan's synonyms and antonyms (lockedScope.supportTerms) are attached to each card automatically with their meaning; you may list them by word. Any other synonym or antonym you add must be a genuine one in the card's sense and written as ${shape}; a plain string or an entry without it is removed from the card.
${collocations}`;
}

/** The answerTranslation rule (A1–A2 only, 13/11); empty from B1, which takes no exercise translations. */
export function monthlyAnswerTranslationRule(cefr: string): string {
  return cefr === "A1" || cefr === "A2" ? `\n\n${MONTHLY_ANSWER_TRANSLATION_RULE}` : "";
}

/** daySpec.lessonNumber is the calendar slot (review days included); it is never the learner-facing lesson number. */
export const MONTHLY_LESSON_TITLE_RULE = "LESSON TITLE: name the lesson focus (grammar pattern or task). Do not put a lesson or day number in the title; daySpec.lessonNumber is an internal calendar slot that also counts review days. Lessons are numbered by daySpec.newLessonNumber and review days are labelled as review, never \"Bài N\".";

export const MONTHLY_DAY_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;
export type MonthlyDayComponent = (typeof MONTHLY_DAY_COMPONENTS)[number];

/**
 * Formula and examples (24/12 Bài 15): the locked formula decides what the examples teach. Shared by the daily
 * teaching contract, the review study call and the grammar repair request.
 */
export const MONTHLY_GRAMMAR_FORMULA_EXAMPLE_RULE = `FORMULA AND EXAMPLES MATCH: the formula of grammar (and of each grammar.steps entry) is locked; its text and examples teach exactly the structures that formula lists. A formula rule row is each pattern separated by \" / \" between two \"+\" patterns, \";\", \" vs \" or a new line. Every rule row gets at least one example that uses exactly that structure, so a formula with N rows has at least N examples (never fewer than 2), and every example uses a row of its own formula: never an example of a structure the formula does not list (no routine-vs-now examples under a state-verb or always + continuous formula, no past continuous under a have / have got formula). Error-check (common errors) formulas keep their (NOT ...) notes and their examples illustrate those same rules; a \"Wrong: ... Right: ...\" example counts for the rule it corrects, and common-errors steps keep that Wrong: ... Right: ... style. Only the formula and the step structure are locked: lockedScope.grammarStep(s) examples are style references only. Never copy them; write your own fresh, natural workplace sentences, using today's core words where they fit. ${MONTHLY_GRAMMAR_EXAMPLE_MARKS_RULE}`;

/** `verifyAnswers`: run the independent answer check (monthly_answer_verification) once the deterministic gate passes. */
export interface MonthlyAiGenerationOptions {
  verifyAnswers?: boolean;
  /** Monthly AI-call budget: when exhausted, the optional grammar formula/example repair call is skipped. */
  isBudgetExhausted?: () => boolean;
}

export async function generateMonthlyDayWithAi(contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string, priorGrammarExamples: readonly string[] = [], options: MonthlyAiGenerationOptions = {}): Promise<MonthlyDayGenerationResult> {
  return generateMonthlyContentWithAi("new", contract, dayNumber, runner, systemPrompt, priorGrammarExamples, options);
}

/** Review generation has a separate entry point so ordinary-day callers cannot silently generate a review DaySpec. */
export async function generateMonthlyReviewWithAi(contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string, options: MonthlyAiGenerationOptions = {}): Promise<MonthlyDayGenerationResult> {
  return generateMonthlyContentWithAi("review", contract, dayNumber, runner, systemPrompt, [], options);
}

async function generateMonthlyContentWithAi(kind: "new" | "review", contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string, priorGrammarExamples: readonly string[] = [], options: MonthlyAiGenerationOptions = {}): Promise<MonthlyDayGenerationResult> {
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

${monthlyReviewExerciseContract(coreTerms.length, grammarSteps.length, contract.cefr, monthlyReviewWordFormCandidates(coreTerms, daySupportTerms), monthlyReviewSpeakingContrastGuidance(contract, daySpec))}

${monthlyLearnerLanguageContract(contract.cefr)}

${monthlyVocabularyRelationContract(contract.cefr)}

${MONTHLY_LESSON_TITLE_RULE}

${MONTHLY_SINGLE_ANSWER_RULE}${monthlyAnswerTranslationRule(contract.cefr)}` : `${systemPrompt}

Part content field contract: ${MONTHLY_LESSON_PART_CONTENT_CONTRACT}

${monthlyLearnerLanguageContract(contract.cefr)}

${monthlyVocabularyRelationContract(contract.cefr)}

${MONTHLY_LESSON_TITLE_RULE}

${MONTHLY_SINGLE_ANSWER_RULE}${monthlyAnswerTranslationRule(contract.cefr)}

${MONTHLY_WORD_FORM_SCOPE_RULE}`;
      // Review exercise sections have their own task: its schema requires a retry variant on every choice item.
      // The daily teaching plan lists the formula rows itself; review study calls (and older plans) get them here, so exampleMarks rows are numbered the same way.
      const grammarRowsNote = (requested: readonly string[], taskId: string) => taskId === "monthly_lesson_day" && requested.includes("grammar") && !(contract.planSchemaVersion === 2 && kind === "new") ? `\n${monthlyGrammarFormulaRowsContract(grammarSteps)}` : "";
      const call = async (requested: readonly string[], note: string, maxOutputTokens: number, taskId: "monthly_lesson_day" | "monthly_review_exercises" = "monthly_lesson_day") => {
        let result;
        try { result = await runner.runTask(taskId, {
          month: contract.month,
          cefr: contract.cefr,
          daySpec,
          components: requested,
          // L-042: register alternatives are attached to the cards afterwards, not sent to the lesson model.
          lockedScope: { coreTerms: coreTerms.map(({ registerTerms: _registerTerms, ...term }) => term), grammarStep, grammarSteps, sound, sounds, pronunciationExamples, theme: contract.theme, supportTerms: daySupportTerms },
          priorParts,
          priorGrammarExamples,
          repairIssues: repairFindings,
          dailyTeachingPlan: { grammar: daySpec.grammarPlan, pronunciation: daySpec.pronunciationPlan },
          ...(kind === "review" ? { reviewListeningChecklist: coreTerms.map(term => ({ audioText: term.word, meaning: term.meaning })) } : {})
        }, { systemPrompt: `${note ? `${basePrompt}

${note}` : basePrompt}${grammarRowsNote(requested, taskId)}${contract.planSchemaVersion === 2 && kind === "new" ? `\n${monthlyDailyTeachingContract(daySpec, contract.cefr, coreTerms.map((term) => term.word), monthlyLockedPlanExpectations(contract, daySpec).targetPositionWords, grammarSteps)}` : ""}${repairFindings.length ? `\nREPAIR REQUIRED FOR REQUESTED COMPONENTS: ${repairFindings.map(finding => `${finding.component}: ${monthlyRepairFindingText(finding, priorParts)}`).join("; ")}. Correct every listed issue; do not repeat the same incomplete output. Preserve accepted components.` : ""}`, maxOutputTokens, temperature: 0.2, maxAttempts: 2 });
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
          call(studyCodes, `This request returns only the study-tab parts listed in components. For grammar return formula, text, examples and steps, without items. ${MONTHLY_GRAMMAR_FORMULA_EXAMPLE_RULE}`, 10_000),
          call(exerciseCodes, "This request returns only the review exercise sections listed in components, as sections.<code>. For grammar return only { items } (the study formula is produced separately). Keep the title short.", 14_000, "monthly_review_exercises")
        ]);
        title = study.title;
        const byCode = new Map(study.parts.map((part) => [part.code, part]));
        for (const part of exercises.parts) {
          const existing = byCode.get(part.code);
          byCode.set(part.code, existing && part.code === "grammar" ? { ...existing, content: { ...existing.content, ...(Array.isArray(part.content.items) ? { items: part.content.items } : {}) } } : part);
        }
        rawParts = [...byCode.values()];
      } else {
        const exercisesOnly = kind === "review" && !studyCodes.length;
        const single = exercisesOnly
          ? await call(components, "This request returns only the review exercise sections listed in components, as sections.<code>. Keep the title short.", 14_000, "monthly_review_exercises")
          : await call(components, kind === "review" && components.includes("grammar") ? MONTHLY_GRAMMAR_FORMULA_EXAMPLE_RULE : "", kind === "review" ? 14_000 : 8_000);
        title = single.title;
        rawParts = single.parts;
      }
      // The plan, not the model, decides each core word's expanded terms: attach them deterministically.
      const vocabularyParts = withMonthlyExpandedTerms(rawParts, coreTerms, daySupportTerms, contract.cefr);
      const dailyParts = vocabularyParts.map(part => part.code === "grammar" && daySpec.grammarPlan ? { ...part, content: { ...part.content, milestoneIds: daySpec.grammarPlan.milestoneIds, recallMilestoneIds: daySpec.grammarPlan.recallMilestoneIds } } : part);
      const enriched = contract.planSchemaVersion === 2 && kind === "new" ? dailyParts : withMonthlyGrammarSteps(vocabularyParts, grammarSteps);
      const parts = kind === "review" ? normalizeMonthlyReviewParts(enriched) : enriched;
      return { title, parts: parts.map((part) => ({ code: part.code, ...(part.title ? { title: part.title } : {}), content: part.content })) };
    },
    ...(kind === "review" ? { repairLight: async ({ daySpec, coreTerms, grammarSteps, parts, report }: MonthlyLightRepairInput) => {
      const requests = monthlyReviewLightRepairRequests(parts, report.light);
      if (!requests.length) return null;
      const daySupportTerms = contract.supportTerms.filter((term) => (daySpec.reviewExpandedTermIds ?? []).includes(term.id));
      const prompt = `${systemPrompt}

${monthlyReviewExerciseContract(coreTerms.length, grammarSteps.length, contract.cefr, monthlyReviewWordFormCandidates(coreTerms, daySupportTerms), monthlyReviewSpeakingContrastGuidance(contract, daySpec))}

${monthlyLearnerLanguageContract(contract.cefr)}

${MONTHLY_REVIEW_ITEM_REPAIR_RULE}`;
      const result = await runner.runTask("monthly_review_item_repair", {
        month: contract.month,
        cefr: contract.cefr,
        lockedScope: { coreTerms: coreTerms.map((term) => ({ word: term.word, meaning: term.meaning, type: term.type })), theme: contract.theme },
        repairItems: requests.map(({ section, id, issues, item }) => ({ section, id, issues, item }))
      }, { systemPrompt: prompt, maxOutputTokens: 8_000, temperature: 0.2, maxAttempts: 2 });
      const output = result.output as { items?: Array<{ section: string; id: string; item: Record<string, unknown> }> };
      return normalizeMonthlyReviewParts(mergeMonthlyReviewItemRepairs(parts, requests, output.items ?? []));
    } } : {}),
    // One grammar-only repair round when the formula rows and examples do not match (bounded: one extra call per lesson).
    repairGrammarExamples: { ...(options.isBudgetExhausted ? { isBudgetExhausted: options.isBudgetExhausted } : {}) },
    // The model marks every grammar example's row and words (13/11): a new generation without marks is repaired like a row mismatch.
    requireGrammarMarks: true,
    ...(options.verifyAnswers ? { verifyAnswers: async ({ daySpec, parts }: { daySpec: MonthlyDaySpec; parts: MonthlyLessonCandidate["parts"] }) => monthlyAnswerVerification(contract, daySpec, parts, runner) } : {})
  });
  return generated;
}

/** Content rules that keep the answer key unambiguous; appended to every monthly lesson and review request. */
export const MONTHLY_SINGLE_ANSWER_RULE = [
  "ONE CORRECT ANSWER (an independent checker solves every item without the key; an item with a wrong key or a second correct option is sent back):",
  "the key agrees with its sentence (plural subject: The slides aren't ready; a possessive before nothing is mine/yours/ours: The notes are mine); every distractor is wrong in that exact sentence, never merely less typical (the simple past is also correct for a past habit, so never offer \"assessed\" next to \"used to assess\"; \"When\" and \"While\" are both correct before a past continuous clause);",
  "a document, report or file is never the doer of read/write/review/check (the reports have been read, not have been reading); a recall question labelled with a previous topic's milestoneId tests that topic's structure in its answer (to be: am/is/are), never today's topic."
].join(" ");

/** Daily Word form (word_class) scope (December 2026: A2 L3 invented "colleagueship" twice). */
export const MONTHLY_WORD_FORM_SCOPE_RULE = "WORD FORM SCOPE: build the word_class question on one of today's core words that is a verb or has a word family on its vocabulary card (lockedScope.supportTerms word_family or the card's family list). Every option is a form the learner meets in this lesson: the word itself, a member of its family list, or a regular -s/-ed/-ing form of a verb (send / sends / sent / sending). Never add a suffix to a noun that has no family (colleague, feedback, deadline: no colleagueship, colleagueing, feedbacked); choose another core word instead.";

/**
 * Independent answer check (December 2026): solves every choice item without
 * the key and returns severe findings for a disputed key, a second correct
 * option or an off-label recall item. A failed call never fails the lesson.
 */
export async function monthlyAnswerVerification(contract: MonthlyCurriculumContract, daySpec: MonthlyDaySpec, parts: MonthlyLessonCandidate["parts"], runner: AiTaskRunner): Promise<MonthlyQualityFinding[]> {
  const items = collectMonthlyVerifiableItems(contract, daySpec, parts);
  if (!items.length) return [];
  let verdicts: MonthlyAnswerVerificationVerdict[];
  try {
    const result = await runner.runTask("monthly_answer_verification", {
      cefr: contract.cefr,
      items: items.map(({ ref, prompt, options, context, mustTest }) => ({ ref, prompt, options, ...(context ? { context } : {}), ...(mustTest ? { mustTest } : {}) }))
    }, { systemPrompt: MONTHLY_ANSWER_VERIFICATION_PROMPT, maxOutputTokens: 6_000, temperature: 0, maxAttempts: 2 });
    const output = result.output as { items?: unknown };
    verdicts = Array.isArray(output?.items) ? output.items.filter((entry): entry is MonthlyAnswerVerificationVerdict => isRecord(entry) && typeof entry.ref === "string" && Array.isArray(entry.correctOptions)) : [];
  } catch {
    return [];
  }
  return monthlyAnswerVerificationFindings(items, verdicts, daySpec.lessonNumber);
}

export const MONTHLY_REVIEW_ITEM_REPAIR_RULE = [
  "REVIEW ITEM REPAIR (only the items in repairItems; every other part of the review is accepted and unchanged):",
  "Return items = one entry per repairItems entry: { section, id, item }, with section and id copied. item is the complete item: the same id, audioText (listening), prompt intent and answer text, plus exactly 1 entry in variants.",
  "issue variant_missing: add variants = [one retry item with the same fields (prompt, options x4, answer, explanation, and at A1-A2 only questionTranslation, answerTranslation)] that tests the same point in a different context and is never a copy. listening: the SAME audioText (the same core word) and the same correct meaning, with 3 different distractor meanings; word_use / grammar: the same word or grammar point in a new workplace sentence; word_class: the same week word in a new sentence; reading: a different question about the same passage.",
  "Follow the learner-language rule above for prompts and explanations."
].join("\n");

export interface MonthlyReviewItemRepairRequest {
  section: MonthlyReviewChoiceSection;
  id: string;
  issues: Array<"variant_missing">;
  item: Record<string, unknown>;
}

type ReviewPart = { code: string; title?: string; content: Record<string, unknown> };

/**
 * Items behind the repairable light findings: every choice item without a
 * variant in a section flagged MONTHLY_REVIEW_VARIANT_MISSING.
 */
export function monthlyReviewLightRepairRequests(parts: readonly ReviewPart[], light: readonly MonthlyQualityFinding[]): MonthlyReviewItemRepairRequest[] {
  const flagged = (code: string) => new Set(light.filter((finding) => finding.code === code).map((finding) => finding.component));
  const variantSections = flagged("MONTHLY_REVIEW_VARIANT_MISSING");
  const requests: MonthlyReviewItemRepairRequest[] = [];
  for (const part of parts) {
    const section = (MONTHLY_REVIEW_CHOICE_SECTIONS as readonly string[]).includes(part.code) ? part.code as MonthlyReviewChoiceSection : null;
    if (!section || !Array.isArray(part.content.items)) continue;
    for (const item of part.content.items) {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) continue;
      const variants = Array.isArray(item.variants) ? item.variants.filter(isRecord) : [];
      const issues: MonthlyReviewItemRepairRequest["issues"] = [];
      if (variantSections.has(section) && !variants.length) issues.push("variant_missing");
      if (issues.length) requests.push({ section, id: item.id, issues, item });
    }
  }
  return requests;
}

/**
 * Merges a targeted item repair into the accepted review: only the requested
 * fix is taken from the response - a missing variant.
 * Everything else in the accepted item stays; the quality gate re-checks the result.
 */
export function mergeMonthlyReviewItemRepairs<T extends ReviewPart>(parts: readonly T[], requests: readonly MonthlyReviewItemRepairRequest[], repaired: ReadonlyArray<{ section: string; id: string; item: unknown }>): T[] {
  const bySlot = new Map(repaired.filter((entry) => isRecord(entry.item)).map((entry) => [`${entry.section}:${entry.id}`, entry.item as Record<string, unknown>]));
  const wanted = new Map(requests.map((request) => [`${request.section}:${request.id}`, request]));
  return parts.map((part) => {
    if (!Array.isArray(part.content.items)) return part;
    let changed = false;
    const items = part.content.items.map((raw) => {
      if (!isRecord(raw) || typeof raw.id !== "string") return raw;
      const key = `${part.code}:${raw.id}`;
      const request = wanted.get(key);
      const returned = bySlot.get(key);
      if (!request || !returned) return raw;
      const item: Record<string, unknown> = { ...raw };
      const ownVariants = Array.isArray(item.variants) ? item.variants.filter(isRecord) : [];
      const newVariant = (Array.isArray(returned.variants) ? returned.variants.filter(isRecord) : [])[0];
      if (request.issues.includes("variant_missing") && !ownVariants.length && newVariant) {
        // The retry of a listening item plays the same word the learner missed.
        item.variants = [part.code === "listening" && typeof item.audioText === "string" && !textOf(newVariant.audioText) ? { ...newVariant, audioText: item.audioText } : { ...newVariant }];
        changed = true;
      }
      return item;
    });
    return changed ? { ...part, content: { ...part.content, items } } : part;
  });
}

function textOf(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

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
export function monthlyReviewExerciseContract(coreCount: number, grammarStepCount: number, cefr: string, wordForm?: { suitable: readonly MonthlyWordFormCandidate[]; unsuitable: readonly string[] }, speakingContrast = ""): string {
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
    `Each exercise section's content has items: [{ id, prompt, options, answer, explanation, ${vietnamese ? "questionTranslation, answerTranslation, " : ""}variants }]. explanation: at most 2 sentences in ${explain}, why the answer is right. Never copy daily-lesson sentences verbatim.`,
    `VARIANTS ARE REQUIRED on every listening, word_use, word_class, grammar and reading item (an item without variants is incomplete and is sent back): variants = [exactly 1 retry item] with the item's fields { id, prompt, options (4), answer, explanation${vietnamese ? ", questionTranslation, answerTranslation" : ""} }, testing the same point in a different context, never a copy. listening: the SAME audioText (the same core word: the retry tests the word the learner missed) and the same correct meaning as answer, with 3 different distractor meanings; word_use / grammar: the same word or grammar point in a new workplace sentence; word_class: the same week word in a new sentence; reading: a different question about the same passage. Example listening item: {"id":"l1","audioText":"client","prompt":"${listeningPrompt}","options":["khách hàng","báo cáo","cuộc họp","hạn chót"],"answer":"khách hàng","explanation":"…",${vietnamese ? `"questionTranslation":"Nghe rồi chọn nghĩa của từ","answerTranslation":"khách hàng",` : ""}"variants":[{"id":"l1-v1","audioText":"client","prompt":"${listeningPrompt}","options":["đồng nghiệp","khách hàng","công ty","nhiệm vụ"],"answer":"khách hàng","explanation":"…"${vietnamese ? `,"questionTranslation":"Nghe rồi chọn nghĩa của từ","answerTranslation":"khách hàng"` : ""}}]}.`,
    vietnamese
      ? `questionTranslation / answerTranslation (${cefr}): on every item and variant that has an answer, a short natural Vietnamese translation of its prompt (the English sentence translated too, the blank kept as ____) and of its correct answer (${MONTHLY_ANSWER_TRANSLATION_RULE}) They are shown only after the learner answers correctly and never read aloud; the read-aloud and free-response speaking items (no answer) take none.`
      : `No questionTranslation / answerTranslation (${cefr}): from B1 the learner sees no Vietnamese translation, so items and variants never carry these fields.`,
    vietnamese
      ? "Every prompt the learner reads is written in Vietnamese (e.g. \"Chọn dạng đúng của từ để điền vào chỗ trống: …\", \"Đọc tin nhắn và chọn đáp án đúng.\"); only the English target sentence, options and answers stay in English."
      : "Every prompt, question, instruction and explanation is written in English; only the listening options/answers (word meanings) are Vietnamese.",
    "Distractors: every option is a real, correctly spelled English word or phrase of the same kind as the answer (never invented forms such as sended, maked, gived, feedbacked, accurating); options are similar in length so the correct answer is not simply the longest one: in every item and variant at least one wrong option is as long as or longer than the answer (count characters).",
    `listening.items: exactly ${target.listening} items, one per core word: audioText = the English core word (spoken by the app, not shown), prompt "${listeningPrompt}", options = 4 Vietnamese meanings of week words of similar length, answer = the meaning of the spoken word.`,
    `word_use.items: exactly ${target.wordUse} items mixing: choose the synonym/antonym, choose the word that belongs under an umbrella word, fill a week word into a workplace sentence (blank as ____). 4 English options.`,
    `word_class.items (Word form): exactly ${target.wordForm} items: a workplace sentence with one blank (____, never dashes) where the learner chooses the correct form of a week word (e.g. decide / decision / decisive / decisively, or the right tense: send / sends / sent / sending). Choose only week words that really have several forms: a verb or a word with a real word family; a noun without a family (e.g. feedback, deadline, colleague) is never used, and never gets -ing, -ed, -ly or -ship added.${candidates} 4 English options, each a real English word that is a form of the same word or its family; the sentence must accept only one of them. Never ask for the word class or part of speech, never use labels such as noun/verb/adjective/adverb as options, and never give the answer word unchanged in brackets.`,
    `grammar.items: exactly ${target.grammar} items, one per locked grammar step in order, each in that step's exercise type and using week words; add 1 more item reviewing the previous week's topic when there is one. 4 English options.`,
    `reading content = { passage, items }: passage = one workplace message or email of ${target.readingWords.min}-${target.readingWords.max} words that uses at least ${target.readingWeekWords} week words and this week's grammar; items = exactly 3 comprehension questions with 4 English options. Never return reading as a single question with prompt/options/answer at the top level.`,
    `speaking.items: exactly 4 items in this order: (a) 2 minimal-pair (listen-and-choose) items: { id, prompt, audioText, options, answer, explanation }, where options is EXACTLY 2 strings (never 3 or 4: this is not a 4-option choice task), audioText = answer = the option the app speaks, and explanation says in at most 2 sentences what differs between the 2 options. ${speakingContrast ? `Build each pair from this week's pronunciation items: ${speakingContrast}.` : "options: one of this week's pronunciation example words (lockedScope.pronunciationExamples) and a real, common word that sounds exactly the same except for the target sound, which is replaced by one neighbouring sound (ship / sheep, think / sink, fan / van; never pairs such as event / segment, bat / box or sheet / shift)."} Never a vulgar or offensive word, never a pair unrelated to this week's examples; (b) 1 read-aloud item: prompt "${readAloudPrompt}", passage = one natural, grammatical, meaningful workplace sentence (at most 20 words, not a list of words) containing at least 2 of this week's pronunciation examples, each copied exactly as written (a phrase example stays one whole phrase; never write notes such as (noun)/(verb)), no options, no answer; (c) 1 free-response item: prompt = a workplace situation asking for 1-2 sentences, requiredWords = 4-6 words copied exactly from this week's core words (never other words such as could, already, effective), minRequiredWords = 2, no options, no answer, never name a grammar formula.`,
    "Every core word appears at least twice across the review (listening plus one other section).",
    "Learner-facing text never mentions internal planning terms (core term, expanded term, người học) and never pastes the theme's communication goal."
  ].filter(Boolean).join("\n");
}

/**
 * Copies the reading passage onto each reading item (the review runtime shows it per question) and fills missing ids.
 * Reading that came back in the daily single-question shape (passage plus a top-level
 * prompt/options/answer, no items) keeps that question as items[0], and a passage
 * written only on the items or under message/email/body is lifted to the section, so
 * the gate reports the real gap (missing questions) instead of a missing passage.
 */
export function normalizeMonthlyReviewParts<T extends { code: string; content: Record<string, unknown> }>(rawParts: readonly T[]): T[] {
  const parts = rawParts.map((part) => part.code === "reading" ? { ...part, content: normalizeReviewReading(part.content) } : part);
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

function normalizeReviewReading(content: Record<string, unknown>): Record<string, unknown> {
  const textOf = (value: unknown) => typeof value === "string" && value.trim() ? value : "";
  const next = { ...content };
  const items = Array.isArray(next.items) ? next.items.filter(isRecord) : [];
  if (!textOf(next.passage) && !textOf(next.text)) {
    const lifted = textOf(next.message) || textOf(next.email) || textOf(next.body) || items.map((item) => textOf(item.passage)).find(Boolean) || "";
    if (lifted) next.passage = lifted;
  }
  if (!items.length && textOf(next.prompt) && Array.isArray(next.options) && textOf(next.answer)) {
    next.items = [{ prompt: next.prompt, options: next.options, answer: next.answer, ...(textOf(next.explanation) ? { explanation: next.explanation } : {}), ...(Array.isArray(next.variants) ? { variants: next.variants } : {}) }];
    delete next.options;
    delete next.answer;
  }
  return next;
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
  /** On failure: the final failing candidate, kept for the Operator's diagnosis (never approvable). */
  candidate?: MonthlyLessonCandidate | null;
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
  /**
   * Optional targeted repair after the severe gate passes: returns the parts with
   * light findings fixed (or null). A repair is kept part by part, only when it
   * adds no severe finding and lowers the light count (product rule: at most two
   * light findings, each acknowledged by the Operator, before approval).
   */
  repairLight?: (input: MonthlyLightRepairInput) => Promise<MonthlyLessonCandidate["parts"] | null>;
  /**
   * Optional independent answer check once the deterministic gate passes. Its
   * findings are severe: they send the named components back to repair like
   * any other severe finding (December 2026: approved wrong keys).
   */
  verifyAnswers?: (input: { daySpec: MonthlyDaySpec; parts: MonthlyLessonCandidate["parts"] }) => Promise<MonthlyQualityFinding[]>;
  /**
   * Optional targeted grammar repair once the lesson passes the gate: when the
   * formula rows and the examples do not match (MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH),
   * `generate` is asked once more for the grammar part only. Only its text and
   * examples are taken, and only when the mismatch shrinks without a new finding.
   * Skipped when the AI-call budget is exhausted.
   */
  repairGrammarExamples?: { isBudgetExhausted?: () => boolean };
  /** Grammar examples must carry exampleMarks { row, marks } (AI generation); a fake generator in a test may leave it off. */
  requireGrammarMarks?: boolean;
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
  const qualityOptions = { requireGrammarMarks: input.requireGrammarMarks === true };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await input.generate({ contract: input.contract, dayNumber: input.dayNumber, components: requestedComponents, daySpec, coreTerms, grammarStep, grammarSteps, sound, sounds, pronunciationExamples, priorParts: parts, repairFindings: report.severe });
    // The model sees the raw calendar slot (daySpec.lessonNumber, which counts review days); a "Bài N"
    // title must use the new-lesson ordinal, and a review day is never titled "Bài N".
    title = monthlyLessonDisplayTitle(generated.title, { kind: daySpec.kind, newLessonNumber: daySpec.newLessonNumber ?? input.contract.daySpecs.filter((day) => day.kind === "new" && day.lessonNumber <= daySpec.lessonNumber).length, reviewWeekNumber: daySpec.reviewWeekNumber }) || title;
    // D1 (approved 11/11): the plan, not the model, owns the locked fields; the gate below still verifies them.
    parts = applyMonthlyLockedPlanFields(input.contract, daySpec, keepMeaningfulVocabularyRelations(input.contract, dropSupportTermVocabularyCards(input.contract, mergeParts(parts, generated.parts, requestedComponents, kind === "review"))));
    const candidate = { title, parts };
    report = evaluateMonthlyLessonQuality(input.contract, input.dayNumber, candidate, input.priorGrammarExamples, qualityOptions);
    if (report.severe.length === 0 && input.verifyAnswers) {
      const disputed = await input.verifyAnswers({ daySpec, parts });
      if (disputed.length) report = { ...report, severe: disputed };
    }
    if (report.severe.length === 0) {
      if (input.repairGrammarExamples && !input.repairGrammarExamples.isBudgetExhausted?.()) {
        ({ parts, report } = await repairMonthlyGrammarFormulaExamples(input.contract, input.dayNumber, title, parts, report, input.priorGrammarExamples, qualityOptions, async (finding) => {
          const generated = await input.generate({ contract: input.contract, dayNumber: input.dayNumber, components: ["grammar"], daySpec, coreTerms, grammarStep, grammarSteps, sound, sounds, pronunciationExamples, priorParts: parts, repairFindings: [finding] });
          return generated.parts.find((part) => part.code === "grammar")?.content ?? null;
        }));
      }
      if (input.repairLight) ({ parts, report } = await repairMonthlyLightFindings(input.contract, input.dayNumber, title, parts, report, input.priorGrammarExamples, qualityOptions, (current) => input.repairLight!({ daySpec, coreTerms, grammarSteps, parts: current.parts, report: current.report })));
      return { status: "ready", lesson: { title, parts: shuffleMonthlyAnswerOrder(parts, scopeHash, input.dayNumber) }, report, scopeHash, attempts: attempt };
    }
    requestedComponents = componentsToRepair(report, daySpec.kind === "review");
  }
  return { status: "failed", lesson: null, candidate: parts.length ? { title, parts } : null, report, scopeHash, attempts: maxAttempts };
}

type LessonPartRecord = MonthlyLessonCandidate["parts"][number];

export interface MonthlyLightRepairInput {
  daySpec: MonthlyDaySpec;
  coreTerms: readonly CoreTerm[];
  grammarSteps: readonly GrammarStep[];
  parts: MonthlyLessonCandidate["parts"];
  report: MonthlyQualityReport;
}

/**
 * Takes only the explanation and examples of a repaired grammar part (formula,
 * items, codes and objectives stay as accepted): top-level text/examples/
 * exampleTranslations, and per step when both have the same number of steps.
 */
export function mergeMonthlyGrammarExampleRepair(accepted: Record<string, unknown>, repaired: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...accepted };
  const strings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : null;
  const take = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    if (typeof source.text === "string" && source.text.trim()) target.text = source.text;
    const examples = strings(source.examples);
    if (examples?.length) {
      target.examples = examples;
      const translations = strings(source.exampleTranslations);
      if (translations) target.exampleTranslations = translations; else delete target.exampleTranslations;
      // The row/word marks belong to these examples: never keep the old ones next to new sentences.
      if (Array.isArray(source.exampleMarks)) target.exampleMarks = source.exampleMarks; else delete target.exampleMarks;
    }
  };
  take(next, repaired);
  const own = Array.isArray(accepted.steps) ? accepted.steps : null;
  const fresh = Array.isArray(repaired.steps) ? repaired.steps : null;
  if (own && fresh && own.length === fresh.length) {
    next.steps = own.map((step, index) => {
      const source = fresh[index];
      if (!isRecord(step) || !isRecord(source)) return step;
      const copy = { ...step };
      take(copy, source);
      return copy;
    });
  }
  return next;
}

/**
 * One grammar-only repair round for MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH. The
 * repaired part is kept only when it adds no severe finding and no other light
 * finding, and leaves fewer mismatching grammar steps; a failed call keeps the lesson.
 */
async function repairMonthlyGrammarFormulaExamples(
  contract: MonthlyCurriculumContract,
  dayNumber: number,
  title: string,
  parts: MonthlyLessonCandidate["parts"],
  report: MonthlyQualityReport,
  priorGrammarExamples: readonly string[] | undefined,
  qualityOptions: { requireGrammarMarks?: boolean },
  repair: (finding: MonthlyQualityFinding) => Promise<Record<string, unknown> | null>
): Promise<{ parts: MonthlyLessonCandidate["parts"]; report: MonthlyQualityReport }> {
  const finding = report.light.find((candidate) => candidate.code === MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH);
  const index = parts.findIndex((part) => part.code === "grammar");
  const day = contract.daySpecs.find((candidate) => candidate.lessonNumber === dayNumber);
  if (!finding || index < 0 || !day) return { parts, report };
  let repaired: Record<string, unknown> | null;
  try { repaired = await repair(finding); } catch { return { parts, report }; }
  if (!repaired || !isRecord(repaired)) return { parts, report };
  const accepted = parts[index]!;
  const merged = mergeMonthlyGrammarExampleRepair(accepted.content, repaired);
  if (JSON.stringify(merged) === JSON.stringify(accepted.content)) return { parts, report };
  const trial = applyMonthlyLockedPlanFields(contract, day, parts.map((part, position) => position === index ? { ...part, content: merged } : part));
  const trialReport = evaluateMonthlyLessonQuality(contract, dayNumber, { title, parts: trial }, priorGrammarExamples, qualityOptions);
  const others = (light: readonly MonthlyQualityFinding[]) => light.filter((candidate) => candidate.code !== MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH).length;
  // Counted per row and example, not per step: a single-formula part (one issue at most) still improves when one row gains an example.
  const issueCount = (content: Record<string, unknown>) => monthlyGrammarFormulaExampleIssueCount(monthlyGrammarFormulaExampleIssues(content, { requireMarks: qualityOptions.requireGrammarMarks === true }));
  const better = issueCount(trial[index]!.content) < issueCount(accepted.content);
  return !trialReport.severe.length && others(trialReport.light) <= others(report.light) && better ? { parts: trial, report: trialReport } : { parts, report };
}

/** Up to two light-repair rounds; each changed part is kept only when it lowers the light count without a severe finding. */
async function repairMonthlyLightFindings(
  contract: MonthlyCurriculumContract,
  dayNumber: number,
  title: string,
  parts: MonthlyLessonCandidate["parts"],
  report: MonthlyQualityReport,
  priorGrammarExamples: readonly string[] | undefined,
  qualityOptions: { requireGrammarMarks?: boolean },
  repair: (current: { parts: MonthlyLessonCandidate["parts"]; report: MonthlyQualityReport }) => Promise<MonthlyLessonCandidate["parts"] | null>
): Promise<{ parts: MonthlyLessonCandidate["parts"]; report: MonthlyQualityReport }> {
  let current = { parts, report };
  for (let round = 0; round < 2 && current.report.light.length; round += 1) {
    let repaired: MonthlyLessonCandidate["parts"] | null;
    // A failed repair call never fails a lesson that already passed the gate.
    try { repaired = await repair(current); } catch { break; }
    if (!repaired) break;
    const before = current.report.light.length;
    for (const part of repaired) {
      const index = current.parts.findIndex((candidate) => candidate.code === part.code);
      if (index < 0 || JSON.stringify(current.parts[index]!.content) === JSON.stringify(part.content)) continue;
      const trial = current.parts.map((candidate, position) => position === index ? part : candidate);
      const trialReport = evaluateMonthlyLessonQuality(contract, dayNumber, { title, parts: trial }, priorGrammarExamples, qualityOptions);
      if (!trialReport.severe.length && trialReport.light.length < current.report.light.length) current = { parts: trial, report: trialReport };
    }
    if (current.report.light.length >= before) break;
  }
  return current;
}

/**
 * D1 / WP1: copies every plan-locked field into the generated parts before the
 * quality gate — grammar.dailyCode/objective and step formulas,
 * pronunciation.stage/objective/focus/words/reviewTargets/targetPositions.
 * Missing parts are never created and model-written extras (text, examples,
 * per-word notes) are kept.
 */
export function applyMonthlyLockedPlanFields<T extends LessonPartRecord>(contract: MonthlyCurriculumContract, day: MonthlyDaySpec, parts: readonly T[]): T[] {
  const expected = monthlyLockedPlanExpectations(contract, day);
  // B1–C1 grammar examples have no Vietnamese translations; drop any the model still returned (13/11).
  return withoutAdvancedGrammarExampleTranslations(contract.cefr, parts).map((part) => {
    if (!isRecord(part.content)) return part;
    if (part.code === "grammar") return { ...part, content: lockedGrammar(part.content, expected) };
    if (part.code === "pronunciation") return { ...part, content: lockedPronunciation(part.content, expected) };
    // A fill blank written as "______", "[blank]" or " … " is the same one gap: stored as the house "____".
    if (part.code === "writing" && typeof part.content.type === "string" && part.content.type.toLowerCase() === "fill" && typeof part.content.prompt === "string") {
      const prompt = normalizeFillBlankPrompt(part.content.prompt);
      return prompt === part.content.prompt ? part : { ...part, content: { ...part.content, prompt } };
    }
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

/**
 * 12/11: a synonym/antonym the model put on a core card beyond the plan is kept
 * only with the level's meaning (A1–A2 Vietnamese note, B1–C1 English
 * definition); the gate (MONTHLY_RELATION_MEANING_MISSING) then checks the rest.
 */
export function keepMeaningfulVocabularyRelations<T extends LessonPartRecord>(contract: MonthlyCurriculumContract, parts: readonly T[]): T[] {
  const key = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
  const coreByWord = new Map(contract.coreTerms.map((term) => [key(term.word), term]));
  return parts.map((part) => {
    if (part.code !== "vocabulary" || !isRecord(part.content) || !Array.isArray(part.content.items)) return part;
    let changed = false;
    const items = part.content.items.map((item) => {
      const core = isRecord(item) ? coreByWord.get(key(item.word)) : undefined;
      if (!core || !isRecord(item)) return item;
      const next: Record<string, unknown> = { ...item };
      for (const relation of ["synonym", "antonym"] as const) {
        const field = `${relation}s`;
        if (!Array.isArray(item[field])) continue;
        const planned = new Set(contract.supportTerms.filter((term) => term.relatedCoreTermId === core.id && term.relation === relation).map((term) => key(term.word)));
        const kept = (item[field] as unknown[]).flatMap((raw) => {
          const entry = typeof raw === "string" ? { word: raw } : isRecord(raw) ? raw : null;
          if (!entry || !key(entry.word)) return [];
          if (planned.has(key(entry.word))) return [raw];
          const meaningful = monthlyModelRelationEntry(entry, relation, contract.cefr);
          return meaningful ? [meaningful] : [];
        });
        if (kept.length !== (item[field] as unknown[]).length || kept.some((entry, index) => entry !== (item[field] as unknown[])[index])) { next[field] = kept; changed = true; }
      }
      return next;
    });
    return changed ? { ...part, content: { ...part.content, items } } : part;
  });
}

function componentsToRepair(report: MonthlyQualityReport, review = false): MonthlyDayComponent[] {
  const all: readonly MonthlyDayComponent[] = review ? MONTHLY_REVIEW_COMPONENTS : MONTHLY_DAY_COMPONENTS;
  const mapped = report.severe.map((finding) => finding.component).filter((component): component is MonthlyDayComponent => all.includes(component as MonthlyDayComponent));
  return mapped.length ? [...new Set(mapped)] : [...all];
}
