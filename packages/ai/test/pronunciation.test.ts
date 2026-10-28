import { describe, expect, it } from "vitest";
import {
  buildPronunciationAssets,
  containsTargetPhoneme,
  curatedPronunciationWord
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

  it("returns a phoneme-only asset and separate aligned word assets for valid words", () => {
    const assets = buildPronunciationAssets("/d/", [
      { word: "called", ipa: "/kɔːld/" },
      { word: "planned", ipa: "/plænd/" },
      { word: "needed", ipa: "/ˈniːdɪd/" }
    ]);

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
