import { describe, expect, it } from "vitest";
import { monthlyReadAloudTargetCounts, monthlyReadAloudTargetSpans, monthlyReadAloudTargetWords, withMonthlyReadAloudTargets } from "../src/monthly/read-aloud-targets.js";

/** Live B1 2026-12 lesson 17 on 4300 (framework 900fd0fb-397c-4b62-8c4a-2ce655a27369): pronunciation read-aloud. */
const PASSAGE = "Last week our team asked the vendor about the new schedule. Minh checked the file before the call, and then he checked it again after lunch. Lan finished the draft on time. After the meeting, we planned the next steps and started the testing phase. Later the client called us to confirm the budget, and the vendor called the office twice. We needed more staff, so the manager approved a new hire. Finally, Hoa updated the shared folder.";
const TARGET_POSITIONS = [1, 2, 3, 4].flatMap((sound) => [1, 2].map((word) => ({ soundId: `b1-sound-${sound}`, exampleId: `b1-sound-${sound}-word-${word}` })));
const SOUNDS = [
  { id: "b1-sound-1", examples: [{ id: "b1-sound-1-word-1", word: "asked" }, { id: "b1-sound-1-word-2", word: "checked" }] },
  { id: "b1-sound-2", examples: [{ id: "b1-sound-2-word-1", word: "called" }, { id: "b1-sound-2-word-2", word: "planned" }] },
  { id: "b1-sound-3", examples: [{ id: "b1-sound-3-word-1", word: "started" }, { id: "b1-sound-3-word-2", word: "needed" }] },
  { id: "b1-sound-4", examples: [{ id: "b1-sound-4-word-1", word: "checked‿it" }, { id: "b1-sound-4-word-2", word: "called us" }] }
];
const TARGETS = ["asked", "checked", "called", "planned", "started", "needed", "checked it", "called us"];

describe("read-aloud targets (live B1 2026-12 lesson 17)", () => {
  it("maps the stored target positions to their example words", () => {
    expect(monthlyReadAloudTargetWords({ targetPositions: TARGET_POSITIONS }, undefined, SOUNDS)).toEqual(TARGETS);
  });

  it("an old lesson without positions takes the plan's positions, then its example words; nothing resolvable gives none", () => {
    expect(monthlyReadAloudTargetWords({}, { requiredPositions: TARGET_POSITIONS }, SOUNDS)).toEqual(TARGETS);
    expect(monthlyReadAloudTargetWords({}, { exampleIds: ["b1-sound-1-word-1", "b1-sound-2-word-2"] }, SOUNDS)).toEqual(["asked", "planned"]);
    expect(monthlyReadAloudTargetWords({}, undefined, SOUNDS)).toEqual([]);
    expect(monthlyReadAloudTargetWords({ targetPositions: TARGET_POSITIONS }, undefined, [])).toEqual([]);
  });

  it("marks every occurrence the server counts: phrases first, a word inside a marked phrase not again, whole words", () => {
    const marked = monthlyReadAloudTargetSpans(PASSAGE, TARGETS).map((span) => PASSAGE.slice(span.start, span.end));
    expect(marked).toEqual(["asked", "checked", "checked it", "planned", "started", "called us", "called", "needed"]);
    // "finished", "approved", "updated" are -ed words but not targets.
    expect(marked).not.toContain("finished");
    expect(Object.fromEntries(monthlyReadAloudTargetCounts(PASSAGE, TARGETS))).toEqual({ asked: 1, checked: 1, called: 1, planned: 1, started: 1, needed: 1, "checked it": 1, "called us": 1 });
    expect(monthlyReadAloudTargetSpans("He rechecked it.", ["checked"])).toEqual([]);
  });

  it("puts the targets on a pronunciation part with a passage only", () => {
    const parts = withMonthlyReadAloudTargets([{ code: "pronunciation", content: { passage: PASSAGE, targetPositions: TARGET_POSITIONS } }, { code: "grammar", content: {} }], undefined, SOUNDS);
    expect((parts[0]!.content as Record<string, unknown>).passageTargets).toEqual(TARGETS);
    expect(parts[1]!.content).toEqual({});
    expect(withMonthlyReadAloudTargets([{ code: "pronunciation", content: { words: [] } }], undefined, SOUNDS)[0]!.content).not.toHaveProperty("passageTargets");
  });
});
