import { describe, expect, it } from "vitest";
import { coachInsufficientFollowUp, coachPersonaPrompt } from "../src/modules/coach/routes.js";
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
    expect(prompt).toContain("suggestedAnswer must directly answer the final in-character question/request");
    expect(prompt).toContain("INSUFFICIENT means no meaningful attempt and requires meaning score 0");
    expect(prompt).toContain("ROLEPLAY FIRST");
    expect(prompt).toContain("Never write teacher, examiner, or coaching narration");
    expect(prompt).toContain("natural in-character question or request");
    expect(prompt).toContain("corrections[].reason must be one concise explanation of at most 12 words");
    expect(prompt).not.toContain("explanation must include a natural Vietnamese translation");
  });

  it("keeps insufficient-turn replies in character and avoids asking for an already stated role", () => {
    const reply = coachInsufficientFollowUp(
      "I am a project manager.",
      "What is your role?",
      "Handling Client Feedback Meetings",
      "informal",
      ["What is your role?", "Which project are you working on this week?"]
    );

    expect(reply.nextQuestion).toBe("What task is taking most of your time today?");
    expect(reply.seasonReply).toContain("I'm glad you told me about your work.");
    expect(reply.seasonReply).toContain(reply.nextQuestion);
    expect(reply.seasonReply).not.toMatch(/write a complete English sentence|what is your role/i);
    expect(reply.seasonReplyTranslation).toContain("Cảm ơn");
  });

  it("asks about an actual detail from a short learner reply and honors earlier questions", () => {
    const reply = coachInsufficientFollowUp(
      "I sent the report",
      "What did you send to the client?",
      "Handling Client Feedback Meetings",
      "formal",
      ["What did you send to the client?", "What is the next step for “report”?"]
    );

    expect(reply.nextQuestion).toBe("How does “report” affect the plan?");
    expect(reply.seasonReply).toContain("“report”");
    expect(reply.nextQuestion).not.toBe("What did you send to the client?");
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
