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
    expect(monthlyResourceApprovalIssues(vowel)).toHaveLength(2);
    const diphthong = contract("A1", []);
    diphthong.sounds[0] = { id: "s1", ipa: "/ɪ/", label: "short i", examples: [{ id: "s1-1", word: "sign", ipa: "/saɪn/" }] };
    expect(monthlyResourceApprovalIssues(diphthong)).toHaveLength(1);
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
