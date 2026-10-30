export type LessonGenerationCellResult<TLevel extends string = string> = {
  week: number;
  level: TLevel;
  status: "succeeded" | "failed";
  /** Server-side level outcome from the weekly batch route. */
  outcome?: WeeklyBatchLevelOutcome;
  completedDays?: number[];
  error?: string;
};

export type WeeklyBatchLevelOutcome = "completed" | "resumed" | "partial" | "failed";

const OUTCOME_LABELS: Record<WeeklyBatchLevelOutcome, string> = {
  completed: "hoàn thành",
  resumed: "hoàn thành (tiếp tục từ checkpoint)",
  partial: "lưu một phần",
  failed: "lỗi"
};

/** One readable line per level, e.g. "A1: hoàn thành · A2: lưu một phần (ngày 1, 3)". */
export function describeBatchLevelResults(results: readonly LessonGenerationCellResult[]): string {
  return results.map((result) => {
    const outcome = result.outcome ?? (result.status === "succeeded" ? "completed" : "failed");
    const days = outcome === "partial" && result.completedDays?.length ? ` (ngày ${result.completedDays.join(", ")})` : "";
    const error = outcome === "partial" || outcome === "failed" ? (result.error ? ` — ${result.error}` : "") : "";
    return `${result.level}: ${OUTCOME_LABELS[outcome]}${days}${error}`;
  }).join(" · ");
}

export type LessonGenerationJob = {
  week: number;
  level: string;
  status: "running" | "succeeded" | "failed";
  error?: string;
};

const lessonGenerationJobs = new Map<string, { state: LessonGenerationJob; promise: Promise<unknown> }>();
const lessonGenerationListeners = new Set<() => void>();
let lessonGenerationSnapshot: LessonGenerationJob[] = [];

export function startLessonGenerationJob<T>(week: number, level: string, generate: () => Promise<T>): Promise<T> {
  const key = `${week}:${level}`;
  const current = lessonGenerationJobs.get(key);
  if (current?.state.status === "running") return current.promise as Promise<T>;

  const state: LessonGenerationJob = { week, level, status: "running" };
  const promise = generate().then(
    result => {
      setLessonGenerationJob(key, { ...state, status: "succeeded" }, promise);
      return result;
    },
    error => {
      setLessonGenerationJob(key, { ...state, status: "failed", error: errorMessage(error) }, promise);
      throw error;
    }
  );
  setLessonGenerationJob(key, state, promise);
  return promise;
}

export function lessonGenerationJobsSnapshot(): LessonGenerationJob[] {
  return lessonGenerationSnapshot;
}

export function subscribeLessonGenerationJobs(listener: () => void): () => void {
  lessonGenerationListeners.add(listener);
  return () => lessonGenerationListeners.delete(listener);
}

export function __resetLessonGenerationJobsForTests(): void {
  lessonGenerationJobs.clear();
  publishLessonGenerationJobs();
}

function setLessonGenerationJob(key: string, state: LessonGenerationJob, promise: Promise<unknown>): void {
  lessonGenerationJobs.set(key, { state, promise });
  publishLessonGenerationJobs();
}

function publishLessonGenerationJobs(): void {
  lessonGenerationSnapshot = [...lessonGenerationJobs.values()].map(job => job.state);
  lessonGenerationListeners.forEach(listener => listener());
}

export async function generateLessonCellsSettled<TLevel extends string>(
  weekNumbers: readonly number[],
  levels: readonly TLevel[],
  generate: (week: number, level: TLevel) => Promise<unknown>,
  onStart?: (week: number, level: TLevel, completed: number, total: number) => void
): Promise<Array<LessonGenerationCellResult<TLevel>>> {
  const results: Array<LessonGenerationCellResult<TLevel>> = [];
  const total = weekNumbers.length * levels.length;
  for (const week of weekNumbers) {
    const completed = results.length;
    const settled = await Promise.all(levels.map(async (level, index) => {
      onStart?.(week, level, completed + index, total);
      try {
        // One API job owns the complete T2-T6 set for this level. Component
        // retries happen inside that job so a transport retry cannot replace
        // valid AI work that was already persisted as a partial draft.
        await generate(week, level);
        return { week, level, status: "succeeded" as const };
      } catch (error) {
        return { week, level, status: "failed" as const, error: errorMessage(error) };
      }
    }));
    results.push(...settled);
    if (settled.some(result => result.status === "failed")) break;
  }
  return results;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "UNKNOWN_GENERATION_ERROR";
}

export async function generateLessonWeeksBatchSettled<TLevel extends string>(
  weekNumbers: readonly number[],
  levels: readonly TLevel[],
  generateWeekBatch: (week: number, levels: readonly TLevel[]) => Promise<{
    weekNumber: number;
    levels: Array<{
      cefr: TLevel;
      status: WeeklyBatchLevelOutcome;
      completedDays?: number[];
      error?: { code: string; message?: string };
    }>;
  }>,
  onStart?: (week: number, level: TLevel, completed: number, total: number) => void
): Promise<Array<LessonGenerationCellResult<TLevel>>> {
  const results: Array<LessonGenerationCellResult<TLevel>> = [];
  const total = weekNumbers.length * levels.length;
  for (const week of weekNumbers) {
    const completed = results.length;
    levels.forEach((level, index) => {
      onStart?.(week, level, completed + index, total);
    });
    const batchPromise = generateWeekBatch(week, levels);
    for (const level of levels) {
      setLessonGenerationJob(`${week}:${level}`, { week, level, status: "running" }, batchPromise);
    }
    try {
      const response = await batchPromise;
      const byLevel = new Map(response.levels.map((entry) => [entry.cefr, entry]));
      const settled = levels.map((level): LessonGenerationCellResult<TLevel> => {
        const entry = byLevel.get(level);
        const outcome: WeeklyBatchLevelOutcome = entry?.status ?? "failed";
        const completedDays = entry?.completedDays ?? [];
        if (outcome === "partial" || outcome === "failed") {
          const errText = entry?.error?.message || entry?.error?.code || "AI_LESSON_GENERATION_FAILED";
          setLessonGenerationJob(`${week}:${level}`, { week, level, status: "failed", error: errText }, batchPromise);
          return { week, level, status: "failed", outcome, completedDays, error: errText };
        }
        setLessonGenerationJob(`${week}:${level}`, { week, level, status: "succeeded" }, batchPromise);
        return { week, level, status: "succeeded", outcome, completedDays };
      });
      results.push(...settled);
      if (settled.some((result) => result.status === "failed")) break;
    } catch (error) {
      const errText = errorMessage(error);
      const settled = levels.map((level): LessonGenerationCellResult<TLevel> => {
        setLessonGenerationJob(`${week}:${level}`, { week, level, status: "failed", error: errText }, batchPromise);
        return { week, level, status: "failed", error: errText };
      });
      results.push(...settled);
      break;
    }
  }
  return results;
}
