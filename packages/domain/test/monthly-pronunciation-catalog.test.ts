import { describe, expect, it } from "vitest";
import {
  findMonthlyPronunciationCatalogItem,
  monthlyMonthOffset,
  monthlyPronunciationCatalog,
  monthlyPronunciationExampleIssue,
  monthlyPronunciationMaxSyllables,
  monthlyPronunciationPhenomenonExampleIssue,
  selectMonthlyPronunciationItems,
  type MonthlyPronunciationHistoryEntry
} from "../src/monthly/pronunciation-catalog.js";

const item = (cefr: "A1" | "B1" | "B2" | "C1", id: string) => monthlyPronunciationCatalog(cefr).find((entry) => entry.id === id)!;
const history = (cefr: "A1" | "B1" | "B2" | "C1", entries: Array<[string, number[]]>): MonthlyPronunciationHistoryEntry[] =>
  entries.map(([month, orders]) => ({ month, sounds: orders.map((order) => ({ ipa: monthlyPronunciationCatalog(cefr)[order - 1]!.notation })) }));

describe("pronunciation roadmap catalog", () => {
  it("encodes the roadmap: 44 phonemes easy→hard plus the review pairs for A1–A2, 24 phenomena for B1, B2, C1", () => {
    const a = monthlyPronunciationCatalog("A1");
    expect(a).toHaveLength(48);
    expect(a.slice(0, 4).map((entry) => entry.notation)).toEqual(["/m/", "/n/", "/l/", "/h/"]);
    expect(a.slice(40, 44).map((entry) => entry.notation)).toEqual(["/ʒ/", "/dʒ/", "/θ/", "/ð/"]);
    expect(a.slice(44).map((entry) => entry.type)).toEqual(["pair", "pair", "pair", "pair"]);
    expect(a.filter((entry) => entry.type === "phoneme")).toHaveLength(44);
    expect(monthlyPronunciationCatalog("A2")).toBe(a);
    for (const cefr of ["B1", "B2", "C1"] as const) {
      const catalog = monthlyPronunciationCatalog(cefr);
      expect(catalog).toHaveLength(24);
      expect(catalog.every((entry) => entry.type === "phenomenon" && entry.form)).toBe(true);
      expect(new Set(catalog.map((entry) => entry.notation)).size).toBe(24);
      expect(new Set(catalog.map((entry) => entry.id)).size).toBe(24);
    }
    expect(monthlyPronunciationCatalog("B1")[0]!.labelVi).toBe("Đuôi -s đọc /s/");
    expect(monthlyPronunciationCatalog("B2").slice(0, 4).every((entry) => entry.group === "Dạng yếu")).toBe(true);
    expect(monthlyPronunciationCatalog("C1")[0]!.group).toBe("Trọng âm từ");
  });

  it("finds the taught item by catalogId, notation, or legacy alias of the same level only", () => {
    expect(findMonthlyPronunciationCatalogItem("A2", { ipa: "/ɪ/" })?.id).toBe("phoneme-ɪ");
    expect(findMonthlyPronunciationCatalogItem("B1", { ipa: "/st/" })?.id).toBe("b1-coda-st");
    expect(findMonthlyPronunciationCatalogItem("B1", { ipa: "/ld/" })?.id).toBe("b1-coda-lt-ld");
    expect(findMonthlyPronunciationCatalogItem("B2", { ipa: "/st/" })).toBeUndefined();
    expect(findMonthlyPronunciationCatalogItem("C1", { ipa: "/x/", catalogId: "c1-emphasis-aux" })?.notation).toBe("/I ˈDID/");
  });

  it("computes month offsets across years", () => {
    expect(monthlyMonthOffset("2026-11", -12)).toBe("2025-11");
    expect(monthlyMonthOffset("2026-01", -1)).toBe("2025-12");
    expect(monthlyMonthOffset("2026-12", 1)).toBe("2027-01");
  });
});

