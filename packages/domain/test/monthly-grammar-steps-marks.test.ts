import { describe, expect, it } from "vitest";
import { withMonthlyGrammarSteps } from "../src/monthly/index.js";

/** B1 2026-12 day 30/12 (lesson 22, "Mock Test"), grammar part as stored on 4300 (read via GET; items left out): no steps, 4-row formula, one mark per example. */
const day30 = () => ({
  code: "grammar",
  content: {
    text: "This mock test checks the present and past tenses you have studied this month.",
    formula: "Subject + (always) + am/is/are + verb-ing for complaints\nSubject + present simple for facts and state verbs\nSubject + past simple / past continuous + when/while + clause\nSubject + have/has (got) + noun for possession and obligation",
    examples: [
      "Our team investigates every measurable result before the year-end review.",
      "The manager is always changing the deadline, and it makes planning difficult.",
      "When the project started, we had a small budget and a short timeline.",
      "While the team was discussing the suggestion, the server went down.",
      "We have got a measurable goal for next year, and our team has a bigger budget."
    ],
    exampleMarks: [{ row: 2, marks: ["investigates", "every"] }, { row: 1, marks: ["is", "always", "changing"] }, { row: 4, marks: ["had"] }, { row: 3, marks: ["While", "was", "discussing"] }, { row: 4, marks: ["have", "got"] }]
  } as Record<string, unknown>
});
/** The day plan's two steps, in plan order (b1-grammar-1-step-3, b1-grammar-2-step-3). */
const steps = [
  { formula: "Subject + (always) + am/is/are + verb-ing for complaints; Subject + present simple for facts and state verbs" },
  { formula: "Subject + past simple / past continuous + when/while + clause; Subject + have/has (got) + noun for possession and obligation" }
];
const stepsOf = (part: { content: Record<string, unknown> }) => part.content.steps as Array<{ formula: string; examples: string[]; exampleMarks?: Array<{ row: number; marks: string[] }> }>;

describe("withMonthlyGrammarSteps: top-level examples go to the step their generated mark names", () => {
  it("day 30/12: every example under its own point, points in plan order, original order within a point", () => {
    const [step1, step2] = stepsOf(withMonthlyGrammarSteps([day30()], steps)[0]!);
    expect(step1!.examples).toEqual(["Our team investigates every measurable result before the year-end review.", "The manager is always changing the deadline, and it makes planning difficult."]);
    expect(step2!.examples).toEqual(["When the project started, we had a small budget and a short timeline.", "While the team was discussing the suggestion, the server went down.", "We have got a measurable goal for next year, and our team has a bigger budget."]);
    // Marks travel with their example, renumbered to the step formula's rows.
    expect(step1!.exampleMarks).toEqual([{ row: 2, marks: ["investigates", "every"] }, { row: 1, marks: ["is", "always", "changing"] }]);
    expect(step2!.exampleMarks).toEqual([{ row: 2, marks: ["had"] }, { row: 1, marks: ["While", "was", "discussing"] }, { row: 2, marks: ["have", "got"] }]);
  });

  it("without complete marks the formula matcher still decides (lessons before 13/11)", () => {
    const part = day30();
    part.content.exampleMarks = [{ row: 2, marks: ["investigates"] }, null, { row: 4, marks: ["had"] }, { row: 3, marks: ["was"] }, { row: 4, marks: ["have"] }];
    const [step1, step2] = stepsOf(withMonthlyGrammarSteps([part], steps)[0]!);
    expect(step1!.examples).toEqual(["The manager is always changing the deadline, and it makes planning difficult."]);
    expect(step2!.examples).toEqual(["When the project started, we had a small budget and a short timeline.", "While the team was discussing the suggestion, the server went down."]);
  });

  it("stored steps (one per plan step) are kept as they are", () => {
    const part = day30();
    part.content.steps = [{ text: "A", formula: "x", examples: ["One."] }, { text: "B", formula: "y", examples: ["Two."] }];
    expect(stepsOf(withMonthlyGrammarSteps([part], steps)[0]!).map((step) => step.examples)).toEqual([["One."], ["Two."]]);
  });
});
