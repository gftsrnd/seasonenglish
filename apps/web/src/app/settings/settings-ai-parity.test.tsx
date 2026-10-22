// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  currentSession: vi.fn(), logout: vi.fn(), getProductPreferences: vi.fn(), getSystemCapabilities: vi.fn(),
  saveProductPreferences: vi.fn(),
  saveSessionAvatar: vi.fn(),
  getManagerSettings: vi.fn(), getManagerAccounts: vi.fn(), getManagerProviderSettings: vi.fn(),
  saveManagerProviderSettings: vi.fn(), testManagerProviderSettings: vi.fn(),
  testManagerImage: vi.fn(), clearManagerImageCache: vi.fn(), testManagerMusic: vi.fn(), resetManagerMusic: vi.fn(),
  testManagerWebhook: vi.fn(), exportManagerData: vi.fn(), importManagerData: vi.fn()
}));

vi.mock("../../api/shared.js", () => ({ sharedApiClient: client }));
vi.mock("../../api/manager.js", () => ({ managerApiClient: client }));

import { App } from "../App.js";

afterEach(cleanup);

beforeEach(() => {
  client.currentSession.mockResolvedValue({
    user: { id: "manager-1", displayName: "Quản lý Demo", email: "manager@e4s.local" },
    role: "manager", permissions: ["settings:manage"]
  });
  client.logout.mockResolvedValue(undefined);
  client.saveSessionAvatar.mockResolvedValue({
    user: { id: "manager-1", displayName: "Quản lý Demo", email: "manager@e4s.local", avatar: { acc: "leaf", color: "olive", bg: 2 } },
    role: "manager", permissions: ["settings:manage"]
  });
  client.getProductPreferences.mockResolvedValue({ theme: "auto", vocabImageSource: "wikimedia" });
  client.saveProductPreferences.mockResolvedValue({ theme: "auto", vocabImageSource: "wikimedia" });
  client.getSystemCapabilities.mockResolvedValue({ api: true, database: true, ai: true, objectStorage: false });
  client.getManagerSettings.mockResolvedValue({
    organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true,
    pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15,
    courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
    testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
    levelUp: { days: 14, lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4 },
    backgroundMusic: { enabled: true, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
  });
  client.getManagerAccounts.mockResolvedValue({ organizationName: "GFT Demo", accounts: [] });
  client.getManagerProviderSettings.mockResolvedValue({
    provider: "openai", configured: true, baseUrl: "https://api.example.test/v1", model: "example-model",
    speechToTextModel: "example-transcribe", capabilities: { chat: true, structuredOutput: true, speechToText: true },
    lastTest: { status: "success", testedAt: "2026-10-15T09:00:00.000Z", code: null }
  });
  client.saveManagerProviderSettings.mockResolvedValue({
    provider: "openai", configured: true, baseUrl: "https://api.example.test/v1", model: "example-model",
    speechToTextModel: "example-transcribe", capabilities: { chat: true, structuredOutput: true, speechToText: true },
    lastTest: { status: "success", testedAt: "2026-10-15T09:00:00.000Z", code: null }
  });
  client.testManagerProviderSettings.mockResolvedValue({ status: "success", testedAt: "2026-10-15T09:00:00.000Z", code: null });
  client.testManagerImage.mockResolvedValue({ status: "available", source: "wikimedia", imageUrl: "https://images.example/notebook.jpg", testedAt: "2026-10-15T09:00:00.000Z" });
  client.clearManagerImageCache.mockResolvedValue({ cleared: 1 });
  client.testManagerMusic.mockResolvedValue({ status: "valid", checkedAt: "2026-10-15T09:00:00.000Z" });
  client.resetManagerMusic.mockResolvedValue({ enabled: true, url: "", volume: 22 });
  client.testManagerWebhook.mockResolvedValue({ status: "success", statusCode: 204, code: null, testedAt: "2026-10-15T09:00:00.000Z" });
  client.exportManagerData.mockResolvedValue({ version: 1, exportedAt: "2026-10-15T09:00:00.000Z", organization: { id: "org-1", name: "GFT Demo" }, settings: {}, accounts: [], progress: null });
  client.importManagerData.mockResolvedValue({ imported: true });
});

describe("Manager AI provider settings", () => {
  it("loads the safe provider view and sends only an intentional replacement key", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Kết nối AI" })).toBeInTheDocument();
    expect(client.getManagerProviderSettings).toHaveBeenCalledOnce();
    expect(screen.getByLabelText(/API key mới/)).toHaveAttribute("type", "password");

    await user.type(screen.getByLabelText(/API key mới/), "replacement-secret");
    await user.click(screen.getByRole("button", { name: "Lưu kết nối AI" }));
    expect(client.saveManagerProviderSettings).toHaveBeenCalledWith(expect.objectContaining({ credential: "replacement-secret" }));
  });

  it("loads the real provider defaults when switching Claude, Gemini, and OpenAI-compatible", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Kết nối AI" })).toBeInTheDocument();
    const provider = screen.getByLabelText("Nhà cung cấp");
    const model = screen.getByLabelText("Tên model");

    await user.selectOptions(provider, "claude");
    expect(model).toHaveValue("claude-haiku-5-5");
    expect(screen.queryByLabelText("Model chép lời file ghi âm")).not.toBeInTheDocument();

    await user.selectOptions(provider, "gemini");
    expect(model).toHaveValue("gemini-1.5-flash");
    expect(screen.queryByLabelText("Model chép lời file ghi âm")).not.toBeInTheDocument();

    await user.selectOptions(provider, "openai");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://api.groq.com/openai/v1");
    expect(model).toHaveValue("qwen/qwen3.8-27b");
    expect(screen.getByLabelText("Model chép lời file ghi âm")).toHaveValue("whisper-large-v3-turbo");

    await user.selectOptions(screen.getByLabelText("Preset OpenAI-compatible"), "openrouter");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://openrouter.ai/api/v1");
    await user.selectOptions(screen.getByLabelText("Preset OpenAI-compatible"), "custom");
    expect(screen.getByLabelText("Base URL")).toHaveValue("");
  });

  it("applies a selected product theme before saving it", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Giao diện theo mùa / lễ" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Chủ đề giao diện (áp dụng ngay khi chọn)"), "winter");

    expect(document.documentElement.dataset.theme).toBe("winter");
  });

  it("applies the saved seasonal theme to the live app shell", async () => {
    const user = userEvent.setup();
    client.saveProductPreferences.mockResolvedValue({ theme: "winter", vocabImageSource: "wikimedia" });
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Giao diện theo mùa / lễ" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Chủ đề giao diện (áp dụng ngay khi chọn)"), "winter");
    await user.click(screen.getByRole("button", { name: "Lưu giao diện" }));

    expect(client.saveProductPreferences).toHaveBeenCalledWith({ theme: "winter", vocabImageSource: "wikimedia" });
    expect(document.documentElement.dataset.theme).toBe("winter");
  });

  it("honors the Manager-wide BGM policy in the app shell", async () => {
    client.getManagerSettings.mockResolvedValue({
      organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true,
      pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15,
      courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
      testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
      levelUp: { days: 14, lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4 },
      backgroundMusic: { enabled: false, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
    });
    window.history.pushState({}, "", "/settings");
    render(<App>{() => <div>settings test</div>}</App>);

    expect(await screen.findByText("settings test")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Nhạc nền: tắt" })).toBeDisabled();
  });

  it("wires Manager media, music, webhook and export actions to the server", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);
    expect(await screen.findByRole("button", { name: /Thử ảnh/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Thử ảnh/ }));
    await user.click(screen.getByRole("button", { name: "Xoá cache ảnh" }));
    await user.click(screen.getByRole("button", { name: "Lưu & nghe thử" }));
    await user.click(screen.getByRole("button", { name: "Về nhạc mặc định" }));
    await user.click(screen.getByRole("button", { name: "Gửi tin thử" }));
    await user.click(screen.getByRole("button", { name: "Xuất JSON" }));

    expect(client.testManagerImage).toHaveBeenCalledWith({ source: "wikimedia" });
    expect(client.clearManagerImageCache).toHaveBeenCalledOnce();
    expect(client.testManagerMusic).toHaveBeenCalledWith({ enabled: true, url: "", volume: 22 });
    expect(client.resetManagerMusic).toHaveBeenCalledOnce();
    expect(client.testManagerWebhook).toHaveBeenCalledWith({ url: "", template: "{\"base_content\":\"{message}\"}" });
    expect(client.exportManagerData).toHaveBeenCalledOnce();
  });

  it("offers only automatic open media or disabled and normalizes legacy sources", async () => {
    client.getProductPreferences.mockResolvedValue({ theme: "auto", vocabImageSource: "pexels" });
    window.history.pushState({}, "", "/settings");
    render(<App />);

    const source = await screen.findByLabelText("Nguồn ảnh");
    expect(source).toHaveValue("wikimedia");
    expect(screen.getAllByRole("option", { name: /nguồn mở|Tắt ảnh/ })).toHaveLength(2);
    expect(screen.queryByRole("option", { name: /Pexels|Pixabay|Openverse/ })).not.toBeInTheDocument();
  });

  it("keeps the app header avatar actionable for Manager", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);
    await screen.findByRole("heading", { name: "Cài đặt" });

    await user.click(screen.getByRole("button", { name: "Đổi avatar" }));
    expect(screen.getByRole("dialog", { name: "Avatar của bạn" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Màu nền 3" }));
    await user.click(screen.getByRole("button", { name: "Lưu avatar" }));

    expect(client.saveSessionAvatar).toHaveBeenCalledWith(expect.objectContaining({ bg: 2 }));
  });
});
