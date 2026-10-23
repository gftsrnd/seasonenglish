import { describe, expect, it } from "vitest";
import { placementDefinition } from "../src/assessment-blueprints.js";

const section = (code: string) => {
  const value = placementDefinition.sections.find((candidate) => candidate.code === code);
  if (!value) throw new Error(`Missing ${code} section`);
  return value;
};

describe("placement assessment blueprint", () => {
  it("matches the approved 75-minute section schedule", () => {
    expect(placementDefinition.totalMinutes).toBe(75);
    expect(placementDefinition.sections.map(({ code, durationMinutes }) => [code, durationMinutes])).toEqual([
      ["listening", 15],
      ["reading", 25],
      ["writing", 20],
      ["speaking", 15]
    ]);
  });

  it("keeps the approved objective structure, weights, and answer keys", () => {
    const listening = section("listening");
    const listeningTasks = listening.groups.flatMap((group) => group.tasks);
    expect(listening.groups).toHaveLength(3);
    expect(listening.groups.every((group) => group.maxPlays === 2)).toBe(true);
    expect(listeningTasks).toHaveLength(15);
    expect(listeningTasks.map((task) => task.maxScore)).toEqual([
      ...Array(10).fill(1),
      ...Array(5).fill(2)
    ]);
    expect(listeningTasks.map((task) => task.correctAnswer)).toEqual([
      "B", "B", "C", "B", "C", "B", "B", "A", "B", "C", "C", "B", "A", "C", "B"
    ]);

    const readingTasks = section("reading").groups.flatMap((group) => group.tasks);
    expect(readingTasks).toHaveLength(40);
    expect(readingTasks.every((task) => task.maxScore === 1)).toBe(true);
    expect(readingTasks.map((task) => task.correctAnswer)).toEqual([
      "C", "C", "A", "D", "A", "C", "B", "D", "B", "B",
      "A", "B", "B", "D", "C", "B", "B", "A", "A", "D",
      "B", "A", "D", "C", "D", "C", "C", "D", "B", "A",
      "C", "B", "D", "D", "A", "A", "A", "C", "D", "C"
    ]);
  });

  it("packages a dedicated multi-speaker recording for every listening part", () => {
    const listening = section("listening");
    expect(listening.groups.map((group) => group.stimulus?.audioSrc)).toEqual([
      "/media/audio/placement-listening-LA.wav",
      "/media/audio/placement-listening-LB.wav",
      "/media/audio/placement-listening-LC.wav"
    ]);
    expect(listening.groups.every((group) => new Set(group.stimulus?.lines?.map((line) => line.speaker)).size >= 2)).toBe(true);
  });

  it("keeps the approved productive task weights and word ranges", () => {
    const writingTasks = section("writing").groups.flatMap((group) => group.tasks);
    expect(writingTasks.map(({ key, maxScore, minWords, maxWords }) => ({ key, maxScore, minWords, maxWords }))).toEqual([
      { key: "W1", maxScore: 7, minWords: 50, maxWords: 80 },
      { key: "W2", maxScore: 13, minWords: 120, maxWords: 150 }
    ]);
    expect(writingTasks.find((task) => task.key === "W2")?.prompt).toBe(
      "Write a formal email (120–150 words): explain one risk of outdated procedures and propose how the team can find the latest version."
    );

    const speakingTasks = section("speaking").groups.flatMap((group) => group.tasks);
    expect(speakingTasks.map(({ key, maxScore }) => ({ key, maxScore }))).toEqual([
      { key: "S1", maxScore: 5 },
      { key: "S2", maxScore: 5 },
      { key: "S3", maxScore: 5 },
      { key: "S4", maxScore: 5 }
    ]);
  });

  it("keeps the approved S3 roleplay limits and honest fallback policy", () => {
    const roleplay = section("speaking").groups.flatMap((group) => group.tasks)
      .find((task) => task.key === "S3");

    expect(roleplay).toMatchObject({
      interaction: {
        mode: "roleplay",
        maxLearnerTurns: 4,
        durationSeconds: 240,
        endConditions: ["time_limit", "turn_limit", "customer_accepted"],
        fallback: "one_way_manual_review"
      }
    });
    expect(roleplay?.interaction?.openingMessage).toMatch(/extremely frustrated/i);
  });
});
