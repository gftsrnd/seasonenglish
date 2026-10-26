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
    fireEvent.change(screen.getByLabelText("Audio word family: colleague URL"), { target: { value: "/audio/colleague.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio word family: collegial URL"), { target: { value: "/audio/collegial.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ đồng nghĩa: coworker URL"), { target: { value: "/audio/coworker.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ trái nghĩa: competitor URL"), { target: { value: "/audio/competitor.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ bao trùm: people at work URL"), { target: { value: "/audio/people-at-work.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ cùng nhóm: manager URL"), { target: { value: "/audio/manager.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ cùng nhóm: client URL"), { target: { value: "/audio/client.mp3" } });
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));

    const saved = onSave.mock.calls[0]?.[0];
    const vocabulary = saved.parts.find((part: { code: string }) => part.code === "vocabulary")?.content.items[0];
    expect(vocabulary).toEqual(expect.objectContaining({
      family: [
        { word: "colleague", type: "noun", meaning: "đồng nghiệp", audioUrl: "/audio/colleague.mp3" },
        { word: "collegial", type: "adjective", meaning: "mang tính đồng nghiệp", audioUrl: "/audio/collegial.mp3" }
      ],
      synonyms: [
        { word: "coworker", level: "A2", note: "phổ biến", audioUrl: "/audio/coworker.mp3" },
        { word: "associate", level: "B1", note: "trang trọng" }
      ],
      antonyms: [{ word: "competitor", level: "B1", note: "đối thủ", audioUrl: "/audio/competitor.mp3" }],
      umbrella: {
        word: "people at work",
        meaning: "người trong công việc",
        audioUrl: "/audio/people-at-work.mp3",
        siblings: [
          { word: "manager", meaning: "quản lý", audioUrl: "/audio/manager.mp3" },
          { word: "client", meaning: "khách hàng", audioUrl: "/audio/client.mp3" }
        ]
      }
    }));

    cleanup();
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={saved} onSave={vi.fn()} onCancel={() => undefined} />);
    expect(screen.getByLabelText("Word family từ 1")).toHaveValue("colleague | noun | đồng nghiệp; collegial | adjective | mang tính đồng nghiệp");
    expect(screen.getByLabelText("Từ đồng nghĩa từ 1")).toHaveValue("coworker | A2 | phổ biến; associate | B1 | trang trọng");
    expect(screen.getByLabelText("Từ trái nghĩa từ 1")).toHaveValue("competitor | B1 | đối thủ");
    expect(screen.getByLabelText("Từ cùng nhóm từ 1")).toHaveValue("manager | quản lý; client | khách hàng");
    expect(screen.getByLabelText("Audio word family: colleague URL")).toHaveValue("/audio/colleague.mp3");
    expect(screen.getByLabelText("Audio từ đồng nghĩa: coworker URL")).toHaveValue("/audio/coworker.mp3");
    expect(screen.getByLabelText("Audio từ trái nghĩa: competitor URL")).toHaveValue("/audio/competitor.mp3");
    expect(screen.getByLabelText("Audio từ bao trùm: people at work URL")).toHaveValue("/audio/people-at-work.mp3");
    expect(screen.getByLabelText("Audio từ cùng nhóm: client URL")).toHaveValue("/audio/client.mp3");
  });

  it("uses clear styled media actions instead of a raw file chooser", () => {
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={vi.fn()} onCancel={() => undefined} uploadMedia={vi.fn()} />);
    expect(screen.getAllByText("Chọn audio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chọn ảnh")).toHaveLength(3);
    expect(screen.queryByText("Tải file")).not.toBeInTheDocument();
  });

  it("opens AI-generated lessons in the same complete manual editor and preserves structured fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const generated = emptyLesson(1);
    generated.title = "Handling a delayed order";
    generated.parts = generated.parts.map(part => {
      if (part.code === "objective") return { ...part, content: { items: [
        { id: "C1", type: "content", text: "SWBAT explain one delivery delay." },
        { id: "L1", type: "language", text: "SWBAT use due to in one sentence." }
      ] } };
      if (part.code === "grammar") return { ...part, content: { formula: "The order is delayed due to + noun", usage: "Use this to give a reason.", examples: ["The order is delayed due to weather."] } };
      if (part.code === "word_class") return { ...part, content: { prompt: "What word class is delayed?", options: ["noun", "verb", "adjective", "adverb"], answer: "adjective" } };
      if (part.code === "word_use") return { ...part, content: { prompt: "Choose the natural sentence.", options: ["The order is delayed.", "The order delayed is.", "Delayed order the is.", "Is order delayed the."], answer: "The order is delayed." } };
      return part;
    });

    render(<LessonFormEditor weekNumber={1} cefr="B1" initial={generated} onSave={onSave} onCancel={() => undefined} />);

    expect(screen.getByRole("dialog", { name: "Sửa bài T2 · Tuần 1 · B1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mục tiêu bài học")).toHaveValue("SWBAT explain one delivery delay.\nSWBAT use due to in one sentence.");
    expect(screen.getByLabelText("Ngữ pháp")).toHaveValue("The order is delayed due to + noun");
    expect(screen.getByLabelText("Cách dùng ngữ pháp")).toHaveValue("Use this to give a reason.");
    expect(screen.getByLabelText("Từ loại – Câu hỏi")).toHaveValue("What word class is delayed?");
    expect(screen.getByLabelText("Dùng từ – Câu hỏi")).toHaveValue("Choose the natural sentence.");

    fireEvent.change(screen.getByLabelText("Mục tiêu bài học"), { target: { value: "Explain one delivery delay.\nUse due to correctly." } });
    fireEvent.change(screen.getByLabelText("Cách dùng ngữ pháp"), { target: { value: "Use it before a noun phrase." } });
    fireEvent.change(screen.getByLabelText("Từ loại – Câu hỏi"), { target: { value: "Which word is an adjective?" } });
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));

    const saved = onSave.mock.calls[0]?.[0];
    const byCode = (code: string) => saved.parts.find((part: { code: string }) => part.code === code)?.content;
    expect(byCode("objective").items).toEqual([
      expect.objectContaining({ id: "C1", text: "Explain one delivery delay." }),
      expect.objectContaining({ id: "L1", text: "Use due to correctly." })
    ]);
    expect(byCode("grammar")).toEqual(expect.objectContaining({ formula: "The order is delayed due to + noun", usage: "Use it before a noun phrase." }));
    expect(byCode("word_class")).toEqual(expect.objectContaining({ prompt: "Which word is an adjective?", answer: "adjective" }));
    expect(byCode("word_use")).toEqual(expect.objectContaining({ prompt: "Choose the natural sentence.", answer: "The order is delayed." }));
  });

  it("uploads and persists manual vocabulary images and lesson audio without AI", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const uploadMedia = vi.fn(async (kind: "audio" | "image", _file: Blob, filename: string) => ({
      url: `/api/v1/files/content-media/read?artifactKey=${kind}-${filename}`
    }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} uploadMedia={uploadMedia} />);

    const image = new File(["image"], "colleague.png", { type: "image/png" });
    const pronunciation = new File(["voice"], "pronunciation.mp3", { type: "audio/mpeg" });
    const listening = new File(["voice"], "listening.wav", { type: "audio/wav" });
    await user.upload(screen.getByLabelText("Tải Ảnh minh họa từ 1"), image);
    await user.upload(screen.getByLabelText("Tải Audio mẫu phát âm"), pronunciation);
    await user.upload(screen.getByLabelText("Tải File audio phần Nghe"), listening);
    expect(uploadMedia).toHaveBeenCalledTimes(3);
    expect(container.querySelector('input[accept="image/png,image/jpeg,image/webp,image/gif"]')).toBeInTheDocument();
    expect((screen.getByLabelText("Ảnh minh họa từ 1 URL") as HTMLInputElement).value).toContain("image-colleague.png");

    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.parts.find((part: { code: string }) => part.code === "vocabulary")?.content.items[0]).toEqual(expect.objectContaining({ imageUrl: expect.stringContaining("image-colleague.png") }));
    expect(saved.parts.find((part: { code: string }) => part.code === "pronunciation")?.content.audioUrl).toContain("audio-pronunciation.mp3");
    expect(saved.parts.find((part: { code: string }) => part.code === "listening")?.content.audioUrl).toContain("audio-listening.wav");
    expect(saved.parts.find((part: { code: string }) => part.code === "speaking")?.content.audioUrl).toBe("");

    cleanup();
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={saved} onSave={vi.fn()} onCancel={() => undefined} uploadMedia={uploadMedia} />);
    expect((screen.getByLabelText("Ảnh minh họa từ 1 URL") as HTMLInputElement).value).toContain("image-colleague.png");
    expect((screen.getByLabelText("Audio mẫu phát âm URL") as HTMLInputElement).value).toContain("audio-pronunciation.mp3");
    expect((screen.getByLabelText("File audio phần Nghe URL") as HTMLInputElement).value).toContain("audio-listening.wav");
    expect(screen.queryByLabelText("Audio mẫu phần Nói URL")).not.toBeInTheDocument();
  });

  it("offers audio only for learning content and the listening exercise", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} />);

    const sectionAudioLabels = [
      "Audio hướng dẫn làm bài URL",
      "Audio phần Ngữ pháp URL",
      "Audio mẫu phát âm URL",
      "File audio phần Nghe URL"
    ];
    expect(screen.queryByLabelText("Audio mục tiêu bài học URL")).not.toBeInTheDocument();
    ["Audio phần Đọc URL", "Audio phần Viết URL", "Audio phần Từ loại URL", "Audio phần Dùng từ URL", "Audio mẫu phần Nói URL"].forEach(label => {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    });
    sectionAudioLabels.forEach((label, index) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value: `/audio/section-${index + 1}.mp3` } });
    });
    [1, 2, 3].forEach((index) => {
      fireEvent.change(screen.getByLabelText(`Audio từ vựng ${index} URL`), { target: { value: `/audio/word-${index}.mp3` } });
      const vocabularyRow = screen.getByLabelText(`Từ vựng ${index}`);
      expect(vocabularyRow).toContainElement(screen.getByLabelText(`Ảnh minh họa từ ${index} URL`));
      expect(vocabularyRow).toContainElement(screen.getByLabelText(`Audio từ vựng ${index} URL`));
    });
    expect(screen.queryByText("Audio từng từ vựng", { selector: "legend" })).not.toBeInTheDocument();
    screen.getAllByLabelText(/^Tải /).forEach((input) => expect(input).toHaveAttribute("hidden"));

    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));

    const saved = onSave.mock.calls[0]?.[0];
    const byCode = (code: string) => saved.parts.find((part: { code: string }) => part.code === code)?.content;
    expect(byCode("objective").audioUrl).toBe("");
    expect(byCode("instruction").audioUrl).toBe("/audio/section-1.mp3");
    expect(byCode("grammar").audioUrl).toBe("/audio/section-2.mp3");
    expect(byCode("reading").audioUrl).toBe("");
    expect(byCode("writing").audioUrl).toBe("");
    expect(byCode("word_class").audioUrl).toBe("");
    expect(byCode("word_use").audioUrl).toBe("");
    expect(byCode("speaking").audioUrl).toBe("");
    expect(byCode("vocabulary").items.map((item: { audioUrl?: string }) => item.audioUrl)).toEqual([
      "/audio/word-1.mp3", "/audio/word-2.mp3", "/audio/word-3.mp3"
    ]);
  });
});
