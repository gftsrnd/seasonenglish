import { describe, expect, it } from "vitest";
import { weeklyLessonsOutputSchema } from "../src/schemas.js";

const legacyCodes = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "speaking"
];

const enrichedCodes = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
];

function lesson(codes: string[]) {
  return {
    dayNumber: 1,
    title: "Lesson",
    durationMinutes: 10,
    parts: codes.map((code) => ({ code, title: code, content: { text: "Concrete material" } }))
  };
}

function output(codes: string[]) {
  return { lessons: Array.from({ length: 5 }, (_, index) => ({ ...lesson(codes), dayNumber: index + 1 })) };
}

describe("weekly lesson output contract", () => {
  it("accepts both the active nine-part prompt and the enriched eleven-part lesson shape", () => {
    expect(weeklyLessonsOutputSchema.safeParse(output(legacyCodes)).success).toBe(true);
    expect(weeklyLessonsOutputSchema.safeParse(output(enrichedCodes)).success).toBe(true);
  });

  it("rejects a partially enriched lesson instead of silently dropping a required word part", () => {
    expect(weeklyLessonsOutputSchema.safeParse(output([...legacyCodes.slice(0, -1), "word_class", "speaking"])).success).toBe(false);
  });
});
