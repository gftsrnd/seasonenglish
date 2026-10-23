import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = ["LA", "LB", "LC"].map((part) => `apps/web/public/media/audio/placement-listening-${part}.wav`);

describe("placement listening audio", () => {
  it("uses natural neural voices without the old metallic normalization chain", () => {
    const generator = readFileSync("scripts/generate-placement-listening-audio.ps1", "utf8");
    expect(generator).toContain("Neural");
    expect(generator).not.toContain("SpeechSynthesizer");
    expect(generator).not.toContain("dynaudnorm");
  });

  it.each(files)("keeps %s clear and loud enough for an English listening test", (file) => {
    const wav = readFileSync(file);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBeGreaterThanOrEqual(44_100);
    const dataOffset = wav.indexOf(Buffer.from("data")) + 8;
    let energy = 0;
    let samples = 0;
    for (let offset = dataOffset; offset + 1 < wav.length; offset += 2) {
      const value = wav.readInt16LE(offset) / 32_768;
      energy += value * value;
      samples += 1;
    }
    const rmsDb = 20 * Math.log10(Math.sqrt(energy / samples));
    expect(rmsDb).toBeGreaterThan(-19);
  });
});
