import { describe, expect, it } from "vitest";
import { coachFallbackFollowUp, coachPersonaPrompt, coachPracticeTurnPolicy, coachReaskFollowUp } from "../src/modules/coach/routes.js";
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
    expect(prompt).toContain("suggestedAnswer gives an idea for answering the final in-character question/request");
    expect(prompt).toContain("ANSWER IDEA");
    expect(prompt).toContain("never be a sentence the learner can copy");
    expect(prompt).toContain("SAME QUESTION UNTIL ANSWERED");
    expect(prompt).not.toContain("use one concise learner-level example");
    expect(prompt).toContain("INSUFFICIENT means no meaningful attempt and requires meaning score 0");
    expect(prompt).toContain("ROLEPLAY FIRST");
    expect(prompt).toContain("Never write teacher, examiner, or coaching narration");
    expect(prompt).toContain("natural in-character question or request");
    expect(prompt).toContain("corrections[].reason must be one concise explanation of at most 12 words");
    expect(prompt).not.toContain("explanation must include a natural Vietnamese translation");
  });

  it("keeps fallback replies in character and avoids asking for an already stated role", () => {
    const reply = coachFallbackFollowUp(
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

  it("never builds a fallback question from a word picked out of the learner reply", () => {
    for (const message of ["what do you mean?", "i don't know", "I sent the report"]) {
      const reply = coachFallbackFollowUp(message, "What did you send to the client?", "Handling Client Feedback Meetings", "formal",
        ["What did you send to the client?"]);
      expect(reply.seasonReply).not.toMatch(/I hear you mention|next step for “(?:mean|know|report)”/u);
      expect(reply.nextQuestion).not.toBe("What did you send to the client?");
    }
  });

  it("re-asks the same open question for a gated reply instead of inventing a new one", () => {
    const reply = coachReaskFollowUp({
      kind: "insufficient", currentQuestion: "What did you send to the client?",
      currentQuestionTranslation: "Bạn đã gửi gì cho khách hàng?", persona: "formal", cefr: "A1"
    });
    expect(reply.nextQuestion).toBe("What did you send to the client?");
    expect(reply.seasonReply).toBe("I would like to hear a little more detail. What did you send to the client?");
    expect(reply.seasonReplyTranslation).toContain("Bạn đã gửi gì cho khách hàng?");
    expect(reply.suggestedAnswer).toBeUndefined();
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

  it("WP4 (e, i) gives Season the code word count and this month's unopened vocabulary", () => {
    const policy = coachPracticeTurnPolicy("B1", "Handling Client Feedback Meetings", ["What did the client say?"], {
      learnerWordCount: 12,
      unopenedVocabulary: ["deadline", "agenda", "deadline", " "]
    });

    expect(policy).toContain("The learner message has exactly 12 words, counted by code");
    expect(policy).toContain("never state a different word count in noteVi");
    expect(policy).toContain(`MONTH VOCABULARY: This month's lesson words the learner has not used yet: ["deadline","agenda"]`);
    expect(policy).toContain("never list, define, or teach these words in seasonReply");
    expect(policy).toContain('Exact questions already asked in this topic: ["What did the client say?"]');
    expect(coachPracticeTurnPolicy("B1", "Topic")).not.toMatch(/MONTH VOCABULARY|WORD COUNT/u);
  });

  it("round 2: lists only earlier questions as forbidden and lets Season re-ask the open question", () => {
    const policy = coachPracticeTurnPolicy("A1", "Handling Client Feedback Meetings",
      ["What did the client say?", "Could you tell me when we can expect the final report?"],
      { currentQuestion: "Could you tell me when we can expect the final report?" });
    expect(policy).toContain('Exact questions already asked in this topic: ["What did the client say?"]');
    expect(policy).toContain("When the learner did not answer currentQuestion, ask currentQuestion again");
  });

  it("round 2: a Formal prompt treats learner slang as a register deduction, not off_topic", () => {
    const formal = coachPersonaPrompt("Base coach prompt", "formal", "B1");
    expect(formal).toContain("LEARNER REGISTER");
    expect(formal).toContain("never a reason for off_topic");
    expect(formal).toContain("lower only rubric.meaning (appropriateness) to at most 3");
    expect(coachPersonaPrompt("Base coach prompt", "informal", "B1")).not.toContain("LEARNER REGISTER");
  });
});
