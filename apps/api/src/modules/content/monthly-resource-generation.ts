import { buildMonthlyCalendar, monthlyDayKind, type MonthlyResourcePoolContract, type SharedMonthBrief } from "@e4s/domain";
import type { CefrLevel } from "@e4s/contracts";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { validateMonthlyResourcePlanShape } from "./monthly-resource-plan-spec.js";

export interface MonthlyResourceCriteria {
  vocabularyCount: number;
  expandedVocabularyCount: number;
  grammarTopicCount: number;
  pronunciationSoundCount: number;
}

export function selectMonthlyCoreCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["coreTerms"];
  existingCoreWords: ReadonlySet<string>;
  needed: number;
}): { selected: MonthlyResourcePlanTaskOutput["coreTerms"]; rejected: string[] } {
  const selected: MonthlyResourcePlanTaskOutput["coreTerms"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  for (const candidate of input.candidates) {
    const word = normalizeMonthlyResourceWord(candidate.word);
    let reason = "";
    if (!isSingleHeadword(candidate.word)) reason = "must be one standalone lexical headword";
    else if (input.existingCoreWords.has(word)) reason = "duplicates an existing core term";
    else if (chosen.has(word)) reason = "duplicates another candidate in this core batch";
    if (reason) {
      rejected.push(`${candidate.word} -> ${word} (${reason})`);
      continue;
    }
    chosen.add(word);
    selected.push(candidate);
    if (selected.length === input.needed) break;
  }
  return { selected, rejected };
}

export function selectMonthlySupportCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["expandedTerms"];
  coreId: string;
  coreWords: ReadonlySet<string>;
  sameCoreWords: ReadonlySet<string>;
  sameCoreRelations: ReadonlySet<MonthlyResourcePlanTaskOutput["expandedTerms"][number]["relation"]>;
  existingSupportWords: readonly string[];
  maxRepeatedPlacements: number;
  maxPhrasePlacements: number;
  needed: number;
}): { selected: MonthlyResourcePlanTaskOutput["expandedTerms"]; rejected: string[] } {
  const selected: MonthlyResourcePlanTaskOutput["expandedTerms"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  const existingCounts = new Map<string, number>();
  for (const raw of input.existingSupportWords) {
    const word = normalizeMonthlyResourceWord(raw);
    existingCounts.set(word, (existingCounts.get(word) ?? 0) + 1);
  }
  let repeatedPlacements = input.existingSupportWords.length - existingCounts.size;
  let phrasePlacements = input.existingSupportWords.filter((word) => !isSingleHeadword(word)).length;
  let sameCorePhraseCount = [...input.sameCoreWords].filter((word) => !isSingleHeadword(word)).length;
  const sameCoreRelations = new Set(input.sameCoreRelations);
  const sameCoreWords = new Set(input.sameCoreWords);

  for (const candidate of input.candidates) {
    const word = normalizeMonthlyResourceWord(candidate.word);
    let reason = "";
    if (candidate.relatesToCoreId !== input.coreId) reason = "incorrect core relation";
    else if (input.coreWords.has(word)) reason = "matches a core term";
    else if (!isSingleHeadword(candidate.word) && !isWorkplacePhrase(candidate.word)) reason = "must be one lexical headword or a natural two-to-four-word workplace phrase";
    else if (!isSingleHeadword(candidate.word) && sameCorePhraseCount >= 1) reason = "allows only one phrase for this core; prefer standalone words";
    else if (sameCoreWords.has(word)) reason = "duplicates a selected support term for this core";
    else if (sameCoreRelations.has(candidate.relation)) reason = `duplicates the ${candidate.relation} relation for this core`;
    else if (chosen.has(word)) reason = "duplicates another candidate in this core batch";
    else if (!isSingleHeadword(candidate.word) && phrasePlacements + 1 > input.maxPhrasePlacements) reason = "exceeds the monthly phrase ceiling; standalone words are required";
    else {
      const nextRepeatCount = repeatedPlacements + (existingCounts.has(word) ? 1 : 0);
      if (nextRepeatCount > input.maxRepeatedPlacements) reason = "exceeds the 20% monthly support-repeat limit";
      else repeatedPlacements = nextRepeatCount;
    }
    if (reason) {
      rejected.push(`${candidate.word} -> ${word} (${reason})`);
      continue;
    }
    chosen.add(word);
    selected.push(candidate);
    sameCoreWords.add(word);
    sameCoreRelations.add(candidate.relation);
    if (!isSingleHeadword(candidate.word)) {
      phrasePlacements += 1;
      sameCorePhraseCount += 1;
    }
    if (selected.length === input.needed) break;
  }
  return { selected, rejected };
}

export function selectMonthlyPronunciationCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"];
  forbiddenWords: ReadonlySet<string>;
  needed: number;
}): { selected: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"]; rejected: string[] } {
  const selected: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  for (const candidate of input.candidates) {
    const word = normalizeMonthlyResourceWord(candidate.word);
    const syllables = countApproximateSyllables(candidate.word);
    const reason = syllables > 3
      ? `has ${syllables} syllables`
      : input.forbiddenWords.has(word) || chosen.has(word)
        ? "duplicates a pronunciation example already used"
        : "";
    if (reason) {
      rejected.push(`${candidate.word} -> ${word} (${reason})`);
      continue;
    }
    chosen.add(word);
    selected.push(candidate);
    if (selected.length === input.needed) break;
  }
  return { selected, rejected };
}

