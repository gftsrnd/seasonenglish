/**
 * A day's grammar steps in the day plan's order (grammarStepIds / reviewGrammarStepIds), never in resource order.
 *
 * Generation, the stored `grammar.steps` and the server's plan lock all follow the plan's order; the preview pairs
 * stored step N with plan step N (withMonthlyGrammarSteps). Taking the steps in resource order put a review day's
 * examples under the other point when its plan lists the topics the other way round (B1 2026-12 day 25/12: plan
 * "past, present", resources "present, past").
 */
export function monthlyDayGrammarSteps<T extends { id: string }>(topics: ReadonlyArray<{ steps: readonly T[] }>, ids: readonly string[]): T[] {
  const all = topics.flatMap((topic) => topic.steps);
  return ids.flatMap((id) => {
    const step = all.find((candidate) => candidate.id === id);
    return step ? [step] : [];
  });
}
