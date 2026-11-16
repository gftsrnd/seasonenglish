import { describe, expect, it } from "vitest";
import {
  checkMonthlyGrammarStep,
  MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH,
  monthlyGatedLightFindings,
  monthlyGrammarFormulaExampleIssues,
  monthlyGrammarFormulaExampleMessage,
  monthlyGrammarFormulaLines,
  monthlyGrammarFormulaRows
} from "../src/monthly/grammar-formula-examples.js";

/** Live lesson B1 24/12, Bài 15 (4300): the formulas are the "common errors" rules, the examples teach other structures. */
const LIVE_STEP_1 = {
  formula: "Error check: [subject] + [state verb] (NOT is knowing) / always + am/is/are + verb-ing (complaint about repeated habit)",
  examples: [
    "Our team discusses the sales forecast every Monday, but this week we are discussing a new solution for the client.",
    "Our manager discusses the budget with us each month, and we are preparing a new forecast right now."
  ]
};
const LIVE_STEP_2 = {
  formula: "Error check: [subject] + verb-ed/irregular (NOT did + verb-ed) / have/has + noun (I have two projects) vs have got (I have got a new laptop)",
  examples: [
    "While we were discussing the budget, the manager asked about next year's forecast.",
    "Last year our team used to wait two weeks for supplies, but now we order earlier."
  ]
};

describe("grammar formula rows", () => {
  it("splits rules at ' / ' between patterns, ';', ' vs ' and new lines, never inside a slot", () => {
    expect(monthlyGrammarFormulaRows(LIVE_STEP_1.formula)).toEqual(["[subject] + [state verb] (NOT is knowing)", "always + am/is/are + verb-ing (complaint about repeated habit)"]);
    expect(monthlyGrammarFormulaRows(LIVE_STEP_2.formula)).toHaveLength(3);
    expect(monthlyGrammarFormulaRows("will + base verb (commitment) / must + base verb (obligation) / be able to + base verb (capability)")).toHaveLength(3);
    expect(monthlyGrammarFormulaRows("Subject + must have / can't have / should have / shouldn't have + past participle")).toHaveLength(1);
    expect(monthlyGrammarFormulaRows("have/has + past participle + for (period) / since (starting point)")).toHaveLength(1);
    expect(monthlyGrammarFormulaRows("Subject + V (s/es) + ...; phủ định: Subject + do/does not + V")).toEqual(["Subject + V (s/es) + ...", "Subject + do/does not + V"]);
  });
});

