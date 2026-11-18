import { describe, expect, it } from "vitest";
import { arenaTotal, decayedPoints, decideOutcome, ratingBand, repeatDecay, settle } from "../src/engagement/index.js";

describe("arena rating (RULE A.7, A.8, D)", () => {
  it("picks the table row at the 199/200 and 499/500 gaps", () => {
    expect(ratingBand(1_000, 1_199)).toEqual({ win: 50, lose: 50 });
    expect(ratingBand(1_000, 1_200)).toEqual({ win: 75, lose: 25 });
    expect(ratingBand(1_000, 1_499)).toEqual({ win: 75, lose: 25 });
    expect(ratingBand(1_000, 1_500)).toEqual({ win: 90, lose: 10 });
    expect(ratingBand(1_199, 1_000)).toEqual({ win: 50, lose: 50 });
    expect(ratingBand(1_200, 1_000)).toEqual({ win: 25, lose: 75 });
    expect(ratingBand(1_499, 1_000)).toEqual({ win: 25, lose: 75 });
    expect(ratingBand(1_500, 1_000)).toEqual({ win: 10, lose: 90 });
  });

  it("winner gains exactly what the loser loses (1 000 vs 1 300 example)", () => {
    expect(settle({ winnerSnapshot: 1_000, loserSnapshot: 1_300, meetingIndex: 1, winnerNow: 1_000, loserNow: 1_300 }))
      .toMatchObject({ base: 75, transfer: 75, winnerAfter: 1_075, loserAfter: 1_225 });
    expect(settle({ winnerSnapshot: 1_300, loserSnapshot: 1_000, meetingIndex: 1, winnerNow: 1_300, loserNow: 1_000 }))
      .toMatchObject({ base: 25, transfer: 25, winnerAfter: 1_325, loserAfter: 975 });
  });

  it("repeats on the same day decay 100/50/25/0 % and round half up: 50 → 50, 25, 13, 0", () => {
    expect([1, 2, 3, 4, 5].map(repeatDecay)).toEqual([100, 50, 25, 0, 0]);
    expect([1, 2, 3, 4].map((index) => decayedPoints(50, repeatDecay(index)))).toEqual([50, 25, 13, 0]);
    let a = 1_000;
    let b = 1_000;
    const rows: Array<[number, number, number]> = [];
    for (const meetingIndex of [1, 2, 3, 4]) {
      const result = settle({ winnerSnapshot: a, loserSnapshot: b, meetingIndex, winnerNow: a, loserNow: b });
      a = result.winnerAfter;
      b = result.loserAfter;
      rows.push([result.transfer, a, b]);
    }
    expect(rows).toEqual([[50, 1_050, 950], [25, 1_075, 925], [13, 1_088, 912], [0, 1_088, 912]]);
  });

  it("third meeting with base 50 moves +13 and −13, never +13/−12", () => {
    const result = settle({ winnerSnapshot: 1_000, loserSnapshot: 1_000, meetingIndex: 3, winnerNow: 1_000, loserNow: 1_000 });
    expect(result.winnerAfter - result.winnerBefore).toBe(13);
    expect(result.loserBefore - result.loserAfter).toBe(13);
  });

  it("floors the loser at 0 and the winner gains only what was actually lost", () => {
    const result = settle({ winnerSnapshot: 40, loserSnapshot: 30, meetingIndex: 1, winnerNow: 40, loserNow: 30 });
    expect(result).toMatchObject({ base: 50, transfer: 30, winnerAfter: 70, loserAfter: 0 });
    expect(settle({ winnerSnapshot: 10, loserSnapshot: 0, meetingIndex: 1, winnerNow: 10, loserNow: 0 }))
      .toMatchObject({ transfer: 0, winnerAfter: 10, loserAfter: 0 });
  });

  it("uses the acceptance snapshot for the row and the current rating for the floor", () => {
    expect(settle({ winnerSnapshot: 1_000, loserSnapshot: 1_600, meetingIndex: 1, winnerNow: 980, loserNow: 1_550 }))
      .toMatchObject({ base: 90, transfer: 90, winnerBefore: 980, winnerAfter: 1_070, loserAfter: 1_460 });
  });

  it("decides by score, then valid time on the same set, otherwise a draw", () => {
    expect(decideOutcome({ score: 80, gameplayMs: 90_000 }, { score: 70, gameplayMs: 10_000 }, { sameSet: true }))
      .toEqual({ winner: "a", decidedBy: "score" });
    expect(decideOutcome({ score: 80, gameplayMs: 50_000 }, { score: 80, gameplayMs: 40_000 }, { sameSet: true }))
      .toEqual({ winner: "b", decidedBy: "time" });
    expect(decideOutcome({ score: 80, gameplayMs: 50_000 }, { score: 80, gameplayMs: 40_000 }, { sameSet: false }))
      .toEqual({ winner: null, decidedBy: "score" });
    expect(decideOutcome({ score: 80, gameplayMs: null }, { score: 80, gameplayMs: 40_000 }, { sameSet: true }))
      .toEqual({ winner: null, decidedBy: "score" });
    expect(decideOutcome({ score: 80, gameplayMs: 40_000 }, { score: 80, gameplayMs: 40_000 }, { sameSet: true }))
      .toEqual({ winner: null, decidedBy: "time" });
  });

  it("a win on time uses the normal win row", () => {
    const decision = decideOutcome({ score: 60, gameplayMs: 30_000 }, { score: 60, gameplayMs: 31_000 }, { sameSet: true });
    expect(decision.winner).toBe("a");
    expect(settle({ winnerSnapshot: 1_000, loserSnapshot: 1_000, meetingIndex: 1, winnerNow: 1_000, loserNow: 1_000 }).transfer).toBe(50);
  });

  it("totals the six games, counting a game not played yet as 1 000", () => {
    expect(arenaTotal({})).toBe(6_000);
    expect(arenaTotal({ eggs: 1_050 })).toBe(6_050);
  });
});
