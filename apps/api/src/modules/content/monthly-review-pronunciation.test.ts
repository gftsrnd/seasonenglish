import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract, PronunciationSound } from "@e4s/domain";
import { parseMonthlyLessonParts } from "@e4s/ai";
import { evaluateMonthlyReviewSections, monthlyReviewSpeakingContrastGuidance } from "./monthly-review-quality.js";
import { hasExactTargetOccurrences, monthlyLockedPlanExpectations } from "./monthly-quality.js";
import { monthlyDailyTeachingContract, monthlyReviewExerciseContract, normalizeMonthlyReviewParts } from "./monthly-day-generation.js";

/**
 * Round 3 (12/11/2026, 4175): the November Friday reviews and C1 N17 failed every
 * regenerate after the B1–C1 pronunciation roadmap switched to phenomena. The
 * sounds, examples and AI outputs below are copied from the 4175 plans and the
 * captured exercise-call outputs.
 */
const ex = (prefix: string, words: Array<[string, string]>) => words.map(([word, ipa], index) => ({ id: `${prefix}-word-${index + 1}`, word, ipa }));
const SOUNDS: Record<string, PronunciationSound[]> = {
  A1: [
    { id: "a1-sound-1", ipa: "/m/", label: "Phụ âm /m/", catalogId: "phoneme-m", examples: ex("a1-sound-1", [["meeting", "/ˈmiːtɪŋ/"], ["email", "/ˈiːmeɪl/"], ["name", "/neɪm/"]]) },
    { id: "a1-sound-4", ipa: "/h/", label: "Phụ âm /h/", catalogId: "phoneme-h", examples: ex("a1-sound-4", [["happy", "/ˈhæpi/"], ["hear", "/hɪər/"], ["hat", "/hæt/"]]) }
  ],
  B1: [
    { id: "b1-sound-2", ipa: "/-s=z/", label: "Ending -s pronounced /z/", catalogId: "b1-s-z", examples: ex("b1-sound-2", [["emails", "/ˈiːmeɪlz/"], ["sends", "/sendz/"], ["names", "/neɪmz/"]]) },
    { id: "b1-sound-3", ipa: "/-es=ɪz/", label: "Ending -s/-es pronounced /ɪz/", catalogId: "b1-s-iz", examples: ex("b1-sound-3", [["offices", "/ˈɒfɪsɪz/"], ["changes", "/ˈtʃeɪndʒɪz/"], ["pushes", "/ˈpʊʃɪz/"]]) },
    { id: "b1-sound-4", ipa: "/'s/", label: "Contracted 's (it's, he's done)", catalogId: "b1-s-contraction", examples: ex("b1-sound-4", [["it's clear now", "/ɪts klɪər naʊ/"], ["he's done the report", "/hiːz dʌn ðə rɪˈpɔːt/"]]) }
  ],
  B2: [
    { id: "b2-sound-1", ipa: "/ðə ə ən/", label: "Weak forms of articles", catalogId: "b2-weak-articles", examples: ex("b2-sound-1", [["send the file", "/send ðə faɪl/"], ["a summary", "/ə ˈsʌməri/"]]) },
    { id: "b2-sound-2", ipa: "/tə fə əv ət/", label: "Weak forms of prepositions", catalogId: "b2-weak-prepositions", examples: ex("b2-sound-2", [["a copy for you", "/ə ˈkɒpi fə ˈjuː/"], ["at the meeting", "/ət ðə ˈmiːtɪŋ/"]]) }
  ],
  C1: [
    { id: "c1-sound-1", ipa: "/ˈsuffix shift/", label: "Stress shift with suffixes", catalogId: "c1-stress-suffix-shift", examples: ex("c1-sound-1", [["engineer", "/ˌendʒɪˈnɪər/"], ["strategic", "/strəˈtiːdʒɪk/"]]) },
    { id: "c1-sound-2", ipa: "/ˈcompound vs adj ˈnoun/", label: "Compound noun versus adjective + noun", catalogId: "c1-stress-compound-phrase", examples: ex("c1-sound-2", [["greenhouse", "/ˈɡriːnhaʊs/"], ["green house", "/ˌɡriːn ˈhaʊs/"]]) },
    { id: "c1-sound-3", ipa: "/ˈmulti-part compound/", label: "Multi-part compound nouns", catalogId: "c1-stress-multi-compound", examples: ex("c1-sound-3", [["customer service desk", "/ˈkʌstəmə ˌsɜːvɪs desk/"], ["sales target report", "/ˈseɪlz ˌtɑːɡɪt rɪˈpɔːt/"]]) },
    { id: "c1-sound-4", ipa: "/ˈsetup set ˈup/", label: "Phrasal verb versus its noun", catalogId: "c1-stress-phrasal-noun-verb", examples: ex("c1-sound-4", [["setup (noun)", "/ˈsetʌp/"], ["set up (verb)", "/ˌset ˈʌp/"], ["breakdown (noun)", "/ˈbreɪkdaʊn/"], ["break down (verb)", "/ˌbreɪk ˈdaʊn/"]]) }
  ]
};

