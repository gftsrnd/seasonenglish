import { describe, expect, it } from "vitest";
import { monthlyFinalOpeningHintCount, monthlyFinalProductiveOutputSchema, monthlyFinalReceptiveOutputSchema, monthlyFinalWordClassGuessable, validateMonthlyFinalReadingOutput } from "@e4s/ai";
import type { StoredAssessmentDefinition } from "@e4s/database";
import { assembleMonthlyFinalFromAi, buildMonthlyFinalGenerationInput } from "../src/modules/assessment/monthly-final-builder.js";
import { evaluateMonthlyFinal } from "../src/modules/assessment/monthly-final-checks.js";
import { applyMonthlyFinalUpdate, type MonthlyFinalUpdateBody } from "../src/modules/assessment/monthly-final-routes.js";
import { monthlyFinalVerificationItems, verifyMonthlyFinalAnswers } from "../src/modules/assessment/monthly-final-answer-verification.js";
import { fakeMonthlyFinalAiOutput, frameworkRef, monthlyFinalContract } from "./support/monthly-final-fixture.js";

/**
 * December 2026 re-run §12.5 (published A1 final): R04 had two correct answers
 * (write / explain), R01 and R02 were answerable from word class alone, and the
 * Vietnamese Writing task was garbled with two opening hints.
 */
function generated() {
  const contract = monthlyFinalContract("A1");
  const input = buildMonthlyFinalGenerationInput(contract, frameworkRef);
  const ai = fakeMonthlyFinalAiOutput(input);
  const blueprint = assembleMonthlyFinalFromAi(contract, frameworkRef, monthlyFinalReceptiveOutputSchema.parse(ai.receptive), monthlyFinalProductiveOutputSchema.parse(ai.productive), new Date("2026-12-20T03:00:00Z"));
  return { contract, input, ai, blueprint };
}
const check = (blueprint: StoredAssessmentDefinition, contract: ReturnType<typeof monthlyFinalContract>, code: string) => evaluateMonthlyFinal(blueprint, contract).checks.find((item) => item.code === code)!;

describe("word-class guessable Reading gap items (GEN07)", () => {
  const types = new Map([["lead", "verb"], ["video", "noun"], ["form", "noun"], ["cancel", "verb"], ["begin", "verb"], ["explain", "verb"], ["complete", "verb"], ["write", "verb"]]);
  const classOf = (word: string) => types.get(word);

  it("flags the A1 R01 / R02 items and keeps R04 (all verbs) for the meaning check", () => {
    expect(monthlyFinalWordClassGuessable("Our manager will ____ the new project next month.", ["lead", "video", "form"], 0, classOf)).toBe("verb");
    expect(monthlyFinalWordClassGuessable("Please watch the training ____ before the meeting on Monday.", ["video", "cancel", "begin"], 0, classOf)).toBe("noun");
    expect(monthlyFinalWordClassGuessable("Please ____ your results in the report by Friday.", ["explain", "complete", "write"], 2, classOf)).toBeUndefined();
    // Not a gap item, or an option of unknown class: no decision.
    expect(monthlyFinalWordClassGuessable("Our manager will lead the project. What will he do?", ["lead", "video", "form"], 0, classOf)).toBeUndefined();
    expect(monthlyFinalWordClassGuessable("Our manager will ____ it.", ["lead", "video", "table"], 0, classOf)).toBeUndefined();
  });

  it("sends such an item back through the reading repair loop and fails the assembled GEN07 pre-check", () => {
    const { contract, input, ai, blueprint } = generated();
    const reading = monthlyFinalReceptiveOutputSchema.parse(ai.receptive).reading;
    const question = reading.questions[0]!;
    const target = input.targets.reading.find((term) => term.id === question.termId)!;
    const [first, second] = input.targets.reading.filter((term) => term.id !== target.id);
    const typed = { ...input, targets: { ...input.targets, reading: input.targets.reading.map((term) => term.id === target.id ? { ...term, type: "verb" } : term) } };
    const gap = { ...question, prompt: "Our manager will ____ the new project next month.", options: [target.word, first!.word, second!.word], correctIndex: 0 };
    const issues = validateMonthlyFinalReadingOutput({ reading: { questions: [gap, ...reading.questions.slice(1)] } }, typed);
    expect(issues).toContainEqual(expect.objectContaining({ path: "reading.questions.0.options", message: expect.stringContaining("word class") }));

    const key = blueprint.sections[1]!.groups[0]!.tasks[0]!.key;
    const row = blueprint.monthlyExam!.mapping.find((item) => item.taskKey === key)!;
    const others = contract.coreTerms.filter((term) => term.word !== row.word).slice(0, 2);
    const typedContract = { ...contract, coreTerms: contract.coreTerms.map((term) => term.word === row.word ? { ...term, type: "verb" } : term) };
    const mutated = structuredClone(blueprint);
    const task = mutated.sections[1]!.groups[0]!.tasks[0]!;
    task.prompt = "Our manager will ____ the new project next month.";
    task.options = [{ value: "A", label: row.word }, { value: "B", label: others[0]!.word }, { value: "C", label: others[1]!.word }];
    task.correctAnswer = "A";
    expect(check(mutated, typedContract, "GEN07")).toMatchObject({ status: "fail", detail: expect.stringContaining(`${key}: đoán được nhờ từ loại`) });
  });
});

