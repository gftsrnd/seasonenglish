// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  currentSession: vi.fn(),
  getProductPreferences: vi.fn(),
  getProfile: vi.fn()
}));

vi.mock("../../api/shared.js", () => ({ sharedApiClient: client }));

import { App } from "../App.js";

afterEach(cleanup);

describe("App entry bootstrap", () => {
  it("does not request authenticated product preferences while showing the entry screen", async () => {
    window.history.replaceState({}, "", "/");
    client.currentSession.mockResolvedValue(null);
    client.getProductPreferences.mockResolvedValue({ theme: "summer", vocabImageSource: "wikimedia" });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Đăng nhập người học" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dùng thử" })).not.toBeInTheDocument();
    expect(client.getProductPreferences).not.toHaveBeenCalled();
  });
});
