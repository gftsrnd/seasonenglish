import { describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import {
  buildWeeklyLessonLevelAllocation,
  buildWeeklyLessonDayContract,
  prepareWeeklyLessonRetryState,
  promptEntities,
  extractPromptEntities,
  ungroundedPromptEntities,
  normalizeWeeklyLessonPlanBlueprint,
  runWeeklyLessonDaySequence,
  runWeeklyLessonLevelBatch,
  weeklyLessonPlanBlueprintFindings,
  validateWeeklyLessonCrossLevelSet
} from "./weekly-generation.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const lesson = (dayNumber: number, content: Record<string, unknown>) => ({
  dayNumber,
  title: "Shared communicative focus",
  parts: [{ code: "grammar", title: "Grammar", content }]
});

const blueprintVocabularyByDay = [
  "budget, report, total",
  "forecast, variance, cost",
  "invoice, payment, amount",
  "expense, approval, receipt",
  "summary, meeting, action"
];
const blueprintLevels = ["A1", "A2", "B1", "B2", "C1"] as const;
const blueprintPlan = Object.fromEntries(blueprintLevels.map((level) => [
  level,
  Array.from({ length: 5 }, (_, index) => `Outcome: ${level} completes workplace task ${index + 1} | Vocabulary: ${blueprintVocabularyByDay[index]} | Frame: Could you check the total? | Skill emphasis: speaking`)
])) as Record<(typeof blueprintLevels)[number], string[]>;

