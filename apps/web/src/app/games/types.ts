import type { GameFinishInput, GameWordSetView } from "@e4s/contracts";
import { prepareGameAttempt } from "@e4s/domain/engagement";

export { prepareGameAttempt };

export type GameWord = GameWordSetView["words"][number];
export type FinishGame = (input: GameFinishInput) => void | Promise<void>;

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
