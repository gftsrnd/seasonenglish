import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelAllExclusiveAudio, cancelExclusiveAudio, claimExclusiveAudio } from "./audio-precedence.js";

afterEach(() => {
  cancelExclusiveAudio("speech");
  cancelExclusiveAudio("media");
  cancelExclusiveAudio("microphone");
  cancelExclusiveAudio("music");
});

describe("exclusive audio precedence", () => {
  it("stops the first recording when another recording starts playing", () => {
    const stopFirst = vi.fn();
    const stopSecond = vi.fn();
    claimExclusiveAudio("media", stopFirst);
    claimExclusiveAudio("media", stopSecond);

    expect(stopFirst).toHaveBeenCalledOnce();
    expect(stopSecond).not.toHaveBeenCalled();
  });

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

  it("stops whichever foreground audio owns the channel when the authenticated session exits", () => {
    const stop = vi.fn();
    claimExclusiveAudio("speech", stop);

    cancelAllExclusiveAudio();

    expect(stop).toHaveBeenCalledOnce();
  });
});
