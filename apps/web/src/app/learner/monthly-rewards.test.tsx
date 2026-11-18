// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerProfile } from "./ProfileReward.js";
import { RewardAnnouncementDialog } from "./RewardAnnouncementDialog.js";
import { ManagerRewards } from "../manager/Rewards.js";
import { REWARD_POINT_RULES } from "../shared/SeasonProgressCard.js";
import type { LearnerCallbacks, ProfileView } from "./contracts.js";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const actions = { navigate: vi.fn(), saveAvatar: vi.fn() } as unknown as LearnerCallbacks;

const view = {
  learner: { displayName: "Học viên Demo", cefr: "B1", profile: { fullName: "Học viên Demo", goals: [], habits: [], learningStyles: [], explanationLanguage: "auto", durationMinutes: 10, device: "both", selfLevel: "unknown", certificates: [] } },
  points: 12400,
  badges: [],
  weeks: [],
  studyDays: 0,
  activity: [],
  season: { current: { key: "winter", level: 4, name: "Mùa đông – vững vàng", pointsRequired: 5000 }, next: null, earnedBadgeCount: 0, requiredBadgeCount: 0, cefr: "B1", pointsInLevel: 5200 },
  badgeRoadmap: [],
  levelReadiness: { targetLevel: null, windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
  stats: { completedLessons: 0, coachTurns: 0, studyDays: 0 },
  assessments: { placement: null },
  surveyAvailable: false
} as unknown as ProfileView;

describe("profile 'Cách tính điểm'", () => {
  it("lists exactly the monthly point rules and no secret-word points", () => {
    render(<LearnerProfile view={view} actions={actions} />);
    const rules = screen.getByTestId("reward-point-rules");
    const items = within(rules).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Hoàn thành 1 bài học mới (lần đầu): +10",
      "Mỗi phần bài học làm đúng: +5 lần 1, giảm 1 điểm mỗi lần làm lại (tối thiểu +1); chỉ tính lần đúng đầu tiên",
      "Hoàn thành bài Ôn tuần (thứ Sáu): +15",
      "1 lượt luyện hợp lệ với Season: +2",
      "Mini game đạt từ 50/100: +5, tối đa 3 lượt có điểm mỗi ngày (chơi thêm vẫn được, không cộng điểm)",
      "Nộp bài thi cuối tháng: +15",
      "Bài kiểm tra đầu vào, thi lên mức: +10",
      "Hoàn thành trọn lịch học tháng (mọi bài mới và bài ôn): +20, một lần mỗi tháng"
    ]);
    expect(rules).not.toHaveTextContent(/bí mật/);
    expect(REWARD_POINT_RULES).toHaveLength(8);
    const season = screen.getByTestId("reward-season-rules");
    expect(season).toHaveTextContent("Mỗi trình độ (A1–C1) có 4 Season: 🌱 Mùa xuân (bắt đầu) → ☀️ Mùa hạ 500 điểm → 🍂 Mùa thu 2.000 điểm → ❄️ Mùa đông 5.000 điểm");
    expect(season).toHaveTextContent("Season bắt đầu lại từ Mùa xuân của trình độ mới");
    expect(season).toHaveTextContent("huy hiệu đã nhận được giữ mãi");
    expect(season).toHaveTextContent("Mini game, luyện Season không tính; cuối tuần, ngày nghỉ lễ không tính và không làm đứt chuỗi");
  });
});

