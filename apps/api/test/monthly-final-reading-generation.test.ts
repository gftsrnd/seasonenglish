import {expect,it} from "vitest";
import {AI_TASKS,type AiTaskRunner} from "@e4s/ai";
import {buildMonthlyFinalGenerationInput} from "../src/modules/assessment/monthly-final-builder.js";
import {generateMonthlyFinalReading,monthlyFinalReadingSystemPrompt} from "../src/modules/assessment/monthly-final-reading-generation.js";
import {monthlyFinalReadingItemProblems} from "../src/modules/assessment/monthly-final-checks.js";
import {fakeMonthlyFinalAiOutput,frameworkRef,monthlyFinalContract} from "./support/monthly-final-fixture.js";

it("states the per-item template: target word in the context sentence and a question or blank", () => {
  const input = buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"), frameworkRef);
  const prompt = monthlyFinalReadingSystemPrompt("Exam prompt", input.targets.reading);
  expect(prompt).toContain("the context sentence before the question must contain TARGET itself");
  expect(prompt).toContain("Every prompt without a blank ends with exactly one short question ending in '?'");
  expect(prompt).toContain("does the prompt end with '?' or contain ____?");
});

it("rejects the real GEN07 failures inside the Reading validate/repair loop and repairs them before assembly", async () => {
  const input = buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"), frameworkRef);
  const fixture = fakeMonthlyFinalAiOutput(input).receptive.reading;
  const task = AI_TASKS.get("monthly_final_reading_generation")!;
  const term = input.targets.reading[0]!;
  // B1-2 R03 / B2-1 R02 shapes: a statement without a question; the target word only in the question.
  const noQuestion = structuredClone(fixture);
  noQuestion.questions[0]!.prompt = `Our team must check the ${term.word} today to ask for the correct files.`;
  const wordInQuestionOnly = structuredClone(fixture);
  wordInQuestionOnly.questions[0]!.prompt = `Our server response time can vary a little. What is the ${term.word} here?`;
  expect(task.validateOutput?.({reading: fixture}, input)).toEqual([]);
  expect(task.validateOutput?.({reading: noQuestion}, input)).toEqual([expect.objectContaining({path: "reading.questions.0.prompt", message: expect.stringContaining("has no question")})]);
  expect(task.validateOutput?.({reading: wordInQuestionOnly}, input)).toEqual([expect.objectContaining({path: "reading.questions.0.termId", message: expect.stringContaining("must appear verbatim in the context sentence")})]);
  expect(monthlyFinalReadingItemProblems(noQuestion.questions[0]!.prompt, "", term.word)).toEqual(["chưa có câu hỏi hoặc chỗ trống"]);

  const calls: any[] = [];
  const runner = {runTask: async (taskId: string, raw: any, options: any) => {
    expect(taskId).toBe("monthly_final_reading_generation");
    calls.push(options);
    if (!options.messages) {
      const issues = task.validateOutput!({reading: wordInQuestionOnly}, raw);
      throw Object.assign(new Error("invalid"), {code: "AI_OUTPUT_INVALID", details: {invalidOutput: JSON.stringify({questions: wordInQuestionOnly.questions}), issues}});
    }
    return {output: {reading: fixture}, metadata: {}};
  }} as unknown as AiTaskRunner;
  const result = await generateMonthlyFinalReading(runner, input, "Exam prompt");
  expect(result).toEqual(fixture);
  // One generation call and one targeted repair of that draft; no split into halves.
  expect(calls).toHaveLength(2);
  expect(calls[1].messages[2].content).toContain(`reading.questions.0.termId: "${term.word}" must appear verbatim in the context sentence`);
  expect(calls[1].systemPrompt).toContain("Target word only in the question or options");
});

it("still splits the slice when the repair cannot satisfy the rule", async () => {
  const input = buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"), frameworkRef);
  const fixture = fakeMonthlyFinalAiOutput(input).receptive.reading;
  const sizes: number[] = [];
  const runner = {runTask: async (_taskId: string, raw: any, options: any) => {
    sizes.push(raw.targets.reading.length);
    if (raw.targets.reading.length === input.targets.reading.length) {
      throw Object.assign(new Error("invalid"), {code: "AI_OUTPUT_INVALID", details: {invalidOutput: "{}", issues: [{path: "reading.questions.0.prompt", message: "has no question"}]}});
    }
    const ids = new Set(raw.targets.reading.map((term: any) => term.id));
    return {output: {reading: {questions: fixture.questions.filter(question => ids.has(question.termId))}}, metadata: {}};
  }} as unknown as AiTaskRunner;
  const result = await generateMonthlyFinalReading(runner, input, "Exam prompt");
  expect(result.questions.map(question => question.termId)).toEqual(fixture.questions.map(question => question.termId));
  const n = input.targets.reading.length;
  expect(sizes).toEqual([n, n, Math.ceil(n / 2), n - Math.ceil(n / 2)]);
});
