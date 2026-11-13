import { describe, expect, it } from "vitest";
import { monthlyLessonIntegrityIssues } from "./monthly-integrity.js";

const choice = (extra: Record<string, unknown> = {}) => ({ prompt: "Chọn đáp án đúng: What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost", ...extra });

function dailyParts(): Array<{ code: string; content: Record<string, unknown> }> {
  return [
    { code: "objective", content: { text: "Talk about costs." } },
    { code: "instruction", content: { steps: ["Đọc ví dụ."] } },
    { code: "vocabulary", content: { items: [{ word: "cost" }, { word: "budget" }, { word: "plan" }] } },
    { code: "grammar", content: { formula: "S + V", items: [{ prompt: "They ____ it.", options: ["send", "sends", "sending", "sent"], answer: "send" }] } },
    { code: "pronunciation", content: { focus: "/k/", words: [] } },
    { code: "listening", content: { script: "The cost is high.", ...choice() } },
    { code: "reading", content: { text: "The cost is high.", ...choice() } },
    { code: "writing", content: { prompt: "Viết một câu.", answer: "The cost is high." } },
    { code: "word_class", content: choice() },
    { code: "word_use", content: choice() },
    { code: "speaking", content: { prompt: "Nói một câu.", sample: "The cost is high." } }
  ];
}

function reviewParts(): Array<{ code: string; content: Record<string, unknown> }> {
  const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...choice(), variants: [{ id: `${id}-v1`, ...choice() }], ...extra });
  return [
    ...dailyParts().filter((part) => ["objective", "instruction", "vocabulary", "grammar", "pronunciation"].includes(part.code)),
    { code: "listening", content: { items: [item("l1", { audioText: "cost", variants: [{ id: "l1-v1", audioText: "cost", ...choice() }] })] } },
    { code: "word_use", content: { items: [item("u1")] } },
    { code: "word_class", content: { items: [item("f1")] } },
    { code: "reading", content: { passage: "The cost is high.", items: [item("r1")] } },
    { code: "speaking", content: { items: [{ id: "s1", prompt: "Đọc to câu sau", passage: "The cost is high." }] } }
  ];
}

describe("monthly lesson integrity (checks an override never skips, 13/11)", () => {
  it("passes a playable daily lesson and a playable review", () => {
    expect(monthlyLessonIntegrityIssues("new", dailyParts())).toEqual([]);
    expect(monthlyLessonIntegrityIssues("review", reviewParts())).toEqual([]);
  });

  it("blocks a missing part, an answer outside the options and a question without a prompt", () => {
    const parts = dailyParts().filter((part) => part.code !== "speaking").map((part) => part.code === "reading" ? { ...part, content: { ...part.content, answer: "The budget" } } : part.code === "word_use" ? { ...part, content: { ...part.content, prompt: "" } } : part);
    const messages = monthlyLessonIntegrityIssues("new", parts).map((issue) => issue.message);
    expect(messages).toEqual(expect.arrayContaining(["Nói: thiếu phần này", "Đọc: đáp án không trùng lựa chọn nào", "Dùng từ: chưa có câu hỏi"]));
  });

  it("blocks a listening part with nothing to play and a review variant whose answer is not an option", () => {
    const daily = dailyParts().map((part) => part.code === "listening" ? { ...part, content: { ...choice() } } : part);
    expect(monthlyLessonIntegrityIssues("new", daily).map((issue) => issue.component)).toEqual(["listening"]);
    const review = reviewParts().map((part) => part.code === "word_use" ? { ...part, content: { items: [{ id: "u1", ...choice(), variants: [{ id: "u1-v1", ...choice({ answer: "Nothing" }) }] }] } } : part);
    expect(monthlyLessonIntegrityIssues("review", review).map((issue) => issue.message)).toEqual(["Dùng từ: câu 1 bản làm lại 1 đáp án không trùng lựa chọn nào"]);
  });

  it("does not treat a language or translation problem as a structural one", () => {
    const parts = dailyParts().map((part) => part.code === "reading" ? { ...part, content: { ...part.content, prompt: "What is high?" } } : part);
    expect(monthlyLessonIntegrityIssues("new", parts)).toEqual([]);
  });
});