describe("grammar formula vs examples (live B1 24/12 Bài 15)", () => {
  it("flags live step 1: no example uses the state-verb or always + continuous rule", () => {
    const check = checkMonthlyGrammarStep(LIVE_STEP_1.formula, LIVE_STEP_1.examples);
    expect(check.rowsWithoutExample).toEqual(["[subject] + [state verb] (NOT is knowing)", "always + am/is/are + verb-ing (complaint about repeated habit)"]);
    expect(check.examplesWithoutRow).toEqual(LIVE_STEP_1.examples);
  });

  it("flags live step 2: no have/has or have got example, and three rules for two examples", () => {
    const check = checkMonthlyGrammarStep(LIVE_STEP_2.formula, LIVE_STEP_2.examples);
    expect(check.rowsWithoutExample).toEqual(["have/has + noun (I have two projects)", "have got (I have got a new laptop)"]);
    expect(check.tooFewExamples).toBe(true);
  });

  it("passes a well-formed step whose every rule has its example", () => {
    const check = checkMonthlyGrammarStep("will + base verb (commitment) / must + base verb (obligation) / be able to + base verb (capability)", [
      "We will send the revised prototype by 15 November.",
      "The team must finish the testing before the handover.",
      "We are able to deliver the report on Friday."
    ]);
    expect(check).toMatchObject({ rowsWithoutExample: [], examplesWithoutRow: [], tooFewExamples: false });
    expect(check.rows.map((row) => row.exampleIndexes)).toEqual([[0], [1], [2]]);
  });

  it("passes a common-errors step whose examples illustrate its rules, a Wrong/Right pair counting for the rule it corrects", () => {
    const check = checkMonthlyGrammarStep(LIVE_STEP_1.formula, [
      "Wrong: I am knowing the client. Right: I know the client.",
      "Our manager is always changing the deadline."
    ]);
    expect(check).toMatchObject({ rowsWithoutExample: [], examplesWithoutRow: [], tooFewExamples: false });
  });

  it("stays quiet when a rule cannot be read (present simple, Vietnamese slot names)", () => {
    expect(checkMonthlyGrammarStep("I/We/They + động từ nguyên mẫu; He/She/It + động từ thêm -s", ["We check the file.", "She sends the report."])).toMatchObject({ rowsWithoutExample: [], examplesWithoutRow: [], tooFewExamples: false });
    expect(checkMonthlyGrammarStep("Present Simple cho lịch cố định / Present Continuous cho việc đang làm tạm thời", ["Our manager sends the report every Monday.", "The client is reviewing the feedback now."])).toMatchObject({ rowsWithoutExample: [], examplesWithoutRow: [] });
  });

  it("reads contractions, shared auxiliaries and be after a subject change", () => {
    expect(checkMonthlyGrammarStep("Subject + can / can't + verb", ["I can send the file.", "We can't change it."]).rowsWithoutExample).toEqual([]);
    expect(checkMonthlyGrammarStep("Subject + have/has been + V-ing", ["The team has been working all week.", "I'm meeting the supervisor."]).examplesWithoutRow).toEqual(["I'm meeting the supervisor."]);
    expect(checkMonthlyGrammarStep("Subject + am/is/are + V-ing (arranged or current action)", ["I am meeting the supervisor at 2 p.m.", "The partner is sending the report now."]).rowsWithoutExample).toEqual([]);
    expect(checkMonthlyGrammarStep("We are going to + V...", ["The client is going to read it.", "We're going to call them."]).rowsWithoutExample).toEqual([]);
  });

  it("checks grammar.steps when there are two or more, otherwise the top-level formula, and writes one repair message", () => {
    const grammar = { formula: "ignored · joined", examples: ["x"], steps: [LIVE_STEP_1, LIVE_STEP_2, { formula: "must + base verb (obligation)", examples: ["The team must finish the testing.", "We must send it today."] }] };
    const issues = monthlyGrammarFormulaExampleIssues(grammar);
    expect(issues.map((issue) => issue.step)).toEqual([1, 2]);
    const message = monthlyGrammarFormulaExampleMessage(issues);
    expect(message).toContain("grammar.steps[0]: formula row \"[subject] + [state verb] (NOT is knowing)\" has no example that uses it");
    expect(message).toContain("grammar.steps[1]");
    expect(monthlyGrammarFormulaExampleIssues({ formula: "must + base verb", examples: ["We must send it today.", "The team must check it."] })).toEqual([]);
  });
});

describe("advisory light findings", () => {
  it("are left out of the counted light findings", () => {
    const light = [{ code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING" }, { code: MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH }];
    expect(monthlyGatedLightFindings(light)).toEqual([{ code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING" }]);
  });
});

describe("formula lines: one rule per row (16/11, B1 December)", () => {
  const live = "Subject + (always) + am/is/are + verb-ing for complaints; Subject + present simple for facts and state verbs";
  it("splits top-level \";\" rules and line breaks, never inside parentheses", () => {
    expect(monthlyGrammarFormulaLines(live)).toEqual(["Subject + (always) + am/is/are + verb-ing for complaints", "Subject + present simple for facts and state verbs"]);
    expect(monthlyGrammarFormulaLines("Subject + V-ing\nSubject + V-ed")).toEqual(["Subject + V-ing", "Subject + V-ed"]);
    expect(monthlyGrammarFormulaLines("Subject + V (e.g. work; works)")).toEqual(["Subject + V (e.g. work; works)"]);
    expect(monthlyGrammarFormulaLines("")).toEqual([]);
  });
  it("keeps a formula's own example list on its line", () => {
    expect(monthlyGrammarFormulaLines("Subject + am/is/are + V-ing: I am working; she is calling")).toEqual(["Subject + am/is/are + V-ing: I am working; she is calling"]);
    expect(monthlyGrammarFormulaLines("Past simple: Subject + V-ed; Past continuous: Subject + was/were + V-ing")).toEqual(["Past simple: Subject + V-ed", "Past continuous: Subject + was/were + V-ing"]);
  });
  it("the gate's rows start from the same lines", () => {
    expect(monthlyGrammarFormulaRows(live)).toHaveLength(2);
    expect(monthlyGrammarFormulaRows(live.replace("; ", "\n"))).toEqual(monthlyGrammarFormulaRows(live));
    expect(monthlyGrammarFormulaRows("Subject + am/is/are + V-ing: I am working; she is calling")).toEqual(["Subject + am/is/are + V-ing"]);
  });
});