describe("cross-level weekly lesson validation", () => {
  it("accepts one complete English blueprint contract shared by all pipeline stages", () => {
    expect(weeklyLessonPlanBlueprintFindings(blueprintPlan)).toEqual([]);
  });

  it("requires the plan to allocate each primary vocabulary term to one day only", () => {
    const repeated = {
      ...blueprintPlan,
      A1: [...blueprintPlan.A1]
    } as typeof blueprintPlan;
    repeated.A1[4] = repeated.A1[4]!.replace("summary, meeting, action", "budget, meeting, action");

    expect(weeklyLessonPlanBlueprintFindings(repeated)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "plan.A1.4", message: expect.stringContaining("budget") })
    ]));
  });

  it("normalizes a legacy single-skill Vietnamese plan once before the five-level batch", async () => {
    const runTask = vi.fn().mockResolvedValue({
      output: { plan: blueprintPlan },
      metadata: { traceId: "trace", taskId: "weekly_lesson_plan_blueprint", provider: "test", model: "test", attempts: 1, latencyMs: 1, inputHash: "hash", schemaValid: true, usage: {} }
    });
    const week = {
      weekNumber: 1,
      topic: "Preparing a Quarterly Budget Review",
      description: "Prepare and present a quarterly budget report.",
      objectives: "Explain variances and answer follow-up questions.",
      keyVocabHint: "budget, variance, forecast",
      plan: { B1: ["Từ vựng: variance", "Ngữ pháp: could", "Đọc báo cáo", "Luyện nói", "Ôn tập"] }
    };

    const normalized = await normalizeWeeklyLessonPlanBlueprint(
      week,
      { prompt: "Generate the approved weekly curriculum." },
      { runTask } as unknown as AiTaskRunner
    );

    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask).toHaveBeenCalledWith("weekly_lesson_plan_blueprint", expect.objectContaining({
      topic: week.topic,
      plan: week.plan
    }), expect.objectContaining({ maxAttempts: 3 }));
    expect(normalized.week.topic).toBe(week.topic);
    expect(normalized.week.plan).toEqual(blueprintPlan);
  });

  it("does not spend an AI call when the approved plan already satisfies the blueprint contract", async () => {
    const runTask = vi.fn();
    const week = {
      weekNumber: 1,
      topic: "Preparing a Quarterly Budget Review",
      description: "Prepare and present a quarterly budget report.",
      objectives: "Explain variances and answer follow-up questions.",
      keyVocabHint: "budget, variance, forecast",
      plan: blueprintPlan
    };

    const normalized = await normalizeWeeklyLessonPlanBlueprint(
      week,
      { prompt: "Generate the approved weekly curriculum." },
      { runTask } as unknown as AiTaskRunner
    );

    expect(runTask).not.toHaveBeenCalled();
    expect(normalized.week).toEqual(week);
  });

  it("does not misread a capitalized Vietnamese question opener as a person's name", () => {
    expect(promptEntities("Theo đoạn nghe, nhóm muốn làm gì với tiền đi lại?")).toEqual([]);
    expect(promptEntities("Theo Mai, nhóm nên giảm khoản nào?")).toEqual(["mai"]);
  });

  it("keeps one immutable week context while making the day focus authoritative", () => {
    const contract = buildWeeklyLessonDayContract({
      weekNumber: 1,
      topic: "Preparing a Quarterly Budget Review",
      description: "Review quarterly budget figures with a manager.",
      objectives: "Explain variances and answer follow-up questions.",
      keyVocabHint: "budget, variance, forecast",
      cefr: "B1",
      dayNumber: 3,
      lessonFocus: "Explain one budget variance and its cause.",
      allLessonFocuses: ["one", "two", "Explain one budget variance and its cause.", "four", "five"]
    });

    expect(contract.weekContext).toEqual({
      topic: "Preparing a Quarterly Budget Review",
      description: "Review quarterly budget figures with a manager.",
      objectives: "Explain variances and answer follow-up questions.",
      keyVocabHint: "budget, variance, forecast"
    });
    expect(contract.day.lessonFocus).toBe("Explain one budget variance and its cause.");
    expect(contract.scopeRule).toContain("only required teaching scope");
    expect(contract.learnerLanguage).toBe("English except Vietnamese vocabulary meanings");
  });

  it("resets only exhausted reviewer budgets when an explicit retry resumes a failed day", () => {
    const state = prepareWeeklyLessonRetryState({
      reviewer: {
        status: "needs_revision",
        findings: [
          { exerciseCode: "reading", reasonCode: "multiple_valid_answers", message: "Ambiguous answer." },
          { exerciseCode: "speaking", reasonCode: "feedback_mismatch", message: "Incomplete model answer." }
        ],
        solvedAnswers: {}
      },
      reviewerRepairAttemptsByExercise: { reading: 3, speaking: 3, wordUse: 1 },
      attemptsByExercise: { reading: { attempts: 2, semanticAttempts: 2 } },
      lesson: { dayNumber: 5, title: "stale", parts: [] }
    } as never);

    expect(state.reviewerRepairAttemptsByExercise).toEqual({ wordUse: 1 });
    expect(state.attemptsByExercise).toEqual({ reading: { attempts: 2, semanticAttempts: 2 } });
    expect(state.lesson).toBeUndefined();
    expect(state.reviewer).toMatchObject({ status: "needs_revision" });
  });

  it("restores exhausted reviewer budgets from the latest component checkpoint when the failed review was not checkpointed", () => {
    const state = prepareWeeklyLessonRetryState({
      reviewerRepairAttemptsByExercise: { reading: 3, speaking: 3, wordUse: 1 },
      attemptsByExercise: { reading: { attempts: 4, semanticAttempts: 3 } }
    } as never);

    expect(state.reviewerRepairAttemptsByExercise).toEqual({ wordUse: 1 });
    expect(state.attemptsByExercise).toEqual({ reading: { attempts: 4, semanticAttempts: 3 } });
  });

  it("does not treat hidden unavailable grammar sections as duplicate frames", () => {
    const result = validateWeeklyLessonCrossLevelSet({
      A1: [lesson(4, { status: "unavailable", hidden: true, reason: "No explicit grammar target." })],
      B1: [lesson(0, { status: "unavailable", hidden: true, reason: "Vocabulary-led lesson." })]
    } as never);

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("allows a shared visible grammar frame when the level-specific lesson content differs", () => {
    const result = validateWeeklyLessonCrossLevelSet({
      A1: [lesson(0, { formula: "Could you + verb?", targetName: "Could you + verb?" })],
      A2: [lesson(1, { formula: "Could you + verb?", targetName: "Could you + verb?" })]
    } as never);

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("allocates a distinct difficulty lane to every requested CEFR level", () => {
    const allocation = buildWeeklyLessonLevelAllocation(["A1", "A2", "B1", "B2", "C1"]);

    expect(Object.keys(allocation)).toEqual(["A1", "A2", "B1", "B2", "C1"]);
    expect(new Set(Object.values(allocation).map((item) => item.difficultyLane)).size).toBe(5);
    expect(allocation.A1?.learnerLanguage).toBe("Vietnamese-supported English");
    expect(allocation.B1?.learnerLanguage).toBe("English except Vietnamese vocabulary meanings");
  });

  it("starts every unique level before the first level settles", async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();

    const pending = runWeeklyLessonLevelBatch(["A1", "A2", "B1", "A1"], async (level) => {
      started.push(level);
      await new Promise<void>((resolve) => releases.set(level, resolve));
      return `${level}-done`;
    });
    await Promise.resolve();

    expect(started).toEqual(["A1", "A2", "B1"]);
    for (const release of releases.values()) release();
    await expect(pending).resolves.toEqual({ A1: "A1-done", A2: "A2-done", B1: "B1-done" });
  });

  it("keeps single-level generation independent when only one level is selected", async () => {
    const started: string[] = [];

    const result = await runWeeklyLessonLevelBatch(["B2"], async (level) => {
      started.push(level);
      return `${level}-done`;
    });

    expect(started).toEqual(["B2"]);
    expect(result).toEqual({ B2: "B2-done" });
  });

  it("reports the failed level without discarding successful sibling results", async () => {
    await expect(runWeeklyLessonLevelBatch(["A1", "A2"], async (level) => {
      if (level === "A2") throw Object.assign(new Error("provider failed"), {
        code: "AI_OUTPUT_INVALID",
        issues: [{ path: ["objective"], message: "Objective is not measurable." }],
        details: { component: "objectives", attempt: 2 }
      });
      return `${level}-done`;
    })).rejects.toMatchObject({
      code: "AI_LEVEL_BATCH_FAILED",
      failures: [{
        level: "A2",
        code: "AI_OUTPUT_INVALID",
        message: "provider failed",
        issues: [{ path: ["objective"], message: "Objective is not measurable." }],
        details: { component: "objectives", attempt: 2 }
      }],
      partialResults: { A1: "A1-done" }
    });
  });

  it("continues later days and retains earlier day results when one day fails", async () => {
    const started: number[] = [];

    const result = await runWeeklyLessonDaySequence([1, 2, 3], async (dayNumber) => {
      started.push(dayNumber);
      if (dayNumber === 2) throw Object.assign(new Error("day component failed"), {
        code: "AI_OUTPUT_INVALID",
        issues: [{ path: ["listening", "body"], message: "Body is too short." }],
        details: { component: "skills.comprehension" }
      });
      return `day-${dayNumber}`;
    });

    expect(started).toEqual([1, 2, 3]);
    expect(result.completed).toEqual([
      { dayNumber: 1, value: "day-1" },
      { dayNumber: 3, value: "day-3" }
    ]);
    expect(result.failures).toEqual([{
      dayNumber: 2,
      component: "skills.comprehension",
      code: "AI_OUTPUT_INVALID",
      message: "day component failed",
      issues: [{ path: ["listening", "body"], message: "Body is too short." }],
      details: { component: "skills.comprehension" }
    }]);
  });
});

describe("language-aware prompt entity extraction", () => {
  it("does not treat Vietnamese sentence-initial capitalization as a name", () => {
    for (const prompt of [
      "Việc gì cần làm trước thứ Sáu?",
      "Trong cuộc họp, nhóm quyết định gì?",
      "Khi nào báo cáo được gửi?",
      "Mục đích của email là gì?",
      "Báo cáo được gửi cho ai? Điều gì xảy ra sau đó?"
    ]) {
      expect(promptEntities(prompt), prompt).toEqual([]);
    }
  });

  it("detects Vietnamese names from honorifics, mid-sentence capitals and later words of a sentence-initial run", () => {
    expect(promptEntities("Chị Mai gửi gì cho anh Nam?")).toEqual(["mai", "nam"]);
    expect(promptEntities("Ai nhận báo cáo của Lan?")).toEqual(["lan"]);
    expect(promptEntities("Theo Mai, nhóm nên giảm khoản nào?")).toEqual(["mai"]);
    expect(promptEntities("Cuộc họp vào thứ Hai hay thứ Ba? Email viết bằng tiếng Anh?")).toEqual([]);
  });

  it("keeps English name checks, including a sentence-initial name", () => {
    expect(promptEntities("Who sends the report?")).toEqual([]);
    expect(promptEntities("What did Mina send?")).toEqual(["mina"]);
    expect(promptEntities("Mina needs what before Friday?")).toEqual(["mina", "friday"]);
    expect(promptEntities("According to Mr. Tan, when is the deadline?")).toEqual(["tan"]);
    expect(extractPromptEntities("When does the Finance Team meet?")).toEqual([
      { text: "Finance Team", tokens: ["finance", "team"], evidence: "multi_word" }
    ]);
    expect(promptEntities("What does the HR team need?")).toEqual([]);
  });

  it("reports only entities that are absent from the source passage", () => {
    expect(ungroundedPromptEntities("Việc gì cần làm?", "Please finish the report today.")).toEqual([]);
    expect(ungroundedPromptEntities("What did Mina send?", "Lan sent the file.").map((entity) => entity.text)).toEqual(["Mina"]);
    expect(ungroundedPromptEntities("What did Mina's team send?", "Mina's team sent the file.")).toEqual([]);
  });
});
