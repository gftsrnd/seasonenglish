// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { learnerLessonCopy } from "../shared/lesson/language.js";
import { withoutGrammarStepLabel } from "../shared/lesson/presentation.js";
import { LearnerLesson, SharedLessonPartContent } from "./Learning.js";

afterEach(cleanup);

const grammarPart = {
  code: "grammar",
  title: "Ngữ pháp",
  content: {
    formula: "Subject + am/is/are + (not) + complement → Question: Am/Is/Are + subject + complement? → Short answer: Yes, subject + be / No, subject + be + not.",
    text: "Tiếng Việt không dùng to be trong câu như 'Tôi là nhân viên', nên dễ quên. Hãy kiểm tra chủ ngữ: I dùng am, he/she/it dùng is, we/you/they dùng are.",
    objective: "Bước 3 (Lỗi thường gặp): Tìm và sửa lỗi thiếu to be hoặc dùng sai dạng am/is/are trong các câu giới thiệu.",
    examples: ["I am Minh, the new developer on the screen project."]
  }
} as const;

function grammarBlock(container: HTMLElement): HTMLElement {
  return container.querySelector(".lesson-part--grammar, .lesson-study-block") as HTMLElement;
}

describe("learner grammar block", () => {
  it("hides the roadmap step label and lays the formula chain and explanation out in short lines", () => {
    const lesson = {
      id: "lesson-grammar-block", title: "To be", dayNumber: 6, weekNumber: 2, weekTopic: "Meetings", durationMinutes: 10, cefr: "A1",
      content: { parts: [grammarPart] },
      progress: { status: "in_progress", completedPartCodes: [], evidence: {} }
    } as any;
    const { container } = render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    const block = grammarBlock(container);
    expect(block).not.toHaveTextContent(/Bước 3/);
    expect(block).not.toHaveTextContent(/Lỗi thường gặp/);

    const formula = block.querySelector(".lesson-study-focus strong")!;
    expect(Array.from(formula.querySelectorAll(".lesson-grammar-formula-line")).map((line) => line.textContent)).toEqual(["Subject + am/is/are + (not) + complement", "Question: Am/Is/Are + subject + complement?", "Short answer: Yes, subject + be / No, subject + be + not."]);
    expect(formula).not.toHaveTextContent("→");
    expect(formula).toHaveTextContent("Question: Am/Is/Are + subject + complement?");

    const paragraphs = Array.from(block.querySelectorAll("p.lesson-study-explanation")).map((node) => node.textContent);
    // The day-plan objective ("Tìm và sửa lỗi …") is roadmap metadata: learners see only the teaching explanation.
    expect(block).not.toHaveTextContent(/Tìm và sửa lỗi/);
    expect(paragraphs).toEqual([
      "Hãy kiểm tra chủ ngữ: I dùng am, he/she/it dùng is, we/you/they dùng are.",
      "Tiếng Việt không dùng to be trong câu như 'Tôi là nhân viên', nên dễ quên."
    ]);
  });

  it("strips every step label form", () => {
    expect(withoutGrammarStepLabel("Bước 1 - Nhận biết: Tìm cấu trúc was/were.")).toBe("Tìm cấu trúc was/were.");
    expect(withoutGrammarStepLabel("Step A1 (Identify): notice the present simple.")).toBe("Notice the present simple.");
    expect(withoutGrammarStepLabel("Bước 2 – Biến thể: Luyện câu phủ định.")).toBe("Luyện câu phủ định.");
    expect(withoutGrammarStepLabel("Step 2: use it.")).toBe("Use it.");
    expect(withoutGrammarStepLabel("A3 Bước 2 - Biến thể: Luyện câu phủ định.")).toBe("Luyện câu phủ định.");
    expect(withoutGrammarStepLabel("K1: Step 3 (Mixed): combine both topics.")).toBe("Combine both topics.");
    expect(withoutGrammarStepLabel("A3 is a level code, not a step label.")).toBe("A3 is a level code, not a step label.");
  });
});
