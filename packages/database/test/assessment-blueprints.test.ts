import { describe, expect, it } from "vitest";
import { levelUpDefinition, placementDefinition } from "../src/assessment-blueprints.js";

const section = (code: string) => {
  const value = placementDefinition.sections.find((candidate) => candidate.code === code);
  if (!value) throw new Error(`Missing ${code} section`);
  return value;
};

describe("placement assessment blueprint", () => {
  it("uses definition version 2 for the corrected Listening 2 mapping", () => {
    expect(placementDefinition.version).toBe(2);
  });

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
      "B", "B", "C", "C", "B", "B", "B", "A", "B", "C", "C", "B", "A", "C", "B"
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

  it("preserves the approved listening transcript and question wording", () => {
    const listening = section("listening");
    const partB = listening.groups.find((group) => group.key === "LB");
    const partC = listening.groups.find((group) => group.key === "LC");

    expect(partB?.stimulus?.lines).toHaveLength(9);
    expect(partB?.stimulus?.lines?.map((line) => `${line.speaker}: ${line.text}`).join("\n")).toContain(
      "Employee: The customer is asking for a refund, but the situation is a little unusual. I'm not sure which procedure applies."
    );
    expect(partB?.stimulus?.lines?.map((line) => `${line.speaker}: ${line.text}`).join("\n")).toContain(
      "Employee: Okay. I'll check those records first."
    );
    expect(partC?.stimulus?.lines).toHaveLength(8);

    const firstPartBQuestion = partB?.tasks[0];
    expect(firstPartBQuestion?.prompt).toBe("What difficulty is the employee experiencing while preparing the customer report?");
    expect(firstPartBQuestion?.options?.map((option) => option.label)).toEqual([
      "She cannot access the company website.",
      "She is unsure which procedure to follow for an unusual refund case.",
      "She cannot understand the language used in the customer's message.",
      "She cannot contact her supervisor."
    ]);
  });

  it("moves the former Listening 1 question 4 to global question 6 in Listening 2 exactly once", () => {
    const listening = section("listening");
    const taskEntries = listening.groups.flatMap((group) => group.tasks.map((task) => ({ groupKey: group.key, task })));
    const moved = taskEntries.filter(({ task }) => task.prompt === "Who should the listener contact?");

    expect(listening.groups.map((group) => group.tasks.length)).toEqual([4, 6, 5]);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ groupKey: "LB", task: { key: "LB_Q6", maxScore: 1, correctAnswer: "B" } });
    expect(taskEntries[5]).toMatchObject({ groupKey: "LB", task: { key: "LB_Q6" } });
    expect(taskEntries).toHaveLength(15);
    expect(new Set(taskEntries.map(({ task }) => task.key)).size).toBe(15);
    expect(taskEntries.reduce((sum, { task }) => sum + task.maxScore, 0)).toBe(20);

    const partA = listening.groups.find((group) => group.key === "LA");
    const partB = listening.groups.find((group) => group.key === "LB");
    expect(partA?.stimulus?.lines?.map((line) => line.text).join(" ")).not.toContain("speak to Sarah");
    expect(partB?.stimulus?.lines?.map((line) => line.text).join(" ")).toContain("speak to Sarah");
  });

  it("keeps the separate level-up listening section at five equally weighted questions", () => {
    const listening = levelUpDefinition.sections.find((candidate) => candidate.code === "listening")!;
    const tasks = listening.groups.flatMap((group) => group.tasks);
    expect(tasks).toHaveLength(5);
    expect(tasks.reduce((sum, task) => sum + task.maxScore, 0)).toBe(listening.maxScore);
  });

  it("keeps the approved reading passages and non-committal refund answer", () => {
    const readingTasks = section("reading").groups.flatMap((group) => group.tasks);
    const task = (number: number) => readingTasks.find((item) => item.key === `R${number}`);

    expect(task(16)?.prompt).toContain("Tomas ordered a laptop online, but it arrived with a cracked screen.");
    expect(task(20)?.prompt).toContain("Each time, a different agent asked her to repeat the whole story from the beginning.");
    expect(task(22)?.prompt).toContain("I trust this will finally be resolved");
    expect(task(26)?.prompt).toContain("the damage to her trust in the company had already been done");
    expect(task(29)?.prompt).toContain("many customers report receiving faster replies that still fail to solve their actual problem");
    expect(task(33)?.prompt).toContain("the promise had never been realistic given current staffing levels");
    expect(task(36)?.prompt).toContain("the customer's subjective sense of having been heard");
    expect(task(37)?.prompt).toBe("Which reply communicates the next step without promising or denying a refund?");
    expect(task(37)?.options?.map((option) => option.label)).toEqual([
      "We will review your case and provide an update by Friday. The outcome has not yet been determined.",
      "You will receive a full refund by Friday.",
      "We cannot offer a refund under any circumstances.",
      "There is no possibility of compensation for your case."
    ]);
  });

  it("keeps the approved productive task weights and word ranges", () => {
    const writingTasks = section("writing").groups.flatMap((group) => group.tasks);
    expect(writingTasks.map(({ key, maxScore, minWords, maxWords }) => ({ key, maxScore, minWords, maxWords }))).toEqual([
      { key: "W1", maxScore: 7, minWords: 50, maxWords: 80 },
      { key: "W2", maxScore: 13, minWords: 120, maxWords: 150 }
    ]);
    expect(writingTasks.find((task) => task.key === "W2")?.prompt).toBe(
      "Write a formal email (120–150 words): explain one serious problem this confusion could cause (for example, giving a customer incorrect refund information) and propose one solution that helps the team find and use the latest documentation."
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
