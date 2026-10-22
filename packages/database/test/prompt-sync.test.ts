import { describe, expect, it } from "vitest";
import { planCanonicalPromptPublication } from "../src/prompt-sync.js";

describe("canonical prompt publication", () => {
  it("publishes a new version when the latest active prompt is legacy or contradictory", () => {
    expect(planCanonicalPromptPublication([
      { version: 1, status: "active", content: "old" },
      { version: 7, status: "active", content: "legacy with conflicting schema" },
      { version: 8, status: "draft", content: "draft" }
    ], "canonical")).toEqual({
      shouldPublish: true,
      nextVersion: 9
    });
  });

  it("does not create a new version when the latest active prompt is canonical", () => {
    expect(planCanonicalPromptPublication([
      { version: 1, status: "active", content: "old" },
      { version: 7, status: "active", content: "canonical" }
    ], "canonical")).toEqual({
      shouldPublish: false,
      nextVersion: 8
    });
  });
});
