import type { GameAnswerInput, GameWordSetView } from "@e4s/contracts";

export type GameWord = GameWordSetView["words"][number];
export type FinishGame = (input: { answers: GameAnswerInput[]; hintsUsed?: number }) => void | Promise<void>;

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

export function choices(words: readonly GameWord[], current: GameWord, count = 4) {
  const rest = seededShuffle(words.filter((word) => word.id !== current.id), current.english.length);
  return seededShuffle([current, ...rest.slice(0, Math.max(0, count - 1))], current.vietnamese.length);
}
