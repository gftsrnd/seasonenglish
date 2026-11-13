import { describe, expect, it } from "vitest";
import { monthlyGrammarDayTopicName, withMonthlyGrammarTopicName } from "../src/monthly/grammar-day-topic.js";

const topics = [
  { id: "g1", title: "Động từ to be", catalogId: "a1-p1-a", steps: [{ id: "g1-s1" }, { id: "g1-s2" }, { id: "g1-s3" }] },
  { id: "g2", title: "Đại từ & sở hữu", catalogId: "a1-p1-b", steps: [{ id: "g2-s1" }, { id: "g2-s2" }, { id: "g2-s3" }] }
];

describe("monthly grammar day topic name (served from the day plan)", () => {
  it("names the catalog topic of the day's grammar steps: A1–A2 with Vietnamese, B1+ English only", () => {
    expect(monthlyGrammarDayTopicName("A1", { kind: "new", grammarPlan: { milestoneIds: ["g1-s1"] }, grammarStepIds: ["g1-s1"], grammarStepId: "g1-s1" }, topics))
      .toEqual({ topicTitle: "The verb to be", topicTitleVi: "Động từ to be" });
    const b1 = [{ title: "Present simple vs present continuous", catalogId: "b1-p1-a", steps: [{ id: "x" }] }];
    expect(monthlyGrammarDayTopicName("B1", { kind: "new", grammarStepId: "x" }, b1)).toEqual({ topicTitle: "Present simple vs present continuous" });
  });

  it("falls back through grammarStepIds / grammarStepId, uses the stored title without a catalog match, and joins combined days", () => {
    const own = [{ title: "Động từ to be (am / is / are)", steps: [{ id: "s1" }] }];
    expect(monthlyGrammarDayTopicName("A1", { kind: "new", grammarStepId: "s1" }, own)).toEqual({ topicTitle: "Động từ to be (am / is / are)" });
    expect(monthlyGrammarDayTopicName("A1", { kind: "new", grammarStepIds: ["g1-s3", "g2-s3"], grammarStepId: "g1-s3" }, topics))
      .toEqual({ topicTitle: "The verb to be · Pronouns and possessives", topicTitleVi: "Động từ to be · Đại từ & sở hữu" });
    expect(monthlyGrammarDayTopicName("A1", { kind: "review", reviewGrammarStepIds: ["g2-s1"] }, topics)?.topicTitle).toBe("Pronouns and possessives");
    expect(monthlyGrammarDayTopicName("A1", { kind: "new", grammarStepId: "missing" }, topics)).toBeUndefined();
    expect(monthlyGrammarDayTopicName("A1", undefined, topics)).toBeUndefined();
  });

  it("attaches the name to the grammar part only", () => {
    const parts = [{ code: "grammar", content: { formula: "I am" } }, { code: "vocabulary", content: { items: [] } }];
    const named = withMonthlyGrammarTopicName(parts, { topicTitle: "The verb to be", topicTitleVi: "Động từ to be" });
    expect(named[0]!.content).toEqual({ formula: "I am", topicTitle: "The verb to be", topicTitleVi: "Động từ to be" });
    expect(named[1]).toBe(parts[1]);
    expect(withMonthlyGrammarTopicName(parts, undefined)).toEqual(parts);
  });
});
