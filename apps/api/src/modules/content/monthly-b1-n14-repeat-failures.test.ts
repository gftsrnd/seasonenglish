import { describe, expect, it } from "vitest";
import { monthlyGrammarFormulaExampleIssues, type MonthlyDaySpec } from "@e4s/domain";
import { hasExactTargetOccurrences, targetOccurrenceCounts } from "./monthly-quality.js";
import { MONTHLY_WRITING_FILL_RULE, monthlyDailyTeachingContract, monthlyGrammarFormulaRowsContract, monthlyReadAloudPositionsContract, monthlyRepairFindingText } from "./monthly-day-generation.js";

/**
 * B1 2026-12 (framework 900fd0fb), lesson 17 = N14 on 23/12, K2 mixed practice:
 * three regenerations failed on the same two severe findings plus one advisory.
 * Fixtures are copied from the 4300 month_lessons.generation_error candidate (13/11 13:25)
 * and the framework's curriculum_contract.
 */
const TARGET_WORDS = ["asked", "checked", "called", "planned", "started", "needed", "checked it", "called us"];
const REQUIRED_POSITIONS = [1, 2, 3, 4].flatMap((sound) => [1, 2].map((word) => ({ soundId: `b1-sound-${sound}`, exampleId: `b1-sound-${sound}-word-${word}` })));
const REAL_PASSAGE = "Last week, our team asked the client for feedback and checked the test results. While I was writing the summary, Minh called us about the schedule. We started the review early and planned the next steps together. The manager needed a clear update, so I checked it again and finished the report on time. Minh called us twice, and the team needed more time to finish.";
const REAL_WRITING = { type: "fill", answer: "checked / was asking / noticed / has moved", prompt: "Complete the message with the correct verb forms. Use only one blank for each answer: Yesterday, our team ____ the testing results while the client ____ about the schedule. We also noticed a shortage of staff, so the next review ____ to next week." };
const STEP_A3 = { focus: "Common errors with present tenses and the habit of always + continuous for complaints", formula: "Error check: [subject] + [state verb] (NOT is knowing) / always + am/is/are + verb-ing (complaint about repeated habit)" };
const STEP_B3 = { focus: "Common errors with past tenses; have vs have got for possession and obligation", formula: "Error check: [subject] + verb-ed/irregular (NOT did + verb-ed) / have/has + noun (I have two projects) vs have got (I have got a new laptop)" };
const REAL_GRAMMAR = {
  formula: "Present simple / present continuous\nPast simple / past continuous",
  steps: [
    { text: "Use the present simple for routines and facts, and the present continuous for things happening now.", formula: STEP_A3.formula, examples: ["The testing team reviews every release before launch.", "We are checking the testing results right now."] },
    { text: "Use the past simple for finished actions, and the past continuous for an action in progress when another event happened.", formula: STEP_B3.formula, examples: ["The attendee list was updated while the manager was speaking.", "There was a shortage of staff, so the meeting started late."] }
  ]
};

