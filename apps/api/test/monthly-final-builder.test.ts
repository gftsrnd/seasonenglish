import { describe, expect, it } from "vitest";
import { buildMonthlyFinalDraft } from "../src/modules/assessment/monthly-final-builder.js";

const contract = {
  month: "2026-11", cefr: "A2" as const, version: 3,
  theme: { version: 3, title: "Customer handover", brief: "Prepare a handover", context: "Support", communicationGoal: "Explain risks" },
  coreTerms: [
    { id: "c1", word: "handover", meaning: "bàn giao", type: "noun", ipa: "/ˈhændoʊvər/", source: "core_registry" as const, component: "core" as const, dayNumber: 1 },
    { id: "c2", word: "confirm", meaning: "xác nhận", type: "verb", ipa: "/kənˈfɜːrm/", source: "core_registry" as const, component: "core" as const, dayNumber: 1 },
    { id: "c3", word: "deadline", meaning: "hạn chót", type: "noun", ipa: "/ˈdedlaɪn/", source: "core_registry" as const, component: "core" as const, dayNumber: 1 }
  ],
  supportTerms: [{ id: "s1", word: "stakeholder", meaning: "bên liên quan", type: "noun", relation: "umbrella" as const, source: "family" as const, component: "expanded" as const, dayNumber: 1, relatedCoreTermId: "c1" }],
  grammarTopics: [{ id: "g1", title: "Present simple", steps: [{ id: "g1s", focus: "routine", formula: "S + V", usage: "routine", examples: ["I confirm the handover."] }] }, { id: "g2", title: "Requests", steps: [{ id: "g2s", focus: "request", formula: "Could + S", usage: "request", examples: ["Could you confirm?"] }] }],
  sounds: [{ id: "p1", ipa: "/æ/", label: "short a", examples: [{ id: "p1e", word: "plan", ipa: "/plæn/" }, { id: "p2e", word: "task", ipa: "/tɑːsk/" }, { id: "p3e", word: "status", ipa: "/ˈsteɪtəs/" }] }],
  daySpecs: [{ lessonNumber: 1, date: "2026-11-02", kind: "new" as const, coreTermIds: ["c1", "c2", "c3"], expandedTermIds: ["s1"], reviewTermIds: [], reviewExpandedTermIds: [], skillExercises: ["listening", "reading", "writing", "word_class", "word_use", "speaking"].map((exerciseCode) => ({ exerciseCode: exerciseCode as "listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking", focus: "Use assigned words.", resourceIds: ["c1", "c2", "c3", "s1"] })), grammarStepId: "g1s", soundId: "p1", pronunciationExampleIds: ["p1e", "p2e", "p3e"] }]
};

describe("monthly final builder", () => {
  it("snapshots the approved monthly hard resources into a 30-minute four-skill draft", () => {
    const draft = buildMonthlyFinalDraft(contract);
    expect(draft).toMatchObject({ kind: "final", totalMinutes: 30, totalScore: 100, monthlyScope: { month: "2026-11", cefr: "A2", contractVersion: 3, coreTermIds: ["c1", "c2", "c3"], grammarStepIds: ["g1s", "g2s"], soundIds: ["p1"] } });
    expect(draft.sections.map(section => section.maxScore)).toEqual([25, 25, 25, 25]);
    expect(draft.sections.find(section => section.code === "writing")!.groups[0]!.tasks[0]!.prompt).toContain("handover");
    expect(draft.sections.find(section => section.code === "speaking")!.groups[0]!.tasks[0]!.prompt).toContain("/æ/");
    expect(draft.sections.find(section => section.code === "listening")!.groups[0]!.stimulus?.type).toBe("audio_script");
    expect(JSON.stringify(draft)).not.toContain("stakeholder");
  });
});
