import { describe, expect, it } from "vitest";
import { MONTHLY_LEGACY_REGISTER_LABELS, MONTHLY_REGISTER_LABELS, monthlyRegisterLexicalDetails, monthlyRegisterTermIssue, monthlyRegisterTermsApply, selectMonthlyRegisterTerms, validMonthlyRegisterTerms } from "../src/monthly/index.js";

const buck = { kind: "slang", word: "buck", ipa: "/bʌk/", definition: "one dollar of money", usage: "Fine in casual chat with friends; do not use it in reports or client emails." };
const morn = { kind: "poetic", word: "morn", ipa: "/mɔːn/", definition: "the early part of the day", source: "Common in older poetry, Shakespeare and the King James Bible." };

describe("monthly slang / poetic synonyms (L-042, 12/11 definition)", () => {
  it("apply to B1–C1 only", () => {
    expect(["A1", "A2", "B1", "B2", "C1"].map(monthlyRegisterTermsApply)).toEqual([false, false, true, true, true]);
    expect(selectMonthlyRegisterTerms({ word: "dollar" }, [buck], { cefr: "A2" }).selected).toEqual([]);
  });

  it("keeps one genuine slang and one poetic item per core with IPA, usage / source and the fixed label", () => {
    const { selected, rejected } = selectMonthlyRegisterTerms({ word: "morning" }, [
      morn,
      { ...morn, word: "dawn" },
      { kind: "slang", word: "a.m.", ipa: "/eɪ em/", definition: "the hours before noon", usage: "Casual; not in formal writing." }
    ], { cefr: "B2" });
    expect(selected).toEqual([{ kind: "poetic", word: "morn", definition: "the early part of the day", register: MONTHLY_REGISTER_LABELS.poetic, ipa: "/mɔːn/", source: morn.source }]);
    expect(rejected).toEqual(["a poetic alternative is already chosen for morning", expect.stringMatching(/2–4 word/u)]);
    expect(selectMonthlyRegisterTerms({ word: "dollar" }, [buck], { cefr: "B1" }).selected).toEqual([{ kind: "slang", word: "buck", definition: buck.definition, register: MONTHLY_REGISTER_LABELS.slang, ipa: "/bʌk/", usage: buck.usage }]);
  });

  it("rejects formal-register words as poetic (the old generator's commence / conclude / furnish)", () => {
    for (const [core, word] of [["start", "commence"], ["complete", "conclude"], ["deliver", "furnish"], ["buy", "purchase"], ["help", "assist"], ["finish", "finalise"], ["begin", "initiate"]] as const) {
      expect(monthlyRegisterTermIssue({ word: core }, { ...morn, word, definition: "to do this in a formal way" }, { cefr: "B1" }), word).toMatch(/formal/u);
    }
    // A source note that calls it formal or business English is formal register, not poetic.
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...morn, word: "steed", definition: "a horse for riding", source: "Used in formal business letters and reports." }, { cefr: "B1" })).toMatch(/formal register, not poetic/u);
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...morn, word: "steed", ipa: "/stiːd/", definition: "a horse for riding", source: "Found in old ballads and tales of knights." }, { cefr: "B1" })).toBeUndefined();
  });

  it("poetic source notes stay general: no titles, verses, lines or quotations", () => {
    const steed = { ...morn, word: "steed", ipa: "/stiːd/", definition: "a horse for riding" };
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...steed, source: "Used in Hamlet, Act 3." }, { cefr: "C1" })).toMatch(/general/u);
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...steed, source: "Found in Psalm 23 of the Bible." }, { cefr: "C1" })).toMatch(/general/u);
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...steed, source: "As in \"my kingdom for a steed\" in older plays." }, { cefr: "C1" })).toMatch(/general/u);
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...steed, source: "Common in The Faerie Queene and other poems." }, { cefr: "C1" })).toMatch(/general/u);
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...steed, source: "A nice word people like." }, { cefr: "C1" })).toMatch(/where in literature/u);
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...steed, source: "Có trong thơ cổ." }, { cefr: "C1" })).toMatch(/no Vietnamese/u);
    expect(monthlyRegisterTermIssue({ word: "horse" }, { ...steed, source: "Common in Shakespeare's plays and Romantic poetry." }, { cefr: "C1" })).toBeUndefined();
  });

  it("slang needs a genuine distinct word, IPA and a usage note that says when NOT to use it", () => {
    expect(monthlyRegisterTermIssue({ word: "dollar" }, { ...buck, usage: "Use it with friends and colleagues." }, { cefr: "B1" })).toMatch(/when NOT to use/u);
    expect(monthlyRegisterTermIssue({ word: "dollar" }, { ...buck, ipa: "" }, { cefr: "B1" })).toMatch(/British IPA/u);
    // Trial run 2 (12/11): "in formal writing use X" / "casual only" also say when not to use it.
    expect(monthlyRegisterTermIssue({ word: "dollar" }, { ...buck, usage: "Common when chatting with friends. In formal writing, use dollar." }, { cefr: "B1" })).toBeUndefined();
    expect(monthlyRegisterTermIssue({ word: "dollar" }, { ...buck, usage: "Casual chat only with friends or close colleagues." }, { cefr: "B1" })).toBeUndefined();
    expect(monthlyRegisterTermIssue({ word: "dollar" }, { ...buck, usage: "Dùng khi nói chuyện thân mật, không dùng trong email." }, { cefr: "B1" })).toMatch(/no Vietnamese/u);
    // Not a synonym but the same word dressed up, or a word already on the card (report -> update is an existing support).
    expect(monthlyRegisterTermIssue({ word: "contribute" }, { ...buck, word: "contribute to", definition: "give your part to a task" }, { cefr: "B1" })).toMatch(/form of the core word/u);
    expect(monthlyRegisterTermIssue({ word: "report" }, { ...buck, word: "update", definition: "new information about a task" }, { cefr: "B1", takenWords: ["update"] })).toMatch(/already a core or support/u);
    expect(monthlyRegisterTermIssue({ word: "cancel" }, { ...buck, word: "scrap", ipa: "/skræp/", definition: "decide not to go ahead with a plan" }, { cefr: "B1" })).toBeUndefined();
  });

  it("drops vulgar or offensive slang with the sensitive-text filter", () => {
    expect(monthlyRegisterTermIssue({ word: "mistake" }, { ...buck, word: "fuck-up", definition: "a bad error at work" }, { cefr: "B2" })).toMatch(/not workplace-appropriate/u);
    expect(monthlyRegisterTermIssue({ word: "mistake" }, { ...buck, word: "slip", definition: "a shitty little error" }, { cefr: "B2" })).toMatch(/not workplace-appropriate/u);
  });

  it("rejects the core itself, bad shapes and bad definitions", () => {
    const options = { cefr: "C1", takenWords: ["begin"] };
    expect(monthlyRegisterTermIssue({ word: "morn" }, { ...morn, word: "Morn" }, options)).toMatch(/repeats the core/u);
    expect(monthlyRegisterTermIssue({ word: "dollar" }, { ...buck, word: "get the ball rolling now" }, options)).toMatch(/2–4 word/u);
    expect(monthlyRegisterTermIssue({ word: "morning" }, { ...morn, definition: "buổi sáng" }, options)).toMatch(/no Vietnamese/u);
    expect(monthlyRegisterTermIssue({ word: "morning" }, { ...morn, definition: "morn in a poem" }, options)).toMatch(/must not use the word/u);
    expect(monthlyRegisterTermIssue({ word: "morning" }, { ...morn, definition: "" }, options)).toMatch(/needs a short/u);
  });

  it("old stored items (no IPA / usage / source) stay readable with their old label; new ones are re-checked", () => {
    const core = { word: "start", type: "verb", registerTerms: [
      { kind: "poetic" as const, word: "commence", definition: "begin, in formal writing", register: "Formal: formal or literary writing" },
      { kind: "slang" as const, word: "kick off", definition: "bắt đầu", register: "x" }
    ] };
    const valid = validMonthlyRegisterTerms(core, "B1");
    expect(valid).toEqual([{ kind: "poetic", word: "commence", definition: "begin, in formal writing", register: "Formal: formal or literary writing" }]);
    expect(validMonthlyRegisterTerms(core, "A1")).toEqual([]);
    expect(validMonthlyRegisterTerms({ word: "meet" }, "B1")).toEqual([]);
    expect(monthlyRegisterLexicalDetails(valid, core)).toEqual([{ kind: "poetic", word: "commence", definition: "begin, in formal writing", context: "Formal: formal or literary writing" }]);
    expect(validMonthlyRegisterTerms({ word: "x", registerTerms: [{ kind: "slang", word: "touch base", definition: "talk briefly to check on progress", register: "" }] }, "B1")[0]!.register).toBe(MONTHLY_LEGACY_REGISTER_LABELS.slang);
    // A new item that breaks the 12/11 rules (formal word as poetic) is dropped even when stored.
    expect(validMonthlyRegisterTerms({ word: "start", registerTerms: [{ kind: "poetic", word: "commence", definition: "begin a task", register: MONTHLY_REGISTER_LABELS.poetic, ipa: "/kəˈmens/", source: "Common in older poetry." }] }, "B1")).toEqual([]);
  });

  it("lexical details of new items carry IPA, part of speech and usage / source — no context label, no Vietnamese", () => {
    const terms = selectMonthlyRegisterTerms({ word: "dollar" }, [buck], { cefr: "B1" }).selected;
    expect(monthlyRegisterLexicalDetails(terms, { type: "noun" })).toEqual([{ kind: "slang", word: "buck", definition: buck.definition, ipa: "/bʌk/", type: "noun", usage: buck.usage }]);
    const poetic = selectMonthlyRegisterTerms({ word: "morning" }, [morn], { cefr: "B1" }).selected;
    expect(monthlyRegisterLexicalDetails(poetic, { type: "noun" })).toEqual([{ kind: "poetic", word: "morn", definition: morn.definition, ipa: "/mɔːn/", type: "noun", source: morn.source }]);
  });
});
