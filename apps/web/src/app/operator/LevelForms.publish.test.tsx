// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentLevelFormDetailView } from "@e4s/contracts";
import { OperatorLevelFormDetail } from "./LevelForms.js";

afterEach(cleanup);

const detail = {
  definitionId: "definition-1", versionId: "version-1", title: "Đề B1", version: 2, targetLevel: "B1", publishedAt: null,
  listeningTaskCount: 1, readingTaskCount: 1, attemptCount: 0, status: "draft", publicationReady: true, publicationBlockerCount: 0,
  sections: [
    { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Nghe"], groups: [{ key: "L1", title: "Part A", instruction: "Nghe", maxPlays: 2, stimulus: { type: "audio_script", audioSrc: "/a.ogg", lines: [{ speaker: "Narrator", text: "Script" }] }, tasks: [{ key: "L1_1", prompt: "Question", responseType: "single_choice", maxScore: 1, options: [{ value: "A", label: "One" }, { value: "B", label: "Two" }], correctAnswer: "B" }] }] },
    { code: "reading", title: "Đọc", durationMinutes: 25, maxScore: 40, instructions: ["Đọc"], groups: [{ key: "R1", title: "Part A", instruction: "Đọc", stimulus: { type: "passage", text: "Passage" }, tasks: [{ key: "R1_1", prompt: "Read", responseType: "single_choice", maxScore: 1, options: [{ value: "A", label: "Yes" }, { value: "B", label: "No" }], correctAnswer: "A" }] }] }
  ],
  warnings: [{ code: "quality_check", severity: "warning", message: "Đọc câu 14 (câu đếm): con số của đáp án “Three times” không thấy trong bài; cần đếm lại." }],
  versions: [], deletable: true, deleteReason: null
} as unknown as AssessmentLevelFormDetailView;

describe("level-up publish confirmation (D3)", () => {
  it("authors writing messages and speaking tables without converting their stimulus types", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const form = structuredClone(detail);
    form.sections.push(
      { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: [], groups: [{ key: "W", title: "Email", instruction: "", stimulus: { type: "message", text: "" }, tasks: [{ key: "W1", prompt: "Reply", responseType: "long_text", maxScore: 20 }] }] },
      { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: [], groups: [{ key: "S", title: "Report", instruction: "", stimulus: { type: "table", headers: [""], rows: [[""]] }, tasks: [{ key: "S1", prompt: "Describe", responseType: "speaking_evidence", maxScore: 20 }] }] }
    );
    render(<OperatorLevelFormDetail detail={form} editing onClose={vi.fn()} onSave={onSave} />);
    await user.type(screen.getByRole("textbox", { name: "Hướng dẫn Email" }), "Write a reply.");
    await user.type(screen.getByRole("textbox", { name: "Ngữ liệu Email" }), "Please send the report.");
    await user.type(screen.getByRole("textbox", { name: "Tiêu đề cột 1 Report" }), "Quarter");
    await user.type(screen.getByRole("textbox", { name: "Dòng 1 cột 1 Report" }), "Q1");
    await user.click(screen.getByRole("button", { name: "Thêm cột Report" }));
    await user.type(screen.getByRole("textbox", { name: "Tiêu đề cột 2 Report" }), "Sales");
    await user.type(screen.getByRole("textbox", { name: "Dòng 1 cột 2 Report" }), "100");
    await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sections: expect.arrayContaining([
      expect.objectContaining({ code: "writing", groups: [expect.objectContaining({ instruction: "Write a reply.", stimulus: { type: "message", text: "Please send the report." } })] }),
      expect.objectContaining({ code: "speaking", groups: [expect.objectContaining({ stimulus: { type: "table", headers: ["Quarter", "Sales"], rows: [["Q1", "100"]] } })] })
    ]) }));
  });
  it("preserves dialogue speaker labels for manual synthesis even in text-only editor mode", async () => {
    const user = userEvent.setup();
    const synthesizeEdgeTts = vi.fn().mockResolvedValue({ base64: "YQ==", filename: "dialogue.mp3", mimeType: "audio/mpeg" });
    const uploadAudio = vi.fn().mockResolvedValue({ url: "/dialogue.mp3" });
    const dialogue = structuredClone(detail);
    dialogue.sections[0]!.groups[0]!.stimulus!.lines = [{ speaker: "Man", text: "Good morning." }, { speaker: "Woman", text: "Hello." }];
    render(<OperatorLevelFormDetail detail={dialogue} editing speakTextOnly onClose={vi.fn()} synthesizeEdgeTts={synthesizeEdgeTts} uploadAudio={uploadAudio} />);
    await user.click(screen.getByRole("button", { name: "Sinh audio Edge TTS" }));
    await waitFor(() => expect(synthesizeEdgeTts).toHaveBeenCalledWith({ text: "Man: Good morning.\nWoman: Hello.", voice: "en-US-AvaMultilingualNeural" }));
  });
  it("requires the answer-review checkbox before publishing and sends the confirmation", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<OperatorLevelFormDetail detail={detail} editing publicationReady onClose={vi.fn()} onSave={vi.fn()} onPublish={onPublish} />);
    const status = screen.getByRole("region", { name: "Trạng thái đề lên mức" });
    const publish = within(status).getByRole("button", { name: "Duyệt & phát hành" });
    expect(publish).toBeDisabled();
    expect(status).toHaveTextContent("Đánh dấu đã đọc lại đáp án từng câu trước khi phát hành.");
    await user.click(publish);
    expect(onPublish).not.toHaveBeenCalled();

    const review = within(status).getByRole("checkbox", { name: "Tôi đã đọc lại đáp án từng câu" });
    await user.click(review);
    expect(publish).toBeEnabled();
    await user.click(publish);
    await waitFor(() => expect(onPublish).toHaveBeenCalledWith({ answersReviewed: true }));
  });

  it("shows the saved content-gate warnings in the existing validation list", () => {
    render(<OperatorLevelFormDetail detail={detail} editing publicationReady onClose={vi.fn()} onPublish={vi.fn()} />);
    const validation = screen.getByRole("region", { name: "Cảnh báo kiểm tra đề" });
    expect(validation).toHaveTextContent("Nội dung");
    expect(validation).toHaveTextContent("“Three times” không thấy trong bài");
  });
});
