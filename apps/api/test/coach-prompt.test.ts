import { describe, expect, it } from "vitest";
import { coachPersonaPrompt } from "../src/modules/coach/routes.js";
import { prototypePromptDefaults } from "../../../packages/database/src/prototype-prompts.js";

describe("Coach prompt safeguards", () => {
  it("does not turn a correct but brief answer into a correction", () => {
    const prompt = coachPersonaPrompt("Base coach prompt", "informal");

    expect(prompt).toContain("Only put genuine language errors in corrections");
    expect(prompt).toContain("Do not rewrite a correct answer merely to make it longer");
    expect(prompt).toContain('return corrections: [] and correctedText: ""');
    expect(prompt).toContain("seasonReplyTranslation");
    expect(prompt).toContain("corrections[].translation");
    expect(prompt).toContain("rubric evidence and improvement must refer only to the learner's latest message");
    expect(prompt).not.toContain("replyTranslation");
    expect(prompt).not.toContain("suggestions[].translation");
    expect(prompt).toContain("natural Vietnamese translation");
    expect(prompt).not.toContain("explanation must include a natural Vietnamese translation");
  });

  it("keeps translations in dedicated fields in the canonical coach prompt", () => {
    expect(prototypePromptDefaults.coach).toContain("seasonReplyTranslation");
    expect(prototypePromptDefaults.coach).toContain("corrections[].translation");
    expect(prototypePromptDefaults.coach).not.toContain("replyTranslation");
    expect(prototypePromptDefaults.coach).not.toContain("suggestions[].translation");
    expect(prototypePromptDefaults.coach).not.toContain("explanation must include a natural Vietnamese translation");
  });
});
