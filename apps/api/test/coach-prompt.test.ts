import { describe, expect, it } from "vitest";
import { coachPersonaPrompt } from "../src/modules/coach/routes.js";
import { prototypePromptDefaults } from "../../../packages/database/src/prototype-prompts.js";

describe("Coach prompt safeguards", () => {
  it("does not turn a correct but brief answer into a correction", () => {
    const prompt = coachPersonaPrompt("Base coach prompt", "informal");

    expect(prompt).toContain("Only put genuine language errors in suggestions");
    expect(prompt).toContain("Do not rewrite a correct answer merely to make it longer");
    expect(prompt).toContain('return suggestions: [] and correctedText: ""');
    expect(prompt).toContain("replyTranslation");
    expect(prompt).toContain("suggestions[].translation");
    expect(prompt).toContain("natural Vietnamese translation");
    expect(prompt).not.toContain("explanation must include a natural Vietnamese translation");
  });

  it("keeps translations in dedicated fields in the canonical coach prompt", () => {
    expect(prototypePromptDefaults.coach).toContain("replyTranslation");
    expect(prototypePromptDefaults.coach).toContain("suggestions[].translation");
    expect(prototypePromptDefaults.coach).not.toContain("explanation must include a natural Vietnamese translation");
  });
});
