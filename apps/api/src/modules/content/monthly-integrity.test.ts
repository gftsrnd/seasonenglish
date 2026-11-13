import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { monthlyLessonIntegrityIssues, withMonthlyIntegrityIssues } from "./monthly-integrity.js";
import { dailyGrammarQuestionProblems } from "./monthly-quality.js";

/** Read-only copy of the 4175 A1 2026-12 day 13 (17/12, "Bài 11") draft whose "Vẫn duyệt" was refused on 13/11. */
const day13 = JSON.parse(readFileSync(new URL("../../../test/fixtures/a1-2026-12-day13-grammar-answer.json", import.meta.url), "utf8")) as {
  content: { parts: Array<{ code: string; content: Record<string, unknown> }> };
};
type GrammarItem = { id: string; prompt: string; options: string[]; answer: string; explanation: string };
const day13Parts = () => structuredClone(day13.content.parts);
const grammarItems = (parts: ReturnType<typeof day13Parts>) => parts.find((part) => part.code === "grammar")!.content.items as GrammarItem[];

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
    expect(messages).toEqual(expect.arrayContaining(["Nói: thiếu phần này", "Đọc: có đáp án không nằm trong các lựa chọn", "Dùng từ: chưa có câu hỏi"]));
  });

  it("blocks a listening part with nothing to play and a review variant whose answer is not an option", () => {
    const daily = dailyParts().map((part) => part.code === "listening" ? { ...part, content: { ...choice() } } : part);
    expect(monthlyLessonIntegrityIssues("new", daily).map((issue) => issue.component)).toEqual(["listening"]);
    const review = reviewParts().map((part) => part.code === "word_use" ? { ...part, content: { items: [{ id: "u1", ...choice(), variants: [{ id: "u1-v1", ...choice({ answer: "Nothing" }) }] }] } } : part);
    expect(monthlyLessonIntegrityIssues("review", review).map((issue) => issue.message)).toEqual(["Dùng từ: câu 1 bản làm lại 1 có đáp án không nằm trong các lựa chọn"]);
  });

  it("does not treat a language or translation problem as a structural one", () => {
    const parts = dailyParts().map((part) => part.code === "reading" ? { ...part, content: { ...part.content, prompt: "What is high?" } } : part);
    expect(monthlyLessonIntegrityIssues("new", parts)).toEqual([]);
  });
});

describe("4175 A1 2026-12 day 13: the grammar answer outside its options (13/11)", () => {
  it("names grammar practice question 4 (answer \"his\", options my/mine/me/I) and nothing else", () => {
    expect(grammarItems(day13Parts())[3]).toMatchObject({ answer: "his", options: ["my", "mine", "me", "I"] });
    expect(monthlyLessonIntegrityIssues("new", day13Parts())).toEqual([
      { component: "grammar", message: "Ngữ pháp: câu luyện 4 có đáp án không nằm trong các lựa chọn", item: 4 }
    ]);
  });

  it("is clear once question 4 offers its answer, as the editor saves it", () => {
    const parts = day13Parts();
    grammarItems(parts)[3]!.options = ["his", "mine", "me", "I"];
    expect(monthlyLessonIntegrityIssues("new", parts)).toEqual([]);
  });

  it("is not a false positive: case, spacing and typographic apostrophes still match", () => {
    const parts = day13Parts();
    const items = grammarItems(parts);
    items[0]!.answer = "Anna\u2019s  desk";
    items[1]!.answer = " he ";
    items[3]!.options = ["His", "mine", "me", "I"];
    expect(monthlyLessonIntegrityIssues("new", parts)).toEqual([]);
    // The quality gate uses the same rule: only question 4's real mismatch is ever reported.
    expect(items.map((item) => dailyGrammarQuestionProblems(item))).toEqual([[], [], [], [], []]);
    expect(dailyGrammarQuestionProblems(grammarItems(day13Parts())[3]!)).toEqual(['answer "his" is not one of the options']);
  });

  it("annotates the Operator overview so the page can explain the block before any click", () => {
    type Lesson = Parameters<typeof withMonthlyIntegrityIssues>[0]["frameworks"][number]["lessons"][number];
    const overview: { frameworks: Array<{ lessons: Lesson[] }> } = { frameworks: [{ lessons: [
      { kind: "new" as const, status: "failed", content: { parts: day13Parts() } },
      { kind: "new" as const, status: "approved", content: { parts: day13Parts() } },
      { kind: "new" as const, status: "draft", content: { parts: dailyParts() } }
    ] }] };
    const [failed, approved, playable] = withMonthlyIntegrityIssues(overview).frameworks[0]!.lessons;
    expect(failed!.integrityIssues).toEqual([expect.objectContaining({ component: "grammar", item: 4 })]);
    expect(approved).not.toHaveProperty("integrityIssues");
    expect(playable).not.toHaveProperty("integrityIssues");
  });
});
