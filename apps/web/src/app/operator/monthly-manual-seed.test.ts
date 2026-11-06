import { describe, expect, it } from "vitest";
import { monthlyManualSeed } from "./monthly-manual-seed.js";

const plan = (kind: "new" | "review", lessonNumber: number, date: string, extra: Record<string, unknown>) => ({
  lessonNumber, date, kind, coreTermIds: [], expandedTermIds: [], reviewTermIds: [], reviewExpandedTermIds: [],
  skillExercises: [{ exerciseCode: "listening", focus: "Nghe chi tiết thời gian", resourceIds: [] }],
  grammarStepIds: [], soundId: "", pronunciationExampleIds: [], ...extra
});

const framework = {
  id: "f1",
  resources: {
    coreTerms: [
      { id: "c1", word: "client", meaning: "khách hàng", type: "noun", ipa: "/ˈklaɪənt/", source: "core_registry", component: "core" },
      { id: "c2", word: "report", meaning: "báo cáo", type: "noun", ipa: "/rɪˈpɔːt/", source: "core_registry", component: "core" }
    ],
    supportTerms: [
      { id: "s1", word: "customer", meaning: "khách hàng", type: "noun", relation: "synonym", relatedCoreTermId: "c1", component: "expanded", source: "example" },
      { id: "s2", word: "person", meaning: "người", type: "noun", relation: "umbrella", relatedCoreTermId: "c1", component: "expanded", source: "example" }
    ],
    grammarTopics: [{ id: "ga", title: "Present", steps: [{ id: "ga-1", focus: "Simple present", formula: "S + V(s)", usage: "routines", examples: ["We send a report."] }] }],
    sounds: [
      { id: "p1", ipa: "/ɪ/", label: "short i", examples: [{ id: "e1", word: "list", ipa: "/lɪst/" }, { id: "e2", word: "quick", ipa: "/kwɪk/" }, { id: "e3", word: "busy", ipa: "/ˈbɪzi/" }] },
      { id: "p2", ipa: "/θ/", label: "th", examples: [{ id: "e4", word: "think", ipa: "/θɪŋk/" }] }
    ],
    roadmap: {
      allocated: true, grammarSteps: [], sounds: [],
      days: [
        plan("new", 1, "2026-11-02", { coreTermIds: ["c1"], expandedTermIds: ["s1", "s2"], grammarStepIds: ["ga-1"], soundId: "p1", pronunciationExampleIds: ["e1", "e2", "e3"] }),
        plan("new", 2, "2026-11-03", { coreTermIds: ["c2"] }),
        plan("review", 5, "2026-11-06", { reviewTermIds: ["c1", "c2"], reviewExpandedTermIds: ["s1"], reviewGrammarStepIds: ["ga-1"], reviewSoundIds: ["p1", "p2"], reviewPronunciationExampleIds: ["e1", "e2", "e3", "e4"] })
      ]
    }
  },
  lessons: []
} as never;

describe("monthlyManualSeed", () => {
  it("prefills a new day with its core words, linked expanded words, grammar and sound", () => {
    const seed = monthlyManualSeed(framework, 1)!;
    expect(seed).toMatchObject({ kind: "new", date: "2026-11-02", title: "Lesson 1: client" });
    const vocabulary = seed.parts.find((part) => part.code === "vocabulary")!.content as { items: Array<Record<string, unknown>> };
    expect(vocabulary.items).toHaveLength(1);
    expect(vocabulary.items[0]).toMatchObject({ word: "client", meaning: "khách hàng", umbrella: { word: "person" } });
    expect(vocabulary.items[0]!.synonyms).toEqual([{ word: "customer", note: "khách hàng" }]);
    expect(seed.parts.find((part) => part.code === "grammar")!.content).toMatchObject({ formula: "S + V(s)" });
    expect(seed.parts.find((part) => part.code === "pronunciation")!.content).toMatchObject({ focus: "/ɪ/", words: [{ word: "list", ipa: "/lɪst/" }, { word: "quick", ipa: "/kwɪk/" }, { word: "busy", ipa: "/ˈbɪzi/" }] });
    expect(seed.parts.find((part) => part.code === "listening")!.content).toEqual({ focus: "Nghe chi tiết thời gian" });
  });

  it("prefills a review day with the whole week and every review sound", () => {
    const seed = monthlyManualSeed(framework, 5)!;
    expect(seed).toMatchObject({ kind: "review", date: "2026-11-06", vocabularyCount: 3, title: "Weekly review: client, report" });
    const pronunciation = seed.parts.find((part) => part.code === "pronunciation")!.content as { reviewTargets: Array<{ focus: string }> };
    expect(pronunciation.reviewTargets.map((target) => target.focus)).toEqual(["/ɪ/", "/θ/"]);
    expect((seed.parts.find((part) => part.code === "vocabulary")!.content as { items: unknown[] }).items).toHaveLength(2);
  });

  it("numbers new lessons by their order among new days, not by calendar lesson number", () => {
    expect(monthlyManualSeed(framework, 2)!.title).toBe("Lesson 2: report");
  });
});
