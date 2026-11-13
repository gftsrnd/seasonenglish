import { describe, expect, it } from "vitest";
import { monthlyReadAloudExampleClash, monthlyReadAloudPositionOverlaps } from "../src/monthly/read-aloud-targets.js";
import { monthlyPronunciationCatalog } from "../src/monthly/pronunciation-catalog.js";
import { monthlyPronunciationRule } from "../src/monthly/pronunciation-rules.js";

const sound = (id: string, words: readonly string[]) => ({ id, examples: words.map((word, index) => ({ id: `${id}-word-${index + 1}`, word })) });

/** Shaped like B1 2026-12 on 4300 (first two examples of each sound as stored): the linking target reuses the -ed words read aloud for P1 and P2. */
const B1_DECEMBER = [
  sound("b1-sound-1", ["asked", "checked", "finished", "watched", "helped", "worked", "fixed", "stopped", "talked"]),
  sound("b1-sound-2", ["called", "planned", "delivered", "filed", "signed", "moved", "opened", "saved", "showed"]),
  sound("b1-sound-3", ["started", "needed", "updated", "added", "wanted", "decided", "tested", "invited", "reported"]),
  sound("b1-sound-4", ["checked‿it", "called us", "finished on time", "asked about it", "booked it", "moved on", "fixed all the bugs", "joined us", "dropped off"])
];

describe("read-aloud position overlaps (B1 2026-12 linking examples)", () => {
  it("flags the stored B1 December plan: checked it / called us reuse the read-aloud words of P1 and P2", () => {
    const overlaps = monthlyReadAloudPositionOverlaps(B1_DECEMBER);
    expect(overlaps.map((overlap) => `${overlap.exampleId}~${overlap.otherExampleId}`)).toEqual(expect.arrayContaining([
      "b1-sound-1-word-2~b1-sound-4-word-1",
      "b1-sound-2-word-1~b1-sound-4-word-2",
      "b1-sound-1-word-1~b1-sound-4-word-4"
    ]));
    expect(overlaps.find((overlap) => overlap.otherExampleId === "b1-sound-4-word-1")?.reason).toContain("\"checked\"");
  });

  it("accepts the month once the linking target reads aloud phrases with other verbs", () => {
    const fixed = [...B1_DECEMBER.slice(0, 3), sound("b1-sound-4", ["booked it", "joined us", "finished on time", "fixed all the bugs", "moved on", "dropped off", "picked up", "signed in", "logged on"])];
    // "finished on time" (not read aloud) may share a word with P1's non-read-aloud "finished"; "moved on" with P2's seventh example.
    expect(monthlyReadAloudPositionOverlaps(fixed)).toEqual([]);
  });

  it("small function words may repeat, a whole example inside another may not", () => {
    expect(monthlyReadAloudExampleClash("booked it", "fixed it")).toBeUndefined();
    expect(monthlyReadAloudExampleClash("send the file", "a copy for you")).toBeUndefined();
    expect(monthlyReadAloudExampleClash("we can", "we can start")).toContain("inside");
    expect(monthlyReadAloudExampleClash("it's clear now", "it's done")).toBeUndefined();
  });

  it("other levels are unaffected: the approved A1, A2, B2 and C1 December plans on 4300 pass", () => {
    const plans = [
      [sound("a1-sound-1", ["meeting", "team"]), sound("a1-sound-2", ["list", "sit"]), sound("a1-sound-3", ["help", "set"]), sound("a1-sound-4", ["happy", "sad"])],
      [sound("a2-sound-1", ["meeting", "team"]), sound("a2-sound-2", ["list", "sit"]), sound("a2-sound-3", ["send", "deadline"]), sound("a2-sound-4", ["manager", "that"])],
      [sound("b2-sound-1", ["check it out", "pick it up", "just check"]), sound("b2-sound-2", ["go on", "the end"]), sound("b2-sound-3", ["last week", "send me"]), sound("b2-sound-4", ["did you finish", "meet your team", "did you check the spreadsheet"])],
      [sound("c1-sound-1", ["comfortable", "different"]), sound("c1-sound-2", ["next steps", "last month"]), sound("c1-sound-3", ["we're gonna be late", "I wanna check it first"]), sound("c1-sound-4", ["We'll look at it in an hour", "Can you send it over by noon", "Let me check it with the team"])]
    ];
    for (const plan of plans) expect(monthlyReadAloudPositionOverlaps(plan)).toEqual([]);
  });

  it("the B1 linking guidance and rule no longer model checked it / called us", () => {
    const item = monthlyPronunciationCatalog("B1").find((entry) => entry.id === "b1-ed-link")!;
    const rule = monthlyPronunciationRule("b1-ed-link")!;
    for (const text of [item.exampleGuidance, rule.ruleEn, rule.ruleVi]) {
      expect(text).not.toMatch(/checked it|called us/u);
      expect(text).toContain("booked it");
    }
  });
});
