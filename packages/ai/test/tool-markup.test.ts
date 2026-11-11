import { describe, expect, it } from "vitest";
import { coachInputSchema } from "../src/schemas.js";
import { stripLeakedToolMarkup, stripLeakedToolMarkupText } from "../src/tool-markup.js";

describe("stripLeakedToolMarkup", () => {
  it("cuts a leaked closing field tag and the next tool parameter out of a string", () => {
    expect(stripLeakedToolMarkupText(
      "Cảm ơn anh/chị về phản hồi đó.</seasonReplyTranslation>\n<parameter name=\"nextQuestion\">Could you tell me more?",
      "seasonReplyTranslation"
    )).toBe("Cảm ơn anh/chị về phản hồi đó.");
    expect(stripLeakedToolMarkupText("Xin chào.</seasonReplyTranslation>", "seasonReplyTranslation")).toBe("Xin chào.");
    expect(stripLeakedToolMarkupText("Text <invoke name=\"x\">rest")).toBe("Text");
  });

  it("leaves ordinary strings and unrelated markup unchanged", () => {
    expect(stripLeakedToolMarkupText("Use <b>deadline</b>", "body")).toBe("Use <b>deadline</b>");
    expect(stripLeakedToolMarkupText("A < B and C > D")).toBe("A < B and C > D");
  });

  it("cleans nested objects and arrays and keeps untouched values by reference", () => {
    const clean = { a: ["x", { b: 1 }] };
    expect(stripLeakedToolMarkup(clean)).toBe(clean);
    expect(stripLeakedToolMarkup({ items: [{ text: "Hi.</text>\n<parameter name=\"next\">y" }], n: 2, ok: true }))
      .toEqual({ items: [{ text: "Hi." }], n: 2, ok: true });
  });
});

describe("coachInputSchema", () => {
  it("keeps priorQuestions instead of silently dropping them", () => {
    const parsed = coachInputSchema.parse({
      message: "We finished the design.", cefr: "A2", persona: "formal", mode: "practice",
      scenario: "Project update", currentQuestion: "How is the project going?",
      priorQuestions: ["How is the project going?"], priorTurns: []
    });
    expect(parsed.priorQuestions).toEqual(["How is the project going?"]);
  });
});
