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
