import { describe, expect, it } from "vitest";
import { groupVocabularyForDisplay } from "./resource-display.js";

describe("groupVocabularyForDisplay", () => {
  it("keeps standalone expanded words before the exceptional phrase entries", () => {
    const result = groupVocabularyForDisplay([
      { id: "phrase", word: "follow up on", meaning: "theo dõi", type: "phrase" },
      { id: "word-one", word: "clarify", meaning: "làm rõ", type: "verb" },
      { id: "word-two", word: "priority", meaning: "ưu tiên", type: "noun" }
    ]);

    expect(result.standalone.map((item) => item.id)).toEqual(["word-one", "word-two"]);
    expect(result.phrases.map((item) => item.id)).toEqual(["phrase"]);
  });
});