describe("monthly item selection with 12-month memory", () => {
  it("takes the first four items in roadmap order when nothing was taught", () => {
    const pick = selectMonthlyPronunciationItems({ cefr: "B2", month: "2026-11", history: [] });
    expect(pick.items.map((entry) => entry.id)).toEqual(["b2-weak-articles", "b2-weak-prepositions", "b2-weak-auxiliaries", "b2-weak-conjunctions"]);
    expect(pick.newCycle).toBe(false);
    expect(selectMonthlyPronunciationItems({ cefr: "A1", month: "2026-11", history: [] }).items.map((entry) => entry.notation)).toEqual(["/m/", "/n/", "/l/", "/h/"]);
  });

  it("continues after the items taught in earlier months and never repeats them inside the window", () => {
    const pick = selectMonthlyPronunciationItems({ cefr: "B1", month: "2026-11", history: history("B1", [["2026-09", [1, 2, 3, 4]], ["2026-10", [5, 6, 7, 8]]]) });
    expect(pick.items.map((entry) => entry.order)).toEqual([9, 10, 11, 12]);
    expect(pick.taughtIds).toHaveLength(8);
  });

  it("skips untaught gaps only after the last taught item, then comes back to them in roadmap order", () => {
    // Items 1–4 and 9–12 were taught; the pointer is after 12, so 13–16 come next, then the gap 5–8 later.
    const pick = selectMonthlyPronunciationItems({ cefr: "B1", month: "2026-11", history: history("B1", [["2026-08", [1, 2, 3, 4]], ["2026-10", [9, 10, 11, 12]]]) });
    expect(pick.items.map((entry) => entry.order)).toEqual([13, 14, 15, 16]);
    const later = selectMonthlyPronunciationItems({ cefr: "B1", month: "2027-01", history: history("B1", [["2026-08", [1, 2, 3, 4]], ["2026-10", [9, 10, 11, 12]], ["2026-11", [13, 14, 15, 16]], ["2026-12", [17, 18, 19, 20]]]) });
    expect(later.items.map((entry) => entry.order)).toEqual([21, 22, 23, 24]);
    const gap = selectMonthlyPronunciationItems({ cefr: "B1", month: "2027-02", history: history("B1", [["2026-08", [1, 2, 3, 4]], ["2026-10", [9, 10, 11, 12]], ["2026-11", [13, 14, 15, 16]], ["2026-12", [17, 18, 19, 20]], ["2027-01", [21, 22, 23, 24]]]) });
    expect(gap.items.map((entry) => entry.order)).toEqual([5, 6, 7, 8]);
    expect(gap.newCycle).toBe(false);
  });

  it("ignores history outside the 12-month window and other months' order", () => {
    const pick = selectMonthlyPronunciationItems({ cefr: "B1", month: "2026-11", history: history("B1", [["2025-10", [1, 2, 3, 4]], ["2026-11", [5, 6, 7, 8]], ["2026-12", [9, 10, 11, 12]]]) });
    expect(pick.items.map((entry) => entry.order)).toEqual([1, 2, 3, 4]);
    expect(pick.taughtIds).toEqual([]);
  });

  it("starts a new cycle from the beginning once the whole catalog was taught", () => {
    const sixMonths: Array<[string, number[]]> = Array.from({ length: 6 }, (_value, index) => [monthlyMonthOffset("2026-05", index), [1, 2, 3, 4].map((offset) => index * 4 + offset)]);
    const seventh = selectMonthlyPronunciationItems({ cefr: "C1", month: "2026-11", history: history("C1", sixMonths) });
    expect(seventh.newCycle).toBe(true);
    expect(seventh.items.map((entry) => entry.order)).toEqual([1, 2, 3, 4]);
    const eighth = selectMonthlyPronunciationItems({ cefr: "C1", month: "2026-12", history: history("C1", [...sixMonths, ["2026-11", [1, 2, 3, 4]]]) });
    expect(eighth.items.map((entry) => entry.order)).toEqual([5, 6, 7, 8]);
  });

  it("A1–A2 cover all 48 items (pairs last) in twelve months before any repeat", () => {
    const months: Array<[string, number[]]> = [];
    const seen = new Set<string>();
    for (let index = 0; index < 12; index += 1) {
      const month = monthlyMonthOffset("2026-01", index);
      const pick = selectMonthlyPronunciationItems({ cefr: "A2", month, history: history("A1", months) });
      expect(pick.newCycle).toBe(false);
      for (const entry of pick.items) { expect(seen.has(entry.id)).toBe(false); seen.add(entry.id); }
      months.push([month, pick.items.map((entry) => entry.order)]);
    }
    expect(seen.size).toBe(48);
    expect(months.at(-1)![1]).toEqual([45, 46, 47, 48]);
    const thirteenth = selectMonthlyPronunciationItems({ cefr: "A2", month: "2027-01", history: history("A1", months) });
    expect(thirteenth.items.map((entry) => entry.notation)).toEqual(["/m/", "/n/", "/l/", "/h/"]);
  });
});

