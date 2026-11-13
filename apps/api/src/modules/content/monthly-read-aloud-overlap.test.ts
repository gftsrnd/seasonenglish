import { describe, expect, it } from "vitest";
import { monthlyPronunciationCatalog, monthlyReadAloudPositionOverlaps, selectMonthlyPronunciationItems } from "@e4s/domain";
import { buildMonthlyCatalogPronunciationPrompt, orderMonthlyPronunciationExamplesForReadAloud, selectMonthlyPronunciationCandidates } from "./monthly-resource-generation.js";
import { validateMonthlyResourcePlanShape } from "./monthly-resource-plan-spec.js";

/**
 * 13/11 B1 2026-12 on 4300: the combined review passage reads the first two examples of each sound
 * once each. The linking sound's "checked it" / "called us" reused P1's "checked" and P2's "called",
 * so the read-aloud day kept failing. Linking (any phrase) examples now never contain another sound's
 * single-word read-aloud example, and no two read-aloud examples share a word.
 */
const item = (id: string) => monthlyPronunciationCatalog("B1").find((entry) => entry.id === id)!;
const target = (ipa: string, pairs: ReadonlyArray<readonly [string, string]>) => ({ id: ipa, ipa, label: ipa, explanation: "x", words: pairs.map(([word, wordIpa]) => ({ word, ipa: wordIpa })) });
const ED_T = target("/-ed=t/", [["asked", "/ɑːskt/"], ["checked", "/tʃekt/"], ["finished", "/ˈfɪnɪʃt/"], ["watched", "/wɒtʃt/"], ["helped", "/helpt/"], ["worked", "/wɜːkt/"], ["fixed", "/fɪkst/"], ["stopped", "/stɒpt/"], ["talked", "/tɔːkt/"]]);
const ED_D = target("/-ed=d/", [["called", "/kɔːld/"], ["planned", "/plænd/"], ["delivered", "/dɪˈlɪvəd/"], ["filed", "/faɪld/"], ["signed", "/saɪnd/"], ["moved", "/muːvd/"], ["opened", "/ˈəʊpənd/"], ["saved", "/seɪvd/"], ["showed", "/ʃəʊd/"]]);
const ED_ID = target("/-ed=ɪd/", [["started", "/ˈstɑːtɪd/"], ["needed", "/ˈniːdɪd/"], ["updated", "/ʌpˈdeɪtɪd/"], ["added", "/ˈædɪd/"], ["wanted", "/ˈwɒntɪd/"], ["decided", "/dɪˈsaɪdɪd/"], ["tested", "/ˈtestɪd/"], ["invited", "/ɪnˈvaɪtɪd/"], ["reported", "/rɪˈpɔːtɪd/"]]);
const EARLIER = [ED_T, ED_D, ED_ID];
/** Linking candidates in the order the model tends to return them (checked it, called us first, as stored on 4300). */
const LINK_CANDIDATES = target("/-ed‿V/", [
  ["checked it", "/tʃekt‿ɪt/"], ["called us", "/kɔːld‿ʌs/"], ["finished on time", "/ˈfɪnɪʃt‿ɒn ˈtaɪm/"], ["asked about it", "/ɑːskt‿əˈbaʊt‿ɪt/"],
  ["booked it", "/bʊkt‿ɪt/"], ["joined us", "/dʒɔɪnd‿ʌs/"], ["fixed all the bugs", "/fɪkst‿ɔːl ðə ˈbʌɡz/"], ["moved on", "/muːvd‿ɒn/"],
  ["dropped off", "/drɒpt‿ɒf/"], ["picked up", "/pɪkt‿ʌp/"], ["logged in", "/lɒɡd‿ɪn/"], ["printed it", "/ˈprɪntɪd‿ɪt/"]
]).words;

