// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagerSettingsView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { SettingsPage } from "./index.js";

afterEach(cleanup);

const manager: ManagerSettingsView = {
  organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true,
  pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
  testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
  levelUp: { days: 14, lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4 },
  backgroundMusic: { enabled: true, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
};
const product: ProductPreferencesView = { theme: "auto", vocabImageSource: "wikimedia" };
const capabilities: SystemCapabilitiesView = { api: true, database: true, ai: true, objectStorage: true };

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
      "Kết nối AI", "Lịch pilot", "Ảnh minh hoạ từ vựng", "Bài test đầu vào / cuối kỳ", "Ngưỡng xét lên / hạ mức", "Giao diện theo mùa / lễ", "Nhạc nền của Season", "Nhắc học qua Base.vn (Base Message incoming webhook)", "Chính sách nhắc học và báo cáo", "Dữ liệu", "Người dùng"
    ]);
    expect(screen.getByText(/Khoá nhà cung cấp được lưu an toàn ở server/)).toBeInTheDocument();
    expect(screen.getByText("Xuất JSON")).toBeInTheDocument();
  });

  it("keeps Settings guidance concise without dropping constraints", () => {
    render(<SettingsPage role="manager" manager={manager} product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);

    expect(screen.getByText(/Mỗi phần tính giờ riêng; hết giờ tự nộp/)).toBeInTheDocument();
    expect(screen.getByText(/Đổi màu và icon; không đổi bố cục, nội dung, dữ liệu/)).toBeInTheDocument();
    expect(screen.getByText(/Ảnh miễn phí theo từ tiếng Anh, không dùng AI/)).toBeInTheDocument();
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
    render(<SettingsPage role="operator" product={product} capabilities={capabilities} ai={{ provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" }} actions={actions()} />);
    expect(screen.queryByRole("heading", { name: "Lịch pilot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dữ liệu" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở trình sửa prompt" })).toHaveAttribute("href", "/op/prompts");
    expect(screen.getByText(/Chỉ xem cấu hình do Quản lý áp dụng; chỉ Quản lý lưu thay đổi tổ chức, AI và dữ liệu hệ thống/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Nguồn ảnh")).toBeDisabled();
    expect(screen.getByLabelText("Chủ đề giao diện (áp dụng ngay khi chọn)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Lưu nguồn ảnh" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu giao diện" })).not.toBeInTheDocument();
  });

  it("explains that AI configuration is Manager-owned when Operator has no provider view", () => {
    render(<SettingsPage role="operator" product={product} capabilities={capabilities} actions={actions()} />);
    expect(screen.getByText(/Chỉ xem trạng thái kết nối AI/i)).toBeInTheDocument();
    expect(screen.getByText(/do Quản lý quản trị/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu kết nối AI" })).not.toBeInTheDocument();
  });
});

function actions() {
  return {
    onSaveAi: vi.fn(), onTestAi: vi.fn(), onSaveManager: vi.fn(), onSaveProduct: vi.fn(), onTestImage: vi.fn(), onClearImageCache: vi.fn(), onTestMusic: vi.fn(), onResetMusic: vi.fn(), onTestWebhook: vi.fn(),
    onExportJson: vi.fn(), onImportJson: vi.fn(), onExportCsv: vi.fn(), onSeedData: vi.fn(), onWipeData: vi.fn()
  };
}
