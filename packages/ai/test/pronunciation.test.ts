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
  it("packages the complete 44-sound British English phonemic inventory", () => {
    const expected = [
      "p", "b", "t", "d", "k", "g", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "tʃ", "dʒ", "m", "n", "ŋ", "l", "r", "j", "w",
      "ɪ", "iː", "ʊ", "uː", "e", "ə", "ɜː", "ɔː", "æ", "ʌ", "ɑː", "ɒ",
      "eɪ", "aɪ", "ɔɪ", "aʊ", "əʊ", "ɪə", "eə", "ʊə"
    ];

    expect(CURATED_PHONEME_TARGETS).toHaveLength(44);
    expect([...CURATED_PHONEME_TARGETS].sort()).toEqual(expected.sort());
    expect(DEFAULT_PRONUNCIATION_ASSET_REGISTRY.phonemes).not.toHaveProperty("juː");
  });

  it("audits every curated target against an English-suitable source recording", () => {
    const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, "apps/web/public/media/pronunciation-manifest.json"), "utf8"));
    expect(manifest.phonemes.map((entry: { key: string }) => entry.key).sort()).toEqual([...CURATED_PHONEME_TARGETS].sort());
    for (const entry of manifest.phonemes as Array<{ key: string; sourceUrl: string; licence: string }>) {
      expect(entry.sourceUrl, `source for ${entry.key}`).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u);
      expect(entry.licence, `licence for ${entry.key}`).not.toHaveLength(0);
    }
  });

  it("never regresses the three known phonetic mismatches", () => {
    const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, "apps/web/public/media/pronunciation-manifest.json"), "utf8"));
    const sourceByTarget = new Map(manifest.phonemes.map((entry: { key: string; sourceUrl: string }) => [entry.key, entry.sourceUrl]));

    expect(sourceByTarget.get("r")).toContain("Postalveolar_approximant.ogg");
    expect(sourceByTarget.get("r")).not.toContain("Alveolar_trill.ogg");
    expect(sourceByTarget.get("aɪ")).toContain("En-us-I.ogg");
    expect(sourceByTarget.get("aɪ")).not.toContain("De--ei.ogg");
    expect(sourceByTarget.get("iː")).toContain("Close_front_unrounded_vowel.ogg");
    expect(sourceByTarget.get("iː")).not.toContain("De-i.ogg");
  });

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

    expect(assets).not.toHaveProperty("phonemeAudioId");
    expect(assets).not.toHaveProperty("phonemeAudioUrl");
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("Word audio assets unavailable");
  });

  it("returns aligned word assets without resolving the target phoneme asset", () => {
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
      wordAudioUrls: [
        "/media/audio/words/called.mp3",
        "/media/audio/words/planned.mp3",
        "/media/audio/words/needed.mp3"
      ],
      warnings: []
    });
    expect(assets).not.toHaveProperty("phonemeAudioId");
    expect(assets).not.toHaveProperty("phonemeAudioUrl");
    expect(assets.wordAudioUrls.every((url) => isRegisteredPronunciationAssetUrl(url, registry))).toBe(true);
  });

  it("does not fall back to target phoneme audio when word clips are unavailable", () => {
    const registry = createPronunciationAssetRegistry([
      { kind: "phoneme", key: "d", id: "phoneme-d", url: "/media/audio/phonemes/d.ogg" }
    ]);
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "planned", ipa: "/plænd/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ], registry);

    expect(assets).not.toHaveProperty("phonemeAudioId");
    expect(assets).not.toHaveProperty("phonemeAudioUrl");
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("Word audio assets unavailable");
  });

  it("withholds audio when any selected word fails the target check", () => {
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "slipped", ipa: "/slɪpt/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ]);

    expect(assets).not.toHaveProperty("phonemeAudioUrl");
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("slipped does not contain target phoneme /d/");
  });

  it("does not mislabel composite seed focuses as a single phoneme", () => {
    const assets = buildPronunciationAssets("/wɜː/", [
      { word: "work", ipa: "/wɜːk/" },
      { word: "worker", ipa: "/ˈwɜːkə/" },
      { word: "working", ipa: "/ˈwɜːkɪŋ/" }
    ]);

    expect(assets).not.toHaveProperty("phonemeAudioUrl");
    expect(assets.wordAudioUrls).toEqual([]);
    expect(assets.warnings).toContain("Unsupported target phoneme /wɜː/");
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
