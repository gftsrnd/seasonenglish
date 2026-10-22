import { describe, expect, it } from "vitest";
import { coachPersonaPrompt } from "../src/modules/coach/routes.js";

describe("Coach prompt safeguards", () => {
  it("does not turn a correct but brief answer into a correction", () => {
    const prompt = coachPersonaPrompt("Base coach prompt", "informal");

    expect(prompt).toContain("Only put genuine language errors in suggestions");
    expect(prompt).toContain("Do not rewrite a correct answer merely to make it longer");
    expect(prompt).toContain('return suggestions: [] and correctedText: ""');
    expect(prompt).toContain("include a natural Vietnamese translation of the corrected sentence");
  });
});