function plan(cefr: "A1" | "B1" | "B2" | "C1"): MonthlyCurriculumContract {
  const sounds = SOUNDS[cefr]!;
  const exampleIds = sounds.flatMap((sound) => sound.examples.map((example) => example.id));
  return {
    month: "2026-11", cefr, version: 1,
    theme: { version: 1, title: "Projects", brief: "Brief", context: "Context", communicationGoal: "Goal" },
    coreTerms: [
      { id: "core-1", word: "deadline", meaning: "hạn chót", type: "noun", ipa: "/ˈdedlaɪn/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-2", word: "review", meaning: "xem lại", type: "verb", ipa: "/rɪˈvjuː/", source: "core_registry", component: "core", dayNumber: 1 }
    ],
    supportTerms: [],
    grammarTopics: [{ id: "grammar-1", title: "Grammar", steps: [{ id: "grammar-step", focus: "focus", formula: "S + V", usage: "usage", examples: ["Example."] }] }],
    sounds,
    daySpecs: [
      { lessonNumber: 5, date: "2026-11-06", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: ["core-1", "core-2"], reviewExpandedTermIds: [], reviewGrammarStepIds: ["grammar-step"], reviewSoundIds: sounds.map((sound) => sound.id), reviewPronunciationExampleIds: exampleIds, skillExercises: [], grammarStepId: "grammar-step", soundId: sounds[0]!.id, pronunciationExampleIds: exampleIds.slice(0, 3) }
    ]
  } as unknown as MonthlyCurriculumContract;
}

const pair = (id: string, options: string[], extra: Record<string, unknown> = {}) => ({ id, prompt: "Listen and choose what you hear.", audioText: options[0], options, answer: options[0], explanation: "The two options differ in the target feature.", ...extra });
function speakingFindings(cefr: "A1" | "B1" | "B2" | "C1", items: Array<Record<string, unknown>>) {
  const contract = plan(cefr);
  const parts = new Map([["speaking", { content: { items } }]]);
  return evaluateMonthlyReviewSections(contract, contract.daySpecs[0]!, 5, parts).severe.filter((finding) => finding.component === "speaking");
}
const codes = (findings: Array<{ code: string }>) => findings.map((finding) => finding.code);
const tail = (readAloud: string) => [
  { id: "s3", prompt: "Read this sentence aloud", passage: readAloud },
  { id: "s4", prompt: "Tell your team about the plan.", requiredWords: ["deadline", "review"], minRequiredWords: 2 }
];

