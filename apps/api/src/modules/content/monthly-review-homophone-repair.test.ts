import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract, PronunciationSound } from "@e4s/domain";
import { evaluateMonthlyReviewSections, monthlyReviewSpeakingContrastGuidance } from "./monthly-review-quality.js";

/**
 * December 2026 re-run (docs/ai-quality-december-2026.md §12.2, A1 L4): the
 * week-1 review kept "team / teem" through six repair rounds because the
 * repair message never said what partner to use. The /iː/ examples are the
 * December A1 plan's (.artifacts/dec-2026/res-A1.txt); the two speaking items
 * are the logged L4 output (.artifacts/dec-2026/lessons/A1-L4.json).
 */
const IY: PronunciationSound = {
  id: "a1-sound-iy", ipa: "/iː/", label: "Nguyên âm dài /iː/", catalogId: "phoneme-iː",
  examples: [["team", "/tiːm/"], ["meet", "/miːt/"], ["week", "/wiːk/"], ["free", "/friː/"], ["screen", "/skriːn/"], ["read", "/riːd/"], ["feel", "/fiːl/"], ["keep", "/kiːp/"], ["easy", "/ˈiːzi/"]]
    .map(([word, ipa], index) => ({ id: `iy-${index + 1}`, word: word!, ipa: ipa! }))
};

function plan(): MonthlyCurriculumContract {
  return {
    month: "2026-12", cefr: "A1", version: 1,
    theme: { version: 1, title: "Team meetings", brief: "Brief", context: "Context", communicationGoal: "Goal" },
    coreTerms: [
      { id: "core-1", word: "team", meaning: "nhóm", type: "noun", ipa: "/tiːm/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-2", word: "problem", meaning: "vấn đề", type: "noun", ipa: "/ˈprɒbləm/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-3", word: "help", meaning: "giúp đỡ", type: "verb", ipa: "/help/", source: "core_registry", component: "core", dayNumber: 1 }
    ],
    supportTerms: [],
    grammarTopics: [{ id: "grammar-1", title: "Be", steps: [{ id: "grammar-step", focus: "focus", formula: "S + be", usage: "usage", examples: ["Example."] }] }],
    sounds: [IY],
    daySpecs: [{ lessonNumber: 4, date: "2026-12-04", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: ["core-1", "core-2", "core-3"], reviewExpandedTermIds: [], reviewGrammarStepIds: ["grammar-step"], reviewSoundIds: [IY.id], reviewPronunciationExampleIds: IY.examples.map((example) => example.id) }]
  } as unknown as MonthlyCurriculumContract;
}

const listenItem = (id: string, options: [string, string], audioText: string) => ({ id, prompt: "Nghe và chọn từ bạn nghe được.", audioText, options, answer: audioText, explanation: "Chú ý âm /iː/ dài.", questionTranslation: "Nghe và chọn từ bạn nghe được.", answerTranslation: audioText });
const tail = [
  { id: "speaking-3", prompt: "Đọc to câu sau: Our team will meet every week to keep the plan easy to follow.", passage: "Our team will meet every week to keep the plan easy to follow." },
  { id: "speaking-4", prompt: "Hãy nói 1–2 câu, dùng các từ: team, problem, help.", requiredWords: ["team", "problem", "help"], minRequiredWords: 2 }
];
function pairFindings(items: Array<Record<string, unknown>>) {
  const contract = plan();
  return evaluateMonthlyReviewSections(contract, contract.daySpecs[0]!, 4, new Map([["speaking", { content: { items: [...items, ...tail] } }]]))
    .severe.filter((finding) => finding.code === "MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL");
}

describe("A1 review homophone minimal pair repair (December 2026 A1 L4)", () => {
  it("names the item, says why and offers real /iː/ partners from this week's examples", () => {
    const findings = pairFindings([listenItem("speaking-1", ["team", "teem"], "team"), listenItem("speaking-2", ["weak", "week"], "week")]);
    expect(findings).toHaveLength(2);
    const team = findings[0]!.message;
    expect(team).toContain("speaking item speaking-1: \"team / teem\"");
    expect(team).toContain("homophones");
    expect(team).toContain("\"team\" has no common real word that differs only in /iː/");
    expect(team).toMatch(/"read \/ rid" or "feel \/ fill"/u);
    expect(findings[1]!.message).toContain("speaking item speaking-2: \"weak / week\"");
  });

  it("accepts the suggested repairs: another taught /iː/ example with its real partner", () => {
    expect(pairFindings([listenItem("speaking-1", ["read", "rid"], "read"), listenItem("speaking-2", ["feel", "fill"], "fill")])).toEqual([]);
  });

  it("names the real pairs in the first prompt so the model avoids the homophone", () => {
    const contract = plan();
    expect(monthlyReviewSpeakingContrastGuidance(contract, contract.daySpecs[0]!)).toContain("real pairs from these examples: read / rid, feel / fill");
  });
});
