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
    expect(prompt).toContain("suggestedAnswer must directly answer nextQuestion");
    expect(prompt).toContain("INSUFFICIENT means no meaningful attempt and requires meaning score 0");
    expect(prompt).not.toContain("explanation must include a natural Vietnamese translation");
  });

  it("keeps translations in dedicated fields in the canonical coach prompt", () => {
    expect(prototypePromptDefaults.coach).toContain("seasonReplyTranslation");
    expect(prototypePromptDefaults.coach).toContain("corrections[].translation");
    expect(prototypePromptDefaults.coach).not.toContain("replyTranslation");
    expect(prototypePromptDefaults.coach).not.toContain("suggestions[].translation");
    expect(prototypePromptDefaults.coach).not.toContain("explanation must include a natural Vietnamese translation");
  });

  it("adds CEFR-aware guidance when cefr is provided and ASR transcript tolerance when audio is attached", () => {
    const a2Prompt = coachPersonaPrompt("Base coach prompt", "informal", "A2");
    expect(a2Prompt).toContain("CEFR LEVEL (A2):");
    expect(a2Prompt).toContain("high-frequency vocabulary");
    expect(a2Prompt).not.toContain("ASR / SPOKEN TRANSCRIPT TOLERANCE:");

    const b2AudioPrompt = coachPersonaPrompt("Base coach prompt", "formal", "B2", { artifactKey: "coach/turn-audio.webm" });
    expect(b2AudioPrompt).toContain("CEFR LEVEL (B2):");
    expect(b2AudioPrompt).toContain("connected clauses");
    expect(b2AudioPrompt).toContain("ASR / SPOKEN TRANSCRIPT TOLERANCE:");
    expect(b2AudioPrompt).toContain("Ignore speech-recognition punctuation, capitalization, and minor filler words");
  });
});
