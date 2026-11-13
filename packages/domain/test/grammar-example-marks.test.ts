import { describe, expect, it } from "vitest";
import {
  checkMonthlyGrammarMarkedStep,
  monthlyGrammarFormulaExampleIssueCount,
  monthlyGrammarFormulaExampleIssues,
  monthlyGrammarFormulaExampleMessage,
  monthlyGrammarFormulaRows,
  monthlyGrammarMarkSpans
} from "../src/monthly/grammar-formula-examples.js";
import { withMonthlyGrammarSteps } from "../src/monthly/lesson-vocabulary.js";

/** Live B1 2026-12, lesson 17 on 4300 (framework 900fd0fb-397c-4b62-8c4a-2ce655a27369): the two error-check steps and their examples. */
const STEP_1 = {
  formula: "Error check: [subject] + [state verb] (NOT is knowing) / always + am/is/are + verb-ing (complaint about repeated habit)",
  examples: [
    "Our team knows the testing schedule for the new release.",
    "I agree with the shortage plan, but we need more time.",
    "Our manager is always asking for changes at the last minute."
  ]
};
const STEP_2 = {
  formula: "Error check: [subject] + verb-ed/irregular (NOT did + verb-ed) / have/has + noun (I have two projects) vs have got (I have got a new laptop)",
  examples: [
    "Last week the attendee registered for the workshop online.",
    "Yesterday the team wrote the testing report before lunch.",
    "We have got a new meeting room, and we had only one last year."
  ]
};
/** What the lesson model now returns next to those examples. */
const MARKS_1 = [{ row: 1, marks: ["knows"] }, { row: 1, marks: ["agree", "need"] }, { row: 2, marks: ["is", "always", "asking"] }];
const MARKS_2 = [{ row: 1, marks: ["registered"] }, { row: 1, marks: ["wrote"] }, { row: 3, marks: ["have got", "had"] }];

const grammar = (marks1: unknown, marks2: unknown, examples2 = STEP_2.examples) => ({
  formula: `${STEP_1.formula}\n${STEP_2.formula}`,
  steps: [{ ...STEP_1, text: "x", ...(marks1 ? { exampleMarks: marks1 } : {}) }, { formula: STEP_2.formula, text: "y", examples: examples2, ...(marks2 ? { exampleMarks: marks2 } : {}) }]
});

