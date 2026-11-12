// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerLesson } from "./Learning.js";

type SpeechStatus = "started" | "ended" | "cancelled" | "error" | "unsupported" | "no_voice";

afterEach(cleanup);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

/**
 * Shaped like a real November monthly lesson on 4175 (lesson a88083f6): parts carry no
 * `title`, the pronunciation part has three words, and the learner view adds wordAudioUrls.
 */
function monthlyLesson(cefr: "A2" | "B1", evidence: Record<string, unknown> = {}, id = "lesson-monthly-gate") {
  const practice = { completedPartCodes: ["objective", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use"] };
  return {
    id, title: "Present Simple", dayNumber: 3, weekNumber: 1, weekTopic: "Team work", durationMinutes: 15, cefr, kind: "new",
    content: { parts: [
      { code: "objective", content: { items: ["Nói về lịch họp của nhóm."] } },
      { code: "instruction", content: { steps: ["Học từ vựng.", "Làm bài tập.", "Nói."] } },
      { code: "vocabulary", content: { items: [{ word: "meeting", pronunciation: "/ˈmiːtɪŋ/", meaning: "cuộc họp" }] } },
      { code: "grammar", content: { formula: "S + V(s/es)", usage: "Dùng để nói về thói quen.", examples: ["The team meets every Monday."] } },
      { code: "pronunciation", content: {
        focus: "/m/", stage: "recognize", objective: "Nghe, nhận diện và tập tạo âm mục tiêu",
        words: [{ ipa: "/ˈmiːtɪŋ/", word: "meeting" }, { ipa: "/ˈiːmeɪl/", word: "email" }, { ipa: "/ˈmæn.ɪ.dʒɚ/", word: "manager" }],
        wordAudioUrls: ["/media/pron/meeting.mp3", "/media/pron/email.mp3", "/media/pron/manager.mp3"]
      } },
      { code: "listening", content: { script: "The report is ready.", prompt: "Is it ready?", options: ["It is ready.", "No."], answer: "It is ready." } },
      { code: "reading", content: { text: "The design file is not complete.", prompt: "Is it complete?", options: ["Yes", "No"], answer: "No" } },
      { code: "writing", content: { prompt: "Write one sentence about your team." } },
      { code: "word_class", content: { prompt: "The ____ is happy.", options: ["client", "clients"], answer: "client" } },
      { code: "word_use", content: { prompt: "___ a problem", options: ["fix", "make"], answer: "fix" } },
      { code: "speaking", content: { prompt: "Nói về lịch họp hàng tuần.", sample: "Our team has a meeting every Monday." } }
    ] },
    progress: { status: "in_progress", ...practice, evidence }
  } as any;
}

function renderLesson(lesson: any, extra: Record<string, unknown> = {}) {
  const callbacks: Array<((status: SpeechStatus) => void) | undefined> = [];
  const speak = vi.fn((_text: string, _language?: string, options?: { onStatus?: (status: SpeechStatus) => void }) => { callbacks.push(options?.onStatus); });
  const actions = { navigate: vi.fn(), saveLessonProgress: vi.fn(), completeLessonStudy: vi.fn(), speak, ...extra } as any;
  const view = render(<LearnerLesson view={{ lesson, lock: null }} actions={actions} />);
  return { ...view, callbacks, speak, actions };
}

const gate = () => document.querySelector(".lesson-speaking-gate") as HTMLElement | null;

describe("Speaking gate on a real-shaped monthly lesson", () => {
  it("names the three words, shows heard/total and unlocks after each word is heard once", async () => {
    const user = userEvent.setup();
    const recordPronunciationListen = vi.fn().mockResolvedValue(undefined);
    const { callbacks } = renderLesson(monthlyLesson("A2"), { recordPronunciationListen });

    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(gate()).toHaveTextContent("Nghe lần lượt 3 từ mẫu phát âm: meeting (chưa nghe), email (chưa nghe), manager (chưa nghe) (phần Học → thẻ Phát âm) để mở phần Nói. Đã nghe 0/3.");
    expect(within(gate()!).getAllByText(/^(meeting|email|manager)$/).map((node) => node.tagName)).toEqual(["STRONG", "STRONG", "STRONG"]);

    await user.click(screen.getByRole("tab", { name: /1\. học/i }));
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: meeting" }));
    callbacks.at(-1)?.("ended");
    await waitFor(() => expect(recordPronunciationListen).toHaveBeenCalledWith("meeting"));
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    await waitFor(() => expect(gate()).toHaveTextContent("Đã nghe 1/3."));
    expect(gate()).toHaveTextContent("meeting ✓ (đã nghe), email (chưa nghe), manager (chưa nghe)");
    expect(gate()!.querySelector('[data-heard="true"]')).toHaveTextContent("meeting");

    await user.click(screen.getByRole("tab", { name: /1\. học/i }));
    for (const word of ["email", "manager"]) {
      await user.click(screen.getByRole("button", { name: `Nghe từ phát âm: ${word}` }));
      callbacks.at(-1)?.("ended");
      await waitFor(() => expect(recordPronunciationListen).toHaveBeenCalledWith(word));
    }
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    await waitFor(() => expect(gate()).toBeNull());
    expect(screen.getByRole("button", { name: "Kiểm tra nói" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("e4s:lesson:lesson-monthly-gate:pronunciation-listened") ?? "[]")).toEqual(["meeting", "email", "manager"]);
  });

  it("does not count a play that errors on both the audio file and the voice fallback", async () => {
    const user = userEvent.setup();
    const { callbacks } = renderLesson(monthlyLesson("A2"));
    await user.click(screen.getByRole("button", { name: "Nghe từ phát âm: meeting" }));
    callbacks.at(-1)?.("error");
    callbacks.at(-1)?.("no_voice");
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(gate()).toHaveTextContent("Đã nghe 0/3.");
  });

  it("stays unlocked after a reload from either the browser record or the server record", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("e4s:lesson:lesson-local:pronunciation-listened", JSON.stringify(["meeting", "email", "manager"]));
    renderLesson(monthlyLesson("A2", {}, "lesson-local"));
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(gate()).toBeNull();
    cleanup();
    window.localStorage.clear();

    // Exactly what 4175 stored for the tester: the listens POST saved all three words.
    renderLesson(monthlyLesson("A2", { pronunciation: { answer: "[\"manager\",\"meeting\",\"email\"]", attempts: 0 } }, "lesson-server"));
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(gate()).toBeNull();
    expect(screen.getByRole("button", { name: "Kiểm tra nói" })).toBeInTheDocument();
    cleanup();

    renderLesson(monthlyLesson("A2", { pronunciation: { answer: "[\"manager\"]", attempts: 0 } }, "lesson-partial"));
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(gate()).toHaveTextContent("Đã nghe 1/3.");
  });

  it("uses the English gate copy for B1+ lessons", async () => {
    const user = userEvent.setup();
    renderLesson(monthlyLesson("B1", { pronunciation: { answer: "[\"email\"]", attempts: 0 } }));
    await user.click(screen.getByRole("tab", { name: /2\. practice/i }));
    expect(gate()).toHaveTextContent("Listen to each of the 3 model pronunciation words: meeting (not yet), email ✓ (heard), manager (not yet) (Study → Pronunciation card) to unlock Speaking. Heard 1/3.");
  });
});

describe("Practice headings when parts carry no stored title", () => {
  it.each([
    ["A2", ["1. Nghe · Listening", "2. Đọc · Reading", "3. Viết · Writing", "4. Từ loại · Word class", "5. Dùng từ · Word use", "6. Nói · Speaking"]],
    ["B1", ["1. Listening", "2. Reading", "3. Writing", "4. Word class", "5. Word use", "6. Speaking"]]
  ] as const)("%s shows a label for every part code and never 'undefined'", async (cefr, headings) => {
    const user = userEvent.setup();
    renderLesson(monthlyLesson(cefr, { pronunciation: { answer: "[\"manager\",\"meeting\",\"email\"]", attempts: 0 } }));
    expect(document.body.textContent).not.toMatch(/undefined/i);
    await user.click(screen.getByRole("tab", { name: cefr === "A2" ? /2\. bài tập/i : /2\. practice/i }));
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(expect.arrayContaining([...headings]));
    expect(document.body.textContent).not.toMatch(/undefined/i);
  });

  it("names the part in the appeal form without a stored title", async () => {
    const user = userEvent.setup();
    renderLesson(monthlyLesson("A2", { pronunciation: { answer: "[\"manager\",\"meeting\",\"email\"]", attempts: 0 } }), { appealLessonPart: vi.fn() });
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    const speaking = document.querySelector('[data-part="speaking"]') as HTMLElement;
    await user.click(within(speaking).getByRole("button", { name: /báo lỗi/i }));
    expect(within(speaking).getByRole("region", { name: "Kháng nghị Nói" })).toBeInTheDocument();
    expect(within(speaking).getByLabelText("Lý do kháng nghị phần Nói")).toBeInTheDocument();
  });

  it("keeps a stored title and does not repeat an English title", async () => {
    const user = userEvent.setup();
    const lesson = monthlyLesson("A2", { pronunciation: { answer: "[\"manager\",\"meeting\",\"email\"]", attempts: 0 } });
    lesson.content.parts.find((part: any) => part.code === "listening").title = "Nghe hiểu";
    lesson.content.parts.find((part: any) => part.code === "reading").title = "Reading";
    renderLesson(lesson);
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByRole("heading", { name: "1. Nghe hiểu · Listening" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Reading" })).toBeInTheDocument();
  });
});

describe("One status line per exercise state", () => {
  const listened = { pronunciation: { answer: "[\"manager\",\"meeting\",\"email\"]", attempts: 0 } };

  it("after uploading, Speaking shows only the upload hint; after submitting, only 'waiting to be marked'", async () => {
    const user = userEvent.setup();
    const lesson = monthlyLesson("A2", { ...listened });
    const submitLessonPartAttempt = vi.fn().mockResolvedValue({
      progress: { ...lesson.progress, completedPartCodes: [...lesson.progress.completedPartCodes, "speaking"], evidence: { ...listened, speaking: { attempts: 1, status: "submitted", score: 0, artifactKey: "audio/1.webm", feedback: "Đã nhận file ghi âm. Bài được lưu để người vận hành kiểm tra khi AI không sẵn sàng." } } },
      evidence: { attempts: 1, status: "submitted", score: 0, artifactKey: "audio/1.webm" }
    });
    const uploadAssessmentAudio = vi.fn().mockResolvedValue("audio/1.webm");
    renderLesson(lesson, { submitLessonPartAttempt, uploadAssessmentAudio });
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    const speaking = document.querySelector('[data-part="speaking"]') as HTMLElement;
    await user.upload(within(speaking).getByLabelText("Tải file ghi âm speaking"), new File(["x"], "voice.webm", { type: "audio/webm" }));
    await waitFor(() => expect(within(speaking).getByText("Đã tải file ghi âm lên. Bấm Kiểm tra Nói để nộp.")).toBeInTheDocument());
    expect(within(speaking).queryByText(/Đã gửi để kiểm tra|đang chờ chấm/)).not.toBeInTheDocument();

    await user.click(within(speaking).getByRole("button", { name: "Kiểm tra nói" }));
    await waitFor(() => expect(within(speaking).getByText("Đã nộp bản ghi âm · đang chờ chấm.")).toBeInTheDocument());
    expect(within(speaking).queryByText("Đã tải file ghi âm lên. Bấm Kiểm tra Nói để nộp.")).not.toBeInTheDocument();
    expect(within(speaking).queryByText("Đã gửi để kiểm tra")).not.toBeInTheDocument();
    expect(within(speaking).queryByText(/người vận hành kiểm tra khi AI không sẵn sàng/)).not.toBeInTheDocument();
  });

  it.each([
    ["listening", { attempts: 1, status: "wrong_retry", score: 0, answer: "No.", feedback: "Chưa đúng. Bạn còn 1 lượt thử." }, "Chưa đúng. Bạn còn 1 lượt thử.", ["Chưa đúng · còn lượt thử"]],
    ["reading", { attempts: 2, status: "wrong_exhausted", score: 0, answer: "Yes", feedback: "Bạn đã hết lượt thử." }, "Bạn đã hết lượt thử.", ["Đã hết lượt thử"]],
    ["word_use", { attempts: 1, status: "correct", score: 100, answer: "fix", feedback: "Đúng rồi. Bạn đã hoàn thành phần này." }, "Đúng rồi. Bạn đã hoàn thành phần này.", []],
    ["writing", { attempts: 1, status: "submitted", score: 0, answer: "Our team meets weekly.", feedback: "Đã lưu câu tự viết để chấm tay khi AI chưa sẵn sàng." }, "Đã nộp câu tự viết · đang chờ chấm.", ["Đã gửi để kiểm tra", "Đã lưu câu tự viết để chấm tay khi AI chưa sẵn sàng."]],
    ["word_class", { attempts: 1, status: "appealed", score: 0, answer: "clients", feedback: "Chưa đúng." }, "Đã gửi kháng nghị", ["Chưa đúng."]]
  ] as const)("%s shows a single status line", async (code, evidence, expected, absent) => {
    const user = userEvent.setup();
    renderLesson(monthlyLesson("A2", { ...listened, [code]: evidence }));
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    const part = document.querySelector(`[data-part="${code}"]`) as HTMLElement;
    expect(within(part).getByText(expected)).toBeInTheDocument();
    for (const text of absent) expect(within(part).queryByText(text)).not.toBeInTheDocument();
  });
});
