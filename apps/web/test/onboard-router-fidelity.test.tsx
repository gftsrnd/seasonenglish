// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearnerHomeView } from "@e4s/contracts";
import type { LearnerPrototypeCallbacks } from "../src/prototype/learner/contracts.js";
import { PrototypeOnboard } from "../src/prototype/learner/Onboard.js";
import { LearnerPrototypeController, normalizeLearnerPrototypePath } from "../src/prototype/learner/Router.js";

afterEach(cleanup);

function actions(overrides: Partial<LearnerPrototypeCallbacks> = {}) {
  return {
    navigate: vi.fn(),
    saveProfileDraft: vi.fn(),
    saveProfile: vi.fn(),
    ...overrides
  } as unknown as LearnerPrototypeCallbacks;
}

const home: LearnerHomeView = {
  onboardingRequired: false,
  learner: { displayName: "Lan", cefr: "A2" },
  program: { name: "English for Every Season", weekCount: 2 },
  week: { id: "w1", weekNumber: 1, topic: "Meetings", description: "", objectives: [] },
  lessons: [],
  nextLesson: null,
  metrics: { completedLessons: 0, totalLessons: 0, studyDays: 0, streakDays: 0, points: 0 },
  schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
  coach: { turnsThisWeek: 0, targetTurns: 2, href: "/coach" },
  practice: { status: "locked", detail: "Chưa mở", href: "/practice" },
  levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
  finalAssessment: { available: false, label: "Làm bài cuối kỳ", href: "/test/final" }
};

describe("onboarding and learner router fidelity", () => {
  it("keeps the canonical new-learner onboarding framing and choice groups", () => {
    render(<PrototypeOnboard view={{ mode: "new", profile: {} }} actions={actions()} />);

    expect(screen.getByText("Bước 1/2 · Hồ sơ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cho Season biết về bạn nhé" })).toBeInTheDocument();
    expect(screen.getByTestId("season-mark")).toBeInTheDocument();
    expect(screen.getByText(/dùng thông tin này để chọn ví dụ và cách học hợp với bạn/i)).toBeInTheDocument();
    expect(screen.getByText(/bước 1 · hồ sơ · đang làm/i)).toBeInTheDocument();
    expect(screen.getByText(/bước 2 · test đầu vào · tiếp theo/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /nói chuyện với khách hàng/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /chưa có thói quen nào/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /informal · thân thiện/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lưu tạm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lưu và làm test đầu vào/i })).not.toBeDisabled();
  });

  it("validates canonical required profile groups and sends a draft back home", async () => {
    const user = userEvent.setup();
    const saveProfile = vi.fn();
    const saveProfileDraft = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();
    render(<PrototypeOnboard view={{ mode: "new", profile: { fullName: "Lan", email: "lan@example.com" } }} actions={actions({ saveProfile, saveProfileDraft, navigate })} />);

    await user.click(screen.getByRole("button", { name: /lưu và làm test đầu vào/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/chọn ít nhất một mục đích dùng tiếng anh/i);
    expect(saveProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /lưu tạm/i }));
    await waitFor(() => expect(saveProfileDraft).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Lan", email: "lan@example.com" })));
    expect(navigate).toHaveBeenCalledWith("/home");
  });

  it("keeps edit mode as the canonical profile screen without the setup draft action", () => {
    render(<PrototypeOnboard view={{ mode: "edit", profile: {
      fullName: "Lan", email: "lan@example.com", goals: ["email"], environmentUse: "weekly", familyUse: "never",
      habits: ["movies"], learningStyles: ["reading"], explanationLanguage: "auto", persona: "formal", durationMinutes: 10,
      device: "both", selfLevel: "A2", certificates: [{ type: "TOEIC", result: "650", year: "2023" }]
    } }} actions={actions()} />);

    expect(screen.getByText("Hồ sơ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sửa hồ sơ của bạn" })).toBeInTheDocument();
    expect(screen.queryByText(/bước 1 · hồ sơ · đang làm/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lưu tạm/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Huỷ" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("checkbox", { name: /toeic/i })).toBeChecked();
    expect(screen.getByLabelText(/năm thi toeic/i)).toHaveValue("2023");
  });

  it("normalizes canonical hash/query paths and keeps root and invalid child routes explicit", () => {
    expect(normalizeLearnerPrototypePath("#/home/?from=onboard")).toBe("/home");
    expect(normalizeLearnerPrototypePath("#/")) .toBe("/");

    render(<LearnerPrototypeController path="#/" contracts={{ home }} callbacks={actions()} />);
    expect(screen.getByRole("heading", { name: "Chào Lan!" })).toBeInTheDocument();
    cleanup();

    render(<LearnerPrototypeController path="/games/not-a-game" contracts={{ games: {
      cefr: "A2", wordSet: { id: "set-1", topic: "Meetings", cefr: "A2", source: "weekly", words: [] }, games: [],
      arena: { eligible: false, requiredLevel: "B1", points: 0, pendingDuels: 0 }
    } }} callbacks={actions()} />);
    expect(screen.getByRole("note")).toHaveTextContent(/không tìm thấy trò chơi/i);
    expect(screen.getByRole("link", { name: /mini game/i })).toHaveAttribute("href", "/games");
  });
});
