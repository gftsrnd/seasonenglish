import type { MonthlyCurriculumContract, MonthlyDaySpec } from "@e4s/domain";
import { MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH, monthlyGrammarFormulaExampleIssues, monthlyGrammarFormulaExampleMessage, monthlyCollocationTranslationIssues, monthlyExerciseTranslationIssues, monthlyExerciseTranslationsForLevel, monthlyRelationMeaningIssue, bracketHintWords, internalLearnerTerms, inventedWordForms, mentionsWordClass, monthlyPlanObjectivesMatch, monthlyPronunciationExampleText, monthlyReadablePlanObjective, offensiveWords, optionsAreWordClassLabels, validateLessonPublication } from "@e4s/domain";
import type { LessonPart } from "@e4s/contracts";
import { monthlyGrammarRoadmapDayIssues } from "./monthly-grammar-roadmap.js";
import { evaluateMonthlyReviewSections, MONTHLY_REVIEW_COMPONENTS, MONTHLY_REVIEW_SECTIONS } from "./monthly-review-quality.js";
import { monthlyAnswerKeyFindings } from "./monthly-answer-checks.js";
import { monthlyWordFormScopeFindings } from "./monthly-word-form-scope.js";
import { monthlyObjectiveFixHint, monthlyObjectiveIssues } from "./monthly-objective-quality.js";

const REQUIRED_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;

export interface MonthlyQualityFinding {
  severity: "severe" | "light";
  code: string;
  message: string;
  dayNumber: number;
  component: string;
}

export interface MonthlyQualityReport {
  severe: MonthlyQualityFinding[];
  light: MonthlyQualityFinding[];
  contractVersion: number;
}

export interface MonthlyLessonCandidate {
  title: string;
  parts: Array<{ code: string; content: Record<string, unknown> }>;
}

/**
 * Enforces the curriculum boundary independently of the AI prompt. A generator
 * may add sentences and activities, but it cannot introduce a new vocabulary
 * card, grammar step, or sound outside the locked MonthlyDaySpec.
 */
