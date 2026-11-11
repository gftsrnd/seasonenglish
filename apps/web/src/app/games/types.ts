import type { GameFinishInput, GameWordSetView } from "@e4s/contracts";
import { prepareGameAttempt } from "@e4s/domain/engagement";

export { prepareGameAttempt };

export type GameWord = GameWordSetView["words"][number];
export type FinishGame = (input: GameFinishInput) => void | Promise<void>;

// The result API accepts combo 1–5 per answer (see engagement routes). A longer
// streak is still shown in the HUD but must be clamped before it is submitted.
export const MAX_GAME_COMBO = 5;
export function gameCombo(streak: number) {
  return Math.min(MAX_GAME_COMBO, Math.max(1, Math.trunc(streak)));
}

// Round sizes mirror `scoreGameAttempt` in @e4s/domain/engagement. Tutorials
// read them too, so the copy always matches the HUD ("Từ 1/8") and max score.
export const SCRAMBLE_ROUND_SIZE = 8;
export const CATCH_ROUND_SIZE = 10;
export const TYPING_ROUND_SIZE = 10;
export function isTypingWord(word: Pick<GameWord, "english">) {
  return /^[a-z][a-z\s'-]*$/i.test(word.english);
}
export function gameRoundWordCount(key: "scramble" | "eggs" | "typing", words: readonly GameWord[]) {
  if (key === "scramble") return Math.min(SCRAMBLE_ROUND_SIZE, words.filter((word) => letters(word.english).length >= 3).length);
  if (key === "eggs") return Math.min(CATCH_ROUND_SIZE, words.length);
  return Math.min(TYPING_ROUND_SIZE, words.filter(isTypingWord).length);
}

export function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

export function letters(value: string) {
  return normalize(value).replace(/[^a-z]/g, "");
}

export function seededShuffle<T>(items: readonly T[], seed: number) {
  const result = [...items];
  let value = (seed + 1) * 2_654_435_761;
  for (let index = result.length - 1; index > 0; index -= 1) {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    const target = value % (index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function choices(words: readonly GameWord[], current: GameWord, count = 4, attemptSeed = 0) {
  const candidates = words.filter((word) => word.id !== current.id).sort((left, right) => left.id.localeCompare(right.id));
  const identitySeed = stringSeed(`${current.id}|${candidates.map((word) => word.id).join("|")}`);
  const rest = seededShuffle(candidates, identitySeed ^ 0x51ed270b);
  const baseChoices = seededShuffle([current, ...rest.slice(0, Math.max(0, count - 1))], identitySeed ^ 0x1b873593);
  return rotateForAttempt(baseChoices, attemptSeed);
}

function rotateForAttempt<T>(items: readonly T[], attemptSeed: number) {
  if (items.length < 2) return [...items];
  const offset = ((attemptSeed % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function stringSeed(value: string): number {
  let seed = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}