describe("Friday review listen-and-choose items (pronunciation roadmap, round 3)", () => {
  it("A2 N10 / B2 N15 output: 4-option 'minimal pairs' are reported as such, not as '0 minimal pairs'", () => {
    // Captured A2 N10 exercise call: the same 4-option items came back in both repair rounds.
    const findings = speakingFindings("A1", [
      { id: "s1", prompt: "Nghe và chọn từ đúng: Chọn từ bạn nghe được.", audioText: "name", options: ["name", "same", "lame", "game"], answer: "name", explanation: "Name có âm /n/." },
      { id: "s2", prompt: "Nghe và chọn từ đúng: Chọn từ bạn nghe được.", audioText: "hear", options: ["hear", "near", "here", "fear"], answer: "hear", explanation: "Hear có âm /h/." },
      ...tail("I am happy to hear the meeting news.")
    ]);
    expect(codes(findings)).not.toContain("MONTHLY_REVIEW_MINIMAL_PAIRS");
    const options = findings.filter((finding) => finding.code === "MONTHLY_REVIEW_MINIMAL_PAIR_OPTIONS");
    expect(options).toHaveLength(2);
    expect(options[0]!.message).toContain("speaking item s1 has 4 options (name, same, lame, game); a minimal-pair item has exactly 2 options");
    expect(options[0]!.message).toContain("the week example \"name\"");
  });


  it("allows an approved two-phoneme fallback only when it changes the monthly contrast", () => {
    const contract = plan("A1");
    contract.sounds = [
      { id: "long-i", ipa: "/iː/", label: "Long vowel", catalogId: "phoneme-iː", examples: ex("long-i", [["easy", "/ˈiːzi/"], ["sheep", "/ʃiːp/"], ["cheese", "/tʃiːz/"]]) },
      { id: "short-i", ipa: "/ɪ/", label: "Short vowel", catalogId: "phoneme-ɪ", examples: ex("short-i", [["ship", "/ʃɪp/"], ["it", "/ɪt/"], ["ink", "/ɪŋk/"]]) }
    ];
    const day = { ...contract.daySpecs[0]!, reviewPronunciationExampleIds: contract.sounds.flatMap(sound => sound.examples.map(example => example.id)) };
    const issues = (partner: string, explanation = "Listen for the stressed vowels.") => evaluateMonthlyReviewSections(contract, day, 5, new Map([
      ["speaking", { content: { items: [pair("s1", ["easy", partner], { explanation }), pair("s2", ["sheep", "ship"]), ...tail("It is easy to ship cheese.") ] } }]
    ])).severe.filter(finding => finding.component === "speaking");

    expect(issues("dizzy")).toEqual([]);
    expect(issues("easy")).toHaveLength(1);
    expect(issues("cheese")).toHaveLength(1);
    expect(issues("ink")).toHaveLength(1);
    expect(issues("dizzi")).toHaveLength(1);
    expect(issues("dizzy", "This is a minimal pair.")).toHaveLength(1);
    expect(monthlyReviewSpeakingContrastGuidance(contract, day)).toContain("easy / dizzy");
  });

  it("A1: phoneme items keep the strict minimal-pair rule (A1 N20 meeting / meaning, hear / hat rejected)", () => {
    expect(codes(speakingFindings("A1", [pair("s1", ["name", "game"]), pair("s2", ["hat", "cat"]), ...tail("I am happy to hear the meeting news.")]))).toEqual([]);
    const bad = speakingFindings("A1", [pair("s1", ["meeting", "meaning"]), pair("s2", ["hear", "hat"]), ...tail("I am happy to hear the meeting news.")]);
    expect(codes(bad)).toEqual(["MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL", "MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL"]);
    const scope = speakingFindings("A1", [pair("s1", ["ship", "sheep"]), pair("s2", ["name", "game"]), ...tail("I am happy to hear the meeting news.")]);
    expect(codes(scope)).toEqual(["MONTHLY_REVIEW_MINIMAL_PAIR_SCOPE"]);
  });

  it("B1 endings: sends / sense and offices / office are valid contrasts; offices / offers and ships / sheeps are not (B1 N10)", () => {
    expect(codes(speakingFindings("B1", [pair("s1", ["sends", "sense"]), pair("s2", ["offices", "office"]), ...tail("She sends the changes to all offices today.")]))).toEqual([]);
    const bad = speakingFindings("B1", [pair("s1", ["offices", "offers"]), pair("s2", ["ships", "sheeps"]), ...tail("She sends the changes to all offices today.")]);
    expect(codes(bad)).toEqual(["MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL", "MONTHLY_REVIEW_MINIMAL_PAIR_SCOPE"]);
    expect(bad[0]!.message).toContain("Keep the week example \"offices\"");
    expect(bad[1]!.message).toContain("Ending -s pronounced /z/ /-s=z/ and Ending -s/-es pronounced /ɪz/ /-es=ɪz/: use the example word and the same word without the -s ending");
  });

  it("B1 contracted 's: the same phrase with the contraction written out is the contrast", () => {
    expect(codes(speakingFindings("B1", [pair("s1", ["it's clear now", "it is clear now"]), pair("s2", ["he's done the report", "he done the report"]), ...tail("It's clear now that he's done the report.")]))).toEqual([]);
  });

  it("B2 weak forms: the whole example phrase with one word changed; a single word out of the phrase is rejected (B2 N20 send / sand)", () => {
    expect(codes(speakingFindings("B2", [pair("s1", ["send the file", "send a file"]), pair("s2", ["a copy for you", "a copy to you"]), ...tail("Please send the file at the meeting today.")]))).toEqual([]);
    const bad = speakingFindings("B2", [pair("s1", ["send", "sand"]), pair("s2", ["at the meeting", "after the long meeting today"]), ...tail("Please send the file at the meeting today.")]);
    expect(codes(bad)).toEqual(["MONTHLY_REVIEW_MINIMAL_PAIR_SCOPE", "MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL"]);
    expect(bad[0]!.message).toContain("\"send the file\"");
  });

  it("C1 stress items: setup / set up, breakdown / break down, strategic / strategies are valid (C1 N15, N20); the (noun)/(verb) notes are not part of the word", () => {
    expect(codes(speakingFindings("C1", [pair("s1", ["setup", "set up"]), pair("s2", ["breakdown", "break down"]), ...tail("We set up the greenhouse near the customer service desk.")]))).toEqual([]);
    expect(codes(speakingFindings("C1", [pair("s1", ["engineer", "engineered"]), pair("s2", ["strategic", "strategies"]), ...tail("Our engineer gave a strategic update.")]))).toEqual([]);
    expect(codes(speakingFindings("C1", [pair("s1", ["strategic", "simple"]), pair("s2", ["greenhouse", "green house"]), ...tail("Our engineer gave a strategic update.")]))).toEqual(["MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL"]);
  });

  it("read-aloud counts phrase examples and examples with (noun)/(verb) notes by their spoken text", () => {
    expect(codes(speakingFindings("C1", [pair("s1", ["setup", "set up"]), pair("s2", ["greenhouse", "green house"]), ...tail("We will set up the new greenhouse next week.")]))).toEqual([]);
    expect(codes(speakingFindings("B2", [pair("s1", ["send the file", "send a file"]), pair("s2", ["a copy for you", "a copy to you"]), ...tail("I will send the file today.")]))).toEqual(["MONTHLY_REVIEW_READ_ALOUD_WORDS"]);
  });

  it("the review prompt states per week sound which examples to copy and what the partner must be", () => {
    const b1 = monthlyReviewSpeakingContrastGuidance(plan("B1"), plan("B1").daySpecs[0]!);
    expect(b1).toContain("Ending -s pronounced /z/ /-s=z/: one option is one of [\"emails\", \"sends\", \"names\"] copied exactly; the other option is the example word and the same word without the -s ending");
    expect(b1).toContain("Contracted 's (it's, he's done) /'s/: one option is one of [\"it's clear now\", \"he's done the report\"]");
    const c1 = monthlyReviewSpeakingContrastGuidance(plan("C1"), plan("C1").daySpecs[0]!);
    expect(c1).toContain("[\"setup\", \"set up\", \"breakdown\", \"break down\"]");
    expect(c1).toContain("greenhouse / green house");
    const a1 = monthlyReviewSpeakingContrastGuidance(plan("A1"), plan("A1").daySpecs[0]!);
    expect(a1).toContain("a true minimal pair");
    const prompt = monthlyReviewExerciseContract(2, 1, "B1", undefined, b1);
    expect(prompt).toContain("options is EXACTLY 2 strings (never 3 or 4");
    expect(prompt).toContain("Build each pair from this week's pronunciation items: Ending -s pronounced /z/");
    expect(prompt).not.toContain("ship / sheep");
  });
});

