import { describe, expect, it } from "vitest";
import { conciseGrammarExample, learnerFacingObjective, learnerFacingObjectiveBody, learnerObjectiveLead, learnerObjectiveStatements } from "./presentation.js";

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

  it("does not repeat a learner-facing objective prefix already returned by AI", () => {
    expect(learnerFacingObjective("Sau bài học, bạn có thể nói số tiền của một khoản chi phí dự án.", "A2"))
      .toBe("Sau bài học, bạn có thể nói số tiền của một khoản chi phí dự án.");
    expect(learnerFacingObjective("Sau bài học, bạn có thể sau bài học, bạn có thể dùng đúng cấu trúc.", "A1"))
      .toBe("Sau bài học, bạn có thể dùng đúng cấu trúc.");
  });

  it("separates the shared objective lead from each bullet body", () => {
    expect(learnerObjectiveLead("A2")).toBe("Sau bài học, bạn có thể:");
    expect(learnerFacingObjectiveBody("Sau bài học, bạn có thể xác nhận thời gian giao hàng.")).toBe("Xác nhận thời gian giao hàng.");
    expect(learnerObjectiveLead("B1")).toBe("By the end of this lesson, you will be able to:");
    expect(learnerFacingObjectiveBody("By the end of this lesson, you will be able to explain a delivery delay.")).toBe("Explain a delivery delay.");
  });

  it("never lists bare core words as objectives (4300 lesson a50bf937: partner / discuss / agree)", () => {
    expect(learnerObjectiveStatements(["partner", "discuss", "agree"])).toEqual([]);
    expect(learnerObjectiveStatements([{ word: "client", meaning: "khách hàng" }, "Partner"])).toEqual([]);
    expect(learnerObjectiveStatements(["Explain a delivery delay to a client.", "agree", { type: "content", text: "SWBAT summarize the project status." }]))
      .toEqual(["Explain a delivery delay to a client.", "SWBAT summarize the project status."]);
    expect(learnerObjectiveStatements([{ type: "language", text: "Use could to make a polite offer." }], (item) => item.type !== "language")).toEqual([]);
    expect(learnerObjectiveStatements("partner")).toEqual([]);
  });

  it("drops internal roadmap step labels from the fallback objective text", () => {
    expect(learnerFacingObjective("Step B1 (Identify): Notice past simple sequences in a real meeting summary.", "B1"))
      .toBe("By the end of this lesson, you will be able to notice past simple sequences in a real meeting summary.");
  });
});
