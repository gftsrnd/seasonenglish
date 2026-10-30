// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonSetVersionView } from "@e4s/contracts";
import { adaptLessonSet, adaptReview } from "./adapters.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
        { code: "pronunciation", title: "Phát âm", content: { focus: "/f/ trong feedback", instruction: "Cắn nhẹ môi dưới rồi thổi hơi.", words: [{ word: "feedback", ipa: "/ˈfiːdbæk/" }, { word: "phone", ipa: "/fəʊn/" }, { word: "office", ipa: "/ˈɒfɪs/" }] } },
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
  it("turns persisted generation findings into an actionable day repair warning", () => {
    const source = lessonSet([
      { ...baseWord("job"), synonyms: [{ word: "task" }], antonyms: [] }
    ]);
    source.generationFindings = [{
      dayNumber: 1,
      component: "foundation",
      code: "DUPLICATE_GRAMMAR_FRAME",
      severity: "error",
      message: "Khung ngữ pháp trùng với mức A2.",
      issues: [],
      repairAction: "regenerate_component"
    }];

    const warnings = adaptLessonSet(source, { aiConnected: true }).warnings;

    expect(warnings.details).toBe(1);
    expect(warnings.detailIssues).toEqual([expect.objectContaining({
      lessonId: "lesson-1",
      dayLabel: "T2",
      repairable: true,
      missing: ["Nền tảng: Khung ngữ pháp trùng với mức A2."]
    })]);
  });

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

  it("does not show a warning when a whole level has only two permitted light lexical gaps", () => {
    const source = lessonSet([{ ...baseWord("job"), synonyms: [], antonyms: [] }]);
    source.lessons = [1, 2, 3, 4, 5].map((dayNumber) => ({
      ...source.lessons[0]!,
      id: `lesson-${dayNumber}`,
      dayNumber,
      parts: source.lessons[0]!.parts.map((part) => part.code !== "vocabulary" ? part : {
        ...part,
        content: {
          ...part.content,
          items: [{ ...baseWord(`word-${dayNumber}`), synonyms: dayNumber <= 2 ? [] : [{ word: `related-${dayNumber}` }], antonyms: [] }]
        }
      })
    }));

    expect(adaptLessonSet(source, { aiConnected: true }).warnings.details).toBe(0);
  });

  it("does not flag a lesson when all missing lexical relations have an approved exemption", () => {
    const source = lessonSet([
      { ...baseWord("Monday"), synonyms: [], antonyms: [], relationStatus: "no_natural_relation" },
      { ...baseWord("date"), synonyms: [], antonyms: [], relationStatus: "above_cefr_level" },
      { ...baseWord("today"), synonyms: [], antonyms: [], relationStatus: "no_natural_relation" }
    ]);

    expect(adaptLessonSet(source, { aiConnected: true }).warnings.details).toBe(0);
  });

  it("flags an exemption contradicted by the shared CEFR relation policy", () => {
    const source = lessonSet([
      { ...baseWord("send"), type: "verb", meaning: "gửi", synonyms: [], antonyms: [], relationStatus: "no_natural_relation" }
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
        "quan hệ nghĩa (đồng nghĩa hoặc trái nghĩa)"
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

  it("flags pronunciation examples whose IPA does not contain the declared target sound", () => {
    const source = lessonSet([
      { ...baseWord("job"), synonyms: [{ word: "task" }], antonyms: [] }
    ]);
    const pronunciation = source.lessons[0]!.parts.find(part => part.code === "pronunciation")!;
    pronunciation.content = {
      focus: "/ɪ/ trong từ ngắn",
      words: [
        { word: "fit", ipa: "/fɪt/" },
        { word: "good", ipa: "/gʊd/" },
        { word: "sit", ipa: "/sɪt/" }
      ]
    };

    const warnings = adaptLessonSet(source, { aiConnected: true }).warnings;

    expect(warnings.details).toBe(1);
    expect(warnings.detailIssues).toEqual([expect.objectContaining({
      lessonId: "lesson-1",
      missing: expect.arrayContaining(["Phát âm sai âm mục tiêu: good không chứa /ɪ/"])
    })]);
  });

  it("flags an existing pronunciation section when its sound and practice words are empty", () => {
    const source = lessonSet([
      { ...baseWord("job"), synonyms: [{ word: "task" }], antonyms: [] }
    ]);
    source.lessons[0]!.dayNumber = 3;
    const pronunciation = source.lessons[0]!.parts.find((part) => part.code === "pronunciation");
    if (pronunciation) pronunciation.content = { focus: "", tip: "", words: [] };

    const warnings = adaptLessonSet(source, { aiConnected: true }).warnings;

    expect(warnings.details).toBe(1);
    expect(warnings.detailIssues).toEqual([expect.objectContaining({
      dayLabel: "T4",
      missing: expect.arrayContaining(["Phát âm chưa đủ dữ liệu — cần âm mục tiêu và 3 từ luyện"])
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
      synonyms: [{ word: "task", level: "A2" }],
      antonyms: [{ word: "unemployment", level: "B1" }]
    }]);
    const view = adaptLessonSet(source, { aiConnected: true });

    render(<>{view.lessons[0]!.content}</>);

    expect(screen.getByRole("article", { name: "job" })).toHaveClass("vocabulary-card");
    expect(screen.getByText("danh từ")).toHaveClass("vocabulary-card-type");
    expect(await screen.findByRole("img", { name: "job" })).toHaveAttribute("src", "https://images.example.test/job.jpg");
    expect(screen.getByRole("button", { name: "Nghe từ job" })).toBeInTheDocument();
    expect(screen.getByText("job one")).toBeInTheDocument();
    expect(screen.getByText("Sau bài học, bạn có thể nói được một câu về công việc.")).toBeInTheDocument();
    expect(screen.queryByText(/Nội dung giải thích dài/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Từ bao trùm: work communication/ })).toHaveTextContent("TỪ BAO TRÙM work communication");
    expect(screen.getByRole("button", { name: /Từ bao trùm: work communication/ })).toHaveClass("umb");
    expect(screen.getByText(/task/).closest(".chip")).toHaveClass("synonym");
    expect(screen.getByText(/unemployment/).closest(".chip")).toHaveClass("antonym");
    expect(screen.getByText(/task/).closest(".chip")).not.toHaveTextContent("A2");
    expect(screen.getByText(/unemployment/).closest(".chip")).not.toHaveTextContent("B1");
    expect(screen.getByRole("button", { name: "Word family (1)" })).toHaveTextContent("Họ từ (1)");

    expect(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: task" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Đồng nghĩa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Từ bao trùm: work communication/ }));
    expect(screen.getByRole("dialog", { name: "Từ bao quát" })).toBeInTheDocument();
    expect(screen.getByText("Từ vựng · job")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Từ bao trùm: work communication" })).toHaveTextContent("giao tiếp công việc");
    expect(screen.getByRole("button", { name: "Nghe từ bao trùm: work communication" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ cùng nhóm: job" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    fireEvent.click(screen.getByRole("button", { name: "Word family (1)" }));
    expect(screen.getByRole("button", { name: "Nghe từ cùng họ: jobing" })).toBeInTheDocument();
  });

  it("renders study audio affordances instead of plain grammar and pronunciation text", () => {
    const source = lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi" }]);
    const pronunciation = source.lessons[0]!.parts.find(part => part.code === "pronunciation")!;
    pronunciation.content = { ...pronunciation.content, phonemeAudioUrl: "/media/audio/ipa/f.mp3" };
    const view = adaptLessonSet(source, { aiConnected: true });

    render(<>{view.lessons[0]!.content}</>);

    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.getByText("Học 1 từ vựng, nghĩa và các cụm từ thường dùng.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nghe audio phần Hướng dẫn làm bài")).not.toBeInTheDocument();
    expect(screen.getByText("NGỮ PHÁP")).toBeInTheDocument();
    expect(screen.getByText("I give + feedback")).toBeInTheDocument();
    expect(screen.getByText("Dùng để đưa phản hồi.")).toHaveClass("lesson-study-explanation");
    expect(screen.queryByText(/1\) Công thức:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe câu ví dụ" })).not.toBeInTheDocument();
    expect(screen.getByText("I give + feedback").closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nghe mẫu ngữ pháp" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mẫu câu trọng tâm:/)).not.toBeInTheDocument();
    expect(screen.getByText("I give clear feedback.")).toHaveClass("lesson-example-card");
    expect(screen.getByText("PHÁT ÂM")).toBeInTheDocument();
    expect(screen.getByText(/Âm \/f\/ như trong/)).toBeInTheDocument();
    expect(screen.queryByText("3 từ chứa âm mục tiêu (học viên phải luyện đủ rồi mới ghi âm):")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe âm /f/" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Luyện từ phát âm").firstElementChild).toHaveClass("lesson-pronunciation-word-chip");
    expect(screen.getByLabelText("Luyện từ phát âm").querySelectorAll(":scope > button")).toHaveLength(3);
    expect(screen.getByText("Cắn nhẹ môi dưới rồi thổi hơi.").closest("p")).toHaveClass("lesson-study-explanation");
    expect(screen.getByText(/Âm \/f\/ như trong/).closest(".lesson-grammar-formula-row")).toBeInTheDocument();
  });

  it("never renders the untrusted target-phoneme speaker", () => {
    const source = lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi" }]);
    const pronunciation = source.lessons[0]!.parts.find(part => part.code === "pronunciation")!;
    pronunciation.content = { ...pronunciation.content, phonemeAudioUrl: "/media/audio/phonemes/f.ogg" };
    const view = adaptLessonSet(source, { aiConnected: true });
    render(<>{view.lessons[0]!.content}</>);
    expect(screen.queryByRole("button", { name: "Nghe âm /f/" })).not.toBeInTheDocument();
  });

  it("shows a target-phoneme no-audio state without synthesizing IPA text", () => {
    const source = lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi" }]);
    const pronunciation = source.lessons[0]!.parts.find(part => part.code === "pronunciation")!;
    pronunciation.content = { ...pronunciation.content, phonemeAudioUrl: "" };
    const view = adaptLessonSet(source, { aiConnected: true });

    render(<>{view.lessons[0]!.content}</>);

    expect(screen.queryByText("Chưa có audio âm /f/." )).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe âm /f/" })).not.toBeInTheDocument();
  });

  it("keeps the Agent 3 phoneme id/url and indexed word audio contract in operator preview", () => {
    const source = lessonSet([{ ...baseWord("called"), meaning: "đã gọi" }]);
    const pronunciation = source.lessons[0]!.parts.find(part => part.code === "pronunciation")!;
    pronunciation.content = {
      focus: "/d/", tip: "Touch the alveolar ridge.",
      words: [{ word: "called", ipa: "/kɔːld/" }, { word: "did", ipa: "/dɪd/" }, { word: "needed", ipa: "/ˈniːdɪd/" }],
      phonemeAudioId: "phoneme-d", phonemeAudioUrl: "/media/audio/phonemes/d.wav",
      wordAudioUrls: ["/media/audio/words/called.mp3", "/media/audio/words/did.mp3", "/media/audio/words/needed.mp3"]
    };
    const audioSources: string[] = [];
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(src: string) { audioSources.push(src); }
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
    }
    vi.stubGlobal("Audio", FakeAudio);
    const view = adaptLessonSet(source, { aiConnected: true });
    render(<>{view.lessons[0]!.content}</>);

    expect(screen.queryByRole("button", { name: "Nghe âm /d/" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ phát âm: called" }));
    expect(audioSources).toEqual(["/media/audio/words/called.mp3"]);
  });

  it("shows one objective lead without audio and exposes saved audio for learning content", () => {
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
    expect(screen.getByRole("list", { name: "Lesson objectives" })).toHaveTextContent("Explain a delivery delay.");
    expect(screen.getByRole("list", { name: "Lesson objectives" })).not.toHaveTextContent("By the end of this lesson");
    expect(screen.queryByLabelText("Nghe audio phần Mục tiêu bài học")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ feedback" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nghe audio phần Ngữ pháp")).not.toBeInTheDocument();
  });

  it("renders B1+ learner-facing headings and generated instruction fallbacks in English", () => {
    const source = lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi", synonyms: [{ word: "comment" }] }]);
    source.cefr = "B1";
    source.explanationLanguage = "English";
    const objective = source.lessons[0]!.parts.find(part => part.code === "objective")!;
    objective.content = { items: [{ text: "By the end of this lesson, you will be able to explain a delivery delay." }] };
    const instruction = source.lessons[0]!.parts.find(part => part.code === "instruction")!;
    instruction.content = { steps: ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] };
    const grammar = source.lessons[0]!.parts.find(part => part.code === "grammar")!;
    grammar.content = { formula: "I have + past participle", usage: "Use this structure to report completed work.", examples: ["I have finished the report."] };
    const pronunciation = source.lessons[0]!.parts.find(part => part.code === "pronunciation")!;
    pronunciation.content = { focus: "/f/", instruction: "Touch your lower lip gently.", words: [{ word: "feedback", ipa: "/ˈfiːdbæk/" }, { word: "fine", ipa: "/faɪn/" }, { word: "office", ipa: "/ˈɒfɪs/" }] };

    const view = adaptLessonSet(source, { aiConnected: true });
    render(<>{view.lessons[0]!.content}</>);

    expect(screen.getByRole("heading", { name: "LESSON OBJECTIVES" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "INSTRUCTIONS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GRAMMAR" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PRONUNCIATION" })).toBeInTheDocument();
    expect(screen.getByText("Study the vocabulary, meanings and common collocations.")).toBeInTheDocument();
    expect(screen.queryByText("HƯỚNG DẪN LÀM BÀI")).not.toBeInTheDocument();
    expect(screen.queryByText(/Học nội dung|Làm lần lượt|Xem phản hồi/u)).not.toBeInTheDocument();
  });

  it("renders each practice skill as a read-only operator review with correct answers", () => {
    const spoken: string[] = [];
    class FakeUtterance { constructor(readonly text: string) {} }
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: (utterance: FakeUtterance) => spoken.push(utterance.text) });
    const source = lessonSet([{ ...baseWord("feedback"), meaning: "phản hồi" }]);
    const wordUse = source.lessons[0]!.parts.find(part => part.code === "word_use")!;
    wordUse.content = { ...wordUse.content, prompt: "Our plan is called the _ _ _ _ _." };
    const view = adaptLessonSet(source, { aiConnected: true });

    render(<>{view.lessons[0]!.content}</>);
    fireEvent.click(screen.getByRole("tab", { name: "2. Bài tập" }));

    expect(screen.getByRole("heading", { name: "HƯỚNG DẪN LÀM BÀI" })).toBeInTheDocument();
    expect(screen.getByText("Làm lần lượt 6 phần: Nghe → Đọc → Viết → Từ loại → Dùng từ → Nói.")).toBeInTheDocument();
    const listeningHeading = screen.getByRole("heading", { name: "1. Nghe · Listening" });
    const listeningSection = listeningHeading.closest("section")!;
    expect(listeningSection).toHaveClass("operator-practice-review");
    const listenButton = screen.getByRole("button", { name: "Nghe nội dung phần Listening" });
    expect(listenButton).toHaveClass("operator-listening-button");
    expect(listeningHeading.parentElement?.nextElementSibling).toBe(listenButton);
    const transcript = within(listeningSection).getByText("Nội dung nghe:").parentElement!;
    expect(transcript).toHaveClass("operator-listening-transcript");
    expect(transcript).toHaveTextContent("I give clear feedback.");
    expect(listenButton.nextElementSibling).toBe(transcript);
    expect(transcript.nextElementSibling).toHaveTextContent("What?");
    expect(transcript.nextElementSibling?.nextElementSibling).toHaveClass("operator-answer-options");
    const listeningChoices = within(listeningSection).getAllByRole("listitem");
    expect(listeningChoices).toHaveLength(4);
    expect(listeningChoices.map(choice => choice.textContent)).toEqual(["AA", "BB", "CC", "DD"]);
    expect(listeningChoices[0]).toHaveClass("is-answer");
    expect(within(listeningSection).getByText("Đáp án đúng:").parentElement).toHaveTextContent("A");
    fireEvent.click(listenButton);
    expect(spoken).toEqual(["I give clear feedback."]);
    const readingSection = screen.getByRole("heading", { name: "2. Đọc · Reading" }).closest("section")!;
    expect(readingSection).toHaveClass("operator-practice-review");
    expect(within(readingSection).getByText("Text")).toBeInTheDocument();
    const readingChoices = within(readingSection).getAllByRole("listitem");
    expect(readingChoices).toHaveLength(4);
    expect(readingChoices.map(choice => choice.textContent)).toEqual(["AA", "BB", "CC", "DD"]);
    expect(readingChoices[0]).toHaveClass("is-answer");
    expect(within(readingSection).getByText("Đáp án đúng:").parentElement).toHaveTextContent("A");
    expect(screen.getByRole("heading", { name: "3. Viết · Writing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4. Từ loại · Word class" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "5. Dùng từ · Word use" })).toBeInTheDocument();
    expect(screen.getByText("Our plan is called the _____.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "6. Nói · Speaking" })).toBeInTheDocument();
    expect(screen.getByText(/Nói theo câu mẫu bên dưới/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe câu mẫu" })).not.toBeInTheDocument();
    expect(screen.queryByText("trắc nghiệm")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /câu trả lời/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ghi âm câu trả lời" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Đáp án đúng:")).toHaveLength(6);
    expect(screen.getByText("give")).toBeInTheDocument();
    expect(screen.getAllByText("I give feedback.")).toHaveLength(2);
  });
});

describe("review submissions", () => {
  it("keeps the saved task guidance and required vocabulary for the grader", () => {
    const view = adaptReview({
      tabs: [{ key: "submissions", label: "Bài nộp", count: 1, unreadCount: 1 }],
      submissions: [{
        id: "sub-1", learnerName: "An", cefr: "A1", weekNumber: 1,
        submittedAt: "2026-10-27T12:00:00.000Z", checked: false,
        type: "writing", task: "Write three sentences.", guidance: "Use the weekly words.",
        requiredVocabulary: ["fall", "floor", "report"], text: "A man fell down.", total: null,
        rubric: { meaning: null, vocabulary: null, grammar: null }, feedback: "", suggestions: []
      }], coachSamples: [], weeklyPractices: [], microLessons: [], appeals: [], lessonAttempts: [], assessments: []
    }, "submissions");

    expect(view.counts.subs).toBe(1);
    expect(view.submissions[0]).toEqual(expect.objectContaining({
      guidance: "Use the weekly words.", requiredVocabulary: ["fall", "floor", "report"]
    }));
  });
});
