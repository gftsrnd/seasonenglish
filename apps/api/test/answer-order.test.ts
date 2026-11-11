import { describe, expect, it } from "vitest";
import {
  answerPositionShares, balancedAnswerSlots, rebalanceAnswerPositions, rebalanceAnswerTextPositions,
  rebalanceAnswerTextPositionsWithVariants, seededRandom
} from "../src/modules/shared/answer-order.js";
import { rebalanceAnswerPositions as monthlyRebalance } from "../src/modules/assessment/monthly-final-builder.js";

const indexed = (count: number, optionCount = 4) => Array.from({ length: count }, (_, index) => ({
  id: `q${index}`,
  options: Array.from({ length: optionCount }, (_, option) => option === 1 ? `right ${index}` : `wrong ${index}.${option}`),
  correctIndex: 1
}));

const texted = (count: number, optionCount = 4) => Array.from({ length: count }, (_, index) => ({
  id: `q${index}`,
  options: Array.from({ length: optionCount }, (_, option) => option === 0 ? `right ${index}` : `wrong ${index}.${option}`),
  answer: `right ${index}`
}));

describe("shared answer order", () => {
  it("is deterministic per seed and differs between seeds", () => {
    expect(rebalanceAnswerPositions(indexed(20), "s1")).toEqual(rebalanceAnswerPositions(indexed(20), "s1"));
    expect(rebalanceAnswerTextPositions(texted(20), "s1")).toEqual(rebalanceAnswerTextPositions(texted(20), "s1"));
    expect(rebalanceAnswerPositions(indexed(20), "s1").map((item) => item.correctIndex))
      .not.toEqual(rebalanceAnswerPositions(indexed(20), "s2").map((item) => item.correctIndex));
    const random = seededRandom("abc");
    const again = seededRandom("abc");
    expect([random(), random(), random()]).toEqual([again(), again(), again()]);
  });

  it("keeps every option text and remaps correctIndex to the same correct option", () => {
    const before = indexed(40);
    const after = rebalanceAnswerPositions(before, "level-form:B1");
    after.forEach((item, index) => {
      expect([...item.options].sort()).toEqual([...before[index]!.options].sort());
      expect(item.options[item.correctIndex]).toBe(`right ${index}`);
      expect(item.id).toBe(before[index]!.id);
    });
    const text = rebalanceAnswerTextPositions(texted(12), "lesson");
    text.forEach((item, index) => {
      expect(item.answer).toBe(`right ${index}`);
      expect(item.options).toContain(item.answer);
      expect([...item.options].sort()).toEqual([...texted(12)[index]!.options].sort());
    });
  });

  it("keeps every position at or under 35% for 8+ four-option items, with no triple runs", () => {
    for (const count of [8, 9, 10, 12, 20, 40]) {
      for (const seed of ["a", "b", "scope:3:listening:q1", "level-form:C1"]) {
        const keys = rebalanceAnswerPositions(indexed(count), seed).map((item) => item.correctIndex);
        for (const share of answerPositionShares(keys, 4)) expect(share).toBeLessThanOrEqual(0.35);
        for (let index = 2; index < keys.length; index += 1) expect(keys[index] === keys[index - 1] && keys[index] === keys[index - 2]).toBe(false);
        const textKeys = rebalanceAnswerTextPositions(texted(count), seed).map((item) => item.options.indexOf(item.answer));
        for (const share of answerPositionShares(textKeys, 4)) expect(share).toBeLessThanOrEqual(0.35);
      }
    }
  });

  it("balances mixed option counts per group and skips items whose answer is not an option", () => {
    const items = [...texted(6, 2), ...texted(9, 3).map((item) => ({ ...item, id: `t${item.id}` })), { id: "bad", options: ["a", "b"], answer: "zzz" }];
    const result = rebalanceAnswerTextPositions(items, "mixed");
    expect(result.at(-1)).toEqual(items.at(-1));
    const twos = result.slice(0, 6).map((item) => item.options.indexOf(item.answer));
    const threes = result.slice(6, 15).map((item) => item.options.indexOf(item.answer));
    expect([0, 1].map((slot) => twos.filter((value) => value === slot).length)).toEqual([3, 3]);
    expect([0, 1, 2].map((slot) => threes.filter((value) => value === slot).length)).toEqual([3, 3, 3]);
  });

  it("balances variants independently of their parent items", () => {
    const items = texted(10).map((item, index) => ({ ...item, variants: [{ id: `v${index}`, options: [`vright ${index}`, "x", "y", "z"], answer: `vright ${index}` }] }));
    const result = rebalanceAnswerTextPositionsWithVariants(items, "review:week-1:listening");
    const parentSlots = result.map((item) => item.options.indexOf(item.answer));
    const variantSlots = result.map((item) => item.variants[0]!.options.indexOf(item.variants[0]!.answer));
    expect(variantSlots).not.toEqual(parentSlots);
    for (const share of answerPositionShares(variantSlots, 4)) expect(share).toBeLessThanOrEqual(0.35);
    result.forEach((item, index) => expect(item.variants[0]!.answer).toBe(`vright ${index}`));
    // Variant-only order is the same as balancing the variants list on its own seed.
    expect(result.map((item) => item.variants[0])).toEqual(rebalanceAnswerTextPositions(items.map((item) => item.variants[0]!), "review:week-1:listening:variants"));
  });

  it("keeps the monthly final builder output identical to the pre-extraction implementation", () => {
    // Captured from monthly-final-builder.ts before rebalanceAnswerPositions moved to shared/answer-order.ts.
    const expected: Array<[number, string, number[]]> = [
      [22, "seed-1", [0, 1, 1, 0, 1, 2, 2, 1, 2, 0, 0, 2, 0, 0, 2, 1, 2, 0, 0, 2, 1, 1]],
      [9, "scope-abc:L", [2, 1, 2, 0, 1, 0, 0, 1, 2]],
      [14, "scope-abc:R", [1, 2, 2, 0, 0, 1, 0, 1, 0, 2, 1, 0, 1, 2]],
      [5, "x", [0, 0, 2, 1, 1]]
    ];
    for (const [count, seed, keys] of expected) {
      const items = Array.from({ length: count }, (_, index) => ({ termId: `t${index}`, prompt: "p", options: [`right ${index}`, `d1 ${index}`, `d2 ${index}`], correctIndex: index % 3, explanation: "e" }));
      const result = monthlyRebalance(items, seed);
      expect(result.map((item) => item.correctIndex)).toEqual(keys);
      result.forEach((item, index) => expect(item.options[item.correctIndex]).toBe(items[index]!.options[index % 3]));
      expect(balancedAnswerSlots(count, 3, seed)).toEqual(keys);
    }
  });
});
