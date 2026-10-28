import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyPronunciationAssets } from "./verify-pronunciation-assets.mjs";

async function fixture(manifest, files = {}) {
  const root = await mkdtemp(join(tmpdir(), "e4s-pronunciation-assets-"));
  await mkdir(join(root, "apps/web/public/media/audio/phonemes"), { recursive: true });
  await mkdir(join(root, "apps/web/public/media/audio/words"), { recursive: true });
  await writeFile(join(root, "apps/web/public/media/pronunciation-manifest.json"), JSON.stringify(manifest));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

describe("pronunciation asset verification", () => {
  it("accepts an empty registry and packaged directories", async () => {
    const root = await fixture({ version: 1, phonemes: [], words: [] });
    await expect(verifyPronunciationAssets({ repoRoot: root })).resolves.toMatchObject({ entries: 0, files: 0 });
  });

  it("rejects a registry entry whose packaged file is missing", async () => {
    const root = await fixture({
      version: 1,
      phonemes: [{ id: "phoneme-d", key: "d", url: "/media/audio/phonemes/d.wav", localPath: "apps/web/public/media/audio/phonemes/d.wav", kind: "phoneme", sha256: "0".repeat(64), licence: "pending", sourceUrl: "pending" }],
      words: []
    });
    await expect(verifyPronunciationAssets({ repoRoot: root })).rejects.toThrow("missing file");
  });

  it("rejects an audio file that is not declared in the registry", async () => {
    const root = await fixture({ version: 1, phonemes: [], words: [] }, {
      "apps/web/public/media/audio/phonemes/d.wav": "unregistered fixture"
    });
    await expect(verifyPronunciationAssets({ repoRoot: root })).rejects.toThrow("not registered");
  });
});
