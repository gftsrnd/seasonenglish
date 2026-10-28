import { describe, expect, it } from "vitest";
import { audioCleanupEligible, normalizeAudioEvidence } from "./audio-evidence.js";

describe("audio evidence adapter", () => {
  it("normalizes current artifact-key/read-url data without losing transcript", () => {
    expect(normalizeAudioEvidence({
      artifactKey: "assessment-audio/a1.webm",
      signedUrl: "https://audio.example/a1.webm",
      expiresAt: "2026-11-01T00:00:00.000Z",
      transcript: "I can help with that."
    })).toEqual(expect.objectContaining({
      artifactKey: "assessment-audio/a1.webm",
      signedUrl: "https://audio.example/a1.webm",
      transcript: "I can help with that."
    }));
  });

  it("accepts future nested playback metadata and deletion metadata", () => {
    expect(normalizeAudioEvidence({
      transcript: "Saved transcript",
      audioArtifact: {
        key: "audio/coach-1.webm",
        playbackUrl: "https://audio.example/coach-1.webm",
        uploadedAt: "2026-08-01T00:00:00.000Z",
        deletion: { deletedAt: "2026-10-01T00:00:00.000Z", deletedBy: "operator-1" }
      }
    })).toEqual(expect.objectContaining({
      artifactKey: "audio/coach-1.webm",
      signedUrl: "https://audio.example/coach-1.webm",
      createdAt: "2026-08-01T00:00:00.000Z",
      transcript: "Saved transcript",
      deletion: { deletedAt: "2026-10-01T00:00:00.000Z", deletedBy: "operator-1" }
    }));
  });

  it("keeps Agent 1 lifecycle metadata and honors an explicit cleanup decision", () => {
    const normalized = normalizeAudioEvidence({
      fileId: "file-1",
      artifactKey: "assessment-audio/learner-1/answer.webm",
      signedUrl: "/signed/answer.webm",
      createdAt: "2026-08-01T00:00:00.000Z",
      retentionUntil: "2026-09-30T00:00:00.000Z",
      cleanupEligible: true,
      deletedAt: null,
      deletedBy: null,
      transcript: "Persisted answer"
    });
    expect(normalized).toEqual(expect.objectContaining({ fileId: "file-1", retentionUntil: "2026-09-30T00:00:00.000Z", cleanupEligible: true, deletedAt: null, deletedBy: null }));
    expect(audioCleanupEligible(normalized!, new Date("2026-10-28T00:00:00.000Z"))).toBe(true);
    expect(audioCleanupEligible({ ...normalized!, cleanupEligible: false }, new Date("2026-10-28T00:00:00.000Z"))).toBe(false);
  });

  it("marks audio eligible at 60 days and never marks deleted audio eligible", () => {
    const now = new Date("2026-10-28T00:00:00.000Z");
    expect(audioCleanupEligible({ createdAt: "2026-08-29T00:00:00.000Z" }, now)).toBe(true);
    expect(audioCleanupEligible({ createdAt: "2026-08-29T00:00:01.000Z" }, now)).toBe(false);
    expect(audioCleanupEligible({ createdAt: "2026-07-01T00:00:00.000Z", deletion: { deletedAt: "2026-09-01T00:00:00.000Z" } }, now)).toBe(false);
  });
});
