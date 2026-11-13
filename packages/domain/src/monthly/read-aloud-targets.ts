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

/**
 * Read-aloud position overlaps (13/11, B1 2026-12): the combined review passage
 * counts the first two examples of each monthly sound once each, and a word
 * inside a marked phrase is that phrase's position. A linking or other phrase
 * example that reuses another sound's read-aloud word ("checked it" next to
 * "checked", "called us" next to "called") makes the passage almost impossible
 * to write, so the month's examples must keep them apart:
 * - two read-aloud examples (the first two of any sound) never share a word;
 * - a phrase example of one sound (any position) never contains a single-word
 *   read-aloud example of another sound ("asked about it" next to "asked").
 * Small function words (it, us, the, to, on …) may repeat: they are never
 * targets on their own, unless one example is wholly inside the other.
 */
const READ_ALOUD_FUNCTION_WORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "some", "any", "all", "each", "every", "no", "not",
  "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours", "he", "him", "his", "she", "her", "hers", "it", "its", "they", "them", "their", "theirs", "there", "here",
  "to", "for", "of", "at", "from", "in", "on", "by", "with", "about", "into", "onto", "up", "out", "off", "over", "after", "before", "as", "than",
  "and", "but", "or", "so", "if", "when", "while",
  "am", "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "have", "has", "had",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must", "can't", "won't"
]);

/** The words of an example as spoken (‿, ↗ and (noun) notes removed), lower case. */
export function monthlyReadAloudExampleTokens(word: string): string[] {
  return monthlyPronunciationExampleText(word).toLocaleLowerCase("en-US").match(/[a-z0-9]+(?:'[a-z0-9]+)*/gu) ?? [];
}

const isReadAloudFunctionWord = (token: string) => READ_ALOUD_FUNCTION_WORDS.has(token)
  || READ_ALOUD_FUNCTION_WORDS.has(token.endsWith("n't") ? token.slice(0, -3) : token.replace(/'(?:s|re|ve|ll|d|m)$/u, ""));

/** Why two examples cannot both be read-aloud targets of one passage, or undefined when they can. */
export function monthlyReadAloudExampleClash(first: string, second: string): string | undefined {
  const a = monthlyReadAloudExampleTokens(first);
  const b = monthlyReadAloudExampleTokens(second);
  if (!a.length || !b.length) return undefined;
  const shared = a.find((token) => !isReadAloudFunctionWord(token) && b.includes(token));
  if (shared) return `"${monthlyPronunciationExampleText(first)}" and "${monthlyPronunciationExampleText(second)}" share the word "${shared}"`;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  for (let start = 0; start + short.length <= long.length; start += 1) {
    if (short.every((token, index) => long[start + index] === token)) return `"${short.join(" ")}" is inside "${long.join(" ")}"`;
  }
  return undefined;
}

/** Examples that form one phrase (two or more spoken words). */
export function isMonthlyReadAloudPhraseExample(word: string): boolean {
  return monthlyReadAloudExampleTokens(word).length > 1;
}

/** How many examples of each sound the combined review passage reads aloud (`requiredPositions`). */
export const MONTHLY_READ_ALOUD_POSITIONS_PER_SOUND = 2;

export interface MonthlyReadAloudOverlap {
  soundId: string; exampleId: string; word: string;
  otherSoundId: string; otherExampleId: string; otherWord: string;
  reason: string;
}

/**
 * Plan validator: every pair of examples of the month that breaks the rule above
 * (both read-aloud positions, or a phrase of one sound against a single-word
 * read-aloud position of another). [] when the month's examples can share one passage.
 */
export function monthlyReadAloudPositionOverlaps(sounds: readonly MonthlyReadAloudSoundSource[]): MonthlyReadAloudOverlap[] {
  const entries = sounds.flatMap((sound) => sound.examples.map((example, index) => ({
    soundId: sound.id, exampleId: example.id, word: example.word,
    required: index < MONTHLY_READ_ALOUD_POSITIONS_PER_SOUND, phrase: isMonthlyReadAloudPhraseExample(example.word)
  })));
  const overlaps: MonthlyReadAloudOverlap[] = [];
  entries.forEach((first, index) => {
    for (const second of entries.slice(index + 1)) {
      const otherSound = first.soundId !== second.soundId;
      const standaloneInPhrase = (single: typeof first, phrase: typeof first) => single.required && !single.phrase && phrase.phrase;
      const applies = (first.required && second.required) || (otherSound && (standaloneInPhrase(first, second) || standaloneInPhrase(second, first)));
      const reason = applies ? monthlyReadAloudExampleClash(first.word, second.word) : undefined;
      if (reason) overlaps.push({ soundId: first.soundId, exampleId: first.exampleId, word: first.word, otherSoundId: second.soundId, otherExampleId: second.exampleId, otherWord: second.word, reason });
    }
  });
  return overlaps;
}
