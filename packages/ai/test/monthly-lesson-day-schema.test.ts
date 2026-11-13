import { describe, expect, it } from "vitest";
import { AI_TASKS } from "../src/registry.js";
import { monthlyLessonDayOutputJsonSchema, monthlyLessonDayOutputSchema } from "../src/schemas.js";

const lesson = { title: "Day 1", parts: [{ code: "objective", content: { text: "Say hello to a client" } }] };

describe("monthly lesson day output schema", () => {
  it("allows the grammar-step objects required by a multi-step review as well as instruction strings", () => {
    const steps = [{ formula: "Subject + V", text: "Use this for routines.", examples: ["We meet every week."] }];
    const fixture = { title:"Weekly review", parts:[{code:"instruction",content:{steps:["Read and answer."]}},{code:"grammar",content:{steps}}] };
    expect(monthlyLessonDayOutputSchema.parse(fixture).lesson.parts[1]?.content.steps).toEqual(steps);
    const schema = monthlyLessonDayOutputJsonSchema.properties.parts.items.properties.content.properties.steps.items.anyOf;
    expect(schema).toEqual(expect.arrayContaining([expect.objectContaining({type:"object",required:["formula","text","examples","exampleMarks"]}),{type:"string"}]));
  });
  it("declares review item variants in the tool schema and keeps them through parsing", () => {
    const itemSchema = monthlyLessonDayOutputJsonSchema.properties.parts.items.properties.content.properties.items.items.anyOf
      .find((entry) => "properties" in entry) as { properties: Record<string, { type: string; minItems?: number; items?: { properties: Record<string, unknown> } }> };
    expect(itemSchema.properties.variants).toMatchObject({ type: "array", minItems: 1, maxItems: 1 });
    expect(Object.keys(itemSchema.properties.variants!.items!.properties)).toEqual(expect.arrayContaining(["prompt", "options", "answer", "explanation"]));
    const variant = { prompt: "Choose: The team ___ the report.", options: ["sends", "send", "sending", "sent to"], answer: "sends", explanation: "Third person singular." };
    const fixture = { title: "Weekly review", parts: [{ code: "word_use", content: { items: [{ id: "w1", prompt: "Choose: She ___ the file.", options: ["checks", "check", "checking", "checked to"], answer: "checks", explanation: "Present simple.", variants: [variant] }] } }] };
    expect((monthlyLessonDayOutputSchema.parse(fixture).lesson.parts[0]?.content.items as Array<{ variants: unknown[] }>)[0]?.variants).toEqual([variant]);
  });
  it("exposes a flat tool schema with no single wrapper object", () => {
    expect(monthlyLessonDayOutputJsonSchema.required).toEqual(["title", "parts"]);
    expect(Object.keys(monthlyLessonDayOutputJsonSchema.properties)).toEqual(["title", "parts"]);
    expect(monthlyLessonDayOutputJsonSchema.properties.parts.type).toBe("array");
    expect(AI_TASKS.get("monthly_lesson_day").outputJsonSchema).toBe(monthlyLessonDayOutputJsonSchema);
  });

  it("maps the flat model output back to { lesson }", () => {
    const parsed = monthlyLessonDayOutputSchema.safeParse(lesson);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ lesson });
  });

  it("decodes a whole flat output returned as a JSON string", () => {
    const parsed = monthlyLessonDayOutputSchema.safeParse(JSON.stringify(lesson));
    expect(parsed.data).toEqual({ lesson });
  });

  it("decodes flat parts and part content returned as JSON strings", () => {
    const parsed = monthlyLessonDayOutputSchema.safeParse({ title: "Day 1", parts: JSON.stringify([{ code: "objective", content: JSON.stringify({ text: "x" }) }]) });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.lesson.parts[0]?.content).toEqual({ text: "x" });
  });

  it("still accepts the older wrapped lesson", () => {
    expect(monthlyLessonDayOutputSchema.safeParse({ lesson }).data).toEqual({ lesson });
  });

  it("decodes a wrapped lesson returned as a JSON string (observed from Claude Haiku tool output)", () => {
    const parsed = monthlyLessonDayOutputSchema.safeParse({ lesson: JSON.stringify(lesson) });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.lesson.parts[0]?.content).toEqual({ text: "Say hello to a client" });
  });

  it("decodes wrapped parts and part content returned as JSON strings", () => {
    const parsed = monthlyLessonDayOutputSchema.safeParse({ lesson: { title: "Day 1", parts: JSON.stringify([{ code: "objective", content: JSON.stringify({ text: "x" }) }]) } });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.lesson.parts[0]?.content).toEqual({ text: "x" });
  });

  it("is idempotent on its own parsed output", () => {
    const once = monthlyLessonDayOutputSchema.parse(lesson);
    expect(monthlyLessonDayOutputSchema.parse(once)).toEqual(once);
  });

  it("still rejects malformed or incomplete output", () => {
    expect(monthlyLessonDayOutputSchema.safeParse({ lesson: "not json" }).success).toBe(false);
    expect(monthlyLessonDayOutputSchema.safeParse({ title: "Day 1", parts: "[{\"code\":\"objective\",\"content\":{]" }).success).toBe(false);
    expect(monthlyLessonDayOutputSchema.safeParse({ title: "Day 1" }).success).toBe(false);
    expect(monthlyLessonDayOutputSchema.safeParse({ title: "Day 1", parts: [{ code: "objective", content: "plain text" }] }).success).toBe(false);
  });
});