export function evaluateMonthlyLessonQuality(
  contract: MonthlyCurriculumContract,
  dayNumber: number,
  lesson: MonthlyLessonCandidate,
  priorGrammarExamples: readonly string[] = []
): MonthlyQualityReport {
  const day = contract.daySpecs.find((candidate) => candidate.lessonNumber === dayNumber);
  if (!day) throw new Error(`Monthly day ${dayNumber} is not in the curriculum contract`);
  const severe: MonthlyQualityFinding[] = [];
  const light: MonthlyQualityFinding[] = [];
  const parts = new Map(lesson.parts.map((part) => [part.code, part]));
  const review = day.kind === "review";
  for (const code of review ? MONTHLY_REVIEW_COMPONENTS : REQUIRED_COMPONENTS) {
    if (!parts.has(code)) severe.push(finding("MONTHLY_COMPONENT_MISSING", `Missing required ${code} component`, dayNumber, code));
  }

  const expected = monthlyLockedPlanExpectations(contract, day);
  const lockedPlanValues = monthlyLockedPlanValues(expected, lesson.parts);
  const contentValidation = validateLessonPublication([{
    dayNumber,
    title: lesson.title,
    durationMinutes: 15,
    parts: lesson.parts as unknown as LessonPart[]
  }], undefined, contract.cefr, { ...(lockedPlanValues ? { lockedPlanValues } : {}), requireVietnameseInstructions: true });
  for (const issue of contentValidation.issues) {
    // WP7: A1–A2 learner prompts must be Vietnamese, in daily lessons and every review section.
    if (issue.rule === "vietnamese_instructions") { severe.push(finding("MONTHLY_A1A2_INSTRUCTION_LANGUAGE", issue.message, dayNumber, issue.code)); continue; }
    // Review exercises use `items` per section (checked below), not the single daily question shape.
    // The daily part order also expects a writing part, which a review folds into speaking.
    if (review && ((MONTHLY_REVIEW_SECTIONS as readonly string[]).includes(issue.code) || issue.code === "writing" || issue.code === "order")) continue;
    // Advanced monthly targets are stress/linking/intonation features. Their
    // exact approved targets and IPA examples are checked below, not against
    // the older isolated-phoneme-only publication inventory.
    if (contract.planSchemaVersion === 2 && (review || !["A1", "A2"].includes(contract.cefr)) && issue.code === "pronunciation") continue;
    severe.push(finding("MONTHLY_CONTENT_INVALID", issue.message, dayNumber, issue.code));
  }

  const coreById = new Map(contract.coreTerms.map((term) => [term.id, term]));
  const coreByWord = new Map(contract.coreTerms.map((term) => [normalize(term.word), term]));
  const supportWords = new Set(contract.supportTerms.map((term) => normalize(term.word)));
  const vocabulary = items(parts.get("vocabulary")?.content);
  const scheduledTermIds = day.kind === "new" ? day.coreTermIds : day.reviewTermIds;
  const scheduledWords = new Set(scheduledTermIds.map((id) => normalize(coreById.get(id)?.word ?? "")));
  const actualWords = new Set(vocabulary.map((item) => normalize(asString(item.word))));
  // 12/11: objective.items are the learner's can-do bullets, never the day's core words.
  const objectiveIssues = monthlyObjectiveIssues(contract.cefr, parts.get("objective")?.content, [...actualWords, ...scheduledWords]);
  if (objectiveIssues.length) severe.push(finding("MONTHLY_OBJECTIVE_CAN_DO", `${monthlyObjectiveFixHint(contract.cefr)}. Fix: ${objectiveIssues.slice(0, 4).join("; ")}`, dayNumber, "objective"));

  if (day.kind === "new") {
    for (const termId of day.coreTermIds) {
      const term = coreById.get(termId);
      if (term && !actualWords.has(normalize(term.word))) severe.push(finding("MONTHLY_CORE_TERM_MISSING", `${term.word} is required by the locked day specification`, dayNumber, "vocabulary"));
    }
  }
  for (const word of actualWords) {
    const core = coreByWord.get(word);
    if (core && !scheduledWords.has(word)) {
      severe.push(finding(
        day.kind === "review" ? "MONTHLY_REVIEW_INTRODUCES_CORE_TERM" : "MONTHLY_CORE_TERM_SCOPE_MISMATCH",
        `${core.word} is outside this day's locked vocabulary scope`, dayNumber, "vocabulary"
      ));
    }
    if (supportWords.has(word)) severe.push(finding("MONTHLY_SUPPORT_TERM_AS_CORE_CARD", `${word} is a support term and cannot become a vocabulary card`, dayNumber, "vocabulary"));
  }
  for (const item of vocabulary) {
    const word = asString(item.word);
    if (!word || !coreByWord.has(normalize(word))) continue;
    // Each vocabulary card shows three common phrases ("Cụm từ thường dùng"), as in the weekly lessons.
    const phrases = (Array.isArray(item.collocations) ? item.collocations : Array.isArray(item.examples) ? item.examples : []).filter((phrase) => typeof phrase === "string" && phrase.trim());
    if (phrases.length < 3) severe.push(finding("MONTHLY_VOCABULARY_PHRASES_MISSING", `${word} needs 3 common phrases (collocations) containing the word; it has ${phrases.length}`, dayNumber, "vocabulary"));
    // 12/11: A1–A2 cards show a translate icon on each common phrase (B1+ lines are dropped by attachMonthlyExpandedTerms).
    if (contract.cefr === "A1" || contract.cefr === "A2") for (const message of monthlyCollocationTranslationIssues(contract.cefr, Array.isArray(item.collocations) ? item.collocations : [], item.collocationTranslations)) severe.push(finding("MONTHLY_COLLOCATION_TRANSLATION", `${word}: ${message}`, dayNumber, "vocabulary"));
    if (hasNoLexicalRelation(item)) light.push({ severity: "light", code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING", message: `${word} is missing a synonym or antonym`, dayNumber, component: "vocabulary" });
    // 12/11: every synonym/antonym chip shows its meaning (A1–A2 Vietnamese note, B1–C1 English definition).
    // Planned entries take theirs from the approved plan (gated when the pool is built); the rest must carry one.
    const missing = relationEntriesWithoutMeaning(contract, coreByWord.get(normalize(word))!.id, item);
    if (missing.length) severe.push(finding("MONTHLY_RELATION_MEANING_MISSING", `${word}: every synonym/antonym not in the plan needs ${["A1", "A2"].includes(contract.cefr) ? "a short Vietnamese meaning in note" : "a short simple-English definition (2-14 words, no Vietnamese, not using the word itself) in definition"}; fix or remove: ${missing.join(", ")}`, dayNumber, "vocabulary"));
  }

  const grammarIds = day.kind === "review" ? day.reviewGrammarStepIds ?? [] : day.grammarStepIds ?? [day.grammarStepId];
  const grammarSteps = grammarIds.map((id) => contract.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === id)).filter((step): step is NonNullable<typeof step> => Boolean(step));
  // Review days may split the formula into grammar.steps (one block per step); accept either place.
  const grammarContent = parts.get("grammar")?.content;
  const stepFormulas = Array.isArray(grammarContent?.steps) ? grammarContent.steps.map((step) => step && typeof step === "object" ? asString((step as Record<string, unknown>).formula) : "") : [];
  const formula = normalizeFormula([asString(grammarContent?.formula), ...stepFormulas].join("\n"));
  if (!grammarIds.length || grammarSteps.length !== grammarIds.length || grammarSteps.some((step) => !formula.includes(normalizeFormula(step.formula)))) {
    severe.push(finding("MONTHLY_GRAMMAR_SCOPE_MISMATCH", `Grammar formula does not match every locked grammar step. grammar.formula${grammarSteps.length > 1 ? " (or grammar.steps[].formula, one per step in order)" : ""} must contain verbatim: ${grammarSteps.map((step) => `"${step.formula}"`).join("; ")}`, dayNumber, "grammar"));
  }

  // 24/12 Bài 15: every formula rule row needs an example that uses it, and every example a row.
  // Advisory light finding: shown to the Operator, never counted toward the two-light approval limit.
  const formulaExampleIssues = monthlyGrammarFormulaExampleIssues(grammarContent);
  if (formulaExampleIssues.length) light.push({ severity: "light", code: MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH, message: monthlyGrammarFormulaExampleMessage(formulaExampleIssues), dayNumber, component: "grammar" });

  const pronunciation = parts.get("pronunciation")?.content;
  const focus = asString(pronunciation?.focus);
  const words = items(pronunciation).map((item) => ({ word: asString(item.word), ipa: asString(item.ipa) }));
  const reviewTargets = Array.isArray(pronunciation?.reviewTargets) ? pronunciation.reviewTargets.filter(isRecord) : [];
  const expectedReviewTargets = expected.reviewTargets;
  const reviewTargetsMatch = !expectedReviewTargets || (reviewTargets.length === expectedReviewTargets.length && reviewTargets.every((target, index) => {
    const expectedTarget = expectedReviewTargets[index];
    if (!expectedTarget) return false;
    const actualWords = items(target).map((item) => ({ word: asString(item.word), ipa: asString(item.ipa) }));
    return target.soundId === expectedTarget.soundId && target.focus === expectedTarget.focus && actualWords.length === expectedTarget.words.length && samePronunciationExamples(actualWords, expectedTarget.words);
  }));
  if (!expected.soundScopeResolved || focus !== expected.focus || words.length !== expected.words.length || !samePronunciationExamples(words, expected.words) || !reviewTargetsMatch) {
    const targetsText = expectedReviewTargets ? `; pronunciation.reviewTargets must be exactly, in this order: ${expectedReviewTargets.map((target) => `{soundId "${target.soundId}", focus "${target.focus}", words [${formatExamples(target.words)}]}`).join(", ")}` : "";
    severe.push(finding("MONTHLY_SOUND_SCOPE_MISMATCH", `Pronunciation focus or examples do not match the locked day specification. Set pronunciation.focus to "${expected.focus ?? ""}" and pronunciation.words to exactly [${formatExamples(expected.words)}]${targetsText}`, dayNumber, "pronunciation"));
  }
  if (contract.planSchemaVersion === 2 && day.kind === "new") {
    const grammar = grammarContent ?? {};
    // A lesson saved before the 13/11 objective wording change keeps its old objective text: accepted as the same objective.
    if (grammar.dailyCode !== day.grammarPlan?.code || !monthlyPlanObjectivesMatch(grammar.objective, day.grammarPlan?.objective, expected.coreWords)) severe.push(finding("MONTHLY_DAILY_GRAMMAR_OBJECTIVE", `Grammar must identify and teach the locked daily objective/code. Set grammar.dailyCode to "${day.grammarPlan?.code ?? ""}" and grammar.objective to exactly "${expected.grammarObjective ?? ""}" (copy verbatim, do not translate)`, dayNumber, "grammar"));
    const examples = Array.isArray(grammar.examples) ? grammar.examples.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
    const references = new Set(grammarSteps.flatMap(step => step.examples).map(normalize));
    if (examples.length < 3 || examples.every(example => references.has(normalize(example)))) severe.push(finding("MONTHLY_DAILY_GRAMMAR_EXAMPLES", "Write at least 3 new examples for today's objective instead of copying the monthly references", dayNumber, "grammar"));
    const previousExamples = new Set(priorGrammarExamples.map(normalize));
    if (examples.some(example => previousExamples.has(normalize(example)))) severe.push(finding("MONTHLY_DAILY_GRAMMAR_REPEATED", "Write new daily examples; do not copy earlier new-lesson examples verbatim", dayNumber, "grammar"));
    const exampleText = ` ${examples.join(" ").toLocaleLowerCase("en-US")} `;
    const dayWords = day.coreTermIds.flatMap(id => coreById.get(id)?.word ?? []);
    if (dayWords.filter(word => exampleText.includes(word.toLocaleLowerCase("en-US"))).length < 2) severe.push(finding("MONTHLY_DAILY_GRAMMAR_WORDS", "Grammar examples must use at least two of today's core words", dayNumber, "grammar"));
    const questions = Array.isArray(grammar.items) ? grammar.items.filter(isRecord) : [];
    if (questions.length < 3 || questions.length > 5) severe.push(finding("MONTHLY_DAILY_GRAMMAR_PRACTICE", "Grammar needs 3–5 practice questions with answers and explanations", dayNumber, "grammar"));
    for (const question of questions) {
      const options = Array.isArray(question.options) ? question.options.filter((value): value is string => typeof value === "string") : [];
      if (!asString(question.prompt) || options.length !== 4 || new Set(options.map(normalize)).size !== 4 || !options.some(option => normalize(option) === normalize(asString(question.answer))) || !asString(question.explanation)) severe.push(finding("MONTHLY_DAILY_GRAMMAR_QUESTION", "Every grammar question needs a prompt, 4 distinct options, an answer copied from them, and an explanation", dayNumber, "grammar"));
    }
    if (day.grammarPlan?.recallMilestoneIds.length && !questions.some(question => day.grammarPlan!.recallMilestoneIds.includes(asString(question.milestoneId)))) severe.push(finding("MONTHLY_DAILY_GRAMMAR_RECALL", "Include the locked topic A recall question (every topic B day)", dayNumber, "grammar"));
    for (const issue of monthlyGrammarRoadmapDayIssues(day, contract.cefr, grammar, dayWords)) severe.push(finding(issue.code, issue.message, dayNumber, "grammar"));
    if (pronunciation?.stage !== day.pronunciationPlan?.stage || !monthlyPlanObjectivesMatch(pronunciation?.objective, day.pronunciationPlan?.objective, expected.coreWords)) severe.push(finding("MONTHLY_DAILY_PRONUNCIATION_STAGE", `Pronunciation must teach the locked daily stage and objective. Set pronunciation.stage to "${day.pronunciationPlan?.stage ?? ""}" and pronunciation.objective to exactly "${expected.pronunciationObjective ?? ""}" (copy verbatim)`, dayNumber, "pronunciation"));
    const required = day.pronunciationPlan?.requiredPositions;
    if (required) {
      const positions = Array.isArray(pronunciation?.targetPositions) ? pronunciation.targetPositions.filter(isRecord) : [];
      const actual = positions.map(position => `${position.soundId}:${position.exampleId}`).sort();
      const planned = required.map(position => `${position.soundId}:${position.exampleId}`).sort();
      const passage = asString(pronunciation?.passage).toLocaleLowerCase("en-US");
      const requiredWords = expected.targetPositionWords;
      if (JSON.stringify(actual) !== JSON.stringify(planned) || !hasExactTargetOccurrences(passage, requiredWords)) {
        const counts = [...requiredWords.reduce((map, word) => map.set(word, (map.get(word) ?? 0) + 1), new Map<string, number>())].map(([word, count]) => `"${word}" ×${count}`).join(", ");
        severe.push(finding("MONTHLY_COMBINED_PRONUNCIATION_POSITIONS", `Read-aloud needs exactly 8 taught target positions, two per monthly target, present in the passage. pronunciation.targetPositions must be exactly [${required.map(position => `{soundId "${position.soundId}", exampleId "${position.exampleId}"}`).join(", ")}] and pronunciation.passage must contain each of these words exactly this many times (whole words): ${counts}`, dayNumber, "pronunciation"));
      }
    }
  }
  evaluateChoiceAndWording(contract, dayNumber, lesson.parts, lockedPlanValues, severe);
  // December 2026: wrong keys, a second correct option, wrong voice, an off-label recall item, and Word form options outside the lesson's words.
  severe.push(...monthlyAnswerKeyFindings(contract, day, dayNumber, lesson.parts), ...monthlyWordFormScopeFindings(contract, day, dayNumber, lesson.parts));
  // 12/11: every exercise question with a correct answer carries a short Vietnamese
  // question and answer translation, shown only after it is finished. 13/11: A1–A2 only;
  // a B1+ learner sees no Vietnamese, so the translation is never required there.
  if (monthlyExerciseTranslationsForLevel(contract.cefr)) for (const part of lesson.parts) {
    const issues = monthlyExerciseTranslationIssues(review ? "review" : "new", part.code, part.content);
    if (issues.length) severe.push(finding("MONTHLY_EXERCISE_TRANSLATION", `Add questionTranslation and answerTranslation (short natural Vietnamese, A1-A2 only; a one-word answer such as isn't keeps answerTranslation equal to the answer) to every exercise question that has an answer: ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? `; and ${issues.length - 4} more` : ""}`, dayNumber, part.code));
  }
  if (review) {
    const sections = evaluateMonthlyReviewSections(contract, day, dayNumber, parts);
    severe.push(...sections.severe);
    light.push(...sections.light);
  }
  return { severe, light, contractVersion: contract.version };
}

function finding(code: string, message: string, dayNumber: number, component: string): MonthlyQualityFinding {
  return { severity: "severe", code, message, dayNumber, component };
}

type PlanSound = MonthlyCurriculumContract["sounds"][number];
type PlanExample = PlanSound["examples"][number];

/** Plan-locked values a monthly lesson must carry verbatim (shared by the gate and the deterministic fill, WP1/D1). */
export interface MonthlyLockedPlanExpectations {
  grammarFormulas: string[];
  /** v2 new lessons only. */
  grammarCode: string | null;
  /** The day's core words (spelling as planned), used to recognise objectives saved with the pre-13/11 word list. */
  coreWords: string[];
  grammarObjective: string | null;
  pronunciationStage: string | null;
  pronunciationObjective: string | null;
  sounds: PlanSound[];
  soundScopeResolved: boolean;
  focus: string | null;
  words: PlanExample[];
  /** Full multi-target scope (reviews and multi-target days), else null. */
  reviewTargets: Array<{ soundId: string; focus: string; words: PlanExample[] }> | null;
  targetPositions: Array<{ soundId: string; exampleId: string }> | null;
  targetPositionWords: string[];
}

export function monthlyLockedPlanExpectations(contract: MonthlyCurriculumContract, day: MonthlyDaySpec): MonthlyLockedPlanExpectations {
  const review = day.kind === "review";
  const daily = contract.planSchemaVersion === 2 && !review;
  const coreWords = contract.coreTerms.filter((term) => day.coreTermIds.includes(term.id)).map((term) => term.word);
  const grammarIds = review ? day.reviewGrammarStepIds ?? [] : day.grammarStepIds ?? [day.grammarStepId];
  const allSteps = contract.grammarTopics.flatMap((topic) => topic.steps);
  const grammarFormulas = grammarIds.map((id) => allSteps.find((step) => step.id === id)?.formula).filter((value): value is string => Boolean(value));
  const soundIds = review ? day.reviewSoundIds ?? [] : day.pronunciationPlan?.targetIds ?? [day.soundId];
  const exampleIds = review ? day.reviewPronunciationExampleIds ?? [] : day.pronunciationPlan?.exampleIds ?? day.pronunciationExampleIds;
  const sounds = soundIds.map((soundId) => contract.sounds.find((candidate) => candidate.id === soundId)).filter((sound): sound is PlanSound => Boolean(sound));
  const soundByExampleId = new Map(sounds.flatMap((sound) => sound.examples.map((example) => [example.id, { sound, example }] as const)));
  const primarySound = sounds[0];
  const primaryIds = review ? exampleIds.filter((id) => primarySound?.examples.some((example) => example.id === id)).slice(0, 3) : day.pronunciationExampleIds;
  const words = primarySound ? primaryIds.map((id) => primarySound.examples.find((example) => example.id === id)).filter((example): example is PlanExample => Boolean(example)) : [];
  const needsFullTargets = review || (day.pronunciationPlan?.targetIds.length ?? 0) > 1;
  const reviewTargets = needsFullTargets ? sounds.map((sound) => ({
    soundId: sound.id,
    focus: sound.ipa,
    words: exampleIds.map((id) => soundByExampleId.get(id)).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined && entry.sound.id === sound.id).map((entry) => entry.example)
  })) : null;
  const required = daily ? day.pronunciationPlan?.requiredPositions ?? null : null;
  return {
    grammarFormulas,
    grammarCode: daily ? day.grammarPlan?.code ?? null : null,
    coreWords,
    // Objectives in the current readable wording (no internal code, no word list), also for plans stored before 13/11.
    grammarObjective: daily && day.grammarPlan ? monthlyReadablePlanObjective(day.grammarPlan.objective, coreWords) : null,
    pronunciationStage: daily ? day.pronunciationPlan?.stage ?? null : null,
    pronunciationObjective: daily && day.pronunciationPlan ? monthlyReadablePlanObjective(day.pronunciationPlan.objective, coreWords) : null,
    sounds,
    soundScopeResolved: Boolean(sounds.length) && sounds.length === soundIds.length && exampleIds.length > 0 && exampleIds.every((id) => soundByExampleId.has(id)) && Boolean(primarySound),
    focus: primarySound?.ipa ?? null,
    words,
    reviewTargets,
    targetPositions: required ? required.map((position) => ({ soundId: position.soundId, exampleId: position.exampleId })) : null,
    targetPositionWords: required ? required.map((position) => sounds.find((sound) => sound.id === position.soundId)?.examples.find((example) => example.id === position.exampleId)?.word ?? "").map((word) => monthlyPronunciationExampleText(word)) : []
  };
}

