// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "../src/pages/learner/Home.js";
import { Lesson } from "../src/pages/learner/Lesson.js";
import { Micro } from "../src/pages/learner/Micro.js";
import { Onboard } from "../src/pages/learner/Onboard.js";
import { Profile } from "../src/pages/learner/Profile.js";
import type { LearnerProgressView, LessonPart } from "@e4s/contracts";

afterEach(cleanup);

const lessonParts: LessonPart[] = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
].map((code) => ({ code: code as LessonPart["code"], title: code, content: { text: code } }));

describe("learner screens preserve the prototype flow", () => {
  it("keeps onboarding as one grouped form with one save action", () => {
    render(<Onboard initialProfile={{ fullName: "", email: "" }} onSave={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /cho season biết về bạn nhé/i })).toBeInTheDocument();
    expect(screen.getByText(/bước 1 · hồ sơ · đang làm/i)).toBeInTheDocument();
    expect(screen.getByText(/bước 2 · test đầu vào · tiếp theo/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /thông tin cá nhân/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /phong cách học/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /về tiếng anh/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /lưu hồ sơ/i })).toHaveLength(1);
  });

  it("makes today's lesson the single primary action on home without changing route order", () => {
    render(<Home view={{
      onboardingRequired: false,
      learner: { displayName: "Học viên Demo", cefr: "A2" },
      week: { id: "w1", weekNumber: 1, topic: "Giới thiệu trong công việc", description: "", objectives: [] },
      lessons: [
        { id: "l1", dayNumber: 1, title: "Bài 1", status: "completed" },
        { id: "l2", dayNumber: 2, title: "Bài 2", status: "not_started" }
      ],
      nextLesson: { id: "l2", dayNumber: 2, title: "Bài 2", status: "not_started" },
      metrics: { completedLessons: 1, totalLessons: 2, studyDays: 1, streakDays: 1, points: 20 },
      program: { name: "E4S Pilot", weekCount: 2 },
      schedule: {
        daysPerWeek: 5, lessonMinutes: 10,
        days: [
          { label: "T2", date: "2026-10-12", status: "attended" }, { label: "T3", date: "2026-10-13", status: "today" },
          { label: "T4", date: "2026-10-14", status: "upcoming" }, { label: "T5", date: "2026-10-15", status: "upcoming" },
          { label: "T6", date: "2026-10-16", status: "upcoming" }
        ]
      },
      coach: { turnsThisWeek: 2, targetTurns: 2, href: "/coach" },
      practice: { status: "locked", detail: "Mở khi hoàn thành đủ 5 bài.", href: "/practice" },
      levelReadiness: {
        targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: true,
        criteria: [
          { key: "lessonCompletion", label: "Bài học hoàn thành", current: 20, target: 90, display: "1/5 bài", met: false },
          { key: "firstTryAccuracy", label: "Phần bài đúng ngay lần đầu", current: 100, target: 75, display: "4/4 phần", met: true },
          { key: "weeklyPractice", label: "Bài thực hành tuần gần nhất", current: 86, target: 80, display: "86/100", met: true },
          { key: "coachRubric", label: "Rubric khi luyện với Season", current: 4.3, target: 4, display: "4.3/5", met: true }
        ]
      },
      finalAssessment: { available: true, label: "Làm bài cuối kỳ", href: "/test/final" }
    }} />);
    expect(screen.getByRole("heading", { name: /chào học viên demo/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /học bài 2/i })).toHaveAttribute("href", "/lesson/l2");
    expect(screen.getByRole("navigation", { name: /lộ trình tuần/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /t2 · bài 1/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /t3 · bài 2/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /điểm danh tuần này/i })).toHaveTextContent("T2");
    expect(screen.getByRole("link", { name: /luyện với season/i })).toHaveAttribute("href", "/coach");
    expect(screen.getByRole("link", { name: /bài thực hành cuối tuần/i })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("region", { name: /đường lên mức b1/i })).toHaveTextContent(/1\/5 bài/i);
    expect(screen.getByRole("link", { name: /làm bài cuối kỳ/i })).toHaveAttribute("href", "/test/final");
  });

  it("keeps the prototype home hierarchy instead of introducing a new dashboard order", () => {
    const { container } = render(<Home view={{
      onboardingRequired: false,
      learner: { displayName: "Học viên Demo", cefr: "A2" },
      week: { id: "w1", weekNumber: 1, topic: "Giới thiệu trong công việc", description: "", objectives: [] },
      lessons: [{ id: "l1", dayNumber: 1, title: "Bài 1", status: "in_progress" }],
      nextLesson: { id: "l1", dayNumber: 1, title: "Bài 1", status: "in_progress" },
      metrics: { completedLessons: 0, totalLessons: 1, studyDays: 0, streakDays: 0, points: 0 },
      program: { name: "Tiếng Anh giao tiếp công sở", weekCount: 2 },
      schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
      coach: { turnsThisWeek: 0, targetTurns: 2, href: "/coach" },
      practice: { status: "locked", detail: "Chưa mở", href: "/practice" },
      levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
      finalAssessment: { available: false, label: "Làm bài cuối kỳ", href: "/test/final" }
    }} />);

    expect(screen.getByText("Chủ đề lớn của khoá")).toBeInTheDocument();
    expect(screen.getByText("Chủ đề tuần 1")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/học ngắn|mỗi ngày/i);
    expect(Array.from(container.querySelectorAll("[data-home-block]")).map((node) => node.getAttribute("data-home-block"))).toEqual([
      "context", "notice", "primary", "metrics", "week-path", "attendance", "activities", "readiness"
    ]);
    expect(screen.queryByRole("region", { name: /bài học siêu ngắn/i })).not.toBeInTheDocument();
  });

  it("keeps certificate, explanation-language and fixed-schedule information in the one-screen profile form", () => {
    render(<Onboard initialProfile={{
      fullName: "Lan", email: "lan@example.com", certificates: [{ type: "TOEIC", result: "650", year: "2023" }]
    }} onSave={vi.fn()} />);

    expect(screen.getByText(/a1–a2 giải thích bằng tiếng việt/i)).toBeInTheDocument();
    expect(screen.getByText(/5 ngày\/tuần/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /toeic/i })).toBeChecked();
    expect(screen.getByLabelText(/kết quả toeic/i)).toHaveValue("650");
  });

  it("uses the prototype edit-profile heading, guidance and action row for an existing learner", () => {
    render(<Onboard initialProfile={{ fullName: "Lan", email: "lan@example.com" }} onSave={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /sửa hồ sơ của bạn/i })).toBeInTheDocument();
    expect(screen.getByText(/khoảng 2 phút thôi/i)).toBeInTheDocument();
    expect(screen.getByText(/các mục có dấu/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /quay lại/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /^huỷ$/i })).toHaveAttribute("href", "/profile");
  });

  it("keeps study and exercise states inside one lesson screen in canonical order", () => {
    render(<Lesson lesson={{
      id: "l2", title: "Bài 2", dayNumber: 2, durationMinutes: 10, cefr: "A2",
      content: { parts: lessonParts },
      progress: { status: "in_progress", completedPartCodes: ["listening"], evidence: {} }
    }} onSaveProgress={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^1\. học$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^2\. bài tập$/i })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /nội dung bài học/i })).toHaveTextContent(/nghe.*nói.*đọc.*viết/i);
    const parts = screen.getAllByTestId("lesson-part");
    expect(parts.map((part) => part.getAttribute("data-part"))).toEqual(lessonParts.map((part) => part.code));
    expect(screen.getByRole("link", { name: /quay lại trang chủ/i })).toHaveAttribute("href", "/home");
    expect(screen.getByText(/bài 2\/5/i)).toBeInTheDocument();
  });

  it("records exercise evidence in the same lesson screen so a learner can resume", async () => {
    const user = userEvent.setup();
    const onSaveProgress = vi.fn();
    render(<Lesson lesson={{
      id: "l2", title: "Bài 2", dayNumber: 2, durationMinutes: 10, cefr: "A2",
      content: { parts: lessonParts },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    }} onSaveProgress={onSaveProgress} />);

    await user.click(screen.getByRole("button", { name: /^2\. bài tập$/i }));
    await user.type(screen.getByLabelText(/câu trả lời writing/i), "I work in AI.");
    await user.click(screen.getByRole("button", { name: /lưu writing/i }));

    expect(onSaveProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: "in_progress",
      completedPartCodes: ["writing"],
      evidence: { writing: { attempts: 1, answer: "I work in AI." } }
    }));
  });

  it("renders structured lesson content as the vocabulary, grammar and pronunciation blocks from the prototype", () => {
    const structuredParts: LessonPart[] = [
      { code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "from", type: "giới từ", pronunciation: "/frɒm/", meaning: "từ, đến từ", examples: ["from Hue", "from Vietnam"] }] } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "Where are you from?", usage: "I am from + nơi", examples: ["I am from Hue."] } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/aɪ/", instruction: "Mở rộng miệng rồi lướt sang /ɪ/.", words: ["I", "time"] } }
    ];
    render(<Lesson lesson={{
      id: "l2", title: "I am from + place", dayNumber: 2, durationMinutes: 10, cefr: "A2",
      content: { parts: structuredParts }, progress: { status: "not_started", completedPartCodes: [], evidence: {} }
    }} onSaveProgress={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "from" })).toBeInTheDocument();
    expect(screen.getByText("từ, đến từ")).toBeInTheDocument();
    expect(screen.getByText("Where are you from?")).toBeInTheDocument();
    expect(screen.getByText("Mở rộng miệng rồi lướt sang /ɪ/.")).toBeInTheDocument();
  });

  it("keeps micro theory, practice, feedback and completion on one screen", () => {
    render(<Micro lesson={{
      id: "m1", topic: "Email ngắn", cefr: "A2", durationMinutes: 5,
      theory: "Dùng could để yêu cầu lịch sự.", vocabulary: ["could", "reschedule", "confirm"],
      practice: { prompt: "Viết một câu xin dời lịch.", type: "write" },
      feedback: { status: "ready", message: "Câu rõ; hãy thêm thời gian đề xuất." }
    }} onSubmit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /email ngắn/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /phản hồi/i })).toHaveTextContent(/thêm thời gian đề xuất/i);
    expect(screen.getByRole("button", { name: /hoàn thành/i })).toBeInTheDocument();
  });

  it("labels profile progress semantically instead of relying on colour", () => {
    render(<Profile view={{
      learner: { id: "u1", displayName: "Học viên Demo", cefr: "A2", profile: { department: "AI", position: "Intern" } },
      points: 20,
      badges: [{ key: "starter", label: "Khởi động" }],
      weeks: [{ weekNumber: 1, topic: "Giới thiệu", completedLessons: 1, totalLessons: 5 }],
      studyDays: 1,
      activity: [],
      season: {
        current: { key: "spring", level: 1, name: "Mùa xuân – gieo hạt", pointsRequired: 0 },
        next: { key: "summer", level: 2, name: "Mùa hạ – đón nắng", pointsRequired: 60 },
        earnedBadgeCount: 1,
        requiredBadgeCount: 2
      },
      badgeRoadmap: [
        { key: "starter", label: "Khởi động", description: "Hoàn thành bài đầu tiên", seasonLevel: 2, earned: true },
        { key: "streak3", label: "Chuỗi 3 ngày", description: "Học 3 ngày liên tiếp", seasonLevel: 2, earned: false },
        { key: "week_complete", label: "Tuần trọn vẹn", description: "Xong cả bộ bài", seasonLevel: 3, earned: false },
        { key: "friday", label: "Đúng hẹn thứ Sáu", description: "Nộp bài tuần", seasonLevel: 3, earned: false },
        { key: "coach_friend", label: "Bạn của Season", description: "10 lượt luyện", seasonLevel: 3, earned: false },
        { key: "streak5", label: "Chuỗi 5 ngày", description: "Học 5 ngày", seasonLevel: 4, earned: false },
        { key: "first_try", label: "Chuẩn ngay lần đầu", description: "Bốn kỹ năng đúng lần đầu", seasonLevel: 4, earned: false },
        { key: "wordsmith", label: "Thợ mở khoá", description: "Mở đủ ô từ", seasonLevel: 4, earned: false }
      ],
      levelReadiness: {
        targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: true,
        criteria: [{ key: "lessonCompletion", label: "Bài học hoàn thành", current: 20, target: 90, display: "1/5 bài", met: false }]
      },
      stats: { completedLessons: 1, coachTurns: 2, studyDays: 1 },
      assessments: {
        placement: { totalScore: 55, approvedLevel: "A2", sections: { listening: 14, reading: 16, writing: 13, speaking: 12 } },
        final: null
      },
      finalAssessmentAvailable: true
    }} />);
    const progress = screen.getByRole("progressbar", { name: /tiến độ tuần 1/i });
    expect(screen.getByRole("region", { name: /nhận diện người học/i })).toHaveTextContent(/avatar của bạn/i);
    expect(screen.getAllByRole("button", { name: /đổi avatar/i })).toHaveLength(2);
    expect(screen.getByRole("link", { name: /sửa hồ sơ/i })).toHaveAttribute("href", "/onboard");
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(within(screen.getByRole("region", { name: /huy hiệu/i })).getByText("Khởi động")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /huy hiệu/i })).getByRole("heading", { name: /cấp 2/i })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /huy hiệu/i })).getByRole("heading", { name: /cấp 3/i })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /huy hiệu/i })).getByRole("heading", { name: /cấp 4/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /mùa học/i })).toHaveTextContent(/20\/60 điểm/i);
    expect(screen.getByRole("region", { name: /mùa học/i })).toHaveTextContent(/1\/2 huy hiệu/i);
    expect(screen.getByRole("region", { name: /đường lên mức b1/i })).toHaveTextContent(/1\/5 bài/i);
    expect(screen.getByRole("region", { name: /điểm đầu vào/i })).toHaveTextContent(/55\/100/i);
    expect(screen.getByRole("progressbar", { name: /điểm nghe/i })).toHaveAttribute("aria-valuenow", "14");
  });

  it("preserves Thu's avatar picker as a separate, usable profile action", async () => {
    const user = userEvent.setup();
    const onSaveAvatar = vi.fn();
    render(<Profile view={profileViewFixture()} onSaveAvatar={onSaveAvatar} />);

    await user.click(screen.getAllByRole("button", { name: /đổi avatar/i })[1]!);
    expect(screen.getByRole("dialog", { name: /avatar của bạn/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^hoa$/i }));
    await user.click(screen.getByRole("button", { name: /^đỏ hồng$/i }));
    await user.click(screen.getByRole("button", { name: /nền 4/i }));
    await user.click(screen.getByRole("button", { name: /lưu avatar/i }));

    expect(onSaveAvatar).toHaveBeenCalledWith({ acc: "flower", color: "rose", bg: 3 });
  });

  it("keeps every prototype profile row and translates stored option keys", () => {
    const view = profileViewFixture();
    view.learner.profile = {
      fullName: "Học viên Demo",
      email: "learner@e4s.local",
      department: "AI",
      position: "QA lead",
      contact: "@demo",
      goals: ["meeting", "docs"],
      environmentUse: "weekly",
      familyUse: "sometimes",
      habits: ["movies", "social"],
      situations: "Họp daily với team Singapore",
      learningStyles: ["reading", "examples"],
      explanationLanguage: "auto",
      persona: "informal",
      durationMinutes: 10,
      device: "phone",
      selfLevel: "B1",
      certificates: [{ type: "TOEIC", result: "650", year: "2023" }],
      experience: "Học ở trường",
      concerns: "Muốn nói trôi chảy hơn"
    };

    render(<Profile view={view} />);

    const details = screen.getByRole("region", { name: /hồ sơ cá nhân/i });
    expect(details).toHaveTextContent("QA lead · AI");
    expect(details).toHaveTextContent("learner@e4s.local");
    expect(details).toHaveTextContent("@demo");
    expect(details).toHaveTextContent("Họp và trình bày, Đọc tài liệu, spec kỹ thuật");
    expect(details).toHaveTextContent("Vài lần mỗi tuần");
    expect(details).toHaveTextContent("Thỉnh thoảng");
    expect(details).toHaveTextContent("Xem phim / video, Mạng xã hội, chat");
    expect(details).toHaveTextContent("Họp daily với team Singapore");
    expect(details).toHaveTextContent("Đọc và ghi chú, Ví dụ sát việc đang làm");
    expect(details).toHaveTextContent("Tiếng Việt (tự động theo mức A2)");
    expect(details).toHaveTextContent("Informal · Thân thiện");
    expect(details).toHaveTextContent("10 phút/buổi · 5 ngày/tuần (T2–T6) · Điện thoại");
    expect(details).toHaveTextContent("Trung cấp (B1)");
    expect(details).toHaveTextContent("TOEIC 650 (2023)");
    expect(details).toHaveTextContent("Học ở trường");
    expect(details).toHaveTextContent("Muốn nói trôi chảy hơn");
  });
});

