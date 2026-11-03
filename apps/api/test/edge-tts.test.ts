import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalEdgeTtsRunner } from "../src/modules/assessment/edge-tts.js";

describe("local Edge TTS runner", () => {
  afterEach(() => vi.restoreAllMocks());

  it("executes the configured local Edge TTS command, returns MP3 bytes, and never falls back to browser synthesis", async () => {
    const execute = vi.fn(async ({ args, outputPath }: { args: string[]; outputPath: string }) => {
      expect(args).toEqual(expect.arrayContaining(["--voice", "en-US-AvaMultilingualNeural", "--text", "Read this script", "--write-media", outputPath]));
      return new Uint8Array([1, 2, 3]);
    });
    const runner = createLocalEdgeTtsRunner({ command: "edge-tts", execute });
    await expect(runner.synthesize({ text: "Read this script", voice: "en-US-AvaMultilingualNeural" })).resolves.toMatchObject({ mimeType: "audio/mpeg", bytes: new Uint8Array([1, 2, 3]) });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects empty scripts before invoking the machine-local command", async () => {
    const execute = vi.fn();
    const runner = createLocalEdgeTtsRunner({ command: "edge-tts", execute: execute as never });
    await expect(runner.synthesize({ text: "   ", voice: "en-US-AvaMultilingualNeural" })).rejects.toThrow("EDGE_TTS_TEXT_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });
});
