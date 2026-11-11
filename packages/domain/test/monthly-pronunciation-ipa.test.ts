import { describe, expect, it } from "vitest";
import { monthlyIpaExampleMatchesTarget, monthlyIpaPhonemes } from "../src/monthly/pronunciation-ipa.js";

describe("monthly pronunciation IPA gate (phoneme tokens, not substrings)", () => {
  it("tokenizes diphthongs, affricates, length marks and stress", () => {
    expect(monthlyIpaPhonemes("/ˈtʃeɪndʒ/")).toEqual(["ˈ", "tʃ", "eɪ", "n", "dʒ"]);
    expect(monthlyIpaPhonemes("/ˈmænɪdʒə(r)/")).toEqual(["ˈ", "m", "æ", "n", "ɪ", "dʒ", "ə"]);
    expect(monthlyIpaPhonemes("/miːt/")).toEqual(["m", "iː", "t"]);
  });

  it("keeps genuine examples valid", () => {
    expect(monthlyIpaExampleMatchesTarget("/iː/", "/miːt/")).toBe(true);
    expect(monthlyIpaExampleMatchesTarget("/ˈ/", "/ˈklaɪənt/")).toBe(true);
    expect(monthlyIpaExampleMatchesTarget("/st/", "/rɪˈkwest/")).toBe(true);
    expect(monthlyIpaExampleMatchesTarget("/nd/", "/ɪkˈstend/")).toBe(true);
    expect(monthlyIpaExampleMatchesTarget("/ks/", "/tekst/")).toBe(true);
    expect(monthlyIpaExampleMatchesTarget("/æ/", "/plæn/", "plan")).toBe(true);
    expect(monthlyIpaExampleMatchesTarget("/ð/", "/ðæt/", "that")).toBe(true);
  });

  it("rejects onset clusters for a final-cluster target", () => {
    expect(monthlyIpaExampleMatchesTarget("/st/", "/ɪkˈstend/", "extend")).toBe(false);
  });

  it("rejects weak-form function words for a vowel target", () => {
    expect(monthlyIpaExampleMatchesTarget("/æ/", "/ðæt/", "that")).toBe(false);
    expect(monthlyIpaExampleMatchesTarget("/æ/", "/hæv/", "have")).toBe(false);
  });

  it("does not match part of a diphthong or affricate", () => {
    expect(monthlyIpaExampleMatchesTarget("/ɪ/", "/saɪn/")).toBe(false);
    expect(monthlyIpaExampleMatchesTarget("/e/", "/ˈʌpdeɪt/")).toBe(false);
    expect(monthlyIpaExampleMatchesTarget("/t/", "/tʃek/")).toBe(false);
    expect(monthlyIpaExampleMatchesTarget("/iː/", "/wɜːk/")).toBe(false);
    expect(monthlyIpaExampleMatchesTarget("/ˈXx/", "/ˈklaɪənt/")).toBe(false);
  });
});
