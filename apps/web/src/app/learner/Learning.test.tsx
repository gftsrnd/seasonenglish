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
    expect(screen.getByRole("button", { name: "Nghe từ" }).querySelector("svg.lucide-volume-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "new here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: I" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: nice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chi tiết từ liên quan" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "new here" }));
    expect(speak).toHaveBeenCalledWith("new here");
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ phát âm: I" }));
    expect(speak).toHaveBeenCalledWith("I");
    expect(document.querySelector('img[src^="data:image"]')).not.toBeInTheDocument();
  });

  it("loads a real attributed image path for concrete vocabulary", async () => {
    const resolveLessonVocabularyImage = vi.fn().mockResolvedValueOnce({
      status: "available",
      imageUrl: "https://storage.example/colleague.jpg",
      alt: "colleague",
      attribution: {
        creator: "Open artist",
        licence: "CC BY 4.0",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Colleague.jpg"
      }
    }).mockResolvedValueOnce({ status: "unavailable" });
    const lesson = {
      id: "lesson-media",
      title: "Introducing yourself",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [{ code: "vocabulary", title: "Từ vựng", content: { items: [
        { word: "colleague", type: "danh từ", meaning: "đồng nghiệp" },
        { word: "reliable", type: "tính từ", meaning: "đáng tin cậy" }
      ] } }] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), resolveLessonVocabularyImage } as any} />);

    expect(await screen.findByRole("img", { name: "colleague" })).toHaveAttribute("src", "https://storage.example/colleague.jpg");
    expect(resolveLessonVocabularyImage).toHaveBeenCalledWith(0);
    expect(resolveLessonVocabularyImage).toHaveBeenCalledWith(1);
  });

  it("renders real lesson media and a visible placeholder when the next vocabulary image is unavailable", async () => {
    const resolveLessonVocabularyImage = vi.fn()
      .mockResolvedValueOnce({
        status: "available",
        imageUrl: "https://storage.example/new.jpg",
        alt: "new",
        attribution: {
          creator: "Open artist",
          licence: "CC BY 4.0",
          licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:New.jpg"
        }
      })
      .mockResolvedValueOnce({ status: "unavailable" });
    const lesson = {
      id: "lesson-media-states",
      title: "Introducing yourself",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [{ code: "vocabulary", title: "Từ vựng", content: { items: [
        { word: "new", type: "tính từ", meaning: "mới" },
        { word: "from", type: "giới từ", meaning: "từ" }
      ] } }] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), resolveLessonVocabularyImage } as any} />);

    expect(await screen.findByRole("img", { name: "new" })).toHaveAttribute("src", "https://storage.example/new.jpg");
    expect(await screen.findByText("Chưa có ảnh minh hoạ")).toBeInTheDocument();
    expect(resolveLessonVocabularyImage).toHaveBeenNthCalledWith(1, 0);
    expect(resolveLessonVocabularyImage).toHaveBeenNthCalledWith(2, 1);
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
    expect(screen.getByRole("tab", { name: /2\. bài tập/i }).querySelector("svg.lucide-lock-keyhole")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "A" })).not.toBeInTheDocument();
  });

  it("uses an accessible lock icon without an emoji for a locked lesson", () => {
    const lesson = {
      id: "lesson-locked", title: "Bài chưa mở", dayNumber: 2, durationMinutes: 10, cefr: "A2",
      content: { parts: [] }, progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;
    const { container } = render(<LearnerLesson view={{ lesson, lock: { reason: "date", message: "Chưa đến ngày mở", dayNumber: 2, totalLessons: 5, opensAt: "2026-10-16" } }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(container.querySelector("svg.lucide-lock-keyhole")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("🔒");
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

    const finishStudy = screen.getByRole("button", { name: /đã học xong.*làm bài tập/i });
    expect(finishStudy.querySelector("svg.lucide-circle-check-big, svg.lucide-check-circle-2")).toBeInTheDocument();
    await user.click(finishStudy);
    const complete = screen.getByRole("button", { name: /hoàn thành bài/i });
    expect(complete).toBeEnabled();
    await user.click(complete);
    expect(saveLessonProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
  });
});