describe("monthly lesson parts returned as a broken string (AI quality round 2, 11/11)", () => {
  // Shape of the review exercise call that died with "lesson.parts: expected array, received string"
  // (review-B1-W4, review-B2-W1, review-C1-W4): the contract's quoted prompt copied unescaped.
  const listening = "{\"code\":\"listening\",\"content\":{\"items\":[{\"id\":\"l1\",\"audioText\":\"deadline\",\"prompt\":\"Listen and choose the meaning\",\"options\":[\"thời hạn\",\"cuộc họp\",\"báo cáo\",\"khách hàng\"],\"answer\":\"thời hạn\",\"explanation\":\"\"Deadline\" means the time limit.\"}]}}";
  const reading = "{\"code\":\"reading\",\"content\":{\"passage\":\"Hi team,\nthe report is late.\",\"items\":[],}}";

  it("recovers parts wrapped in fences and prose, with unescaped quotes, raw newlines and trailing commas", () => {
    const parsed = monthlyLessonDayOutputSchema.safeParse({ title: "Weekly review", parts: `Here are the sections:\n\`\`\`json\n[${listening},${reading}]\n\`\`\`` });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data!.lesson.parts.map((part) => part.code)).toEqual(["listening", "reading"]);
    const item = (parsed.data!.lesson.parts[0]!.content.items as Array<Record<string, unknown>>)[0]!;
    expect(item.explanation).toBe("\"Deadline\" means the time limit.");
    expect(parsed.data!.lesson.parts[1]!.content.passage).toBe("Hi team,\nthe report is late.");
  });

  it("keeps every complete part of a cut-off array and decodes an object string that wraps parts", () => {
    const cut = monthlyLessonDayOutputSchema.safeParse({ title: "Weekly review", parts: `[${listening},{"code":"reading","content":{"passage":"Hi te` });
    expect(cut.success, JSON.stringify(cut.error?.issues)).toBe(true);
    expect(cut.data!.lesson.parts.map((part) => part.code)).toEqual(["listening"]);
    const wrapped = monthlyLessonDayOutputSchema.safeParse({ title: "Weekly review", parts: JSON.stringify({ parts: [{ code: "objective", content: { text: "Review the week." } }] }) });
    expect(wrapped.data!.lesson.parts[0]!.code).toBe("objective");
  });

  it("asks for each grammar example's row and marked words (13/11), top-level and per step", () => {
    const content = monthlyLessonDayOutputJsonSchema.properties.parts.items.properties.content;
    const step = content.properties.steps.items.anyOf[1] as { required: string[]; properties: Record<string, { items: { required: string[] } }> };
    expect(step.required).toContain("exampleMarks");
    expect(step.properties.exampleMarks!.items.required).toEqual(["row", "marks"]);
    expect(content.properties.exampleMarks.items.required).toEqual(["row", "marks"]);
    expect(content.description).toContain("exampleMarks has one { row, marks } entry per example");
    const marked = { title: "Day 1", parts: [{ code: "grammar", content: { formula: "have got", examples: ["We have got a room."], exampleMarks: [{ row: 1, marks: ["have got"] }] } }] };
    expect(monthlyLessonDayOutputSchema.parse(marked).lesson.parts[0]?.content.exampleMarks).toEqual([{ row: 1, marks: ["have got"] }]);
  });

  it("still rejects a string with no recoverable part", () => {
    expect(monthlyLessonDayOutputSchema.safeParse({ title: "Weekly review", parts: "Sorry, I cannot do that." }).success).toBe(false);
    expect(monthlyLessonDayOutputSchema.safeParse({ title: "Weekly review", parts: "[{\"code\":\"objective\",\"content\":{]" }).success).toBe(false);
  });
});