/** Locked strings exempt from the B1+ English-only check and the internal-term check (WP1 1a). */
export function monthlyLockedPlanValues(expected: MonthlyLockedPlanExpectations, parts: ReadonlyArray<{ code: string; content: Record<string, unknown> }> = []): Record<string, Record<string, string>> | undefined {
  const grammar: Record<string, string> = {};
  const pronunciation: Record<string, string> = {};
  // A lesson saved with the pre-13/11 wording of its objective keeps that text exempt, like the current wording.
  const stored = (code: string, planned: string) => {
    const value = parts.find((part) => part.code === code)?.content?.objective;
    return typeof value === "string" && monthlyPlanObjectivesMatch(value, planned, expected.coreWords) ? value : planned;
  };
  if (expected.grammarCode) grammar.dailyCode = expected.grammarCode;
  if (expected.grammarObjective) grammar.objective = stored("grammar", expected.grammarObjective);
  if (expected.pronunciationStage) pronunciation.stage = expected.pronunciationStage;
  if (expected.pronunciationObjective) pronunciation.objective = stored("pronunciation", expected.pronunciationObjective);
  const values: Record<string, Record<string, string>> = {};
  if (Object.keys(grammar).length) values.grammar = grammar;
  if (Object.keys(pronunciation).length) values.pronunciation = pronunciation;
  return Object.keys(values).length ? values : undefined;
}

