import { describe, expect, it } from "vitest";
import { AiGatewayError, AiProviderError } from "@e4s/ai";
import { prototypePromptDefaults } from "../../../packages/database/src/prototype-prompts.js";
import { lessonProductiveGradingDefaultPrompt } from "@e4s/ai";
import { buildLessonProductiveGradingInput, isRetryableGradingError, lessonFeedbackLanguage } from "../src/modules/learning/productive-grading.js";

const monthlyLesson = {
  cefr: "B1" as const,
  content: {
    parts: [
      { code: "vocabulary" as const, title: "", content: { items: [{ word: "client" }, { word: "document" }, { word: "problem" }] } },
      { code: "grammar" as const, title: "", content: { formula: "I am / He is / They are + adjective" } },
      { code: "pronunciation" as const, title: "", content: {
        focus: "/m/", words: [{ word: "meeting", ipa: "/ˈmiːtɪŋ/" }],
        reviewTargets: [
          { focus: "/m/", words: [{ word: "meeting", ipa: "/ˈmiːtɪŋ/" }, { word: "team" }] },
          { focus: "/n/", words: [{ word: "news" }, { word: "meeting" }] }
        ]
      } }
    ]
  }
};

describe("lesson productive grading input", () => {
  it("uses the day's vocabulary, grammar and pronunciation item for a monthly Speaking task", () => {
    const input = buildLessonProductiveGradingInput(monthlyLesson, "speaking", {
      prompt: "Talk for 30 seconds about the project.", sample: "The client is happy."
    }, { text: "The client is happy.", uncertainWords: [] });
    expect(input).toEqual({
      mode: "speaking", cefr: "B1", feedbackLanguage: "en",
      task: {
        prompt: "Talk for 30 seconds about the project.", sample: "The client is happy.",
        requiredWords: ["client", "document", "problem"], minRequiredWords: 2,
        grammarFocus: "I am / He is / They are + adjective"
      },
      pronunciation: { focus: "/m/, /n/", words: [{ word: "meeting", ipa: "/ˈmiːtɪŋ/" }, { word: "team" }, { word: "news" }] },
      response: { text: "The client is happy.", uncertainWords: [] }
    });
  });

  it("reads explicit items (read-aloud passage, required words) and leaves pronunciation out of Writing", () => {
    const speaking = buildLessonProductiveGradingInput(monthlyLesson, "speaking", {
      items: [
        { id: "s3", prompt: "Read aloud.", passage: "We got the news about the new team today." },
        { id: "s4", prompt: "Describe a client meeting.", requiredWords: ["meeting", "client", "send"], minRequiredWords: 2 }
      ]
    }, { text: "x y", uncertainWords: [] });
    expect(speaking.task).toMatchObject({
      prompt: "Read aloud. / Describe a client meeting.", passage: "We got the news about the new team today.",
      requiredWords: ["meeting", "client", "send"], minRequiredWords: 2
    });
    const writing = buildLessonProductiveGradingInput({ ...monthlyLesson, cefr: "A1" }, "writing", { prompt: "Viết 2 câu." }, { text: "I am ready.", uncertainWords: [] });
    expect(writing).not.toHaveProperty("pronunciation");
    expect(writing.feedbackLanguage).toBe("vi");
  });

  it("chooses the feedback language by level and retries only transient provider failures", () => {
    expect(lessonFeedbackLanguage("A2")).toBe("vi");
    expect(lessonFeedbackLanguage("C1")).toBe("en");
    expect(isRetryableGradingError(new AiProviderError("AI_PROVIDER_UNAVAILABLE", true))).toBe(true);
    expect(isRetryableGradingError(new AiGatewayError("AI_TIMEOUT"))).toBe(true);
    expect(isRetryableGradingError(new AiGatewayError("AI_OUTPUT_INVALID"))).toBe(false);
    expect(isRetryableGradingError(Object.assign(new Error("AI_STT_UNAVAILABLE"), { code: "AI_STT_UNAVAILABLE" }))).toBe(false);
  });

  it("keeps the database prompt default identical to the AI package default", () => {
    expect(prototypePromptDefaults.lessonProductive).toBe(lessonProductiveGradingDefaultPrompt);
  });
});
