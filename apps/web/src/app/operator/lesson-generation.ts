export type LessonGenerationCellResult<TLevel extends string = string> = {
  week: number;
  level: TLevel;
  status: "succeeded" | "failed";
  error?: string;
};

export async function generateLessonCellsSettled<TLevel extends string>(
  weekNumbers: readonly number[],
  levels: readonly TLevel[],
  generate: (week: number, level: TLevel) => Promise<unknown>,
  onStart?: (week: number, level: TLevel, completed: number, total: number) => void
): Promise<Array<LessonGenerationCellResult<TLevel>>> {
  const results: Array<LessonGenerationCellResult<TLevel>> = [];
  const total = weekNumbers.length * levels.length;
  for (const week of weekNumbers) {
    for (const level of levels) {
      onStart?.(week, level, results.length, total);
      try {
        await generate(week, level);
        results.push({ week, level, status: "succeeded" });
      } catch (error) {
        results.push({ week, level, status: "failed", error: errorMessage(error) });
      }
    }
  }
  return results;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "UNKNOWN_GENERATION_ERROR";
}
