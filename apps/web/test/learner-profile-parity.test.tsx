// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerProfile } from "../src/app/learner/ProfileReward.js";
import type { LearnerCallbacks, ProfileView } from "../src/app/learner/contracts.js";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const actions = {
  navigate: vi.fn(),
  saveAvatar: vi.fn()
} as unknown as LearnerCallbacks;

const view: ProfileView = {
  learner: {
    id: "learner-c",
    displayName: "Học viên C",
    cefr: "B1",
    profile: {
      fullName: "Học viên C",
      email: "hoc.vien.c@gft.example",
      position: "QA lead",
      department: "QA",
      goals: ["meeting", "docs"],
      environmentUse: "weekly",
      familyUse: "never",
      habits: ["movies", "social"],
      situations: "Họp daily với team Singapore",
      learningStyles: ["reading", "writing"],
      explanationLanguage: "auto",
      persona: "informal",
      durationMinutes: 10,
      device: "phone",
      selfLevel: "B1",
      certificates: [{ type: "TOEIC", result: "650", year: "2023" }],
      experience: "Học ở trường",
      concerns: "Muốn nói trôi chảy hơn",
      avatar: { color: "olive", acc: "sun", bg: 2 }
    }
  },
  points: 201,
  badges: [{ key: "first", label: "Khởi động" }, { key: "streak3", label: "Ba ngày liền" }],
  weeks: [
    { weekNumber: 1, topic: "Introducing yourself", completedLessons: 4, totalLessons: 5, days: [
      { label: "T2", status: "on_time" }, { label: "T3", status: "late" }, { label: "T4", status: "upcoming" }, { label: "T5", status: "upcoming" }, { label: "T6", status: "upcoming" }
    ] },
    { weekNumber: 2, topic: "Emails & meetings", completedLessons: 2, totalLessons: 5, days: [] }
  ],
  studyDays: 6,
  activity: [],
  season: {
    current: { key: "summer", level: 2, name: "Mùa hạ", pointsRequired: 60 },
    next: { key: "autumn", level: 3, name: "Mùa thu", pointsRequired: 180 },
    earnedBadgeCount: 2,
    requiredBadgeCount: 3
  },
  badgeRoadmap: [
    { key: "first", label: "Khởi động", description: "Hoàn thành bài đầu tiên", seasonLevel: 2, earned: true },
    { key: "week", label: "Trọn tuần", description: "Hoàn thành một tuần", seasonLevel: 3, earned: true },
    { key: "friday", label: "Thứ Sáu", description: "Học vào Thứ Sáu", seasonLevel: 3, earned: true },
    { key: "chat", label: "Bạn của Season", description: "Luyện đủ lượt", seasonLevel: 3, earned: false },
    { key: "sharp", label: "Sắc bén", description: "Đạt độ chính xác cao", seasonLevel: 4, earned: false }
  ],
  levelReadiness: {
    targetLevel: "B2",
    windowDays: 14,
    eligible: true,
    examAvailable: true,
    criteria: [
      { key: "lessonCompletion", label: "Bài học hoàn thành", current: 90, target: 80, display: "9/10 bài", met: true },
      { key: "firstTryAccuracy", label: "Phần bài đúng ngay lần đầu", current: 75, target: 70, display: "75%", met: true },
      { key: "weeklyPractice", label: "Bài thực hành tuần gần nhất", current: 82, target: 70, display: "82/100", met: true },
      { key: "coachRubric", label: "Rubric khi luyện với Season", current: 4, target: 3.5, display: "4/5", met: true }
    ]
  },
  stats: { completedLessons: 6, coachTurns: 9, studyDays: 6 },
  assessments: {
    placement: { totalScore: 62, approvedLevel: "B1", sections: { listening: 55, reading: 60, writing: 50, speaking: 50 } },
    final: null
  },
  finalAssessmentAvailable: false,
  surveyAvailable: false
};

