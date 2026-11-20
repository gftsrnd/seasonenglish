import { describe, expect, it, vi } from "vitest";
import { ApiError, apiUrl, request } from "./runtime.js";

describe("ApiError presentation", () => {
  it("keeps the network code for logic while exposing a friendly message to UI fallbacks", () => {
    const error = new ApiError("NETWORK_UNAVAILABLE", "network");
    expect(error.code).toBe("NETWORK_UNAVAILABLE");
    expect(error.message).toBe("Không thể kết nối tới E4S. Kiểm tra mạng rồi thử lại.");
  });
});

describe("apiUrl", () => {
  it("prefixes relative API paths for a separately hosted API", () => {
    expect(apiUrl("/api/health", "https://api.example.com/")).toBe("https://api.example.com/api/health");
  });

  it("keeps relative paths for the local same-origin proxy", () => {
    expect(apiUrl("/api/health", "")).toBe("/api/health");
  });
});

it("sends a bodyless DELETE without a JSON content type", async () => {
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"deleted":true}'));
  try {
    await expect(request("/api/v1/assessment-level-forms/qa-draft", { method: "DELETE" })).resolves.toEqual({ deleted: true });
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).has("content-type")).toBe(false);
  } finally {
    send.mockRestore();
  }
});
