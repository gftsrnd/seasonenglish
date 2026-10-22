import { describe, expect, it } from "vitest";
import { conciseGrammarExample } from "./presentation.js";

describe("lesson presentation", () => {
  it("removes Vietnamese translations and caps old grammar examples", () => {
    expect(conciseGrammarExample("Maybe you could add a chart to the report. (Có lẽ bạn có thể thêm biểu đồ.)"))
      .toBe("Maybe you could add a chart to the report.");
    expect(conciseGrammarExample("Why don't you send the long draft to Minh before the important team meeting tomorrow?"))
      .toBe("Why don't you send the long draft to Minh before the important.");
  });
});
