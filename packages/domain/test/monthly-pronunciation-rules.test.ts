import { describe, expect, it } from "vitest";
import { findMonthlyPronunciationCatalogItem, monthlyPronunciationCatalog, monthlyPronunciationPhenomenonExampleIssue } from "../src/monthly/pronunciation-catalog.js";
import { MONTHLY_PRONUNCIATION_RULES, monthlyPronunciationLessonRule, monthlyPronunciationRuleCopy } from "../src/monthly/pronunciation-rules.js";

const item = (cefr: "B1" | "B2" | "C1", id: string) => findMonthlyPronunciationCatalogItem(cefr, { ipa: "", catalogId: id })!;

describe("B1–C1 pronunciation rules", () => {
  it("covers every B1–C1 catalog item and nothing else, in both languages", () => {
    const ids = (["B1", "B2", "C1"] as const).flatMap((cefr) => monthlyPronunciationCatalog(cefr).map((entry) => entry.id));
    expect(Object.keys(MONTHLY_PRONUNCIATION_RULES).sort()).toEqual([...ids].sort());
    for (const rule of Object.values(MONTHLY_PRONUNCIATION_RULES)) {
      for (const text of [rule.ruleVi, rule.ruleEn, rule.rememberVi, rule.rememberEn, rule.mistakeVi, rule.mistakeEn]) expect(text.trim().length).toBeGreaterThan(10);
      expect(`${rule.ruleEn} ${rule.ruleVi}`).not.toMatch(/\b(?:month|tháng)\s*\d/iu);
    }
  });

  it("resolves the rule of a published lesson from its focus notation, and none for A1–A2", () => {
    const rule = monthlyPronunciationLessonRule("B1", { focus: "/-ed=t/" });
    expect(rule).toBe(MONTHLY_PRONUNCIATION_RULES["b1-ed-t"]);
    expect(monthlyPronunciationRuleCopy(rule!, "en")).toMatchObject({ rememberLabel: "How to remember", mistakeLabel: "Common mistake" });
    expect(monthlyPronunciationRuleCopy(rule!, "vi")).toMatchObject({ rememberLabel: "Cách nhớ", mistakeLabel: "Lỗi hay gặp" });
    expect(monthlyPronunciationLessonRule("C1", { focus: "x", catalogId: "c1-emphasis-aux" })).toBe(MONTHLY_PRONUNCIATION_RULES["c1-emphasis-aux"]);
    expect(monthlyPronunciationLessonRule("A1", { focus: "/iː/" })).toBeUndefined();
    expect(monthlyPronunciationLessonRule("A2", { focus: "/ɪ/–/iː/" })).toBeUndefined();
  });

  it("gates -ed and -s/-es examples by the rule", () => {
    const edT = item("B1", "b1-ed-t");
    expect(monthlyPronunciationPhenomenonExampleIssue(edT, { word: "helped", ipa: "/helpt/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(edT, { word: "wanted", ipa: "/ˈwɒntɪd/" })).toBeDefined();
    // Even with a wrong transcription, t/d before -ed can never teach /t/.
    expect(monthlyPronunciationPhenomenonExampleIssue(edT, { word: "wanted", ipa: "/wɒntst/" })).toMatch(/ɪd/u);
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-ed-d"), { word: "needed", ipa: "/niːdd/" })).toMatch(/ɪd/u);
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-ed-id"), { word: "started", ipa: "/ˈstɑːtɪd/" })).toBeUndefined();
    const iz = item("B1", "b1-s-iz");
    expect(monthlyPronunciationPhenomenonExampleIssue(iz, { word: "offices", ipa: "/ˈɒfɪsɪz/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(iz, { word: "works", ipa: "/ˈwɜːkɪz/" })).toMatch(/hissing/u);
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-s-z"), { word: "changes", ipa: "/tʃeɪndʒz/" })).toMatch(/ɪz/u);
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-s-s"), { word: "tasks", ipa: "/tɑːsks/" })).toBeUndefined();
  });
});
