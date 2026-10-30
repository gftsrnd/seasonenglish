import { describe, expect, it } from "vitest";
import { vocabularyPresentationBlocks } from "./vocabulary-groups.js";

describe("vocabularyPresentationBlocks", () => {
  it("renders one persisted umbrella group instead of repeating its label on every card", () => {
    const blocks = vocabularyPresentationBlocks(
      [
        { word: "paper", umbrella: { word: "office supplies", meaning: "đồ dùng văn phòng" } },
        { word: "box", umbrella: { word: "office supplies", meaning: "đồ dùng văn phòng" } },
        { word: "pen", umbrella: { word: "office supplies", meaning: "đồ dùng văn phòng" } },
        { word: "request", umbrella: { word: "workplace communication", meaning: "giao tiếp công việc" } }
      ],
      [{ umbrella: { word: "office supplies", meaning: "đồ dùng văn phòng" }, itemWords: ["paper", "box", "pen"] }]
    );

    expect(blocks).toEqual([
      expect.objectContaining({ kind: "group", umbrella: { word: "office supplies", meaning: "đồ dùng văn phòng" }, items: [{ word: "paper", umbrella: expect.anything() }, { word: "box", umbrella: expect.anything() }, { word: "pen", umbrella: expect.anything() }] }),
      expect.objectContaining({ kind: "item", item: { word: "request", umbrella: expect.anything() } })
    ]);
  });
});
