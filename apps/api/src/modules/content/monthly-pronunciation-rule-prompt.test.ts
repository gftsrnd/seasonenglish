import { describe, expect, it } from "vitest";
import { monthlyPronunciationCatalog } from "@e4s/domain";
import { buildMonthlyCatalogPronunciationPrompt } from "./monthly-resource-generation.js";
import { getMonthlyPronunciationCatalogExampleIssue } from "./monthly-resource-quality-gates.js";

const prompt = (cefr: "A1" | "B1" | "B2", id: string) => {
  const catalog = monthlyPronunciationCatalog(cefr);
  const item = catalog.find((entry) => entry.id === id)!;
  return buildMonthlyCatalogPronunciationPrompt({ cefr, slot: "P1", item, monthItems: [item], catalog, taughtIds: [], neededExamples: 9, usedWords: [], acceptedWords: [], coreWords: [], vocabulary: "" });
};

describe("pronunciation rule in the generation prompt", () => {
  it("sends the learner rule and the cautions for B1–C1 items only", () => {
    expect(prompt("B1", "b1-ed-t")).toContain("RULE SHOWN TO LEARNERS for this item");
    expect(prompt("B1", "b1-ed-t")).toContain("Never use a verb whose base ends in /t/ or /d/");
    expect(prompt("B2", "b2-link-vv")).toContain("do not insert /j/ or /w/ in every vowel + vowel link");
    expect(prompt("A1", "phoneme-m")).not.toContain("RULE SHOWN TO LEARNERS");
  });

  it("the shared example gate rejects wanted for the -ed /t/ item", () => {
    const edT = monthlyPronunciationCatalog("B1").find((entry) => entry.id === "b1-ed-t")!;
    expect(getMonthlyPronunciationCatalogExampleIssue(edT, { word: "wanted", ipa: "/ˈwɒntɪd/" })).toBeTruthy();
  });
});
