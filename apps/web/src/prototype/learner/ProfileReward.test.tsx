// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeProfile, PrototypeReward, PrototypeSurvey } from "./ProfileReward.js";
import type { RewardView } from "@e4s/contracts";
import type { LearnerPrototypeCallbacks, ProfilePrototypeView } from "./contracts.js";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const actions = { navigate: vi.fn(), saveAvatar: vi.fn() } as unknown as LearnerPrototypeCallbacks;

const view = {
  learner: { displayName: "Học viên Demo", cefr: "B1", profile: { fullName: "Học viên Demo", goals: [], habits: [], learningStyles: [], explanationLanguage: "auto", persona: "informal", durationMinutes: 10, device: "both", selfLevel: "unknown", certificates: [], avatar: { acc: "sun", color: "olive", bg: 2 } } },
  points: 0,
  badges: [],
  weeks: [],
  studyDays: 0,
  activity: [],
  season: { current: { key: "summer", level: 2, name: "Mùa hạ", pointsRequired: 60 }, next: null, earnedBadgeCount: 0, requiredBadgeCount: 0 },
  badgeRoadmap: [],
  levelReadiness: { targetLevel: null, windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
  stats: { completedLessons: 0, coachTurns: 0, studyDays: 0 },
  assessments: { placement: null, final: null },
  finalAssessmentAvailable: false,
  surveyAvailable: false
} as unknown as ProfilePrototypeView;

describe("prototype profile avatar dialog affordances", () => {
  it("uses library icons for the selected avatar accessory", () => {
    render(<PrototypeProfile view={view} actions={actions} />);
    expect(screen.getByLabelText("Avatar của Học viên Demo").querySelector("svg.lucide-sun")).toBeInTheDocument();
  });

  it("focuses the cancel control, exposes selection state, and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<PrototypeProfile view={view} actions={actions} />);

    await user.click(screen.getAllByRole("button", { name: "Đổi avatar" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Avatar của bạn" });
    const cancel = within(dialog).getByRole("button", { name: "Huỷ" });

    expect(document.activeElement).toBe(cancel);
    expect(within(dialog).getByText("Học viên Demo")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Nắng" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Hoa" })).toHaveAttribute("aria-pressed", "false");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Avatar của bạn" })).not.toBeInTheDocument();
  });

  it("keeps keyboard focus inside the avatar dialog", async () => {
    const user = userEvent.setup();
    render(<PrototypeProfile view={view} actions={actions} />);

    const trigger = screen.getAllByRole("button", { name: "Đổi avatar" })[0]!;
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Avatar của bạn" });
    const first = within(dialog).getByRole("button", { name: "Chữ cái đầu" });
    const save = within(dialog).getByRole("button", { name: "Lưu avatar" });

    save.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(save).toHaveFocus();
  });

  it("keeps the avatar modal open and disables controls while saving, then restores focus after close", async () => {
    const user = userEvent.setup();
    let rejectSave!: (reason?: unknown) => void;
    const saveAvatar = vi.fn(() => new Promise<void>((_, reject) => { rejectSave = reject; }));
    const avatarActions = { ...actions, saveAvatar } as unknown as LearnerPrototypeCallbacks;
    render(<PrototypeProfile view={view} actions={avatarActions} />);

    const trigger = screen.getAllByRole("button", { name: "Đổi avatar" })[0]!;
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Avatar của bạn" });
    await user.click(within(dialog).getByRole("button", { name: "Lưu avatar" }));

    expect(within(dialog).getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Huỷ" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Hoa" })).toBeDisabled();

    rejectSave(new Error("save failed"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Chưa lưu được avatar");
    expect(within(dialog).getByRole("button", { name: "Lưu avatar" })).toBeEnabled();

    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    expect(trigger).toHaveFocus();
  });
});

describe("prototype end-of-pilot survey states", () => {
  it("keeps submission gated until a rating is selected and submits canonical values", async () => {
    const user = userEvent.setup();
    const surveyActions = { ...actions, submitSurvey: vi.fn() } as unknown as LearnerPrototypeCallbacks;
    render(<PrototypeSurvey view={{ state: "open", surveyKey: "pilot_end" }} actions={surveyActions} />);

    expect(screen.getByRole("heading", { name: "Khảo sát cuối pilot" })).toBeInTheDocument();
    expect(screen.getByText("Học với mình 2 tuần qua có hữu ích không?")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Gửi khảo sát" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "4 trên 5" }));
    await user.type(screen.getByLabelText("Điều gì hữu ích nhất? Điều gì nên đổi?"), "Bài học sát công việc.");
    await user.selectOptions(screen.getByLabelText("Bạn học chủ yếu lúc nào?"), "work");
    await user.click(submit);

    expect(surveyActions.submitSurvey).toHaveBeenCalledWith({ rating: 4, comment: "Bài học sát công việc.", studyTime: "work" });
  });

  it("shows the persisted rating and comment after submission", () => {
    render(<PrototypeSurvey view={{ state: "submitted", surveyKey: "pilot_end", answers: { rating: 5, comment: "Rất hữu ích", studyTime: "both" } }} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Cảm ơn bạn!" })).toBeInTheDocument();
    expect(screen.getByText(/Bạn đã đánh giá 5\/5.*“Rất hữu ích”/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem tiến độ" })).toHaveAttribute("href", "/profile");
  });

  it("shows loading and error states without losing the survey answers", async () => {
    const user = userEvent.setup();
    let rejectSubmit!: (reason?: unknown) => void;
    const submitSurvey = vi.fn(() => new Promise<void>((_, reject) => { rejectSubmit = reject; }));
    const surveyActions = { ...actions, submitSurvey } as unknown as LearnerPrototypeCallbacks;
    render(<PrototypeSurvey view={{ state: "open", surveyKey: "pilot_end" }} actions={surveyActions} />);

    await user.click(screen.getByRole("button", { name: "4 trên 5" }));
    const comment = screen.getByLabelText("Điều gì hữu ích nhất? Điều gì nên đổi?");
    await user.type(comment, "Bài học sát công việc.");
    const submit = screen.getByRole("button", { name: "Gửi khảo sát" });
    await user.click(submit);

    expect(screen.getByRole("button", { name: "Đang gửi…" })).toBeDisabled();
    expect(document.querySelector("form.card")).toHaveAttribute("aria-busy", "true");
    rejectSubmit(new Error("submit failed"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa gửi được phản hồi");
    expect(screen.getByDisplayValue("Bài học sát công việc.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi khảo sát" })).toBeEnabled();
  });
});

describe("prototype reward CTA hierarchy", () => {
  it("keeps preview navigation primary and the real print action disabled when unavailable", () => {
    const reward: RewardView = {
      mode: "done",
      learnerName: "Học viên Demo",
      cefr: "B1",
      cefrLabel: "Trung cấp",
      points: 120,
      displayPoints: 120,
      season: { name: "Mùa hạ", description: "đón nắng" },
      simulated: false,
      earnedBadgeCount: 2,
      requiredBadgeCount: 3,
      printable: false,
      certificateNumber: "CERT-001",
      completedAt: "2026-10-15T00:00:00.000Z",
      organizationName: "GFT",
      operatorName: "Vận hành",
      managerName: "Quản lý",
      badges: [{ key: "first", label: "Khởi động", description: "Bài đầu tiên", earned: true }]
    };
    render(<PrototypeReward view={reward} actions={actions} />);

    expect(screen.getByRole("button", { name: /In \/ lưu chứng nhận/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Tiếp tục học" })).toHaveClass("btn-primary");
  });
});
