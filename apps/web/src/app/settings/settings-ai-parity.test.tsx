// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  currentSession: vi.fn(), logout: vi.fn(), getProductPreferences: vi.fn(), getSystemCapabilities: vi.fn(),
  getOrganisationExperience: vi.fn(), saveOrganisationExperience: vi.fn(),
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
  client.getOrganisationExperience.mockResolvedValue({ theme: "auto", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } });
  client.saveOrganisationExperience.mockImplementation(async (input) => input);
  client.saveProductPreferences.mockResolvedValue({ theme: "auto", vocabImageSource: "wikimedia" });
  client.getSystemCapabilities.mockResolvedValue({ api: true, database: true, ai: true, objectStorage: false });
  client.getManagerSettings.mockResolvedValue({
    organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true,
    pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15,
    courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
    testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
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
  it("applies a selected product theme before saving it", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Giao diện theo mùa / lễ" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Mùa đông" }));

    expect(document.documentElement.dataset.theme).toBe("winter");
    expect(document.documentElement.dataset.themePattern).toBe("winter");
    expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-winter.png");
  });

  it("applies the saved seasonal theme to the live app shell", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Giao diện theo mùa / lễ" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Mùa đông" }));
    await user.click(screen.getByRole("button", { name: "Lưu giao diện" }));

    expect(client.saveOrganisationExperience).toHaveBeenCalledWith({ theme: "winter", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } });
    expect(document.documentElement.dataset.theme).toBe("winter");
  });

  it("honors the Manager-wide BGM policy in the app shell", async () => {
    client.getOrganisationExperience.mockResolvedValue({ theme: "auto", backgroundMusic: { enabled: false, playlistId: "auto", customUrl: "", volume: 22 } });
    client.getManagerSettings.mockResolvedValue({
      organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true,
      pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15,
      courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
      testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
      backgroundMusic: { enabled: false, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
    });
    window.history.pushState({}, "", "/settings");
    render(<App>{() => <div>settings test</div>}</App>);

    expect(await screen.findByText("settings test")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Nhạc nền: tắt" })).toBeDisabled();
  });

  it("wires Manager music actions without global Base controls and hides technical cards", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);
    expect(await screen.findByRole("button", { name: "Lưu nhạc nền" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lưu nhạc nền" }));
    expect(screen.queryByRole("button", { name: "Gửi tin thử" })).not.toBeInTheDocument();
    for (const name of ["Lưu kết nối AI", "Xoá cache ảnh", "Xuất JSON", "Nhập JSON"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nguồn ảnh")).not.toBeInTheDocument();

    expect(client.saveOrganisationExperience).toHaveBeenCalledWith({ theme: "auto", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } });
    expect(client.testManagerWebhook).not.toHaveBeenCalled();
    expect(client.exportManagerData).not.toHaveBeenCalled();
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
