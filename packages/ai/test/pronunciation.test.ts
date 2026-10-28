import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPronunciationAssets,
  containsTargetPhoneme,
  CURATED_PHONEME_TARGETS,
  createPronunciationAssetRegistry,
  curatedPronunciationWord,
  isRegisteredPronunciationAssetUrl
} from "../src/pronunciation.js";
import { DEFAULT_PRONUNCIATION_ASSET_REGISTRY, EMPTY_PRONUNCIATION_ASSET_REGISTRY } from "../src/pronunciation-assets.js";

describe("curated pronunciation assets", () => {
  it("resolves every generated fixture target to a real playable packaged asset", () => {
    const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, "apps/web/public/media/pronunciation-manifest.json"), "utf8"));
    const manifestByKey = new Map(manifest.phonemes.map((entry: { key: string }) => [entry.key, entry]));

    for (const target of CURATED_PHONEME_TARGETS) {
      const registryEntry = DEFAULT_PRONUNCIATION_ASSET_REGISTRY.phonemes[target];
      const manifestEntry = manifestByKey.get(target) as { url: string; localPath: string } | undefined;
      expect(registryEntry?.url, target).toBe(manifestEntry?.url);
      expect(manifestEntry?.url, target).toMatch(/^\/media\/audio\/phonemes\/[^/]+\.ogg$/u);
      const assetPath = resolve(repoRoot, manifestEntry!.localPath);
      expect(statSync(assetPath).size, target).toBeGreaterThan(0);
      expect(readFileSync(assetPath).subarray(0, 4).toString("ascii"), target).toBe("OggS");
    }
  });

  it("rejects slipped as a /d/ example because its final phoneme is /t/", () => {
    expect(containsTargetPhoneme("/slɪpt/", "d")).toBe(false);
    expect(containsTargetPhoneme("/kɔːld/", "d")).toBe(true);
  });

  it("uses curated IPA for known words instead of trusting a slipped model spelling", () => {
    expect(curatedPronunciationWord("slipped", "/slɪpd/")).toMatchObject({ ipa: "/slɪpt/" });
    expect(containsTargetPhoneme(curatedPronunciationWord("slipped", "/slɪpd/").ipa, "d")).toBe(false);
  });

  it("supports the rollback registry without advertising unavailable audio", () => {
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "planned", ipa: "/plænd/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ], EMPTY_PRONUNCIATION_ASSET_REGISTRY);

    expect(assets.phonemeAudioId).toBeUndefined();
    expect(assets.phonemeAudioUrl).toBeUndefined();
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("No registered phoneme asset exists for /d/");
  });

  it("returns only registered phoneme-only and aligned word assets", () => {
    const registry = createPronunciationAssetRegistry([
      { kind: "phoneme", key: "d", id: "phoneme-d", url: "/media/audio/phonemes/d.wav" },
      { kind: "word", key: "called", id: "word-called", url: "/media/audio/words/called.mp3" },
      { kind: "word", key: "planned", id: "word-planned", url: "/media/audio/words/planned.mp3" },
      { kind: "word", key: "needed", id: "word-needed", url: "/media/audio/words/needed.mp3" }
    ]);
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "planned", ipa: "/plænd/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ], registry);

    expect(assets).toEqual({
      phonemeAudioId: "phoneme-d",
      phonemeAudioUrl: "/media/audio/phonemes/d.wav",
      wordAudioUrls: [
        "/media/audio/words/called.mp3",
        "/media/audio/words/planned.mp3",
        "/media/audio/words/needed.mp3"
      ],
      warnings: []
    });
    expect(assets.phonemeAudioUrl).not.toBe(assets.wordAudioUrls[0]);
    expect(isRegisteredPronunciationAssetUrl(assets.phonemeAudioUrl!, registry)).toBe(true);
    expect(assets.wordAudioUrls.every((url) => isRegisteredPronunciationAssetUrl(url, registry))).toBe(true);
  });

  it("keeps a verified target phoneme playable when word clips are unavailable", () => {
    const registry = createPronunciationAssetRegistry([
      { kind: "phoneme", key: "d", id: "phoneme-d", url: "/media/audio/phonemes/d.ogg" }
    ]);
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "planned", ipa: "/plænd/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ], registry);

    expect(assets.phonemeAudioId).toBe("phoneme-d");
    expect(assets.phonemeAudioUrl).toBe("/media/audio/phonemes/d.ogg");
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("Word audio assets unavailable; target phoneme audio remains playable");
  });

  it("withholds audio when any selected word fails the target check", () => {
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "slipped", ipa: "/slɪpt/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ]);

    expect(assets.phonemeAudioUrl).toBeUndefined();
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("slipped does not contain target phoneme /d/");
  });

  it("does not mislabel composite seed focuses as a single phoneme", () => {
    const assets = buildPronunciationAssets("/wɜː/", [
      { word: "work", ipa: "/wɜːk/" },
      { word: "worker", ipa: "/ˈwɜːkə/" },
      { word: "working", ipa: "/ˈwɜːkɪŋ/" }
    ]);

    expect(assets.phonemeAudioUrl).toBeUndefined();
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("No curated phoneme asset exists for /wɜː/");
  });
});

function findRepoRoot(start: string): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, "apps/web/public/media/pronunciation-manifest.json"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("Could not locate repository root for pronunciation asset test");
    current = parent;
  }
}
