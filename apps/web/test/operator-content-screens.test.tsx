// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ContentLessonMatrixView,
  ContentLessonSetVersionView,
  ContentPromptSettingsView,
  ContentReviewView,
  ContentWeekFrameView
} from "@e4s/contracts";
import { LessonSet, Lessons, Prompts, Review, Weeks } from "../src/pages/operator/index.js";

afterEach(cleanup);

const weeks: ContentWeekFrameView = {
  pilot: { startDate: "2026-10-05", weekCount: 2 },
  weeks: [
    { id: "w1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: false,
      topic: "Introducing yourself & your job", description: "Tự giới thiệu trong buổi họp đầu.",
      objectives: "Nói/viết 4–6 câu.", keyVocabHint: "colleague, role" },
    { id: "w2", weekNumber: 2, startDate: "2026-10-12", endDate: "2026-10-18", current: true,
      topic: "Emails & rescheduling meetings", description: "Xin dời lịch và xác nhận lịch mới.",
      objectives: "Viết email 60–100 từ.", keyVocabHint: "reschedule, confirm" }
  ]
};

const matrix: ContentLessonMatrixView = {
  levels: [{ cefr: "A2", learnerCount: 1 }],
  weeks: [
    { weekNumber: 1, topic: "Introducing yourself & your job", cells: [{
      cefr: "A2", status: "published", versionId: "v1", version: 1,
      updatedAt: "2026-10-03T01:05:00.000Z",
      lessons: [1, 2, 3, 4, 5].map((dayNumber) => ({ dayNumber, title: `Bài T${dayNumber + 1}` }))
    }] },
    { weekNumber: 2, topic: "Emails & rescheduling meetings", cells: [{
      cefr: "A2", status: "missing", versionId: null, version: null, updatedAt: null, lessons: []
    }] }
  ]
};

const detail: ContentLessonSetVersionView = {
  lessonSetId: "set-1", versionId: "v1", version: 1, status: "published",
  weekNumber: 1, topic: "Introducing yourself & your job", cefr: "A2",
  explanationLanguage: "Tiếng Việt", createdBy: "maker", approvedBy: "checker",
  createdAt: "2026-10-03T01:00:00.000Z", publishedAt: "2026-10-03T01:05:00.000Z",
  lessons: [1, 2, 3, 4, 5].map((dayNumber) => ({
    id: `lesson-${dayNumber}`, dayNumber, title: `Bài T${dayNumber + 1}`, durationMinutes: 10,
    practiceLabel: "điền từ · đáp án: work", parts: []
  }))
};

const review: ContentReviewView = {
  tabs: [
    { key: "submissions", label: "Bài nộp", count: 1, unreadCount: 1 },
    { key: "coach", label: "Phản hồi coach", count: 1 },
    { key: "micro", label: "Bài siêu ngắn", count: 0 },
    { key: "appeals", label: "Kháng nghị", count: 0 },
    { key: "attempts", label: "Số lần làm bài", count: 1 },
    { key: "assessments", label: "Bài test", count: 3 }
  ],
  coachSamples: [{
    id: "turn-1", learnerName: "Học viên B", cefr: "A2", weekNumber: 1,
    createdAt: "2026-10-09T01:05:00.000Z", checked: false,
    learnerText: "I work at marketing.", coachText: "What do you do in marketing?",
    scores: { meaning: 4, vocabulary: 3, grammar: 3 },
    suggestions: ["I work at marketing → I work in marketing – Dùng in trước tên phòng ban."]
  }],
  submissions: [],
  microLessons: [],
  appeals: [],
  lessonAttempts: [],
  assessments: []
};

const prompts: ContentPromptSettingsView = {
  groups: [
    ["system_rules", "Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)"],
    ["assessment_scoring", "Chấm test & xếp trình độ"],
    ["weekly_lessons", "Sinh 5 bài siêu ngắn cho tuần"],
    ["week_suggestions", "Gợi ý khung chủ đề tuần"],
    ["micro_grading", "Chấm bài thực hành siêu ngắn"],
    ["coach_dialogue", "AI coach hội thoại"],
    ["weekly_practice_grading", "Chấm bài thực hành thứ Sáu"]
  ].map(([key, label]) => ({
    key: key as ContentPromptSettingsView["groups"][number]["key"], label: label!,
    content: `Nội dung ${key}`, defaultContent: `Mặc định ${key}`, version: 1, status: "active" as const
  }))
};

