// @ts-expect-error The browser package intentionally omits Node globals; Vitest executes this asset check in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const audioDirectory = new URL("../public/media/audio/", import.meta.url);

function wavStats(filename: string) {
  const wav = new Uint8Array(readFileSync(new URL(filename, audioDirectory)));
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const sampleRate = view.getUint32(24, true);
  let dataMarker = -1;
  for (let index = 12; index <= wav.length - 4; index += 1) {
    if (wav[index] === 100 && wav[index + 1] === 97 && wav[index + 2] === 116 && wav[index + 3] === 97) {
      dataMarker = index;
      break;
    }
  }
  if (dataMarker < 0) throw new Error(`${filename} has no PCM data chunk`);
  const dataStart = dataMarker + 8;
  const sampleCount = Math.floor((wav.length - dataStart) / 2);
  const edgeSamples = Math.floor(sampleRate * 0.4);
  let longestQuietRun = 0;
  let quietRun = 0;
  for (let index = edgeSamples; index < sampleCount - edgeSamples; index += 1) {
    const amplitude = Math.abs(view.getInt16(dataStart + index * 2, true));
    if (amplitude < 180) {
      quietRun += 1;
      longestQuietRun = Math.max(longestQuietRun, quietRun);
    } else {
      quietRun = 0;
    }
  }
  return { sampleRate, durationSeconds: sampleCount / sampleRate, longestInteriorQuietSeconds: longestQuietRun / sampleRate };
}

describe("placement listening audio assets", () => {
  it.each(["placement-listening-LA.wav", "placement-listening-LB.wav", "placement-listening-LC.wav"])(
    "%s is one continuous PCM dialogue without stitched dead-air gaps",
    (filename) => {
      const stats = wavStats(filename);
      expect(stats.sampleRate).toBe(48_000);
      expect(stats.durationSeconds).toBeGreaterThan(15);
      expect(stats.longestInteriorQuietSeconds).toBeLessThanOrEqual(0.45);
    }
  );
});
