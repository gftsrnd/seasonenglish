import type { CefrLevel, ContentImageAttribution } from "@e4s/contracts";
import { buildCrosswordLayout } from "./crossword-layout.js";
import { scoreRound, type RoundScore, type RoundUnitOutcome } from "./round-scoring.js";

export type GameKey = "scramble" | "crossword" | "eggs" | "mario" | "sort" | "typing";

export interface GameWord {
  id: string;
  english: string;
  vietnamese: string;
  partOfSpeech: string;
  /** Short context sentence (or collocation) using the word in `partOfSpeech`; Word sort shows it so context decides the class. */
  example?: string;
  imageQuery?: string;
  imageUrl?: string;
  imageAttribution?: ContentImageAttribution;
}

/** Longest context line Word sort shows under the word (one line on desktop, at most two on phones). */
export const GAME_WORD_EXAMPLE_MAX_CHARS = 90;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pattern for one word token plus its common inflections (s/es/ed/ing, e-drop, y→ies/ied, doubled consonant). */
function tokenPattern(token: string): string {
  const lower = token.toLocaleLowerCase("en");
  if (!/^[a-z]+$/.test(lower) || lower.length < 2) return escapeRegExp(lower);
  const variants = new Set<string>([`${escapeRegExp(lower)}(?:s|es|ed|d|ing|'s)?`]);
  if (lower.endsWith("e")) variants.add(`${lower.slice(0, -1)}ing`);
  if (/[^aeiou]y$/.test(lower)) variants.add(`${lower.slice(0, -1)}(?:ies|ied)`);
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(lower)) variants.add(`${lower}${lower.at(-1)}(?:ed|ing)`);
  return `(?:${[...variants].join("|")})`;
}

/**
 * Locates the game word inside a context line (case-insensitive, whole words,
 * common inflections allowed). Returns the character span to highlight, or
 * null when the line does not actually contain the word.
 */
export function gameWordContextSpan(context: string, word: string): { start: number; end: number } | null {
  const tokens = word.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !context.trim()) return null;
  const pattern = new RegExp(`(?<![A-Za-z])${tokens.map(tokenPattern).join("[\\s-]+")}(?![A-Za-z])`, "i");
  const match = pattern.exec(context);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/** A usable Word sort context: trimmed, short, and containing the word. */
export function validGameWordExample(context: unknown, word: string): string | undefined {
  if (typeof context !== "string") return undefined;
  const value = context.trim().replace(/\s+/g, " ");
  if (!value || value.length > GAME_WORD_EXAMPLE_MAX_CHARS) return undefined;
  if (value.toLocaleLowerCase("en") === word.trim().toLocaleLowerCase("en")) return undefined;
  return gameWordContextSpan(value, word) ? value : undefined;
}

/**
 * Picks the context line for a learned lesson word: a full example sentence
 * first, then a collocation (longest first, it carries more context), always
 * one that really contains the word.
 */
export function pickGameWordExample(word: string, candidates: { examples?: unknown; collocations?: unknown }): string | undefined {
  const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const valid = (items: string[]) => items.map((item) => validGameWordExample(item, word)).filter((item): item is string => Boolean(item));
  const examples = valid(list(candidates.examples));
  const sentence = examples.find((item) => /^[A-Z].*[.!?]$/.test(item));
  if (sentence) return sentence;
  const phrases = [...examples, ...valid(list(candidates.collocations))];
  return phrases.sort((left, right) => right.length - left.length)[0];
}

export interface GameAnswer {
  wordId: string;
  answer: string;
  attempts?: number | undefined;
  usedHint?: boolean | undefined;
  /** Legacy client field; the shared rule computes the streak itself. */
  combo?: number | undefined;
  /** Active gameplay time spent on this unit (no loading, countdown or transitions). */
  ms?: number | undefined;
}

export interface GameEvent {
  type: "wrong_catch" | "timeout";
  wordId: string;
  answer: string;
}

export interface SeasonRioRoundPlan<Word> {
  gateCount: number;
  bossQuestions: number;
  total: number;
  gateWords: Word[];
  bossWords: Word[];
}

