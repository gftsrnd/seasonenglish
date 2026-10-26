// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonSetVersionView } from "@e4s/contracts";
import { adaptLessonSet } from "./adapters.js";

afterEach(cleanup);

function lessonSet(words: Array<Record<string, unknown>>): ContentLessonSetVersionView {
  const choice = { prompt: "What?", options: ["A", "B", "C", "D"], answer: "A" };
  return {
    lessonSetId: "set-1",
    versionId: "version-1",
    version: 1,
    status: "draft",
    weekNumber: 1,
    topic: "Giving feedback",
    cefr: "A1",
    explanationLanguage: "Tiếng Việt",
    createdBy: null,
    approvedBy: null,
    createdAt: "2026-10-22T00:00:00.000Z",
    publishedAt: null,
    lessons: [{
      id: "lesson-1",
      dayNumber: 1,
      title: "I give + feedback",
      durationMinutes: 10,
      practiceLabel: "điền từ · đáp án: give",
      parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Sau bài học, bạn có thể nói được một câu về công việc. Nội dung giải thích dài không cần hiển thị." } },
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Một", "Hai", "Ba"] } },
        { code: "vocabulary", title: "Từ vựng", content: { items: words } },
        { code: "grammar", title: "Ngữ pháp", content: { formula: "I give + feedback", usage: "Dùng để đưa phản hồi.", examples: ["I give clear feedback."] } },
        { code: "pronunciation", title: "Phát âm", content: { focus: "/f/ trong feedback", instruction: "Cắn nhẹ môi dưới rồi thổi hơi.", words: [{ word: "feedback", ipa: "/ˈfiːdbæk/" }] } },
        { code: "listening", title: "Nghe", content: { audio: "I give clear feedback.", script: "I give clear feedback.", ...choice } },
        { code: "reading", title: "Đọc", content: { text: "Text", ...choice } },
        { code: "writing", title: "Viết", content: { type: "fill", prompt: "Write", answer: "give" } },
        { code: "word_class", title: "Từ loại", content: choice },
        { code: "word_use", title: "Dùng từ", content: choice },
        { code: "speaking", title: "Nói", content: { prompt: "Speak", answer: "I give feedback." } }
      ]
    }]
  };
}

const baseWord = (word: string) => ({
  word,
  type: "noun",
  collocations: [`${word} one`, `${word} two`, `${word} three`],
  family: [{ word: `${word}ing`, type: "noun", meaning: "họ từ" }],
  umbrella: { word: "work communication", meaning: "giao tiếp công việc", siblings: [] }
});

