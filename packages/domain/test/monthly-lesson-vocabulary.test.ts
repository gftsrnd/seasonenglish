import { describe, expect, it } from "vitest";
import { attachMonthlyExpandedTerms, monthlyCollocationTranslationIssues, monthlyRelationMeaningIssue } from "../src/monthly/lesson-vocabulary.js";

describe("attachMonthlyExpandedTerms", () => {
  it("TV-001 removes changes of meaning from literal reading synonyms", () => {
    const [item] = attachMonthlyExpandedTerms(
      [{ word: "read", meaning: "đọc", synonyms: [{ word: "study", note: "nghiên cứu" }] }],
      [{ id: "read", word: "read", meaning: "đọc" }],
      [{ id: "review", word: "review", meaning: "xem lại", relation: "synonym", relatedCoreTermId: "read" }],
      "A1"
    );
    expect(item!.synonyms).toEqual([]);
  });
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
import { MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH, monthlyGatedLightFindings, monthlyGrammarFormulaExampleIssues } from "../src/monthly/grammar-formula-examples.js";

describe("attachMonthlyExpandedTerms umbrella / family IPA (13/11)", () => {
  it("passes a sibling's IPA through and borrows a core word's IPA for a family/umbrella word, never inventing one", () => {
    const cores = [
      { id: "a", word: "email", type: "noun", ipa: "/ˈiːmeɪl/" },
      { id: "b", word: "request", type: "noun", ipa: "/rɪˈkwest/" },
      { id: "c", word: "message", type: "noun", ipa: "/ˈmesɪdʒ/" }
    ];
    const supports = [
      { id: "u1", word: "message", relation: "umbrella", relatedCoreTermId: "a" },
      { id: "u2", word: "message", relation: "umbrella", relatedCoreTermId: "b" },
      { id: "f1", word: "request", type: "verb", relation: "word_family", relatedCoreTermId: "a" },
      { id: "f2", word: "emailer", type: "noun", relation: "word_family", relatedCoreTermId: "a" },
      { id: "f3", word: "request", type: "noun", relation: "word_family", relatedCoreTermId: "b" }
    ];
    const [email, request] = attachMonthlyExpandedTerms([{ word: "email", meaning: "thư" }, { word: "request", meaning: "yêu cầu" }], cores, supports);
    expect(email!.umbrella).toEqual({ word: "message", pronunciation: "/ˈmesɪdʒ/", siblings: [{ word: "request", type: "noun", pronunciation: "/rɪˈkwest/", meaning: "yêu cầu" }] });
    // "request" (verb) is not the core noun: no IPA; "emailer" is not a core word: no IPA.
    expect(email!.family).toEqual([{ word: "request", type: "verb" }, { word: "emailer", type: "noun" }]);
    expect(request!.family).toEqual([{ word: "request", type: "noun", pronunciation: "/rɪˈkwest/" }]);
  });
});

describe("withMonthlyGrammarSteps", () => {
  const steps = [
    { formula: "S + V(s)", usage: "routines", examples: ["We send a report."] },
    { formula: "am/is/are + V-ing", focus: "now", examples: ["We are testing.", "He is fixing it.", "Extra."] }
  ];
  it("adds one step entry per planned grammar step when the model returned a single formula, falling back to the plan examples only for a step left empty", () => {
    const [grammar] = withMonthlyGrammarSteps<{ code: string; content: Record<string, unknown> }>([{ code: "grammar", content: { formula: "S + V(s). am/is/are + V-ing", examples: ["The client is calling now.", "Our team is checking the invoice."] } }], steps);
    expect(grammar!.content!.steps).toEqual([
      // "S + V(s)" cannot be read: no top-level example is assigned to it, so the plan example fills it (never an empty step).
      { formula: "S + V(s)", text: "routines", examples: ["We send a report."] },
      { formula: "am/is/are + V-ing", text: "now", examples: ["The client is calling now.", "Our team is checking the invoice."] }
    ]);
  });
  it("keeps the plan formulas but the model's explanations, and ignores single-step days", () => {
    const own = [{ code: "grammar", content: { steps: [{ formula: "rewritten a", text: "giải thích A", examples: ["A1."] }, { formula: "rewritten b", text: "giải thích B" }] } }];
    expect(withMonthlyGrammarSteps<{ code: string; content: Record<string, unknown> }>(own, steps)[0]!.content!.steps).toEqual([
      { formula: "S + V(s)", text: "giải thích A", examples: ["A1."] },
      { formula: "am/is/are + V-ing", text: "giải thích B", examples: ["We are testing.", "He is fixing it.", "Extra."] }
    ]);
    expect(withMonthlyGrammarSteps([{ code: "grammar", content: { formula: "x" } }], steps.slice(0, 1))[0]!.content).toEqual({ formula: "x" });
  });
});

describe("withMonthlyGrammarSteps on the live B1 2026-12 review steps", () => {
  // month_frameworks 900fd0fb (4300): the step-3 formulas and resource examples of topics A and B.
  const planSteps = [
    { formula: "Error check: [subject] + [state verb] (NOT is knowing) / always + am/is/are + verb-ing (complaint about repeated habit)", usage: "A3", examples: ["Wrong: She work in Hanoi. Right: She works in Hanoi.", "Wrong: I am knowing the answer. Right: I know the answer.", "Wrong: We are agree with the plan. Right: We agree with the plan.", "Our manager is always changing the schedule, so it is hard to plan ahead."] },
    { formula: "Error check: [subject] + verb-ed/irregular (NOT did + verb-ed) / have/has + noun (I have two projects) vs have got (I have got a new laptop)", usage: "B3", examples: ["Wrong: Yesterday I go to the client meeting. Right: Yesterday I went to the client meeting.", "Wrong: Did she wrote the report? Right: Did she write the report?", "We have got three new projects this year. We had only one last year.", "My team has a clear goal for next year, so I have got a good plan to share."] }
  ];
  const resourceExamples = new Set(planSteps.flatMap((step) => step.examples));
  type Part = { code: string; content: Record<string, unknown> };

  it("keeps every per-row example the model wrote (no 2-example cap) and passes the formula/example check", () => {
    const own = [
      ["Wrong: I am knowing the new forecast. Right: I know the new forecast.", "Our supplier is always changing the delivery date, so we cannot plan the budget."],
      ["Wrong: Did the client approved the budget? Right: Did the client approve the budget?", "Our team has a new supplier this quarter.", "We have got a clear forecast for the next project."]
    ];
    const [grammar] = withMonthlyGrammarSteps<Part>([{ code: "grammar", content: { formula: "x", steps: own.map((examples) => ({ formula: "rewritten", text: "t", examples })) } }], planSteps);
    const stepsOut = grammar!.content.steps as Array<{ formula: string; examples: string[] }>;
    expect(stepsOut.map((step) => step.formula)).toEqual(planSteps.map((step) => step.formula));
    expect(stepsOut.map((step) => step.examples)).toEqual(own);
    expect(monthlyGrammarFormulaExampleIssues(grammar!.content)).toEqual([]);
  });

  it("prefers the model's examples; a step the model wrote none for takes matching top-level examples, else the plan's reference examples (never empty)", () => {
    const top = ["Wrong: I am knowing the client. Right: I know the client.", "Our manager is always changing the plan.", "We have got a new laptop for the intern."];
    const [grammar] = withMonthlyGrammarSteps<Part>([{ code: "grammar", content: { formula: "x", examples: top } }], planSteps);
    const stepsOut = grammar!.content.steps as Array<{ examples: string[] }>;
    expect(stepsOut.flatMap((step) => step.examples).some((example) => resourceExamples.has(example))).toBe(false);
    expect(stepsOut[0]!.examples).toEqual(top.slice(0, 2));
    const [bare] = withMonthlyGrammarSteps<Part>([{ code: "grammar", content: { formula: "x" } }], planSteps);
    // 24/12: a step must never render empty, so the plan's reference examples (which cover every row) fill it.
    expect((bare!.content.steps as Array<{ examples: string[] }>).map((step) => step.examples)).toEqual(planSteps.map((step) => step.examples));
  });

  it("the old copy (first two resource examples per step) stays reportable only as the advisory mismatch", () => {
    const copied = { formula: "x", steps: planSteps.map((step) => ({ formula: step.formula, text: step.usage, examples: step.examples.slice(0, 2) })) };
    const issues = monthlyGrammarFormulaExampleIssues(copied);
    expect(issues.map((issue) => issue.rowsWithoutExample)).toEqual([["always + am/is/are + verb-ing (complaint about repeated habit)"], ["have/has + noun (I have two projects)", "have got (I have got a new laptop)"]]);
    expect(monthlyGatedLightFindings([{ code: MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH }])).toEqual([]);
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

describe("collocation translations (12/11)", () => {
  const cores = [{ id: "c1", word: "client" }];
  const supports = [{ id: "s1", word: "meet a client", meaning: "gặp khách hàng", relation: "collocation", relatedCoreTermId: "c1" }];
  const model = { word: "client", collocations: ["a new client", "client feedback", "the client"], collocationTranslations: ["khách hàng mới", "phản hồi của khách hàng", "khách hàng"] };

  it("A1–A2: aligns one Vietnamese line per merged phrase (planned phrases take the plan's meaning)", () => {
    const [item] = attachMonthlyExpandedTerms([model], cores, supports, "A1");
    expect(item!.collocations).toEqual(["meet a client", "a new client", "client feedback"]);
    expect(item!.collocationTranslations).toEqual(["gặp khách hàng", "khách hàng mới", "phản hồi của khách hàng"]);
  });

  it("drops incomplete A1–A2 lines and every B1+ line", () => {
    const [partial] = attachMonthlyExpandedTerms([{ ...model, collocationTranslations: ["khách hàng mới"] }], cores, supports, "A2");
    expect(partial!.collocationTranslations).toBeUndefined();
    const [b1] = attachMonthlyExpandedTerms([model], cores, supports, "B1");
    expect(b1!.collocationTranslations).toBeUndefined();
  });

  it("gates them per level", () => {
    const phrases = ["meet a client", "a new client", "client feedback"];
    expect(monthlyCollocationTranslationIssues("A1", phrases, ["gặp khách hàng", "khách hàng mới", "phản hồi của khách hàng"])).toEqual([]);
    expect(monthlyCollocationTranslationIssues("A2", phrases, undefined)[0]).toMatch(/one short Vietnamese meaning per collocation/u);
    expect(monthlyCollocationTranslationIssues("A2", phrases, ["gặp khách hàng", "a new client", ""])).toHaveLength(2);
    expect(monthlyCollocationTranslationIssues("B2", phrases, ["gặp khách hàng", "khách hàng mới", "phản hồi"])[0]).toMatch(/omitted at B2/u);
    expect(monthlyCollocationTranslationIssues("C1", phrases, undefined)).toEqual([]);
  });
});

describe("umbrella / word-family card data from the plan (13/11)", () => {
  const cores = [{ id: "c1", word: "attendee", type: "noun", ipa: "/ˌætenˈdiː/" }, { id: "c2", word: "improvement", type: "noun", ipa: "/ɪmˈpruːvmənt/" }];
  const supports = [
    { id: "u1", word: "meeting participant", type: "noun", meaning: "người tham gia cuộc họp", definition: "a person who takes part in a meeting", ipa: "/ˈmiːtɪŋ pɑːˈtɪsɪpənt/", relation: "umbrella", relatedCoreTermId: "c1" },
    { id: "f1", word: "improve", type: "verb", meaning: "cải thiện", definition: "make something better", ipa: "/ɪmˈpruːv/", relation: "word_family", relatedCoreTermId: "c2" },
    // Plans before 13/11: type and Vietnamese meaning only.
    { id: "f2", word: "improved", type: "adjective", meaning: "được cải thiện", relation: "word_family", relatedCoreTermId: "c2" }
  ];
  const items = [{ word: "attendee", meaning: "người tham dự" }, { word: "improvement", meaning: "sự cải thiện" }];

  it("B1+: umbrella keeps its part of speech, IPA and English definition; family words too", () => {
    const [attendee, improvement] = attachMonthlyExpandedTerms(items, cores, supports, "B1");
    expect(attendee!.umbrella).toMatchObject({ word: "meeting participant", type: "noun", pronunciation: "/ˈmiːtɪŋ pɑːˈtɪsɪpənt/", definition: "a person who takes part in a meeting" });
    expect(improvement!.family).toEqual([
      { word: "improve", type: "verb", pronunciation: "/ɪmˈpruːv/", meaning: "cải thiện", definition: "make something better" },
      { word: "improved", type: "adjective", meaning: "được cải thiện" }
    ]);
  });

  it("A1–A2: no English definition is attached; type and IPA still are", () => {
    const [attendee, improvement] = attachMonthlyExpandedTerms(items, cores, supports, "A2");
    expect(attendee!.umbrella).toMatchObject({ word: "meeting participant", type: "noun", pronunciation: "/ˈmiːtɪŋ pɑːˈtɪsɪpənt/", meaning: "người tham gia cuộc họp" });
    expect((attendee!.umbrella as Record<string, unknown>).definition).toBeUndefined();
    expect(improvement!.family).toEqual([
      { word: "improve", type: "verb", pronunciation: "/ɪmˈpruːv/", meaning: "cải thiện" },
      { word: "improved", type: "adjective", meaning: "được cải thiện" }
    ]);
  });

  it("a model-written umbrella with the planned word gains the plan's missing fields", () => {
    const [attendee] = attachMonthlyExpandedTerms([{ word: "attendee", umbrella: { word: "meeting participant", meaning: "người dự họp" } }], cores, supports, "B1");
    expect(attendee!.umbrella).toMatchObject({ word: "meeting participant", meaning: "người dự họp", type: "noun", definition: "a person who takes part in a meeting" });
  });
});
