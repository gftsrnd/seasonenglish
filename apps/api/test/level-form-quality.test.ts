import { describe, expect, it } from "vitest";
import {
  evaluateLevelFormQuality, hasCanonicalLevelFormListeningParts, levelFormNearDuplicatePairs, levelFormQualityInputFromOutput, levelFormQualityInputFromSections,
  splitLevelFormListeningParts
} from "../src/modules/assessment/level-form-quality.js";
import {
  B1_HANDOVER_PASSAGE, B1_RETURNS_PASSAGE, gateInput, LISTENING_SCRIPT, neutralQuestions, readingWith,
  WRONG_KEY_HOW_MANY, WRONG_KEY_NOT_LISTED, WRONG_KEY_PHOTOGRAPHS
} from "./support/level-form-fixture.js";

const codes = (report: ReturnType<typeof evaluateLevelFormQuality>, severity: "severe" | "light") => report[severity].map((issue) => issue.code);

describe("level-form content gate (WP5)", () => {
  it("passes a clean form", () => {
    const report = evaluateLevelFormQuality(gateInput());
    expect(report).toEqual({ passed: true, severe: [], light: [] });
  });

  describe("confirmed wrong key 1: how many sessions (warning)", () => {
    it("warns when the counted key is not stated in the passage", () => {
      const report = evaluateLevelFormQuality(gateInput({ reading: readingWith(WRONG_KEY_HOW_MANY) }));
      expect(report.passed).toBe(true);
      expect(report.light).toEqual([expect.objectContaining({ code: "LEVEL_FORM_HOW_MANY_MISMATCH", section: "reading", questionIndex: 13 })]);
    });
    it("accepts the corrected key (Twice = two listed times, ignoring 7:30 / list numbers)", () => {
      const report = evaluateLevelFormQuality(gateInput({ reading: readingWith({ ...WRONG_KEY_HOW_MANY, correctIndex: 1 }) }));
      expect(codes(report, "light")).not.toContain("LEVEL_FORM_HOW_MANY_MISMATCH");
    });
  });

  describe("confirmed wrong key 2: NOT question", () => {
    it("fails when the NOT key appears in the passage while another option does not", () => {
      const report = evaluateLevelFormQuality(gateInput({ reading: readingWith(WRONG_KEY_NOT_LISTED) }));
      expect(report.passed).toBe(false);
      expect(report.severe).toEqual([expect.objectContaining({ code: "LEVEL_FORM_NOT_QUESTION_KEY", questionIndex: 13 })]);
      expect(report.severe[0]!.message).toContain("Customer complaints");
    });
    it("accepts the corrected key (the only absent option)", () => {
      const report = evaluateLevelFormQuality(gateInput({ reading: readingWith({ ...WRONG_KEY_NOT_LISTED, correctIndex: 3 }) }));
      expect(report.passed).toBe(true);
      expect(report.light).toEqual([]);
    });
    it("fails the two-correct-answers NOT question from the same sample (Monday and Wednesday)", () => {
      const report = evaluateLevelFormQuality(gateInput({ reading: readingWith({ prompt: "Which day is NOT listed for training?", options: ["Thursday", "Friday", "Monday", "Wednesday"], correctIndex: 2 }) }));
      expect(codes(report, "severe")).toEqual(["LEVEL_FORM_NOT_QUESTION_KEY"]);
    });
    it("accepts a key that the text names in a negated sentence, and only warns when unsure", () => {
      const passage = `${B1_HANDOVER_PASSAGE}\nLunch is not included in the training.`;
      const negated = evaluateLevelFormQuality(gateInput({ readingPassage: passage, reading: readingWith({ prompt: "What is not included in the training?", options: ["Room B", "Lunch", "Tablets", "Comments box"], correctIndex: 1 }) }));
      expect(codes(negated, "severe")).toEqual([]);
      const unsure = evaluateLevelFormQuality(gateInput({ reading: readingWith({ prompt: "Which item is NOT mentioned?", options: ["Coffee", "Parking", "Damaged items", "Uniforms"], correctIndex: 0 }) }));
      expect(codes(unsure, "severe")).toEqual([]);
      expect(codes(unsure, "light")).toEqual(["LEVEL_FORM_NOT_QUESTION_AMBIGUOUS"]);
    });
  });

  describe("confirmed wrong key 3: statement about photographs (warning)", () => {
    it("warns when a negated key contradicts the closest passage sentence", () => {
      const report = evaluateLevelFormQuality(gateInput({ readingPassage: B1_RETURNS_PASSAGE, reading: readingWith(WRONG_KEY_PHOTOGRAPHS) }));
      expect(report.light).toEqual([expect.objectContaining({ code: "LEVEL_FORM_STATEMENT_UNSUPPORTED", questionIndex: 13 })]);
    });
    it("accepts the corrected key", () => {
      const report = evaluateLevelFormQuality(gateInput({ readingPassage: B1_RETURNS_PASSAGE, reading: readingWith({ ...WRONG_KEY_PHOTOGRAPHS, correctIndex: 0 }) }));
      expect(report.light).toEqual([]);
    });
  });

  it("fails duplicate options inside a question", () => {
    const reading = neutralQuestions("reading", 40);
    reading[5] = { ...reading[5]!, options: ["Room B", "room b.", "Room C", "Room D"] };
    const report = evaluateLevelFormQuality(gateInput({ reading }));
    expect(report.severe).toEqual([expect.objectContaining({ code: "LEVEL_FORM_DUPLICATE_OPTIONS", questionIndex: 5 })]);
  });

  it("fails a listening script without Part 1–5 labels", () => {
    expect(hasCanonicalLevelFormListeningParts(LISTENING_SCRIPT)).toBe(true);
    expect(hasCanonicalLevelFormListeningParts(LISTENING_SCRIPT.replace("Part 4", "Section 4"))).toBe(false);
    expect(splitLevelFormListeningParts(LISTENING_SCRIPT)).toHaveLength(5);
    const report = evaluateLevelFormQuality(gateInput({ listeningParts: null }));
    expect(codes(report, "severe")).toEqual(["LEVEL_FORM_LISTENING_PARTS"]);
  });

  it("fails duplicate prompts across the form", () => {
    const reading = neutralQuestions("reading", 40);
    reading[30] = { ...reading[30]!, prompt: neutralQuestions("listening", 20)[2]!.prompt.toUpperCase() };
    const report = evaluateLevelFormQuality(gateInput({ reading }));
    expect(report.severe).toEqual([expect.objectContaining({ code: "LEVEL_FORM_DUPLICATE_PROMPT", section: "reading", questionIndex: 30 })]);
  });

  it("does not warn when the key is the unique longest option, however often (answer-length rule removed 13/11)", () => {
    const reading = neutralQuestions("reading", 40).map((question) => ({ ...question, options: question.options.map((option, optionIndex) => optionIndex === question.correctIndex ? `${option}zzzz` : option) }));
    const report = evaluateLevelFormQuality(gateInput({ reading }));
    expect(report.severe).toEqual([]);
    expect(codes(report, "light")).not.toContain("LEVEL_FORM_LONGEST_ANSWER_BIAS");
    expect(report.light.some((issue) => /dài nhất/u.test(issue.message))).toBe(false);
  });

  describe("near-duplicate questions (light)", () => {
    // Pairs observed in the 11/11 re-measure (C1-2 R2/R23, A2-1 R14/R39, B2-3 R9/R20).
    const sample = [
      { prompt: "What caused most delayed consignments per the audit?", options: ["Inconsistent commodity codes", "Late carrier pickups", "Missing invoices", "Weather at the port"], correctIndex: 0 },
      { prompt: "Which problem did the audit identify as the main hold cause?", options: ["Weather at the port", "Late carrier pickups", "Inconsistent commodity codes", "Missing invoices"], correctIndex: 2 },
      { prompt: "Where can staff eat their own food?", options: ["In the meeting room", "In the break room on the third floor", "At their desks", "In the lobby"], correctIndex: 1 },
      { prompt: "Which floor is the break room on?", options: ["Second floor", "Ground floor", "Fourth floor", "Third floor"], correctIndex: 3 },
      { prompt: "What time does the canteen open?", options: ["11:00 a.m.", "10:00 a.m.", "12:00 p.m.", "9:30 a.m."], correctIndex: 0 },
      { prompt: "What time does the IT desk open?", options: ["7:30 a.m.", "8:00 a.m.", "9:00 a.m.", "8:30 a.m."], correctIndex: 1 },
      { prompt: "Who led the internal audit?", options: ["Mr. Duc", "Ms. Ingrid Vos", "Ms. Lan", "Mr. Tran"], correctIndex: 1 },
      { prompt: "Who acknowledged the strain on the Hanoi team?", options: ["Mr. Tran", "Ms. Lan", "Mr. Duc", "Ms. Ingrid Vos"], correctIndex: 3 }
    ];

    it("finds the same fact asked twice and ignores different facts with a similar shape or the same person", () => {
      expect(levelFormNearDuplicatePairs(sample)).toEqual([[0, 1], [2, 3]]);
    });

    it("adds one light warning per section listing the pairs, without failing the gate", () => {
      const reading = neutralQuestions("reading", 40);
      sample.forEach((question, index) => { reading[index * 5] = question; });
      const report = evaluateLevelFormQuality(gateInput({ reading }));
      expect(report.passed).toBe(true);
      const warning = report.light.find((issue) => issue.code === "LEVEL_FORM_NEAR_DUPLICATE_QUESTIONS");
      expect(warning).toEqual(expect.objectContaining({ severity: "light", section: "reading" }));
      expect(warning!.message).toContain("2 cặp");
      expect(warning!.message).toContain("câu 1 và 6");
      expect(warning!.message).toContain("câu 11 và 16");
    });

    it("leaves exact duplicate prompts to the severe rule", () => {
      expect(levelFormNearDuplicatePairs([sample[0]!, { ...sample[0]!, options: [...sample[0]!.options].reverse(), correctIndex: 3 }])).toEqual([]);
    });
  });

  it("fails answer keys bunched on one position", () => {
    const report = evaluateLevelFormQuality(gateInput({ listening: neutralQuestions("listening", 20, () => 1) }));
    expect(report.severe).toEqual([expect.objectContaining({ code: "LEVEL_FORM_ANSWER_POSITION_BIAS", section: "listening" })]);
  });

  it("warns (light) when parts reuse the same organisation or site", () => {
    const parts = gateInput().listeningParts!.map((part, index) => index === 2 ? `${part} Later the Riverside depot calls back.` : part);
    const report = evaluateLevelFormQuality(gateInput({ listeningParts: parts }));
    expect(report.passed).toBe(true);
    expect(report.light).toEqual([expect.objectContaining({ code: "LEVEL_FORM_REPEATED_CONTEXT", section: "form" })]);
    expect(report.light[0]!.message).toContain("Riverside");
  });

  it("builds the same input from AI output and from saved sections", () => {
    const reading = readingWith(WRONG_KEY_NOT_LISTED);
    const fromOutput = levelFormQualityInputFromOutput({ listening: { script: LISTENING_SCRIPT, questions: neutralQuestions("listening", 20) }, reading: { passage: B1_HANDOVER_PASSAGE, questions: reading } });
    const letters = ["A", "B", "C", "D"];
    const toTasks = (questions: typeof reading) => questions.map((question) => ({ prompt: question.prompt, responseType: "single_choice", options: question.options.map((label, index) => ({ value: letters[index]!, label })), correctAnswer: letters[question.correctIndex]! }));
    const parts = splitLevelFormListeningParts(LISTENING_SCRIPT);
    const fromSections = levelFormQualityInputFromSections([
      { code: "listening", groups: parts.map((part, index) => ({ stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text: part.script }] }, tasks: toTasks(neutralQuestions("listening", 20).slice(index * 4, index * 4 + 4)) })) },
      { code: "reading", groups: [0, 1, 2, 3].map((index) => ({ ...(index === 0 ? { stimulus: { type: "passage", text: B1_HANDOVER_PASSAGE } } : {}), tasks: toTasks(reading.slice(index * 10, index * 10 + 10)) })) }
    ]);
    expect(fromSections.listening).toEqual(fromOutput.listening);
    expect(fromSections.reading).toEqual(fromOutput.reading);
    expect(fromSections.readingPassage).toBe(fromOutput.readingPassage);
    expect(fromSections.listeningParts).toEqual(fromOutput.listeningParts);
    expect(evaluateLevelFormQuality(fromSections)).toEqual(evaluateLevelFormQuality(fromOutput));
  });
});
