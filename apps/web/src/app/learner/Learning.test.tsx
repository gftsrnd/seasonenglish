// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExperienceProvider, useExperience } from "../../features/experience/Experience.js";
import { cancelAllExclusiveAudio, claimExclusiveAudio } from "../../features/experience/audio-precedence.js";
import { learnerLessonLanguageForCefr } from "../shared/lesson/language.js";
import { LearnerLesson, normalizeLessonBlankPrompt, sanitizeGrammarSpeechText } from "./Learning.js";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  cancelAllExclusiveAudio();
});

function LessonWithExperience({ lesson }: { lesson: any }) {
  const { speak } = useExperience();
  return <LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />;
}

describe("learner lesson study content", () => {
  it("pauses background music for native lesson audio and resumes it after playback", () => {
    const stopMusic = vi.fn();
    const resumeMusic = vi.fn();
    claimExclusiveAudio("music", stopMusic, resumeMusic);
    const lesson = {
      id: "lesson-native-audio-exclusive", title: "Phone support", dayNumber: 1, weekNumber: 1, weekTopic: "Support",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Nghe và trả lời." } },
        { code: "listening", title: "Nghe", content: { audioUrl: "/audio/listening.mp3", prompt: "What happened?", options: ["A", "B"], answer: "A" } },
        { code: "speaking", title: "Nói", content: { sample: "I can help you.", audioUrl: "/audio/speaking.mp3" } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));

    const listening = screen.getByLabelText("Nghe audio phần Listening");
    fireEvent.play(listening);
    expect(stopMusic).toHaveBeenCalledTimes(1);
    fireEvent.ended(listening);
    expect(resumeMusic).toHaveBeenCalledTimes(1);

    claimExclusiveAudio("music", stopMusic, resumeMusic);
    const speaking = screen.getByLabelText("Nghe audio mẫu phần Nói");
    fireEvent.play(speaking);
    expect(stopMusic).toHaveBeenCalledTimes(2);
    fireEvent.pause(speaking);
    expect(resumeMusic).toHaveBeenCalledTimes(2);
  });

  it("uses the shared English learner language context for B1+ labels and guidance while keeping vocabulary meanings Vietnamese", () => {
    const lesson = {
      id: "lesson-b1-language-context",
      title: "Giving a project update",
      dayNumber: 2,
      weekNumber: 1,
      weekTopic: "Project updates",
      durationMinutes: 10,
      cefr: "B1",
      content: { parts: [
        { code: "objective", title: "Learning objectives", content: { items: [{ type: "content", text: "Explain a project update." }] } },
        { code: "instruction", title: "Instructions", content: { steps: [] } },
        { code: "vocabulary", title: "Vocabulary", content: { items: [{ word: "supplier", type: "noun", meaning: "nhà cung cấp", collocations: ["call a supplier"] }] } },
        { code: "grammar", title: "Grammar", content: { formula: "We have + past participle", usage: "Use this to report completed work." } },
        { code: "pronunciation", title: "Pronunciation", content: { focus: "/aɪ/", instruction: "Keep the sound clear.", words: [{ word: "like", ipa: "/laɪk/" }] } },
        { code: "listening", title: "Listening", content: { prompt: "What is complete?", options: ["The report", "The plan"], answer: "The report" } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective", "vocabulary", "grammar", "pronunciation"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.getByRole("heading", { name: "LESSON OBJECTIVES" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "INSTRUCTIONS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "VOCABULARY" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GRAMMAR" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PRONUNCIATION" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Instructions" })).toHaveTextContent("Study the vocabulary, meanings and common collocations.");
    expect(screen.getByRole("list", { name: "Instructions" })).toHaveTextContent("Review the grammar structure, usage and example sentences.");
    expect(screen.getByRole("list", { name: "Instructions" })).toHaveTextContent("Practise the target sound and the three model words.");
    expect(screen.getByText("noun")).toBeInTheDocument();
    expect(screen.getByText("nhà cung cấp")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /2\. Practice/i }));
    expect(screen.getByRole("list", { name: "Instructions" })).toHaveTextContent("Complete 1 section: Listening.");
    expect(screen.getByText("Your answer")).toBeInTheDocument();
  });

  it("keeps the A2 boundary in Vietnamese when persisted AI guidance is English", () => {
    const lesson = {
      id: "lesson-a2-language-boundary", title: "Calling a supplier", dayNumber: 1, weekNumber: 1,
      weekTopic: "Suppliers", durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Objectives", content: { items: [{ type: "content", text: "Call a supplier and confirm a delivery." }] } },
        { code: "instruction", title: "Instructions", content: { steps: ["Follow the generated English guidance."] } },
        { code: "vocabulary", title: "Vocabulary", content: { items: [{ word: "delivery", type: "noun", meaning: "việc giao hàng", collocations: ["confirm a delivery"] }] } },
        { code: "grammar", title: "Grammar", content: { formula: "Could you + verb?", usage: "Use this structure to make a polite request." } },
        { code: "pronunciation", title: "Pronunciation", content: { focus: "/ɪ/", instruction: "Keep the target sound short.", words: [{ word: "ship", ipa: "/ʃɪp/" }] } }
      ] },
      progress: { status: "not_started", completedPartCodes: ["objective"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.getByRole("heading", { name: "MỤC TIÊU BÀI HỌC" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Hướng dẫn thực hiện" })).not.toHaveTextContent("Follow the generated English guidance.");
    expect(screen.getByRole("list", { name: "Hướng dẫn thực hiện" })).toHaveTextContent("Học 1 từ vựng, nghĩa và các cụm từ thường dùng.");
    expect(screen.getByText("Dùng cấu trúc này để diễn đạt ý chính của bài.")).toBeInTheDocument();
    expect(screen.getByText("Luyện âm mục tiêu theo các từ mẫu bên dưới.")).toBeInTheDocument();
    expect(screen.getByText("việc giao hàng")).toBeInTheDocument();
  });

  it("keeps the B1 boundary in English when persisted AI guidance is Vietnamese", () => {
    const lesson = {
      id: "lesson-b1-language-boundary", title: "Giving an update", dayNumber: 1, weekNumber: 1,
      weekTopic: "Projects", durationMinutes: 10, cefr: "B1",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { items: [{ type: "content", text: "Give a concise project update." }] } },
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Học nội dung rồi làm bài tập.", "Report the Đà Nẵng travel expense in one sentence."] } },
        { code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "deadline", type: "noun", meaning: "hạn chót", collocations: ["meet a deadline"] }] } },
        { code: "grammar", title: "Ngữ pháp", content: { formula: "We have + past participle", usage: "Dùng để báo cáo công việc đã hoàn thành." } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", instruction: "Giữ âm rõ và đủ dài.", words: [{ word: "time", ipa: "/taɪm/" }] } }
      ] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.getByRole("heading", { name: "LESSON OBJECTIVES" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "INSTRUCTIONS" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Instructions" })).not.toHaveTextContent("Học nội dung rồi làm bài tập.");
    expect(screen.getByRole("list", { name: "Instructions" })).toHaveTextContent("Report the Đà Nẵng travel expense in one sentence.");
    expect(screen.getByRole("list", { name: "Instructions" })).toHaveTextContent("Study the vocabulary, meanings and common collocations.");
    expect(screen.getByText("Use this structure to express the lesson's target meaning.")).toBeInTheDocument();
    expect(screen.getByText("Practise the target sound with the model words below.")).toBeInTheDocument();
    expect(screen.getByText("hạn chót")).toBeInTheDocument();
  });

  it("maps A1-A2 to Vietnamese, B1-C1 to English, and unknown CEFR to the safe Vietnamese fallback", () => {
    expect([
      learnerLessonLanguageForCefr("A1"),
      learnerLessonLanguageForCefr("A2"),
      learnerLessonLanguageForCefr("B1"),
      learnerLessonLanguageForCefr("B2"),
      learnerLessonLanguageForCefr("C1"),
      learnerLessonLanguageForCefr("")
    ]).toEqual(["vi", "vi", "en", "en", "en", "vi"]);
  });

  it.each([
    ["A1", "MỤC TIÊU BÀI HỌC", "người giám sát"],
    ["A2", "MỤC TIÊU BÀI HỌC", "lịch làm việc"],
    ["B1", "LESSON OBJECTIVES", "hạn chót"],
    ["B2", "LESSON OBJECTIVES", "bên liên quan"],
    ["C1", "LESSON OBJECTIVES", "sự tuân thủ"]
  ])("keeps %s vocabulary meanings Vietnamese while using the level's framing language", (cefr, objectiveHeading, meaning) => {
    const lesson = {
      id: `lesson-${cefr.toLocaleLowerCase()}-meaning`, title: "Workplace communication", dayNumber: 1, weekNumber: 1,
      weekTopic: "Communication", durationMinutes: 10, cefr,
      content: { parts: [
        { code: "objective", title: "Objective", content: { items: [{ type: "content", text: "Use one workplace word in context." }] } },
        { code: "vocabulary", title: "Vocabulary", content: { items: [{ word: "workplace term", type: "noun", meaning }] } }
      ] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.getByRole("heading", { name: objectiveHeading })).toBeInTheDocument();
    expect(screen.getByText(meaning)).toBeInTheDocument();
  });

  it("hides the structure badge and language-only objectives when grammar is unavailable", () => {
    const lesson = {
      id: "lesson-no-grammar", title: "Say what happened: A man fell down", dayNumber: 1, weekNumber: 1,
      weekTopic: "Reporting a safety incident", durationMinutes: 10, cefr: "A1",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { items: [
          { type: "content", text: "Sau bài học, bạn có thể nói một câu về một sự cố." },
          { type: "language", text: "Sau bài học, bạn có thể dùng mẫu 'A man fell down'." }
        ] } },
        { code: "grammar", title: "Ngữ pháp", content: { status: "unavailable", hidden: true, reason: "no_suitable_content" } }
      ] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.queryByText("CẤU TRÚC")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).toHaveTextContent("Nói một câu về một sự cố");
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).not.toHaveTextContent("A man fell down");
  });

  it("restores the selected practice tab after a reload for an in-progress Tuesday lesson", () => {
    const lesson = {
      id: "lesson-tuesday-resume",
      title: "Tuesday lesson",
      dayNumber: 1,
      weekNumber: 1,
      weekTopic: "Work updates",
      durationMinutes: 10,
      cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
        { code: "vocabulary", title: "Từ vựng", content: { items: [] } },
        { code: "grammar", title: "Ngữ pháp", content: { formula: "I am ready." } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/iː/", words: ["team"] } },
        { code: "listening", title: "Nghe", content: { prompt: "Choose.", options: ["A", "B"] } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["objective", "vocabulary", "grammar", "pronunciation"],
        evidence: { listening: { attempts: 1, status: "wrong_retry", answer: "B" } },
        updatedAt: "2026-10-27T09:00:00.000Z"
      }
    } as any;
    const actions = { navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any;

    const first = render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));
    expect(screen.getByRole("tab", { name: /2\. Bài tập/i })).toHaveAttribute("aria-selected", "true");
    expect(window.sessionStorage.getItem("e4s:lesson:lesson-tuesday-resume:active-tab")).toBe("practice");

    first.unmount();
    render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);

    expect(screen.getByRole("tab", { name: /2\. Bài tập/i })).toHaveAttribute("aria-selected", "true");
  });

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
          { code: "grammar", title: "Ngữ pháp", content: { formula: "I am from + nơi", usage: "Dùng khi làm quen.", examples: ["Example: I am ready. | metadata"] } },
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
    expect(screen.getByRole("button", { name: "Nghe cụm từ: new here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe cụm từ: a new job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe cụm từ: a new team" })).toBeInTheDocument();
    const synonymChip = screen.getByText(/= fresh/).closest(".chip");
    const antonymChip = screen.getByText(/≠ old/).closest(".chip");
    expect(synonymChip).toHaveTextContent("= fresh");
    expect(synonymChip).not.toHaveTextContent("A2");
    expect(antonymChip).toHaveTextContent("≠ old");
    expect(antonymChip).not.toHaveTextContent("A1");
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: I" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: nice" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Nghe phần Mục tiêu bài học" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe phần Hướng dẫn làm bài" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe phần Ngữ pháp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe mẫu ngữ pháp" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Câu ví dụ ngữ pháp").firstElementChild).toHaveClass("lesson-example-card");
    expect(screen.queryByRole("button", { name: "Chi tiết từ liên quan" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /2\. Bài tập/i }));
    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /\d+\. HƯỚNG DẪN LÀM BÀI/ })).not.toBeInTheDocument();
    const practiceGuide = screen.getByRole("list", { name: "Hướng dẫn thực hiện" });
    expect(practiceGuide).toHaveTextContent("Bài này chưa có phần bài tập.");
    expect(practiceGuide).not.toHaveTextContent("Học nội dung");
    fireEvent.click(screen.getByRole("tab", { name: /1\. Học/i }));

    fireEvent.click(screen.getByRole("button", { name: "Nghe cụm từ: new here" }));
    expect(speak).toHaveBeenCalledWith("new here");
    expect(screen.queryByRole("button", { name: "Nghe âm /aɪ/" })).not.toBeInTheDocument();
    expect(speak).not.toHaveBeenCalledWith("eye", "en-US", { rate: 0.55 });
  });

  it("keeps exercise audio only where the exercise requires listening or speaking practice", async () => {
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
    expect(screen.queryByLabelText("Nghe audio phần Đọc")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe phần Viết" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe phần Từ loại" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe phần Dùng từ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe câu mẫu" })).not.toBeInTheDocument();
  });

  it("renders every fill-in blank as one continuous line", () => {
    expect(normalizeLessonBlankPrompt("Please write - - - here and _ _ _ there.")).toBe("Please write _____ here and _____ there.");
    expect(normalizeLessonBlankPrompt("Please write -------- here.")).toBe("Please write _____ here.");
  });

  it("shows the complete speaking requirement and renders lesson blanks as one line", () => {
    const lesson = {
      id: "lesson-full-speaking-requirement", title: "Requesting help", dayNumber: 1, weekNumber: 1, weekTopic: "Requests", durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Nói một yêu cầu lịch sự." } },
        { code: "writing", title: "Viết", content: { type: "fill", prompt: "I need a _ _ _ _ _ for the report.", answer: "copy" } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói theo câu mẫu. Nêu rõ bạn cần giúp với báo cáo hôm nay.", sample: "Could you help me with the report today?" } }
      ] },
      progress: { status: "not_started", completedPartCodes: ["objective"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));

    expect(screen.getByText(/Nói theo câu mẫu\. Nêu rõ bạn cần giúp với báo cáo hôm nay\./u)).toBeInTheDocument();
    expect(screen.getByLabelText("Ô trống cần điền")).toBeInTheDocument();
    expect(screen.queryByText(/_\s*_\s*_/u)).not.toBeInTheDocument();
  });

  it("speaks only a natural grammar example and keeps a phoneme separate from its sample word", () => {
    expect(sanitizeGrammarSpeechText("Example: She is OK + now. | Do not read this label")).toBe("She is OK now.");
  });

  it("hides the IPA-only control and keeps pronunciation word examples audible", () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-grammar-target-and-pronunciation-chips", title: "Feedback", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "grammar", title: "Ngữ pháp", content: { formula: "I give + feedback", usage: "Use this to give feedback.", examples: ["I give clear feedback.", "We share feedback."] } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/f/", phonemeAudioUrl: "/media/audio/ipa/f.mp3", words: [{ word: "feedback", ipa: "/ˈfiːdbæk/" }, { word: "fine", ipa: "/faɪn/" }, { word: "helpful", ipa: "/ˈhelpfəl/" }] } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["grammar", "pronunciation"], evidence: {} }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    const formula = screen.getByText("I give + feedback");
    expect(formula.closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nghe mẫu câu trọng tâm" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mẫu câu trọng tâm:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe âm /f/" })).not.toBeInTheDocument();

    const pronunciation = screen.getByLabelText("Luyện từ phát âm");
    expect(pronunciation.querySelectorAll(":scope > button")).toHaveLength(3);
    expect(screen.getByLabelText("Luyện từ phát âm").firstElementChild).toHaveClass("lesson-pronunciation-word-chip");
    expect(screen.queryByRole("button", { name: /Nghe chậm từ phát âm/i })).not.toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();
  });

  it("keeps horizontal and wrapped pronunciation examples visibly separated", async () => {
    const moduleName = "node:fs/promises";
    const { readFile } = await import(moduleName);
    const css = await readFile("apps/web/src/app/learner/learner.css", "utf8");

    expect(css).toMatch(/\.lesson-page \.lesson-pronunciation-words\{[^}]*column-gap:20px;[^}]*row-gap:14px;[^}]*\}/);
  });

  it("puts one compact grammar speaker beside the formula and reads the formula without structural symbols", () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-grammar-heading-audio", title: "Feedback", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [{ code: "grammar", title: "Ngữ pháp", content: { formula: "I give + feedback", audioUrl: "/audio/grammar.mp3", usage: "Use this to give feedback.", examples: ["Example: I give clear feedback. | Vietnamese note"] } }] },
      progress: { status: "in_progress", completedPartCodes: ["grammar"], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    const control = screen.getByRole("button", { name: "Nghe mẫu ngữ pháp" });
    expect(control).toHaveClass("lesson-grammar-audio-icon", "vocabulary-card-sound--icon");
    expect(screen.getByText("I give + feedback").closest(".lesson-grammar-formula-row")).toContainElement(control);
    expect(screen.queryByText(/Mẫu câu trọng tâm:/)).not.toBeInTheDocument();
    expect(control).toBeEnabled();
  });

  it("never exposes the uploaded IPA-only audio control to learners", () => {
    const lesson = {
      id: "lesson-phoneme-asset", title: "Pronunciation", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [{ code: "pronunciation", title: "Phát âm", content: { focus: "/eɪ/", phonemeAudioUrl: "/audio/ay.mp3", words: ["safe", "day", "take"] } }] },
      progress: { status: "in_progress", completedPartCodes: ["pronunciation"], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.queryByRole("button", { name: "Nghe âm /eɪ/" })).not.toBeInTheDocument();
    expect(document.querySelector(".lesson-pronunciation-audio-icon")).not.toBeInTheDocument();
    expect(screen.getByText(/Âm \/eɪ\/ như trong “safe”/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Nghe từ phát âm:/ })).toHaveLength(3);
  });

  it("uses word audio without exposing the IPA-only asset", async () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-pronunciation-contract", title: "Pronunciation", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [{ code: "pronunciation", title: "Phát âm", content: {
        focus: "/d/", tip: "Touch the alveolar ridge.", words: [
          { word: "called", ipa: "/kɔːld/" }, { word: "did", ipa: "/dɪd/" }, { word: "needed", ipa: "/ˈniːdɪd/" }
        ], phonemeAudioId: "phoneme-d", phonemeAudioUrl: "/media/audio/phonemes/d.wav",
        wordAudioUrls: ["/media/audio/words/called.mp3", "/media/audio/words/did.mp3", "/media/audio/words/needed.mp3"]
      } }] },
      progress: { status: "in_progress", completedPartCodes: ["pronunciation"], evidence: {} }
    } as any;
    const user = userEvent.setup();
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    expect(screen.queryByRole("button", { name: "Nghe âm /d/" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: called" }));
    expect(speak).toHaveBeenNthCalledWith(1, "called", "en-US", {
      audioSrc: "/media/audio/words/called.mp3",
      rate: 0.65,
      onStatus: expect.any(Function)
    });
  });

  it("pauses background music for word assets, then resumes it when each asset ends", async () => {
    const user = userEvent.setup();
    const created: FakeAudio[] = [];
    class FakeAudio {
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      readonly pause = vi.fn();
      readonly play = vi.fn(() => {
        this.onplay?.();
        return Promise.resolve();
      });
      constructor(readonly src: string) {
        created.push(this);
      }
      addEventListener(type: string, listener: () => void) {
        if (type === "ended") this.onended = listener;
        if (type === "error") this.onerror = listener;
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    const lesson = {
      id: "lesson-exclusive-pronunciation-audio", title: "Pronunciation", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [{ code: "pronunciation", title: "Phát âm", content: {
        focus: "/d/", phonemeAudioUrl: "/media/audio/phonemes/d.wav",
        words: [{ word: "called", ipa: "/kɔːld/" }], wordAudioUrls: ["/media/audio/words/called.mp3"]
      } }] },
      progress: { status: "in_progress", completedPartCodes: ["pronunciation"], evidence: {} }
    } as any;

    render(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "custom", customUrl: "/media/audio/study.mp3", volume: 22 }}><LessonWithExperience lesson={lesson} /></ExperienceProvider>);

    expect(created.find((audio) => audio.src === "/media/audio/phonemes/d.wav")).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: called" }));
    const musicBeforeFailure = created.filter((audio) => audio.src === "/media/audio/study.mp3");
    expect(musicBeforeFailure.some((audio) => audio.pause.mock.calls.length > 0)).toBe(true);
    const failedWord = created.find((audio) => audio.src === "/media/audio/words/called.mp3");
    failedWord?.onerror?.();
    await waitFor(() => expect(created.filter((audio) => audio.src === "/media/audio/study.mp3").length).toBeGreaterThan(musicBeforeFailure.length));

    const resumedMusic = created.filter((audio) => audio.src === "/media/audio/study.mp3").at(-1);
    const musicCountBeforeEnd = created.filter((audio) => audio.src === "/media/audio/study.mp3").length;
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: called" }));
    const word = created.filter((audio) => audio.src === "/media/audio/words/called.mp3")[1];
    expect(resumedMusic?.pause).toHaveBeenCalledOnce();
    word?.onended?.();
    await waitFor(() => expect(created.filter((audio) => audio.src === "/media/audio/study.mp3").length).toBeGreaterThan(musicCountBeforeEnd));
  });

  it("silently hides unavailable grammar and phoneme audio from learners", () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-phoneme-no-asset", title: "Pronunciation", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "grammar", title: "Ngữ pháp", content: { formula: "I have + a/an + singular countable noun", examples: ["I have a question."] } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/eɪ/", words: ["safe", "day", "take"] } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["pronunciation"], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    expect(screen.queryByText(/Chưa có audio/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe mẫu ngữ pháp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe âm /eɪ/" })).not.toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();
  });

  it("keeps long vocabulary chips wrap-safe instead of clipping their full text", () => {
    const phrase = "call the first aid team after the incident report is complete";
    const lesson = {
      id: "lesson-long-collocation", title: "Safety", dayNumber: 1, weekNumber: 1, weekTopic: "Safety",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [{ code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "incident", meaning: "sự cố", collocations: [phrase] }] } }] },
      progress: { status: "in_progress", completedPartCodes: ["vocabulary"], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    const chip = screen.getByText(phrase);
    expect(chip).toHaveTextContent(phrase);
    expect(chip.closest("button")).toHaveClass("vocabulary-card-sound");
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
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Đọc từ vựng.", "Đọc câu mẫu ngữ pháp thật to.", "Luyện phát âm."] } },
        { code: "grammar", title: "Ngữ pháp", content: { status: "unavailable", hidden: true, reason: "no_suitable_content" } },
        { code: "vocabulary", title: "Từ vựng", content: { items: [] } }
      ] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(document.querySelector('[data-part="grammar"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "NGỮ PHÁP" })).not.toBeInTheDocument();
    expect(screen.queryByText("Đọc câu mẫu ngữ pháp thật to.")).not.toBeInTheDocument();
  });

  it("presents umbrella relations with the same full-width cards as Operator", () => {
    const speak = vi.fn();
    const lesson = {
      id: "lesson-umbrella-style", title: "Safety", dayNumber: 1, durationMinutes: 10, cefr: "A2",
      content: { parts: [{ code: "vocabulary", title: "Từ vựng", content: { items: [{
        word: "fell", meaning: "ngã", umbrella: { word: "accident", meaning: "tai nạn", siblings: [{ word: "slipped", meaning: "trượt chân" }] }
      }] } }] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    fireEvent.click(screen.getByRole("button", { name: /Từ bao trùm: accident/ }));
    const modal = screen.getByRole("dialog", { name: "Từ bao quát" });
    const entries = modal.querySelectorAll(".vocabulary-relation-audio-item");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("fell");
    expect(entries[0]).toHaveTextContent("từ của bài");
    expect(entries[1]).toHaveTextContent("slipped");
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ bao trùm: accident" }));
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ cùng nhóm: slipped" }));
    expect(speak).toHaveBeenCalledWith("accident");
    expect(speak).toHaveBeenCalledWith("slipped");
  });

  it("uses each saved phrase audio file and falls back to TTS only when that phrase has no file", () => {
    const played: string[] = [];
    vi.stubGlobal("Audio", class {
      constructor(readonly src: string) {}
      play = () => { played.push(this.src); return Promise.resolve(); };
    });
    const speak = vi.fn();
    const lesson = {
      id: "lesson-phrase-audio", title: "Time", dayNumber: 1, durationMinutes: 10, cefr: "A1",
      content: { parts: [{ code: "vocabulary", title: "Từ vựng", content: { items: [{
        word: "day", meaning: "ngày", collocations: ["every day", "one day"], collocationAudioUrls: ["/audio/every-day.mp3", ""]
      }] } }] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    } as any;
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    fireEvent.click(screen.getByRole("button", { name: "Nghe cụm từ: every day" }));
    fireEvent.click(screen.getByRole("button", { name: "Nghe cụm từ: one day" }));
    expect(played).toEqual(["/audio/every-day.mp3"]);
    expect(speak).toHaveBeenCalledWith("one day");
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
    const practiceGuide = screen.getByRole("list", { name: "Hướng dẫn thực hiện" });
    expect(practiceGuide).toHaveTextContent("Làm lần lượt 6 phần: Nghe → Đọc → Viết → Từ loại → Dùng từ → Nói.");
    expect(practiceGuide).toHaveTextContent("Đọc yêu cầu từng phần, chọn hoặc nhập câu trả lời rồi bấm Nộp bài.");
    expect(practiceGuide).not.toHaveTextContent("Đọc câu mẫu");
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
    const model = screen.getByText("Your report is good.").closest(".lesson-speaking-model");
    expect(model).toHaveTextContent("Your report is good.");
    expect(model).toHaveClass("lesson-speaking-model--inline");
    expect(screen.queryByRole("button", { name: "Nghe câu mẫu" })).not.toBeInTheDocument();
    const answerArea = screen.getByText("Bài làm của bạn").closest(".lesson-speaking-answer");
    expect(answerArea).not.toBeNull();
    expect(within(answerArea as HTMLElement).getByRole("button", { name: "Ghi âm" })).toBeInTheDocument();
    expect(within(answerArea as HTMLElement).getByText("Tải file ghi âm")).toBeInTheDocument();
  });

  it("keeps Speaking transcript read-only and shows it only when the system returned one", () => {
    const lesson = {
      id: "lesson-speaking-transcript", title: "Speaking", dayNumber: 1, durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Nói một câu." } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói câu mẫu.", sample: "It is safe today." } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["objective"],
        evidence: { speaking: { attempts: 1, status: "submitted", artifactKey: "assessment-audio/speaking.webm", answer: "It is safe today." } }
      }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));

    expect(screen.queryByRole("textbox", { name: "Câu trả lời speaking" })).not.toBeInTheDocument();
    const transcript = within(screen.getByLabelText("Bản chép tự động phần Nói")).getByText("It is safe today.");
    expect(transcript.tagName).toBe("OUTPUT");
    expect(transcript).toHaveTextContent("It is safe today.");
  });

  it("keeps speaking locked when the lesson has no real IPA file", async () => {
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
    const actions = { navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any;
    const { unmount } = render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);

    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByText(/nghe đủ 3 từ mẫu phát âm/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kiểm tra nói" })).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Nghe từ phát âm: I" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kiểm tra nói" })).not.toBeInTheDocument();
    unmount();
  });

  it("keeps practice locked when terminal practice evidence exists but required study parts are incomplete", () => {
    const lesson = {
      id: "lesson-server-study-gate", title: "Giving feedback", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Nói một câu góp ý." } },
        { code: "vocabulary", title: "Từ vựng", content: { items: [] } },
        { code: "grammar", title: "Ngữ pháp", content: { formula: "I think + clause" } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", words: ["I", "nice", "time"] } },
        { code: "listening", title: "Nghe", content: { prompt: "Choose.", options: ["A", "B"] } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói một câu.", answer: "I think it is nice." } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["listening"],
        evidence: { listening: { attempts: 1, status: "correct", answer: "A" } }
      }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);

    expect(screen.getByRole("tab", { name: /2\. bài tập/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Kiểm tra nói" })).not.toBeInTheDocument();
  });

  it("unlocks Speaking only after all three pronunciation words finish", async () => {
    const user = userEvent.setup();
    const statusCallbacks: Array<((status: "started" | "ended" | "cancelled" | "error" | "unsupported" | "no_voice") => void) | undefined> = [];
    const lesson = {
      id: "lesson-speaking-after-pronunciation", title: "Giving feedback", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", phonemeAudioUrl: "/audio/ai.mp3", words: [{ word: "I", ipa: "/aɪ/" }, { word: "nice", ipa: "/naɪs/" }, { word: "time", ipa: "/taɪm/" }] } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói một câu.", answer: "I have time." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["pronunciation"], evidence: {} }
    } as any;
    const speak = vi.fn((_text: string, _language?: string, options?: { onStatus?: (status: "started" | "ended" | "cancelled" | "error" | "unsupported" | "no_voice") => void }) => {
      statusCallbacks.push(options?.onStatus);
    });
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn() } as any} />);

    expect(screen.queryByRole("button", { name: "Nghe âm /aɪ/" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByText(/nghe đủ 3 từ mẫu phát âm/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kiểm tra nói" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /1\. học/i }));
    for (const word of ["I", "nice", "time"]) {
      await user.click(screen.getByRole("button", { name: `Nghe từ phát âm: ${word}` }));
    }
    expect(statusCallbacks).toHaveLength(3);
    statusCallbacks[0]?.("error");
    statusCallbacks[1]?.("cancelled");
    statusCallbacks[2]?.("unsupported");
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByText(/nghe đủ 3 từ mẫu phát âm/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /1\. học/i }));
    for (const word of ["I", "nice", "time"]) {
      await user.click(screen.getByRole("button", { name: `Nghe từ phát âm: ${word}` }));
    }
    statusCallbacks.slice(3).forEach((onStatus) => onStatus?.("ended"));

    await waitFor(() => expect(screen.getByRole("tab", { name: /2\. bài tập/i })).toBeEnabled());
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByRole("button", { name: "Ghi âm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kiểm tra nói" })).toBeDisabled();
  });

  it("keeps server-recorded Speaking unlocked after a reload without pronunciation playback storage", async () => {
    const user = userEvent.setup();
    const lesson = {
      id: "lesson-speaking-server-complete", title: "Giving feedback", dayNumber: 2, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", words: ["I", "nice", "time"] } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói một câu.", answer: "I have time." } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["pronunciation", "speaking"],
        evidence: { speaking: { attempts: 1, status: "submitted", artifactKey: "lesson-audio/speaking.webm", feedback: "Đã gửi để kiểm tra." } }
      }
    } as any;
    const actions = { navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any;

    const first = render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.queryByText(/nghe đủ 3 từ mẫu phát âm/i)).not.toBeInTheDocument();
    expect(screen.getByText("Đã gửi để kiểm tra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đã xong" })).toBeDisabled();

    first.unmount();
    render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.queryByText(/nghe đủ 3 từ mẫu phát âm/i)).not.toBeInTheDocument();
    expect(screen.getByText("Đã gửi để kiểm tra")).toBeInTheDocument();
  });

  it("does not re-lock a submitted Speaking part even before its part code is completed", async () => {
    const user = userEvent.setup();
    const lesson = {
      id: "lesson-speaking-pending-review", title: "Giving feedback", dayNumber: 2, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", words: ["I", "nice", "time"] } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói một câu.", answer: "I have time." } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["pronunciation"],
        evidence: { speaking: { attempts: 1, status: "submitted", artifactKey: "lesson-audio/pending.webm", feedback: "Đã gửi để kiểm tra." } }
      }
    } as any;

    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    await user.click(screen.getByRole("tab", { name: /2\. bài tập 0\/1/i }));

    expect(screen.queryByText(/nghe đủ 3 từ mẫu phát âm/i)).not.toBeInTheDocument();
    expect(screen.getByText("Đã gửi để kiểm tra")).toBeInTheDocument();
  });

  it("enables Kiểm tra nói after either an eligible upload or recording evidence is available", async () => {
    const user = userEvent.setup();
    const uploadAssessmentAudio = vi.fn().mockResolvedValue("assessment-audio/lesson-speaking.mp3");
    const lesson = {
      id: "lesson-speaking-upload", title: "Speaking", dayNumber: 1, weekNumber: 1, weekTopic: "Work",
      durationMinutes: 10, cefr: "A2",
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Nói một câu." } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/eɪ/", words: ["safe", "day", "take"] } },
        { code: "speaking", title: "Nói", content: { instruction: "Nói câu mẫu.", sample: "It is safe today." } }
      ] },
      progress: { status: "in_progress", completedPartCodes: ["objective", "pronunciation"], evidence: {} }
    } as any;
    window.localStorage.setItem("e4s:lesson:lesson-speaking-upload:pronunciation-listened", JSON.stringify(["safe", "day", "take"]));
    render(<LearnerLesson view={{ lesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), uploadAssessmentAudio } as any} />);
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    const submit = screen.getByRole("button", { name: "Kiểm tra nói" });
    expect(submit).toBeDisabled();

    await user.upload(screen.getByLabelText("Tải file ghi âm speaking"), new File(["audio"], "answer.mp3", { type: "audio/mpeg" }));
    expect(uploadAssessmentAudio).toHaveBeenCalledWith(expect.any(File), "answer.mp3");
    expect(screen.getByRole("button", { name: "Kiểm tra nói" })).toBeEnabled();
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
    expect(screen.getByText(/Complete the sentence:/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Ô trống cần điền")).toBeInTheDocument();
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

    const finishStudy = screen.getByRole("button", { name: /study complete.*practice/i });
    await user.click(finishStudy);

    expect(await screen.findByText("We could not save the Study step. The content is still here so you can try again.")).toBeInTheDocument();
    expect(screen.getByText("follow up")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /2\. practice/i })).toBeDisabled();

    await user.click(finishStudy);

    expect(completeLessonStudy).toHaveBeenCalledTimes(2);
    expect(saveLessonProgress).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /2\. practice/i })).toHaveAttribute("aria-selected", "true");
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