/** WP1 1c: compare formulas without whitespace, ellipsis, quote-style, dash or case differences. */
export function normalizeFormula(value: string): string {
  return value.normalize("NFKC")
    .replace(/[‘’‚‛′]/gu, "'")
    .replace(/[“”„‟″]/gu, "\"")
    .replace(/[‐-―−]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/\s*([+/()[\]|;,=])\s*/gu, "$1")
    .toLocaleLowerCase("en-US")
    .trim();
}

function formatExamples(examples: ReadonlyArray<{ word: string; ipa: string }>): string {
  return examples.map((example) => `${example.word} ${example.ipa}`).join(", ");
}

const CHOICE_PARTS = ["listening", "reading", "writing", "word_class", "word_use", "grammar", "speaking"] as const;

interface ChoiceEntry { component: string; label: string; prompt: string; options: string[]; answer: string }

/** Every graded choice in the lesson: top-level single questions, items[] and each variants[] entry. */
export function collectMonthlyChoices(parts: ReadonlyArray<{ code: string; content: Record<string, unknown> }>): ChoiceEntry[] {
  const entries: ChoiceEntry[] = [];
  const entry = (component: string, label: string, raw: Record<string, unknown>) => {
    const options = Array.isArray(raw.options) ? raw.options.filter((value): value is string => typeof value === "string") : [];
    if (options.length >= 2) entries.push({ component, label, prompt: asString(raw.prompt) || asString(raw.question), options, answer: asString(raw.answer) });
  };
  for (const part of parts) {
    if (!(CHOICE_PARTS as readonly string[]).includes(part.code)) continue;
    const list = Array.isArray(part.content.items) ? part.content.items.filter(isRecord) : [];
    entry(part.code, part.code, part.content);
    list.forEach((item, index) => {
      entry(part.code, `${part.code} item ${index + 1}`, item);
      (Array.isArray(item.variants) ? item.variants.filter(isRecord) : []).forEach((variant, variantIndex) => entry(part.code, `${part.code} item ${index + 1} variant ${variantIndex + 1}`, variant));
    });
  }
  return entries;
}