describe("profile Season card", () => {
  const roadmap = [
    { key: "starter", label: "Khởi đầu", description: "Hoàn thành bài học mới đầu tiên", seasonLevel: 2, earned: true, earnedLevel: "A2", threshold: 1 },
    { key: "streak", label: "Chuỗi ngày học", description: "Học 5 ngày học liên tiếp", seasonLevel: 2, earned: true, earnedLevel: "A2", threshold: 5 },
    { key: "week_complete", label: "Tuần trọn vẹn", description: "Hoàn thành mọi bài của 2 tuần (T2–CN) trong lịch học tháng", seasonLevel: 3, earned: false, threshold: 2 },
    { key: "friday", label: "Ôn tập đúng hẹn", description: "Hoàn thành 3 bài Ôn tuần đúng ngày đã xếp lịch", seasonLevel: 3, earned: true, earnedLevel: "B1", threshold: 3 },
    { key: "coach_friend", label: "Bạn của Season", description: "Có 50 lượt luyện hợp lệ với Season", seasonLevel: 3, earned: false, threshold: 50 }
  ];
  const b1 = {
    ...view, points: 3100, badges: [{ key: "starter", label: "Khởi đầu" }, { key: "streak", label: "Chuỗi ngày học" }, { key: "friday", label: "Ôn tập đúng hẹn" }],
    season: { current: { key: "summer", level: 2, name: "Mùa hạ – đón nắng", pointsRequired: 500 }, next: { key: "autumn", level: 3, name: "Mùa thu – gặt hái", pointsRequired: 2000 }, earnedBadgeCount: 1, requiredBadgeCount: 3, cefr: "B1", pointsInLevel: 1250 },
    badgeRoadmap: roadmap
  } as unknown as ProfileView;

  it("shows the current level's ladder, points in the level toward the next threshold and the lifetime total", () => {
    render(<LearnerProfile view={b1} actions={actions} />);
    expect(screen.getByTestId("season-ladder-title")).toHaveTextContent("Mùa hạ · B1");
    expect(screen.getByTestId("season-points-summary")).toHaveTextContent("Điểm trong B1: 1.250 · Tổng điểm tích lũy: ★ 3.100");
    expect(screen.getByText("1.250 / 2.000")).toBeInTheDocument();
    expect(screen.getByText(/Thiếu huy hiệu/).parentElement).toHaveTextContent("Tuần trọn vẹn, Bạn của Season");
  });

  it("marks earned badges with the level they were earned at and shows the current level's rule for the others", () => {
    render(<LearnerProfile view={b1} actions={actions} />);
    const friday = document.querySelector<HTMLElement>("[data-badge-key='friday']")!;
    expect(within(friday).getByText("Đạt ở B1")).toBeInTheDocument();
    expect(within(friday).getByRole("img", { name: "Biểu tượng Ôn tập đúng hẹn" })).toHaveTextContent("⏰");
    const coach = document.querySelector<HTMLElement>("[data-badge-key='coach_friend']")!;
    expect(within(coach).getByRole("img", { name: "Chưa đạt" })).toBeInTheDocument();
    expect(coach).toHaveTextContent("Có 50 lượt luyện hợp lệ với Season");
    expect(within(coach).queryByText(/Đạt ở/)).not.toBeInTheDocument();
  });
});

