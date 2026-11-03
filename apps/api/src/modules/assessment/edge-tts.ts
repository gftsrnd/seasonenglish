import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface EdgeTtsRunner {
  synthesize(input: { text: string; voice: string }): Promise<{ bytes: Uint8Array; mimeType: "audio/mpeg"; filename: string }>;
}

type Execute = (input: { command: string; args: string[]; outputPath: string }) => Promise<Uint8Array>;

/**
 * Runs the local `edge-tts` executable on the API host. It deliberately does
 * not use the browser Web Speech API: operators receive an MP3 they can hear,
 * upload, and persist with the assessment version.
 */
export function createLocalEdgeTtsRunner(options: { command?: string; execute?: Execute } = {}): EdgeTtsRunner {
  const command = options.command?.trim() || "edge-tts";
  const execute = options.execute ?? executeEdgeTts;
  return {
    async synthesize({ text, voice }) {
      const script = text.trim();
      if (!script || script.length > 20_000) throw new Error("EDGE_TTS_TEXT_INVALID");
      const normalizedVoice = voice.trim();
      if (!normalizedVoice || normalizedVoice.length > 200) throw new Error("EDGE_TTS_VOICE_INVALID");
      const directory = await mkdtemp(join(tmpdir(), "e4s-edge-tts-"));
      const outputPath = join(directory, "assessment.mp3");
      try {
        const bytes = await execute({ command, args: ["--voice", normalizedVoice, "--text", script, "--write-media", outputPath], outputPath });
        if (!bytes.byteLength) throw new Error("EDGE_TTS_EMPTY_AUDIO");
        return { bytes, mimeType: "audio/mpeg" as const, filename: "assessment-edge-tts.mp3" };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  };
}

async function executeEdgeTts({ command, args, outputPath }: { command: string; args: string[]; outputPath: string }): Promise<Uint8Array> {
  try {
    await execFileAsync(command, args, { windowsHide: true, timeout: 60_000, maxBuffer: 1_000_000 });
    return new Uint8Array(await readFile(outputPath));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") throw new Error("EDGE_TTS_UNAVAILABLE");
    throw new Error("EDGE_TTS_FAILED");
  }
}