describe("B1 N14 read-aloud positions", () => {
  it("the real passage fails on exactly called ×0, called us ×2 and needed ×2", () => {
    expect(hasExactTargetOccurrences(REAL_PASSAGE, TARGET_WORDS)).toBe(false);
    const found = Object.fromEntries(targetOccurrenceCounts(REAL_PASSAGE, TARGET_WORDS));
    expect(found).toEqual({ asked: 1, checked: 1, called: 0, planned: 1, started: 1, needed: 2, "checked it": 1, "called us": 2 });
  });

  it("a passage with one standalone checked/called plus one checked it/called us passes", () => {
    const fixed = REAL_PASSAGE
      .replace("Minh called us twice, and the team needed more time to finish.", "Later, Lan called the vendor to confirm the date.");
    expect(Object.fromEntries(targetOccurrenceCounts(fixed, TARGET_WORDS))).toEqual({ asked: 1, checked: 1, called: 1, planned: 1, started: 1, needed: 1, "checked it": 1, "called us": 1 });
    expect(hasExactTargetOccurrences(fixed, TARGET_WORDS)).toBe(true);
  });

  it("the first prompt states every count, the overlapping pairs and the exact targetPositions", () => {
    const text = monthlyReadAloudPositionsContract(TARGET_WORDS, REQUIRED_POSITIONS);
    expect(text).toContain("\"asked\" ×1, \"checked\" ×1, \"called\" ×1, \"planned\" ×1, \"started\" ×1, \"needed\" ×1, \"checked it\" ×1, \"called us\" ×1");
    expect(text).toContain("\"checked\" is written once on its own (in another clause, not as part of \"checked it\") AND \"checked it\" once");
    expect(text).toContain("\"called\" is written once on its own (in another clause, not as part of \"called us\") AND \"called us\" once");
    expect(text).toContain("{\"soundId\":\"b1-sound-4\",\"exampleId\":\"b1-sound-4-word-2\"}");
    expect(text).not.toContain("\"asked\" is written once on its own");
    const day = { lessonNumber: 17, newLessonNumber: 14, kind: "new", grammarPlan: { code: "K2", mode: "apply", stage: "mixed_practice", objective: "K2 Mixed practice", milestoneIds: [], recallMilestoneIds: [] }, pronunciationPlan: { slot: "K2", stage: "read_aloud", objective: "Read a short passage with exactly eight target positions, two per target", targetIds: ["b1-sound-1", "b1-sound-2", "b1-sound-3", "b1-sound-4"], exampleIds: REQUIRED_POSITIONS.map((position) => position.exampleId), requiredPositions: REQUIRED_POSITIONS } } as unknown as MonthlyDaySpec;
    const contract = monthlyDailyTeachingContract(day, "B1", ["testing", "attendee", "shortage"], TARGET_WORDS, [STEP_A3, STEP_B3]);
    expect(contract).toContain("READ-ALOUD COUNT");
    expect(contract).toContain("EXAMPLES FOLLOW THE FORMULA ROWS");
    expect(contract).toContain(MONTHLY_WRITING_FILL_RULE);
  });
});

describe("B1 N14 writing fill", () => {
  it("the repair text tells the model the real prompt has 3 blanks and needs one", () => {
    const text = monthlyRepairFindingText({ code: "MONTHLY_CONTENT_INVALID", component: "writing", message: "Bài điền cần có đúng một chỗ trống ___." }, [{ code: "writing", content: REAL_WRITING }]);
    expect(text).toContain("writing.prompt has 3 blanks; it needs exactly one blank ____");
    expect(text).toContain("no slashes or list of answers");
    expect(monthlyRepairFindingText({ code: "MONTHLY_SOUND_SCOPE_MISMATCH", component: "pronunciation", message: "x" })).toBe("x");
  });
});

describe("B1 N14 grammar rows", () => {
  it("the real steps follow the objective, not the formula rows (advisory finding reproduced)", () => {
    const issues = monthlyGrammarFormulaExampleIssues(REAL_GRAMMAR);
    expect(issues.map((issue) => issue.step)).toEqual([1, 2]);
    expect(issues[0]!.rowsWithoutExample).toEqual(["[subject] + [state verb] (NOT is knowing)", "always + am/is/are + verb-ing (complaint about repeated habit)"]);
    expect(issues[1]!.rowsWithoutExample).toEqual(expect.arrayContaining(["have/has + noun (I have two projects)", "have got (I have got a new laptop)"]));
  });

  it("the prompt lists every row of every step and says examples follow the rows, not the objective", () => {
    const text = monthlyGrammarFormulaRowsContract([STEP_A3, STEP_B3]);
    expect(text).toContain("grammar.steps[0] (focus: Common errors with present tenses");
    expect(text).toContain("row 1 \"[subject] + [state verb] (NOT is knowing)\", row 2 \"always + am/is/are + verb-ing (complaint about repeated habit)\"");
    expect(text).toContain("grammar.steps[1]");
    expect(text).toContain("\"have got (I have got a new laptop)\"");
    expect(text).toContain("at least 3 examples");
    expect(text).toContain("Return grammar.steps with one entry per locked step");
    expect(monthlyGrammarFormulaRowsContract([])).toBe("");
  });
});
