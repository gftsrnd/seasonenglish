// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "./runtime.js";
import { operatorApiClient } from "./operator.js";

vi.mock("./runtime.js", () => ({
  request: vi.fn(),
  uploadMultipart: vi.fn()
}));

const requestMock = vi.mocked(request);

describe("operator assessment audio adapter", () => {
  beforeEach(() => requestMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("uses the two-step confirmation/delete contract with the file id in the path", async () => {
    requestMock
      .mockResolvedValueOnce({ confirmationToken: "token-123456789012345678901234567890", expiresAt: "2026-10-28T10:00:00.000Z" })
      .mockResolvedValueOnce({ fileId: "file-1", artifactKey: "assessment-audio/a.webm", deleted: true });

    const confirmation = await operatorApiClient.confirmAssessmentAudioDeletion!("file-1");
    await operatorApiClient.deleteAssessmentAudio!("file-1", confirmation.confirmationToken);

    expect(requestMock).toHaveBeenNthCalledWith(1, "/api/v1/files/assessment-audio/file-1/delete-confirmation", { method: "POST", body: "{}" });
    expect(requestMock).toHaveBeenNthCalledWith(2, "/api/v1/files/assessment-audio/file-1", { method: "DELETE", body: JSON.stringify({ confirmationToken: confirmation.confirmationToken }) });
  });

  it("preserves list/read adapters for signed playback metadata", async () => {
    requestMock.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ fileId: "file-1", artifactKey: "assessment-audio/a.webm", signedUrl: "/signed/a.webm" });
    await operatorApiClient.listAssessmentAudio!({ sourceFlow: "weekly_practice" });
    await operatorApiClient.getAssessmentAudioReadUrl!("assessment-audio/a.webm");
    expect(requestMock).toHaveBeenNthCalledWith(1, "/api/v1/files/assessment-audio?sourceFlow=weekly_practice");
    expect(requestMock).toHaveBeenNthCalledWith(2, "/api/v1/files/assessment-audio/read?artifactKey=assessment-audio%2Fa.webm");
  });
});
