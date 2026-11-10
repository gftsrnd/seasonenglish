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
    expect(schema).toEqual(expect.arrayContaining([expect.objectContaining({type:"object",required:["formula","text","examples"]}),{type:"string"}]));
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