export function prepareGameAttempt<Word extends { id: string }>(words: readonly Word[], attemptSeed: number): Word[] {
  const canonical = [...words].sort((left, right) => left.id.localeCompare(right.id));
  const baseOrder = seededShuffle(canonical, stringSeed(canonical.map((word) => word.id).join("|")));
  if (baseOrder.length < 2) return baseOrder;
  const offset = ((attemptSeed % baseOrder.length) + baseOrder.length) % baseOrder.length;
  return [...baseOrder.slice(offset), ...baseOrder.slice(0, offset)];
}

/** 8 gates, then up to 3 boss questions with words the gates did not use (fewer words → smaller N). */
export function seasonRioRoundPlan<Word>(words: readonly Word[]): SeasonRioRoundPlan<Word> {
  const gateWords = words.slice(0, 8);
  const bossWords = words.slice(gateWords.length, gateWords.length + 3);
  return { gateCount: gateWords.length, bossQuestions: bossWords.length, total: gateWords.length + bossWords.length, gateWords, bossWords };
}

export const SCRAMBLE_ROUND_SIZE = 8;
export const CATCH_ROUND_SIZE = 10;
export const SORT_ROUND_SIZE = 12;
export const TYPING_ROUND_SIZE = 10;

export function isScrambleWord(word: { english: string }): boolean {
  return normalize(word.english).replace(/[^a-z]/g, "").length >= 3;
}
export function isTypingWord(word: { english: string }): boolean {
  return /^[a-z][a-z\s'-]*$/i.test(word.english);
}
export function isSortWord(word: { partOfSpeech?: string | undefined }): boolean {
  return Boolean(word.partOfSpeech?.trim());
}

type RoundWord = { id: string; english: string; partOfSpeech?: string | undefined };

/**
 * The units of one round, in play order, fixed by the stored word set and the round seed.
 * The web game builds its round with this same function and the server scores against it,
 * so N (and the crossword grid) never comes from the client.
 */
export function gameRoundWords<Word extends RoundWord>(game: GameKey, words: readonly Word[], attemptSeed = 0): Word[] {
  if (game === "scramble") return prepareGameAttempt(words.filter(isScrambleWord), attemptSeed).slice(0, SCRAMBLE_ROUND_SIZE);
  if (game === "crossword") return buildCrosswordLayout(prepareGameAttempt(words, attemptSeed)).placed.map((entry) => entry.word);
  if (game === "eggs") return prepareGameAttempt(words, attemptSeed).slice(0, CATCH_ROUND_SIZE);
  if (game === "mario") {
    const plan = seasonRioRoundPlan(prepareGameAttempt(words, attemptSeed));
    return [...plan.gateWords, ...plan.bossWords];
  }
  if (game === "sort") return prepareGameAttempt(words.filter(isSortWord), attemptSeed).slice(0, SORT_ROUND_SIZE);
  return prepareGameAttempt(words.filter(isTypingWord), attemptSeed).slice(0, TYPING_ROUND_SIZE);
}

/** Upper bounds for the reported gameplay time; beyond them the time is stored as unknown. */
export const MAX_UNIT_GAMEPLAY_MS = 600_000;
export const MAX_ROUND_GAMEPLAY_MS = 3_600_000;

export interface ScoredGameRound extends RoundScore {
  /** Round score 0–100 (also stored as the result's score, out of 100). */
  score: number;
  maxScore: 100;
  correct: number;
  total: number;
  unitIds: string[];
  outcomes: RoundUnitOutcome[];
  /** Sum of the per-unit active times, or null when it is missing or implausible. */
  gameplayMs: number | null;
}

/**
 * Maps one answer per unit (the first matching answer in play order; repeats are ignored)
 * to the shared outcome and scores the round. Never trusts a client score.
 */
export function scoreGameRound<Word extends RoundWord>(
  game: GameKey,
  words: readonly Word[],
  answers: readonly GameAnswer[],
  options: { attemptSeed?: number | undefined; events?: readonly GameEvent[] | undefined; units?: readonly Word[] | undefined } = {}
): ScoredGameRound {
  const units = options.units ?? gameRoundWords(game, words, options.attemptSeed ?? 0);
  const assigned: Array<GameAnswer | undefined> = units.map(() => undefined);
  for (const answer of answers) {
    const index = units.findIndex((unit, unitIndex) => unit.id === answer.wordId && !assigned[unitIndex]);
    if (index >= 0) assigned[index] = answer;
  }
  const timeouts = new Set((options.events ?? []).filter((event) => event.type === "timeout").map((event) => event.wordId));
  const outcomes = units.map((unit, index) => gameUnitOutcome(game, unit, assigned[index], timeouts.has(unit.id)));
  const scored = scoreRound(units, outcomes);
  const answered = assigned.filter((answer): answer is GameAnswer => Boolean(answer));
  return {
    ...scored,
    maxScore: 100,
    correct: outcomes.filter((outcome) => outcome === "first_try" || outcome === "assisted").length,
    total: units.length,
    unitIds: units.map((unit) => unit.id),
    outcomes,
    gameplayMs: roundGameplayMs(answered)
  };
}

function gameUnitOutcome(game: GameKey, word: RoundWord, answer: GameAnswer | undefined, timedOut: boolean): RoundUnitOutcome {
  if (!answer) return "unanswered";
  const expected = game === "sort" ? sortGroup(word.partOfSpeech ?? "") : word.english;
  if (normalize(answer.answer) === normalize(expected)) {
    return (answer.attempts ?? 1) > 1 || answer.usedHint ? "assisted" : "first_try";
  }
  if (timedOut || answer.answer === "[timeout]") return "timeout";
  // Season catch: an empty answer is a drop that reached the ground.
  if (!answer.answer.trim()) return game === "eggs" ? "timeout" : "skipped";
  return "wrong";
}

/** Sum of per-unit active times when every answered unit reports a plausible value. */
export function roundGameplayMs(answers: readonly Pick<GameAnswer, "ms">[]): number | null {
  if (!answers.length) return null;
  let total = 0;
  for (const answer of answers) {
    const ms = answer.ms;
    if (typeof ms !== "number" || !Number.isInteger(ms) || ms < 0 || ms > MAX_UNIT_GAMEPLAY_MS) return null;
    total += ms;
  }
  return total > 0 && total <= MAX_ROUND_GAMEPLAY_MS ? total : null;
}

export function weeklyPracticeAvailability(completed: number, total: number, submitted: boolean): {
  state: "locked" | "open" | "submitted";
  remaining: number;
} {
  const remaining = Math.max(0, total - completed);
  if (submitted) return { state: "submitted", remaining };
  return remaining === 0 && total > 0 ? { state: "open", remaining } : { state: "locked", remaining };
}

export function arenaEligible(level: CefrLevel | null | undefined): boolean {
  return Boolean(level && ["B1", "B2", "C1"].includes(level));
}

export function decideDuel(
  challenger: { score: number; maxScore: number },
  opponent: { score: number; maxScore: number }
): "challenger" | "opponent" | "draw" {
  const left = challenger.maxScore > 0 ? challenger.score / challenger.maxScore : 0;
  const right = opponent.maxScore > 0 ? opponent.score / opponent.maxScore : 0;
  if (left === right) return "draw";
  return left > right ? "challenger" : "opponent";
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function sortGroup(partOfSpeech: string): string {
  const value = normalize(partOfSpeech);
  if (/phrasal|phrase|idiom|expression/.test(value)) return "phrase";
  if (value.startsWith("noun")) return "noun";
  if (value.startsWith("verb")) return "verb";
  if (value.startsWith("adjective")) return "adjective";
  if (value.startsWith("adverb")) return "adverb";
  if (value.startsWith("preposition")) return "preposition";
  return "phrase";
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let value = (seed + 1) * 2_654_435_761;
  for (let index = result.length - 1; index > 0; index -= 1) {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    const target = value % (index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function stringSeed(value: string): number {
  let seed = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

export * from "./season-rewards.js";
export * from "./round-scoring.js";
export * from "./crossword-layout.js";
export * from "./arena-rating.js";
