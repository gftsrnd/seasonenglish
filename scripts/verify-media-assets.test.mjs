import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyMediaAssets } from "./verify-media-assets.mjs";

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture({ entries, files = {} }) {
  const root = await mkdtemp(join(tmpdir(), "e4s-media-"));
  tempRoots.push(root);
  const mediaRoot = join(root, "apps/web/public/media");
  await mkdir(mediaRoot, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, content);
  }
  await writeFile(join(mediaRoot, "manifest.json"), JSON.stringify(entries));
  return root;
}

function entry(overrides = {}, content = "verified") {
  return {
    id: "mascot",
    localPath: "apps/web/public/media/mascot.png",
    sourcePage: "https://kenney.nl/assets/animal-pack-remastered",
    sourcePack: "Animal Pack Remastered",
    originalArchivePath: "PNG/Round/bear.png",
    licence: "CC0-1.0",
    sha256: createHash("sha256").update(content).digest("hex"),
    purpose: "Mascot",
    ...overrides
  };
}

function audioEntry(overrides = {}, content = "audio") {
  return {
    id: "music-emerald-therapy",
    localPath: "apps/web/public/media/audio/emerald-therapy.mp3",
    sourcePage: "https://audionautix.com/creative-commons-music",
    creator: "Jason Shaw / Audionautix",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    sha256: createHash("sha256").update(content).digest("hex"),
    purpose: "Calm offline background-music fallback",
    ...overrides
  };
}

describe("verified media manifest", () => {
  it("accepts a complete declared raster with a matching digest", async () => {
    const root = await fixture({ entries: [entry()], files: { "apps/web/public/media/mascot.png": "verified" } });
    await expect(verifyMediaAssets({ repoRoot: root, requiredIds: ["mascot"] })).resolves.toEqual({ entries: 1, files: 1 });
  });

  it("accepts a declared MP3 only with an auditable CC licence and digest", async () => {
    const root = await fixture({ entries: [audioEntry()], files: { "apps/web/public/media/audio/emerald-therapy.mp3": "audio" } });
    await expect(verifyMediaAssets({ repoRoot: root, requiredIds: ["music-emerald-therapy"] })).resolves.toEqual({ entries: 1, files: 1 });
  });

  it.each([
    ["missing creator", { creator: "" }, "thiếu creator"],
    ["missing licence URL", { licenceUrl: "" }, "licenceUrl"],
    ["unsupported audio licence", { licence: "unknown" }, "CC BY 4.0"]
  ])("rejects audio with %s", async (_label, overrides, message) => {
    const root = await fixture({ entries: [audioEntry(overrides)], files: { "apps/web/public/media/audio/emerald-therapy.mp3": "audio" } });
    await expect(verifyMediaAssets({ repoRoot: root, requiredIds: [] })).rejects.toThrow(message);
  });

  it.each([
    ["missing file", [entry()], {}, "thiếu file"],
    ["undeclared file", [entry()], { "apps/web/public/media/mascot.png": "verified", "apps/web/public/media/extra.png": "extra" }, "chưa khai báo"],
    ["duplicate id", [entry(), entry({ localPath: "apps/web/public/media/other.png" })], { "apps/web/public/media/mascot.png": "verified", "apps/web/public/media/other.png": "verified" }, "id bị trùng"],
    ["duplicate path", [entry(), entry({ id: "other" })], { "apps/web/public/media/mascot.png": "verified" }, "localPath bị trùng"],
    ["non-CC0 licence", [entry({ licence: "CC-BY-4.0" })], { "apps/web/public/media/mascot.png": "verified" }, "CC0-1.0"],
    ["non-Kenney source", [entry({ sourcePage: "https://example.com/art" })], { "apps/web/public/media/mascot.png": "verified" }, "Kenney"],
    ["invalid extension", [entry({ localPath: "apps/web/public/media/mascot.svg" })], { "apps/web/public/media/mascot.svg": "verified" }, "PNG hoặc WebP"],
    ["hash mismatch", [entry({ sha256: "0".repeat(64) })], { "apps/web/public/media/mascot.png": "verified" }, "SHA-256 không khớp"]
  ])("rejects %s", async (_label, entries, files, message) => {
    const root = await fixture({ entries, files });
    await expect(verifyMediaAssets({ repoRoot: root, requiredIds: [] })).rejects.toThrow(message);
  });

  it("rejects a missing required logical asset", async () => {
    const root = await fixture({ entries: [entry()], files: { "apps/web/public/media/mascot.png": "verified" } });
    await expect(verifyMediaAssets({ repoRoot: root, requiredIds: ["mascot", "basket"] })).rejects.toThrow("Manifest thiếu id bắt buộc: basket");
  });
});
