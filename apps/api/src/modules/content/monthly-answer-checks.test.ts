import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract, MonthlyDaySpec } from "@e4s/domain";
import { collectMonthlyVerifiableItems, monthlyAnswerKeyFindings, monthlyAnswerKeyIssues, monthlyAnswerVerificationFindings, monthlyRecallItemIssue, monthlyWrongVoiceIssue } from "./monthly-answer-checks.js";

type Item = { id: string; prompt: string; options: string[]; answer: string; milestoneId?: string };
const december = JSON.parse(readFileSync(new URL("../../../test/fixtures/december-2026-lessons.json", import.meta.url), "utf8")) as {
  grammar: Record<string, { items: Item[]; recallMilestoneIds?: string[] }>;
};
const item = (lesson: string, id: string) => {
  const found = december.grammar[lesson]!.items.find((entry) => entry.id === id);
  if (!found) throw new Error(`${lesson} ${id} missing`);
  return { label: `${lesson} ${id}`, ...found };
};

/** Topic A step-1 formulas of the December 2026 plans (res-*.txt). */
const STEP_ONE: Record<string, { id: string; focus: string; formula: string }> = {
  A1: { id: "a1-grammar-1-step-1", focus: "Nhận biết am/is/are", formula: "I am / He is / She is / It is / We are / You are / They are + danh từ, tính từ hoặc cụm giới thiệu" },
  A2: { id: "a2-grammar-1-step-1", focus: "Nhận biết was/were + V-ing", formula: "Subject + was/were + V-ing" },
  B1: { id: "b1-grammar-1-step-1", focus: "Present simple for facts", formula: "Subject + base verb (I/you/we/they) or base verb + -s/-es (he/she/it) for facts and routines" },
  B2: { id: "b2-grammar-1-step-1", focus: "must have / can't have", formula: "subject + must have + past participle (V3) / subject + can't have + V3" },
  C1: { id: "c1-grammar-1-step-1", focus: "Stative verbs in continuous form", formula: "Subject + am/is/are + stative verb (love, hate, want, need) + object  |  Subject + present simple verb + ... (summary)" }
};

describe("December 2026 wrong answer keys (deterministic)", () => {
  it("flags A1 L3 g1: plural subject keyed with isn't", () => {
    const issues = monthlyAnswerKeyIssues(item("A1-L3", "a3-item-1"));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"the slides" (plural)');
    expect(issues[0]).toContain('"aren\'t" is the correct option');
  });
  it("flags A1 L8 g3: possessive determiner before a preposition", () => {
    const issues = monthlyAnswerKeyIssues(item("A1-L8", "g3"));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"mine" is the correct option');
  });

  it("NP-001 accepts her as the recipient after the preposition to", () => {
    expect(monthlyAnswerKeyIssues({
      label: "grammar item 1 variant 1",
      prompt: "Chọn từ đúng để hoàn thành câu: Please give the file to ____ after the meeting.",
      options: ["she", "her", "hers", "herself"],
      answer: "her"
    })).toEqual([]);
  });
  it("flags B1 L16 g3: used to + verb next to its simple past", () => {
    const issues = monthlyAnswerKeyIssues(item("B1-L16", "k1-3"));
    expect(issues.join(" ")).toContain('both "used to assess" and "assessed" are correct');
  });
  it("flags the C1 review 'The reports have been reading' as the wrong voice", () => {
    const issues = monthlyAnswerKeyIssues({ label: "C1-L4 grammar 2", ...december.grammar["C1-L4"]!.items[1]! });
    expect(issues.join(" ")).toContain("wrong voice");
    expect(monthlyWrongVoiceIssue("The reports were being read all afternoon.")).toBeUndefined();
    expect(monthlyWrongVoiceIssue("I have been reading the reports all afternoon.")).toBeUndefined();
  });
  it("accepts the correct December items", () => {
    for (const [lesson, id] of [["A1-L3", "a3-item-2"], ["A1-L3", "a3-item-3"], ["A1-L3", "a3-item-4"], ["A1-L8", "g1"], ["A1-L8", "g2"], ["A1-L8", "g4"], ["B1-L16", "k1-1"], ["B1-L16", "k1-2"], ["B1-L16", "k1-4"], ["B2-L8", "g2"], ["C1-L8", "g1"]] as const) {
      expect(monthlyAnswerKeyIssues(item(lesson, id)), `${lesson} ${id}`).toEqual([]);
    }
    expect(monthlyAnswerKeyIssues({ label: "x", prompt: "Choose: Our team ____ ready.", options: ["is", "are", "am", "be"], answer: "are" })).toEqual([]);
    expect(monthlyAnswerKeyIssues({ label: "x", prompt: "Choose: This desk is ____.", options: ["my", "mine", "me", "I"], answer: "mine" })).toEqual([]);
  });
});