export function buildMonthlyPronunciationDistinctnessConstraint(
  previousTargets: readonly Pick<MonthlyResourcePlanTaskOutput["pronunciationTargets"][number], "ipa" | "label" | "explanation">[],
  retryIssue = ""
): string {
  const exclusions = previousTargets.map((target) => `${target.ipa} (${target.label}; ${target.explanation})`);
  const banned = exclusions.length
    ? `HARD BANS: this target must not return ${previousTargets.map((target) => target.ipa).join(", ")}. These targets are already accepted and cannot be reused or paraphrased: ${exclusions.join("; ")}. Choose a different phoneme or stress pattern, with a clearly different sound category; avoid near-neighbor contrasts of a sound already selected.`
    : "This is the first roadmap target; choose a genuine target that can coexist with three other distinct pronunciation targets.";
  const hasStressOnlyTarget = previousTargets.some((target) => target.ipa.trim() === "/ˈ/" || target.ipa.trim() === "/ˌ/");
  const categoryConstraint = hasStressOnlyTarget
    ? "A stress-only marker target has already been accepted. This target must be a real consonant or vowel phoneme, not another stress pattern; do not return /ˈ/, /ˌ/ or any other stress-only marker."
    : "Use a real consonant or vowel phoneme unless a stress target is materially different from every accepted target.";
  const retry = retryIssue
    ? `The previous response was rejected: ${retryIssue}. Treat that IPA and target description as forbidden too. Return a different valid IPA target; do not repeat the rejected target category.`
    : "";
  return `${banned} ${categoryConstraint} ${retry}`.trim();
}

export function getMonthlyPronunciationTargetIssue(
  candidate: Pick<MonthlyResourcePlanTaskOutput["pronunciationTargets"][number], "ipa">,
  previousTargets: readonly Pick<MonthlyResourcePlanTaskOutput["pronunciationTargets"][number], "ipa">[]
): string | undefined {
  const normalized = candidate.ipa.trim().toLocaleLowerCase("en");
  const stressOnly = normalized === "/ˈ/" || normalized === "/ˌ/";
  if (previousTargets.some((target) => target.ipa.trim().toLocaleLowerCase("en") === normalized)) {
    return `target IPA ${candidate.ipa} duplicates an earlier pronunciation target`;
  }
  if (stressOnly && previousTargets.some((target) => {
    const prior = target.ipa.trim().toLocaleLowerCase("en");
    return prior === "/ˈ/" || prior === "/ˌ/";
  })) {
    return `target IPA ${candidate.ipa} is a second stress-only target; only one stress-pattern target is allowed across P1–P4`;
  }
  return undefined;
}

