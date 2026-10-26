export type LessonGenerationCellResult<TLevel extends string = string> = {
  week: number;
  level: TLevel;
  status: "succeeded" | "failed";
  error?: string;
};

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
