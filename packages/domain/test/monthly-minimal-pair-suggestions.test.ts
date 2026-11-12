import { describe, expect, it } from "vitest";
import { A1A2_MINIMAL_PAIR_SUGGESTIONS, monthlyMinimalPairRepairAdvice, monthlyPronunciationContrastIssue, monthlyPronunciationContrastRule } from "../src/monthly/pronunciation-contrast.js";

describe("A1–A2 minimal pair repair suggestions (December 2026 A1 L4)", () => {
  const rule = monthlyPronunciationContrastRule("A1", { ipa: "/iː/", catalogId: "phoneme-iː" });

  it("lists only pairs the minimal-pair gate itself accepts", () => {
    const rejected = Object.entries(A1A2_MINIMAL_PAIR_SUGGESTIONS).flatMap(([phoneme, pairs]) => pairs
      .filter(([first, second]) => monthlyPronunciationContrastIssue(rule, first, second) !== undefined)
      .map(([first, second]) => `/${phoneme}/ ${first} / ${second}`));
    expect(rejected).toEqual([]);
  });

  it("explains that team has no common partner and points to another taught /iː/ example with a real one", () => {
    const advice = monthlyMinimalPairRepairAdvice("A1", { ipa: "/iː/", catalogId: "phoneme-iː" }, "team", ["team", "meet", "week", "read"]);
    expect(advice).toContain("\"team\" has no common real word that differs only in /iː/");
    expect(advice).toContain("\"read / rid\"");
    expect(advice).toMatch(/seat \/ sit, feel \/ fill, leave \/ live/u);
  });

  it("gives the taught example's own partner when one exists", () => {
    expect(monthlyMinimalPairRepairAdvice("A1", { ipa: "/iː/", catalogId: "phoneme-iː" }, "feel", ["feel"])).toBe("Use \"feel / fill\".");
  });

  it("falls back to the taught examples when none has a listed partner", () => {
    expect(monthlyMinimalPairRepairAdvice("A1", { ipa: "/iː/" }, "team", ["team", "week"])).toContain("another of this week's taught examples (\"team\", \"week\")");
  });
});
