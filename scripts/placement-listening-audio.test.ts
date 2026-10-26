import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { placementDefinition } from "../packages/database/src/assessment-blueprints.js";

const files = ["LA", "LB", "LC"].map((part) => `apps/web/public/media/audio/placement-listening-${part}.wav`);

describe("placement listening audio", () => {
  it("uses natural neural voices without the old metallic normalization chain", () => {
    const generator = readFileSync("scripts/generate-placement-listening-audio.ps1", "utf8");
    expect(generator).toContain("Neural");
    expect(generator).not.toContain("SpeechSynthesizer");
    expect(generator).not.toContain("dynaudnorm");
    expect(generator).toContain('Rate = "-8%"');
    expect(generator).toContain('Rate = "-28%"');
    expect(generator).toContain('Rate = "-20%"');
    expect(generator).toContain("--rate=$($dialogue.Rate)");
    expect(generator).toContain("-t 0.22");
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

  it("keeps every official transcript at a clear assessment pace", () => {
    const groups = placementDefinition.sections.find((section) => section.code === "listening")?.groups ?? [];
    groups.forEach((group) => {
      const wav = readFileSync(`apps/web/public${group.stimulus?.audioSrc}`);
      const sampleRate = wav.readUInt32LE(24);
      const bytesPerSecond = wav.readUInt32LE(28);
      const dataOffset = wav.indexOf(Buffer.from("data"));
      const dataSize = wav.readUInt32LE(dataOffset + 4);
      const durationMinutes = dataSize / bytesPerSecond / 60;
      const words = (group.stimulus?.lines ?? []).reduce((total, line) => total + line.text.trim().split(/\s+/).length, 0);
      const grossWordsPerMinute = words / durationMinutes;
      expect(sampleRate).toBeGreaterThanOrEqual(44_100);
      expect(grossWordsPerMinute, `${group.key} is too fast`).toBeLessThanOrEqual(190);
      expect(grossWordsPerMinute, `${group.key} is unnaturally slow`).toBeGreaterThanOrEqual(100);
    });
  });
});