/** WP3 (distractors, HV-R49), WP7 (internal wording) and WP8 (offensive words) checks shared by daily lessons and reviews. */
function evaluateChoiceAndWording(
  contract: MonthlyCurriculumContract,
  dayNumber: number,
  parts: ReadonlyArray<{ code: string; content: Record<string, unknown> }>,
  locked: Record<string, Record<string, string>> | undefined,
  severe: MonthlyQualityFinding[]
): void {
  const grouped = new Map<string, { component: string; code: string; labels: string[]; detail: string; hint: string }>();
  const flag = (code: string, component: string, label: string, detail: string, hint: string) => {
    const key = `${code}:${component}`;
    const current = grouped.get(key) ?? { component, code, labels: [], detail, hint };
    current.labels.push(detail ? `${label} (${detail})` : label);
    grouped.set(key, current);
  };
  const choices = collectMonthlyChoices(parts);
  for (const choice of choices) {
    const invented = inventedWordForms([...choice.options, choice.answer].join(" "));
    if (invented.length) flag("MONTHLY_INVENTED_WORD_FORM", choice.component, choice.label, invented.join(", "), "Every option must be a real, correctly formed English word or phrase; replace invented forms such as sended/maked/feedbacked with real forms (sent, made, gave feedback)");
    if (choice.component !== "word_class") continue;
    if (mentionsWordClass(choice.prompt)) flag("MONTHLY_WORD_FORM_ASKS_WORD_CLASS", choice.component, choice.label, "", "Word form (HV-R49) must not ask for the word class / part of speech; write a workplace sentence with one blank (____) and ask the learner to choose the correct form of a week word");
    if (optionsAreWordClassLabels(choice.options)) flag("MONTHLY_WORD_FORM_LABEL_OPTIONS", choice.component, choice.label, "", "Word form options must be 4 forms of the week word (e.g. decide / decision / decisive / decisively), never labels such as noun/verb/adjective/adverb");
    if (bracketHintWords(choice.prompt).includes(normalize(choice.answer))) flag("MONTHLY_WORD_FORM_ANSWER_IS_HINT", choice.component, choice.label, choice.answer, "The Word form answer must not simply repeat the base word given in brackets; the bracketed word must need a change of form");
  }
  for (const group of grouped.values()) severe.push(finding(group.code, `${group.hint}. Fix: ${group.labels.join("; ")}`, dayNumber, group.component));

  const pasted = [contract.theme.communicationGoal].filter((value): value is string => typeof value === "string");
  for (const part of parts) {
    const offensive = new Set<string>();
    const internal = new Set<string>();
    const lockedPart = locked?.[part.code];
    const visit = (value: unknown, key: string, depth: number) => {
      if (typeof value === "string") {
        if (depth === 1 && lockedPart?.[key] !== undefined && value.trim() === lockedPart[key]!.trim()) return;
        for (const word of offensiveWords(value)) offensive.add(word);
        if (!/meaning$|^id$|Id$|Ids$/u.test(key)) for (const term of internalLearnerTerms(value, pasted)) internal.add(term);
        return;
      }
      if (Array.isArray(value)) { for (const item of value) visit(item, key, depth + 1); return; }
      if (isRecord(value)) for (const [childKey, item] of Object.entries(value)) visit(item, childKey, depth + 1);
    };
    for (const [key, value] of Object.entries(part.content)) visit(value, key, 1);
    if (offensive.size) severe.push(finding("MONTHLY_OFFENSIVE_WORD", `Remove vulgar or offensive words from learner content (including minimal pairs): ${[...offensive].join(", ")}`, dayNumber, part.code));
    if (internal.size) severe.push(finding("MONTHLY_INTERNAL_TERM_EXPOSED", `Learner-facing text exposes internal planning wording: ${[...internal].map((term) => `"${term}"`).join(", ")}. Rewrite it for the learner (address them as "bạn"/"you", name the actual words) and never paste the plan's communication goal`, dayNumber, part.code));
  }
}

