import { describe, expect, it } from "vitest";
import { placementDefinition, publicAssessmentDefinition } from "../src/assessment-blueprints.js";
import { assembleBankBlueprint, buildBankManifest, retakeCopyIssues } from "../src/assessment-bank-manifest.js";

const first = { versionId: "first", blueprint: placementDefinition };
const second = { versionId: "second", blueprint: structuredClone(placementDefinition) };
for (const section of second.blueprint.sections)
  for (const group of section.groups) {
    group.title += " second";
    for (const task of group.tasks) task.prompt += " second";
  }

describe("bank attempt manifests", () => {
  it("delivers every selected source, keeps passages and tasks together, and replays the permuted answer values", () => {
    const sources = [first, second];
    const manifest = buildBankManifest(sources, "mixed", () => 0);
    expect(new Set(manifest.groups.map((g) => g.versionId))).toEqual(new Set(["first", "second"]));
    const actual = assembleBankBlueprint(sources, manifest);
    expect(assembleBankBlueprint(sources.toReversed(), JSON.parse(JSON.stringify(manifest)))).toEqual(actual);
    for (const slot of manifest.groups) {
      const original = sources.find((s) => s.versionId === slot.versionId)!.blueprint.sections[slot.section]!.groups[
        slot.group
      ]!;
      const delivered = actual.sections[slot.section]!.groups[slot.group]!;
      expect(delivered.stimulus).toEqual(original.stimulus);
      expect(new Set(delivered.tasks.map((t) => t.prompt))).toEqual(new Set(original.tasks.map((t) => t.prompt)));
      for (const task of delivered.tasks) {
        const before = original.tasks.find((t) => t.key === task.key)!;
        expect(task.options?.find((o) => o.value === task.correctAnswer)?.label).toEqual(
          before.options?.find((o) => o.value === before.correctAnswer)?.label,
        );
      }
    }
    expect(JSON.stringify(publicAssessmentDefinition(actual))).not.toContain("correctAnswer");
    expect(JSON.stringify(manifest)).not.toContain("prompt");
    expect(() => assembleBankBlueprint([first], manifest)).toThrow();
  });
  it("rejects incompatible scoring, invalid source counts, and a cross-scope selection", () => {
    const wrong = structuredClone(second);
    wrong.blueprint.sections[0]!.groups[0]!.tasks[0]!.maxScore++;
    expect(() => buildBankManifest([first, wrong], "mixed")).toThrow();
    expect(() => buildBankManifest([first], "mixed")).toThrow();
    expect(() => buildBankManifest([first, first], "mixed")).toThrow();
    expect(() =>
      buildBankManifest([first, { ...second, blueprint: { ...placementDefinition, kind: "final" } }], "mixed"),
    ).toThrow();
  });
  it("rejects a mix when speaking depends on the paper's Writing Task 1", () => {
    const sources = structuredClone([first, second]);
    sources[0]!.blueprint.sections[3]!.groups[0]!.tasks[0]!.prompt = "Read aloud the email you wrote in Writing Task 1.";
    expect(() => buildBankManifest(sources, "mixed", () => 0.2)).toThrow();
  });
  it.each(["All of the preceding choices", "Both the first and last statements", "All these answers", "A & C"])(
    "preserves option order and the answer for %s", (label) => {
      const sources = structuredClone([first, second]);
      for (const source of sources) {
        const group = source.blueprint.sections[0]!.groups[0]!;
        group.title = "Travel";
        group.instruction = "Choose one response.";
        const task = group.tasks[0]!;
        task.options![3]!.label = label;
        task.correctAnswer = "D";
      }
      const delivered = assembleBankBlueprint(sources, buildBankManifest(sources, "mixed", () => 0));
      const original = sources[0]!.blueprint.sections[0]!.groups[0]!.tasks[0]!;
      const task = delivered.sections[0]!.groups[0]!.tasks.find(t => t.key === original.key)!;
      expect(task.options).toEqual(original.options);
      expect(task.correctAnswer).toBe("D");
    },
  );
  it("preserves single delivery and detects copied original content despite option permutation", () => {
    expect(assembleBankBlueprint([first], buildBankManifest([first], "single"))).toEqual(placementDefinition);
    expect(retakeCopyIssues(placementDefinition, placementDefinition).length).toBeGreaterThan(0);
  });
});
