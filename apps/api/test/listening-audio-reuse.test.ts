import { describe, expect, it, vi } from "vitest";
import {
  blueprintListeningAudioIndex, lessonListeningAudioIndex, listeningScriptHash, previousMonthlyLessonAudioIndex,
  withBlueprintListeningAudio, withLessonListeningAudio, type ListeningAudioService
} from "../src/modules/assessment/listening-audio.js";

const OWNER = "00000000-0000-4000-8000-0000000000aa";

function service() {
  let count = 0;
  const synthesizeAndStore = vi.fn(async () => ({ url: `/new-${++count}.mp3`, artifactKey: `k${count}` }));
  return { service: { synthesizeAndStore } satisfies ListeningAudioService, synthesizeAndStore };
}
const group = (text: string, audioSrc?: string) => ({ key: text.slice(0, 3), stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text }], ...(audioSrc ? { audioSrc } : {}) } });

describe("listening audio reuse by script hash (regeneration)", () => {
  it("keeps the earlier audioSrc for an unchanged script and synthesises only the changed one", async () => {
    const earlier = { sections: [{ code: "listening", groups: [group("Same script for part one.", "/old-1.mp3"), group("Old script for part two.", "/old-2.mp3")] }] };
    const regenerated = { sections: [{ code: "listening", groups: [group("Same script for part one."), group("A new script for part two.")] }, { code: "reading", groups: [] }] };
    const { service: tts, synthesizeAndStore } = service();
    const result = await withBlueprintListeningAudio(regenerated, tts, OWNER, { previous: blueprintListeningAudioIndex(earlier) });
    const stimuli = result.blueprint.sections[0]!.groups.map((item) => item.stimulus as { audioSrc?: string; audioSynthesis?: { status: string; scriptHash: string } });
    expect(stimuli[0]!.audioSrc).toBe("/old-1.mp3");
    expect(stimuli[0]!.audioSynthesis).toMatchObject({ status: "generated", scriptHash: listeningScriptHash([{ speaker: "Narrator", text: "Same script for part one." }]) });
    expect(stimuli[1]!.audioSrc).toBe("/new-1.mp3");
    expect(synthesizeAndStore).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
  });

  it("reuses lesson listening and review-item audio from the day's current draft", async () => {
    const earlier = { parts: [{ code: "listening", content: { script: "Please call the client.", audioUrl: "/old-lesson.mp3", items: [{ audioText: "invoice", audioUrl: "/old-item.mp3", variants: [{ audioText: "receipt", audioUrl: "/old-variant.mp3" }] }] } }] };
    const index = lessonListeningAudioIndex(earlier);
    expect(index.size).toBe(3);
    const { service: tts, synthesizeAndStore } = service();
    const lesson = await withLessonListeningAudio({ parts: [{ code: "listening", content: { script: "Please call the client." } }] }, tts, OWNER, { previous: index });
    expect(lesson.lesson.parts[0]!.content).toMatchObject({ audioUrl: "/old-lesson.mp3", audioSynthesis: { status: "generated" } });
    expect(lesson.reused).toBe(1);
    const review = await withLessonListeningAudio({ parts: [{ code: "listening", content: { items: [{ audioText: "invoice", variants: [{ audioText: "receipt" }, { audioText: "budget" }] }] } }] }, tts, OWNER, { previous: index });
    const item = (review.lesson.parts[0]!.content.items as Array<Record<string, unknown>>)[0]!;
    expect(item.audioUrl).toBe("/old-item.mp3");
    expect((item.variants as Array<{ audioUrl?: string }>).map((variant) => variant.audioUrl)).toEqual(["/old-variant.mp3", "/new-1.mp3"]);
    expect(synthesizeAndStore).toHaveBeenCalledTimes(1);
  });

  it("loads the previous day content for the framework/day and is empty on a first generation", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ content: { parts: [{ code: "listening", content: { script: "Hello team.", audioUrl: "/day.mp3" } }] } }] })
      .mockResolvedValueOnce({ rows: [] });
    const db = { query } as unknown as Parameters<typeof previousMonthlyLessonAudioIndex>[0];
    expect([...(await previousMonthlyLessonAudioIndex(db, "fw-1", 3)).values()]).toEqual(["/day.mp3"]);
    expect(query.mock.calls[0]![1]).toEqual(["fw-1", 3]);
    expect((await previousMonthlyLessonAudioIndex(db, "fw-1", 4)).size).toBe(0);
  });
});