describe("C1 N17 K2 read-aloud (8 taught positions)", () => {
  const k2 = () => {
    const contract = plan("C1");
    contract.planSchemaVersion = 2;
    const required = contract.sounds.flatMap((sound) => sound.examples.slice(0, 2).map((example) => ({ soundId: sound.id, exampleId: example.id })));
    const day = { ...contract.daySpecs[0]!, lessonNumber: 17, kind: "new" as const, pronunciationPlan: { slot: "K2", stage: "read_aloud", objective: "Read aloud", targetIds: contract.sounds.map((sound) => sound.id), exampleIds: required.map((position) => position.exampleId), exampleSet: 1, requiredPositions: required } };
    contract.daySpecs = [day as never];
    return { contract, day: contract.daySpecs[0]! };
  };

  it("expects the spoken words without (noun)/(verb) notes, so a correct passage passes", () => {
    const { contract, day } = k2();
    const words = monthlyLockedPlanExpectations(contract, day).targetPositionWords;
    expect(words).toEqual(["engineer", "strategic", "greenhouse", "green house", "customer service desk", "sales target report", "setup", "set up"]);
    const passage = "Our engineer shared a strategic plan. The greenhouse behind the green house needs a new setup, so we will set up a meeting at the customer service desk to discuss the sales target report.";
    expect(hasExactTargetOccurrences(passage, words)).toBe(true);
    expect(hasExactTargetOccurrences(passage.replace("set up a meeting", "arrange a meeting"), words)).toBe(false);
  });

  it("the K2 prompt lists the exact words to write", () => {
    const { contract, day } = k2();
    const prompt = monthlyDailyTeachingContract(day, "C1", [], monthlyLockedPlanExpectations(contract, day).targetPositionWords);
    expect(prompt).toContain("without notes such as (noun)/(verb): \"engineer\", \"strategic\", \"greenhouse\", \"green house\", \"customer service desk\", \"sales target report\", \"setup\", \"set up\".");
  });
});

