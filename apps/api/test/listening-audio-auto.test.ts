import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import type { ObjectStorage } from "@e4s/storage";
import type { EdgeTtsRunner } from "../src/modules/assessment/edge-tts.js";
import { aiSlices } from "./support/level-form-fixture.js";

const repositories = vi.hoisted(() => ({
  assessments: { createLevelFormDraft: vi.fn() },
  aiRuns: { activeTaskPrompt: vi.fn(), recordSucceeded: vi.fn() },
  files: { createForOwner: vi.fn() }
}));
vi.mock("@e4s/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@e4s/database")>()),
  createRepositories: () => new Proxy(repositories, { get: (target, key: string) => (target as Record<string, unknown>)[key] ?? new Proxy({}, { get: () => vi.fn() }) })
}));
vi.mock("../src/modules/identity/policy.js", () => ({
  createRoleGuard: () => async (request: { e4sSession?: unknown; e4sSessionId?: string }) => {
    request.e4sSession = { user: { id: "00000000-0000-4000-8000-0000000000aa", role: "operator" } };
    request.e4sSessionId = "session-1";
  }
}));

const { registerAssessmentRoutes } = await import("../src/modules/assessment/routes.js");
const { createListeningAudioService, createContentMediaAudioStore, withBlueprintListeningAudio, withLessonListeningAudio, blueprintListeningAudioIndex } = await import("../src/modules/assessment/listening-audio.js");
const { mp3FrameJoiner } = await import("../src/modules/assessment/dialogue-tts.js");

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const LABEL = /\b(Narrator|Receptionist|Ahmed|Man|Woman)\s*:/u;

function frame(fill: number): Uint8Array {
  const bytes = new Uint8Array(144).fill(fill);
  bytes.set([0xff, 0xf3, 0x64, 0xc4]);
  return bytes;
}
function tts(failWith?: string) {
  const synthesize = vi.fn(async ({ text }: { text: string; voice: string; rate?: string }) => {
    if (failWith) throw new Error(failWith);
    return { bytes: frame(text.length % 250), mimeType: "audio/mpeg" as const, filename: "assessment-edge-tts.mp3" };
  });
  return { synthesize } satisfies EdgeTtsRunner;
}
function memoryStorage() {
  const objects = new Map<string, { body: Buffer; mimeType: string }>();
  const storage: ObjectStorage = {
    putObject: vi.fn(async ({ objectKey, body, mimeType }) => { objects.set(objectKey, { body: Buffer.from(body as Buffer), mimeType: mimeType ?? "" }); }),
    deleteObject: vi.fn(async (_bucket, key) => { objects.delete(key); }),
    ready: vi.fn(async () => undefined)
  };
  return { storage, objects };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositories.aiRuns.activeTaskPrompt.mockResolvedValue(null);
  repositories.files.createForOwner.mockImplementation(async (input: { id: string }) => ({ id: input.id }));
  repositories.assessments.createLevelFormDraft.mockImplementation(async (_actor: string, targetLevel: string) => ({ versionId: "00000000-0000-4000-8000-000000000901", targetLevel, status: "draft" }));
});

type Stimulus = { type: string; audioSrc?: string; text?: string; lines?: Array<{ speaker: string; text: string }> };
const dialogueBlueprint = (): { key: string; sections: Array<{ code: string; groups: Array<{ key: string; stimulus?: Stimulus }> }> } => ({
  key: "monthly-final", sections: [
    { code: "listening", groups: [
      { key: "LA", stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text: "Phone call about a delivery.\nReceptionist: Good afternoon, Brightway Supplies.\nAhmed: Hello, this is Ahmed." }] } },
      { key: "LB", stimulus: { type: "audio_script", audioSrc: "/api/v1/files/content-media/read?artifactKey=existing", lines: [{ speaker: "Manager", text: "Already recorded." }] } }
    ] },
    { code: "reading", groups: [{ key: "R1", stimulus: { type: "passage", text: "Man: not audio" } }] }
  ]
});

