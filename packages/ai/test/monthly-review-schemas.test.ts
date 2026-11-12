import { describe, expect, it } from "vitest";
import { AI_TASKS, createAiService, type AiProvider, type AiProviderRequest } from "../src/index.js";
import { monthlyReviewExercisesOutputJsonSchema, monthlyReviewExercisesOutputSchema, monthlyReviewItemRepairOutputJsonSchema, monthlyReviewItemRepairOutputSchema } from "../src/monthly-review-schemas.js";

/** Shape of a December A1 review listening item as the model returns it (with its retry variant). */
const listeningItem = {
  id: "l1", audioText: "client", prompt: "Nghe và chọn nghĩa đúng",
  options: ["khách hàng", "báo cáo", "cuộc họp", "hạn chót"], answer: "khách hàng",
  explanation: "'Client' nghĩa là khách hàng.", questionTranslation: "Nghe và chọn nghĩa đúng", answerTranslation: "khách hàng",
  variants: [{ id: "l1-v1", audioText: "client", prompt: "Nghe và chọn nghĩa đúng", options: ["đồng nghiệp", "khách hàng", "công ty", "nhiệm vụ"], answer: "khách hàng", explanation: "'Client' nghĩa là khách hàng.", questionTranslation: "Nghe và chọn nghĩa đúng", answerTranslation: "khách hàng" }]
};

describe("monthly review exercise schema (12/11)", () => {
  it("requires exactly one retry variant on every choice item of every graded section", () => {
    const sections = monthlyReviewExercisesOutputJsonSchema.properties.sections.properties as Record<string, any>;
    for (const code of ["listening", "word_use", "word_class", "grammar", "reading"]) {
      const item = sections[code].properties.items.items;
      expect(item.required, code).toContain("variants");
      expect(item.properties.variants).toMatchObject({ minItems: 1, maxItems: 1 });
      expect(item.properties.variants.items.required).toEqual(expect.arrayContaining(["prompt", "options", "answer", "explanation"]));
    }
    // A listening retry plays the same word: audioText is required on the variant too.
    expect(sections.listening.properties.items.items.properties.variants.items.required).toContain("audioText");
    expect(sections.speaking.properties.items.items.required).not.toContain("variants");
  });

  it("maps sections to the monthly lesson parts, also when the model JSON-encodes a section", () => {
    const parsed = monthlyReviewExercisesOutputSchema.parse({
      title: "Ôn tập tuần 1",
      sections: { listening: { items: [listeningItem] }, reading: JSON.stringify({ passage: "Hi team, the client replied.", items: [] }) }
    });
    expect(parsed.lesson.title).toBe("Ôn tập tuần 1");
    expect(parsed.lesson.parts.map((part) => part.code)).toEqual(["listening", "reading"]);
    expect((parsed.lesson.parts[0]!.content.items as unknown[])[0]).toMatchObject({ id: "l1", variants: [{ audioText: "client" }] });
    expect(parsed.lesson.parts[1]!.content).toMatchObject({ passage: "Hi team, the client replied." });
    // A flat { title, parts } answer still parses.
    expect(monthlyReviewExercisesOutputSchema.parse({ title: "Review", parts: [{ code: "listening", content: { items: [listeningItem] } }] }).lesson.parts).toHaveLength(1);
  });

  it("item repair returns the item per section/id with a required variant", () => {
    const entry = (monthlyReviewItemRepairOutputJsonSchema.properties.items.items as any);
    expect(entry.required).toEqual(["section", "id", "item"]);
    expect(entry.properties.item.required).toContain("variants");
    const parsed = monthlyReviewItemRepairOutputSchema.parse({ items: JSON.stringify([{ section: "listening", id: "l1", item: listeningItem }]) });
    expect(parsed.items[0]).toMatchObject({ section: "listening", id: "l1", item: { variants: [{ id: "l1-v1" }] } });
    expect(() => monthlyReviewItemRepairOutputSchema.parse({ items: [{ section: "speaking", id: "s1", item: {} }] })).toThrow();
  });

  it("registers both tasks with their own tool schema", async () => {
    const requests: AiProviderRequest[] = [];
    const provider: AiProvider = { name: "mock", model: "mock", async complete(request) {
      requests.push(request);
      return { output: request.taskId === "monthly_review_exercises" ? { title: "Review", sections: { listening: { items: [listeningItem] } } } : { items: [{ section: "listening", id: "l1", item: listeningItem }] }, usage: {} };
    } };
    const service = createAiService({ registry: AI_TASKS, provider, loadPrompt: async () => "prompt", retryBaseDelayMs: 0 });
    const exercises = await service.runTask("monthly_review_exercises", { components: ["listening"] }, { systemPrompt: "review" });
    expect((exercises.output as { lesson: { parts: unknown[] } }).lesson.parts).toHaveLength(1);
    await service.runTask("monthly_review_item_repair", { repairItems: [] }, { systemPrompt: "repair" });
    expect(requests.map((request) => request.outputJsonSchema)).toEqual([monthlyReviewExercisesOutputJsonSchema, monthlyReviewItemRepairOutputJsonSchema]);
  });
});
