import { describe, expect, it } from "vitest";
import { publicLessonGenerationFailure } from "./generation-errors.js";

describe("publicLessonGenerationFailure", () => {
  it("never exposes provider or schema paths to the operator", () => {
    const failure = publicLessonGenerationFailure(Object.assign(new Error("AI_OUTPUT_INVALID"), {
      code: "AI_OUTPUT_INVALID",
      details: {
        issues: [{
          path: "word3.synonym1.partOfSpeech",
          message: "synonym must have the same part of speech"
        }]
      }
    }));

    expect(failure).toEqual({
      code: "AI_LESSON_GENERATION_FAILED",
      message: "AI chưa tạo được bộ bài hợp lệ. Nội dung hiện có vẫn được giữ; vui lòng thử lại."
    });
    expect(JSON.stringify(failure)).not.toContain("word3");
    expect(JSON.stringify(failure)).not.toContain("partOfSpeech");
  });
});