describe("Writing / Speaking B prompt sanity (GEN12)", () => {
  it("fails two different opening hints and required words outside the taught core list", () => {
    expect(monthlyFinalOpeningHintCount('Bắt đầu bằng câu gợi ý: "Here is a short update."\n- Gợi ý mở đầu: Hi team, here is a short update.')).toBe(2);
    expect(monthlyFinalOpeningHintCount('Bắt đầu bằng câu gợi ý: "Here is a short update."')).toBe(1);
    const { contract, blueprint } = generated();
    expect(check(blueprint, contract, "GEN12").status).toBe("needs_review");
    const twoHints = structuredClone(blueprint);
    const writing = twoHints.sections.find((section) => section.code === "writing")!.groups[0]!.tasks[0]!;
    writing.prompt = writing.prompt.replace("\n\n", '\nBắt đầu bằng câu gợi ý: "Here is a short update."\n- Gợi ý mở đầu: Hi team, here is a short update about our meeting.\n\n');
    expect(check(twoHints, contract, "GEN12")).toMatchObject({ status: "fail", detail: expect.stringContaining("W: có nhiều hơn một câu mở đầu gợi ý") });
    const outside = structuredClone(blueprint);
    const outsideTask = outside.sections.find((section) => section.code === "writing")!.groups[0]!.tasks[0]!;
    outsideTask.prompt = outsideTask.prompt.replace(/(Dùng đủ \d+ từ sau:\s*)([^,\n]+)/u, "$1jump");
    expect(check(outside, contract, "GEN12")).toMatchObject({ status: "fail", detail: expect.stringContaining("không thuộc danh sách từ chính đã học: jump") });
  });
});