describe("learner profile app parity", () => {
  it("renders the full app profile from real contract data after the learner opens personal details", async () => {
    const { container } = render(<LearnerProfile view={view} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Học viên C" })).toBeInTheDocument();
    expect(screen.getByText(/Trình độ B1 – Trung cấp/)).toBeInTheDocument();
    const avatar = screen.getByLabelText("Avatar của Học viên C");
    expect(avatar.querySelector("svg")).not.toBeNull();
    expect(avatar).toHaveStyle({ width: "88px", height: "88px", background: "#E3DCFB", color: "#4B6120" });
    expect(screen.getByText("Nắng · nét ô liu")).toBeInTheDocument();

    const profile = screen.getByRole("region", { name: "Hồ sơ cá nhân" });
    expect(within(profile).queryByText("Họp và trình bày, Đọc tài liệu, spec kỹ thuật")).not.toBeInTheDocument();
    await userEvent.setup().click(within(profile).getByRole("button", { name: "Chỉnh sửa thông tin cá nhân" }));
    expect(within(profile).getByText("Họp và trình bày, Đọc tài liệu, spec kỹ thuật")).toBeInTheDocument();
    expect(within(profile).getByText("Vài lần mỗi tuần")).toBeInTheDocument();
    expect(within(profile).getByText("Tiếng Anh (tự động theo mức B1)")).toBeInTheDocument();
    expect(within(profile).getByText("Informal · Thân thiện")).toBeInTheDocument();
    expect(within(profile).queryByText("meeting, docs")).not.toBeInTheDocument();

    const season = screen.getByRole("region", { name: "Mùa học" });
    expect(within(season).getByText("Mùa học 2/4")).toBeInTheDocument();
    expect(within(season).getByRole("img", { name: "Mùa hạ" })).toHaveStyle({ width: "104px", height: "104px", background: "var(--primary)" });
    expect(within(season).getByText("① Điểm")).toBeInTheDocument();
    expect(within(season).getByText("★ 201 / 180")).toBeInTheDocument();
    expect(within(season).getByText("② Huy hiệu của cấp tiếp theo")).toBeInTheDocument();
    expect(within(season).getByText("2 / 3")).toBeInTheDocument();
    expect(within(season).getByText(/Còn thiếu: Bạn của Season/)).toBeInTheDocument();
    expect(within(season).getByRole("img", { name: "Biểu tượng Khởi động" })).toHaveTextContent("🐣");
    expect(within(season).getByRole("img", { name: "Biểu tượng Bạn của Season" })).toHaveTextContent("💬");
    expect(within(season).getByRole("link", { name: "Xem trước màn hình khi đạt cấp cao nhất" })).toHaveAttribute("href", "/reward/preview");
    expect(within(season).getByText("Cách tính điểm và lên cấp")).toBeInTheDocument();

    const readiness = screen.getByRole("region", { name: "Sẵn sàng thi lên B2" });
    expect(within(readiness).getAllByRole("progressbar")).toHaveLength(4);
    expect(within(readiness).getByText("Bạn đủ điều kiện thi lên mức B2.")).toBeInTheDocument();
    expect(within(readiness).getByText(/6 lượt thử thách với Season/)).toBeInTheDocument();
    expect(within(readiness).getByRole("link", { name: "Thi lên mức" })).toHaveAttribute("href", "/test/level-up");

    expect(screen.getAllByText("T2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("T6").length).toBeGreaterThan(0);
    const weeklyProgress = screen.getByRole("region", { name: "Tiến độ theo tuần" });
    expect(within(weeklyProgress).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(weeklyProgress).getByLabelText("T2: đúng hạn")).toHaveClass("on-time");
    expect(within(weeklyProgress).getByLabelText("T3: trễ hạn")).toHaveClass("late");
    expect(within(weeklyProgress).getAllByLabelText("T4: chưa đến hạn")[0]).toHaveClass("upcoming");
    const assessment = screen.getByRole("region", { name: "Kết quả đánh giá" });
    expect(within(assessment).getByRole("region", { name: "Điểm đầu vào" })).toHaveClass("profile-assessment-result");
    const placement = within(assessment).getByRole("region", { name: "Điểm đầu vào" });
    expect(within(placement).getByText("Đầu vào · B1")).toBeInTheDocument();
    expect(within(placement).getByText("62")).toBeInTheDocument();
    expect(container.textContent).not.toContain("weekly");
  });

  it("keeps the app avatar picker as a real persisted interaction", async () => {
    const user = userEvent.setup();
    render(<LearnerProfile view={view} actions={actions} />);

    await user.click(screen.getAllByRole("button", { name: "Đổi avatar" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Avatar của bạn" });
    expect(within(dialog).getByRole("button", { name: "Nắng" }).querySelector("svg")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Xám nâu" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Màu nền 4" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Hoa" }));
    await user.click(within(dialog).getByRole("button", { name: "Đỏ hồng" }));
    await user.click(within(dialog).getByRole("button", { name: "Màu nền 4" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu avatar" }));
    expect(actions.saveAvatar).toHaveBeenCalledWith({ acc: "flower", color: "rose", bg: 3 });
  });

  it("keeps the app badge art for the API's persisted badge keys", () => {
    render(<LearnerProfile view={{ ...view, badges: [{ key: "starter", label: "Khởi động" }], badgeRoadmap: [{ key: "starter", label: "Khởi động", description: "Hoàn thành bài học đầu tiên", seasonLevel: 2, earned: true }, { key: "coach_friend", label: "Bạn của Season", description: "Hoàn thành 10 lượt luyện với Season", seasonLevel: 3, earned: false }, { key: "wordsmith", label: "Thợ mở khoá", description: "Mở đủ ô từ bí mật với Season", seasonLevel: 4, earned: false }] }} actions={actions} />);
    const season = screen.getByRole("region", { name: "Mùa học" });
    expect(within(season).getByRole("img", { name: "Biểu tượng Khởi động" })).toHaveTextContent("🐣");
    expect(within(season).getByRole("img", { name: "Biểu tượng Bạn của Season" })).toHaveTextContent("💬");
    expect(within(season).getByRole("img", { name: "Biểu tượng Thợ mở khoá" })).toHaveTextContent("🔑");
    expect(within(season).queryByText("🏅")).not.toBeInTheDocument();
  });
});