function profileViewFixture(): LearnerProgressView {
  return {
    learner: { id: "u1", displayName: "Học viên Demo", cefr: "A2" as const, profile: { department: "AI", position: "Intern" } },
    points: 20,
    badges: [{ key: "starter", label: "Khởi động" }],
    weeks: [{ weekNumber: 1, topic: "Giới thiệu", completedLessons: 1, totalLessons: 5 }],
    studyDays: 1,
    activity: [],
    season: {
      current: { key: "spring" as const, level: 1 as const, name: "Mùa xuân – gieo hạt", pointsRequired: 0 },
      next: { key: "summer" as const, level: 2 as const, name: "Mùa hạ – đón nắng", pointsRequired: 60 },
      earnedBadgeCount: 1,
      requiredBadgeCount: 2
    },
    badgeRoadmap: [
      { key: "starter", label: "Khởi động", description: "Hoàn thành bài đầu tiên", seasonLevel: 2 as const, earned: true },
      { key: "streak3", label: "Chuỗi 3 ngày", description: "Học 3 ngày liên tiếp", seasonLevel: 2 as const, earned: false }
    ],
    levelReadiness: { targetLevel: "B1" as const, windowDays: 14 as const, eligible: false, examAvailable: true, criteria: [] },
    stats: { completedLessons: 1, coachTurns: 2, studyDays: 1 },
    assessments: { placement: null, final: null },
    finalAssessmentAvailable: true
  };
}
