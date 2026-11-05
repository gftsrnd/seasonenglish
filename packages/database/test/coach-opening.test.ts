import { describe, expect, it } from "vitest";
import { coachOpeningQuestion } from "../src/repositories.js";

describe("Season opening prompt", () => {
  it("keeps the same topic while choosing a different next opening prompt", () => {
    const topic = "Handling Client Feedback Meetings";
    const first = coachOpeningQuestion("Hải Yến", topic);
    const next = coachOpeningQuestion("Hải Yến", topic, first);

    expect(first).toContain(topic);
    expect(next).toContain(topic);
    expect(next).not.toBe(first);
  });

  it("continues alternating prompts after a chat is restarted repeatedly", () => {
    const topic = "Rescheduling Meetings";
    const first = coachOpeningQuestion("Yen", topic);
    const second = coachOpeningQuestion("Yen", topic, first);
    const third = coachOpeningQuestion("Yen", topic, second);

    expect(second).not.toBe(first);
    expect(third).toBe(first);
  });
});
