import { describe, expect, it } from "vitest";
import { weekSuggestionsOutputSchema } from "../src/schemas.js";

const option = {
  topic: "Meetings",
  description: "Lịch họp và cập nhật tiến độ.",
  objectives: "Xác nhận lịch và báo cáo ngắn.",
  keyVocabHint: "agenda, deadline",
  plan: { A2: ["Warm-up", "Vocabulary", "Listening", "Roleplay", "Review"] }
};

describe("operator AI parity schemas", () => {
  it("requires three options and an active CEFR × Monday-Friday plan", () => {
    const parsed = weekSuggestionsOutputSchema.safeParse({
      weeks: [{ weekNumber: 1, levels: ["A2"], options: [option, option, option] }]
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.weeks[0]?.options[0]?.plan.A2).toHaveLength(5);
  });

  it("rejects the legacy topic-only response instead of silently rendering empty plans", () => {
    const parsed = weekSuggestionsOutputSchema.safeParse({
      weeks: [{ weekNumber: 1, options: [{ ...option, plan: undefined }, { ...option, plan: undefined }, { ...option, plan: undefined }] }]
    });
    expect(parsed.success).toBe(false);
  });
});
