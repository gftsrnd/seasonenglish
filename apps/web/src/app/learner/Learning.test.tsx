// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerLesson, normalizeLessonBlankPrompt } from "./Learning.js";

afterEach(cleanup);

describe("learner lesson study content", () => {
  it("fills legacy lesson content with the study guidance and vocabulary affordances", () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-602",
      title: "Past simple: I joined…",
      dayNumber: 2,
      weekNumber: 3,
      weekTopic: "Team collaboration",
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
    expect(within(lessonHeading!).getByText("Tuần 3 · T3 · Team collaboration")).toBeInTheDocument();
    expect(within(lessonHeading!).getByText("Past simple: I joined…")).toHaveAttribute("data-lesson-structure");
    expect(within(lessonHeading!).queryByText("Bài 2/5 · A2 · 10 phút")).not.toBeInTheDocument();

    const studyParts = screen.getAllByTestId("app-lesson-part");
    expect(studyParts.map((part) => part.getAttribute("data-part"))).toEqual([
      "objective", "instruction", "vocabulary", "grammar", "pronunciation"
    ]);
    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Hướng dẫn thực hiện" })).toHaveTextContent("Học nội dung");
    expect(screen.getByText("Sau bài học, bạn có thể:")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).toHaveTextContent("Identify two job details");
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).toHaveTextContent("Say one complete work sentence");
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).not.toHaveTextContent("Sau bài học, bạn có thể");
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).not.toHaveTextContent("SWBAT");
    expect(screen.getByText("tính từ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ new" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ new" }).querySelector("svg.lucide-volume-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe cụm từ: new here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe cụm từ: a new job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe cụm từ: a new team" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: fresh" })).toHaveTextContent("= fresh");
    expect(screen.getByRole("button", { name: "Nghe từ trái nghĩa: old" })).toHaveTextContent("≠ old");
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: I" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: nice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe phần Mục tiêu bài học" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe phần Hướng dẫn làm bài" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe phần Ngữ pháp" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe mẫu ngữ pháp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chi tiết từ liên quan" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));
    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /\d+\. HƯỚNG DẪN LÀM BÀI/ })).not.toBeInTheDocument();
    expect(screen.getByText("Học nội dung")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /1\. Học/i }));

    fireEvent.click(screen.getByRole("button", { name: "Nghe cụm từ: new here" }));
    expect(speak).toHaveBeenCalledWith("new here");
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ phát âm: I" }));
    expect(speak).toHaveBeenCalledWith("I");
    fireEvent.click(screen.getByRole("button", { name: "Nghe chậm từ phát âm: I" }));
    expect(speak).toHaveBeenCalledWith("I", "en-US", { rate: 0.65 });
    fireEvent.click(screen.getByRole("button", { name: "Nghe âm /aɪ/" }));
    expect(speak).toHaveBeenLastCalledWith("I… I", "en-US", { rate: 0.55 });
  });

  it("provides audio or TTS for every practice section", async () => {
    const user = userEvent.setup();
    const speak = vi.fn();
    const lesson = {
      id: "lesson-all-audio", title: "Work updates", dayNumber: 1, weekNumber: 1, weekTopic: "Projects",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Give a work update." } },
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Listen and answer."] } },
        { code: "vocabulary", title: "Từ vựng", content: { items: [] } },
        { code: "grammar", title: "Ngữ pháp", content: { formula: "I have + past participle", examples: ["I have finished."] } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/f/", words: ["finish"] } },
        { code: "listening", title: "Nghe", content: { script: "The report is ready.", prompt: "Is it ready?", options: ["Yes", "No"], answer: "Yes" } },
        { code: "reading", title: "Đọc", content: { text: "The report is ready.", prompt: "What is ready?", audioUrl: "/audio/reading.mp3" } },
        { code: "writing", title: "Viết", content: { type: "write", prompt: "Write a short update." } },
        { code: "word_class", title: "Từ loại", content: { prompt: "Choose the correct noun." } },
        { code: "word_use", title: "Dùng từ", content: { prompt: "Choose the correct phrase." } },
        { code: "speaking", title: "Nói", content: { instruction: "Say the sentence.", sample: "The report is ready." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective", "instruction", "vocabulary", "grammar", "pronunciation"], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    await user.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));
    expect(screen.getByLabelText("Nghe audio phần Đọc")).toHaveAttribute("src", "/audio/reading.mp3");
    expect(screen.getByRole("button", { name: "Nghe phần Viết" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe phần Từ loại" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe phần Dùng từ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe câu mẫu" })).toBeInTheDocument();
  });

  it("renders every fill-in blank as one continuous line", () => {
    expect(normalizeLessonBlankPrompt("Please write - - - here and _ _ _ there.")).toBe("Please write _____ here and _____ there.");
    expect(normalizeLessonBlankPrompt("Please write -------- here.")).toBe("Please write _____ here.");
  });

  it("requires at least two words before enabling a self-writing submission", () => {
    const lesson = {
      id: "lesson-writing", title: "I can + verb", dayNumber: 1, weekNumber: 1, weekTopic: "Introductions",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Write a short greeting." } },
        { code: "writing", title: "Viết", content: { type: "write", prompt: "Write a sentence." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), submitLessonPartAttempt: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));

    fireEvent.change(screen.getByRole("textbox", { name: "Câu trả lời writing" }), { target: { value: "Hello" } });
    expect(screen.getByRole("button", { name: "Nộp bài" })).toBeDisabled();
    expect(screen.getByText("Tự viết tối thiểu 2 từ.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Câu trả lời writing" }), { target: { value: "Hello team" } });
    expect(screen.getByRole("button", { name: "Nộp bài" })).toBeEnabled();
  });

  it("hides grammar explicitly marked unavailable instead of showing an empty study card", () => {
    const lesson = {
      id: "lesson-no-grammar", title: "Vocabulary focus", dayNumber: 1, durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Học từ vựng công việc." } },
        { code: "grammar", title: "Ngữ pháp", content: { status: "unavailable", hidden: true, reason: "no_suitable_content" } },
        { code: "vocabulary", title: "Từ vựng", content: { items: [] } }
      ] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(document.querySelector('[data-part="grammar"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "NGỮ PHÁP" })).not.toBeInTheDocument();
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

  it("renders real lesson media and gives unavailable vocabulary images back to the text layout", async () => {
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
    expect(await screen.findByTestId("hidden-content-image")).toHaveClass("content-image--hidden");
    expect(screen.queryByRole("img", { name: "Minh hoạ from" })).not.toBeInTheDocument();
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

  it("shows safe retry guidance, strikes the wrong choice, and reveals translations only after success", async () => {
    const lesson = {
      id: "lesson-feedback", title: "Directions", dayNumber: 1, durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Ask for directions." } },
        { code: "reading", title: "Đọc", content: { prompt: "Where is the room?", options: ["Lobby", "Second floor"], answer: "Second floor", hint: "Look for the floor phrase.", questionTranslation: "Phòng ở đâu?", answerTranslation: "Ở tầng hai." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: { reading: { attempts: 1, status: "wrong_retry", answer: "Lobby", feedback: "Chưa đúng." } } }
    } as any;
    const { rerender } = render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByText("Gợi ý: Look for the floor phrase.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Lobby/ }).closest("label")).toHaveStyle({ textDecoration: "line-through" });
    expect(screen.queryByText("Phòng ở đâu?")).not.toBeInTheDocument();

    const correct = { ...lesson, progress: { ...lesson.progress, completedPartCodes: ["objective", "reading"], evidence: { reading: { attempts: 2, status: "correct", answer: "Second floor", feedback: "Đúng rồi." } } } };
    rerender(<LearnerLesson view={{ lesson: correct, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    expect(screen.getByRole("region", { name: "Bản dịch phần Đọc" })).toHaveTextContent("Câu hỏi: Phòng ở đâu?");
    expect(screen.getByRole("region", { name: "Bản dịch phần Đọc" })).toHaveTextContent("Đáp án: Ở tầng hai.");
  });

  it("shows the actual question and answer translations after the learner requests them", async () => {
    const lesson = {
      id: "lesson-translated", title: "Directions", dayNumber: 1, durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Ask for directions." } },
        { code: "reading", title: "Đọc", content: { prompt: "Where is the room?", options: ["Lobby", "Second floor"], answer: "Second floor", hint: "Look for the floor phrase.", questionTranslation: "Phòng ở đâu?", answerTranslation: "Ở tầng hai." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective", "reading"], evidence: { reading: { attempts: 1, status: "translated", answer: "Lobby", feedback: "Bản dịch đã được mở để bạn đối chiếu." } } }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));

    const translation = screen.getByRole("region", { name: "Bản dịch phần Đọc" });
    expect(translation).toHaveTextContent("Câu hỏi: Phòng ở đâu?");
    expect(translation).toHaveTextContent("Đáp án: Ở tầng hai.");
  });

  it("presents fill exercises as text input even when malformed choice distractors are present", async () => {
    const lesson = {
      id: "lesson-fill", title: "Polite feedback", dayNumber: 1, durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Ask permission politely." } },
        { code: "writing", title: "Viết", content: {
          type: "fill",
          prompt: "Complete the sentence: '___ I give you some feedback on your slides?' (Use: Could I ...)",
          options: ["Could", "Could I", "Can you", "Would"],
          answer: "Could",
          questionTranslation: "Hoàn thành câu xin phép góp ý.",
          answerTranslation: "Tôi có thể góp ý về các trang trình chiếu của bạn không?"
        } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));

    expect(screen.getByRole("textbox", { name: "Câu trả lời writing" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Could I/ })).not.toBeInTheDocument();
    expect(screen.getByText("Complete the sentence: '_____ I give you some feedback on your slides?'")).toBeInTheDocument();
    expect(screen.queryByText(/Use: Could I/)).not.toBeInTheDocument();
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

  it("keeps a B1 study step recoverable after a network failure and opens exercises on retry", async () => {
    const user = userEvent.setup();
    const completeLessonStudy = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(undefined);
    const saveLessonProgress = vi.fn(() => {
      throw new Error("the study gate must not send the whole progress snapshot");
    });
    const lesson = {
      id: "lesson-b1-study-gate",
      title: "Giving a project update",
      dayNumber: 1,
      durationMinutes: 10,
      cefr: "B1",
      content: { parts: [
        { code: "objective", title: "Learning objective", content: { text: "Give a concise project update." } },
        { code: "instruction", title: "Instructions", content: { steps: ["Study the model", "Complete each exercise"] } },
        { code: "vocabulary", title: "Vocabulary", content: { items: [{ word: "follow up", type: "phrasal verb", meaning: "continue checking" }] } },
        { code: "grammar", title: "Grammar", content: { formula: "We have + past participle", usage: "Report completed work." } },
        { code: "pronunciation", title: "Pronunciation", content: { focus: "/ʌ/", words: [{ word: "update", ipa: "/ˈʌpdeɪt/" }] } },
        { code: "listening", title: "Listening", content: { prompt: "What is complete?", options: ["The report", "The plan", "The call", "The test"], answer: "The report" } }
      ] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{
      navigate: vi.fn(), speak: vi.fn(), saveLessonProgress, completeLessonStudy
    } as any} />);

    const finishStudy = screen.getByRole("button", { name: /đã học xong.*làm bài tập/i });
    await user.click(finishStudy);

    expect(await screen.findByText("Chưa ghi nhận được phần Học. Nội dung vẫn được giữ để bạn thử lại.")).toBeInTheDocument();
    expect(screen.getByText("follow up")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /2\. bài tập/i })).toBeDisabled();

    await user.click(finishStudy);

    expect(completeLessonStudy).toHaveBeenCalledTimes(2);
    expect(saveLessonProgress).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /2\. bài tập/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("What is complete?")).toBeInTheDocument();
    expect(screen.queryByText("follow up")).not.toBeInTheDocument();
  });

  it("allows a study-only lesson to complete after the study gate", async () => {
    const user = userEvent.setup();
    const saveLessonProgress = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();
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
    render(<LearnerLesson view={{ lesson: studyOnlyLesson, lock: null }} actions={{ navigate, speak: vi.fn(), completeLessonStudy: vi.fn(), saveLessonProgress } as any} />);

    const finishStudy = screen.getByRole("button", { name: /đã học xong.*làm bài tập/i });
    expect(finishStudy.querySelector("svg.lucide-circle-check-big, svg.lucide-check-circle-2")).toBeInTheDocument();
    await user.click(finishStudy);
    const complete = screen.getByRole("button", { name: /hoàn thành bài/i });
    expect(complete).toBeEnabled();
    await user.click(complete);
    expect(saveLessonProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
    expect(navigate).toHaveBeenCalledWith("/home");
  });
});
