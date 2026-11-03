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
    steps: [{ id: `${cefr.toLowerCase()}-grammar-${index + 1}-step`, focus: topic.title, formula: topic.formula, usage: topic.usage, examples: topic.examples }]
  }));
  const sounds = plan.pronunciationTargets.map((target, targetIndex) => ({
    id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}`,
    ipa: target.ipa,
    label: `${target.label}: ${target.explanation}`,
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


