import { describe, expect, it } from "vitest";
import {
  gradeLessonAnswer,
  validateGeneratedFeedback,
  validateLessonObjectives,
  validateLexicalRelation
} from "../src/content/index.js";

describe("lesson generation quality gates", () => {
  it("accepts measurable SWBAT objectives with complete assessment coverage", () => {
    expect(validateLessonObjectives({
      cefr: "A2",
      explanationLanguage: "vi",
      assessmentCodes: ["listening", "speaking"],
      objectives: [
        { type: "content", text: "SWBAT identify two meeting-time details after listening.", condition: "after listening", criterion: "two details", assessmentCode: "listening" },
        { type: "language", text: "SWBAT ask for a meeting time in one complete sentence.", condition: "in a role-play", criterion: "one complete sentence", assessmentCode: "speaking" }
      ]
    })).toEqual({ valid: true, issues: [] });
  });

  it("rejects vague objectives, wrong language policy and uncovered assessments", () => {
    const result = validateLessonObjectives({
      cefr: "B1",
      explanationLanguage: "vi",
      assessmentCodes: ["reading", "writing"],
      objectives: [
        { type: "content", text: "Understand workplace email.", condition: "", criterion: "", assessmentCode: "reading" },
        { type: "content", text: "SWBAT know useful words.", condition: "after class", criterion: "well", assessmentCode: "reading" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      "objectives_must_start_with_swbat", "objective_verb_not_observable", "exactly_one_content_objective",
      "missing_condition_or_criterion", "assessment_coverage_gap:writing", "wrong_explanation_language"
    ]));
  });

  it("only accepts same-sense, same-part-of-speech lexical relations", () => {
    expect(validateLexicalRelation({ target: "brief", targetPartOfSpeech: "adjective", relation: "concise", relationPartOfSpeech: "adjective", kind: "synonym", sameSense: true, substitutableInContext: true })).toBe(true);
    expect(validateLexicalRelation({ target: "decide", targetPartOfSpeech: "verb", relation: "decision", relationPartOfSpeech: "noun", kind: "synonym", sameSense: true, substitutableInContext: false })).toBe(false);
    expect(validateLexicalRelation({ target: "available", targetPartOfSpeech: "adjective", relation: "busy", relationPartOfSpeech: "adjective", kind: "antonym", sameSense: true, substitutableInContext: true })).toBe(true);
  });

  it("normalizes objective answers and keeps unsupported open answers for review", () => {
    expect(gradeLessonAnswer({ kind: "objective", answer: "  YES, please! ", acceptedAnswers: ["Yes please"] })).toEqual({ status: "correct", correct: true });
    expect(gradeLessonAnswer({ kind: "self_writing", answer: "Okay", acceptedAnswers: [], aiAvailable: true })).toEqual({ status: "invalid", correct: false, reason: "minimum_two_words" });
    expect(gradeLessonAnswer({ kind: "open", answer: "Could we move it to Friday?", acceptedAnswers: [], aiAvailable: false })).toEqual({ status: "manual_review", correct: null });
  });

  it("rejects feedback that invents an error not present in evidence", () => {
    expect(validateGeneratedFeedback({ answer: "I can join on Friday.", feedback: "Good: your sentence is clear.", citedError: null })).toBe(true);
    expect(validateGeneratedFeedback({ answer: "I can join on Friday.", feedback: "Fix the past tense error.", citedError: "joined" })).toBe(false);
  });
});