describe("December 2026 N7 recall items labelled topic A", () => {
  const recall = (lesson: string) => december.grammar[lesson]!.items.find((entry) => entry.milestoneId === december.grammar[lesson]!.recallMilestoneIds?.[0])!;
  it("flags A1, A2 and B2 recall items that test something else", () => {
    expect(monthlyRecallItemIssue(STEP_ONE.A1!, recall("A1-L8"), "A1 L8 recall")).toContain('answer "me" does not use');
    expect(monthlyRecallItemIssue(STEP_ONE.A2!, recall("A2-L8"), "A2 L8 recall")).toContain('answer "and" does not use');
    expect(monthlyRecallItemIssue(STEP_ONE.B2!, recall("B2-L8"), "B2 L8 recall")).toContain("must have");
  });
  it("leaves formulas without grammar markers (B1, C1) to the independent check", () => {
    expect(monthlyRecallItemIssue(STEP_ONE.B1!, recall("B1-L8"), "B1")).toBeUndefined();
    expect(monthlyRecallItemIssue(STEP_ONE.C1!, recall("C1-L8"), "C1")).toBeUndefined();
  });
  it("accepts recall items that use the topic A structure", () => {
    expect(monthlyRecallItemIssue(STEP_ONE.A1!, { prompt: "Chọn từ đúng: Our developers ____ ready.", answer: "are" }, "x")).toBeUndefined();
    expect(monthlyRecallItemIssue(STEP_ONE.A1!, { prompt: "Chọn câu đúng", answer: "I'm the new team leader." }, "x")).toBeUndefined();
    expect(monthlyRecallItemIssue(STEP_ONE.A2!, { prompt: "Chọn", answer: "was checking" }, "x")).toBeUndefined();
    expect(monthlyRecallItemIssue(STEP_ONE.B2!, { prompt: "Choose", answer: "She can't have seen the email." }, "x")).toBeUndefined();
  });
});

function contractFor(lesson: string, cefr: keyof typeof STEP_ONE): { contract: MonthlyCurriculumContract; day: MonthlyDaySpec } {
  const grammar = december.grammar[lesson]!;
  const step = STEP_ONE[cefr]!;
  const contract = {
    cefr, coreTerms: [], supportTerms: [], sounds: [], daySpecs: [],
    grammarTopics: [{ id: "topic-a", title: "A", steps: [{ ...step, usage: "", examples: [] }] }]
  } as unknown as MonthlyCurriculumContract;
  const day = { lessonNumber: 8, kind: "new", coreTermIds: [], grammarPlan: { code: "B1", objective: "", mode: "recognize", milestoneIds: [], recallMilestoneIds: grammar.recallMilestoneIds ?? [] } } as unknown as MonthlyDaySpec;
  return { contract, day };
}

describe("lesson-level findings", () => {
  it("turns the December A1 L8 grammar part into severe findings for the grammar component", () => {
    const { contract, day } = contractFor("A1-L8", "A1");
    const findings = monthlyAnswerKeyFindings(contract, day, 8, [{ code: "grammar", content: december.grammar["A1-L8"]! as unknown as Record<string, unknown> }]);
    expect(findings.map((finding) => [finding.code, finding.component])).toEqual([["MONTHLY_ANSWER_KEY_WRONG", "grammar"], ["MONTHLY_DAILY_GRAMMAR_RECALL_OFF_TOPIC", "grammar"]]);
    expect(findings.every((finding) => finding.severity === "severe")).toBe(true);
  });
  it("maps independent verdicts to disputed keys, second correct options and off-label recall items", () => {
    const { contract, day } = contractFor("B1-L8", "B1");
    const parts = [{ code: "grammar", content: december.grammar["B1-L8"]! as unknown as Record<string, unknown> }];
    const items = collectMonthlyVerifiableItems(contract, day, parts);
    expect(items).toHaveLength(4);
    const recallItem = items.find((entry) => entry.mustTest)!;
    expect(recallItem.mustTest).toContain("Present simple for facts");
    const interrupt = items.find((entry) => entry.answer.startsWith("While we were discussing"))!;
    const findings = monthlyAnswerVerificationFindings(items, [
      { ref: interrupt.ref, correctOptions: ["While we were discussing the plan, the partner called.", "When we were discussing the plan, the partner called."], note: "when also works" },
      { ref: recallItem.ref, correctOptions: [recallItem.answer], testsLabelledPoint: false, note: "tests the past simple" },
      { ref: items[2]!.ref, correctOptions: [items[2]!.options.find((option) => option !== items[2]!.answer)!] }
    ], 8);
    expect(findings.map((finding) => finding.code).sort()).toEqual(["MONTHLY_ANSWER_KEY_DISPUTED", "MONTHLY_ANSWER_NOT_UNIQUE", "MONTHLY_DAILY_GRAMMAR_RECALL_OFF_TOPIC"]);
    expect(findings.find((finding) => finding.code === "MONTHLY_ANSWER_NOT_UNIQUE")!.message).toContain("When we were discussing");
    expect(monthlyAnswerVerificationFindings(items, items.map((entry) => ({ ref: entry.ref, correctOptions: [entry.answer], testsLabelledPoint: true })), 8)).toEqual([]);
  });
});

describe("December 2026 A1 review minimal pairs", () => {
  it("rejects the drafted homophone pairs team / teem and weak / week", async () => {
    const { monthlyPronunciationContrastIssue, monthlyPronunciationContrastRule } = await import("@e4s/domain");
    const fixture = JSON.parse(readFileSync(new URL("../../../test/fixtures/december-2026-lessons.json", import.meta.url), "utf8")) as { speaking: Record<string, Array<{ options: string[]; answer: string }>> };
    const rule = monthlyPronunciationContrastRule("A1", { ipa: "/iː/" });
    for (const pair of fixture.speaking["A1-L4"]!) {
      const partner = pair.options.find((option) => option !== pair.answer)!;
      expect(monthlyPronunciationContrastIssue(rule, pair.answer, partner, { first: pair.answer === "team" ? "/tiːm/" : "/wiːk/" }), pair.options.join("/")).toContain("homophones");
    }
  });
});
