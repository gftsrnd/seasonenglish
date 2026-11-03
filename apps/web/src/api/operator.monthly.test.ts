// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "./runtime.js";
import { operatorApiClient } from "./operator.js";

vi.mock("./runtime.js", () => ({ request: vi.fn(), uploadMultipart: vi.fn() }));

const requestMock = vi.mocked(request);

describe("operator monthly lesson adapter", () => {
  beforeEach(() => requestMock.mockReset());

  it("sends Friday review generation to its dedicated monthly endpoint", async () => {
    requestMock.mockResolvedValueOnce({ lesson: { title: "Ôn tập", parts: [] }, report: { severe: [], light: [], contractVersion: 1 } });

    await operatorApiClient.generateContentMonthReview("framework-1", 5);

    expect(requestMock).toHaveBeenCalledWith("/api/v1/content/month-frameworks/framework-1/reviews/5/generate", { method: "POST", body: "{}" });
  });
});
