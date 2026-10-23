// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerLesson, normalizeBlankPrompt } from "./Learning.js";

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
          { code: "objective", title: "Mục tiêu bài học", content: { text: "Mục tiêu có cấu trúc.", items: [
            { type: "content", text: "SWBAT identify two job details.", condition: "after listening", criterion: "two details", assessmentCode: "listening" },
            { type: "language", text: "SWBAT say one complete work sentence.", condition: "in a role-play", criterion: "one sentence", assessmentCode: "speaking" }
          ] } },
          { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] } },
          { code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "new", type: "tính từ", pronunciation: "/njuː/", meaning: "mới", examples: ["new here", "a new job", "a new team"], synonyms: [{ word: "fresh", level: "A2" }], antonyms: [{ word: "old", level: "A1", note: "đối lập về tuổi/thời gian" }] }] } },
          { code: "grammar", title: "Ngữ pháp", content: { formula: "I am from + nơi", usage: "Dùng khi làm quen." } },
          { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", words: [{ word: "I", ipa: "/aɪ/" }, { word: "nice", ipa: "/naɪs/" }, { word: "time", ipa: "/taɪm/" }], instruction: "Luyện âm mẫu." } }
        ]
      },
      progress: { status: "in_progress", completedPartCodes: ["objective", "vocabulary", "grammar", "pronunciation"], evidence: {}, updatedAt: "2026-10-15T00:00:00Z" }
    } as any;
    const actions = {
      navigate: vi.fn(),
      speak,
      saveLessonProgress: vi.fn()
    } as any;

    const { container } = render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);

    const lessonHeading = container.querySelector<HTMLElement>(".lesson-heading");
    expect(lessonHeading).not.toBeNull();
    const homeLink = within(lessonHeading!).getByRole("link", { name: "Về trang chủ" });
    expect(homeLink).toHaveAttribute("href", "/home");
    expect(homeLink.querySelector("svg.lucide-chevron-left")).toBeInTheDocument();
    expect(homeLink.querySelector("span")).not.toBeInTheDocument();

    expect(screen.queryByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).toHaveTextContent("SWBAT identify two job details");
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).toHaveTextContent("SWBAT say one complete work sentence");
    expect(screen.getByText("tính từ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ new" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ new" }).querySelector("svg.lucide-volume-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe ví dụ: new here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: fresh" })).toHaveTextContent("= fresh");
    expect(screen.getByRole("button", { name: "Nghe từ trái nghĩa: old" })).toHaveTextContent("≠ old");
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: I" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: nice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe mẫu ngữ pháp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chi tiết từ liên quan" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));
    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /\d+\. HƯỚNG DẪN LÀM BÀI/ })).not.toBeInTheDocument();
    expect(screen.getByText("Học nội dung")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /1\. Học/i }));

    fireEvent.click(screen.getByRole("button", { name: "Nghe ví dụ: new here" }));
    expect(speak).toHaveBeenCalledWith("new here");
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ phát âm: I" }));
    expect(speak).toHaveBeenCalledWith("I");
    fireEvent.click(screen.getByRole("button", { name: "Nghe chậm từ phát âm: I" }));
    expect(speak).toHaveBeenCalledWith("I", "en-US", { rate: 0.65 });
    expect(screen.queryByRole("button", { name: "Nghe âm /aɪ/" })).not.toBeInTheDocument();
  });

  it("renders every fill-in blank as one continuous line", () => {
    expect(normalizeBlankPrompt("Please write - - - here and _ _ _ there.")).toBe("Please write ------ here and ------ there.");
    expect(normalizeBlankPrompt("Please write --- here.")).toBe("Please write ------ here.");
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

  it("renders real lesson media and a bundled bitmap fallback when providers are unavailable", async () => {
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
    expect(await screen.findByRole("img", { name: "Minh hoạ from" })).toHaveAttribute("src", "/media/mascot/season-bear.png");
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

  it("opens practice without repeating the six-part overview", () => {
    const lesson = {
      id: "lesson-practice-no-overview",
      title: "Giving feedback",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Đưa ra góp ý ngắn." } },
        { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Đọc yêu cầu", "Làm từng phần"] } },
        { code: "listening", title: "Nghe", content: { prompt: "Choose.", options: ["A", "B", "C", "D"] } },
        { code: "reading", title: "Đọc", content: { text: "A short report.", prompt: "Choose.", options: ["A", "B", "C", "D"] } },
        { code: "writing", title: "Viết", content: { prompt: "Write one sentence." } },
        { code: "word_class", title: "Từ loại", content: { prompt: "Choose the adjective." } },
        { code: "word_use", title: "Dùng từ", content: { prompt: "Choose the correct sentence." } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói một câu ngắn.", answer: "Your report is good." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));

    expect(screen.queryByRole("heading", { name: "6 phần bài tập" })).not.toBeInTheDocument();
    expect(screen.queryByText("Làm lần lượt từng kỹ năng, xem phản hồi rồi làm lại nếu cần.")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("app-lesson-part")).toHaveLength(7);
  });

  it("renders the Operator speaking instruction and sample in separate roles", () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-speaking-parity",
      title: "Giving feedback",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Đưa ra góp ý ngắn." } },
        { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Đọc yêu cầu"] } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói một điểm tốt về công việc.", sample: "Your report is good." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));

    expect(screen.getByText("Nói một điểm tốt về công việc.")).toBeInTheDocument();
    expect(screen.getByText("Your report is good.")).toBeInTheDocument();
    const listen = screen.getByRole("button", { name: "Nghe câu mẫu" });
    expect(listen.closest(".lesson-speaking-model")).toHaveTextContent("Your report is good.");
    expect(listen.closest(".lesson-speaking-model")).toHaveClass("lesson-speaking-model--inline");
    const answerArea = screen.getByText("Bài làm của bạn").closest(".lesson-speaking-answer");
    expect(answerArea).not.toBeNull();
    expect(within(answerArea as HTMLElement).getByRole("button", { name: "Ghi âm" })).toBeInTheDocument();
    expect(within(answerArea as HTMLElement).getByText("Tải file ghi âm")).toBeInTheDocument();
  });

  it("unlocks the speaking check only after all three pronunciation examples were played", async () => {
    const user = userEvent.setup();
    const lesson = {
      id: "lesson-speaking-gate",
      title: "Giving feedback",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Nói một câu góp ý." } },
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Nghe ba từ mẫu"] } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", words: [{ word: "I", ipa: "/aɪ/" }, { word: "nice", ipa: "/naɪs/" }, { word: "time", ipa: "/taɪm/" }] } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói một câu.", answer: "I have time." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective", "instruction", "pronunciation"], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByText(/nghe đủ 3 từ mẫu phát âm/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kiểm tra nói" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /1\. học/i }));
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: I" }));
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: nice" }));
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: time" }));
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));

    expect(screen.queryByText(/nghe đủ 3 từ mẫu phát âm/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kiểm tra nói" })).toBeInTheDocument();
  });

  it("requires the learner to enter a five-character appeal reason and persists that reason", async () => {
    const user = userEvent.setup();
    const appealLessonPart = vi.fn().mockResolvedValue({
      progress: { status: "in_progress", completedPartCodes: ["objective", "writing"], evidence: { writing: { attempts: 2, status: "appealed" } } }
    });
    const lesson = {
      id: "lesson-appeal",
      title: "Writing feedback",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Viết câu hoàn chỉnh." } },
        { code: "writing", title: "Viết", content: { prompt: "Write one sentence.", answer: "I can join Friday." } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["objective", "writing"],
        evidence: { writing: { attempts: 2, status: "wrong_exhausted", answer: "Friday" } }
      }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), appealLessonPart } as any} />);
    await user.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));
    await user.click(screen.getByRole("button", { name: "Gửi kháng nghị" }));

    const reason = screen.getByRole("textbox", { name: "Lý do kháng nghị phần Viết" });
    const submit = screen.getByRole("button", { name: "Xác nhận gửi kháng nghị" });
    await user.type(reason, "abcd");
    expect(submit).toBeDisabled();
    await user.type(reason, "e");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(appealLessonPart).toHaveBeenCalledWith("writing", "abcde");
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