describe("example gates by item type", () => {
  it("phenomenon forms accept marked examples and reject the B2/C1 drift samples of section 7", () => {
    const coda = item("B1", "b1-coda-st");
    expect(monthlyPronunciationPhenomenonExampleIssue(coda, { word: "request", ipa: "/rɪˈkwest/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(coda, { word: "budget", ipa: "/ˈbʌdʒɪt/" })).toMatch(/no syllable-final \/st\//u);
    const ndCoda = item("B1", "b1-coda-nt-nd");
    expect(monthlyPronunciationPhenomenonExampleIssue(ndCoda, { word: "spend", ipa: "/spend/" })).toBeUndefined();
    const weak = item("B2", "b2-weak-articles");
    expect(monthlyPronunciationPhenomenonExampleIssue(weak, { word: "send the file", ipa: "/ˈsend ðə ˈfaɪl/" })).toBeUndefined();
    // A B1-style cluster word is not an example of a B2 weak form.
    expect(monthlyPronunciationPhenomenonExampleIssue(weak, { word: "contrast", ipa: "/ˈkɒntrɑːst/" })).toMatch(/at least 2 words/u);
    const link = item("B2", "b2-link-cv");
    expect(monthlyPronunciationPhenomenonExampleIssue(link, { word: "check it out", ipa: "/ˈtʃek‿ɪt‿ˈaʊt/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(link, { word: "check it out", ipa: "/ˈtʃek ɪt ˈaʊt/" })).toMatch(/‿/u);
    const fall = item("B2", "b2-intonation-fall");
    expect(monthlyPronunciationPhenomenonExampleIssue(fall, { word: "When is the ↘MEETING?", ipa: "/ˈwen ɪz ðə ˈmiːtɪŋ/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(fall, { word: "Is it ↘ready?", ipa: "/ɪz ɪt ˈredi/" })).toMatch(/yes\/no question/u);
    const aux = item("C1", "c1-emphasis-aux");
    expect(monthlyPronunciationPhenomenonExampleIssue(aux, { word: "I DID send it", ipa: "/aɪ ˈdɪd send ɪt/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(aux, { word: "I sent the REPORT", ipa: "/aɪ sent ðə rɪˈpɔːt/" })).toMatch(/auxiliary/u);
    const elision = item("C1", "c1-elision-syllable");
    expect(monthlyPronunciationPhenomenonExampleIssue(elision, { word: "comfortable", ipa: "/ˈkʌmftəbl/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(elision, { word: "topic", ipa: "/ˈtɒpɪk/" })).toMatch(/keeps all/u);
  });

  it("word-stress items check syllables and the stressed position", () => {
    const nounAdj = item("B1", "b1-stress-noun-adj");
    expect(monthlyPronunciationPhenomenonExampleIssue(nounAdj, { word: "office", ipa: "/ˈɒfɪs/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(nounAdj, { word: "supplier", ipa: "/səˈplaɪə/" })).toMatch(/syllables|stresses/u);
    const verb = item("B1", "b1-stress-verb");
    expect(monthlyPronunciationPhenomenonExampleIssue(verb, { word: "confirm", ipa: "/kənˈfɜːm/" })).toBeUndefined();
    const shift = item("B1", "b1-stress-shift");
    expect(monthlyPronunciationPhenomenonExampleIssue(shift, { word: "record (noun)", ipa: "/ˈrekɔːd/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(shift, { word: "record (verb)", ipa: "/ˈrekɔːd/" })).toMatch(/syllable 2/u);
    const suffix = item("B1", "b1-suffix-tion");
    expect(monthlyPronunciationPhenomenonExampleIssue(suffix, { word: "decision", ipa: "/dɪˈsɪʒn/" })).toBeUndefined();
    const teen = item("B1", "b1-suffix-teen-ty");
    expect(monthlyPronunciationPhenomenonExampleIssue(teen, { word: "fifteen", ipa: "/ˌfɪfˈtiːn/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(teen, { word: "fifty", ipa: "/ˈfɪfti/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(teen, { word: "fifteen", ipa: "/ˈfɪftiːn/" })).toMatch(/syllable 2/u);
    expect(monthlyPronunciationMaxSyllables("B1", { ipa: "/ˈσσ/" }, "office")).toBe(3);
    expect(monthlyPronunciationMaxSyllables("B2", { ipa: "/C‿V/" }, "check it out")).toBeUndefined();
    expect(monthlyPronunciationMaxSyllables("A1", { ipa: "/æ/" }, "plan")).toBe(3);
  });

  it("endings check the final sound against the rule", () => {
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-s-s"), { word: "tasks", ipa: "/tɑːsks/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-s-z"), { word: "calls", ipa: "/kɔːlz/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-s-z"), { word: "offices", ipa: "/ˈɒfɪsɪz/" })).toMatch(/ɪz/u);
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-s-iz"), { word: "offices", ipa: "/ˈɒfɪsɪz/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-ed-t"), { word: "checked", ipa: "/tʃekt/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-ed-id"), { word: "needed", ipa: "/ˈniːdɪd/" })).toBeUndefined();
    expect(monthlyPronunciationPhenomenonExampleIssue(item("B1", "b1-ed-d"), { word: "needed", ipa: "/ˈniːdɪd/" })).toMatch(/ɪd/u);
  });

  it("approval check dispatches by type: phoneme, pair side, phenomenon form", () => {
    expect(monthlyPronunciationExampleIssue("A2", { ipa: "/æ/" }, { word: "that", ipa: "/ðæt/" })).toBeUndefined();
    expect(monthlyPronunciationExampleIssue("A2", { ipa: "/ɪ/–/iː/" }, { word: "sheep", ipa: "/ʃiːp/" })).toBeUndefined();
    expect(monthlyPronunciationExampleIssue("A2", { ipa: "/ɪ/–/iː/" }, { word: "bad", ipa: "/bæd/" })).toMatch(/neither side/u);
    expect(monthlyPronunciationExampleIssue("B2", { ipa: "/C‿V/" }, { word: "check it out", ipa: "/ˈtʃek‿ɪt‿ˈaʊt/" })).toBeUndefined();
    // Legacy targets outside the catalog keep the phoneme-token check.
    expect(monthlyPronunciationExampleIssue("B2", { ipa: "/ndʒ/" }, { word: "change", ipa: "/tʃeɪndʒ/" })).toBeUndefined();
  });
});
