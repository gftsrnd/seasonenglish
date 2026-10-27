import { describe, expect, it, vi } from "vitest";
import {
  __resetLessonGenerationJobsForTests,
  generateLessonCellsSettled,
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

  it("completes a four-week pilot sequentially instead of stopping after week two", async () => {
    __resetLessonGenerationJobsForTests();
    const generate = vi.fn(async (week: number, level: string) => {
      if (week === 3 && level === "B1") throw new Error("AI_OUTPUT_INVALID");
      return { week, level };
    });

    const result = await generateLessonCellsSettled([1, 2, 3, 4], ["A2", "B1"], generate);

    expect(generate.mock.calls).toEqual([
      [1, "A2"], [1, "B1"], [2, "A2"], [2, "B1"],
      [3, "A2"], [3, "B1"], [4, "A2"], [4, "B1"]
    ]);
    expect(result).toHaveLength(8);
    expect(result.filter((cell) => cell.status === "succeeded")).toHaveLength(7);
    expect(result).toContainEqual({ week: 3, level: "B1", status: "failed", error: "AI_OUTPUT_INVALID" });
    expect(result.at(-1)).toEqual({ week: 4, level: "B1", status: "succeeded" });
  });
});
