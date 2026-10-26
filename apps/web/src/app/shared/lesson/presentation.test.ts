import { describe, expect, it } from "vitest";
import { conciseGrammarExample, learnerFacingObjective } from "./presentation.js";

describe("lesson presentation", () => {
  it("presents grammar examples without silently truncating or rewriting them", () => {
    expect(conciseGrammarExample("Maybe you could add a chart to the report. (Có lẽ bạn có thể thêm biểu đồ.)"))
      .toBe("Maybe you could add a chart to the report. (Có lẽ bạn có thể thêm biểu đồ.)");
    expect(conciseGrammarExample("Why don't you send the long draft to Minh before the important team meeting tomorrow?"))
      .toBe("Why don't you send the long draft to Minh before the important team meeting tomorrow?");
  });

  it("renders internal SWBAT objectives with the learner-facing prefix for each level band", () => {
    expect(learnerFacingObjective("SWBAT identify two meeting details.", "A2"))
      .toBe("Sau bài học, bạn có thể identify two meeting details.");
    expect(learnerFacingObjective("SWBAT summarize the project status.", "B1"))
      .toBe("By the end of this lesson, you will be able to summarize the project status.");
  });
});
