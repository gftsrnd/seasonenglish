import { describe, expect, it } from "vitest";
import { assessmentGradingInputSchema } from "../src/schemas.js";

describe("assessment grading input", () => {
  it("carries deterministic objective scores and stable listening group membership into AI grading", () => {
    const parsed = assessmentGradingInputSchema.safeParse({
      kind: "placement",
      objectiveScores: {
        listening: {
          score: 20, maxScore: 20, answered: 15, total: 15,
          groups: [
            { groupKey: "LA", taskKeys: ["LA_0", "LA_1", "LA_2", "LA_4"] },
            { groupKey: "LB", taskKeys: ["LB_0", "LB_1", "LB_2", "LB_3", "LB_Q9", "LB_4"] },
            { groupKey: "LC", taskKeys: ["LC_0", "LC_1", "LC_2", "LC_3", "LC_4"] }
          ]
        },
        reading: { score: 0, maxScore: 40, answered: 0, total: 40, groups: [] }
      },
      writing: [{ prompt: "Write.", answer: "Answer." }],
      speaking: [{ prompt: "Speak.", answer: "Answer.", evidenceType: "transcript" }],
      writingMaxScore: 20,
      speakingMaxScore: 20
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const listeningTaskKeys = parsed.data.objectiveScores.listening.groups.flatMap((group) => group.taskKeys);
    expect(listeningTaskKeys.filter((taskKey) => taskKey === "LB_Q9")).toHaveLength(1);
    expect(parsed.data.objectiveScores.listening.score).toBe(20);
    expect(parsed.data.objectiveScores.listening.maxScore).toBe(20);
  });
});
