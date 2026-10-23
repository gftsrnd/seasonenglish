// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerProfile, LearnerReward, LearnerSurvey } from "./ProfileReward.js";
import type { RewardView } from "@e4s/contracts";
import type { LearnerCallbacks, ProfileView } from "./contracts.js";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const actions = { navigate: vi.fn(), saveAvatar: vi.fn() } as unknown as LearnerCallbacks;

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
  assessments: { placement: null },
  surveyAvailable: false
} as unknown as ProfileView;

describe("app profile avatar dialog affordances", () => {
  it("uses the same compact readiness format as the home page", () => {
    const readinessView = {
      ...view,
      levelReadiness: {
        targetLevel: "B2",
        windowDays: 14,
        eligible: false,
        examAvailable: false,
        criteria: [
          { key: "lessonCompletion", label: "Bài học hoàn thành", current: 20, target: 90, display: "1/5 bài", met: false },
          { key: "firstTryAccuracy", label: "Phần bài đúng ngay lần đầu", current: 67, target: 75, display: "4/6 phần", met: false },
          { key: "weeklyPractice", label: "Bài thực hành tuần gần nhất", current: 86, target: 80, display: "86/100", met: true },
          { key: "coachRubric", label: "Rubric khi luyện với Season", current: 4.3, target: 4, display: "4.3/5 · 8 lượt", met: true }
        ]
      }
    } as unknown as ProfileView;

    render(<LearnerProfile view={readinessView} actions={actions} />);

    const readiness = screen.getByRole("region", { name: "Đường lên mức B2" });
    const lessons = readiness.querySelector<HTMLElement>('[data-readiness-key="lessonCompletion"]')!;
    const firstTry = readiness.querySelector<HTMLElement>('[data-readiness-key="firstTryAccuracy"]')!;
    const practice = readiness.querySelector<HTMLElement>('[data-readiness-key="weeklyPractice"]')!;
    const coach = readiness.querySelector<HTMLElement>('[data-readiness-key="coachRubric"]')!;

    expect(within(lessons).getByText("20%", { exact: true })).toHaveClass("readiness-current");
    expect(within(lessons).getByText("1/5 bài", { exact: true })).toHaveClass("readiness-actual");
    expect(within(lessons).getByRole("progressbar", { name: "Bài học hoàn thành" })).toHaveAttribute("aria-valuemax", "100");
    expect(within(practice).getByText("86%", { exact: true })).toBeInTheDocument();
    expect(within(coach).getByText("4.3/5", { exact: true })).toBeInTheDocument();
    expect(within(lessons).getByTestId("readiness-target")).toHaveStyle({ left: "90%" });
    expect(within(firstTry).getByTestId("readiness-target")).toHaveStyle({ left: "75%" });
    expect(within(practice).getByTestId("readiness-target")).toHaveStyle({ left: "80%" });
    expect(within(coach).getByRole("progressbar", { name: "Rubric khi luyện với Season" })).toHaveAttribute("aria-valuemax", "5");
    expect(within(coach).getByTestId("readiness-target")).toHaveStyle({ left: "80%" });
    expect(readiness.querySelector(".readiness-label svg")).not.toBeInTheDocument();
  });

  it("presents the real assessment total and every skill on its own percentage row", () => {
    const assessmentView = {
      ...view,
      assessments: {
        placement: {
          totalScore: 55,
          approvedLevel: "A1",
          sections: { listening: 55, reading: 60, writing: 50, speaking: 50 }
        }
      }
    } as unknown as ProfileView;

    render(<LearnerProfile view={assessmentView} actions={actions} />);

    const assessment = screen.getByRole("region", { name: "Kết quả đánh giá" });
    const placement = within(assessment).getByRole("region", { name: "Điểm đầu vào" });
    expect(within(placement).getByText("55", { exact: true })).toHaveClass("profile-assessment-total");
    expect(within(placement).getByText(/Đầu vào · A1/)).toBeInTheDocument();
    expect(placement.querySelectorAll(".profile-assessment-skill")).toHaveLength(4);
    expect(within(placement).getByText("Nghe").closest(".profile-assessment-skill")).toHaveTextContent("55%");
    expect(within(placement).getByText("Đọc").closest(".profile-assessment-skill")).toHaveTextContent("60%");
    expect(within(placement).getByText("Viết").closest(".profile-assessment-skill")).toHaveTextContent("50%");
    expect(within(placement).getByText("Nói").closest(".profile-assessment-skill")).toHaveTextContent("50%");
    expect(within(assessment).queryByText(/cuối kỳ/i)).not.toBeInTheDocument();
    expect(within(assessment).queryByRole("link", { name: "Làm bài cuối kỳ" })).not.toBeInTheDocument();
  });

  it("keeps personal information collapsed until the learner asks to view it", async () => {
    render(<LearnerProfile view={view} actions={actions} />);
    expect(screen.queryByRole("heading", { name: "Tùy chọn cá nhân" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chỉnh sửa thông tin cá nhân" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Học viên Demo", { selector: ".profile-detail-value" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Chỉnh sửa thông tin cá nhân" }));
    expect(screen.getByRole("button", { name: "Đóng thông tin cá nhân" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Học viên Demo", { selector: ".profile-detail-value" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cập nhật hồ sơ" })).toHaveAttribute("href", "/onboard");
  });

  it("uses library icons for the selected avatar accessory", () => {
    render(<LearnerProfile view={view} actions={actions} />);
    expect(screen.getByLabelText("Avatar của Học viên Demo").querySelector("svg.lucide-sun")).toBeInTheDocument();
  });

  it("focuses the cancel control, exposes selection state, and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<LearnerProfile view={view} actions={actions} />);

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
    render(<LearnerProfile view={view} actions={actions} />);

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
    const avatarActions = { ...actions, saveAvatar } as unknown as LearnerCallbacks;
    render(<LearnerProfile view={view} actions={avatarActions} />);

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

describe("app end-of-pilot survey states", () => {
  it.each([
    ["open", { state: "open", surveyKey: "pilot_end" }],
    ["submitted", { state: "submitted", surveyKey: "pilot_end", answers: { rating: 5, comment: "Rất hữu ích", studyTime: "both" } }]
  ] as const)("uses the verified raster mascot in the %s state", (_label, surveyView) => {
    const { container } = render(<LearnerSurvey view={surveyView} actions={actions} />);
    expect(container.querySelector("img[data-product-art='mascot']")).toHaveAttribute("src", "/media/mascot/season-bear.png");
    expect(container.querySelector("[data-testid='season-mark']")).not.toBeInTheDocument();
  });

  it("keeps submission gated until a rating is selected and submits canonical values", async () => {
    const user = userEvent.setup();
    const surveyActions = { ...actions, submitSurvey: vi.fn() } as unknown as LearnerCallbacks;
    render(<LearnerSurvey view={{ state: "open", surveyKey: "pilot_end" }} actions={surveyActions} />);

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
    render(<LearnerSurvey view={{ state: "submitted", surveyKey: "pilot_end", answers: { rating: 5, comment: "Rất hữu ích", studyTime: "both" } }} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Cảm ơn bạn!" })).toBeInTheDocument();
    expect(screen.getByText(/Bạn đã đánh giá 5\/5.*“Rất hữu ích”/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem tiến độ" })).toHaveAttribute("href", "/profile");
  });

  it("shows loading and error states without losing the survey answers", async () => {
    const user = userEvent.setup();
    let rejectSubmit!: (reason?: unknown) => void;
    const submitSurvey = vi.fn(() => new Promise<void>((_, reject) => { rejectSubmit = reject; }));
    const surveyActions = { ...actions, submitSurvey } as unknown as LearnerCallbacks;
    render(<LearnerSurvey view={{ state: "open", surveyKey: "pilot_end" }} actions={surveyActions} />);

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

describe("app reward CTA hierarchy", () => {
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
    render(<LearnerReward view={reward} actions={actions} />);

    expect(screen.getByRole("button", { name: /In \/ lưu chứng nhận/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Tiếp tục học" })).toHaveClass("btn-primary");
  });
});