describe("independent answer check per form (GEN05 / GEN12)", () => {
  it("sends every objective item without its key plus the W and SB tasks, in one call", async () => {
    const { contract, blueprint } = generated();
    const items = monthlyFinalVerificationItems(blueprint);
    expect(items.filter((item) => item.section === "listening" || item.section === "reading")).toHaveLength(blueprint.sections.filter((section) => section.code === "listening" || section.code === "reading").flatMap((section) => section.groups.flatMap((group) => group.tasks)).length);
    expect(items.map((item) => item.ref)).toEqual(expect.arrayContaining(["W", "SB"]));
    const calls: Array<{ taskId: string; input: { items: Array<Record<string, unknown>> } }> = [];
    const reading = blueprint.sections[1]!.groups[0]!.tasks;
    const r01 = items.find((item) => item.ref === reading[0]!.key)!;
    const r02 = items.find((item) => item.ref === reading[1]!.key)!;
    const runner = { runTask: async (taskId: string, input: { items: Array<Record<string, unknown>> }) => {
      calls.push({ taskId, input });
      return { output: { items: input.items.map((item) => {
        const ref = String(item.ref);
        const options = item.options as string[];
        if (ref === r01.ref) return { ref, correctOptions: [r01.key, options.find((option) => option !== r01.key)], note: "explain also fits" };
        if (ref === r02.ref) return { ref, correctOptions: [options.find((option) => option !== r02.key)], note: "the key is wrong" };
        if (ref === "W") return { ref, correctOptions: [options[1]], note: "jump has no natural use" };
        const key = items.find((candidate) => candidate.ref === ref)?.key;
        return { ref, correctOptions: key ? [key] : [options[0]], note: "ok" };
      }) }, metadata: {} };
    } };
    const findings = await verifyMonthlyFinalAnswers(runner as never, contract.cefr, blueprint);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.taskId).toBe("monthly_answer_verification");
    expect(JSON.stringify(calls[0]!.input)).not.toContain("correctAnswer");
    expect(findings.map((finding) => [finding.code, finding.taskKey])).toEqual([["GEN05", r01.ref], ["GEN05", r02.ref], ["GEN12", "W"]]);
    expect(findings[0]!.message).toContain("cũng đúng");
    expect(findings[1]!.message).toContain(`không chọn đáp án "${r02.key}"`);
    expect(findings[0]!.hint).toMatch(/also correct/u);
    // Re-check after a repair: only the named items; a failed call never fails generation.
    calls.length = 0;
    await verifyMonthlyFinalAnswers(runner as never, contract.cefr, blueprint, new Set([r01.ref]));
    expect(calls[0]!.input.items.map((item) => item.ref)).toEqual([r01.ref]);
    const unavailable = { runTask: async () => { throw new Error("down"); } } as never;
    expect(await verifyMonthlyFinalAnswers(unavailable, contract.cefr, blueprint)).toEqual([]);
    await expect(verifyMonthlyFinalAnswers(unavailable, contract.cefr, blueprint, new Set([r01.ref]))).rejects.toThrow("down");
    await expect(verifyMonthlyFinalAnswers(runner as never, contract.cefr, blueprint, new Set(["missing"]))).rejects.toThrow("Disputed item is missing");
    const incomplete = { runTask: async () => ({ output: { items: [] }, metadata: {} }) } as never;
    await expect(verifyMonthlyFinalAnswers(incomplete, contract.cefr, blueprint, new Set([r01.ref]))).rejects.toThrow("Missing independent recheck");
    const duplicate = { runTask: async () => ({ output: { items: [r01, r01].map(item => ({ ref: item.ref, correctOptions: [item.key] })) }, metadata: {} }) } as never;
    await expect(verifyMonthlyFinalAnswers(duplicate, contract.cefr, blueprint, new Set([r01.ref]))).rejects.toThrow("Missing independent recheck");
  });
});

describe("manual confirmations record who ticked them", () => {
  it("logs the actor and time per newly ticked code and drops unticked codes", () => {
    const { blueprint } = generated();
    const body = (codes: MonthlyFinalUpdateBody["review"]): MonthlyFinalUpdateBody => ({ title: blueprint.title, sections: structuredClone(blueprint.sections) as unknown as MonthlyFinalUpdateBody["sections"], review: codes });
    const first = applyMonthlyFinalUpdate(blueprint, body({ manualConfirmations: ["GEN05", "GEN07"] }), "operator-1", new Date("2026-12-21T01:00:00Z"));
    expect(first.monthlyExam!.manualConfirmationLog).toEqual([
      { code: "GEN05", confirmedBy: "operator-1", confirmedAt: "2026-12-21T01:00:00.000Z" },
      { code: "GEN07", confirmedBy: "operator-1", confirmedAt: "2026-12-21T01:00:00.000Z" }
    ]);
    const second = applyMonthlyFinalUpdate(first, body({ manualConfirmations: ["GEN07", "GEN12"] }), "operator-2", new Date("2026-12-21T02:00:00Z"));
    expect(second.monthlyExam!.manualConfirmationLog).toEqual([
      { code: "GEN07", confirmedBy: "operator-1", confirmedAt: "2026-12-21T01:00:00.000Z" },
      { code: "GEN12", confirmedBy: "operator-2", confirmedAt: "2026-12-21T02:00:00.000Z" }
    ]);
  });
});
