import { describe, expect, it } from "vitest";
import { monthlyGrammarCatalog } from "@e4s/domain";
import { monthlyResourceApprovalIssues } from "../src/monthly-resource-approval-checks.js";

const pair = monthlyGrammarCatalog("A2")[1]!;

function topics() {
  return [pair.topicA, pair.topicB].map((side, topicIndex) => ({
    id: `a2-grammar-${topicIndex + 1}`,
    title: side.titleVi,
    catalogId: side.id,
    steps: [0, 1, 2].map((stepIndex) => ({
      id: `a2-grammar-${topicIndex + 1}-step-${stepIndex + 1}`,
      focus: `Focus ${stepIndex}`, formula: "S + have/has + V3", usage: "Dùng để cập nhật công việc.",
      examples: side.contents.filter((_item, index) => index % 3 === stepIndex),
      dailyObjectives: [`Bước ${stepIndex * 2 + 1}`, `Bước ${stepIndex * 2 + 2}`]
    }))
  }));
}

describe("roadmap grammar approval re-check", () => {
  it("reports a roadmap topic that lost a roadmap item and ignores legacy topics", () => {
    const grammarTopics = topics();
    const contract = { cefr: "A2" as const, coreTerms: [], sounds: [], grammarTopics };
    expect(monthlyResourceApprovalIssues(contract)).toEqual([]);
    for (const step of grammarTopics[0]!.steps) step.examples = step.examples.filter((example) => example !== "ever/never" && example !== "Have you ever…?");
    expect(monthlyResourceApprovalIssues(contract).join(" ")).toMatch(/Grammar topic a2-grammar-1 .*"ever\/never"/u);
    expect(monthlyResourceApprovalIssues({ ...contract, grammarTopics: grammarTopics.map(({ catalogId: _drop, ...topic }) => topic) })).toEqual([]);
  });
});
