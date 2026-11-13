// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalProvider } from "../shared/ModalProvider.js";
import { emptyLesson, LessonFormEditor } from "./LessonFormEditor.js";

afterEach(cleanup);

describe("operator granular lesson editor", () => {
  it("matches the app field groups and requires a deliberate force-save for incomplete lessons", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ModalProvider><LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
    const editorDialog = screen.getByRole("dialog", { name: "Soạn bài T2 · Tuần 2 · A2" });
    expect(editorDialog).toHaveClass("dialog");
    expect(editorDialog.parentElement).toHaveClass("modal-backdrop");
    expect(editorDialog.querySelector(".operator-editor-heading h3")).toHaveTextContent("Soạn bài T2");
    const orderedSections = ["Chung", "Hướng dẫn", "Từ vựng (3 từ)", "Ngữ pháp", "Phát âm", "Nghe", "Đọc", "Viết", "Từ loại", "Dùng từ", "Nói"];
    orderedSections.forEach((name) => {
      expect(screen.getByText(name, { selector: "legend" })).toBeInTheDocument();
    });
    expect(Array.from(editorDialog.querySelectorAll("legend")).map(legend => legend.textContent)).toEqual(orderedSections);
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
    await user.keyboard("{Escape}");
    expect(onSave).not.toHaveBeenCalled();
    expect(editorDialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dayNumber: 1, title: "Emails and rescheduling", parts: expect.any(Array) }));
  });

  it("keeps the form keyboard-safe while pending and supports modal close controls", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<ModalProvider><LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={onCancel} /></ModalProvider>);

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
    render(<ModalProvider><LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={onCancel} busy /></ModalProvider>);
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
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);

    await user.clear(screen.getByLabelText("Tiêu đề bài"));
    await user.type(screen.getByLabelText("Tiêu đề bài"), "Giving feedback");
    await user.clear(screen.getByLabelText("Yêu cầu"));
    await user.type(screen.getByLabelText("Yêu cầu"), "Nói một điểm tốt về công việc.");
    await user.type(screen.getByLabelText("Câu mẫu học viên phải nói"), "Your report is good.");
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.parts.find((part: { code: string }) => part.code === "speaking")?.content).toEqual(expect.objectContaining({
      instruction: "Nói một điểm tốt về công việc.",
      sample: "Your report is good."
    }));
  });

  it("stores no-suitable grammar as unavailable instead of forcing invented content", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);

    await user.click(screen.getByRole("checkbox", { name: "Bài này không có nội dung ngữ pháp phù hợp" }));
    expect(screen.queryByLabelText("Ngữ pháp")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.parts.find((part: { code: string }) => part.code === "grammar")?.content).toEqual(expect.objectContaining({
      status: "unavailable",
      hidden: true,
      reason: "no_suitable_content"
    }));
  });

  it("keeps relationship data and shows separate audio uploads for expanded words", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);

    await user.click(screen.getByText("Mở rộng từ 1"));
    await user.type(screen.getByLabelText("Họ từ của từ 1"), "colleague | noun | đồng nghiệp; collegial | adjective | mang tính đồng nghiệp");
    await user.type(screen.getByLabelText("Từ đồng nghĩa từ 1"), "coworker | A2 | phổ biến; associate | B1 | trang trọng");
    await user.type(screen.getByLabelText("Từ trái nghĩa từ 1"), "competitor | B1 | đối thủ");
    await user.type(screen.getByLabelText("Từ bao trùm từ 1"), "people at work");
    await user.type(screen.getByLabelText("Nghĩa từ bao trùm từ 1"), "người trong công việc");
    await user.type(screen.getByLabelText("Từ cùng nhóm từ 1"), "manager | quản lý; client | khách hàng");
    expect(screen.getByLabelText("Audio họ từ: colleague URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Audio từ đồng nghĩa: coworker URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Audio từ trái nghĩa: competitor URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Audio từ bao trùm: people at work URL")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));

    const saved = onSave.mock.calls[0]?.[0];
    const vocabulary = saved.parts.find((part: { code: string }) => part.code === "vocabulary")?.content.items[0];
    expect(vocabulary.family).toEqual(expect.arrayContaining([expect.objectContaining({ word: "colleague", type: "noun", meaning: "đồng nghiệp" })]));
    expect(vocabulary.synonyms).toEqual(expect.arrayContaining([expect.objectContaining({ word: "coworker", level: "A2", note: "phổ biến" })]));
    expect(vocabulary.antonyms).toEqual(expect.arrayContaining([expect.objectContaining({ word: "competitor", level: "B1", note: "đối thủ" })]));
    expect(vocabulary.umbrella).toEqual(expect.objectContaining({
      word: "people at work",
      meaning: "người trong công việc",
      siblings: expect.arrayContaining([expect.objectContaining({ word: "manager", meaning: "quản lý" })])
    }));

    cleanup();
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={saved} onSave={vi.fn()} onCancel={() => undefined} /></ModalProvider>);
    expect(screen.getByLabelText("Họ từ của từ 1")).toHaveValue("colleague | noun | đồng nghiệp; collegial | adjective | mang tính đồng nghiệp");
    expect(screen.getByLabelText("Từ đồng nghĩa từ 1")).toHaveValue("coworker | A2 | phổ biến; associate | B1 | trang trọng");
    expect(screen.getByLabelText("Từ trái nghĩa từ 1")).toHaveValue("competitor | B1 | đối thủ");
    expect(screen.getByLabelText("Từ cùng nhóm từ 1")).toHaveValue("manager | quản lý; client | khách hàng");
    expect(screen.getByLabelText("Audio họ từ: colleague URL")).toBeInTheDocument();
  });

  it("uses clear styled media actions instead of a raw file chooser", () => {
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={vi.fn()} onCancel={() => undefined} uploadMedia={vi.fn()} /></ModalProvider>);
    expect(screen.getAllByText("Chọn audio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chọn ảnh")).toHaveLength(3);
    expect(screen.queryByText("Tải file")).not.toBeInTheDocument();
  });

  it("opens AI-generated lessons in the same complete manual editor and preserves structured fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
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

    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="B1" initial={generated} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);

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
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));

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

  it("uploads and persists manual vocabulary images and listening audio without AI", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const uploadMedia = vi.fn(async (kind: "audio" | "image", _file: Blob, filename: string) => ({
      url: `/api/v1/files/content-media/read?artifactKey=${kind}-${filename}`
    }));
    const { container } = render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} uploadMedia={uploadMedia} /></ModalProvider>);

    const image = new File(["image"], "colleague.png", { type: "image/png" });
    const listening = new File(["voice"], "listening.wav", { type: "audio/wav" });
    await user.upload(screen.getByLabelText("Tải Ảnh minh họa từ 1"), image);
    await user.upload(screen.getByLabelText("Tải File audio phần Nghe"), listening);
    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(container.querySelector('input[accept="image/png,image/jpeg,image/webp,image/gif"]')).toBeInTheDocument();
    expect((screen.getByLabelText("Ảnh minh họa từ 1 URL") as HTMLInputElement).value).toContain("image-colleague.png");

    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.parts.find((part: { code: string }) => part.code === "vocabulary")?.content.items[0]).toEqual(expect.objectContaining({ imageUrl: expect.stringContaining("image-colleague.png") }));
    expect(saved.parts.find((part: { code: string }) => part.code === "pronunciation")?.content.audioUrl).toBe("");
    expect(saved.parts.find((part: { code: string }) => part.code === "listening")?.content.audioUrl).toContain("audio-listening.wav");
    expect(saved.parts.find((part: { code: string }) => part.code === "speaking")?.content.audioUrl).toBe("");

    cleanup();
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={saved} onSave={vi.fn()} onCancel={() => undefined} uploadMedia={uploadMedia} /></ModalProvider>);
    expect((screen.getByLabelText("Ảnh minh họa từ 1 URL") as HTMLInputElement).value).toContain("image-colleague.png");
    expect(screen.queryByLabelText("Audio mẫu phát âm URL")).not.toBeInTheDocument();
    expect((screen.getByLabelText("File audio phần Nghe URL") as HTMLInputElement).value).toContain("audio-listening.wav");
    expect(screen.queryByLabelText("Audio mẫu phần Nói URL")).not.toBeInTheDocument();
  });

  it("offers and persists a separate audio file for every vocabulary phrase and relation", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A1" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} uploadMedia={vi.fn()} /></ModalProvider>);

    fireEvent.change(screen.getByLabelText("Cụm từ 1"), { target: { value: "every day; one day; day shift" } });
    fireEvent.change(screen.getByLabelText("Họ từ của từ 1"), { target: { value: "daily | adjective | hằng ngày" } });
    fireEvent.change(screen.getByLabelText("Từ đồng nghĩa từ 1"), { target: { value: "date | A1 | ngày tháng" } });
    fireEvent.change(screen.getByLabelText("Từ trái nghĩa từ 1"), { target: { value: "night | A1 | ban đêm" } });
    fireEvent.change(screen.getByLabelText("Từ bao trùm từ 1"), { target: { value: "time" } });
    fireEvent.change(screen.getByLabelText("Từ cùng nhóm từ 1"), { target: { value: "hour | giờ" } });

    const audioFields = [
      ["Audio cụm từ 1.1 URL", "/audio/every-day.mp3"],
      ["Audio cụm từ 1.2 URL", "/audio/one-day.mp3"],
      ["Audio cụm từ 1.3 URL", "/audio/day-shift.mp3"],
      ["Audio họ từ: daily URL", "/audio/daily.mp3"],
      ["Audio từ đồng nghĩa: date URL", "/audio/date.mp3"],
      ["Audio từ trái nghĩa: night URL", "/audio/night.mp3"],
      ["Audio từ bao trùm: time URL", "/audio/time.mp3"],
      ["Audio từ cùng nhóm: hour URL", "/audio/hour.mp3"]
    ] as const;
    audioFields.forEach(([label, value]) => fireEvent.change(screen.getByLabelText(label), { target: { value } }));

    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));
    const item = onSave.mock.calls[0]?.[0].parts.find((part: { code: string }) => part.code === "vocabulary")?.content.items[0];
    expect(item.collocationAudioUrls).toEqual(["/audio/every-day.mp3", "/audio/one-day.mp3", "/audio/day-shift.mp3"]);
    expect(item.family[0].audioUrl).toBe("/audio/daily.mp3");
    expect(item.synonyms[0].audioUrl).toBe("/audio/date.mp3");
    expect(item.antonyms[0].audioUrl).toBe("/audio/night.mp3");
    expect(item.umbrella.audioUrl).toBe("/audio/time.mp3");
    expect(item.umbrella.siblings[0].audioUrl).toBe("/audio/hour.mp3");
  });

  it("offers word and sentence audio without any target-phoneme audio control", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);

    expect(screen.queryByLabelText("Audio mục tiêu bài học URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Audio hướng dẫn làm bài URL")).not.toBeInTheDocument();
    expect(screen.getByLabelText("File audio phần Nghe URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("Audio Ngữ pháp URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Audio âm mục tiêu URL")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Bật audio cho Ngữ pháp" }));
    expect(screen.queryByRole("checkbox", { name: "Bật audio cho âm mục tiêu" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByText("Câu ví dụ để đọc thành tiếng").closest("label")!.querySelector("textarea")!, { target: { value: "I fell down.; She slipped." } });
    fireEvent.change(screen.getByLabelText("3 từ luyện âm"), { target: { value: "down, road, hold" } });
    fireEvent.change(screen.getByLabelText("Audio Ngữ pháp URL"), { target: { value: "/audio/grammar.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio ví dụ ngữ pháp: I fell down. URL"), { target: { value: "/audio/grammar-example-1.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio ví dụ ngữ pháp: She slipped. URL"), { target: { value: "/audio/grammar-example-2.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ luyện âm: down URL"), { target: { value: "/audio/down.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ luyện âm: road URL"), { target: { value: "/audio/road.mp3" } });
    fireEvent.change(screen.getByLabelText("Audio từ luyện âm: hold URL"), { target: { value: "/audio/hold.mp3" } });
    ["Audio phần Đọc URL", "Audio phần Viết URL", "Audio phần Từ loại URL", "Audio phần Dùng từ URL", "Audio mẫu phần Nói URL"].forEach(label => {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));

    const saved = onSave.mock.calls[0]?.[0];
    const byCode = (code: string) => saved.parts.find((part: { code: string }) => part.code === code)?.content;
    expect(byCode("objective").audioUrl).toBe("");
    expect(byCode("instruction").audioUrl).toBe("");
    expect(byCode("grammar").audioUrl).toBe("/audio/grammar.mp3");
    expect(byCode("grammar").exampleAudioUrls).toEqual(["/audio/grammar-example-1.mp3", "/audio/grammar-example-2.mp3"]);
    expect(byCode("pronunciation")).not.toHaveProperty("phonemeAudioUrl");
    expect(byCode("pronunciation")).not.toHaveProperty("phonemeAudioId");
    expect(byCode("pronunciation").wordAudioUrls).toEqual(["/audio/down.mp3", "/audio/road.mp3", "/audio/hold.mp3"]);
    expect(byCode("reading").audioUrl).toBe("");
    expect(byCode("writing").audioUrl).toBe("");
    expect(byCode("word_class").audioUrl).toBe("");
    expect(byCode("word_use").audioUrl).toBe("");
    expect(byCode("speaking").audioUrl).toBe("");
    expect(byCode("vocabulary").items.map((item: { audioUrl?: string }) => item.audioUrl)).toEqual([
      "/audio/word-1.mp3", "/audio/word-2.mp3", "/audio/word-3.mp3"
    ]);
  });

  it("drops legacy target-phoneme audio when saving while keeping IPA words", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initial = emptyLesson(1);
    initial.parts = initial.parts.map(part => part.code === "pronunciation"
      ? { ...part, content: { focus: "/eɪ/", words: ["safe", "day", "take"], phonemeAudioUrl: "/audio/ay.mp3" } }
      : part
    );

    render(<ModalProvider><LessonFormEditor weekNumber={1} cefr="A2" initial={initial} onSave={onSave} onCancel={() => undefined} uploadMedia={vi.fn()} /></ModalProvider>);
    expect(screen.queryByLabelText("Audio âm mục tiêu URL")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));

    const pronunciation = onSave.mock.calls[0]?.[0].parts.find((part: { code: string }) => part.code === "pronunciation")?.content;
    expect(pronunciation).toEqual(expect.objectContaining({ focus: "/eɪ/", words: ["safe", "day", "take"], audioUrl: "" }));
    expect(pronunciation).not.toHaveProperty("phonemeAudioId");
    expect(pronunciation).not.toHaveProperty("phonemeAudioUrl");
  });

  it("monthly lessons hide the legacy per-item media fields but save their stored values unchanged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const initial = { dayNumber: 2, title: "Bài 3", durationMinutes: 10, parts: [
      { code: "vocabulary" as const, title: "Từ vựng", content: { items: [{ word: "report", meaning: "báo cáo", collocations: ["send a report", "a short report", "report data"], collocationAudioUrls: ["/a1.mp3", "", ""], imageUrl: "/illustrations/report.png", imageAttribution: { creator: "E4S (AI minh họa)", licence: "Nội dung nội bộ", licenceUrl: "", sourceUrl: "/illustrations/report.png" }, audioUrl: "/word.mp3" }] } },
      { code: "grammar" as const, title: "Ngữ pháp", content: { formula: "Subject + V", examples: ["I send it."], exampleAudioUrls: ["/g1.mp3"], dailyCode: "A3", objective: "A3 Bước 2 - Biến thể: Luyện câu phủ định.", milestoneIds: ["a2-grammar-1-step-2"], recallMilestoneIds: [], items: [{ id: "g1", prompt: "She ___ it.", options: ["sends", "send", "sending", "sent"], answer: "sends", explanation: "He/she: V-s.", milestoneId: "a2-grammar-1-step-2" }] } }
    ] };
    render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly vocabularyCount={1} grammarStepLabels={{ "a2-grammar-1-step-2": "Câu phủ định với do/does" }} headingOverride="Soạn bài ngày 03/12 · A2" initial={initial} onSave={onSave} onCancel={() => undefined} uploadMedia={vi.fn()} /></ModalProvider>);
    expect(screen.queryByLabelText("Ảnh minh họa từ 1 URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Audio từ vựng 1 URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Audio cụm từ 1.1 URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Audio ví dụ ngữ pháp/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Bật audio cho Ngữ pháp" })).not.toBeInTheDocument();
    // Listening audio is still uploadable (the retry path when synthesis failed).
    expect(screen.getByLabelText("File audio phần Nghe URL")).toBeInTheDocument();

    // Daily practice: no internal codes or step ids; options on one row like the other sections.
    const daily = screen.getByText("Luyện tập theo ngày", { selector: "legend" }).closest("fieldset")!;
    expect(daily).toHaveTextContent("Mục tiêu ngữ pháp: Luyện câu phủ định.");
    expect(daily).not.toHaveTextContent("A3");
    expect(daily).not.toHaveTextContent("a2-grammar-1-step-2");
    expect(screen.queryByLabelText("Câu 1 – Chủ điểm ngữ pháp")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Câu luyện tập 1" }).querySelector(".grid.cols-4")).not.toBeNull();
    expect(screen.getByLabelText("Câu 1 – Lựa chọn 1")).toHaveAttribute("placeholder", "Lựa chọn 1");

    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));
    const saved = onSave.mock.calls[0]![0] as { parts: Array<{ code: string; content: Record<string, unknown> }> };
    const item = (saved.parts.find(part => part.code === "vocabulary")!.content.items as Array<Record<string, unknown>>)[0]!;
    expect(item).toEqual(expect.objectContaining({ imageUrl: "/illustrations/report.png", audioUrl: "/word.mp3", collocationAudioUrls: ["/a1.mp3", "", ""] }));
    // An unchanged picture keeps its stored credit instead of being re-credited to the Operator.
    expect(item.imageAttribution).toEqual(expect.objectContaining({ creator: "E4S (AI minh họa)" }));
    expect(saved.parts.find(part => part.code === "grammar")!.content).toEqual(expect.objectContaining({ exampleAudioUrls: ["/g1.mp3"] }));
  });

  it("names grammar steps by title when a daily question can practise more than one", () => {
    const initial = { dayNumber: 8, title: "Bài 8", durationMinutes: 10, parts: [
      { code: "grammar" as const, title: "Ngữ pháp", content: { dailyCode: "B2", objective: "Dùng was/were.", milestoneIds: ["a2-g2-s1"], recallMilestoneIds: ["a2-g1-s1"], items: [{ id: "g1", prompt: "?", options: ["a", "b", "c", "d"], answer: "a", explanation: "", milestoneId: "a2-g1-s1" }] } }
    ] };
    render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly grammarStepLabels={{ "a2-g2-s1": "Quá khứ của to be" }} initial={initial} onSave={vi.fn()} onCancel={() => undefined} /></ModalProvider>);
    const select = screen.getByLabelText("Câu 1 – Chủ điểm ngữ pháp");
    expect(Array.from(select.querySelectorAll("option")).map(option => option.textContent)).toEqual(["Chọn chủ điểm", "Quá khứ của to be", "Ôn lại chủ điểm trước"]);
    expect(select).toHaveValue("a2-g1-s1");
  });

  it("pins a compact findings strip under the header, opens on the first finding and jumps to the exact field", async () => {
    const user = userEvent.setup();
    const initial = { ...emptyLesson(2), parts: emptyLesson(2).parts.map(part => part.code === "word_use" ? { ...part, content: { prompt: "Choose", options: ["a", "b", "He was colleagueing me.", "d"], answer: "a" } } : part) };
    render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly initial={initial} onSave={vi.fn()} onCancel={() => undefined} findings={{ title: "Lần sinh AI gần nhất chưa đạt", lines: [
      { key: "a", code: "MONTHLY_INVENTED_WORD_FORM", component: "word_use", severity: "severe", where: "Câu 5 · Dùng từ", what: "Thay từ không có thật.", option: 2 },
      { key: "b", code: "MONTHLY_ANSWER_LONGEST_OPTION", component: "listening", severity: "light", where: "Câu 1 · Nghe", what: "Viết các lựa chọn dài gần bằng nhau." }
    ] }} /></ModalProvider>);
    const strip = screen.getByRole("region", { name: "Các mục cần sửa" });
    // Inside the sticky header but not in the title row; the editor does not repeat why it was opened.
    expect(strip.closest(".operator-editor-sticky-header")).not.toBeNull();
    expect(strip.closest(".operator-editor-heading")).toBeNull();
    expect(strip).not.toHaveTextContent("Lần sinh AI gần nhất chưa đạt");
    expect(strip).toHaveTextContent("1 lỗi nặng · 1 cảnh báo");
    expect(strip).toHaveTextContent("Câu 5 · Dùng từ: Thay từ không có thật.");
    // Opened on the first finding: its flagged answer choice has focus.
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    expect(document.activeElement).toBe(screen.getByLabelText("Dùng từ – Lựa chọn 3"));
    // The chevron lists every finding; each one jumps to its section.
    const toggle = screen.getByRole("button", { name: "Mở danh sách cảnh báo" });
    expect(toggle.querySelector("svg")).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("title", "Mở danh sách cảnh báo");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Thu gọn danh sách cảnh báo" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: /^Câu 1 · Nghe/ }));
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    expect(document.activeElement).toBe(screen.getByLabelText("Nội dung nghe"));
  });

  it("monthly grammar: no 'no grammar' checkbox, no empty usage field, one input per example", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const initial = { dayNumber: 2, title: "Bài 3", durationMinutes: 10, parts: [
      { code: "grammar" as const, title: "Ngữ pháp", content: { formula: "was/were + V-ing", examples: ["We were not reviewing the useful feedback during the meeting.", "Was your colleague checking the report?"], exampleAudioUrls: ["/e1.mp3", "/e2.mp3"] } }
    ] };
    render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly initial={initial} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
    expect(screen.queryByRole("checkbox", { name: "Bài này không có nội dung ngữ pháp phù hợp" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cách dùng ngữ pháp")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Câu ví dụ ngữ pháp 1")).toHaveValue("We were not reviewing the useful feedback during the meeting.");
    expect(screen.getByLabelText("Câu ví dụ ngữ pháp 2")).toHaveValue("Was your colleague checking the report?");
    expect(screen.getByLabelText("Câu ví dụ ngữ pháp 3")).toHaveValue("");
    expect(screen.queryByDisplayValue(/\.; /)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Câu ví dụ ngữ pháp 3"), { target: { value: "They were sending the files; then they stopped." } });
    await saveLesson(user);
    const grammar = (onSave.mock.calls[0]![0] as { parts: Array<{ code: string; content: Record<string, unknown> }> }).parts.find(part => part.code === "grammar")!.content;
    // A ";" inside one example stays inside that example.
    expect(grammar.examples).toEqual(["We were not reviewing the useful feedback during the meeting.", "Was your colleague checking the report?", "They were sending the files; then they stopped."]);
    expect(grammar.exampleAudioUrls).toEqual(["/e1.mp3", "/e2.mp3", ""]);
  });

  describe("Friday review (Ôn tuần)", () => {
    const choice = (id: string, prompt: string, answer: string, extra: Record<string, unknown> = {}) => ({ id, prompt, options: [answer, `${id} b`, `${id} c`, `${id} d`], answer, explanation: `Why ${id}.`, questionTranslation: `Dịch ${id}`, answerTranslation: `Đáp ${id}`, ...extra });
    const withVariant = (id: string, prompt: string, answer: string) => ({ ...choice(id, prompt, answer), variants: [choice(`${id}-v1`, `${prompt} (retry)`, `${answer} again`)] });
    const reviewLesson = () => ({ dayNumber: 4, title: "Bài ôn tuần 1", durationMinutes: 10, parts: [
      { code: "objective" as const, title: "Mục tiêu bài học", content: { text: "Ôn tuần 1", items: [{ text: "Ôn tuần 1" }] } },
      { code: "vocabulary" as const, title: "Từ vựng", content: { items: [{ word: "report", meaning: "báo cáo" }] } },
      { code: "grammar" as const, title: "Ngữ pháp", content: { formula: "S + V-s", examples: ["She sends it."], items: [withVariant("grammar-1", "She ___ it.", "sends")] } },
      { code: "pronunciation" as const, title: "Phát âm", content: { focus: "/s/", words: ["sends", "sits", "sees"] } },
      { code: "listening" as const, title: "Nghe", content: { items: [{ ...withVariant("listening-1", "What did you hear?", "báo cáo"), audioText: "report", audioUrl: "/r.mp3" }] } },
      { code: "word_use" as const, title: "Word use", content: { items: [withVariant("word_use-1", "Q1", "A1"), withVariant("word_use-2", "Q2", "A2"), withVariant("word_use-3", "Q3", "A3")] } },
      { code: "word_class" as const, title: "Word form", content: { items: [withVariant("word_class-1", "He made a ___.", "decision")] } },
      { code: "reading" as const, title: "Đọc", content: { passage: "Hi team, the report is ready.", items: [{ ...withVariant("reading-1", "What is ready?", "the report"), passage: "Hi team, the report is ready." }] } },
      { code: "speaking" as const, title: "Nói", content: { items: [
        { id: "speaking-1", prompt: "Which word?", audioText: "ship", options: ["ship", "sheep"], answer: "ship", explanation: "Short i." },
        { id: "speaking-3", prompt: "Read aloud.", passage: "The report is ready for the client." },
        { id: "speaking-4", prompt: "Tell us about your week.", requiredWords: ["report", "client"], minRequiredWords: 2, acceptsAudio: true }
      ] } }
    ] });
    type Lesson = ReturnType<typeof reviewLesson>;
    const partJson = (lesson: Lesson, code: string) => JSON.stringify(lesson.parts.find(item => item.code === code));
    const wordUseItems = (lesson: Lesson) => lesson.parts.find(item => item.code === "word_use")!.content.items as Array<Record<string, unknown>>;

    it("shows every question and retry version of every part, with fixed counts", () => {
      render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly kind="review" vocabularyCount={1} initial={reviewLesson()} onSave={vi.fn()} onCancel={() => undefined} /></ModalProvider>);
      const wordUse = screen.getByText("Phần 2 · Word use (3 câu)", { selector: "legend" }).closest("fieldset")!;
      expect(wordUse).toHaveTextContent("Câu 1");
      expect(wordUse).toHaveTextContent("Câu 3");
      expect(screen.getByLabelText("Word use câu 2 – Câu hỏi")).toHaveValue("Q2");
      expect(screen.getByLabelText("Word use câu 2 – Lựa chọn 4")).toHaveValue("word_use-2 d");
      expect(screen.getByLabelText("Word use câu 2 – Giải thích")).toHaveValue("Why word_use-2.");
      expect(screen.getByLabelText("Word use câu 2 bản làm lại 1 – Câu hỏi")).toHaveValue("Q2 (retry)");
      expect(screen.getByLabelText("Word use câu 2 bản làm lại 1 – Đáp án đúng")).toHaveDisplayValue("A. A2 again");
      expect(screen.getByRole("group", { name: "Word use câu 2 bản làm lại 1" })).toHaveTextContent("Bản làm lại 1");
      // Grammar questions live in their review part; listening keeps the spoken word; speaking keeps its own shapes.
      expect(screen.getByLabelText("Ngữ pháp câu 1 – Câu hỏi")).toHaveValue("She ___ it.");
      expect(screen.getByLabelText("Nghe & nhận biết từ câu 1 – Từ app đọc")).toHaveValue("report");
      expect(screen.getByLabelText("Nghe – Đọc hiểu – Đoạn văn")).toHaveValue("Hi team, the report is ready.");
      expect(screen.getByLabelText("Phát âm & Nói – Viết câu 1 – Lựa chọn 2")).toHaveValue("sheep");
      expect(screen.queryByLabelText("Phát âm & Nói – Viết câu 1 – Lựa chọn 3")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Phát âm & Nói – Viết câu 2 – Câu đọc to")).toHaveValue("The report is ready for the client.");
      expect(screen.getByLabelText("Phát âm & Nói – Viết câu 3 – Từ bắt buộc")).toHaveValue("report, client");
      // The daily single-question fields are not offered for a review, and counts are fixed.
      expect(screen.queryByLabelText("Nghe – Câu hỏi")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Thêm câu|Bỏ câu/ })).not.toBeInTheDocument();
    });

    it("saves an edit to question 2 of a part and keeps questions 1 and 3, the retry versions and every other part unchanged", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const initial = reviewLesson();
      const before = JSON.parse(JSON.stringify(initial)) as Lesson;
      render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly kind="review" vocabularyCount={1} initial={initial} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
      fireEvent.change(screen.getByLabelText("Word use câu 2 – Câu hỏi"), { target: { value: "Q2 edited" } });
      fireEvent.change(screen.getByLabelText("Word use câu 2 – Lựa chọn 1"), { target: { value: "A2 edited" } });
      await saveLesson(user);
      const saved = onSave.mock.calls[0]![0] as Lesson;
      const savedItems = wordUseItems(saved), beforeItems = wordUseItems(before);
      // Question 2: only the edited fields changed (the answer followed its option); its retry version is untouched.
      expect(JSON.stringify(savedItems[1])).toBe(JSON.stringify({ ...beforeItems[1], prompt: "Q2 edited", options: ["A2 edited", "word_use-2 b", "word_use-2 c", "word_use-2 d"], answer: "A2 edited" }));
      expect(JSON.stringify(savedItems[1]!.variants)).toBe(JSON.stringify(beforeItems[1]!.variants));
      // Questions 1 and 3, with their retry versions, are byte-identical.
      expect(JSON.stringify(savedItems[0])).toBe(JSON.stringify(beforeItems[0]));
      expect(JSON.stringify(savedItems[2])).toBe(JSON.stringify(beforeItems[2]));
      // Every other review part is byte-identical, in the same order; no daily fields or parts (writing) are added.
      for (const code of ["listening", "word_class", "reading", "speaking"]) expect(partJson(saved, code)).toBe(partJson(before, code));
      expect(saved.parts.map(item => item.code)).toEqual(before.parts.map(item => item.code));
      // Grammar: the study fields come from the form; its review questions are kept as they were.
      expect(JSON.stringify(saved.parts.find(item => item.code === "grammar")!.content.items)).toBe(JSON.stringify(before.parts.find(item => item.code === "grammar")!.content.items));
    });

    it("an unchanged review saves its exercise parts byte-identical", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const initial = reviewLesson();
      const before = JSON.parse(JSON.stringify(initial)) as Lesson;
      render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly kind="review" vocabularyCount={1} initial={initial} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
      await saveLesson(user);
      const saved = onSave.mock.calls[0]![0] as Lesson;
      for (const code of ["listening", "word_use", "word_class", "reading", "speaking"]) expect(partJson(saved, code)).toBe(partJson(before, code));
    });

    it("editing the reading passage updates the copies on its questions", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly kind="review" vocabularyCount={1} initial={reviewLesson()} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
      fireEvent.change(screen.getByLabelText("Nghe – Đọc hiểu – Đoạn văn"), { target: { value: "Hi team, the client report is ready." } });
      await saveLesson(user);
      const reading = (onSave.mock.calls[0]![0] as Lesson).parts.find(item => item.code === "reading")!.content as { passage: string; items: Array<{ passage: string; variants: Array<Record<string, unknown>> }> };
      expect(reading.passage).toBe("Hi team, the client report is ready.");
      expect(reading.items[0]!.passage).toBe("Hi team, the client report is ready.");
    });

    it("a finding on a retry version lands on that version's flagged answer choice", async () => {
      render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A2" monthly kind="review" vocabularyCount={1} initial={reviewLesson()} onSave={vi.fn()} onCancel={() => undefined} findings={{ title: "Kiểm tra chất lượng bản nháp", lines: [
        { key: "x", code: "MONTHLY_INVENTED_WORD_FORM", component: "word_use", severity: "severe", where: "Phần 2 · Word use · câu 3 (bản làm lại 1)", what: "Lựa chọn B dùng từ không có thật.", item: 3, variant: 1, option: 1 }
      ] }} /></ModalProvider>);
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      expect(document.activeElement).toBe(screen.getByLabelText("Word use câu 3 bản làm lại 1 – Lựa chọn 2"));
    });
  });
});

/** Kiểm tra & lưu → (Lưu dù còn thiếu) → confirm in the modal. */
async function saveLesson(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
  const force = screen.queryByRole("button", { name: "Lưu dù còn thiếu" });
  if (force) {
    await user.click(force);
    await user.click(screen.getByRole("button", { name: "Lưu tạm" }));
  } else {
    await user.click(screen.getAllByRole("button", { name: "Kiểm tra & lưu" }).at(-1)!);
  }
}