describe("lesson detail warnings", () => {
  it("does not flag a lesson when optional synonym or antonym is absent for an individual word", () => {
    const source = lessonSet([
      { ...baseWord("job"), synonyms: [{ word: "task" }], antonyms: [{ word: "failure" }] },
      { ...baseWord("thank"), synonyms: [{ word: "thanks" }], antonyms: [] },
      { ...baseWord("slide"), synonyms: [], antonyms: [] }
    ]);

    expect(adaptLessonSet(source, { aiConnected: true }).warnings.details).toBe(0);
  });

  it("still flags a lesson with no synonym coverage while allowing naturally absent antonyms", () => {
    const source = lessonSet([
      { ...baseWord("job"), synonyms: [], antonyms: [] },
      { ...baseWord("thank"), synonyms: [], antonyms: [] },
      { ...baseWord("slide"), synonyms: [], antonyms: [] }
    ]);

    expect(adaptLessonSet(source, { aiConnected: true }).warnings.details).toBe(1);
  });

  it("identifies the exact lesson fields that AI or manual editing must repair", () => {
    const source = lessonSet([
      { word: "job", collocations: ["new job"], family: [], synonyms: [], antonyms: [] }
    ]);
    source.lessons[0]!.parts = source.lessons[0]!.parts.filter(part => part.code !== "word_class");
    const listening = source.lessons[0]!.parts.find(part => part.code === "listening");
    if (listening) listening.content.options = ["A", "B"];

    expect(adaptLessonSet(source, { aiConnected: true }).warnings.detailIssues).toEqual([{
      lessonId: "lesson-1",
      dayLabel: "T2",
      title: "I give + feedback",
      missing: expect.arrayContaining([
        "bài tập Từ loại",
        "Nghe chưa đủ 4 lựa chọn",
        "job: word family",
        "job: từ bao trùm",
        "từ đồng nghĩa"
      ])
    }]);
  });

  it("offers AI supplementation when a core generated component is missing", () => {
    const source = lessonSet([
      { ...baseWord("job"), synonyms: [{ word: "task" }], antonyms: [] }
    ]);
    source.lessons[0]!.parts = source.lessons[0]!.parts.filter((part) => part.code !== "objective");

    const warnings = adaptLessonSet(source, { aiConnected: true }).warnings;

    expect(warnings.details).toBe(1);
    expect(warnings.detailIssues).toEqual([expect.objectContaining({
      lessonId: "lesson-1",
      missing: expect.arrayContaining(["Mục tiêu bài học"])
    })]);
  });

  it("offers AI supplementation instead of silently hiding unavailable grammar", () => {
    const source = lessonSet([
      { ...baseWord("job"), synonyms: [{ word: "task" }], antonyms: [] }
    ]);
    const grammar = source.lessons[0]!.parts.find((part) => part.code === "grammar");
    if (grammar) grammar.content = { status: "unavailable", hidden: true, reason: "insufficient_evidence" };

    const warnings = adaptLessonSet(source, { aiConnected: true }).warnings;

    expect(warnings.details).toBe(1);
    expect(warnings.detailIssues).toEqual([expect.objectContaining({
      lessonId: "lesson-1",
      missing: expect.arrayContaining(["Ngữ pháp chưa đủ dữ liệu — có thể bổ sung bằng AI"])
    })]);
  });

  it("does not show an AI repair warning only because legacy vocabulary has no part of speech", () => {
    const source = lessonSet([
      { ...baseWord("job"), type: "", synonyms: [{ word: "task" }], antonyms: [{ word: "unemployment" }] },
      { ...baseWord("thank"), synonyms: [], antonyms: [] },
      { ...baseWord("slide"), synonyms: [], antonyms: [] }
    ]);

    expect(adaptLessonSet(source, { aiConnected: true }).warnings.details).toBe(0);
  });

  it("renders the operator preview with the learner-facing vocabulary card structure", async () => {
    const source = lessonSet([{
      ...baseWord("job"),
      type: "noun",
      pronunciation: "/dʒɒb/",
      meaning: "công việc",
      imageUrl: "https://images.example.test/job.jpg",
      imageAttribution: {
        source: "wikimedia",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Office.jpg",
        creator: "Example",
        licence: "CC BY 4.0",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/"
      },
      synonyms: [{ word: "task" }],
      antonyms: [{ word: "unemployment" }]
    }]);
    const view = adaptLessonSet(source, { aiConnected: true });

    render(<>{view.lessons[0]!.content}</>);

    expect(screen.getByRole("article", { name: "job" })).toHaveClass("vocabulary-card");
    expect(screen.getByText("danh từ")).toHaveClass("vocabulary-card-type");
    expect(await screen.findByRole("img", { name: "job" })).toHaveAttribute("src", "https://images.example.test/job.jpg");
    expect(screen.getByRole("button", { name: "Nghe từ job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe cụm từ: job one" })).toBeInTheDocument();
    expect(screen.getByText("Sau bài học, bạn có thể nói được một câu về công việc.")).toBeInTheDocument();
    expect(screen.queryByText(/Nội dung giải thích dài/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Từ bao trùm: work communication/ })).toHaveTextContent("TỪ BAO TRÙM work communication");
    expect(screen.getByRole("button", { name: /Từ bao trùm: work communication/ })).toHaveClass("umb");
    expect(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: task" })).toHaveTextContent(/^task$/);
    expect(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: task" })).toHaveClass("synonym");
    expect(screen.getByRole("button", { name: "Nghe từ trái nghĩa: unemployment" })).toHaveTextContent(/^unemployment$/);
    expect(screen.getByRole("button", { name: "Nghe từ trái nghĩa: unemployment" })).toHaveClass("antonym");
    expect(screen.getByRole("button", { name: "Word family (1)" })).toHaveTextContent("Word family (1)");

    const speak = vi.fn();
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { cancel: vi.fn(), speak } });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { lang = ""; constructor(public text: string) {} } });
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ job" }));
    expect(speak).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: task" }));
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: "task" }));
    expect(screen.queryByRole("dialog", { name: "Đồng nghĩa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Từ bao trùm: work communication/ }));
    expect(screen.getByRole("dialog", { name: "Từ bao quát" })).toBeInTheDocument();
    expect(screen.getByText("Từ vựng · job")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Từ bao quát work communication" })).toHaveTextContent("giao tiếp công việc");
    expect(screen.getByRole("button", { name: "Nghe work communication" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe job" })).toBeInTheDocument();
  });

  it("renders study audio affordances instead of plain grammar and pronunciation text", () => {
    const view = adaptLessonSet(lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi" }]), { aiConnected: true });

    render(<>{view.lessons[0]!.content}</>);

    expect(screen.queryByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).not.toBeInTheDocument();
    expect(screen.getByText("NGỮ PHÁP")).toBeInTheDocument();
    expect(screen.getByText("I give + feedback")).toBeInTheDocument();
    expect(screen.getByText("Dùng để đưa phản hồi.")).toHaveClass("lesson-study-explanation");
    expect(screen.queryByText(/1\) Công thức:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe câu ví dụ" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe câu ví dụ 1" })).toBeInTheDocument();
    expect(screen.getByText("PHÁT ÂM")).toBeInTheDocument();
    expect(screen.getByText(/Âm \/f\/ như trong/)).toBeInTheDocument();
    expect(screen.queryByText("3 từ chứa âm mục tiêu (học viên phải luyện đủ rồi mới ghi âm):")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe âm /f/" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: feedback" })).toBeInTheDocument();
    expect(screen.getByText("Cắn nhẹ môi dưới rồi thổi hơi.").closest("p")).toHaveClass("operator-pronunciation-tip");
  });

  it("shows one objective lead and exposes saved audio throughout the operator preview", () => {
    const source = lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi", audioUrl: "/audio/feedback.mp3" }]);
    source.cefr = "B1";
    const objective = source.lessons[0]!.parts.find(part => part.code === "objective")!;
    objective.content = { audioUrl: "/audio/objective.mp3", items: [
      { text: "By the end of this lesson, you will be able to explain a delivery delay." },
      { text: "By the end of this lesson, you will be able to confirm a new delivery time." }
    ] };
    const grammar = source.lessons[0]!.parts.find(part => part.code === "grammar")!;
    grammar.content = { ...grammar.content, audioUrl: "/audio/grammar.mp3" };

    const view = adaptLessonSet(source, { aiConnected: true });
    render(<>{view.lessons[0]!.content}</>);

    expect(screen.getByText("By the end of this lesson, you will be able to:")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).toHaveTextContent("Explain a delivery delay.");
    expect(screen.getByRole("list", { name: "Mục tiêu bài học" })).not.toHaveTextContent("By the end of this lesson");
    expect(screen.getByLabelText("Nghe audio phần Mục tiêu bài học")).toHaveAttribute("src", "/audio/objective.mp3");
    expect(screen.getByLabelText("Nghe audio từ feedback")).toHaveAttribute("src", "/audio/feedback.mp3");
    expect(screen.getByLabelText("Nghe audio phần Ngữ pháp")).toHaveAttribute("src", "/audio/grammar.mp3");
  });

  it("renders each practice skill as an interactive learner-style lane", () => {
    const view = adaptLessonSet(lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi" }]), { aiConnected: true });

    render(<>{view.lessons[0]!.content}</>);
    fireEvent.click(screen.getByRole("tab", { name: "2. Bài tập" }));

    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /\d+\. HƯỚNG DẪN LÀM BÀI/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. Nghe · Listening" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe đoạn audio" })).toHaveClass("operator-audio-button--primary");
    expect(screen.getByRole("heading", { name: "2. Đọc · Reading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "3. Viết · Writing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4. Từ loại · Word class" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "5. Dùng từ · Word use" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "6. Nói · Speaking" })).toBeInTheDocument();
    expect(screen.getByText(/Nói theo câu mẫu bên dưới/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe câu mẫu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi âm câu trả lời" })).toBeInTheDocument();
    expect(screen.getAllByText("A").some((node) => node.closest("li")?.classList.contains("operator-answer-choice"))).toBe(true);
  });
});
