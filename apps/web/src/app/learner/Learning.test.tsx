// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerLesson } from "./Learning.js";

afterEach(cleanup);

describe("learner lesson study content", () => {
  it("fills legacy lesson content with the study guidance and vocabulary affordances", () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-602",
      title: "Past simple: I joined…",
      dayNumber: 2,
      durationMinutes: 10,
      cefr: "A2",
      content: {
        parts: [
          { code: "objective", title: "Mục tiêu bài học", content: { text: "Kể ngắn về công việc." } },
          { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] } },
          { code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "new", type: "tính từ", pronunciation: "/njuː/", meaning: "mới", examples: ["new here", "a new job", "a new team"] }] } },
          { code: "grammar", title: "Ngữ pháp", content: { formula: "I am from + nơi", usage: "Dùng khi làm quen." } },
          { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", words: ["I", "nice", "time"], instruction: "Luyện âm mẫu." } }
        ]
      },
      progress: { status: "not_started", completedPartCodes: [], evidence: {}, updatedAt: "2026-10-15T00:00:00Z" }
    } as any;
    const actions = {
      navigate: vi.fn(),
      speak,
      saveLessonProgress: vi.fn()
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);

    expect(screen.getAllByRole("list", { name: "Các bước thực hiện" })[0]!).toHaveTextContent("Bấm “Đã học xong” để mở phần Bài tập");
    expect(screen.getAllByRole("list", { name: "Các bước thực hiện" })[0]!.querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByText("tính từ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "new here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: I" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: nice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chi tiết từ liên quan" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "new here" }));
    expect(speak).toHaveBeenCalledWith("new here");
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ phát âm: I" }));
    expect(speak).toHaveBeenCalledWith("I");
    fireEvent.click(screen.getByRole("button", { name: "Chi tiết từ liên quan" }));
    expect(screen.getByRole("dialog", { name: "Chi tiết từ liên quan" })).toHaveTextContent("Chưa có chi tiết từ liên quan");
  });

  it("keeps practice locked when a retryable answer exists without study confirmation", () => {
    const retryableLesson = {
      id: "lesson-gated",
      title: "Bài có gate",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
        { code: "listening", title: "Nghe", content: { prompt: "Chọn A", options: ["A", "B"] } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: [],
        evidence: { listening: { attempts: 1, status: "wrong_retry", answer: "B" } }
      }
    } as any;
    render(<LearnerLesson view={{ lesson: retryableLesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.getByRole("tab", { name: /2\. bài tập/i })).toBeDisabled();
    expect(screen.queryByRole("radio", { name: "A" })).not.toBeInTheDocument();
  });

  it("allows a study-only lesson to complete after the study gate", async () => {
    const user = userEvent.setup();
    const saveLessonProgress = vi.fn().mockResolvedValue(undefined);
    const studyOnlyLesson = {
      id: "lesson-study-only",
      title: "Bài chỉ học",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Đọc nội dung", "Ôn lại ví dụ"] } }
      ] },
      progress: { status: "in_progress", completedPartCodes: [], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson: studyOnlyLesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress } as any} />);

    await user.click(screen.getByRole("button", { name: /đã học xong.*làm bài tập/i }));
    const complete = screen.getByRole("button", { name: /hoàn thành bài/i });
    expect(complete).toBeEnabled();
    await user.click(complete);
    expect(saveLessonProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
  });
});