describe("review exercise output shape", () => {
  it("recovers parts returned as a string with one unclosed part object (B2 N15 exercise call)", () => {
    const raw = "[{\"code\":\"reading\",\"content\":{\"text\":\"Dear team, the launch moved.\",\"prompt\":\"Read the message.\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"answer\":\"a\",\"explanation\":\"It says so.\"}, {\"code\":\"word_class\",\"content\":{\"items\":[{\"id\":\"w1\",\"prompt\":\"The ____ is late.\",\"options\":[\"deliver\",\"delivery\",\"delivered\",\"delivering\"],\"answer\":\"delivery\"}]}},{\"code\":\"speaking\",\"content\":{\"items\":[{\"id\":\"s4\",\"requiredWords\":[\"amend\",\"analyse\"],\"minRequiredWords\":2}]}}]";
    expect(() => JSON.parse(raw)).toThrow();
    const parts = parseMonthlyLessonParts(raw) as Array<{ code: string; content: Record<string, unknown> }>;
    expect(parts.map((part) => part.code)).toEqual(["reading", "word_class", "speaking"]);
    expect((parts[1]!.content.items as unknown[]).length).toBe(1);
  });

  it("keeps a single-question review reading as items[0] and lifts a passage written on the items", () => {
    const [single] = normalizeMonthlyReviewParts<{ code: string; content: Record<string, unknown> }>([{ code: "reading", content: { text: "Dear team, the launch moved to May.", prompt: "Read the message.", options: ["May", "June", "July", "April"], answer: "May", explanation: "It says May." } }]);
    expect(single!.content.passage).toBe("Dear team, the launch moved to May.");
    expect(single!.content.items).toEqual([expect.objectContaining({ prompt: "Read the message.", answer: "May", passage: "Dear team, the launch moved to May." })]);
    const [lifted] = normalizeMonthlyReviewParts<{ code: string; content: Record<string, unknown> }>([{ code: "reading", content: { items: [{ id: "r1", passage: "Hi Linh, the review is on Friday.", prompt: "When?", options: ["Friday", "Monday", "Today", "Never"], answer: "Friday" }] } }]);
    expect(lifted!.content.passage).toBe("Hi Linh, the review is on Friday.");
  });
});

describe("B1+ review listening meanings (B1 N15; 16/11 English definitions)", () => {
  it("accepts English definitions and rejects Vietnamese meanings in options, answers and explanations", () => {
    const contract = plan("B1");
    const english = ["look at something again to check it", "the last day to finish a task", "say yes to an idea", "how fast something moves"];
    const item = (explanation: string, options = english) => ({ id: "l1", prompt: "Listen and choose the meaning", audioText: "review", options, answer: options[0]!, explanation, variants: [{ id: "l1-v1", prompt: "Listen and choose the meaning", audioText: "review", options: [options[0]!, options[2]!, options[1]!, options[3]!], answer: options[0]!, explanation: "Review means to look at something again." }] });
    const findings = (explanation: string, options?: string[]) => evaluateMonthlyReviewSections(contract, contract.daySpecs[0]!, 5, new Map([["listening", { content: { items: [item(explanation, options)] } }]])).severe.filter((finding) => finding.code === "MONTHLY_REVIEW_INSTRUCTION_LANGUAGE");
    expect(findings("Review means to look at something again to check it.")).toEqual([]);
    expect(findings("Review means xem lại.", ["xem lại", "hạn chót", "đồng ý", "tốc độ"])).toHaveLength(1);
    expect(findings("Từ này nghĩa là xem lại công việc.")).toHaveLength(1);
  });
});
