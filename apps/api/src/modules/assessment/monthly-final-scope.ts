import type { MonthlyFinalExamMeta } from "@e4s/contracts";
import type { MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { monthlyFinalLockedGrammarSteps, taughtGrammarSteps, taughtPronunciationExamples } from "./monthly-final-builder.js";
import { termCode } from "./monthly-final-spec.js";

/**
 * What a monthly final depends on in the approved plan: the theme, the core terms in plan order
 * (their order fixes V01…VN and the L/R/W/S allocation), the taught steps of the two grammar topics
 * and the taught examples of the four sounds. Version numbers are left out on purpose: reopening and
 * re-approving a plan bumps `version` (and so the framework `scopeHash`) without changing any of this.
 */
export function monthlyFinalScope(contract: MonthlyCurriculumContract) {
  const locked = monthlyFinalLockedGrammarSteps(contract);
  return {
    month: contract.month,
    cefr: contract.cefr,
    theme: { title: contract.theme?.title ?? "", brief: contract.theme?.brief ?? "", context: contract.theme?.context ?? "", communicationGoal: contract.theme?.communicationGoal ?? "" },
    coreTerms: (contract.coreTerms ?? []).map((term) => ({ id: term.id, word: term.word, type: term.type, meaning: term.meaning })),
    grammar: (contract.grammarTopics ?? []).map((topic, index) => ({
      id: topic.id, title: topic.title,
      steps: taughtGrammarSteps(contract, index).map((step) => ({ id: step.id, focus: step.focus, formula: step.formula, usage: step.usage, examples: step.examples.slice(0, 3) })),
      locked: locked?.[index] ?? null
    })),
    sounds: (contract.sounds ?? []).map((sound, index) => ({
      id: sound.id, ipa: sound.ipa, label: sound.label,
      examples: taughtPronunciationExamples(contract, index).map((example) => ({ id: example.id, word: example.word, ipa: example.ipa }))
    }))
  };
}

/** Content-only fingerprint of {@link monthlyFinalScope}; stored on new exams as `framework.examScopeHash`. */
export function monthlyFinalScopeHash(contract: MonthlyCurriculumContract): string {
  const text = stableStringify(monthlyFinalScope(contract));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `monthly-final-${(hash >>> 0).toString(16)}`;
}

/**
 * An exam is stale only when what it tests changed: another framework row, or a different exam scope.
 * Same framework `scopeHash` → never stale. Exams generated before `examScopeHash` existed are compared
 * on what they recorded themselves: every mapped core term (code, word, type, meaning), the taught
 * grammar steps of GA/GB and the taught example words of P1–P4.
 */
export function monthlyFinalScopeStale(
  exam: Pick<MonthlyFinalExamMeta, "framework" | "mapping" | "grammar" | "pronunciation">,
  current: { frameworkId: string; scopeHash: string; contract: MonthlyCurriculumContract }
): boolean {
  if (exam.framework.id !== current.frameworkId) return true;
  if (exam.framework.scopeHash === current.scopeHash) return false;
  if (exam.framework.examScopeHash) return exam.framework.examScopeHash !== monthlyFinalScopeHash(current.contract);
  return !legacyExamMatchesContract(exam, current.contract);
}

function legacyExamMatchesContract(exam: Pick<MonthlyFinalExamMeta, "mapping" | "grammar" | "pronunciation">, contract: MonthlyCurriculumContract): boolean {
  const core = contract.coreTerms ?? [];
  if (exam.mapping.length !== core.length) return false;
  const coreIndex = new Map(core.map((term, index) => [term.id, index]));
  const termsMatch = exam.mapping.every((row) => {
    const index = coreIndex.get(row.termId);
    const term = index === undefined ? undefined : core[index];
    return term !== undefined && termCode(index!) === row.code && term.word === row.word && term.type === row.type && term.meaning === row.meaning;
  });
  if (!termsMatch) return false;
  const topics = contract.grammarTopics ?? [];
  if (exam.grammar.length !== topics.length) return false;
  const grammarMatch = exam.grammar.every((target, index) => {
    const topic = topics[index];
    if (!topic || topic.id !== target.topicId || topic.title !== target.topicTitle) return false;
    const taught = taughtGrammarSteps(contract, index).map((step) => [step.id, step.focus, step.formula]);
    return stableStringify(taught) === stableStringify(target.taughtSteps.map((step) => [step.stepId, step.focus, step.formula]));
  });
  if (!grammarMatch) return false;
  const sounds = contract.sounds ?? [];
  if (exam.pronunciation.length !== sounds.length) return false;
  return exam.pronunciation.every((target, index) => {
    const sound = sounds[index];
    if (!sound || sound.id !== target.soundId || sound.ipa !== target.ipa || sound.label !== target.label) return false;
    const taught = taughtPronunciationExamples(contract, index).map((example) => [example.id, example.word]);
    return stableStringify(taught) === stableStringify(target.taughtExamples.map((example) => [example.exampleId, example.word]));
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
