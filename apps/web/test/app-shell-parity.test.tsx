// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
// @ts-expect-error Vitest executes this test in Node; the web project intentionally omits Node ambient types.
import { readFileSync } from "node:fs";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import gftLogoUrl from "../public/gft-logo.png?url";

declare const process: { cwd(): string };

const api = vi.hoisted(() => ({
  currentSession: vi.fn(),
  getProfile: vi.fn().mockResolvedValue({
    profile: { avatar: { color: "olive", acc: "leaf", bg: 0 } }
  }),
  getProductPreferences: vi.fn().mockResolvedValue({ theme: "summer", vocabImageSource: "wikimedia" }),
  getHome: vi.fn().mockReturnValue(new Promise(() => undefined)),
  logout: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../src/api-client.js", () => ({ apiClient: api }));

import { App } from "../src/App.js";

const learnerSession = {
  user: { id: "learner-shell", displayName: "Nguyễn Minh Anh", email: "minh.anh@example.test" },
  role: "learner" as const,
  permissions: ["learning:own"]
};

let styleElement: HTMLStyleElement;

beforeAll(() => {
  const cwd = process.cwd().replaceAll("\\", "/");
  const stylesheetPath = cwd.endsWith("/apps/web") ? "src/styles.css" : "apps/web/src/styles.css";
  styleElement = document.createElement("style");
  styleElement.textContent = readFileSync(stylesheetPath, "utf8");
  document.head.append(styleElement);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/home");
});

afterAll(() => styleElement.remove());

describe("binding app shell", () => {
  it("keeps the learner navigation labels in app order", async () => {
    api.currentSession.mockResolvedValue(learnerSession);
    render(<App />);

    const navigation = await screen.findByRole("navigation", { name: "Điều hướng người học" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Trang chủ",
      "Luyện với Season",
      "Bài tuần",
      "Mini game",
      "Tiến độ & hồ sơ"
    ]);
  });

  it("uses the final desktop sidebar, card and control radii from the app cascade", async () => {
    api.currentSession.mockResolvedValue(learnerSession);
    const { container } = render(<App />);
    await screen.findByRole("navigation", { name: "Điều hướng người học" });

    const card = document.createElement("article");
    card.className = "primary-task";
    const control = document.createElement("button");
    card.append(control);
    container.append(card);

    expect(getComputedStyle(container.querySelector(".app-shell")!).gridTemplateColumns).toBe("232px minmax(0, 1fr)");
    expect(getComputedStyle(document.documentElement).getPropertyValue("--radius").trim()).toBe("14px");
    expect(getComputedStyle(card).borderRadius).toBe("var(--radius)");
    expect(getComputedStyle(control).borderRadius).toBe("10px");
  });

  it("renders the required original shell artwork without redrawn substitutes", async () => {
    api.currentSession.mockResolvedValue(learnerSession);
    render(<App />);

    const effects = await screen.findByRole("button", { name: "Hiệu ứng âm thanh: bật" });
    const music = screen.getByRole("button", { name: /Nhạc nền:/ });
    await waitFor(() => expect(screen.queryByText("✣")).not.toBeInTheDocument());

    expect(effects.querySelector("path")?.getAttribute("d")).toBe("M4.5 9.5h3l4.5-4v13l-4.5-4h-3z");
    expect(music.querySelector("path")?.getAttribute("d")).toBe("M9 18V6l10-2v12");
    expect(screen.getByTestId("season-mark")).toHaveAttribute("viewBox", "0 0 32 32");

    expect(gftLogoUrl).toMatch(/gft-logo\.png$/);
  });
});
