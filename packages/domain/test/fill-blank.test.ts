import { describe, expect, it } from "vitest";
import { fillBlankCount, normalizeFillBlankPrompt } from "../src/content/index.js";

/** Real writing output of B1 2026-12 N14 (23/12, lesson 17), 4300 generation_error 13/11 13:25. */
const REAL_THREE_BLANK_PROMPT = "Complete the message with the correct verb forms. Use only one blank for each answer: Yesterday, our team ____ the testing results while the client ____ about the schedule. We also noticed a shortage of staff, so the next review ____ to next week.";
/** The same lesson's earlier passing draft (13/11 13:06). */
const REAL_ONE_BLANK_PROMPT = "Complete the sentence: Last quarter, our team ____ a shortage of testers, so the testing took longer than planned.";

describe("fill-in blanks (B1 N14 writing)", () => {
  it("counts the real three-blank output as three, and the passing draft as one", () => {
    expect(fillBlankCount(REAL_THREE_BLANK_PROMPT)).toBe(3);
    expect(fillBlankCount(REAL_ONE_BLANK_PROMPT)).toBe(1);
  });

  it("counts one run of any length as one blank, like the learner page draws it", () => {
    expect(fillBlankCount("Our team ___ the report.")).toBe(1);
    expect(fillBlankCount("Our team ______ the report.")).toBe(1); // was 2 with /___/g
    expect(fillBlankCount("Our team _ _ _ the report.")).toBe(1);
    expect(fillBlankCount("Our team --- the report.")).toBe(1);
    expect(fillBlankCount("A year-end report.")).toBe(0);
    expect(fillBlankCount("Our __ team.")).toBe(0);
  });

  it("normalises common AI blank variants to ____ and leaves ordinary text alone", () => {
    expect(normalizeFillBlankPrompt("Our team ________ the report.")).toBe("Our team ____ the report.");
    expect(normalizeFillBlankPrompt("Our team [blank] the report.")).toBe("Our team ____ the report.");
    expect(normalizeFillBlankPrompt("Our team (gap) the report.")).toBe("Our team ____ the report.");
    expect(normalizeFillBlankPrompt("Our team … the report.")).toBe("Our team ____ the report.");
    expect(normalizeFillBlankPrompt("Our team ... the report.")).toBe("Our team ____ the report.");
    expect(normalizeFillBlankPrompt(REAL_ONE_BLANK_PROMPT)).toBe(REAL_ONE_BLANK_PROMPT);
    expect(normalizeFillBlankPrompt("Wait... the report is late.")).toBe("Wait... the report is late.");
    expect(fillBlankCount(normalizeFillBlankPrompt(REAL_THREE_BLANK_PROMPT))).toBe(3);
  });
});
