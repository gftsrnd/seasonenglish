import { describe, expect, it } from "vitest";
import { monthlyFinalProductiveOutputSchema, monthlyFinalReceptiveOutputSchema, validateMonthlyFinalProductiveOutput } from "@e4s/ai";
import type { StoredAssessmentDefinition } from "@e4s/database";
import { assembleMonthlyFinalFromAi, buildMonthlyFinalGenerationInput, monthlyFinalLockedGrammarSteps, withEvaluation } from "../src/modules/assessment/monthly-final-builder.js";
import { applyMonthlyFinalUpdate, type MonthlyFinalUpdateBody } from "../src/modules/assessment/monthly-final-routes.js";
import { fakeMonthlyFinalAiOutput, frameworkRef, monthlyFinalContract } from "./support/monthly-final-fixture.js";

/** The fixture contract as a grammar roadmap month (topics carry roadmap catalog IDs). */
function roadmapContract() {
  const contract = monthlyFinalContract("B1");
  return { ...contract, grammarTopics: contract.grammarTopics.map((topic, index) => ({ ...topic, catalogId: index === 0 ? "b1-p4-a" : "b1-p4-b" })) };
}

function build(contract: ReturnType<typeof monthlyFinalContract>, pick?: { main: number; secondary: number }) {
  const input = buildMonthlyFinalGenerationInput(contract, frameworkRef);
  const ai = fakeMonthlyFinalAiOutput(input);
  const productive = monthlyFinalProductiveOutputSchema.parse(ai.productive);
  if (pick) productive.grammarComponents = productive.grammarComponents.map((component, index) => ({ ...component, mainStepId: contract.grammarTopics[index]!.steps[pick.main]!.id, secondaryStepId: contract.grammarTopics[index]!.steps[pick.secondary]!.id }));
  const blueprint = assembleMonthlyFinalFromAi(contract, frameworkRef, monthlyFinalReceptiveOutputSchema.parse(ai.receptive), productive, new Date("2026-11-20T03:00:00Z"));
  return { input, productive, blueprint };
}

const gen01 = (blueprint: StoredAssessmentDefinition) => blueprint.monthlyExam!.checks.find((item) => item.code === "GEN01")!;
const body = (blueprint: StoredAssessmentDefinition, review: MonthlyFinalUpdateBody["review"]): MonthlyFinalUpdateBody => ({ title: blueprint.title, sections: structuredClone(blueprint.sections) as unknown as MonthlyFinalUpdateBody["sections"], review });

describe("monthly final grammar evidence on roadmap months", () => {
  it("locks main = step 1 and secondary = step 2 in the generation input, only for roadmap months", () => {
    expect(monthlyFinalLockedGrammarSteps(roadmapContract())).toEqual([{ mainStepId: "ga-1", secondaryStepId: "ga-2" }, { mainStepId: "gb-1", secondaryStepId: "gb-2" }]);
    expect(build(roadmapContract()).input.grammar.map((topic) => [topic.lockedMainStepId, topic.lockedSecondaryStepId])).toEqual([["ga-1", "ga-2"], ["gb-1", "gb-2"]]);
    expect(monthlyFinalLockedGrammarSteps(monthlyFinalContract("B1"))).toBeUndefined();
    expect(build(monthlyFinalContract("B1")).input.grammar.every((topic) => !("lockedMainStepId" in topic))).toBe(true);
  });

  it("asks the AI to repair a component that is not the locked step", () => {
    const { input, productive } = build(roadmapContract());
    expect(validateMonthlyFinalProductiveOutput(productive, input).filter((issue) => issue.path.startsWith("grammarComponents"))).toEqual([]);
    const wrong = { ...productive, grammarComponents: productive.grammarComponents.map((component) => component.code === "GA" ? { ...component, mainStepId: "ga-3", secondaryStepId: "ga-1" } : component) };
    const paths = validateMonthlyFinalProductiveOutput(wrong, input).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(["grammarComponents.GA.mainStepId", "grammarComponents.GA.secondaryStepId"]));
  });

  it("assembles the locked steps even if the AI picked others, and GEN01 passes", () => {
    const { blueprint } = build(roadmapContract(), { main: 2, secondary: 0 });
    expect(blueprint.monthlyExam!.grammar.map((target) => [target.main.stepId, target.secondary.stepId, target.roadmapLocked])).toEqual([["ga-1", "ga-2", true], ["gb-1", "gb-2", true]]);
    expect(blueprint.monthlyExam!.grammar[0]!.main.acceptedPatterns).toEqual(["Could you (please) + V?"]);
    expect(gen01(withEvaluation(blueprint, roadmapContract())).status).toBe("pass");
    // Older months keep the AI's free choice among taught steps.
    expect(build(monthlyFinalContract("B1"), { main: 2, secondary: 0 }).blueprint.monthlyExam!.grammar[0]).toMatchObject({ main: { stepId: "ga-3" }, secondary: { stepId: "ga-1" } });
  });

  it("GEN01 fails a roadmap exam whose main/secondary drifted from steps 1/2", () => {
    const contract = roadmapContract();
    const drifted = structuredClone(build(contract).blueprint);
    drifted.monthlyExam!.grammar[1]!.main.stepId = "gb-3";
    const check = gen01(withEvaluation(drifted, contract));
    expect(check.status).toBe("fail");
    expect(JSON.stringify(check)).toContain("GB chính phải là bước 1");
  });

  it("rejects operator edits that move a locked component and keeps label/pattern edits", () => {
    const contract = roadmapContract();
    const { blueprint } = build(contract);
    expect(() => applyMonthlyFinalUpdate(blueprint, body(blueprint, { grammar: [{ code: "GA", mainStepId: "ga-3", secondaryStepId: "ga-2" }] }), "op", new Date())).toThrow("MONTHLY_FINAL_GRAMMAR_COMPONENT_LOCKED");
    const edited = applyMonthlyFinalUpdate(blueprint, body(blueprint, { grammar: [{ code: "GA", mainStepId: "ga-1", secondaryStepId: "ga-2", mainPatterns: ["Could you + V?"] }] }), "op", new Date());
    expect(edited.monthlyExam!.grammar[0]).toMatchObject({ main: { stepId: "ga-1", acceptedPatterns: ["Could you + V?"] }, secondary: { stepId: "ga-2" }, roadmapLocked: true });
    expect(gen01(withEvaluation(edited, contract)).status).toBe("pass");
  });
});
