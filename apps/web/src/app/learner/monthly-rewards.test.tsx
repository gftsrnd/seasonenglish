// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerProfile } from "./ProfileReward.js";
import { LevelUpCelebration } from "./Home.js";
import { ManagerRewards } from "../manager/Rewards.js";
import { REWARD_POINT_RULES } from "../shared/SeasonProgressCard.js";
import type { LearnerCallbacks, ProfileView } from "./contracts.js";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const actions = { navigate: vi.fn(), saveAvatar: vi.fn() } as unknown as LearnerCallbacks;

const view = {
  learner: { displayName: "Học viên Demo", cefr: "B1", profile: { fullName: "Học viên Demo", goals: [], habits: [], learningStyles: [], explanationLanguage: "auto", durationMinutes: 10, device: "both", selfLevel: "unknown", certificates: [] } },
  points: 400,
  badges: [],
  weeks: [],
  studyDays: 0,
  activity: [],
  season: { current: { key: "winter", level: 4, name: "Mùa đông – vững vàng", pointsRequired: 360 }, next: null, earnedBadgeCount: 0, requiredBadgeCount: 0 },
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
      "Mini game đạt từ 50% điểm tối đa: +5, tối đa 3 lượt có điểm mỗi ngày (chơi thêm vẫn được, không cộng điểm)",
      "Nộp bài thi cuối tháng: +15",
      "Bài kiểm tra đầu vào, thi lên mức: +10",
      "Hoàn thành trọn lịch học tháng (mọi bài mới và bài ôn): +20, một lần mỗi tháng",
      "Lên cấp: đủ điểm và mọi huy hiệu của cấp; đi lần lượt, không nhảy cấp."
    ]);
    expect(rules).not.toHaveTextContent(/bí mật/);
    expect(REWARD_POINT_RULES).toHaveLength(8);
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

describe("Season congratulation modal", () => {
  it("congratulates the learner on the new Season and closes once", async () => {
    const onClose = vi.fn();
    render(<LevelUpCelebration displayName="Minh Anh" onClose={onClose} announcement={{
      kind: "season-up", points: 190, nextPoints: 360, seasonName: "Mùa thu – gặt hái", seasonLevel: 3,
      announcementId: "season-up:3", source: "genuine", rule: "Lên Season khi đủ điểm và mọi huy hiệu của Season đó; đi lần lượt, không nhảy cấp."
    }} />);
    const dialog = screen.getByRole("dialog", { name: "Chúc mừng lên Season mới" });
    expect(dialog).toHaveAttribute("data-modal", "season-up-celebration");
    expect(within(dialog).getByText("Chúc mừng Minh Anh!")).toBeInTheDocument();
    expect(within(dialog).getByText("Mùa học 3/4")).toBeInTheDocument();
    expect(within(dialog).getByText(/Bạn vừa lên Mùa thu – gặt hái/)).toBeInTheDocument();
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
    const rules = screen.getByTestId("reward-point-rules");
    expect(rules).toHaveTextContent("Hoàn thành bài Ôn tuần (thứ Sáu): +15");
    expect(rules).toHaveTextContent("Mini game đạt từ 50% điểm tối đa");
    expect(rules).not.toHaveTextContent(/bí mật/);
  });
});
