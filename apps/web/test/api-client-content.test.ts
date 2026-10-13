import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../src/api-client.js";

describe("content API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the content endpoints that back Thu's existing screens", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    await apiClient.getContentWeeks();
    await apiClient.saveContentWeeks([]);
    await apiClient.getContentLessonMatrix();
    await apiClient.getContentLessonSet(1, "A2");
    await apiClient.saveContentLessonDraft(1, "A2", []);
    await apiClient.submitContentLessonSet("version-1");
    await apiClient.publishContentLessonSet("version-1");
    await apiClient.retireContentLessonSet("version-1");
    await apiClient.getContentReview();
    await apiClient.getContentPrompts();
    await apiClient.saveContentPrompts([]);

    expect(calls.map(({ url, init }) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/v1/content/weeks", "GET"],
      ["/api/v1/content/weeks", "PUT"],
      ["/api/v1/content/lesson-matrix", "GET"],
      ["/api/v1/content/lesson-sets/1/A2", "GET"],
      ["/api/v1/content/lesson-sets/1/A2/draft", "PUT"],
      ["/api/v1/content/lesson-set-versions/version-1/review", "POST"],
      ["/api/v1/content/lesson-set-versions/version-1/publication", "POST"],
      ["/api/v1/content/lesson-set-versions/version-1/retirement", "POST"],
      ["/api/v1/content/review", "GET"],
      ["/api/v1/content/prompts", "GET"],
      ["/api/v1/content/prompts", "PUT"]
    ]);
  });
});
