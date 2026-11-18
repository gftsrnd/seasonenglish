import { describe, expect, it } from "vitest";
import {
  arenaEligible,
  buildCrosswordLayout,
  decideDuel,
  gameRoundWords,
  prepareGameAttempt,
  roundGameplayMs,
  roundRawMax,
  roundStreak,
  scoreGameRound,
  scoreRound,
  seasonRioRoundPlan,
  weeklyPracticeAvailability,
  type GameKey,
  type RoundUnitOutcome
} from "../src/engagement/index.js";

describe("engagement policy", () => {
  it("derives weekly-practice availability from completed lessons", () => {
    expect(weeklyPracticeAvailability(2, 5, false)).toEqual({ state: "locked", remaining: 3 });
    expect(weeklyPracticeAvailability(5, 5, false)).toEqual({ state: "open", remaining: 0 });
    expect(weeklyPracticeAvailability(5, 5, true)).toEqual({ state: "submitted", remaining: 0 });
  });

  describe("shared round score (RULE A.3/A.4)", () => {
    const outcomes = (...values: RoundUnitOutcome[]) => values;

    it("scores the rule's 8-unit example as 85/110 = 77", () => {
      const answers = outcomes("first_try", "first_try", "first_try", "first_try", "wrong", "first_try", "first_try", "first_try");
      expect(scoreRound(8, answers)).toEqual({ raw: 85, rawMax: 110, score: 77 });
      expect(scoreRound(Array.from({ length: 8 }), answers).score).toBe(77);
    });

    it("uses 10 as the denominator when only one unit is assigned", () => {
      expect(roundRawMax(1)).toBe(10);
      expect(scoreRound(1, ["first_try"])).toEqual({ raw: 10, rawMax: 10, score: 100 });
      expect(scoreRound(1, ["assisted"])).toEqual({ raw: 5, rawMax: 10, score: 50 });
      expect(roundRawMax(0)).toBe(0);
      expect(scoreRound(0, [])).toEqual({ raw: 0, rawMax: 0, score: 0 });
    });

    it("publishes the rule's maxima: 110, 140, 155, 170", () => {
      expect([8, 10, 11, 12].map(roundRawMax)).toEqual([110, 140, 155, 170]);
      expect(scoreRound(12, Array<RoundUnitOutcome>(12).fill("first_try")).score).toBe(100);
    });

    it("keeps the denominator when the round ends early (lives lost)", () => {
      const early = scoreRound(10, outcomes("first_try", "first_try", "wrong", "wrong", "wrong"));
      expect(early).toEqual({ raw: 20, rawMax: 140, score: 14 });
      expect(scoreRound(10, outcomes("first_try", "first_try"))).toEqual(early);
    });

    it("gives only +5 for wrong-then-right, hint or retry, and breaks the streak", () => {
      expect(scoreRound(3, outcomes("first_try", "first_try", "assisted")).raw).toBe(25);
      expect(scoreRound(4, outcomes("first_try", "first_try", "assisted", "first_try")).raw).toBe(35);
    });

    it("restarts at +10, +10 and only then +15 after the streak breaks", () => {
      const sequence = outcomes("first_try", "first_try", "first_try", "skipped", "first_try", "first_try", "first_try", "timeout", "first_try");
      expect(scoreRound(9, sequence).raw).toBe(10 + 10 + 15 + 0 + 10 + 10 + 15 + 0 + 10);
      expect(roundStreak(sequence)).toBe(1);
      expect(roundStreak(outcomes("wrong", "first_try", "first_try"))).toBe(2);
    });

    it("rounds exactly half up", () => {
      // N=6 → rawMax 80; one first try = 10/80 = 12.5 → 13.
      expect(scoreRound(6, outcomes("first_try"))).toEqual({ raw: 10, rawMax: 80, score: 13 });
      // 5/80 = 6.25 → 6.
      expect(scoreRound(6, outcomes("assisted")).score).toBe(6);
    });
  });

  describe("per-game evidence → outcome", () => {
    const fullSet = Array.from({ length: 12 }, (_, index) => ({
      id: `fixed-${index + 1}`,
      english: `term${String.fromCharCode(97 + index)}`,
      vietnamese: `từ ${index + 1}`,
      partOfSpeech: index % 2 ? "verb" : "noun"
    }));
    const right = (game: GameKey, word: (typeof fullSet)[number]) => game === "sort" ? word.partOfSpeech : word.english;

    it("fixes N on the server from the word set, never from the answers", () => {
      const crosswordUnits = gameRoundWords("crossword", fullSet, 4).length;
      const expected: Record<GameKey, number> = { scramble: 8, crossword: crosswordUnits, eggs: 10, mario: 11, sort: 12, typing: 10 };
      for (const game of Object.keys(expected) as GameKey[]) {
        const units = gameRoundWords(game, fullSet, 4);
        const scored = scoreGameRound(game, fullSet, [{ wordId: units[0]!.id, answer: right(game, units[0]!) }], { attemptSeed: 4 });
        expect(scored, game).toMatchObject({ total: expected[game], rawMax: roundRawMax(expected[game]), raw: 10, maxScore: 100 });
      }
    });

    it("reaches 100 when every unit is right first time", () => {
      for (const game of ["scramble", "crossword", "eggs", "mario", "sort", "typing"] as const) {
        const units = gameRoundWords(game, fullSet, 7);
        const scored = scoreGameRound(game, fullSet, units.map((word) => ({ wordId: word.id, answer: right(game, word), attempts: 1 })), { attemptSeed: 7 });
        expect(scored.score, game).toBe(100);
      }
    });

    it("maps attempts, hints, skips and wrong answers to the shared outcomes", () => {
      const [a, b, c, d, e] = gameRoundWords("scramble", fullSet, 0);
      const scored = scoreGameRound("scramble", fullSet, [
        { wordId: a!.id, answer: a!.english, attempts: 1 },
        { wordId: b!.id, answer: b!.english, attempts: 2 },
        { wordId: c!.id, answer: c!.english, usedHint: true },
        { wordId: d!.id, answer: "" },
        { wordId: e!.id, answer: "nope", attempts: 2 }
      ]);
      expect(scored.outcomes.slice(0, 6)).toEqual(["first_try", "assisted", "assisted", "skipped", "wrong", "unanswered"]);
      expect(scored).toMatchObject({ raw: 20, correct: 3, total: 8 });
    });

    it("ignores repeated answers for the same unit and answers outside the round", () => {
      const [first] = gameRoundWords("typing", fullSet, 0);
      const repeated = Array.from({ length: 5 }, () => ({ wordId: first!.id, answer: first!.english, combo: 5 }));
      expect(scoreGameRound("typing", fullSet, [...repeated, { wordId: "unknown", answer: "x" }])).toMatchObject({ raw: 10, correct: 1, total: 10 });
    });

    it("typing: no x1–x5 combo, wrong-then-right in time is +5, time-out is 0", () => {
      const units = gameRoundWords("typing", fullSet, 0);
      const scored = scoreGameRound("typing", fullSet, [
        { wordId: units[0]!.id, answer: units[0]!.english, attempts: 1 },
        { wordId: units[1]!.id, answer: units[1]!.english, attempts: 3 },
        { wordId: units[2]!.id, answer: "[timeout]" }
      ], { events: [{ type: "timeout", wordId: units[2]!.id, answer: "" }] });
      expect(scored.outcomes.slice(0, 3)).toEqual(["first_try", "assisted", "timeout"]);
      expect(scored).toMatchObject({ raw: 15, rawMax: 140, score: 11 });
    });

    it("season catch: a missed drop and a wrong catch both score 0", () => {
      const units = gameRoundWords("eggs", fullSet, 0);
      const scored = scoreGameRound("eggs", fullSet, [
        { wordId: units[0]!.id, answer: units[0]!.english },
        { wordId: units[1]!.id, answer: "" },
        { wordId: units[2]!.id, answer: units[5]!.english }
      ], { events: [{ type: "wrong_catch", wordId: units[2]!.id, answer: units[5]!.english }] });
      expect(scored.outcomes.slice(0, 4)).toEqual(["first_try", "timeout", "wrong", "unanswered"]);
      expect(scored).toMatchObject({ raw: 10, rawMax: 140, score: 7 });
    });

    it("season-rio: boss words never reuse gate words and wrong-then-right gives +5", () => {
      const plan = seasonRioRoundPlan(prepareGameAttempt(fullSet, 0));
      expect(plan).toMatchObject({ gateCount: 8, bossQuestions: 3, total: 11 });
      expect(plan.bossWords.some((word) => plan.gateWords.includes(word))).toBe(false);
      const boss = plan.bossWords[0]!;
      const scored = scoreGameRound("mario", fullSet, [{ wordId: boss.id, answer: boss.english, attempts: 2 }]);
      expect(scored.outcomes[8]).toBe("assisted");
      expect(scored.raw).toBe(5);
    });

    it("season-rio uses the real N when the set is short", () => {
      const shortSet = fullSet.slice(0, 4);
      expect(seasonRioRoundPlan(shortSet)).toMatchObject({ gateCount: 4, bossQuestions: 0, total: 4 });
      expect(seasonRioRoundPlan(fullSet.slice(0, 9))).toMatchObject({ gateCount: 8, bossQuestions: 1, total: 9 });
      expect(scoreGameRound("mario", shortSet, [{ wordId: "fixed-1", answer: "terma" }])).toMatchObject({ raw: 10, rawMax: 50, total: 4, score: 20 });
    });

    it("sort: one try per word, scored with the shared rule (no own combo)", () => {
      const units = gameRoundWords("sort", fullSet, 0);
      const answers = units.slice(0, 4).map((word, index) => ({ wordId: word.id, answer: index === 3 ? "adverb" : word.partOfSpeech }));
      const scored = scoreGameRound("sort", fullSet, answers);
      expect(scored.outcomes.slice(0, 4)).toEqual(["first_try", "first_try", "first_try", "wrong"]);
      expect(scored.raw).toBe(35);
    });

    it("crossword: N is the number of words placed in the server-built grid; hints count per word", () => {
      const words = [
        { id: "w1", english: "colleague", vietnamese: "đồng nghiệp", partOfSpeech: "noun" },
        { id: "w2", english: "prepare", vietnamese: "chuẩn bị", partOfSpeech: "verb" },
        { id: "w3", english: "weekly summary", vietnamese: "bản tóm tắt tuần", partOfSpeech: "phrase" },
        { id: "w4", english: "zzz", vietnamese: "không đan được", partOfSpeech: "noun" }
      ];
      const placed = buildCrosswordLayout(prepareGameAttempt(words, 0)).placed.map((entry) => entry.word.id);
      expect(placed).not.toContain("w4");
      const scored = scoreGameRound("crossword", words, [
        { wordId: "w1", answer: "colleague", attempts: 1 },
        { wordId: "w2", answer: "prepare", usedHint: true },
        { wordId: "w3", answer: "weekly summary", attempts: 2 },
        { wordId: "w4", answer: "zzz" }
      ]);
      expect(scored.total).toBe(placed.length);
      expect(scored.unitIds).toEqual(placed);
      expect(scored.correct).toBe(3);
      const byId = Object.fromEntries(scored.unitIds.map((id, index) => [id, scored.outcomes[index]]));
      expect(byId).toEqual({ w1: "first_try", w2: "assisted", w3: "assisted" });
    });
  });

  it("sums the per-unit gameplay time and rejects implausible values", () => {
    expect(roundGameplayMs([{ ms: 1_200 }, { ms: 800 }])).toBe(2_000);
    expect(roundGameplayMs([{ ms: 1_200 }, {}])).toBeNull();
    expect(roundGameplayMs([{ ms: -1 }])).toBeNull();
    expect(roundGameplayMs([{ ms: 600_001 }])).toBeNull();
    expect(roundGameplayMs(Array.from({ length: 7 }, () => ({ ms: 600_000 })))).toBeNull();
    expect(roundGameplayMs([])).toBeNull();
  });

  it("opens Arena at B1 and decides Duel by score percentage", () => {
    expect(arenaEligible("A2")).toBe(false);
    expect(arenaEligible("B1")).toBe(true);
    expect(decideDuel({ score: 8, maxScore: 10 }, { score: 70, maxScore: 100 })).toBe("challenger");
    expect(decideDuel({ score: 7, maxScore: 10 }, { score: 14, maxScore: 20 })).toBe("draw");
  });
});
