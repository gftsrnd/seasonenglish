/**
 * Deterministic answer-position balancing shared by every generated
 * multiple-choice surface (monthly final, monthly day/review lessons,
 * level-up forms). This is a post-generation step only: option texts are never
 * changed, only their order, and the answer key is remapped to follow the
 * correct option.
 *
 * Contract (same seed -> same output):
 * - within one list, the correct-answer slots for items with the same option
 *   count differ by at most one between positions;
 * - no slot repeats more than twice in a row;
 * - distractors keep their relative order; the correct option is inserted at
 *   the chosen slot.
 */

/** A choice whose key is an index into `options` (monthly final, level-up form). */
export interface IndexedChoice {
  options: string[];
  correctIndex: number;
}

/** A choice whose key is the correct option text (monthly day/review lessons). */
export interface AnswerTextChoice {
  options: string[];
  answer: string;
}

/** FNV-1a seed hash feeding a 32-bit LCG. Stable across runtimes. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Balanced, non-patterned slots for `count` items with `optionCount` options:
 * a seeded shuffle of the cycle 0..k-1 (so counts differ by at most one),
 * then runs of three are broken up.
 */
export function balancedAnswerSlots(count: number, optionCount: number, seed: string): number[] {
  if (count <= 0 || optionCount <= 0) return [];
  const letters: number[] = Array.from({ length: count }, (_, index) => index % optionCount);
  const random = seededRandom(seed);
  for (let index = letters.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [letters[index], letters[swap]] = [letters[swap]!, letters[index]!];
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 2; index < letters.length; index += 1) {
      if (letters[index] === letters[index - 1] && letters[index] === letters[index - 2]) {
        const swapWith = letters.findIndex((value, candidate) => candidate > index && value !== letters[index]);
        const target = swapWith >= 0 ? swapWith : letters.findIndex((value, candidate) => candidate < index - 2 && value !== letters[index] && letters[candidate - 1] !== letters[index] && letters[candidate + 1] !== letters[index]);
        if (target >= 0) [letters[index], letters[target]] = [letters[target]!, letters[index]!];
      }
    }
  }
  return letters;
}

/**
 * Slot per item. Items are grouped by option count so every group is balanced
 * on its own; a single-group list uses `seed` unchanged (this keeps the
 * monthly-final output identical to the pre-extraction builder).
 */
function slotsFor(optionCounts: number[], seed: string): number[] {
  const groups = new Map<number, number[]>();
  optionCounts.forEach((count, index) => groups.set(count, [...(groups.get(count) ?? []), index]));
  const slots: number[] = Array.from({ length: optionCounts.length }, () => -1);
  for (const [optionCount, indexes] of groups) {
    const groupSeed = groups.size === 1 ? seed : `${seed}#${optionCount}`;
    const letters = balancedAnswerSlots(indexes.length, optionCount, groupSeed);
    indexes.forEach((itemIndex, position) => { slots[itemIndex] = letters[position]!; });
  }
  return slots;
}

function moveCorrect(options: string[], correctIndex: number, targetIndex: number): string[] {
  const correct = options[correctIndex]!;
  const distractors = options.filter((_, optionIndex) => optionIndex !== correctIndex);
  const next = [...distractors];
  next.splice(targetIndex, 0, correct);
  return next;
}

/**
 * `options` + `correctIndex` variant. Every item gets a balanced slot and its
 * `correctIndex` is remapped. Items whose key is out of range, or that have
 * fewer than two options, are returned unchanged.
 */
export function rebalanceAnswerPositions<T extends IndexedChoice>(items: T[], seed: string, optionCount?: number): T[] {
  const slots = optionCount === undefined
    ? slotsFor(items.map((item) => item.options.length), seed)
    : balancedAnswerSlots(items.length, optionCount, seed);
  return items.map((item, index) => {
    const targetIndex = slots[index]!;
    if (item.options.length < 2 || item.correctIndex < 0 || item.correctIndex >= item.options.length || targetIndex < 0 || targetIndex >= item.options.length) return item;
    return { ...item, options: moveCorrect(item.options, item.correctIndex, targetIndex), correctIndex: targetIndex };
  });
}

/**
 * `options` + string `answer` variant. The answer text is unchanged; only the
 * option order moves. Items whose answer is not exactly one of the options
 * (after trimming) are returned unchanged and do not take a slot.
 */
export function rebalanceAnswerTextPositions<T extends AnswerTextChoice>(items: T[], seed: string): T[] {
  const keyed = items.map((item, index) => ({ index, correctIndex: answerIndex(item) }))
    .filter((entry) => entry.correctIndex >= 0 && items[entry.index]!.options.length >= 2);
  const slots = slotsFor(keyed.map((entry) => items[entry.index]!.options.length), seed);
  const result = [...items];
  keyed.forEach((entry, position) => {
    const item = items[entry.index]!;
    result[entry.index] = { ...item, options: moveCorrect(item.options, entry.correctIndex, slots[position]!) };
  });
  return result;
}

/**
 * Items with nested `variants` (weekly review): the items are balanced with
 * `seed`, and all variants together are balanced independently with
 * `${seed}:variants`, so a variant never simply mirrors its parent's slot.
 */
export function rebalanceAnswerTextPositionsWithVariants<V extends AnswerTextChoice, T extends AnswerTextChoice & { variants?: V[] }>(items: T[], seed: string): T[] {
  const balanced = rebalanceAnswerTextPositions(items, seed);
  const flat = balanced.flatMap((item) => item.variants ?? []);
  if (!flat.length) return balanced;
  const balancedVariants = rebalanceAnswerTextPositions(flat, `${seed}:variants`);
  let cursor = 0;
  return balanced.map((item) => {
    if (!item.variants) return item;
    const variants = balancedVariants.slice(cursor, cursor + item.variants.length);
    cursor += item.variants.length;
    return { ...item, variants };
  });
}

/** Index of the option equal to `answer` (exact first, then trimmed); -1 when absent or ambiguous. */
function answerIndex(item: AnswerTextChoice): number {
  const exact = item.options.indexOf(item.answer);
  if (exact >= 0) return item.options.indexOf(item.answer, exact + 1) >= 0 ? -1 : exact;
  const wanted = item.answer.trim();
  const trimmed = item.options.map((option) => option.trim());
  const first = trimmed.indexOf(wanted);
  return first >= 0 && trimmed.indexOf(wanted, first + 1) < 0 ? first : -1;
}

/** Share of items whose key sits at each position (index = position). */
export function answerPositionShares(correctIndexes: number[], optionCount: number): number[] {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const index of correctIndexes) if (index >= 0 && index < optionCount) counts[index]! += 1;
  return counts.map((count) => (correctIndexes.length ? count / correctIndexes.length : 0));
}