describe("automatic listening audio after AI generation", () => {
  it("synthesises the dialogue per speaker, stores one MP3 as content media and fills audioSrc without touching groups that have audio", async () => {
    const runner = tts();
    const { storage, objects } = memoryStorage();
    const pool = {} as never;
    const service = createListeningAudioService({ runner, store: createContentMediaAudioStore(pool, storage), joiner: mp3FrameJoiner });
    const result = await withBlueprintListeningAudio(dialogueBlueprint(), service, OWNER, { now: new Date("2026-11-12T00:00:00Z") });
    expect(result).toMatchObject({ generated: 1, failed: 0 });
    expect(runner.synthesize).toHaveBeenCalledTimes(3);
    expect(runner.synthesize.mock.calls.map(([input]) => input.voice)).toEqual(["en-US-AvaMultilingualNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural"]);
    for (const [input] of runner.synthesize.mock.calls) expect(input.text).not.toMatch(LABEL);
    const [listening, reading] = result.blueprint.sections;
    const generated = listening!.groups[0]!.stimulus as { audioSrc?: string; audioSynthesis?: { status: string } };
    expect(generated.audioSrc).toMatch(/^\/api\/v1\/files\/content-media\/read\?artifactKey=content-media%2F00000000-0000-4000-8000-0000000000aa%2F.+\.mp3$/u);
    expect(generated.audioSynthesis).toMatchObject({ status: "generated", engine: "edge-tts" });
    expect(listening!.groups[1]!.stimulus).toEqual(dialogueBlueprint().sections[0]!.groups[1]!.stimulus);
    expect(reading).toEqual(dialogueBlueprint().sections[1]);
    // One object with two voiced turns + narrator joined by two pauses (5 silent frames each).
    expect(objects.size).toBe(1);
    const [stored] = [...objects.values()];
    expect(stored).toMatchObject({ mimeType: "audio/mpeg" });
    expect(stored!.body.byteLength).toBe(144 * (3 + 2 * 5));
    expect(repositories.files.createForOwner).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: OWNER, purpose: "content_media", mimeType: "audio/mpeg", sizeBytes: stored!.body.byteLength }));
  });

  it("reuses previous audio for an unchanged script and synthesises a repeated script only once", async () => {
    const runner = tts();
    const { storage } = memoryStorage();
    const service = createListeningAudioService({ runner, store: createContentMediaAudioStore({} as never, storage), joiner: mp3FrameJoiner });
    const first = await withBlueprintListeningAudio(dialogueBlueprint(), service, OWNER);
    runner.synthesize.mockClear();
    const again = await withBlueprintListeningAudio(dialogueBlueprint(), service, OWNER, { previous: blueprintListeningAudioIndex(first.blueprint) });
    expect(runner.synthesize).not.toHaveBeenCalled();
    expect(again.blueprint.sections[0]!.groups[0]!.stimulus!.audioSrc).toBe(first.blueprint.sections[0]!.groups[0]!.stimulus!.audioSrc);
    const twice: { sections: Array<{ code: string; groups: Array<{ stimulus: Stimulus }> }> } = { sections: [{ code: "listening", groups: [0, 1].map(() => ({ stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text: "Same words." }] } })) }] };
    const result = await withBlueprintListeningAudio(twice, service, OWNER);
    expect(runner.synthesize).toHaveBeenCalledTimes(1);
    expect(result.blueprint.sections[0]!.groups[0]!.stimulus.audioSrc).toBe(result.blueprint.sections[0]!.groups[1]!.stimulus.audioSrc);
  });

  it("keeps the content and records the failure when Edge TTS fails or is not configured", async () => {
    const { storage, objects } = memoryStorage();
    const failing = createListeningAudioService({ runner: tts("EDGE_TTS_FAILED"), store: createContentMediaAudioStore({} as never, storage) });
    const failed = await withBlueprintListeningAudio(dialogueBlueprint(), failing, OWNER);
    expect(failed).toMatchObject({ generated: 0, failed: 1 });
    expect(failed.blueprint.sections[0]!.groups[0]!.stimulus).toMatchObject({ lines: dialogueBlueprint().sections[0]!.groups[0]!.stimulus!.lines, audioSynthesis: { status: "failed", code: "EDGE_TTS_FAILED" } });
    expect(failed.blueprint.sections[0]!.groups[0]!.stimulus!.audioSrc).toBeUndefined();
    expect(objects.size).toBe(0);
    const unavailable = await withBlueprintListeningAudio(dialogueBlueprint(), undefined, OWNER);
    expect(unavailable.blueprint.sections[0]!.groups[0]!.stimulus).toMatchObject({ audioSynthesis: { status: "failed", code: "EDGE_TTS_UNAVAILABLE" } });
  });

  it("adds audioUrl to a monthly lesson listening script and to Friday review listening items", async () => {
    const runner = tts();
    const { storage } = memoryStorage();
    const service = createListeningAudioService({ runner, store: createContentMediaAudioStore({} as never, storage), joiner: mp3FrameJoiner });
    const lesson = { title: "Bài 1", parts: [
      { code: "listening", content: { script: "Man: Is the report ready?\nWoman: Yes, I sent it this morning.", prompt: "When was the report sent?" } },
      { code: "reading", content: { passage: "Text" } }
    ] };
    const daily = await withLessonListeningAudio(lesson, service, OWNER);
    expect(daily.generated).toBe(1);
    expect(daily.lesson.parts[0]!.content).toMatchObject({ script: lesson.parts[0]!.content.script, audioUrl: expect.stringContaining("/api/v1/files/content-media/read?artifactKey="), audioSynthesis: { status: "generated" } });
    expect(runner.synthesize.mock.calls.map(([input]) => [input.voice, input.text])).toEqual([["en-GB-RyanNeural", "Is the report ready?"], ["en-GB-SoniaNeural", "Yes, I sent it this morning."]]);
    expect(daily.lesson.parts[1]).toBe(lesson.parts[1]);
    runner.synthesize.mockClear();
    const review = { parts: [{ code: "listening", content: { items: [
      { id: "l1", audioText: "deadline", prompt: "Nghe và chọn nghĩa đúng", variants: [{ id: "l1a", audioText: "deadline", prompt: "Nghe" }] },
      { id: "l2", audioText: "invoice", prompt: "Nghe và chọn nghĩa đúng", audioUrl: "/existing.mp3" }
    ] } }] };
    const weekly = await withLessonListeningAudio(review, service, OWNER);
    const items = weekly.lesson.parts[0]!.content.items as Array<Record<string, unknown>>;
    expect(runner.synthesize).toHaveBeenCalledExactlyOnceWith({ text: "deadline", voice: "en-US-AvaMultilingualNeural" });
    expect(items[0]!.audioUrl).toEqual((items[0]!.variants as Array<Record<string, unknown>>)[0]!.audioUrl);
    expect(items[1]!.audioUrl).toBe("/existing.mp3");
  });
});

