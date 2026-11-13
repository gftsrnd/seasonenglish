import { monthlyPronunciationExampleText } from "./pronunciation-contrast.js";

/**
 * Read-aloud targets (13/11): the words and phrases of the pronunciation
 * passage that the plan's target positions name (asked, checked, "checked it",
 * "called us" …). The server counts them and the learner sees them bolded with
 * the same rule: longer targets first, whole words, and a word inside a marked
 * phrase is that phrase's position, never a second one.
 */
export interface MonthlyReadAloudSpan { start: number; end: number; target: string }

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Every target occurrence in the passage, in passage order. */
export function monthlyReadAloudTargetSpans(passage: string, targets: readonly string[]): MonthlyReadAloudSpan[] {
  const unique = [...new Set(targets.map((target) => target.trim().toLocaleLowerCase("en-US")).filter(Boolean))];
  const lowered = passage.replace(/[’‘]/gu, "'").toLocaleLowerCase("en-US");
  // Lower-casing never changes the length of the passages we store; if it ever does, mark nothing rather than the wrong letters.
  if (lowered.length !== passage.length) return [];
  let spoken = lowered;
  const ordered = unique.sort((a, b) => b.split(/\s+/u).length - a.split(/\s+/u).length || b.length - a.length);
  const spans: MonthlyReadAloudSpan[] = [];
  for (const target of ordered) {
    const pattern = new RegExp(`(?<![a-z])${escapeRegExp(target)}(?![a-z])`, "gu");
    for (const found of spoken.matchAll(pattern)) spans.push({ start: found.index!, end: found.index! + found[0].length, target });
    spoken = spoken.replace(pattern, (match) => "#".repeat(match.length));
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** How often each target occurs (the server's read-aloud count). */
export function monthlyReadAloudTargetCounts(passage: string, targets: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>(targets.map((target) => [target.trim().toLocaleLowerCase("en-US"), 0] as const).filter(([target]) => Boolean(target)));
  for (const span of monthlyReadAloudTargetSpans(passage, targets)) counts.set(span.target, (counts.get(span.target) ?? 0) + 1);
  return counts;
}

export interface MonthlyReadAloudSoundSource { id: string; examples: ReadonlyArray<{ id: string; word: string }> }
export interface MonthlyReadAloudPlanSource { requiredPositions?: ReadonlyArray<{ soundId: string; exampleId: string }>; exampleIds?: readonly string[] }

function positionsOf(value: unknown): Array<{ soundId?: string; exampleId: string }> {
  return Array.isArray(value) ? value.flatMap((entry) => entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).exampleId === "string"
    ? [{ exampleId: (entry as Record<string, string>).exampleId!, ...(typeof (entry as Record<string, unknown>).soundId === "string" ? { soundId: (entry as Record<string, string>).soundId } : {}) }]
    : []) : [];
}

/**
 * The passage targets of a pronunciation part: its stored targetPositions mapped to their example words;
 * a lesson stored without positions takes the day plan's required positions, then its planned example
 * words. Nothing resolvable → [].
 */
export function monthlyReadAloudTargetWords(content: Record<string, unknown> | undefined, plan: MonthlyReadAloudPlanSource | undefined, sounds: readonly MonthlyReadAloudSoundSource[] | null | undefined): string[] {
  if (!sounds?.length) return [];
  const word = (position: { soundId?: string; exampleId: string }) => {
    const pool = position.soundId ? sounds.filter((sound) => sound.id === position.soundId) : sounds;
    const example = pool.flatMap((sound) => sound.examples).find((candidate) => candidate.id === position.exampleId);
    return example ? monthlyPronunciationExampleText(example.word) : "";
  };
  const resolve = (positions: Array<{ soundId?: string; exampleId: string }>) => { const words = positions.map(word); return words.length && words.every(Boolean) ? words : []; };
  const stored = resolve(positionsOf(content?.targetPositions));
  if (stored.length) return stored;
  const planned = resolve(positionsOf(plan?.requiredPositions));
  if (planned.length) return planned;
  return resolve((plan?.exampleIds ?? []).map((exampleId) => ({ exampleId })));
}

/** Puts the passage targets on the pronunciation part (`passageTargets`) when it has a passage; other parts unchanged. */
export function withMonthlyReadAloudTargets<T extends { code?: string; content?: Record<string, unknown> }>(parts: readonly T[], plan: MonthlyReadAloudPlanSource | undefined, sounds: readonly MonthlyReadAloudSoundSource[] | null | undefined): T[] {
  return parts.map((part) => {
    if (part.code !== "pronunciation" || !part.content || typeof part.content.passage !== "string" || !part.content.passage.trim()) return part;
    const targets = monthlyReadAloudTargetWords(part.content, plan, sounds);
    return targets.length ? { ...part, content: { ...part.content, passageTargets: targets } } : part;
  });
}
