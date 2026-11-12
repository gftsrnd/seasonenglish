import { describe, expect, it } from "vitest";
import { MONTHLY_REGISTER_LABELS, monthlyRegisterLexicalDetails, monthlyRegisterTermIssue, monthlyRegisterTermsApply, selectMonthlyRegisterTerms, validMonthlyRegisterTerms } from "../src/monthly/index.js";

describe("monthly register alternatives (L-042)", () => {
  it("apply to B1–C1 only", () => {
    expect(["A1", "A2", "B1", "B2", "C1"].map(monthlyRegisterTermsApply)).toEqual([false, false, true, true, true]);
    expect(selectMonthlyRegisterTerms({ word: "meet" }, [{ kind: "slang", word: "touch base", definition: "talk briefly to check on progress" }], { cefr: "A2" }).selected).toEqual([]);
  });

  it("keeps one genuine slang and one formal item per core with the fixed register label", () => {
    const { selected, rejected } = selectMonthlyRegisterTerms({ word: "start" }, [
      { kind: "poetic", word: "commence", definition: "begin, in formal writing" },
      { kind: "poetic", word: "initiate", definition: "begin something officially" },
      { kind: "slang", word: "kick off", definition: "begin an event or project" }
    ], { cefr: "B2" });
    expect(selected).toEqual([
      { kind: "poetic", word: "commence", definition: "begin, in formal writing", register: MONTHLY_REGISTER_LABELS.poetic },
      { kind: "slang", word: "kick off", definition: "begin an event or project", register: MONTHLY_REGISTER_LABELS.slang }
    ]);
    expect(rejected).toEqual(["a poetic alternative is already chosen for start"]);
  });

  it("drops vulgar or offensive slang with the sensitive-text filter", () => {
    expect(monthlyRegisterTermIssue({ word: "mistake" }, { kind: "slang", word: "fuck-up", definition: "a bad error at work" }, { cefr: "B2" })).toMatch(/not workplace-appropriate/u);
    expect(monthlyRegisterTermIssue({ word: "mistake" }, { kind: "slang", word: "slip", definition: "a shitty little error" }, { cefr: "B2" })).toMatch(/not workplace-appropriate/u);
    expect(monthlyRegisterTermIssue({ word: "estimate" }, { kind: "slang", word: "ballpark", definition: "a rough guess of a number" }, { cefr: "B1" })).toBeUndefined();
  });

  it("rejects the core itself, words already on the card, bad shapes and bad definitions", () => {
    const options = { cefr: "C1", takenWords: ["begin"] };
    expect(monthlyRegisterTermIssue({ word: "start" }, { kind: "poetic", word: "Start", definition: "begin something new" }, options)).toMatch(/repeats the core/u);
    expect(monthlyRegisterTermIssue({ word: "start" }, { kind: "poetic", word: "begin", definition: "start something new" }, options)).toMatch(/already a core or support/u);
    expect(monthlyRegisterTermIssue({ word: "start" }, { kind: "slang", word: "get the ball rolling now", definition: "begin something" }, options)).toMatch(/2–4 word/u);
    expect(monthlyRegisterTermIssue({ word: "start" }, { kind: "poetic", word: "commence", definition: "bắt đầu" }, options)).toMatch(/no Vietnamese/u);
    expect(monthlyRegisterTermIssue({ word: "start" }, { kind: "poetic", word: "commence", definition: "commence a task" }, options)).toMatch(/must not use the word/u);
    expect(monthlyRegisterTermIssue({ word: "start" }, { kind: "poetic", word: "commence", definition: "" }, options)).toMatch(/needs a short/u);
  });

  it("re-validates stored alternatives and builds lexical details", () => {
    const core = { word: "meet", registerTerms: [
      { kind: "slang" as const, word: "touch base", definition: "talk briefly to check on progress", register: "x" },
      { kind: "slang" as const, word: "screw around", definition: "waste time doing silly things", register: "x" }
    ] };
    const valid = validMonthlyRegisterTerms(core, "B1");
    expect(valid.map((term) => term.word)).toEqual(["touch base"]);
    expect(validMonthlyRegisterTerms(core, "A1")).toEqual([]);
    expect(validMonthlyRegisterTerms({ word: "meet" }, "B1")).toEqual([]);
    expect(monthlyRegisterLexicalDetails(valid)).toEqual([{ kind: "slang", word: "touch base", definition: "talk briefly to check on progress", context: MONTHLY_REGISTER_LABELS.slang }]);
  });
});
