import { describe, expect, it } from "vitest";
import { attachMonthlyExpandedTerms, monthlyRelationMeaningIssue } from "../src/monthly/lesson-vocabulary.js";

describe("attachMonthlyExpandedTerms", () => {
  const cores = [{ id: "c1", word: "client", type: "noun", ipa: "/ˈklaɪənt/" }];
  const supports = [
    { id: "s1", word: "customer", meaning: "khách hàng", relation: "synonym", relatedCoreTermId: "c1" },
    { id: "s2", word: "person", meaning: "người", relation: "umbrella", relatedCoreTermId: "c1" },
    { id: "s3", word: "clientele", type: "noun", meaning: "khách hàng (nói chung)", relation: "word_family", relatedCoreTermId: "c1" },
    { id: "s4", word: "meet a client", relation: "collocation", relatedCoreTermId: "c1" },
    { id: "s5", word: "boss", relation: "synonym", relatedCoreTermId: "other" }
  ];

  it("turns string synonyms into card entries and adds the plan's expanded terms once", () => {
    const [item] = attachMonthlyExpandedTerms([{ word: "client", meaning: "khách hàng", synonyms: ["customer"], antonyms: [] }], cores, supports);
    // The model listed "customer" itself; the plan still adds its meaning.
    expect(item!.synonyms).toEqual([{ word: "customer", note: "khách hàng" }]);
    expect(item!.family).toEqual([{ word: "clientele", type: "noun", meaning: "khách hàng (nói chung)" }]);
    expect(item!.umbrella).toEqual({ word: "person", meaning: "người", siblings: [] });
    expect(item!.collocations).toEqual(["meet a client"]);
    expect(item!.type).toBe("noun");
  });

  it("leaves words that are not core terms unchanged apart from normalising lists", () => {
    const [item] = attachMonthlyExpandedTerms([{ word: "unknown", synonyms: ["x"] }], cores, supports);
    expect(item).toMatchObject({ word: "unknown", synonyms: [{ word: "x" }], family: [] });
    expect(item!.umbrella).toBeUndefined();
  });
});

describe("attachMonthlyExpandedTerms umbrella siblings", () => {
  it("lists the other words sharing an umbrella so the umbrella modal has siblings", () => {
    const cores = [{ id: "a", word: "email" }, { id: "b", word: "request" }];
    const supports = [
      { id: "u1", word: "message", relation: "umbrella", relatedCoreTermId: "a" },
      { id: "u2", word: "message", relation: "umbrella", relatedCoreTermId: "b" }
    ];
    const [email, request] = attachMonthlyExpandedTerms([{ word: "email", meaning: "thư" }, { word: "request", meaning: "yêu cầu" }], cores, supports);
    expect(email!.umbrella).toEqual({ word: "message", siblings: [{ word: "request", meaning: "yêu cầu" }] });
    expect((request!.umbrella as { siblings: unknown[] }).siblings).toEqual([{ word: "email", meaning: "thư" }]);
  });
});

import { withMonthlyGrammarSteps } from "../src/monthly/lesson-vocabulary.js";

describe("withMonthlyGrammarSteps", () => {
  const steps = [
    { formula: "S + V(s)", usage: "routines", examples: ["We send a report."] },
    { formula: "am/is/are + V-ing", focus: "now", examples: ["We are testing.", "He is fixing it.", "Extra."] }
  ];
  it("adds one step entry per planned grammar step when the model returned a single formula", () => {
    const [grammar] = withMonthlyGrammarSteps<{ code: string; content: Record<string, unknown> }>([{ code: "grammar", content: { formula: "S + V(s). am/is/are + V-ing" } }], steps);
    expect(grammar!.content!.steps).toEqual([
      { formula: "S + V(s)", text: "routines", examples: ["We send a report."] },
      { formula: "am/is/are + V-ing", text: "now", examples: ["We are testing.", "He is fixing it."] }
    ]);
  });
  it("keeps the plan formulas but the model's explanations, and ignores single-step days", () => {
    const own = [{ code: "grammar", content: { steps: [{ formula: "rewritten a", text: "giải thích A", examples: ["A1."] }, { formula: "rewritten b", text: "giải thích B" }] } }];
    expect(withMonthlyGrammarSteps<{ code: string; content: Record<string, unknown> }>(own, steps)[0]!.content!.steps).toEqual([
      { formula: "S + V(s)", text: "giải thích A", examples: ["A1."] },
      { formula: "am/is/are + V-ing", text: "giải thích B", examples: ["We are testing.", "He is fixing it."] }
    ]);
    expect(withMonthlyGrammarSteps([{ code: "grammar", content: { formula: "x" } }], steps.slice(0, 1))[0]!.content).toEqual({ formula: "x" });
  });
});

