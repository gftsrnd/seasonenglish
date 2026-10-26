// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyLesson, LessonFormEditor } from "./LessonFormEditor.js";

afterEach(cleanup);

describe("operator granular lesson editor", () => {
  it("matches the app field groups and requires a deliberate force-save for incomplete lessons", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} />);
    const editorDialog = screen.getByRole("dialog", { name: "Soạn bài T2 · Tuần 2 · A2" });
    expect(editorDialog).toHaveClass("dialog");
    expect(editorDialog.parentElement).toHaveClass("modal-backdrop");
    expect(editorDialog.querySelector(".operator-editor-heading h3")).toHaveTextContent("Soạn bài T2");
    ["Chung", "Ngữ pháp", "Từ vựng (3 từ)", "Phát âm", "Nghe", "Đọc", "Viết", "Nói"].forEach((name) => {
      expect(screen.getByText(name, { selector: "legend" })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Nghe – Lựa chọn 4")).toBeInTheDocument();
    expect(screen.getByLabelText("Từ loại từ 1")).toBeInTheDocument();
    expect(editorDialog.querySelectorAll(".operator-vocabulary-row")).toHaveLength(3);
    expect(screen.queryByRole("tab", { name: "JSON nâng cao" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Tiêu đề bài"));
    await user.type(screen.getByLabelText("Tiêu đề bài"), "Emails and rescheduling");
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("mục cần bổ sung");
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dayNumber: 1, title: "Emails and rescheduling", parts: expect.any(Array) }));
  });

  it("keeps the form keyboard-safe while pending and supports modal close controls", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={onCancel} />);

    const dialog = screen.getByRole("dialog", { name: "Soạn bài T2 · Tuần 2 · A2" });
    const close = screen.getByRole("button", { name: "Đóng" });
    expect(document.activeElement).toBe(close);

    expect(screen.getByLabelText("Tiêu đề bài")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Kiểm tra & lưu" });
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(2);

    cleanup();
    render(<LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={onCancel} busy />);
    const pendingDialog = screen.getByRole("dialog", { name: "Soạn bài T2 · Tuần 2 · A2" });
    expect(pendingDialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Tiêu đề bài")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Đang lưu/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Đang lưu");
  });

  it("persists the speaking requirement separately from the model sentence", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} />);

    await user.clear(screen.getByLabelText("Tiêu đề bài"));
    await user.type(screen.getByLabelText("Tiêu đề bài"), "Giving feedback");
    await user.clear(screen.getByLabelText("Yêu cầu"));
    await user.type(screen.getByLabelText("Yêu cầu"), "Nói một điểm tốt về công việc.");
    await user.type(screen.getByLabelText("Câu mẫu học viên phải nói"), "Your report is good.");
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.parts.find((part: { code: string }) => part.code === "speaking")?.content).toEqual(expect.objectContaining({
      instruction: "Nói một điểm tốt về công việc.",
      sample: "Your report is good."
    }));
  });

  it("stores no-suitable grammar as unavailable instead of forcing invented content", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} />);

    await user.click(screen.getByRole("checkbox", { name: "Bài này không có nội dung ngữ pháp phù hợp" }));
    expect(screen.getByLabelText("Ngữ pháp")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.parts.find((part: { code: string }) => part.code === "grammar")?.content).toEqual(expect.objectContaining({
      status: "unavailable",
      hidden: true,
      reason: "no_suitable_content"
    }));
  });

  it("round-trips manually edited vocabulary relationships", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} />);

    await user.click(screen.getByText("Mở rộng từ 1"));
    await user.type(screen.getByLabelText("Word family từ 1"), "colleague | noun | đồng nghiệp; collegial | adjective | mang tính đồng nghiệp");
    await user.type(screen.getByLabelText("Từ đồng nghĩa từ 1"), "coworker | A2 | phổ biến; associate | B1 | trang trọng");
    await user.type(screen.getByLabelText("Từ trái nghĩa từ 1"), "competitor | B1 | đối thủ");
    await user.type(screen.getByLabelText("Từ bao trùm từ 1"), "people at work");
    await user.type(screen.getByLabelText("Nghĩa từ bao trùm từ 1"), "người trong công việc");
    await user.type(screen.getByLabelText("Từ cùng nhóm từ 1"), "manager | quản lý; client | khách hàng");
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));

    const saved = onSave.mock.calls[0]?.[0];
    const vocabulary = saved.parts.find((part: { code: string }) => part.code === "vocabulary")?.content.items[0];
    expect(vocabulary).toEqual(expect.objectContaining({
      family: [
        { word: "colleague", type: "noun", meaning: "đồng nghiệp" },
        { word: "collegial", type: "adjective", meaning: "mang tính đồng nghiệp" }
      ],
      synonyms: [
        { word: "coworker", level: "A2", note: "phổ biến" },
        { word: "associate", level: "B1", note: "trang trọng" }
      ],
      antonyms: [{ word: "competitor", level: "B1", note: "đối thủ" }],
      umbrella: {
        word: "people at work",
        meaning: "người trong công việc",
        siblings: [{ word: "manager", meaning: "quản lý" }, { word: "client", meaning: "khách hàng" }]
      }
    }));

    cleanup();
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={saved} onSave={vi.fn()} onCancel={() => undefined} />);
    expect(screen.getByLabelText("Word family từ 1")).toHaveValue("colleague | noun | đồng nghiệp; collegial | adjective | mang tính đồng nghiệp");
    expect(screen.getByLabelText("Từ đồng nghĩa từ 1")).toHaveValue("coworker | A2 | phổ biến; associate | B1 | trang trọng");
    expect(screen.getByLabelText("Từ trái nghĩa từ 1")).toHaveValue("competitor | B1 | đối thủ");
    expect(screen.getByLabelText("Từ cùng nhóm từ 1")).toHaveValue("manager | quản lý; client | khách hàng");
  });
});
