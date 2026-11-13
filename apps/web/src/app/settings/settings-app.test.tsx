// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagerSettingsView, OperatorSettingsOverviewView, OrganisationExperienceView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { SettingsPage } from "./index.js";
import { ThemeProvider } from "../shared/ThemeProvider.js";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const manager: ManagerSettingsView = {
  organizationName: "GFT Demo", programName: "E4S Pilot", reminderInactiveDays: 3, weeklyReportEnabled: true,
  aiTestDisabled: false,
  pilotStartDate: "2026-10-12", simulatedSystemDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
  testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
  backgroundMusic: { enabled: true, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
};
const product: ProductPreferencesView = { theme: "auto", vocabImageSource: "wikimedia" };
const experience: OrganisationExperienceView = { theme: "auto", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } };
const capabilities: SystemCapabilitiesView = {
  api: true,
  database: true,
  ai: true,
  objectStorage: true,
  imageProviders: { pexels: true, pixabay: false }
};

describe("new Settings app branch", () => {
  it("previews a seasonal theme without committing it and rolls back after a failed save", async () => {
    const user = userEvent.setup();
    const onSaveExperience = vi.fn().mockRejectedValue(new Error("offline"));
    const springExperience = { ...experience, theme: "spring" as const };
    render(<ThemeProvider><SettingsPage role="operator" product={product} experience={springExperience} capabilities={capabilities} actions={{ onSaveExperience }} /></ThemeProvider>);

    await user.click(screen.getByRole("radio", { name: "Mùa thu" }));
    expect(document.documentElement.dataset.theme).toBe("autumn");
    expect(window.localStorage.getItem("e4s:theme")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Lưu giao diện" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("spring"));
    expect(screen.getByRole("radio", { name: "Mùa xuân" })).toBeChecked();
  });

  it("keeps the Settings title on the shared page-title layout", () => {
    const { container } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);
    const title = container.querySelector(".settings-page > .page-title");
    expect(title).toHaveClass("page-title");
    expect(title).not.toHaveClass("manager-page-title");
  });

  it("keeps Manager sections in app order", () => {
    const { container } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} accounts={<section><h3>Người dùng</h3></section>} />);
    expect([...container.querySelectorAll("h3")].map((node) => node.textContent)).toEqual([
      "Ngày hệ thống thử", "Học theo tháng", "Giao diện theo mùa / lễ", "Nhạc nền của Season", "Chính sách nhắc học và báo cáo", "Người dùng"
    ]);
    expect(screen.queryByText(/Khoá nhà cung cấp được lưu an toàn/)).not.toBeInTheDocument();
    expect(screen.queryByText("Xuất JSON")).not.toBeInTheDocument();
  });

  it("keeps Settings guidance concise", () => {
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);

    expect(screen.getByText(/Đổi màu và icon; không đổi bố cục, nội dung, dữ liệu/)).toBeInTheDocument();
  });


  it.each(["manager", "operator"] as const)("removes obsolete program labels from %s settings", (role) => {
    const overview: OperatorSettingsOverviewView = {
      organizationName: "GFT Demo",
      settings: manager,
      pilot: { startDate: "2026-10-12", weeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20 },
      test: { timed: true, times: { listening: 15, reading: 20, writing: 20, speaking: 15 }, warnLimit: 3 },
      accounts: []
    };
    if (role === "manager") render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} actions={actions()} />);
    else render(<SettingsPage role="operator" operatorOverview={overview} product={product} capabilities={capabilities} actions={actions()} />);

    expect(screen.queryByRole("textbox", { name: "Tên chương trình" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Chủ đề lớn của khoá/ })).not.toBeInTheDocument();
  });

  it.each(["manager", "operator"] as const)("does not expose editable placement-test timing controls to %s", (role) => {
    const overview: OperatorSettingsOverviewView = {
      organizationName: "GFT Demo",
      settings: manager,
      pilot: { startDate: "2026-10-12", weeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20 },
      test: { timed: true, times: { listening: 15, reading: 25, writing: 20, speaking: 15 }, warnLimit: 3 },
      accounts: []
    };
    if (role === "manager") render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} actions={actions()} />);
    else render(<SettingsPage role="operator" operatorOverview={overview} product={product} capabilities={capabilities} actions={actions()} />);

    expect(screen.queryByRole("checkbox", { name: "Bật tính giờ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Nghe (phút)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Đọc (phút)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /Số lần cảnh báo/ })).not.toBeInTheDocument();
  });

  it.each(["manager", "operator"] as const)("shows monthly learning settings without pilot controls for %s", (role) => {
    const overview: OperatorSettingsOverviewView = {
      organizationName: "GFT Demo",
      settings: manager,
      pilot: { startDate: manager.pilotStartDate, weeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: manager.courseTheme, coachDailyLimit: 20 },
      test: { timed: true, times: manager.testTimes, warnLimit: 3 },
      accounts: []
    };
    if (role === "manager") render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} actions={actions()} />);
    else render(<SettingsPage role="operator" operatorOverview={overview} product={product} capabilities={capabilities} actions={actions()} />);

    expect(screen.getByRole("heading", { name: "Học theo tháng" })).toBeInTheDocument();
    expect(screen.getByText(/Ngày học cuối cùng là Bài thi tháng/)).toBeInTheDocument();
    expect(screen.queryByText(/Lịch pilot|Số tuần của chu kỳ|Chu kỳ/)).not.toBeInTheDocument();
  });

  it("uses semantic Lucide marks for seasonal controls", () => {
    const { container } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);

    expect(container.querySelectorAll(".settings-theme-choice svg")).toHaveLength(8);
    expect(screen.queryByRole("combobox", { name: /Chủ đề giao diện/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tự động theo ngày" })).toBeChecked();
    expect(container.querySelector(".lucide-moon-star")).toBeInTheDocument();
    expect(container.querySelector(".lucide-gift")).toBeInTheDocument();
  });

  it("keeps the core constraints when Settings descriptions are concise", () => {
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);

    expect(screen.getByText(/Ngày học cuối cùng là Bài thi tháng/)).toBeInTheDocument();
    expect(screen.getByText(/danh sách nhạc.*prototype.*cần mạng.*YouTube.*bật\/tắt/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Nhắc học qua Base.vn/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Webhook URL")).not.toBeInTheDocument();
  });

  it("wires settings save for the Manager", async () => {
    const callbacks = actions(); const user = userEvent.setup();
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={callbacks} />);
    expect(screen.queryByRole("spinbutton", { name: "Khuyến nghị học tối thiểu (phút/ngày)" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("spinbutton", { name: /Giới hạn chat với Season/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Giới hạn chat với Season/ }), "40");
    await user.click(screen.getByRole("button", { name: "Lưu thiết lập học theo tháng" }));
    expect(callbacks.onSaveManager).toHaveBeenCalled();
  });

  it("hides the technical cards (Prompt & rubric, AI connection, vocabulary images, data) from the Manager", () => {
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);
    for (const name of ["Prompt & rubric", "Kết nối AI", "Ảnh minh hoạ từ vựng", "Dữ liệu"]) expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    for (const name of ["Mở Prompt & rubric", "Lưu kết nối AI", "Xoá cache ảnh", "Xuất JSON", "Nhập JSON", "Xuất CSV tiến độ"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mở Prompt & rubric" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Tắt AI để kiểm thử chế độ dự phòng" })).not.toBeInTheDocument();
  });

  it("shows localized account states in the read-only staff directory", () => {
    const overview: OperatorSettingsOverviewView = {
      organizationName: "GFT Demo",
      settings: manager,
      pilot: { startDate: "2026-10-12", weeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: manager.courseTheme, coachDailyLimit: 20 },
      test: { timed: true, times: manager.testTimes, warnLimit: 3 },
      accounts: [
        { id: "locked", displayName: "Học viên A", email: "a@example.com", role: "learner", status: "disabled", createdAt: "2026-10-12T00:00:00.000Z" },
        { id: "active", displayName: "Nhân sự B", email: "b@example.com", role: "operator", status: "active", createdAt: "2026-10-12T00:00:00.000Z" },
      ]
    };
    const { container } = render(<SettingsPage role="operator" operatorOverview={overview} product={product} capabilities={capabilities} actions={actions()} />);

    expect(screen.getByText("Đã khoá")).toHaveClass("account-status-locked");
    expect(screen.getByText("Đang hoạt động")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Người vận hành" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\b(operator|disabled)\b/i);
  });

  it("lets Operator save organisation theme and music without exposing Manager-only controls", async () => {
    const overview: OperatorSettingsOverviewView = {
      organizationName: "GFT Demo",
      settings: manager,
      pilot: { startDate: "2026-10-12", weeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20 },
      test: { timed: true, times: { listening: 15, reading: 20, writing: 20, speaking: 15 }, warnLimit: 3 },
      accounts: [{ id: "learner-1", displayName: "Học viên A", email: "a@example.com", role: "learner", status: "active", createdAt: "2026-10-12T00:00:00.000Z" }]
    };
    const callbacks = actions();
    const { container } = render(<SettingsPage role="operator" operatorOverview={overview} product={product} experience={experience} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={callbacks} />);
    expect([...container.querySelectorAll("h3")].map((node) => node.textContent)).toEqual(["Giao diện theo mùa / lễ", "Nhạc nền của Season", "Học theo tháng", "Yêu cầu đổi đề", "Người dùng"]);
    expect(screen.getByText("Học viên A")).toBeInTheDocument();
    expect(screen.queryByText(/Lịch pilot|Số tuần của chu kỳ|Chu kỳ/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nghe (phút)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu thiết lập học theo tháng" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu bài test" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu ngưỡng" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ngưỡng xét lên|Số ngày xét|Hạ mức: tỉ lệ sai|Sẵn sàng thi lên level/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm học viên/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prompt & rubric" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mở Prompt & rubric" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mở trình sửa prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kết nối AI" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("API key mới (để trống = giữ key đang lưu)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nhà cung cấp")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ảnh minh hoạ từ vựng" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("radio", { name: "Mùa đông" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Lưu giao diện" }));
    expect(callbacks.onSaveExperience).toHaveBeenCalledWith(expect.objectContaining({ theme: "winter" }));
    await userEvent.setup().clear(screen.getByLabelText("Link YouTube tùy chỉnh (không bắt buộc)"));
    await userEvent.setup().type(screen.getByLabelText("Link YouTube tùy chỉnh (không bắt buộc)"), "https://www.youtube.com/watch?v=study");
    await userEvent.setup().click(screen.getByRole("button", { name: /Tự động chọn theo giờ học/ }));
    await userEvent.setup().click(screen.getByRole("option", { name: "In Dreamland · playlist từ prototype" }));
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Cho phép nhạc nền trong app" }));
    fireEvent.change(screen.getByRole("slider", { name: "Âm lượng: 22/100" }), { target: { value: "37" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Lưu nhạc nền" }));
    expect(callbacks.onSaveExperience).toHaveBeenLastCalledWith(expect.objectContaining({ backgroundMusic: expect.objectContaining({ enabled: false, playlistId: "prototype-in-dreamland", customUrl: "https://www.youtube.com/watch?v=study", volume: 37 }) }));
    expect(screen.queryByRole("checkbox", { name: "Hiệu ứng âm thanh" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Nhạc nền" })).not.toBeInTheDocument();
    expect(container.querySelector(".settings-operator-accounts__table")).toBeInTheDocument();
  });

  it("keeps input and output test change requests in one Operator card", async () => {
    const overview: OperatorSettingsOverviewView = { organizationName: "GFT Demo", settings: manager, pilot: { startDate: "2026-10-12", weeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: manager.courseTheme, coachDailyLimit: 20 }, test: { timed: true, times: manager.testTimes, warnLimit: 3 }, accounts: [] };
    const callbacks = actions();
    render(<SettingsPage role="operator" operatorOverview={overview} product={product} capabilities={capabilities} actions={callbacks} />);

    const card = screen.getByRole("heading", { name: "Yêu cầu đổi đề" }).closest("section");
    expect(card).toHaveTextContent("Yêu cầu đổi đề đầu vào");
    expect(card).toHaveTextContent("Yêu cầu đổi đề đầu ra");
    expect(screen.getByRole("button", { name: "Gửi yêu cầu đổi đề đầu vào" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi yêu cầu đổi đề đầu ra" })).toBeInTheDocument();
  });

  it("lists licensed songs by title, previews the draft volume and does not save a failed preview", async () => {
    const callbacks = actions();
    const play = vi.fn().mockRejectedValue(new Error("unavailable"));
    const pause = vi.fn();
    const created: Array<{ src: string; volume: number }> = [];
    vi.stubGlobal("Audio", class {
      preload = "";
      volume = 1;
      constructor(readonly src: string) { created.push(this); }
      play = play;
      pause = pause;
    });
    render(<SettingsPage role="operator" product={product} experience={experience} capabilities={capabilities} actions={callbacks} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Tự động chọn theo giờ học/ }));
    expect(screen.getByRole("option", { name: "In Dreamland · playlist từ prototype" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Study And Relax" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Wholesome" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Emerald Therapy" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("option", { name: "In Dreamland · playlist từ prototype" }));
    await userEvent.setup().type(screen.getByLabelText("Link YouTube tùy chỉnh (không bắt buộc)"), "https://example.test/unavailable.mp3");
    fireEvent.change(screen.getByRole("slider", { name: "Âm lượng: 22/100" }), { target: { value: "37" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Nghe thử" }));

    expect(created[0]).toMatchObject({ src: "https://example.test/unavailable.mp3", volume: 0.37 });
    expect(await screen.findByRole("status")).toHaveTextContent("Cấu hình đang lưu không bị thay đổi");
    expect(callbacks.onSaveExperience).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Về nhạc tự động" }));
    expect(screen.getByRole("button", { name: /Tự động chọn theo giờ học/ })).toBeInTheDocument();
  });

  it("changes the volume of a playing preview immediately", async () => {
    const callbacks = actions();
    const created: Array<{ src: string; volume: number }> = [];
    vi.stubGlobal("Audio", class {
      preload = "";
      volume = 1;
      onerror: (() => void) | null = null;
      constructor(readonly src: string) { created.push(this); }
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
    });
    render(<SettingsPage role="operator" product={product} experience={experience} capabilities={capabilities} actions={callbacks} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Tự động chọn theo giờ học/ }));
    await userEvent.setup().click(screen.getByRole("option", { name: "In Dreamland · playlist từ prototype" }));
    await userEvent.setup().type(screen.getByLabelText("Link YouTube tùy chỉnh (không bắt buộc)"), "https://example.test/preview.mp3");
    await userEvent.setup().click(screen.getByRole("button", { name: "Nghe thử" }));
    fireEvent.change(screen.getByRole("slider", { name: "Âm lượng: 22/100" }), { target: { value: "8" } });

    expect(created[0]?.volume).toBe(0.08);
    expect(screen.getByRole("status")).toHaveTextContent("âm lượng 8/100");
  });

  it("exposes only the prototype playlist and no removed catalog names", async () => {
    render(<SettingsPage role="operator" product={product} experience={experience} capabilities={capabilities} actions={actions()} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Tự động chọn theo giờ học/ }));
    expect(screen.getByRole("option", { name: "In Dreamland · playlist từ prototype" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Study And Relax" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Wholesome" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Emerald Therapy" })).not.toBeInTheDocument();
  });

  it("keeps personal sound preferences out of organisation settings for both roles", () => {
    const { rerender } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "demo", speechToTextModel: "whisper" }} actions={actions()} />);
    expect(screen.queryByRole("heading", { name: "Tùy chọn cá nhân" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Hiệu ứng âm thanh" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Nhạc nền" })).not.toBeInTheDocument();
    rerender(<SettingsPage role="operator" product={product} capabilities={capabilities} actions={actions()} />);
    expect(screen.queryByRole("heading", { name: "Tùy chọn cá nhân" })).not.toBeInTheDocument();
  });

  it("does not offer a global Base test or expose retired webhook secrets", () => {
    render(<SettingsPage role="manager" manager={{ ...manager, baseWebhookUrl: "https://base.example.test/retired-secret" }} product={product} capabilities={capabilities} actions={actions()} />);
    expect(screen.queryByRole("button", { name: "Gửi tin thử" })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("https://base.example.test/retired-secret")).not.toBeInTheDocument();
  });
});

function actions() {
  return {
    onSaveAi: vi.fn(), onTestAi: vi.fn(), onSaveManager: vi.fn(), onSaveProduct: vi.fn(), onSaveExperience: vi.fn(), onTestImage: vi.fn(), onClearImageCache: vi.fn(), onTestMusic: vi.fn(), onResetMusic: vi.fn(), onTestWebhook: vi.fn(),
    onExportJson: vi.fn(), onImportJson: vi.fn(), onExportCsv: vi.fn(), onSeedData: vi.fn(), onWipeData: vi.fn(), onRequestPlacementTestChange: vi.fn(), onRequestFinalTestChange: vi.fn()
  };
}
