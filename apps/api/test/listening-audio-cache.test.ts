import { describe, expect, it } from "vitest";
import { blueprintListeningAudioIndex } from "../src/modules/assessment/listening-audio.js";
describe("dialogue audio cache provenance", () => {
  it("does not reuse an old unversioned dialogue file as newly speaker-aware audio", () => {
    const blueprint = { sections: [{ code: "listening", groups: [{ stimulus: { type: "audio_script", audioSrc: "/old-single-voice.mp3", lines: [{ speaker: "Man", text: "Good morning." }, { speaker: "Woman", text: "Hello." }] } }] }] };
    expect(blueprintListeningAudioIndex(blueprint).size).toBe(0);
  });
});
