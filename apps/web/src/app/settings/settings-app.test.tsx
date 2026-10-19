// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagerSettingsView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { SettingsPage } from "./index.js";
import { ExperienceProvider } from "../../features/experience/Experience.js";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const manager: ManagerSettingsView = {
  organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true,
  pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
  testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
  levelUp: { days: 14, lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4 },
  backgroundMusic: { enabled: true, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
};
const product: ProductPreferencesView = { theme: "auto", vocabImageSource: "wikimedia" };
const capabilities: SystemCapabilitiesView = {
  api: true,
  database: true,
  ai: true,
  objectStorage: true,
  imageProviders: { pexels: true, pixabay: false }
};

describe("new Settings app branch", () => {
  it("keeps the Settings title on the shared page-title layout", () => {
    const { container } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);
    const title = container.querySelector(".settings-page > .page-title");
    expect(title).toHaveClass("page-title");
    expect(title).not.toHaveClass("manager-page-title");
  });

  it("keeps Manager sections in app order", () => {
    const { container } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} accounts={<section><h3>Người dùng</h3></section>} />);
    expect([...container.querySelectorAll("h3")].map((node) => node.textContent)).toEqual([
      "Tùy chọn cá nhân", "Kết nối AI", "Lịch pilot", "Ảnh minh hoạ từ vựng", "Bài test đầu vào / cuối kỳ", "Ngưỡng xét lên / hạ mức", "Giao diện theo mùa / lễ", "Nhạc nền của Season", "Nhắc học qua Base.vn (Base Message incoming webhook)", "Chính sách nhắc học và báo cáo", "Dữ liệu", "Người dùng"
    ]);
    expect(screen.getByText(/Khoá nhà cung cấp được lưu an toàn ở server/)).toBeInTheDocument();
    expect(screen.getByText("Xuất JSON")).toBeInTheDocument();
  });

  it("keeps Settings guidance concise without dropping constraints", () => {
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);

    expect(screen.getByText(/Mỗi phần tính giờ riêng; hết giờ tự nộp/)).toBeInTheDocument();
    expect(screen.getByText(/Đổi màu và icon; không đổi bố cục, nội dung, dữ liệu/)).toBeInTheDocument();
    expect(screen.getByText(/Ảnh miễn phí theo từ tiếng Anh, không dùng AI/)).toBeInTheDocument();
    expect(screen.getByText("Pexels: đã cấu hình")).toBeInTheDocument();
    expect(screen.getByText("Pixabay: chưa cấu hình")).toBeInTheDocument();
    expect(screen.getByText("Openverse/Wikimedia: không cần API key")).toBeInTheDocument();
  });

  it("uses semantic Lucide marks for seasonal controls", () => {
    const { container } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);

    expect(container.querySelectorAll(".settings-theme-badge svg")).toHaveLength(7);
    expect(container.querySelector(".lucide-moon-star")).toBeInTheDocument();
    expect(container.querySelector(".lucide-gift")).toBeInTheDocument();
  });

  it("keeps the core constraints when Settings descriptions are concise", () => {
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);

    expect(screen.getByText(/số lượt cho phép/i)).toBeInTheDocument();
    expect(screen.getByText(/cần mạng.*không bản quyền.*mặc định.*bật\/tắt/i)).toBeInTheDocument();
    const webhook = screen.getByRole("heading", { name: "Nhắc học qua Base.vn (Base Message incoming webhook)" }).closest("section");
    expect(webhook).toHaveTextContent(/base_content.*\{message\}.*\{name\}/i);
  });

  it("wires provider test, settings save and data operations", async () => {
    const callbacks = actions(); const user = userEvent.setup();
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={callbacks} />);
    await user.click(screen.getByRole("button", { name: "Kiểm tra kết nối AI" }));
    expect(callbacks.onTestAi).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Lưu lịch pilot" }));
    expect(callbacks.onSaveManager).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Xuất JSON" }));
    expect(callbacks.onExportJson).toHaveBeenCalled();
  });

  it("keeps JSON import keyboard-accessible and busy until the file action completes", async () => {
    let resolveImport!: () => void;
    const importDone = new Promise<void>((resolve) => { resolveImport = resolve; });
    const callbacks = actions();
    callbacks.onImportJson = vi.fn(() => importDone);
    const user = userEvent.setup();
    const { container } = render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={callbacks} />);
    const importButton = screen.getByRole("button", { name: "Nhập JSON" });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["{}"], "settings.json", { type: "application/json" });

    expect(fileInput).not.toBeNull();
    importButton.focus();
    await user.keyboard("{Enter}");
    await user.upload(fileInput!, file);

    expect(callbacks.onImportJson).toHaveBeenCalledWith(file);
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAttribute("aria-busy", "true");

    resolveImport();
    await waitFor(() => expect(importButton).not.toBeDisabled());
    expect(importButton).not.toHaveAttribute("aria-busy");
  });

  it("shows only operator-owned settings and working prompt link for Operator", () => {
    const { container } = render(<SettingsPage role="operator" product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);
    expect([...container.querySelectorAll("h3")].map((node) => node.textContent)).toEqual(["Prompt & rubric", "Tùy chọn cá nhân"]);
    expect(screen.queryByRole("heading", { name: "Lịch pilot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dữ liệu" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở trình sửa prompt" })).toHaveAttribute("href", "/op/prompts");
    expect(screen.queryByRole("heading", { name: "Kết nối AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ảnh minh hoạ từ vựng" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Giao diện theo mùa / lễ" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hiệu ứng âm thanh" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Nhạc nền" })).toBeInTheDocument();
  });

  it("stores personal sound preferences locally", async () => {
    render(<ExperienceProvider><SettingsPage role="operator" product={product} capabilities={capabilities} actions={actions()} /></ExperienceProvider>);
    const effects = screen.getByRole("checkbox", { name: "Hiệu ứng âm thanh" });
    const music = screen.getByRole("checkbox", { name: "Nhạc nền" });
    expect(effects).toBeChecked();
    expect(music).toBeChecked();
    await userEvent.setup().click(effects);
    await userEvent.setup().click(music);
    expect(window.localStorage.getItem("e4s:effects")).toBe("off");
    expect(window.localStorage.getItem("e4s:music")).toBe("off");
  });

  it.each([
    ["PROVIDER_NOT_CONFIGURED", "Chưa lưu API key"],
    ["PROVIDER_ENDPOINT_INVALID", "Base URL không hợp lệ"],
    ["PROVIDER_NETWORK_ERROR", "Không kết nối được nhà cung cấp"],
    ["PROVIDER_TIMEOUT", "Nhà cung cấp phản hồi quá thời gian"],
    ["PROVIDER_HTTP_401", "Nhà cung cấp từ chối yêu cầu (HTTP 401)"]
  ])("explains the safe AI diagnostic %s", (code, message) => {
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: code !== "PROVIDER_NOT_CONFIGURED", baseUrl: "https://api.groq.com/openai/v1", model: "demo", speechToTextModel: "whisper", lastTest: { status: code === "PROVIDER_TIMEOUT" ? "timeout" : "error", testedAt: "2026-10-19T10:00:00.000Z", code } }} actions={actions()} />);
    expect(screen.getByText(message, { exact: false })).toBeInTheDocument();
  });

  it("shows the latest webhook diagnostic with an action to take", async () => {
    const callbacks = actions();
    callbacks.onTestWebhook = vi.fn().mockResolvedValue({ status: "error", statusCode: null, code: "WEBHOOK_TEMPLATE_INVALID", testedAt: "2026-10-19T10:00:00.000Z" });
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} actions={callbacks} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Gửi tin thử" }));
    expect(await screen.findByText("Mẫu payload chưa phải JSON hợp lệ.")).toBeInTheDocument();
  });
});

function actions() {
  return {
    onSaveAi: vi.fn(), onTestAi: vi.fn(), onSaveManager: vi.fn(), onSaveProduct: vi.fn(), onTestImage: vi.fn(), onClearImageCache: vi.fn(), onTestMusic: vi.fn(), onResetMusic: vi.fn(), onTestWebhook: vi.fn(),
    onExportJson: vi.fn(), onImportJson: vi.fn(), onExportCsv: vi.fn(), onSeedData: vi.fn(), onWipeData: vi.fn()
  };
}
