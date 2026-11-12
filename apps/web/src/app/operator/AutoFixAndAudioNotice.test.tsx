// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentLevelFormDetailView } from "@e4s/contracts";
import { ModalProvider } from "../shared/ModalProvider.js";
import { OperatorLevelFormDetail } from "./LevelForms.js";
import { MonthlyFinalReview } from "./MonthlyFinalReview.js";
import { MonthlyReviewPractice } from "./MonthlyReviewPractice.js";
import { emptyLesson, LessonFormEditor } from "./LessonFormEditor.js";
import { monthlyFinalView } from "../../../test/support/monthly-final-view.js";

afterEach(cleanup);

function levelDetail(stimulus: Record<string, unknown>, autoFixed?: string[]): AssessmentLevelFormDetailView {
  return {
    definitionId: "definition-1", versionId: "version-1", title: "Đề thi lên mức A2", version: 1, targetLevel: "A2", publishedAt: null,
    listeningTaskCount: 1, readingTaskCount: 0, attemptCount: 0, status: "draft", publicationReady: false, publicationBlockerCount: 1,
    sections: [{ code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Nghe"], groups: [{ key: "L1", title: "Part A – Booking", instruction: "Nghe", maxPlays: 2, stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text: "Script" }], ...stimulus }, tasks: [{ key: "L1_1", prompt: "Listen", responseType: "single_choice", maxScore: 1, options: [{ value: "A", label: "a" }, { value: "B", label: "b" }], correctAnswer: "A" }] }] }],
    warnings: [{ code: "quality_check", severity: "warning", message: "Phần Nghe: câu 3 cần đọc lại." }],
    versions: [], deletable: true, deleteReason: null,
    ...(autoFixed ? { autoFixed } : {})
  } as unknown as AssessmentLevelFormDetailView;
}

describe("generation auto-fix note", () => {
  it("lists what the system fixed above the checklist and keeps the human answer-review tick", () => {
    render(<OperatorLevelFormDetail detail={levelDetail({ audioSrc: "/a.mp3" }, [
      "Phần Nghe: đổi thứ tự lựa chọn để đáp án chia đều A/B/C/D (bản AI dồn vào B 8/20); nội dung câu và đáp án giữ nguyên.",
      "Phần Đọc: thay câu 38 (trùng ý với câu 11) bằng câu hỏi mới về chi tiết khác của bài."
    ])} editing onClose={vi.fn()} onSave={vi.fn()} onPublish={vi.fn()} publicationReady />);
    const note = screen.getByRole("status", { name: "Hệ thống đã tự sửa" });
    expect(note).toHaveTextContent("Hệ thống đã tự sửa:");
    expect(within(note).getAllByRole("listitem")).toHaveLength(2);
    expect(note).toHaveTextContent("dồn vào B 8/20");
    // Only what is still open stays in the checklist.
    expect(screen.getByRole("region", { name: "Cảnh báo kiểm tra đề" })).toHaveTextContent("1 mục");
    expect(screen.getByRole("checkbox", { name: "Tôi đã đọc lại đáp án từng câu" })).not.toBeChecked();
  });

  it("shows nothing when the generation fixed nothing", () => {
    render(<OperatorLevelFormDetail detail={levelDetail({ audioSrc: "/a.mp3" })} onClose={vi.fn()} />);
    expect(screen.queryByRole("status", { name: "Hệ thống đã tự sửa" })).not.toBeInTheDocument();
  });

  it("shows the monthly final's auto-fixed note", () => {
    const draft = monthlyFinalView();
    draft.exam!.autoFixed = ["Phần Đọc: đổi thứ tự lựa chọn để đáp án chia đều A/B/C (bản AI: A 1 · B 6 · C 1); nội dung câu và đáp án giữ nguyên."];
    render(<ModalProvider><MonthlyFinalReview draft={draft} onClose={vi.fn()} onSave={vi.fn()} /></ModalProvider>);
    expect(screen.getByRole("status", { name: "Hệ thống đã tự sửa" })).toHaveTextContent("Hệ thống đã tự sửa: Phần Đọc: đổi thứ tự lựa chọn");
  });
});

describe("automatic audio status", () => {
  const warning = /Chưa tạo được audio tự động \(mã EDGE_TTS_UNAVAILABLE\) — bấm Sinh audio Edge TTS để thử lại/u;

  it("warns on a listening group whose automatic synthesis failed", () => {
    render(<OperatorLevelFormDetail detail={levelDetail({ audioSynthesis: { status: "failed", code: "EDGE_TTS_UNAVAILABLE" } })} editing onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText(warning)).toBeInTheDocument();
  });

  it("adds nothing when the audio was generated, or once a file exists", () => {
    render(<OperatorLevelFormDetail detail={levelDetail({ audioSrc: "/a.mp3", audioSynthesis: { status: "generated" } })} editing onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText(/Chưa tạo được audio tự động/u)).not.toBeInTheDocument();
    cleanup();
    render(<OperatorLevelFormDetail detail={levelDetail({ audioSrc: "/manual.mp3", audioSynthesis: { status: "failed", code: "EDGE_TTS_FAILED" } })} editing onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText(/Chưa tạo được audio tự động/u)).not.toBeInTheDocument();
  });

  it("warns on the monthly final listening message", () => {
    const draft = monthlyFinalView();
    const group = draft.blueprint.sections[0]!.groups[0]!;
    group.stimulus = { ...group.stimulus!, audioSynthesis: { status: "failed", code: "EDGE_TTS_UNAVAILABLE" } };
    render(<ModalProvider><MonthlyFinalReview draft={draft} onClose={vi.fn()} onSave={vi.fn()} /></ModalProvider>);
    expect(screen.getByText(warning)).toBeInTheDocument();
  });

  it("warns on a Friday review listening item without audio", () => {
    render(<MonthlyReviewPractice parts={[{ code: "listening", content: { items: [
      { id: "l1", prompt: "Which word?", options: ["invoice", "invite"], answer: "invoice", audioText: "invoice", audioSynthesis: { status: "failed", code: "EDGE_TTS_FAILED" } },
      { id: "l2", prompt: "Which word?", options: ["budget", "badge"], answer: "budget", audioText: "budget", audioUrl: "/b.mp3", audioSynthesis: { status: "generated" } }
    ] } }]} />);
    expect(screen.getAllByText(/Chưa tạo được audio tự động \(mã EDGE_TTS_FAILED\)/u)).toHaveLength(1);
  });

  it("warns on a monthly lesson listening part without audio", () => {
    const lesson = emptyLesson(1);
    lesson.parts = lesson.parts.map((part) => part.code === "listening" ? { ...part, content: { ...part.content, script: "Please call the client.", audioSynthesis: { status: "failed", code: "EDGE_TTS_UNAVAILABLE" } } } : part);
    render(<ModalProvider><LessonFormEditor weekNumber={2} cefr="A2" initial={lesson} onSave={vi.fn()} onCancel={() => undefined} /></ModalProvider>);
    expect(screen.getByText(/Chưa tạo được audio tự động \(mã EDGE_TTS_UNAVAILABLE\) — tải file audio phần Nghe hoặc sinh lại bài để thử lại/u)).toBeInTheDocument();
  });
});