export function buildMonthlyPronunciationSchemaRepairIssue(issues: readonly Record<string, unknown>[]): string {
  const details = issues.flatMap((issue) => {
    const path = typeof issue.path === "string" ? issue.path : "output";
    const message = typeof issue.message === "string" ? issue.message : "does not match the structured schema";
    return [`${path}: ${message}`];
  });
  return `Structured output repair required. Previous response schema issues: ${details.join("; ") || "the response did not match the required shape"}. Return a complete corrected result. pronunciationTargets must be an array containing exactly one target object for this phase, not a string. Include at least 18 ordered example candidates; keep coreTerms, expandedTerms and grammarTopics empty. The target ipa must be one valid slash-delimited IPA form with no prose or multiple transcriptions.`;
}

export function getMonthlyGrammarPhaseIssues(result: MonthlyResourcePlanTaskOutput): string[] {
  const issues: string[] = [];
  if (result.coreTerms.length) issues.push(`coreTerms must be empty (received ${result.coreTerms.length})`);
  if (result.expandedTerms.length) issues.push(`expandedTerms must be empty (received ${result.expandedTerms.length})`);
  if (result.grammarTopics.length !== 2) issues.push(`grammarTopics must contain exactly 2 items (received ${result.grammarTopics.length})`);
  if (result.pronunciationTargets.length) issues.push(`pronunciationTargets must be empty (received ${result.pronunciationTargets.length})`);
  for (const [topicIndex, topic] of result.grammarTopics.entries()) {
    if (topic.steps.length !== 3) issues.push(`grammarTopics[${topicIndex}] must contain exactly 3 progressive steps (received ${topic.steps.length})`);
    if (new Set(topic.steps.map((step) => step.id)).size !== topic.steps.length) issues.push(`grammarTopics[${topicIndex}] repeats a step ID`);
    if (new Set(topic.steps.map((step) => step.focus.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim())).size !== topic.steps.length) {
      issues.push(`grammarTopics[${topicIndex}] must have distinct step focus values`);
    }
  }
  return issues;
}

export function buildMonthlyGrammarPhasePrompt(rejectedIssues: readonly string[] = []): string {
  const repair = rejectedIssues.length
    ? ` Previous response rejected: ${rejectedIssues.join("; ")}. Correct each listed issue in this response.`
    : "";
  return `PHASE 3 — GRAMMAR ONLY. Return exactly two grammarTopics; coreTerms, expandedTerms and pronunciationTargets must be empty arrays. Each grammar topic must have exactly three ordered progressive steps that build in complexity; use a distinct focus and teaching point at each step, with precise formula, concise Vietnamese usage, and three to six authentic workplace examples. Topic A steps are the progression for N1–N2, N3–N4, N5–N6. Topic B steps are the progression for N7–N8, N9–N10, N11–N12. N13–N15 combine the third step of both topics. Return JSON matching the schema only; do not include explanations or any other resource category.${repair}`;
}

export async function runMonthlyGrammarPhaseWithRetry(
  generate: (prompt: string) => Promise<MonthlyResourcePlanTaskOutput>
): Promise<MonthlyResourcePlanTaskOutput> {
  let issues: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await generate(buildMonthlyGrammarPhasePrompt(issues));
    issues = getMonthlyGrammarPhaseIssues(result);
    if (!issues.length) return result;
  }
  throw new MonthlyResourcePlanError([`Grammar phase failed after 3 attempts: ${issues.join("; ")}.`]);
}

function normalizeMonthlyResourceWord(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();
}

export function isSingleHeadword(value: string): boolean {
  return /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(value.trim());
}

function isWorkplacePhrase(value: string): boolean {
  const words = value.trim().split(/\s+/u);
  return words.length >= 2 && words.length <= 4 && words.every((word) => /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(word));
}

function countApproximateSyllables(word: string): number {
  return Math.max(1, (word.toLocaleLowerCase("en").match(/[aeiouy]+/gu) ?? []).length);
}

/**
 * Converts one validated AI plan into the fixed monthly source used by every
 * later daily lesson. No emergency corpus is used: an unavailable AI provider
 * must leave the framework ungenerated for the operator to retry.
 */
