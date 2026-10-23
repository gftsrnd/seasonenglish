// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearnerHomeView } from "@e4s/contracts";
import type { LearnerCallbacks } from "../src/app/learner/contracts.js";
import { LearnerOnboard } from "../src/app/learner/Onboard.js";
import { LearnerController, normalizeLearnerPath } from "../src/app/learner/Router.js";

afterEach(() => { cleanup(); window.localStorage.clear(); });

function actions(overrides: Partial<LearnerCallbacks> = {}) {
  return {
    navigate: vi.fn(),
    saveProfileDraft: vi.fn(),
    saveProfile: vi.fn(),
    ...overrides
  } as unknown as LearnerCallbacks;
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
};

describe("onboarding and learner router fidelity", () => {
  it("keeps the canonical new-learner onboarding framing and choice groups", () => {
    const { container } = render(<LearnerOnboard view={{ mode: "new", profile: {} }} actions={actions()} />);

    expect(screen.getByText("Hồ sơ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cho Season biết về bạn nhé" })).toBeInTheDocument();
    expect(container.querySelector("img[data-product-art='mascot']")).toHaveAttribute("src", "/media/mascot/season-bear.png");
    expect(screen.queryByTestId("season-mark")).not.toBeInTheDocument();
    expect(screen.getByText(/dùng thông tin này để chọn ví dụ sát công việc và cách học hợp với bạn/i)).toBeInTheDocument();
    expect(screen.queryByText(/bước 1 · hồ sơ · đang làm/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bước 2 · test đầu vào · tiếp theo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bước 3 · vận hành duyệt mức · sau đó/i)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /nói chuyện với khách hàng/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /chưa có thói quen nào/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /informal · thân thiện/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lưu nháp/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lưu và làm test đầu vào/i })).not.toBeDisabled();
  });

  it("validates canonical required profile groups and sends a draft back home", async () => {
    const user = userEvent.setup();
    const saveProfile = vi.fn();
    const saveProfileDraft = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();
    render(<LearnerOnboard view={{ mode: "new", profile: { fullName: "Lan", email: "lan@example.com" } }} actions={actions({ saveProfile, saveProfileDraft, navigate })} />);

    await user.click(screen.getByRole("button", { name: /lưu và làm test đầu vào/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/chọn ít nhất một mục đích dùng tiếng anh/i);
    expect(saveProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /lưu nháp/i }));
    await waitFor(() => expect(saveProfileDraft).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Lan", email: "lan@example.com" })));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/home"));
  });

  it("keeps draft and back actions available in edit mode", () => {
    render(<LearnerOnboard view={{ mode: "edit", profile: {
      fullName: "Lan", email: "lan@example.com", goals: ["email"], environmentUse: "weekly", familyUse: "never",
      habits: ["movies"], learningStyles: ["reading"], explanationLanguage: "auto", persona: "formal", durationMinutes: 10,
      device: "both", selfLevel: "A2", certificates: [{ type: "TOEIC", result: "650", year: "2023" }]
    } }} actions={actions()} />);

    expect(screen.getByText("Hồ sơ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sửa hồ sơ của bạn" })).toBeInTheDocument();
    expect(screen.queryByText(/bước 1 · hồ sơ · đang làm/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "← Quay lại" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /lưu nháp/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Huỷ" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /toeic/i })).toBeChecked();
    expect(screen.getByLabelText(/năm thi toeic/i)).toHaveValue("2023");
  });

  it("normalizes canonical hash/query paths and keeps root and invalid child routes explicit", () => {
    expect(normalizeLearnerPath("#/home/?from=onboard")).toBe("/home");
    expect(normalizeLearnerPath("#/")) .toBe("/");

    render(<LearnerController path="#/" contracts={{ home }} callbacks={actions()} />);
    expect(screen.getByRole("heading", { name: "Chào Lan!" })).toBeInTheDocument();
    cleanup();

    render(<LearnerController path="/games/not-a-game" contracts={{ games: {
      cefr: "A2", wordSet: { id: "set-1", topic: "Meetings", cefr: "A2", source: "weekly", words: [] }, games: [],
      arena: { eligible: false, requiredLevel: "B1", points: 0, pendingDuels: 0 }
    } }} callbacks={actions()} />);
    expect(screen.getByRole("note")).toHaveTextContent(/không tìm thấy trò chơi/i);
    expect(screen.getByRole("link", { name: /mini game/i })).toHaveAttribute("href", "/games");
  });
});