describe("attachMonthlyExpandedTerms collocations", () => {
  it("keeps 3 phrases, planned first, without near-duplicates", () => {
    const [item] = attachMonthlyExpandedTerms(
      [{ word: "quick", collocations: ["a quick check", "quick reply", "quick update"] }],
      [{ id: "q", word: "quick" }],
      [{ id: "c", word: "quick check", relation: "collocation", relatedCoreTermId: "q" }]
    );
    expect(item!.collocations).toEqual(["quick check", "quick reply", "quick update"]);
    expect(item!.examples).toEqual(["quick check", "quick reply", "quick update"]);
  });
});

describe("attachMonthlyExpandedTerms illustrations", () => {
  it("uses the frozen core illustration and leaves words without one as text only", () => {
    const [withImage, withoutImage] = attachMonthlyExpandedTerms(
      [{ word: "client" }, { word: "report" }],
      [{ id: "c", word: "client", imageUrl: "/api/v1/files/content-media/read?artifactKey=content-media%2Fx.png" }, { id: "r", word: "report" }],
      []
    );
    expect(withImage).toMatchObject({ imageUrl: "/api/v1/files/content-media/read?artifactKey=content-media%2Fx.png", imageAttribution: { licence: "Nội dung nội bộ" } });
    expect(withoutImage!.imageUrl).toBeUndefined();
    expect(withoutImage!.imageAttribution).toBeUndefined();
  });
});

describe("synonym/antonym meanings by level (12/11)", () => {
  const cores = [{ id: "c1", word: "help", type: "verb" }];
  const supports = [
    { id: "s1", word: "assist", meaning: "hỗ trợ", relation: "synonym", relatedCoreTermId: "c1", definition: "help someone do something" },
    { id: "s2", word: "hinder", meaning: "cản trở", relation: "antonym", relatedCoreTermId: "c1" }
  ];

  it("A1–A2 cards carry the Vietnamese meaning as note", () => {
    const [item] = attachMonthlyExpandedTerms([{ word: "help" }], cores, supports, "A2");
    expect(item!.synonyms).toEqual([{ word: "assist", note: "hỗ trợ" }]);
    expect(item!.antonyms).toEqual([{ word: "hinder", note: "cản trở" }]);
  });

  it("B1–C1 cards carry only the English definition and never the Vietnamese meaning", () => {
    const [item] = attachMonthlyExpandedTerms([{ word: "help", synonyms: ["assist"] }], cores, supports, "B2");
    expect(item!.synonyms).toEqual([{ word: "assist", definition: "help someone do something" }]);
    // Older pools without a definition: the word shows as today, without a meaning.
    expect(item!.antonyms).toEqual([{ word: "hinder" }]);
  });

  it("keeps a synonym/antonym the model added only with the level's meaning", () => {
    const model = { word: "help", synonyms: ["aid", { word: "support", definition: "give help to someone" }], antonyms: [{ word: "block", note: "chặn" }, { word: "obstruct", definition: "cản trở" }] };
    const [b2] = attachMonthlyExpandedTerms([model], cores, supports, "B2");
    expect(b2!.synonyms).toEqual([{ word: "support", definition: "give help to someone" }, { word: "assist", definition: "help someone do something" }]);
    // "block" has only a Vietnamese note, "obstruct" a Vietnamese definition: both removed at B2; the planned antonym stays.
    expect(b2!.antonyms).toEqual([{ word: "hinder" }]);
    const [a2] = attachMonthlyExpandedTerms([model], cores, supports, "A2");
    expect(a2!.synonyms).toEqual([{ word: "assist", note: "hỗ trợ" }]);
    expect(a2!.antonyms).toEqual([{ word: "block", note: "chặn" }, { word: "hinder", note: "cản trở" }]);
    // Older callers without a level keep every entry as before.
    expect((attachMonthlyExpandedTerms([model], cores, supports)[0]!.synonyms as unknown[]).length).toBe(3);
  });

  it("gates the meaning form per level", () => {
    expect(monthlyRelationMeaningIssue("A1", { word: "assist", relation: "synonym", meaning: "hỗ trợ" })).toBeUndefined();
    expect(monthlyRelationMeaningIssue("A1", { word: "assist", relation: "synonym", meaning: " " })).toMatch(/Vietnamese meaning/u);
    expect(monthlyRelationMeaningIssue("B1", { word: "assist", relation: "synonym", meaning: "hỗ trợ", definition: "help someone do something" })).toBeUndefined();
    expect(monthlyRelationMeaningIssue("B1", { word: "assist", relation: "synonym", meaning: "hỗ trợ" })).toMatch(/simple-English definition/u);
    expect(monthlyRelationMeaningIssue("C1", { word: "assist", relation: "antonym", definition: "giúp đỡ ai đó" })).toMatch(/no Vietnamese/u);
    expect(monthlyRelationMeaningIssue("B2", { word: "assist", relation: "synonym", definition: "to assist a person" })).toMatch(/itself/u);
    expect(monthlyRelationMeaningIssue("B2", { word: "assist", relation: "synonym", definition: "help" })).toMatch(/2–14 words/u);
    expect(monthlyRelationMeaningIssue("B2", { word: "helper", relation: "word_family" })).toBeUndefined();
  });
});
