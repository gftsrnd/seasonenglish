import { describe, expect, it } from "vitest";
import { ApiError, apiUrl } from "./runtime.js";

describe("ApiError presentation", () => {
  it("keeps the network code for logic while exposing a friendly message to UI fallbacks", () => {
    const error = new ApiError("NETWORK_UNAVAILABLE", "network");
    expect(error.code).toBe("NETWORK_UNAVAILABLE");
    expect(error.message).toBe("Không thể kết nối tới E4S. Kiểm tra mạng rồi thử lại.");
  });
});

describe("apiUrl", () => {
  it("prefixes relative API paths for a separately hosted API", () => {
    expect(apiUrl("/api/health", "https://e4s-api.onrender.com/")).toBe("https://e4s-api.onrender.com/api/health");
  });

  it("keeps relative paths for the local same-origin proxy", () => {
    expect(apiUrl("/api/health", "")).toBe("/api/health");
  });
});
