import { describe, expect, it, vi } from "vitest";
import {
  __resetLessonGenerationJobsForTests,
  describeBatchLevelResults,
  generateLessonCellsSettled,
  generateLessonWeeksBatchSettled,
  lessonGenerationJobsSnapshot,
  startLessonGenerationJob
} from "./lesson-generation.js";

describe("operator lesson generation batch", () => {
  it("keeps a generation job alive and observable after the route that started it leaves", async () => {
    __resetLessonGenerationJobsForTests();
    let finish!: () => void;
    const generate = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

    const first = startLessonGenerationJob(1, "A2", generate);
    const duplicate = startLessonGenerationJob(1, "A2", generate);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(duplicate).toBe(first);
    expect(lessonGenerationJobsSnapshot()).toEqual([
      expect.objectContaining({ week: 1, level: "A2", status: "running" })
    ]);

    finish();
    await first;
    expect(lessonGenerationJobsSnapshot()).toEqual([
      expect.objectContaining({ week: 1, level: "A2", status: "succeeded" })
    ]);
  });

  it("continues with later CEFR cells after one cell fails", async () => {
    const generate = vi.fn(async (week: number, level: string) => {
      if (level === "A2") throw new Error("AI_OUTPUT_INVALID");
      return { week, level };
    });

    const result = await generateLessonCellsSettled([1], ["A1", "A2", "B1"], generate);

    expect(generate.mock.calls).toEqual([[1, "A1"], [1, "A2"], [1, "B1"]]);
    expect(result).toEqual([
      { week: 1, level: "A1", status: "succeeded" },
      { week: 1, level: "A2", status: "failed", error: "AI_OUTPUT_INVALID" },
      { week: 1, level: "B1", status: "succeeded" }
    ]);
  });

  it("supports four selected weeks but stops at the first failed week", async () => {
    __resetLessonGenerationJobsForTests();
    const generate = vi.fn(async (week: number, level: string) => {
      if (week === 3 && level === "B1") throw new Error("AI_OUTPUT_INVALID");
      return { week, level };
    });

    const result = await generateLessonCellsSettled([1, 2, 3, 4], ["A2", "B1"], generate);

    expect(generate.mock.calls).toEqual([
      [1, "A2"], [1, "B1"], [2, "A2"], [2, "B1"],
      [3, "A2"], [3, "B1"]
    ]);
    expect(result).toHaveLength(6);
    expect(result.filter((cell) => cell.status === "succeeded")).toHaveLength(5);
    expect(result).toContainEqual({ week: 3, level: "B1", status: "failed", error: "AI_OUTPUT_INVALID" });
    expect(result.every((cell) => cell.week !== 4)).toBe(true);
  });

  it("runs every active level in one week together", async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const generate = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });

    const pending = generateLessonCellsSettled([2], ["A1", "A2", "B1", "B2", "C1"], generate);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(5));

    expect(peak).toBe(5);
    releases.forEach(release => release());
    await expect(pending).resolves.toHaveLength(5);
  });

  it("does not start the next week until every level in the current week succeeds", async () => {
    const releases = new Map<number, Array<() => void>>();
    const generate = vi.fn(async (week: number) => {
      await new Promise<void>((resolve) => {
        const weekReleases = releases.get(week) ?? [];
        weekReleases.push(resolve);
        releases.set(week, weekReleases);
      });
    });
    const levels = ["A1", "A2", "B1", "B2", "C1"];

    const pending = generateLessonCellsSettled([2, 3], levels, generate);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(5));
    expect(generate.mock.calls.every(([week]) => week === 2)).toBe(true);

    releases.get(2)?.forEach(release => release());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(10));
    expect(generate.mock.calls.slice(5).every(([week]) => week === 3)).toBe(true);

    releases.get(3)?.forEach(release => release());
    await expect(pending).resolves.toHaveLength(10);
  });

  it("keeps successful level results but stops before the next week when one level fails", async () => {
    const levels = ["A1", "A2", "B1", "B2", "C1"];
    const generate = vi.fn(async (week: number, level: string) => {
      if (week === 2 && level === "B2") throw new Error("AI_OUTPUT_INVALID");
    });

    const result = await generateLessonCellsSettled([2, 3], levels, generate);

    expect(generate.mock.calls).toEqual(levels.map(level => [2, level]));
    expect(result).toHaveLength(5);
    expect(result.filter(cell => cell.status === "succeeded")).toHaveLength(4);
    expect(result).toContainEqual({ week: 2, level: "B2", status: "failed", error: "AI_OUTPUT_INVALID" });
  });

  it("dispatches one server-side 5-level batch request per week and preserves succeeded levels when one level fails", async () => {
    __resetLessonGenerationJobsForTests();
    const levels = ["A1", "A2", "B1", "B2", "C1"] as const;
    const generateBatch = vi.fn(async (week: number, requestedLevels: readonly (typeof levels)[number][]) => ({
      weekNumber: week,
      levels: requestedLevels.map((cefr) => cefr === "B2"
        ? { cefr, status: "failed" as const, completedDays: [], error: { code: "AI_OUTPUT_INVALID", message: "B2 speaking repair failed" } }
        : cefr === "A2"
          ? { cefr, status: "partial" as const, completedDays: [1, 3], error: { code: "AI_LEVEL_GENERATION_INCOMPLETE" } }
          : { cefr, status: cefr === "A1" ? "resumed" as const : "completed" as const, completedDays: [1, 2, 3, 4, 5] })
    }));

    const result = await generateLessonWeeksBatchSettled([3, 4], levels, generateBatch);

    expect(generateBatch).toHaveBeenCalledTimes(1);
    expect(generateBatch).toHaveBeenCalledWith(3, levels);
    expect(result).toEqual([
      { week: 3, level: "A1", status: "succeeded", outcome: "resumed", completedDays: [1, 2, 3, 4, 5] },
      { week: 3, level: "A2", status: "failed", outcome: "partial", completedDays: [1, 3], error: "AI_LEVEL_GENERATION_INCOMPLETE" },
      { week: 3, level: "B1", status: "succeeded", outcome: "completed", completedDays: [1, 2, 3, 4, 5] },
      { week: 3, level: "B2", status: "failed", outcome: "failed", completedDays: [], error: "B2 speaking repair failed" },
      { week: 3, level: "C1", status: "succeeded", outcome: "completed", completedDays: [1, 2, 3, 4, 5] }
    ]);
    expect(describeBatchLevelResults(result)).toBe(
      "A1: hoàn thành (tiếp tục từ checkpoint) · A2: lưu một phần (ngày 1, 3) — AI_LEVEL_GENERATION_INCOMPLETE · B1: hoàn thành · B2: lỗi — B2 speaking repair failed · C1: hoàn thành"
    );
  });
});
