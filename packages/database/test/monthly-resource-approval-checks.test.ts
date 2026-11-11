import { describe, expect, it } from "vitest";
import { monthlyResourceApprovalIssues } from "../src/monthly-resource-approval-checks.js";

type Contract = Parameters<typeof monthlyResourceApprovalIssues>[0];

function contract(cefr: Contract["cefr"], objectives: string[]): Contract {
  return {
    cefr,
    coreTerms: [{ id: "core-1", word: "invoice", meaning: "hóa đơn", type: "noun", ipa: "/ˈɪnvɔɪs/", source: "core_registry", component: "core", dayNumber: 1 }],
    grammarTopics: [{ id: "g1", title: "Topic", steps: [{ id: "g1-1", focus: "f", formula: "S + V", usage: "u", examples: ["I check it."], dailyObjectives: objectives }] }],
    sounds: [{ id: "s1", ipa: "/iː/", label: "long ee", examples: [{ id: "s1-1", word: "meet", ipa: "/miːt/" }] }]
  };
}

describe("monthlyResourceApprovalIssues (WP9 approval re-check)", () => {
  it("passes a clean pool, including Vietnamese objectives at A1", () => {
    expect(monthlyResourceApprovalIssues(contract("A1", ["Nhận diện cách dùng trong email", "Vận dụng khi trả lời khách"]))).toEqual([]);
    expect(monthlyResourceApprovalIssues(contract("B1", ["Recognise the form in an email", "Use it to answer a client"]), [{ cefr: "A2", coreWords: ["invoice"] }])).toEqual([]);
  });

  it("rejects an example IPA without the target sound", () => {
    const bad = contract("A1", []);
    bad.sounds[0]!.examples.push({ id: "s1-2", word: "work", ipa: "/wɜːk/" });
    expect(monthlyResourceApprovalIssues(bad)).toEqual([expect.stringContaining('"work" IPA /wɜːk/ does not contain target /iː/')]);
    const legacy = contract("B1", []);
    legacy.sounds[0] = { ...legacy.sounds[0]!, ipa: "/ˈX/", examples: [{ id: "s1-1", word: "client", ipa: "/ˈklaɪənt/" }] };
    expect(monthlyResourceApprovalIssues(legacy)).toHaveLength(1);
  });

  it("compares the target by phoneme tokens: no onset cluster, diphthong part or weak-form function word", () => {
    const cluster = contract("B1", []);
    cluster.sounds[0] = { id: "s1", ipa: "/st/", label: "final /st/", examples: [{ id: "s1-1", word: "request", ipa: "/rɪˈkwest/" }, { id: "s1-2", word: "extend", ipa: "/ɪkˈstend/" }] };
    expect(monthlyResourceApprovalIssues(cluster)).toEqual([expect.stringContaining('"extend" IPA /ɪkˈstend/')]);
    const vowel = contract("A1", ["Nhận diện âm trong từ quen thuộc"]);
    vowel.sounds[0] = { id: "s1", ipa: "/æ/", label: "short a", examples: [{ id: "s1-1", word: "plan", ipa: "/plæn/" }, { id: "s1-2", word: "that", ipa: "/ðæt/" }, { id: "s1-3", word: "have", ipa: "/hæv/" }] };
    // Strong forms that /ðæt/ and have /hæv/ are genuine /æ/ examples (A2 v5 false rejection, 11/11).
    expect(monthlyResourceApprovalIssues(vowel)).toEqual([]);
    const weak = contract("A1", []);
    weak.sounds[0] = { id: "s1", ipa: "/ə/", label: "schwa", examples: [{ id: "s1-1", word: "to", ipa: "/tə/" }, { id: "s1-2", word: "can", ipa: "/kən/" }, { id: "s1-3", word: "about", ipa: "/əˈbaʊt/" }] };
    expect(monthlyResourceApprovalIssues(weak)).toHaveLength(2);
    const diphthong = contract("A1", []);
    diphthong.sounds[0] = { id: "s1", ipa: "/ɪ/", label: "short i", examples: [{ id: "s1-1", word: "sign", ipa: "/saɪn/" }] };
    expect(monthlyResourceApprovalIssues(diphthong)).toHaveLength(1);
  });

  it("checks roadmap phenomenon targets by form, not by phoneme tokens", () => {
    const stress = contract("B1", []);
    stress.sounds[0] = { id: "s1", ipa: "/ˈσσ/", label: "Two-syllable nouns", catalogId: "b1-stress-noun-adj", examples: [{ id: "s1-1", word: "office", ipa: "/ˈɒfɪs/" }, { id: "s1-2", word: "supplier", ipa: "/səˈplaɪə/" }] };
    expect(monthlyResourceApprovalIssues(stress)).toEqual([expect.stringContaining('"supplier"')]);
    const linking = contract("B2", []);
    linking.sounds[0] = { id: "s1", ipa: "/C‿V/", label: "Linking", examples: [{ id: "s1-1", word: "check it out", ipa: "/ˈtʃek‿ɪt‿ˈaʊt/" }, { id: "s1-2", word: "send the file", ipa: "/ˈsend ðə ˈfaɪl/" }] };
    expect(monthlyResourceApprovalIssues(linking)).toEqual([expect.stringContaining('"send the file"')]);
    const pair = contract("A2", []);
    pair.sounds[0] = { id: "s1", ipa: "/ɪ/–/iː/", label: "Cặp /ɪ/ – /iː/", examples: [{ id: "s1-1", word: "ship", ipa: "/ʃɪp/" }, { id: "s1-2", word: "sheep", ipa: "/ʃiːp/" }, { id: "s1-3", word: "bad", ipa: "/bæd/" }] };
    expect(monthlyResourceApprovalIssues(pair)).toEqual([expect.stringContaining('"bad"')]);
  });

  it("rejects Vietnamese dailyObjectives from B1", () => {
    expect(monthlyResourceApprovalIssues(contract("C1", ["Nhận diện cách dùng trong email", "Use it to answer a client"]))).toEqual([expect.stringContaining("dailyObjectives must be in simple English for C1")]);
  });

  it("rejects core words shared between B1 and C1 of the same month", () => {
    expect(monthlyResourceApprovalIssues(contract("C1", []), [{ cefr: "B1", coreWords: ["Invoice"] }])).toEqual([expect.stringContaining("Core terms shared with B1")]);
    expect(monthlyResourceApprovalIssues(contract("B1", []), [{ cefr: "C1", coreWords: ["invoice"] }])).toEqual([expect.stringContaining("Core terms shared with C1")]);
    expect(monthlyResourceApprovalIssues(contract("C1", []), [{ cefr: "B2", coreWords: ["invoice"] }])).toEqual([]);
  });
});
