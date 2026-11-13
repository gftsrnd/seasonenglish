import { describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { aiSlices, neutralQuestions, type FixtureChoice } from "./support/level-form-fixture.js";
import { assembleLevelFormFromAi, autoFixAssembledLevelForm } from "../src/modules/assessment/routes.js";
import { levelFormRepairRequests, mergeLevelFormRepairs } from "../src/modules/assessment/level-form-auto-fix.js";
import { evaluateLevelFormQuality, levelFormQualityInputFromOutput } from "../src/modules/assessment/level-form-quality.js";
import { monthlyFinalPositionFixNote } from "../src/modules/assessment/monthly-final-builder.js";

const NOW = new Date("2026-11-12T00:00:00Z");
const counts = (questions: Array<{ correctIndex: number }>) => [0, 1, 2, 3].map((slot) => questions.filter((question) => question.correctIndex === slot).length);
const longestRun = (questions: Array<{ correctIndex: number }>) => questions.reduce((state, question, index) => {
  const run = index && question.correctIndex === questions[index - 1]!.correctIndex ? state.run + 1 : 1;
  return { run, max: Math.max(state.max, run) };
}, { run: 0, max: 0 }).max;
const keyText = (question: FixtureChoice) => question.options[question.correctIndex]!;

/** Reading where the key of `longIds` is the unique longest option, plus a near-duplicate pair 10/37. */
function biasedReading(longIds: number[]): FixtureChoice[] {
  const reading = neutralQuestions("reading", 40, () => 1);
  for (const id of longIds) {
    const question = reading[id]!;
    question.options = question.options.map((option, index) => index === question.correctIndex ? `${option}zzzz` : option);
  }
  reading[10] = { prompt: "When must the handover be completed?", options: ["15 minutes before the end of the shift", "At the start of the next shift", "During the Thursday training", "After the team leader signs"], correctIndex: 0 };
  reading[37] = { prompt: "By what time should staff finish the handover?", options: ["At least 15 minutes before the shift ends", "Before Friday 21 March", "Only when an order is delayed", "Within two hours of arrival"], correctIndex: 0 };
  return reading;
}

type RepairItem = { id: number; kind: string; prompt: string; options: string[]; correctIndex: number };
function repairRunner(behaviour: (item: RepairItem) => RepairItem | null = defaultRepair) {
  const runTask = vi.fn(async (taskId: string, input: unknown) => {
    if (taskId !== "level_form_item_repair") throw new Error(`unexpected ${taskId}`);
    const items = (input as { items: RepairItem[] }).items;
    return { output: { items: items.map(behaviour).filter(Boolean) }, metadata: {} };
  });
  return { runner: { runTask } as unknown as AiTaskRunner, runTask };
}
function defaultRepair(item: RepairItem): RepairItem {
  if (item.kind === "replace") return {
    id: item.id, kind: item.kind, prompt: "What will Priya Desai do during the first two weeks?",
    options: ["Answer questions on the shop floor", "Repair the old tablets on Monday", "Run the Thursday training in Room B", "Collect the paper notes every day"], correctIndex: 0
  };
  const key = item.options[item.correctIndex]!;
  return { ...item, options: item.options.map((option, index) => index === item.correctIndex ? option : `${option.split(" ")[0]} ${key.split(" ").slice(1).join(" ")}`) };
}

describe("level-up auto-fix: deterministic answer reshuffle (no AI call)", () => {
  it("balances A/B/C/D, keeps every key and is deterministic for the same seed", async () => {
    const assembled = assembleLevelFormFromAi("A2", aiSlices(), { now: NOW });
    const first = await autoFixAssembledLevelForm(undefined, assembled);
    const again = await autoFixAssembledLevelForm(undefined, assembleLevelFormFromAi("A2", aiSlices(), { now: NOW }));
    expect(again).toEqual(first);
    expect(counts(first.shuffled.listening.questions)).toEqual([5, 5, 5, 5]);
    expect(counts(first.shuffled.reading.questions)).toEqual([10, 10, 10, 10]);
    expect(longestRun(first.shuffled.reading.questions)).toBeLessThanOrEqual(2);
    for (const section of ["listening", "reading"] as const) first.shuffled[section].questions.forEach((question, index) => {
      const original = first.output[section].questions[index]!;
      expect(question.prompt).toBe(original.prompt);
      expect(keyText(question)).toBe(keyText(original));
    });
    // Option order only: the listening script (and so the audio) is unchanged.
    expect(first.shuffled.listening.script).toBe(first.output.listening.script);
    expect(first.quality.severe.map((issue) => issue.code)).not.toContain("LEVEL_FORM_ANSWER_POSITION_BIAS");
    expect(first.autoFixed).toEqual([
      expect.stringMatching(/^Phần Nghe: đổi thứ tự lựa chọn .*B 20\/20/u),
      expect.stringMatching(/^Phần Đọc: đổi thứ tự lựa chọn .*B 40\/40/u)
    ]);
    expect(first.blueprint.levelFormQuality.autoFixed).toEqual(first.autoFixed);
  });

  it("adds no note when the AI order was already balanced", async () => {
    const slices = aiSlices(neutralQuestions("reading", 40));
    slices.listening.questions = neutralQuestions("listening", 21);
    const fixed = await autoFixAssembledLevelForm(undefined, assembleLevelFormFromAi("A2", slices, { now: NOW }));
    expect(fixed.autoFixed).toEqual([]);
    expect(fixed.blueprint.levelFormQuality.autoFixed).toBeUndefined();
  });
});

describe("level-up auto-fix: targeted AI repair", () => {
  const LONG = Array.from({ length: 20 }, (_, index) => index * 2).filter((id) => id !== 10);

  it("sends only the offending reading questions in one call, shrinks the checklist and lists the fix", async () => {
    const assembled = assembleLevelFormFromAi("A2", aiSlices(biasedReading(LONG)), { now: NOW });
    expect(assembled.quality.light.map((issue) => issue.code)).toContain("LEVEL_FORM_NEAR_DUPLICATE_QUESTIONS");
    const { runner, runTask } = repairRunner();
    const fixed = await autoFixAssembledLevelForm(runner, assembled);

    expect(runTask).toHaveBeenCalledTimes(1);
    const input = runTask.mock.calls[0]![1] as { section: string; items: RepairItem[]; sources: Array<{ sourceId: string }> };
    expect(input.section).toBe("reading");
    expect(input.sources.map((source) => source.sourceId)).toEqual(["passage"]);
    // A key that is the longest option is not a defect (rule removed 13/11): only the near-duplicate is sent.
    expect(input.items.map((item) => item.id)).toEqual([37]);

    const codes = [...fixed.quality.severe, ...fixed.quality.light].map((issue) => issue.code);
    expect(codes).not.toContain("LEVEL_FORM_LONGEST_ANSWER_BIAS");
    expect(codes).not.toContain("LEVEL_FORM_NEAR_DUPLICATE_QUESTIONS");
    expect(fixed.blueprint.levelFormQuality.warnings).toEqual(fixed.quality.light);
    expect(fixed.autoFixed).toContain("Phần Đọc: thay câu 38 (trùng ý với câu 11) bằng câu hỏi mới về chi tiết khác của bài.");
    expect(fixed.autoFixed.some((note) => note.includes("lựa chọn nhiễu") || note.includes("dài nhất"))).toBe(false);
    // The long keys are left exactly as generated.
    for (const id of LONG) expect(fixed.shuffled.reading.questions[id]!.options).toEqual(assembled.shuffled.reading.questions[id]!.options);
    expect(fixed.shuffled.reading.questions[37]!.prompt).toBe("What will Priya Desai do during the first two weeks?");
    expect(counts(fixed.shuffled.reading.questions)).toEqual([10, 10, 10, 10]);
  });

  it("rejects a rewrite that changes the key and keeps the issue for the Operator", () => {
    const questions = neutralQuestions("reading", 40);
    questions[3] = { ...questions[3]!, options: ["same", "same", "other one", "fourth"], correctIndex: 2 };
    const output = { listening: { script: "", questions: [] }, reading: { passage: "", questions } };
    const requests = levelFormRepairRequests(questions, evaluateLevelFormQuality(levelFormQualityInputFromOutput(output)), "reading");
    expect(requests).toEqual([{ id: 3, kind: "distinct_options", reason: expect.any(String) }]);
    const merged = mergeLevelFormRepairs(questions, requests, [{ id: 3, prompt: "ignored", options: ["one", "two", "three", "four"], correctIndex: 2 }]);
    expect(merged.accepted).toEqual([]);
    expect(merged.questions[3]).toEqual(questions[3]);
  });

  it("keeps the generated form when the repair call fails", async () => {
    const assembled = assembleLevelFormFromAi("A2", aiSlices(biasedReading(LONG)), { now: NOW });
    const runTask = vi.fn(async () => { throw new Error("AI_UNAVAILABLE"); });
    const log = vi.fn();
    const fixed = await autoFixAssembledLevelForm({ runTask } as unknown as AiTaskRunner, assembled, log);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Level form item repair failed", expect.objectContaining({ section: "reading" }));
    expect(fixed.shuffled.reading.questions).toEqual(assembled.shuffled.reading.questions);
  });

  it("runs at most two rounds, each with only what still fails", async () => {
    const reading = neutralQuestions("reading", 40, () => 1);
    for (const id of [3, 5]) reading[id] = { ...reading[id]!, options: ["same", "same", "other one", "fourth"], correctIndex: 2 };
    const assembled = assembleLevelFormFromAi("A2", aiSlices(reading), { now: NOW });
    let accepted = 0;
    const distinctRepair = (item: RepairItem): RepairItem => ({ ...item, options: item.options.map((option, index) => index === item.correctIndex ? option : `wrong ${item.id} ${index}`) });
    const { runner, runTask } = repairRunner((item) => item.kind === "distinct_options" && accepted++ < 1 ? distinctRepair(item) : null);
    await autoFixAssembledLevelForm(runner, assembled);
    expect(runTask).toHaveBeenCalledTimes(2);
    const firstIds = (runTask.mock.calls[0]![1] as { items: RepairItem[] }).items.map((item) => item.id);
    const secondIds = (runTask.mock.calls[1]![1] as { items: RepairItem[] }).items.map((item) => item.id);
    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(1);
    expect(firstIds).toContain(secondIds[0]);
  });

  it("repairs duplicate options and duplicate prompts (otherwise severe) in the same call", () => {
    const questions = neutralQuestions("reading", 40);
    questions[3] = { ...questions[3]!, options: ["same", "same", "other one", "fourth"] };
    questions[9] = { ...questions[9]!, prompt: questions[2]!.prompt };
    const output = { listening: { script: "", questions: [] }, reading: { passage: "", questions } };
    const report = evaluateLevelFormQuality(levelFormQualityInputFromOutput(output));
    const requests = levelFormRepairRequests(questions, report, "reading");
    expect(requests).toEqual([
      { id: 3, kind: "distinct_options", reason: expect.any(String) },
      { id: 9, kind: "replace", reason: "same prompt as another question" }
    ]);
    const merged = mergeLevelFormRepairs(questions, requests, [
      { id: 3, prompt: "ignored", options: ["same", "new two", "other one", "fourth"], correctIndex: questions[3]!.correctIndex === 1 ? 0 : questions[3]!.correctIndex },
      { id: 9, prompt: questions[2]!.prompt, options: ["a1", "b2", "c3", "d4"], correctIndex: 0 }
    ]);
    // Same prompt as question 3 again: the replacement is refused.
    expect(merged.accepted).toEqual([3]);
    expect(merged.questions[3]!.prompt).toBe(questions[3]!.prompt);
  });
});

describe("monthly final: deterministic answer-order note", () => {
  const item = (correctIndex: number) => ({ termId: "t", prompt: "p", options: ["a", "b", "c"], correctIndex, explanation: "e" });
  it("names the AI's skewed order that the seeded shuffle fixed", () => {
    expect(monthlyFinalPositionFixNote("Đọc", [1, 1, 1, 1, 0, 2, 1, 1].map(item))).toMatch(/^Phần Đọc: đổi thứ tự lựa chọn để đáp án chia đều A\/B\/C \(bản AI: A 1 · B 6 · C 1, 4 câu liền cùng đáp án\)/u);
    expect(monthlyFinalPositionFixNote("Nghe", [0, 1, 2, 2, 1, 0, 1, 2, 0].map(item))).toBeNull();
    expect(monthlyFinalPositionFixNote("Nghe", [0, 0, 0].map(item))).toBeNull();
  });
});

describe("monthly final listening: no option-length repair (rule removed 13/11)", () => {
  it("accepts messages whose correct options are all the longest, with no extra AI call", async () => {
    const { buildMonthlyFinalGenerationInput } = await import("../src/modules/assessment/monthly-final-builder.js");
    const { generateMonthlyFinalListening } = await import("../src/modules/assessment/monthly-final-listening-generation.js");
    const { fakeMonthlyFinalAiOutput, frameworkRef, monthlyFinalContract } = await import("./support/monthly-final-fixture.js");
    const input = buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"), frameworkRef);
    const fixture = fakeMonthlyFinalAiOutput(input);
    const lengthen = (message: (typeof fixture.receptive.listening.messages)[number]) => ({ ...message, questions: message.questions.map((question) => ({ ...question, options: question.options.map((option, index) => index === question.correctIndex ? `${option} for the whole team today` : option) })) });
    const runTask = vi.fn(async (_taskId: string, raw: { messageLabel: string }) => ({ output: lengthen(fixture.receptive.listening.messages.find((item) => item.label === raw.messageLabel)!), metadata: {} }));
    const result = await generateMonthlyFinalListening({ runTask } as unknown as AiTaskRunner, input, "prompt");
    expect(runTask).toHaveBeenCalledTimes(2);
    for (const message of result.output.listening.messages) {
      const original = lengthen(fixture.receptive.listening.messages.find((item) => item.label === message.label)!);
      expect(message.script).toBe(original.script);
      expect(message.questions.map((question) => question.options)).toEqual(original.questions.map((question) => question.options));
    }
  });
});
