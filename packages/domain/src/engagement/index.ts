import type { CefrLevel, ContentImageAttribution } from "@e4s/contracts";

export type GameKey = "scramble" | "crossword" | "eggs" | "mario" | "sort" | "typing";

export interface GameWord {
  id: string;
  english: string;
  vietnamese: string;
  partOfSpeech: string;
  imageQuery?: string;
  imageUrl?: string;
  imageAttribution?: ContentImageAttribution;
}

export interface GameAnswer {
  wordId: string;
  answer: string;
  attempts?: number | undefined;
  usedHint?: boolean | undefined;
  combo?: number | undefined;
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

export function seasonRioRoundPlan<Word>(words: readonly Word[]): SeasonRioRoundPlan<Word> {
  const gateWords = words.slice(0, 8);
  const dedicatedBossWords = words.slice(gateWords.length, gateWords.length + 3);
  const bossWords = dedicatedBossWords.length ? dedicatedBossWords : gateWords.slice(0, 3);
  const bossQuestions = bossWords.length ? 3 : 0;
  return { gateCount: gateWords.length, bossQuestions, total: gateWords.length + bossQuestions, gateWords, bossWords };
}

export function weeklyPracticeAvailability(completed: number, total: number, submitted: boolean): {
  state: "locked" | "open" | "submitted";
  remaining: number;
} {
  const remaining = Math.max(0, total - completed);
  if (submitted) return { state: "submitted", remaining };
  return remaining === 0 && total > 0 ? { state: "open", remaining } : { state: "locked", remaining };
}

export function scoreGameAttempt(
  game: GameKey,
  words: readonly GameWord[],
  answers: readonly GameAnswer[],
  options: { hintsUsed?: number | undefined; attemptSeed?: number | undefined } = {}
): {
  score: number;
  maxScore: number;
  correct: number;
  total: number;
} {
  const wordById = new Map(words.map((word) => [word.id, word]));
  let score = 0;
  let correct = 0;
  const total = gameRoundTotal(game, words, answers);
  const maxScore = game === "scramble" ? total * 2 : game === "typing" ? total * 50 : total;
  const scoringWords = options.attemptSeed === undefined ? words : prepareGameAttempt(words, options.attemptSeed);
  const remainingByWord = scoreableWordOccurrences(game, scoringWords);
  let accepted = 0;
  let typingCombo = 1;

  for (const answer of answers) {
    if (accepted >= total) break;
    const remaining = remainingByWord.get(answer.wordId) ?? 0;
    if (remaining <= 0) continue;
    remainingByWord.set(answer.wordId, remaining - 1);
    accepted += 1;
    const word = wordById.get(answer.wordId);
    if (!word) continue;
    const expected = game === "sort" ? sortGroup(word.partOfSpeech) : word.english;
    const matches = normalize(answer.answer) === normalize(expected);
    if (game === "scramble") {
      if (matches) score += answer.usedHint || (answer.attempts ?? 1) > 1 ? 1 : 2;
    } else if (game === "crossword") {
      if (matches) score += 1;
    } else if (game === "typing") {
      if (matches) {
        score += 10 * typingCombo;
        typingCombo = Math.min(5, typingCombo + 1);
      } else typingCombo = 1;
    } else {
      if (matches) score += 1;
    }
    if (matches) correct += 1;
  }

  if (game === "crossword") score = Math.max(0, score - clamp(options.hintsUsed ?? 0, 0, maxScore));

  return { score: Math.min(score, maxScore), maxScore, correct: Math.min(correct, total), total };
}

function scoreableWordOccurrences(game: GameKey, words: readonly GameWord[]): Map<string, number> {
  let rounds: readonly GameWord[];
  if (game === "scramble") rounds = words.filter((word) => normalize(word.english).replace(/[^a-z]/g, "").length >= 3).slice(0, 8);
  else if (game === "eggs") rounds = words.slice(0, 10);
  else if (game === "sort") rounds = words.filter((word) => word.partOfSpeech.trim()).slice(0, 12);
  else if (game === "typing") rounds = words.filter((word) => /^[a-z][a-z\s'-]*$/i.test(word.english)).slice(0, 10);
  else if (game === "mario") {
    const plan = seasonRioRoundPlan(words);
    rounds = [...plan.gateWords, ...Array.from({ length: plan.bossQuestions }, (_, index) => plan.bossWords[index % plan.bossWords.length]!)];
  } else rounds = words.slice(0, 10);

  const occurrences = new Map<string, number>();
  for (const word of rounds) occurrences.set(word.id, (occurrences.get(word.id) ?? 0) + 1);
  return occurrences;
}

function gameRoundTotal(game: GameKey, words: readonly GameWord[], answers: readonly GameAnswer[]): number {
  if (game === "scramble") return Math.min(8, words.filter((word) => normalize(word.english).replace(/[^a-z]/g, "").length >= 3).length);
  if (game === "crossword") return Math.min(10, answers.length);
  if (game === "eggs") return Math.min(10, words.length);
  if (game === "mario") return seasonRioRoundPlan(words).total;
  if (game === "sort") return Math.min(12, words.filter((word) => word.partOfSpeech.trim()).length);
  return Math.min(10, words.filter((word) => /^[a-z][a-z\s'-]*$/i.test(word.english)).length);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
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
