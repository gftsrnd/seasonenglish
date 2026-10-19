import { afterEach, describe, expect, it, vi } from "vitest";
import { learnerApiClient } from "../src/api/learner.js";
import { operatorApiClient } from "../src/api/operator.js";

describe("content API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the explicit regenerate command to the micro-lesson API", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({}), { status: 201, headers: { "content-type": "application/json" } });
    }));

    await learnerApiClient.generateMicroLesson("10000000-0000-4000-8000-000000000001", true);

    expect(calls[0]?.url).toBe("/api/v1/micro-lessons");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      requestId: "10000000-0000-4000-8000-000000000001",
      regenerate: true
    });
  });

  it("acknowledges a server-owned level-up celebration", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ acknowledged: true, announcementId: "level-up:B1:now" }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    await learnerApiClient.acknowledgeRewardAnnouncement("level-up:B1:now");

    expect(calls[0]?.url).toBe("/api/v1/learner/reward-announcement/acknowledge");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ announcementId: "level-up:B1:now" });
  });

  it("uses the content endpoints that back Thu's existing screens", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    await operatorApiClient.getContentWeeks();
    await operatorApiClient.saveContentWeeks([]);
    await operatorApiClient.getContentLessonMatrix();
    await operatorApiClient.getContentLessonSet(1, "A2");
    await operatorApiClient.upsertContentLessonDay(1, "A2", 1, { dayNumber: 1, title: "T2", durationMinutes: 10, parts: [] }, 3);
    await operatorApiClient.deleteContentLessonDay(1, "A2", 1, 4);
    await operatorApiClient.saveContentLessonJson(1, "A2", [], 5);
    await operatorApiClient.enrichContentLessonDraft(1, "A2", 5);
    await operatorApiClient.fillContentLessonPhrases(1, "A2", 5);
    await operatorApiClient.deleteContentLessonDraftSet(1, "A2");
    await operatorApiClient.saveContentLessonDraft(1, "A2", []);
    await operatorApiClient.submitContentLessonSet("version-1");
    await operatorApiClient.publishContentLessonSet("version-1");
    await operatorApiClient.retireContentLessonSet("version-1");
    await operatorApiClient.getContentReview();
    await operatorApiClient.getContentPrompts();
    await operatorApiClient.saveContentPrompts([]);

    expect(calls.map(({ url, init }) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/v1/content/weeks", "GET"],
      ["/api/v1/content/weeks", "PUT"],
      ["/api/v1/content/lesson-matrix", "GET"],
      ["/api/v1/content/lesson-sets/1/A2", "GET"],
      ["/api/v1/content/lesson-sets/1/A2/draft/lessons/1", "PUT"],
      ["/api/v1/content/lesson-sets/1/A2/draft/lessons/1", "DELETE"],
      ["/api/v1/content/lesson-sets/1/A2/draft/json", "PUT"],
      ["/api/v1/content/lesson-sets/1/A2/draft/enrich", "POST"],
      ["/api/v1/content/lesson-sets/1/A2/draft/fill-phrases", "POST"],
      ["/api/v1/content/lesson-sets/1/A2/draft", "DELETE"],
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