export function buildMonthlyResourcesFromAiPlan(
  month: string,
  cefr: CefrLevel,
  theme: SharedMonthBrief,
  criteria: MonthlyResourceCriteria,
  plan: MonthlyResourcePlanTaskOutput
): MonthlyResourcePoolContract {
  const calendar = buildMonthlyCalendar(month);
  const newLessonDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new" ? [index + 1] : []);
  const requiredVocabularyCount = newLessonDays.length * 3;
  const requiredExpandedVocabularyCount = newLessonDays.length * 9;
  if (criteria.vocabularyCount !== requiredVocabularyCount) throw new MonthlyResourceCriteriaError("VOCABULARY_COUNT_MISMATCH", requiredVocabularyCount);
  if (criteria.expandedVocabularyCount !== requiredExpandedVocabularyCount) throw new MonthlyResourceCriteriaError("EXPANDED_VOCABULARY_COUNT_MISMATCH", requiredExpandedVocabularyCount);

  const shapeErrors = validateMonthlyResourcePlanShape(plan, newLessonDays.length);
  if (criteria.grammarTopicCount !== 2) shapeErrors.push("Monthly resources always require exactly two grammar topics.");
  if (criteria.pronunciationSoundCount !== 4) shapeErrors.push("Monthly resources always require exactly four pronunciation targets.");
  if (shapeErrors.length) throw new MonthlyResourcePlanError(shapeErrors);

  const coreIdMap = new Map(plan.coreTerms.map((term, index) => [term.id, `${cefr.toLowerCase()}-core-${index + 1}`]));
  const coreTerms = [...plan.coreTerms]
    .map(({ id, word, meaning, type, ipa }, index) => ({ id: coreIdMap.get(id) ?? `${cefr.toLowerCase()}-core-${index + 1}`, word, meaning, type, ipa, source: "core_registry" as const, component: "core" as const }));
  const supportTerms = [...plan.expandedTerms]
    .map((term, index) => ({
      id: `${cefr.toLowerCase()}-expanded-${index + 1}`,
      word: term.word,
      meaning: term.meaning,
      type: term.type,
      source: relationSource(term.relation),
      component: "expanded" as const,
      relatedCoreTermId: coreIdMap.get(term.relatesToCoreId) ?? term.relatesToCoreId
    }));
  const grammarTopics = plan.grammarTopics.map((topic, index) => ({
    id: `${cefr.toLowerCase()}-grammar-${index + 1}`,
    title: topic.title,
    steps: topic.steps.map((step, stepIndex) => ({
      id: `${cefr.toLowerCase()}-grammar-${index + 1}-step-${stepIndex + 1}`,
      focus: step.focus,
      formula: step.formula,
      usage: step.usage,
      examples: step.examples
    }))
  }));
  const sounds = plan.pronunciationTargets.map((target, targetIndex) => ({
    id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}`,
    ipa: target.ipa,
    label: target.label,
    examples: target.words.map((word, index) => ({ id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}-word-${index + 1}`, word: word.word, ipa: word.ipa }))
  }));
  return { month, cefr, theme, coreTerms, supportTerms, grammarTopics, sounds, version: theme.version };
}

export class MonthlyResourcePlanError extends Error {
  constructor(readonly errors: readonly string[]) {
    super("MONTHLY_RESOURCE_PLAN_INVALID");
  }
}

export class MonthlyResourceCriteriaError extends Error {
  constructor(
    readonly code: "VOCABULARY_COUNT_MISMATCH" | "EXPANDED_VOCABULARY_COUNT_MISMATCH",
    readonly requiredVocabularyCount: number
  ) {
    super(code);
  }
}

function relationSource(relation: MonthlyResourcePlanTaskOutput["expandedTerms"][number]["relation"]): "example" | "family" | "synonym" | "antonym" | "group" {
  if (relation === "word_family") return "family";
  if (relation === "collocation") return "example";
  if (relation === "umbrella") return "group";
  return relation;
}