describe("read-aloud overlap (B1 2026-12 linking examples)", () => {
  it("the linking sound gets read-aloud examples with other verbs than P1-P3's read-aloud words", () => {
    const selection = selectMonthlyPronunciationCandidates({ candidates: LINK_CANDIDATES, forbiddenWords: new Set(), needed: 9, catalogItem: item("b1-ed-link"), totalForTarget: 9, earlierTargets: EARLIER });
    expect(selection.rejected.join(" ")).toMatch(/checked it.*called us.*asked about it/su);
    expect(selection.selected).toHaveLength(9);
    const order = orderMonthlyPronunciationExamplesForReadAloud(selection.selected, EARLIER);
    expect(order.issue).toBeUndefined();
    expect(order.ordered.slice(0, 2).map((word) => word.word)).toEqual(["finished on time", "booked it"]);
    const plan = { coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [...EARLIER, { ...target("/-ed‿V/", []), words: order.ordered }] };
    expect(validateMonthlyResourcePlanShape(plan, 0, "B1").filter((error) => error.includes("read-aloud"))).toEqual([]);
  });

  it("the validator flags the old overlapping plan", () => {
    const old = { coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [...EARLIER, { ...target("/-ed‿V/", []), words: LINK_CANDIDATES.slice(0, 9) }] };
    const errors = validateMonthlyResourcePlanShape(old, 0, "B1").filter((error) => error.includes("read-aloud"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("\"checked\" and \"checked it\" share the word \"checked\"");
    expect(errors[0]).toContain("\"called\" and \"called us\" share the word \"called\"");
  });

  it("a single read-aloud word never sits inside an earlier phrase example; with no usable pair the gate asks for other words", () => {
    // A month where the phrase item comes first ('s, then -ed /t/): "checked" may still be an example, just not read aloud.
    const contraction = target("/'s/", [["it's ready", "/ɪts ˈredi/"], ["that's fine", "/ðæts ˈfaɪn/"], ["it's checked", "/ɪts ˈtʃekt/"]]);
    const order = orderMonthlyPronunciationExamplesForReadAloud(ED_T.words.slice(1), [contraction]);
    expect(order.ordered.slice(0, 2).map((word) => word.word)).toEqual(["finished", "watched"]);
    const blocked = orderMonthlyPronunciationExamplesForReadAloud([...LINK_CANDIDATES.slice(0, 2), LINK_CANDIDATES[3]!, { word: "checked out", ipa: "/tʃekt‿aʊt/" }], EARLIER);
    expect(blocked.issue).toContain("\"asked\", \"checked\", \"called\", \"planned\", \"started\", \"needed\"");
    expect(blocked.drop.length).toBeGreaterThan(0);
  });

  it("the prompt lists the earlier read-aloud words and the guidance models other verbs", () => {
    const pick = selectMonthlyPronunciationItems({ cefr: "B1", month: "2026-11", history: [{ month: "2026-10", sounds: [{ ipa: "/-s=s/" }, { ipa: "/-s=z/" }, { ipa: "/-es=ɪz/" }, { ipa: "/'s/" }] }] });
    const base = { cefr: "B1" as const, monthItems: pick.items, catalog: monthlyPronunciationCatalog("B1"), taughtIds: pick.taughtIds, neededExamples: 9, usedWords: [], acceptedWords: [], coreWords: [], vocabulary: "" };
    const prompt = buildMonthlyCatalogPronunciationPrompt({ ...base, slot: "P4 (N10–N12)", item: pick.items[3]!, readAloudWords: ["asked", "checked", "called", "planned", "started", "needed"] });
    expect(prompt).toContain("READ-ALOUD RULE");
    expect(prompt).toContain("\"checked\", \"called\"");
    expect(prompt).toContain("booked it /bʊkt‿ɪt/");
    expect(prompt).not.toContain("checked it /tʃekt‿ɪt/");
    // The first item of a month has nothing to avoid yet.
    expect(buildMonthlyCatalogPronunciationPrompt({ ...base, slot: "P1 (N1–N3)", item: pick.items[0]! })).not.toContain("READ-ALOUD RULE");
  });

  it("other levels are unaffected: their stored December read-aloud examples pass, and B2/C1 phrases may repeat function words", () => {
    const month = (prefix: string, rows: readonly (readonly string[])[]) => rows.map((words, index) => ({ id: `${prefix}-sound-${index + 1}`, examples: words.map((word, w) => ({ id: `${prefix}-sound-${index + 1}-word-${w + 1}`, word })) }));
    expect(monthlyReadAloudPositionOverlaps(month("a1", [["meeting", "team"], ["list", "sit"], ["help", "set"], ["happy", "sad"]]))).toEqual([]);
    expect(monthlyReadAloudPositionOverlaps(month("b2", [["check it out", "pick it up"], ["go on", "the end"], ["last week", "send me"], ["did you finish", "meet your team"]]))).toEqual([]);
    expect(monthlyReadAloudPositionOverlaps(month("c1", [["comfortable", "different"], ["next steps", "last month"], ["we're gonna be late", "I wanna check it first"], ["We'll look at it in an hour", "Can you send it over by noon"]]))).toEqual([]);
  });
});