describe("operator content screens preserve Thu's visible structure", () => {
  it("keeps the two week cards and saves the same fields in-place", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><Weeks view={weeks} readOnly={false} onSave={onSave} /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Khung chủ đề tuần" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tuần 1/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tuần 2/ })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Chủ đề *")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Đi tới sinh bài →" })).toHaveAttribute("href", "/op/lessons");

    await user.clear(screen.getAllByLabelText("Mục tiêu học")[1]!);
    await user.type(screen.getAllByLabelText("Mục tiêu học")[1]!, "Viết email rõ ràng.");
    await user.click(screen.getByRole("button", { name: "Lưu khung chủ đề" }));
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ weekNumber: 2, objectives: "Viết email rõ ràng." })
    ]));
  });

  it("keeps the week × CEFR matrix and does not fake AI availability", () => {
    render(<MemoryRouter><Lessons view={matrix} aiAvailable={false} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Sinh & duyệt bài học" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa có API key");
    expect(screen.getByRole("note")).toHaveTextContent("“Thêm cột mức” để soạn trước cho mức chưa có ai.");
    expect(screen.getByRole("columnheader", { name: /A2 \(1 học viên\)/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem / duyệt" })).toHaveAttribute("href", "/op/lessons/1/A2");
    expect(screen.getByRole("button", { name: "Sinh" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Soạn tay" })).toHaveAttribute("href", "/op/lessons/2/A2?edit=1");
  });

  it("keeps review inside lesson-set detail and makes manager mode read-only", () => {
    render(<MemoryRouter><LessonSet view={detail} readOnly onSaveDraft={() => undefined} onSubmitReview={() => undefined} onPublish={() => undefined} onRetire={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Tuần 1 · Mức A2/ })).toBeInTheDocument();
    expect(screen.getByText(/Checklist duyệt/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sửa" })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Thu hồi duyệt" })).toBeDisabled();
    expect(screen.getByText(/quản lý đang xem ở chế độ chỉ đọc/i)).toBeInTheDocument();
  });

  it("edits a lesson in-place and saves a new draft without adding a screen", async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const editable = {
      ...detail,
      status: "draft" as const,
      lessons: detail.lessons.map((lesson, index) => index === 0 ? {
        ...lesson,
        parts: [
          { code: "objective" as const, title: "Mục tiêu", content: { text: "Giới thiệu vai trò." } },
          { code: "instruction" as const, title: "Hướng dẫn", content: { steps: ["Học nội dung"] } },
          { code: "vocabulary" as const, title: "Từ vựng", content: { items: [1, 2, 3].map((number) => ({ word: `word${number}`, pronunciation: "/w/", meaning: "từ", examples: ["work example"] })) } },
          { code: "grammar" as const, title: "Ngữ pháp", content: { formula: "I work as…", examples: ["I work as an intern."] } },
          { code: "pronunciation" as const, title: "Phát âm", content: { focus: "/w/", words: ["work", "worker", "working"], instruction: "Round your lips." } },
          { code: "listening" as const, title: "Nghe", content: { script: "I work in AI.", prompt: "Where?", options: ["AI", "Sales", "HR", "Finance"], answer: "AI" } },
          { code: "reading" as const, title: "Đọc", content: { text: "I work in AI.", prompt: "Where?", options: ["AI", "Sales", "HR", "Finance"], answer: "AI" } },
          { code: "writing" as const, title: "Viết", content: { prompt: "Write.", answer: "I work in AI." } },
          { code: "speaking" as const, title: "Nói", content: { instruction: "Speak.", prompt: "I work in AI." } }
        ]
      } : lesson)
    };
    render(<MemoryRouter><LessonSet view={editable} readOnly={false} onSaveDraft={onSaveDraft} onSubmitReview={() => undefined} onPublish={() => undefined} onRetire={() => undefined} /></MemoryRouter>);

    await user.click(screen.getAllByRole("button", { name: "Sửa" })[0]!);
    expect(screen.getByRole("dialog", { name: /Sửa bài T2/ })).toBeInTheDocument();
    const title = screen.getByLabelText("Tiêu đề bài");
    await user.clear(title);
    await user.type(title, "I work in product as an intern");
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    expect(onSaveDraft).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 1, title: "I work in product as an intern" })
    ]));
  });

  it("opens the same in-place editor from Thu's direct-author link", () => {
    render(<MemoryRouter><LessonSet view={{ ...detail, status: "draft" }} readOnly={false} initialEditingDay={1} onSaveDraft={() => undefined} onSubmitReview={() => undefined} onPublish={() => undefined} onRetire={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("dialog", { name: /Sửa bài T2/ })).toBeInTheDocument();
  });

  it("keeps all six review tabs in one screen", () => {
    render(<Review view={review} />);
    expect(screen.getByRole("heading", { name: "Đọc mẫu & kiểm tra AI" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("tab", { name: "Phản hồi coach (1)" })).toHaveAttribute("aria-selected", "true");
    const sample = screen.getByText("Học viên B").closest("article");
    expect(sample).not.toBeNull();
    expect(within(sample!).getAllByText(/I work at marketing/)).toHaveLength(2);
  });

  it("keeps seven prompt blocks and restores a block to Thu's default", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Prompts view={prompts} readOnly={false} onSave={onSave} />);
    expect(screen.getByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(7);
    expect(screen.getAllByRole("button", { name: "Về mặc định" })).toHaveLength(7);

    await user.click(screen.getAllByRole("button", { name: "Về mặc định" })[0]!);
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("Mặc định system_rules");
    await user.click(screen.getByRole("button", { name: "Lưu prompt" }));
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ key: "system_rules", content: "Mặc định system_rules" })
    ]));
  });
});