describe("generated example marks: exact row coverage (live B1 2026-12 lesson 17)", () => {
  it("rows are numbered as the prompt lists them", () => {
    expect(monthlyGrammarFormulaRows(STEP_2.formula)).toEqual(["[subject] + verb-ed/irregular (NOT did + verb-ed)", "have/has + noun (I have two projects)", "have got (I have got a new laptop)"]);
  });

  it("finds every mark verbatim as whole words: knows, agree, need, registered, wrote, have got, had", () => {
    const text = (example: string, marks: string[]) => monthlyGrammarMarkSpans(example, marks).spans.map((span) => example.slice(span.start, span.end));
    expect(text(STEP_1.examples[0]!, ["knows"])).toEqual(["knows"]);
    expect(text(STEP_1.examples[1]!, ["agree", "need"])).toEqual(["agree", "need"]);
    expect(text(STEP_2.examples[1]!, ["wrote"])).toEqual(["wrote"]);
    expect(text(STEP_2.examples[2]!, ["have got", "had"])).toEqual(["have got", "had"]);
    // Whole words only: "know" is not inside "knows"; "is" is not inside "this".
    expect(monthlyGrammarMarkSpans(STEP_1.examples[0]!, ["know"]).missing).toEqual(["know"]);
    expect(monthlyGrammarMarkSpans("This is it.", ["is"]).spans).toEqual([{ start: 5, end: 7 }]);
  });

  it("a Wrong/Right example is marked in its Right sentence only", () => {
    const example = "Wrong: I am knowing the answer. Right: I know the answer.";
    expect(monthlyGrammarMarkSpans(example, ["know"]).spans.map((span) => example.slice(span.start, span.end))).toEqual(["know"]);
    expect(monthlyGrammarMarkSpans(example, ["knowing"]).missing).toEqual(["knowing"]);
  });

  it("the exact check names what the live lesson still misses: step 2 has no have/has + noun example", () => {
    const check = checkMonthlyGrammarMarkedStep(STEP_2.formula, STEP_2.examples, MARKS_2);
    expect(check.rows.map((row) => row.exampleIndexes)).toEqual([[0, 1], [], [2]]);
    expect(check.rowsWithoutExample).toEqual(["have/has + noun (I have two projects)"]);
    expect(monthlyGrammarFormulaExampleIssues(grammar(MARKS_1, MARKS_2)).map((issue) => [issue.step, issue.rowsWithoutExample])).toEqual([[2, ["have/has + noun (I have two projects)"]]]);
    // With one example per row, every row is covered and nothing is reported.
    const covered = [...STEP_2.examples, "Our team has two new projects this month."];
    expect(monthlyGrammarFormulaExampleIssues(grammar(MARKS_1, [...MARKS_2, { row: 2, marks: ["has"] }], covered))).toEqual([]);
  });

  it("reports a row without example, a wrong row number, a missing entry and a mark that is not in the text", () => {
    const issues = monthlyGrammarFormulaExampleIssues(grammar(MARKS_1, [{ row: 4, marks: ["registered"] }, { row: 1, marks: ["writes"] }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.step).toBe(2);
    expect(issues[0]!.rowsWithoutExample).toHaveLength(3);
    expect(issues[0]!.exampleMarkIssues).toEqual([
      'example 1 "Last week the attendee registered for the workshop online." names row 4, but the formula has 3 rows',
      'example 2 "Yesterday the team wrote the testing report before lunch." marks "writes", which is not in its text as whole words',
      'example 3 "We have got a new meeting room, and we had only one last year." has no exampleMarks entry { row, marks }'
    ]);
    expect(monthlyGrammarFormulaExampleMessage(issues)).toContain("EXAMPLE MARKS");
    expect(monthlyGrammarFormulaExampleIssueCount(issues)).toBe(6);
  });

  it("backward compatible: a stored lesson without marks keeps the heuristic check; a new generation must mark", () => {
    const stored = monthlyGrammarFormulaExampleIssues(grammar(undefined, undefined));
    expect(stored.every((issue) => issue.exampleMarkIssues === undefined)).toBe(true);
    const required = monthlyGrammarFormulaExampleIssues(grammar(undefined, undefined), { requireMarks: true });
    expect(required.map((issue) => issue.exampleMarkIssues)).toEqual([["the examples have no exampleMarks: give one { row, marks } entry per example"], ["the examples have no exampleMarks: give one { row, marks } entry per example"]]);
  });

  it("a single-formula part is checked the same way (no steps)", () => {
    const formula = "will + base verb (commitment) / must + base verb (obligation)";
    expect(monthlyGrammarFormulaExampleIssues({ formula, examples: ["We will send it.", "We must check it."], exampleMarks: [{ row: 1, marks: ["will send"] }, { row: 2, marks: ["must check"] }] })).toEqual([]);
    const partial = monthlyGrammarFormulaExampleIssues({ formula, examples: ["We will send it.", "We will check it."], exampleMarks: [{ row: 1, marks: ["will send"] }, { row: 1, marks: ["will check"] }] });
    expect(partial[0]!.rowsWithoutExample).toEqual(["must + base verb (obligation)"]);
  });

  it("review steps keep the model's marks with its examples; plan reference examples carry none", () => {
    const parts = [{ code: "grammar", content: grammar(MARKS_1, undefined, []) }];
    const [part] = withMonthlyGrammarSteps(parts, [{ formula: STEP_1.formula, examples: ["ref"] }, { formula: STEP_2.formula, examples: ["Wrong: Yesterday I go. Right: Yesterday I went."] }]);
    const steps = part!.content!.steps as Array<Record<string, unknown>>;
    expect(steps[0]!.exampleMarks).toEqual(MARKS_1);
    expect(steps[1]!.examples).toEqual(["Wrong: Yesterday I go. Right: Yesterday I went."]);
    expect(steps[1]).not.toHaveProperty("exampleMarks");
  });
});