function items(content: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const value = content?.items ?? content?.words;
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasNoLexicalRelation(item: Record<string, unknown>): boolean {
  return arrayLength(item.synonyms) === 0 && arrayLength(item.antonyms) === 0;
}

/** Synonym/antonym entries on a core card that are not planned for that core and lack the level's meaning. */
function relationEntriesWithoutMeaning(contract: MonthlyCurriculumContract, coreId: string, item: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const relation of ["synonym", "antonym"] as const) {
    const planned = new Set(contract.supportTerms.filter((term) => term.relatedCoreTermId === coreId && term.relation === relation).map((term) => normalize(term.word)));
    const list = Array.isArray(item[`${relation}s`]) ? item[`${relation}s`] as unknown[] : [];
    for (const raw of list) {
      const entry = typeof raw === "string" ? { word: raw } : isRecord(raw) ? raw : null;
      const entryWord = asString(entry?.word).trim();
      if (!entry || !entryWord || planned.has(normalize(entryWord))) continue;
      const issue = monthlyRelationMeaningIssue(contract.cefr, { word: entryWord, relation, meaning: asString(entry.note), definition: asString(entry.definition) });
      if (issue) missing.push(`${relation} "${entryWord}"`);
    }
  }
  return missing;
}
function arrayLength(value: unknown): number { return Array.isArray(value) ? value.length : 0; }
function asString(value: unknown): string { return typeof value === "string" ? value : ""; }
function normalize(value: string): string { return value.trim().toLocaleLowerCase("en-US"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function samePronunciationExamples(
  actual: ReadonlyArray<{ word: string; ipa: string }>,
  expected: ReadonlyArray<{ word: string; ipa: string }>
): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((item, index) => normalize(item.word) === normalize(expected[index]?.word ?? "") && item.ipa === expected[index]?.ipa);
}

export function hasExactTargetOccurrences(passage: string, words: readonly string[]): boolean {
  const expected = new Map<string, number>();
  for (const raw of words) { const word = raw.trim().toLocaleLowerCase("en-US"); if (!word) return false; expected.set(word,(expected.get(word) ?? 0)+1); }
  const spoken = passage.replace(/[’‘]/gu, "'");
  return [...expected].every(([word,count]) => { const escaped = word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); return [...spoken.toLocaleLowerCase("en-US").matchAll(new RegExp("(?<![a-z])"+escaped+"(?![a-z])","g"))].length === count; });
}