describe("badge certificate link", () => {
  it("offers only the preview when the learner cannot open the certificate, even at the top Season", () => {
    render(<LearnerProfile view={{ ...view, badgeCertificateAvailable: false }} actions={actions} />);
    expect(screen.queryByRole("link", { name: "Xem chứng nhận huy hiệu" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem trước chứng nhận" })).toHaveAttribute("href", "/reward/preview");
  });

  it("links to the certificate when the learner can open it", () => {
    render(<LearnerProfile view={{ ...view, badgeCertificateAvailable: true }} actions={actions} />);
    expect(screen.getByRole("link", { name: "Xem chứng nhận huy hiệu" })).toHaveAttribute("href", "/reward/done");
  });
});

describe("Level adjustment modal", () => {
  it.each(["genuine", "simulated"] as const)("shows the decision and identifies simulation for %s", async (source) => {
    const onClose = vi.fn();
    render(<RewardAnnouncementDialog onClose={onClose} announcement={{
      kind: "level-adjustment", points: 0, nextPoints: 5000, seasonName: "Mùa xuân", level: "A1",
      source, reason: "Cần củng cố kỹ năng nghe."
    }} />);
    const dialog = screen.getByRole("dialog", { name: "Trình độ đã được cập nhật" });
    const close = within(dialog).getByRole("button", { name: "Đóng hộp thoại" });
    expect(close).toBeInTheDocument();
    expect(dialog).toHaveFocus();
    expect(dialog.querySelector(".modal-illustration > svg")).toBeInTheDocument();
    expect(within(dialog).getByText("Mức A1")).toBeInTheDocument();
    expect(within(dialog).getByText("Cần củng cố kỹ năng nghe.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Thông báo thật")).toBeNull();
    expect(Boolean(within(dialog).queryByText("Mô phỏng"))).toBe(source === "simulated");
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    await userEvent.setup().click(within(dialog).getByRole("button", { name: "Tiếp tục học" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

it("shows a compact level-up notice with one close control and the operator's reason", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<RewardAnnouncementDialog onClose={onClose} announcement={{
    kind: "new-level-announcement", points: 0, nextPoints: 5000, seasonName: "Mùa thu", level: "B2",
    source: "genuine", reason: "Đạt yêu cầu bài thi lên mức."
  }} />);
  const dialog = screen.getByRole("dialog", { name: "Bạn đã lên mức B2" });
  expect(within(dialog).getByText("Đạt yêu cầu bài thi lên mức.")).toBeInTheDocument();
  expect(dialog).not.toHaveTextContent(/Thông báo thật|Quy tắc công nhận/);
  expect(within(dialog).getAllByRole("button").map(button => button.getAttribute("aria-label") ?? button.textContent))
    .toEqual(["Đóng hộp thoại", "Tiếp tục học"]);
  await user.click(within(dialog).getByRole("button", { name: "Tiếp tục học" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each([
  ["A2", "Bạn đã lên mức B1"],
  ["B1", "Bạn đã được chốt mức B1"],
  ["B2", "Trình độ đã được điều chỉnh xuống B1"]
] as const)("names the final retake decision when the previous level was %s", (previousLevel, title) => {
  render(<RewardAnnouncementDialog onClose={vi.fn()} announcement={{
    kind: "placement-retake-finalized", points: 0, nextPoints: 500, seasonName: "Mùa thu",
    level: "B1", previousLevel, reason: "Đã xét kết quả hai lần thi."
  }} />);
  expect(screen.getByRole("dialog", { name: title })).toHaveTextContent("Đã xét kết quả hai lần thi.");
});

describe("Season congratulation modal", () => {
  it("congratulates the learner on the new Season and closes once", async () => {
    const onClose = vi.fn();
    render(<RewardAnnouncementDialog onClose={onClose} announcement={{
      kind: "season-up", points: 2100, nextPoints: 5000, seasonName: "Mùa thu · B1", seasonLevel: 3, level: "B1",
      announcementId: "season-up:B1:3", source: "genuine", rule: "Lên Season khi đủ điểm và mọi huy hiệu của Season đó; đi lần lượt, không nhảy cấp."
    }} />);
    const dialog = screen.getByRole("dialog", { name: "Bạn đã lên cấp Mùa 3" });
    expect(dialog).toHaveClass("learner-reward-dialog");
    expect(dialog.querySelector(".modal-illustration .profile-season-figure")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Đóng hộp thoại" })).toBeInTheDocument();
    expect(within(dialog).getByText("Mùa thu · B1")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Huy hiệu đã nhận vẫn được giữ.");
    expect(dialog).not.toHaveTextContent(/Thông báo thật|Quy tắc công nhận/);
    await userEvent.setup().click(within(dialog).getByRole("button", { name: "Tiếp tục học" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("manager reward simulator", () => {
  it("uses the monthly badge names and the same point rules as the learner profile", () => {
    render(<MemoryRouter><ManagerRewards /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Tuần trọn vẹn", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ôn tập đúng hẹn", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thợ chữ", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuỗi ngày học", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Điểm thi tháng", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chuỗi 3 ngày|Chuỗi 5 ngày/, hidden: true })).not.toBeInTheDocument();
    const rules = screen.getByTestId("reward-point-rules");
    expect(rules).toHaveTextContent("Hoàn thành bài Ôn tuần (thứ Sáu): +15");
    expect(rules).toHaveTextContent("Mini game đạt từ 50/100");
    expect(rules).not.toHaveTextContent(/bí mật/);
  });
});
