// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { learnerLessonLabel } from "../learner/ui.js";
import { MONTHLY_REVIEW_SECTIONS } from "./monthly-failure-findings.js";
import { monthlyReviewQuestionLabel, MonthlyReviewPractice } from "./MonthlyReviewPractice.js";

afterEach(cleanup);

const VIETNAMESE = /[ăâđêôơưàáảãạầấậèéẹềếệìíịòóọồốộờớợùúụừứựỳýỵ]/iu;
const parts = [{ code: "listening", content: { items: Array.from({ length: 10 }, (_, index) => ({
  id: `l${index + 1}`, prompt: "Listen and choose the meaning", audioText: `word${index + 1}`,
  options: ["a person who pays for a service", "a written note", "a planned talk", "the last day"], answer: "a person who pays for a service", explanation: "It names a client."
})) } }];

describe("Friday review preview language (16/11, B1 25/12)", () => {
  it("B1: instructions and section titles are English", () => {
    render(<MonthlyReviewPractice parts={parts} english />);
    expect(screen.getByText("Do the 6 sections in order: Listen & recognise words → Word use → Word form → Grammar → Listening & reading → Pronunciation, speaking & writing.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. Listen & recognise words" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "6. Pronunciation, speaking & writing" })).toBeInTheDocument();
    const instructions = screen.getByRole("heading", { name: "Instructions" }).closest("section")!;
    expect(instructions.textContent).not.toMatch(VIETNAMESE);
    for (const section of MONTHLY_REVIEW_SECTIONS) expect(section.titleEn).not.toMatch(VIETNAMESE);
  });

  it("A1-A2: instructions and section titles stay Vietnamese", () => {
    render(<MonthlyReviewPractice parts={parts} />);
    expect(screen.getByText(/^Làm lần lượt 6 phần: Nghe & nhận biết từ → Word use → Word form → Ngữ pháp → Nghe – Đọc hiểu → Phát âm & Nói – Viết\.$/u)).toBeInTheDocument();
  });

  it("labels questions \"Câu N\" in the operator preview, never \"Item N\"", () => {
    render(<MonthlyReviewPractice parts={parts} english />);
    expect(screen.getAllByText(/^Câu 10$/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\bItem \d+/iu)).not.toBeInTheDocument();
  });

  it("learner labels: \"Question N\" from B1, \"Câu N\" at A1-A2 and for operators", () => {
    expect(monthlyReviewQuestionLabel(10, { cefr: "B1" })).toBe("Question 10");
    expect(monthlyReviewQuestionLabel(10, { cefr: "C1" })).toBe("Question 10");
    expect(monthlyReviewQuestionLabel(3, { cefr: "A2" })).toBe("Câu 3");
    expect(monthlyReviewQuestionLabel(3, "operator")).toBe("Câu 3");
    expect(learnerLessonLabel({ dayNumber: 19, kind: "review", teachingLabel: "Ôn tuần 4" }, true)).toBe("Week 4 review");
    expect(learnerLessonLabel({ dayNumber: 19, kind: "review", teachingLabel: "Ôn tuần 4" })).toBe("Ôn tuần 4");
    expect(learnerLessonLabel({ dayNumber: 3, newLessonNumber: 3 }, true)).toBe("Lesson 3");
  });
});
