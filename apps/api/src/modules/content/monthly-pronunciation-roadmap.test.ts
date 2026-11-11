import { describe, expect, it } from "vitest";
import { monthlyPronunciationCatalog, selectMonthlyPronunciationItems } from "@e4s/domain";
import { buildMonthlyCatalogPronunciationPrompt, getMonthlyPronunciationTextIssues, selectMonthlyPronunciationCandidates } from "./monthly-resource-generation.js";
import { getMonthlyPronunciationCatalogExampleIssue } from "./monthly-resource-quality-gates.js";
import { isPronunciationTargetAllowedForLevel, isValidMonthlyPronunciationIpaTarget, validateMonthlyResourcePlanShape } from "./monthly-resource-plan-spec.js";

const item = (cefr: "A1" | "B1" | "B2" | "C1", id: string) => monthlyPronunciationCatalog(cefr).find((entry) => entry.id === id)!;
const words = (pairs: Array<[string, string]>) => pairs.map(([word, ipa]) => ({ word, ipa }));

describe("roadmap pronunciation gates (11/11)", () => {
  it("phoneme items keep the token check without the old weak-form false rejections (A2 v5: that, have)", () => {
    const ae = item("A1", "phoneme-æ");
    expect(getMonthlyPronunciationCatalogExampleIssue(ae, { word: "that", ipa: "/ðæt/" })).toBeUndefined();
    expect(getMonthlyPronunciationCatalogExampleIssue(ae, { word: "have", ipa: "/hæv/" })).toBeUndefined();
    expect(getMonthlyPronunciationCatalogExampleIssue(ae, { word: "job", ipa: "/dʒæb/" })).toMatch(/cannot be pronounced/u);
    const ih = item("A1", "phoneme-ɪ");
    // Section 7 C1 samples: stressed /ɪ/ is accepted, unstressed /ɪ/ is not.
    for (const [word, ipa] of [["finance", "/ˈfɪnæns/"], ["missile", "/ˈmɪsaɪl/"], ["district", "/ˈdɪstrɪkt/"]] as const) {
      expect(getMonthlyPronunciationCatalogExampleIssue(ih, { word, ipa })).toBeUndefined();
    }
    expect(getMonthlyPronunciationCatalogExampleIssue(ih, { word: "meeting", ipa: "/ˈmiːtɪŋ/" })).toMatch(/stressed vowel/u);
    expect(getMonthlyPronunciationCatalogExampleIssue(ih, { word: "document", ipa: "/ˈdɒkjumənt/" })).toBeDefined();
  });

  it("phenomenon items are checked by form, so B2/C1 can no longer drift to B1 clusters", () => {
    const weak = item("B2", "b2-weak-articles");
    // Section 7 B2/C1 drift: cluster words returned for a phenomenon slot.
    for (const [word, ipa] of [["budget", "/ˈbʌdʒɪt/"], ["contrast", "/ˈkɒntrɑːst/"], ["forecast", "/ˈfɔːkɑːst/"]] as const) {
      expect(getMonthlyPronunciationCatalogExampleIssue(weak, { word, ipa })).toBeDefined();
    }
    expect(getMonthlyPronunciationCatalogExampleIssue(weak, { word: "send the file", ipa: "/ˈsend ðə ˈfaɪl/" })).toBeUndefined();
    const stress = item("B1", "b1-stress-noun-adj");
    expect(getMonthlyPronunciationCatalogExampleIssue(stress, { word: "supplier", ipa: "/səˈplaɪə/" })).toBeDefined();
    expect(getMonthlyPronunciationCatalogExampleIssue(stress, { word: "budget", ipa: "/ˈbʌdʒɪt/" })).toBeUndefined();
    // A homograph core with a different stress is still rejected (present the verb).
    expect(getMonthlyPronunciationCatalogExampleIssue(stress, { word: "present", ipa: "/ˈpreznt/" }, [{ word: "present", ipa: "/prɪˈzent/" }])).toMatch(/core word/u);
    const coda = item("B1", "b1-coda-st");
    expect(getMonthlyPronunciationCatalogExampleIssue(coda, { word: "tracks", ipa: "/trædks/" })).toBeDefined();
  });

  it("selection: phrase examples are not cut by the 3-syllable rule, word-stress examples are, pairs stay balanced", () => {
    const rhythm = item("B2", "b2-link-cv");
    const phrases = selectMonthlyPronunciationCandidates({ candidates: words([["pick it up at eleven", "/ˈpɪk‿ɪt‿ʌp‿ət‿ɪˈlevn/"], ["send it again", "/ˈsend‿ɪt‿əˈɡen/"]]), forbiddenWords: new Set(), needed: 2, catalogItem: rhythm });
    expect(phrases.selected).toHaveLength(2);
    const suffix = item("B1", "b1-suffix-ity");
    const long = selectMonthlyPronunciationCandidates({ candidates: words([["responsibility", "/rɪˌspɒnsəˈbɪləti/"], ["quality", "/ˈkwɒləti/"]]), forbiddenWords: new Set(), needed: 2, catalogItem: suffix });
    expect(long.selected.map((entry) => entry.word)).toEqual(["quality"]);
    expect(long.rejected[0]).toMatch(/syllables/u);
    const pair = item("A1", "pair-ih-ee");
    const candidates = words([["ship", "/ʃɪp/"], ["bit", "/bɪt/"], ["fill", "/fɪl/"], ["sit", "/sɪt/"], ["live", "/lɪv/"], ["hit", "/hɪt/"], ["pick", "/pɪk/"], ["sheep", "/ʃiːp/"], ["beat", "/biːt/"], ["feel", "/fiːl/"], ["seat", "/siːt/"]]);
    const balanced = selectMonthlyPronunciationCandidates({ candidates, forbiddenWords: new Set(), needed: 9, catalogItem: pair, totalForTarget: 9 });
    expect(balanced.selected.map((entry) => entry.word)).toEqual(["ship", "bit", "fill", "sit", "live", "hit", "sheep", "beat", "feel"]);
    expect(balanced.rejected[0]).toMatch(/other side/u);
  });

  it("explanation limit and language feed the repair loop (B1 failed with >360 characters)", () => {
    const long = "This item teaches the ending. ".repeat(14);
    expect(getMonthlyPronunciationTextIssues("B1", { label: "Ending -s", explanation: long })[0]).toMatch(/shorten it to at most 50 words and 300 characters/u);
    expect(getMonthlyPronunciationTextIssues("B1", { label: "Đuôi -s", explanation: "Đọc /s/ sau âm vô thanh." })).toEqual([expect.stringMatching(/simple English/u)]);
    expect(getMonthlyPronunciationTextIssues("A1", { label: "Âm /m/", explanation: "Close your lips." })).toEqual([expect.stringMatching(/Vietnamese/u)]);
    expect(getMonthlyPronunciationTextIssues("A1", { label: "Phụ âm /m/", explanation: "Mím hai môi, hơi ra đằng mũi. Lỗi hay gặp: bỏ âm /m/ cuối." })).toEqual([]);
  });

  it("prompt names the fixed item, the catalog, the taught list and the limits", () => {
    const pick = selectMonthlyPronunciationItems({ cefr: "B1", month: "2026-11", history: [{ month: "2026-10", sounds: [{ ipa: "/-s=s/" }, { ipa: "/-s=z/" }, { ipa: "/-es=ɪz/" }, { ipa: "/'s/" }] }] });
    expect(pick.items.map((entry) => entry.id)).toEqual(["b1-ed-t", "b1-ed-d", "b1-ed-id", "b1-ed-link"]);
    const prompt = buildMonthlyCatalogPronunciationPrompt({ cefr: "B1", slot: "P1 (N1–N3)", item: pick.items[0]!, monthItems: pick.items, catalog: monthlyPronunciationCatalog("B1"), taughtIds: pick.taughtIds, neededExamples: 9, usedWords: [], acceptedWords: [], coreWords: ["checked"], vocabulary: "checked (đã kiểm tra)", textIssues: ["explanation is 400 characters / 70 words; shorten it"] });
    expect(prompt).toContain('Set ipa to exactly "/-ed=t/"');
    expect(prompt).toContain("ALREADY CHOSEN");
    expect(prompt).toContain("/-s=s/ Ending -s pronounced /s/");
    expect(prompt).toContain("at most 50 words and at most 300 characters");
    expect(prompt).toContain("TEXT REPAIR: explanation is 400 characters");
    expect(prompt).toContain("simple English");
  });

  it("plan shape and IPA validators accept roadmap notations per level", () => {
    expect(isValidMonthlyPronunciationIpaTarget("/C‿V/")).toBe(true);
    expect(isValidMonthlyPronunciationIpaTarget("/ɪ/–/iː/")).toBe(true);
    expect(isValidMonthlyPronunciationIpaTarget("/θ/ and /ð/")).toBe(false);
    expect(isPronunciationTargetAllowedForLevel("B1", "/-s=s/")).toBe(true);
    expect(isPronunciationTargetAllowedForLevel("B1", "/ɪ/")).toBe(false);
    expect(isPronunciationTargetAllowedForLevel("A2", "/ɪ/–/iː/")).toBe(true);
    expect(isPronunciationTargetAllowedForLevel("A2", "/C‿V/")).toBe(false);
    const plan = {
      coreTerms: [], expandedTerms: [], grammarTopics: [],
      pronunciationTargets: monthlyPronunciationCatalog("B2").slice(4, 8).map((entry, index) => ({ id: `p${index}`, ipa: entry.notation, label: entry.labelEn, explanation: "x", words: Array.from({ length: 9 }, (_v, w) => ({ word: `we can look at it again ${index}${w}` })) }))
    };
    const errors = validateMonthlyResourcePlanShape(plan, 0, "B2").filter((error) => error.includes("Pronunciation"));
    expect(errors).toEqual([]);
  });
});
