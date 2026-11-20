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

    await operatorApiClient.getContentReview();
    await operatorApiClient.getContentPrompts();
    await operatorApiClient.saveContentPrompts([]);

    expect(calls.map(({ url, init }) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/v1/content/review", "GET"],
      ["/api/v1/content/prompts", "GET"],
      ["/api/v1/content/prompts", "PUT"]
    ]);
  });
});
