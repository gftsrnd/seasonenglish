import { describe, expect, it } from "vitest";
import { apiUrl } from "./runtime.js";

describe("apiUrl", () => {
  it("prefixes relative API paths for a separately hosted API", () => {
    expect(apiUrl("/api/health", "https://e4s-api.onrender.com/")).toBe("https://e4s-api.onrender.com/api/health");
  });

  it("keeps relative paths for the local same-origin proxy", () => {
    expect(apiUrl("/api/health", "")).toBe("/api/health");
  });
});
