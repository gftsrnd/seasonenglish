import { describe, expect, it } from "vitest";
import {
  buildPronunciationAssets,
  containsTargetPhoneme,
  createPronunciationAssetRegistry,
  curatedPronunciationWord,
  isRegisteredPronunciationAssetUrl
} from "../src/pronunciation.js";

describe("curated pronunciation assets", () => {
  it("rejects slipped as a /d/ example because its final phoneme is /t/", () => {
    expect(containsTargetPhoneme("/slɪpt/", "d")).toBe(false);
    expect(containsTargetPhoneme("/kɔːld/", "d")).toBe(true);
  });

  it("uses curated IPA for known words instead of trusting a slipped model spelling", () => {
    expect(curatedPronunciationWord("slipped", "/slɪpd/")).toMatchObject({ ipa: "/slɪpt/" });
    expect(containsTargetPhoneme(curatedPronunciationWord("slipped", "/slɪpd/").ipa, "d")).toBe(false);
  });

  it("does not advertise unavailable audio from the default empty registry", () => {
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "planned", ipa: "/plænd/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ]);

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
});
