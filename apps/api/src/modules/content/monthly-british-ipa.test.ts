import { describe, expect, it } from "vitest";
import { monthlyBritishIpaIssue, repairMonthlyCoreIpa } from "./monthly-british-ipa.js";
import { getMonthlyPronunciationExampleQualityIssue, monthlyImplausibleSpellingIssue } from "./monthly-resource-quality-gates.js";
import { monthlySupportQualityIssue, monthlySynonymShapeIssue } from "./monthly-resource-generation.js";

/** Core words and pronunciation examples of the December 2026 resource drafts (.artifacts/dec-2026/res-*.txt). */
const AMERICAN_DECEMBER = [
  ["manager", "/ˈmænɪdʒər/"], ["computer", "/kəmˈpjuːtər/"], ["hard", "/hɑːrd/"], ["answer", "/ˈɑːnsər/"], ["new", "/nuː/"],
  ["chart", "/tʃɑːrt/"], ["work", "/wɜːrk/"], ["notes", "/noʊts/"], ["learn", "/lɜːrn/"], ["form", "/fɔːrm/"], ["last", "/læst/"],
  ["water", "/ˈwɔːtər/"], ["clear", "/klɪr/"], ["notebook", "/ˈnoʊtbʊk/"], ["document", "/ˈdɑːkjumənt/"], ["project", "/ˈprɑːdʒekt/"],
  ["stakeholder", "/ˈsteɪkhoʊldər/"], ["proposal", "/prəˈpoʊzl/"]
] as const;
const BRITISH = [
  ["problem", "/ˈprɒbləm/"], ["team", "/tiːm/"], ["plan", "/plæn/"], ["easy", "/ˈiːzi/"], ["video", "/ˈvɪdiəʊ/"], ["colleague", "/ˈkɒliːɡ/"],
  ["order", "/ˈɔːdə/"], ["action", "/ˈækʃn/"], ["manager", "/ˈmænɪdʒə/"], ["new", "/njuː/"], ["last", "/lɑːst/"], ["hard", "/hɑːd/"],
  ["far away", "/fɑːr‿əˈweɪ/"], ["do it", "/duː‿w‿ɪt/"], ["student", "/ˈstjuːdənt/"], ["clear", "/klɪə/"], ["chart", "/tʃɑːt/"]
] as const;

describe("British RP IPA gate (December 2026)", () => {
  it("rejects every American transcription seen in the December drafts", () => {
    for (const [word, ipa] of AMERICAN_DECEMBER) expect(monthlyBritishIpaIssue(word, ipa), `${word} ${ipa}`).toBeDefined();
    expect(monthlyBritishIpaIssue("last", "/læst/")).toContain("BATH word");
    expect(monthlyBritishIpaIssue("hard", "/hɑːrd/")).toContain("rhotic");
    expect(monthlyBritishIpaIssue("notes", "/noʊts/")).toContain("/əʊ/");
    expect(monthlyBritishIpaIssue("project", "/ˈprɑːdʒekt/")).toContain("/ɒ/");
    expect(monthlyBritishIpaIssue("new", "/nuː/")).toContain("/j/");
  });
  it("accepts British RP transcriptions, linking r and linking glides", () => {
    for (const [word, ipa] of BRITISH) expect(monthlyBritishIpaIssue(word, ipa), `${word} ${ipa}`).toBeUndefined();
  });
  it("rejects the malformed B2 phrase IPA", () => {
    expect(monthlyBritishIpaIssue("next month", "/ˈnekis(t)/")).toContain("written as one word");
    expect(monthlyBritishIpaIssue("to our agenda", "/tuː‿w‿ˈaʊə ə‿j‿ˈdʒendə/")).toContain("linking /j/");
    expect(monthlyBritishIpaIssue("send", "send")).toContain("between slashes");
  });
  it("rejects the invented A2 /æ/ example and the American /æ/ example of last", () => {
    expect(monthlyImplausibleSpellingIssue("ackle")).toContain("not a real English word");
    expect(monthlyImplausibleSpellingIssue("acknowledge")).toBeUndefined();
    expect(getMonthlyPronunciationExampleQualityIssue({ targetIpa: "/æ/", word: "ackle", ipa: "/ˈækl/" })).toContain("not a real English word");
    expect(getMonthlyPronunciationExampleQualityIssue({ targetIpa: "/æ/", word: "last", ipa: "/læst/" })).toContain("BATH word");
    expect(getMonthlyPronunciationExampleQualityIssue({ targetIpa: "/æ/", word: "plan", ipa: "/plæn/" })).toBeUndefined();
  });
  it("repairs core IPA through the generator and keeps the words", async () => {
    const cores = [{ id: "c1", word: "hard", meaning: "khó", type: "adjective", ipa: "/hɑːrd/" }, { id: "c2", word: "team", meaning: "nhóm", type: "noun", ipa: "/tiːm/" }];
    const prompts: string[] = [];
    const result = await repairMonthlyCoreIpa(cores, async (prompt, batch) => {
      prompts.push(prompt);
      expect(batch.map((term) => term.word)).toEqual(["hard"]);
      return { coreTerms: [{ id: "c1", word: "hard", ipa: "/hɑːd/" }] };
    });
    expect(result).toEqual({ changed: true, remaining: [] });
    expect(cores[0]!.ipa).toBe("/hɑːd/");
    expect(prompts[0]).toContain("DO NOT CHANGE ANY WORD");
    const stubborn = [{ id: "c1", word: "notes", meaning: "", type: "noun", ipa: "/noʊts/" }];
    const failed = await repairMonthlyCoreIpa(stubborn, async () => ({ coreTerms: [{ id: "c1", word: "notes", ipa: "/noʊtz/" }] }));
    expect(failed.remaining.map((entry) => entry.word)).toEqual(["notes"]);
  });
});

describe("synonym shape gate (December 2026 A1 plan)", () => {
  it("rejects definitions and negations as synonyms", () => {
    expect(monthlySynonymShapeIssue({ word: "week", type: "noun" }, { word: "seven days", relation: "synonym" })).toContain("definition");
    expect(monthlySynonymShapeIssue({ word: "easy", type: "adjective" }, { word: "not hard", relation: "synonym" })).toContain("negated");
    expect(monthlySynonymShapeIssue({ word: "write", type: "verb" }, { word: "note down", relation: "synonym" })).toBeUndefined();
    expect(monthlySynonymShapeIssue({ word: "help", type: "verb" }, { word: "assist", relation: "synonym" })).toBeUndefined();
    expect(monthlySynonymShapeIssue({ word: "plan", type: "noun" }, { word: "action plan", relation: "collocation" })).toBeUndefined();
    expect(monthlySupportQualityIssue({ word: "week", type: "noun" }, { word: "seven days", relation: "synonym" }, 0)).toContain("definition");
  });
});