describe("assessment routes with Edge TTS", () => {
  function levelRunner(): AiTaskRunner {
    const slices = aiSlices();
    return { runTask: vi.fn(async (taskId: string) => ({ output: taskId === "level_form_listening_generation" ? slices.listening : taskId === "level_form_reading_generation" ? slices.reading : slices.production, metadata: {} })) } as unknown as AiTaskRunner;
  }
  async function server(runner: EdgeTtsRunner | undefined, storage?: ObjectStorage) {
    const instance = Fastify();
    registerAssessmentRoutes(instance, {} as never, levelRunner(), undefined, runner, storage);
    await instance.ready();
    return instance;
  }

  it("the editor button reads a dialogue with two voices and never speaks the labels", async () => {
    const runner = tts();
    const app = await server(runner);
    const response = await app.inject({ method: "POST", url: "/api/v1/assessment-audio/edge-tts", payload: { text: "Narrator: Phone call about a delivery.\nReceptionist: Good afternoon.\nAhmed: Hello, this is Ahmed.", voice: "en-US-AvaMultilingualNeural" } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ mimeType: "audio/mpeg", filename: "assessment-edge-tts-dialogue.mp3" });
    expect(new Set(runner.synthesize.mock.calls.map(([input]) => input.voice)).size).toBe(3);
    for (const [input] of runner.synthesize.mock.calls) expect(input.text).not.toMatch(LABEL);
    await app.close();
  });

  it("a generated level-up form is saved with listening audio for every part", async () => {
    const runner = tts();
    const { storage, objects } = memoryStorage();
    const app = await server(runner, storage);
    const response = await app.inject({ method: "POST", url: "/api/v1/assessment-level-forms/B1/generate" });
    expect(response.statusCode, response.body).toBe(201);
    const blueprint = repositories.assessments.createLevelFormDraft.mock.calls[0]![2];
    const groups = blueprint.sections.find((section: { code: string }) => section.code === "listening").groups as Array<{ stimulus: { audioSrc?: string; audioSynthesis?: { status: string } } }>;
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.stimulus).toMatchObject({ audioSrc: expect.stringContaining("content-media"), audioSynthesis: { status: "generated" } });
    expect(objects.size).toBe(groups.length);
    await app.close();
  });

  it("a level-up form is still saved, marked failed, when Edge TTS fails", async () => {
    const { storage } = memoryStorage();
    const app = await server(tts("EDGE_TTS_UNAVAILABLE"), storage);
    const response = await app.inject({ method: "POST", url: "/api/v1/assessment-level-forms/B1/generate" });
    expect(response.statusCode, response.body).toBe(201);
    const blueprint = repositories.assessments.createLevelFormDraft.mock.calls[0]![2];
    const groups = blueprint.sections.find((section: { code: string }) => section.code === "listening").groups as Array<{ stimulus: Record<string, unknown> }>;
    for (const group of groups) {
      expect(group.stimulus.audioSrc).toBeUndefined();
      expect(group.stimulus.audioSynthesis).toMatchObject({ status: "failed", code: "EDGE_TTS_UNAVAILABLE" });
    }
    await app.close();
  });
});
