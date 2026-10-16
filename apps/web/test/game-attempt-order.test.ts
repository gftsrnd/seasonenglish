import { describe, expect, it } from "vitest";
import { choices, prepareGameAttempt } from "../src/pages/learner/games/types.js";

const words = [
  ["w1", "colleague", "đồng nghiệp"], ["w2", "prepare", "chuẩn bị"], ["w3", "deadline", "hạn chót"],
  ["w4", "manager", "quản lý"], ["w5", "update", "cập nhật"], ["w6", "client", "khách hàng"]
].map(([id, english, vietnamese]) => ({ id: id!, english: english!, vietnamese: vietnamese!, definition: "definition", partOfSpeech: "noun" }));

describe("game attempt preparation", () => {
  it("is stable during one attempt but changes the word and option order on replay", () => {
    const first = prepareGameAttempt(words, 101);
    const sameAttempt = prepareGameAttempt(words, 101);
    const replay = prepareGameAttempt(words, 102);

    expect(sameAttempt.map((word) => word.id)).toEqual(first.map((word) => word.id));
    expect(replay.map((word) => word.id)).not.toEqual(first.map((word) => word.id));

    const current = first[0]!;
    expect(choices(first, current, 4, 101).map((word) => word.id)).toEqual(choices(first, current, 4, 101).map((word) => word.id));
    expect(choices(replay, replay[0]!, 4, 102).map((word) => word.id)).not.toEqual(choices(first, current, 4, 101).map((word) => word.id));
  });
});
