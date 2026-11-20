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
    placement: { totalScore: 62, approvedLevel: "B1", sections: { listening: 55, reading: 60, writing: 50, speaking: 50 } }
  },
  surveyAvailable: false
};

describe("learner profile app parity", () => {
  it("renders the full app profile from real contract data after the learner opens personal details", async () => {
    const user = userEvent.setup();
    const { container } = render(<LearnerProfile view={view} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Tiến độ & hồ sơ" })).toBeInTheDocument();
    expect(screen.getByText("Xem trình độ B1, mục tiêu và tiến độ học của bạn.")).toBeInTheDocument();
    const identity = screen.getByRole("region", { name: "Hồ sơ của Học viên C" });
    expect(within(identity).getByRole("heading", { name: "Học viên C" })).toBeInTheDocument();
    const avatar = screen.getByLabelText("Avatar của Học viên C");
    expect(avatar.querySelector("svg")).not.toBeNull();
    expect(avatar).toHaveStyle({ background: "#E3DCFB", color: "#4B6120" });
    expect(avatar.style.width).toBe(avatar.style.height);
    expect(within(identity).getByText("Nắng · nét ô liu")).toBeInTheDocument();

    // Personal details stay behind "Xem hồ sơ": a short summary first, the rest behind "Xem đủ hồ sơ".
    expect(within(identity).queryByText("Họp và trình bày, Đọc tài liệu, spec kỹ thuật")).not.toBeInTheDocument();
    await user.click(within(identity).getByRole("button", { name: "Xem hồ sơ" }));
    expect(within(identity).getByText("Họp và trình bày, Đọc tài liệu, spec kỹ thuật")).toBeInTheDocument();
    expect(within(identity).getByText("Vài lần mỗi tuần")).toBeInTheDocument();
    expect(within(identity).getByText("Tiếng Anh (tự động theo mức B1)")).toBeInTheDocument();
    expect(within(identity).queryByText("Informal · Thân thiện")).not.toBeInTheDocument();
    expect(within(identity).queryByText("Phong cách Season")).not.toBeInTheDocument();
    expect(within(identity).queryByText("meeting, docs")).not.toBeInTheDocument();
    expect(within(identity).getByRole("link", { name: "Cập nhật hồ sơ" })).toHaveAttribute("href", "/onboard");

    const season = screen.getByRole("region", { name: "Mùa học" });
    expect(within(season).getByRole("heading", { name: "Mùa hạ" })).toBeInTheDocument();
    expect(within(season).getByTestId("season-points-summary")).toHaveTextContent("Mùa học 2/4 · Tiếp theo: Mùa thu · Tổng điểm tích lũy: ★ 201");
    expect(within(season).getByRole("img", { name: "Mùa hạ" }).querySelector("img")).toHaveAttribute("src", "/media/rewards/summer.webp");
    expect(within(season).getByRole("progressbar", { name: "Điểm trong trình độ" })).toHaveAttribute("aria-valuenow", "180");
    expect(within(season).getByText("201 / 180")).toBeInTheDocument();
    expect(within(season).getByRole("progressbar", { name: "Huy hiệu" })).toHaveAttribute("aria-valuenow", "2");
    expect(within(season).getByText("2 / 3")).toBeInTheDocument();
    expect(within(season).getByText(/Bạn của Season/, { selector: ".profile-season-missing" })).toBeInTheDocument();
    expect(within(season).getByRole("img", { name: "Biểu tượng Khởi động" }).querySelector("img")).toHaveAttribute("src", "/media/rewards/starter.webp");
    expect(within(season).getByRole("img", { name: "Biểu tượng Bạn của Season" }).querySelector("img")).toHaveAttribute("src", "/media/rewards/coach_friend.webp");
    expect(within(season).getByRole("link", { name: "Xem trước chứng nhận" })).toHaveAttribute("href", "/reward/preview");
    expect(within(season).getByText("Cách tính điểm và lên Season")).toBeInTheDocument();

    const assessment = screen.getByRole("region", { name: "Kết quả đánh giá" });
    const placement = within(assessment).getByRole("region", { name: "Điểm đầu vào" });
    expect(placement).toHaveClass("profile-assessment-result");
    expect(within(placement).getByText("Đầu vào · B1")).toBeInTheDocument();
    expect(within(placement).getByText("62")).toBeInTheDocument();
    // Learning is monthly: the profile no longer has a weekly progress block.
    expect(screen.queryByRole("region", { name: "Tiến độ theo tuần" })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("weekly");
  });

  it("keeps the app avatar picker as a real persisted interaction", async () => {
    const user = userEvent.setup();
    render(<LearnerProfile view={view} actions={actions} />);

    await user.click(screen.getAllByRole("button", { name: "Đổi avatar" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Avatar của bạn" });
    expect(within(dialog).getByRole("button", { name: "Nắng" }).querySelector("svg")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Xám nâu" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Màu nền Xanh nhạt" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Hoa" }));
    await user.click(within(dialog).getByRole("button", { name: "Đỏ hồng" }));
    await user.click(within(dialog).getByRole("button", { name: "Màu nền Xanh nhạt" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu avatar" }));
    expect(actions.saveAvatar).toHaveBeenCalledWith({ acc: "flower", color: "rose", bg: 3 });
  });

  it("keeps the app badge art for the API's persisted badge keys", async () => {
    render(<LearnerProfile view={{ ...view, badges: [{ key: "starter", label: "Khởi động" }], badgeRoadmap: [{ key: "starter", label: "Khởi động", description: "Hoàn thành bài học đầu tiên", seasonLevel: 2, earned: true }, { key: "coach_friend", label: "Bạn của Season", description: "Hoàn thành 10 lượt luyện với Season", seasonLevel: 3, earned: false }, { key: "wordsmith", label: "Thợ mở khoá", description: "Mở đủ ô từ bí mật với Season", seasonLevel: 4, earned: false }] }} actions={actions} />);
    const season = screen.getByRole("region", { name: "Mùa học" });
    // Later Season levels are listed after "Xem tất cả huy hiệu".
    await userEvent.setup().click(within(season).getByRole("button", { name: "Xem tất cả huy hiệu" }));
    // Badges show the owner-supplied pictures (19/11) for the persisted keys, never the generic fallback icon.
    expect(within(season).getByRole("img", { name: "Biểu tượng Khởi động" }).querySelector("img")).toHaveAttribute("src", "/media/rewards/starter.webp");
    expect(within(season).getByRole("img", { name: "Biểu tượng Bạn của Season" }).querySelector("img")).toHaveAttribute("src", "/media/rewards/coach_friend.webp");
    expect(within(season).getByRole("img", { name: "Biểu tượng Thợ mở khoá" }).querySelector("img")).toHaveAttribute("src", "/media/rewards/wordsmith.webp");
    expect(within(season).queryByText("🏅")).not.toBeInTheDocument();
  });
});
