import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelExclusiveAudio, claimExclusiveAudio } from "./audio-precedence.js";

afterEach(() => {
  cancelExclusiveAudio("speech");
  cancelExclusiveAudio("media");
  cancelExclusiveAudio("microphone");
  cancelExclusiveAudio("music");
});

describe("exclusive audio precedence", () => {
  it.each(["speech", "media", "microphone"] as const)("pauses music for %s and resumes it after release", (source) => {
    const stopMusic = vi.fn();
    const resumeMusic = vi.fn();
    const releaseMusic = claimExclusiveAudio("music", stopMusic, resumeMusic);
    const releaseForeground = claimExclusiveAudio(source, vi.fn());

    expect(releaseMusic).toBeTypeOf("function");
    expect(stopMusic).toHaveBeenCalledOnce();
    releaseForeground?.();
    expect(resumeMusic).toHaveBeenCalledOnce();
  });
});
