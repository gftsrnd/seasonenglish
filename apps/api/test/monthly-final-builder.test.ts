import { describe, expect, it } from "vitest";
import type { CefrLevel, MonthlyFinalGenCode } from "@e4s/contracts";
import {
  AI_TASKS, monthlyFinalListeningOutputJsonSchema, monthlyFinalListeningOutputSchema, monthlyFinalProductiveOutputJsonSchema, monthlyFinalProductiveOutputSchema,
  monthlyFinalReadingOutputJsonSchema, monthlyFinalReadingOutputSchema, monthlyFinalReceptiveOutputSchema,
  validateMonthlyFinalListeningOutput, validateMonthlyFinalProductiveOutput, validateMonthlyFinalReadingOutput, validateMonthlyFinalReceptiveOutput
} from "@e4s/ai";
import { publicAssessmentDefinition, type StoredAssessmentDefinition } from "@e4s/database";
import {
  MonthlyFinalInputError, allocateMonthlyFinalTerms, assembleMonthlyFinalFromAi, buildManualMonthlyFinalDraft,
  buildMonthlyFinalGenerationInput, monthlyFinalInputErrors, rebalanceAnswerPositions, withEvaluation
} from "../src/modules/assessment/monthly-final-builder.js";
import { MONTHLY_FINAL_MANUAL_RULES, evaluateMonthlyFinal, monthlyFinalReadingItemProblems } from "../src/modules/assessment/monthly-final-checks.js";
import { applyMonthlyFinalUpdate, monthlyFinalWindowOpen, type MonthlyFinalUpdateBody } from "../src/modules/assessment/monthly-final-routes.js";
import { monthlyFinalAllocation } from "../src/modules/assessment/monthly-final-spec.js";
import { fakeMonthlyFinalAiOutput, frameworkRef, monthlyFinalContract } from "./support/monthly-final-fixture.js";

function generated(cefr: CefrLevel = "B1") {
  const contract = monthlyFinalContract(cefr);
  const input = buildMonthlyFinalGenerationInput(contract, frameworkRef);
  const ai = fakeMonthlyFinalAiOutput(input);
  const blueprint = assembleMonthlyFinalFromAi(contract, frameworkRef, monthlyFinalReceptiveOutputSchema.parse(ai.receptive), monthlyFinalProductiveOutputSchema.parse(ai.productive), new Date("2026-11-20T03:00:00Z"));
  return { contract, input, ai, blueprint };
}

function check(blueprint: StoredAssessmentDefinition, code: MonthlyFinalGenCode) {
  return blueprint.monthlyExam!.checks.find((item) => item.code === code)!;
}

function mutate(blueprint: StoredAssessmentDefinition, change: (draft: StoredAssessmentDefinition) => void): StoredAssessmentDefinition {
  const copy = structuredClone(blueprint);
  change(copy);
  return copy;
}

function updateBody(blueprint: StoredAssessmentDefinition, review: MonthlyFinalUpdateBody["review"] = {}): MonthlyFinalUpdateBody {
  return { title: blueprint.title, sections: structuredClone(blueprint.sections) as unknown as MonthlyFinalUpdateBody["sections"], review };
}

describe("monthly final v2.0 allocation", () => {
  it("matches the L/R table of section 2 and VH-R61 for every level", () => {
    const table: Record<string, Record<number, [number, number]>> = {
      A1: { 45: [16, 22], 48: [17, 24], 51: [18, 26], 54: [20, 27] },
      A2: { 45: [15, 22], 48: [17, 23], 51: [18, 25], 54: [19, 27] },
      B1: { 45: [15, 20], 48: [16, 22], 51: [17, 24], 54: [18, 26] }
    };
    for (const [level, rows] of Object.entries(table)) for (const [n, [l, r]] of Object.entries(rows)) {
      const allocation = monthlyFinalAllocation(Number(n), level as CefrLevel);
      expect([allocation.l, allocation.r]).toEqual([l, r]);
      expect(allocation.l + allocation.r + allocation.w + allocation.s).toBe(Number(n));
    }
    expect(monthlyFinalAllocation(48, "C1")).toEqual({ n: 48, l: 16, r: 22, w: 6, s: 4 });
    expect(monthlyFinalAllocation(48, "A2")).toMatchObject({ w: 5, s: 3 });
  });

  it("gives every core term exactly one primary position and never assesses expanded terms", () => {
    const contract = monthlyFinalContract("A2");
    const allocated = allocateMonthlyFinalTerms(contract);
    const ids = [...allocated.listening, ...allocated.reading, ...allocated.writing, ...allocated.speaking].map((term) => term.id);
    expect(ids).toEqual(contract.coreTerms.map((term) => term.id));
    const input = buildMonthlyFinalGenerationInput(contract, frameworkRef);
    expect(input.allocation).toEqual({ n: 48, l: 17, r: 23, w: 5, s: 3 });
    expect(JSON.stringify(input.targets)).not.toContain("support-");
    expect(input.pronunciation.map((item) => item.taughtExamples.length)).toEqual([9, 9, 9, 9]);
    expect(input.grammar.map((topic) => topic.taughtSteps.length)).toEqual([3, 3]);
  });

  it("returns INPUT_ERROR with the missing fields instead of inventing targets", () => {
    const contract = monthlyFinalContract("B1");
    const broken = { ...contract, grammarTopics: contract.grammarTopics.slice(0, 1), sounds: contract.sounds.slice(0, 3) };
    expect(monthlyFinalInputErrors(broken)).toEqual(expect.arrayContaining(["grammarTopics (GA, GB)", "sounds (P1–P4)"]));
    expect(() => buildMonthlyFinalGenerationInput(broken, frameworkRef)).toThrow(MonthlyFinalInputError);
    const noMeaning = { ...contract, coreTerms: contract.coreTerms.map((term, index) => index === 4 ? { ...term, meaning: "" } : term) };
    expect(monthlyFinalInputErrors(noMeaning)).toEqual(["coreTerms[V05].meaning"]);
  });

  it("excludes taught examples whose recorded IPA lacks the target sound", () => {
    const contract = monthlyFinalContract("A1");
    const sound = contract.sounds[0]!;
    sound.ipa = "/ɜː/";
    sound.examples[0] = { ...sound.examples[0]!, word: "learn", ipa: "/lɜːn/" };
    sound.examples[1] = { ...sound.examples[1]!, word: "work", ipa: "/wɜːk/" };
    sound.examples[2] = { ...sound.examples[2]!, word: "project", ipa: "/ˈprɒdʒekt/" };
    const input = buildMonthlyFinalGenerationInput(contract, frameworkRef);
    expect(input.pronunciation[0]!.taughtExamples.map(example => example.word)).toEqual(["learn", "work"]);
  });
});

describe("monthly final v2.0 assembly and GEN checks", () => {
  it("builds the 30-minute, 4 × 25-point form the level editor and learner runtime share", () => {
    const { blueprint, contract } = generated("B1");
    expect(blueprint).toMatchObject({ kind: "final", key: "monthly-final-2026-11-b1", totalMinutes: 30, totalScore: 100 });
    expect(blueprint.sections.map((section) => [section.code, section.durationMinutes, section.maxScore])).toEqual([["listening", 8, 25], ["reading", 8, 25], ["writing", 8, 25], ["speaking", 6, 25]]);
    const listening = blueprint.sections[0]!;
    expect(listening.groups.map((group) => [group.key, group.maxPlays, group.stimulus?.type])).toEqual([["LA", 2, "audio_script"], ["LB", 2, "audio_script"]]);
    expect(listening.groups.flatMap((group) => group.tasks.map((task) => task.key))).toEqual(Array.from({ length: 16 }, (_, index) => `L${String(index + 1).padStart(2, "0")}`));
    expect(blueprint.sections[1]!.groups[0]!.tasks).toHaveLength(22);
    expect(blueprint.sections[3]!.groups.map((group) => [group.key, group.tasks[0]!.maxScore])).toEqual([["SA", 8], ["SB", 17]]);
    expect(blueprint.monthlyExam).toMatchObject({ framework: { id: frameworkRef.id, version: 3, scopeHash: "monthly-abc123", month: "2026-11", cefr: "B1" }, audio: { status: "SCRIPT_ONLY" }, instructionLanguage: "en" });
    expect(blueprint.monthlyExam!.mapping).toHaveLength(contract.coreTerms.length);
    expect(blueprint.monthlyExam!.pronunciation.flatMap((target) => target.positions)).toHaveLength(8);
  });

  it.each(["A1", "A2", "B1", "B2", "C1"] as const)("%s passes every program-checkable GEN rule and waits for human review and audio", (cefr) => {
    const { blueprint } = generated(cefr);
    const failing = blueprint.monthlyExam!.checks.filter((item) => item.status === "fail");
    expect(failing, `${cefr}: ${JSON.stringify(failing)}`).toEqual([]);
    for (const code of ["GEN01", "GEN02", "GEN03", "GEN11", "GEN13", "GEN14", "GEN15", "GEN17", "GEN18", "GEN19", "GEN22", "GEN23"] as const) expect(check(blueprint, code).status, `${cefr} ${code}`).toBe("pass");
    expect(check(blueprint, "GEN20").status).toBe("needs_review");
    for (const code of MONTHLY_FINAL_MANUAL_RULES) expect(check(blueprint, code)).toMatchObject({ mode: "manual", status: "needs_review" });
    expect(blueprint.monthlyExam!.status).toBe("NEEDS_REVIEW");
  });

  it("becomes READY only after audio is reviewed and every human-judgement rule is confirmed", () => {
    const { blueprint, contract } = generated("B1");
    const withAudio = mutate(blueprint, (draft) => draft.sections[0]!.groups.forEach((group, index) => { group.stimulus = { ...group.stimulus!, audioSrc: `/api/v1/files/content-media/read?artifactKey=content-media/a${index}.mp3` }; }));
    const ticked = applyMonthlyFinalUpdate(blueprint, updateBody(withAudio, { audioReviewed: true, manualConfirmations: [...MONTHLY_FINAL_MANUAL_RULES] }), "operator-1", new Date("2026-11-21T00:00:00Z"));
    // Uploading audio in the same save cannot count as having listened to it.
    expect(withEvaluation(ticked, contract).monthlyExam!.audio.status).toBe("SCRIPT_ONLY");
    expect(withEvaluation(ticked, contract).monthlyExam!.status).toBe("NEEDS_REVIEW");
    const saved = withEvaluation(ticked, contract);
    const reviewed = withEvaluation(applyMonthlyFinalUpdate(saved, updateBody(saved, { audioReviewed: true, manualConfirmations: [...MONTHLY_FINAL_MANUAL_RULES] }), "operator-1", new Date("2026-11-21T01:00:00Z")), contract);
    expect(reviewed.monthlyExam!.audio).toMatchObject({ status: "REVIEWED", reviewedBy: "operator-1" });
    expect(reviewed.monthlyExam!.status).toBe("READY");
    // Editing the script afterwards drops the audio tick again.
    const edited = updateBody(reviewed, { audioReviewed: true, manualConfirmations: [...MONTHLY_FINAL_MANUAL_RULES] });
    const script = edited.sections[0]!.groups[0]!.stimulus as { lines: Array<{ speaker: string; text: string }> };
    script.lines[0]!.text = `${script.lines[0]!.text} One more sentence.`;
    const afterEdit = withEvaluation(applyMonthlyFinalUpdate(reviewed, edited, "operator-1", new Date()), contract);
    expect(afterEdit.monthlyExam!.audio.status).toBe("SCRIPT_ONLY");
    expect(afterEdit.monthlyExam!.status).toBe("NEEDS_REVIEW");
  });
  it("blocks reordered pronunciation word lists and A1 passages above eighteen words",()=>{
    const {blueprint,contract}=generated("A1");
    const evaluate=(draft:StoredAssessmentDefinition)=>({failed:evaluateMonthlyFinal(draft,contract).checks.filter(item=>item.status==="fail").map(item=>item.code)});
    expect(evaluate(mutate(blueprint,draft=>{draft.sections[3]!.groups[0]!.tasks[0]!.prompt=draft.monthlyExam!.pronunciation.flatMap(target=>target.positions.map(position=>position.word)).reverse().join(", ");})).failed).toContain("GEN11");
    expect(evaluate(mutate(blueprint,draft=>{draft.sections[3]!.groups[0]!.tasks[0]!.prompt="Our team will read the report and check the plan before we meet the client again on Monday morning.";})).failed).toContain("GEN22");
  });
  it("checks actual Writing model length and required A1 starter support at the final gate",()=>{
    const {blueprint,contract}=generated("A1");
    const tooLong=mutate(blueprint,draft=>{draft.monthlyExam!.grader.writingSample+=" Please contact me tomorrow for further details about the client and the next meeting.";});
    expect(evaluateMonthlyFinal(tooLong,contract).checks.find(check=>check.code==="GEN22")?.status).toBe("fail");
    const noStarter=mutate(blueprint,draft=>{draft.sections[2]!.groups[0]!.tasks[0]!.prompt="Write a message to Anna.";});
    expect(evaluateMonthlyFinal(noStarter,contract).checks.find(check=>check.code==="GEN22")?.status).toBe("fail");
  });

  it("keeps key, script, samples and grammar names out of the learner package (GEN18, GEN23)", () => {
    const { blueprint, contract } = generated("B1");
    const learner = JSON.stringify(publicAssessmentDefinition(blueprint));
    expect(learner).not.toContain("correctAnswer");
    expect(learner).not.toContain("monthlyExam");
    expect(learner).not.toContain("Could you send me the numbers today?");
    expect(learner).not.toContain(blueprint.monthlyExam!.grader.writingSample);
    for (const topic of contract.grammarTopics) {
      expect(learner).not.toContain(topic.title);
      for (const step of topic.steps) expect(learner).not.toContain(step.formula);
    }
    const leakedFormula = mutate(blueprint, (draft) => { draft.sections[2]!.groups[0]!.tasks[0]!.prompt += "\nUse the pattern If + present simple, will + V."; });
    expect(evaluateMonthlyFinal(leakedFormula, contract).checks.find((item) => item.code === "GEN23")!.status).toBe("fail");
    const leakedScript = mutate(blueprint, (draft) => { draft.sections[1]!.groups[0]!.tasks[0]!.prompt = "If you call me this afternoon, I will answer at once."; });
    expect(evaluateMonthlyFinal(leakedScript, contract).checks.find((item) => item.code === "GEN18")!.status).toBe("fail");
  });

  it("fails the program-checkable rules when the form drifts from the approved plan", () => {
    const { blueprint, contract } = generated("B1");
    const evaluate = (draft: StoredAssessmentDefinition) => {
      const result = evaluateMonthlyFinal(draft, contract);
      return { status: result.status, failed: result.checks.filter((item) => item.status === "fail").map((item) => item.code) };
    };
    expect(evaluate(mutate(blueprint, (draft) => { draft.monthlyExam!.mapping[0]!.termId = "support-0-0"; }))).toMatchObject({ status: "DRAFT", failed: expect.arrayContaining(["GEN01"]) });
    expect(evaluate(mutate(blueprint, (draft) => { draft.sections[1]!.groups[0]!.tasks.pop(); })).failed).toEqual(expect.arrayContaining(["GEN02", "GEN03", "GEN13"]));
    expect(evaluate(mutate(blueprint, (draft) => { draft.monthlyExam!.pronunciation[0]!.positions[0]!.word = "tablet"; })).failed).toContain("GEN11");
    expect(evaluate(mutate(blueprint, (draft) => { draft.sections[3]!.groups[0]!.tasks[0]!.prompt = "Please read this short text."; })).failed).toContain("GEN11");
    expect(evaluate(mutate(blueprint, (draft) => { draft.sections[0]!.durationMinutes = 10; })).failed).toContain("GEN13");
    expect(evaluate(mutate(blueprint, (draft) => { draft.sections[1]!.groups[0]!.tasks.forEach((task) => { task.correctAnswer = "A"; }); })).failed).toContain("GEN17");
    expect(evaluate(mutate(blueprint, (draft) => { delete draft.sections[1]!.groups[0]!.tasks[3]!.correctAnswer; })).failed).toContain("GEN14");
    expect(evaluate(mutate(blueprint, (draft) => { draft.monthlyExam!.grader.items.L01!.evidence = "Not in the script at all."; })).failed).toEqual(expect.arrayContaining(["GEN15", "GEN06"]));
    expect(evaluate(mutate(blueprint, (draft) => { draft.sections[0]!.instructions = ["Nghe hai tin nhắn và chọn đáp án."]; })).failed).toContain("GEN22");
    expect(evaluate(mutate(blueprint, (draft) => { draft.sections[1]!.groups[0]!.tasks[0]!.hint = "Think about money."; })).failed).toContain("GEN19");
    expect(evaluate(mutate(blueprint, (draft) => { draft.monthlyExam!.grader.listening[0]!.gaSentence = "Missing sentence."; })).failed).toContain("GEN21");
  });

  it("requires Vietnamese instructions at A1–A2 and English from B1 (GEN22)", () => {
    const a1 = generated("A1").blueprint;
    expect(a1.monthlyExam!.instructionLanguage).toBe("vi");
    expect(a1.sections[0]!.title).toBe("Nghe");
    expect(a1.sections[2]!.groups[0]!.tasks[0]).toMatchObject({ minWords: 35, maxWords: 45 });
    const b2 = generated("B2").blueprint;
    expect(b2.sections[0]!.title).toBe("Listening");
    expect(b2.sections[2]!.groups[0]!.tasks[0]).toMatchObject({ minWords: 100, maxWords: 120 });
  });

  it("checks the Writing and Speaking B prompts against the instruction language (GEN22, WP6)", () => {
    const failed = (blueprint: StoredAssessmentDefinition, contract: ReturnType<typeof monthlyFinalContract>) => evaluateMonthlyFinal(blueprint, contract).checks.find((item) => item.code === "GEN22")!;
    const b1 = generated("B1");
    expect(failed(b1.blueprint, b1.contract).status).toBe("pass");
    const viTask = mutate(b1.blueprint, (draft) => { draft.sections[2]!.groups[0]!.tasks[0]!.prompt = draft.sections[2]!.groups[0]!.tasks[0]!.prompt.replace("Write a short message to your manager, Anna.", "Viết tin nhắn ngắn cho quản lý của bạn, Anna."); });
    expect(failed(viTask, b1.contract)).toMatchObject({ status: "fail", detail: expect.stringContaining("Writing: B1–C1") });
    const viFacts = mutate(b1.blueprint, (draft) => { draft.sections[3]!.groups[1]!.tasks[0]!.prompt = draft.sections[3]!.groups[1]!.tasks[0]!.prompt.replace("The client cannot join at 3 p.m.", "Khách hàng không họp được lúc 3 giờ."); });
    expect(failed(viFacts, b1.contract)).toMatchObject({ status: "fail", detail: expect.stringContaining("Speaking B: B1–C1") });
    // A capitalised Vietnamese name or one loanword is not Vietnamese instruction text.
    const name = mutate(b1.blueprint, (draft) => { draft.sections[2]!.groups[0]!.tasks[0]!.prompt = draft.sections[2]!.groups[0]!.tasks[0]!.prompt.replace("Anna.", "Nguyễn Hùng at the café."); });
    expect(failed(name, b1.contract).status).toBe("pass");
    const c1 = generated("C1");
    expect(failed(c1.blueprint, c1.contract).status).toBe("pass");
    for (const cefr of ["A1", "A2"] as const) {
      const vi = generated(cefr);
      expect(failed(vi.blueprint, vi.contract).status, cefr).toBe("pass");
      const english = mutate(vi.blueprint, (draft) => { draft.sections[3]!.groups[1]!.tasks[0]!.prompt = "Leave a voice note for your manager.\n\nDữ kiện: The slides are ready. The client cannot join at 3 p.m.\n\nTin nhắn thoại cần:\n- Say the slides are ready.\n\nDùng đủ 3 từ sau: a, b, c."; });
      const detail = failed(english, vi.contract);
      expect(detail.status, cefr).toBe("fail");
      expect(detail.detail).toContain("Speaking B: A1–A2: lời đề phải có tiếng Việt");
      expect(detail.detail).toContain("Speaking B: A1–A2: yêu cầu phải có tiếng Việt");
      expect(detail.detail).toContain("Speaking B: A1–A2: dữ kiện phải có tiếng Việt");
    }
    // The read-aloud text and the English sample answers are not inspected.
    const a2 = generated("A2");
    expect(a2.blueprint.monthlyExam!.grader.writingSample).not.toMatch(/[ạảấầ]/u);
    expect(failed(a2.blueprint, a2.contract).status).toBe("pass");
  });

  it("requires a question and the target word in the Reading context sentence (GEN07 pre-check, WP10)", () => {
    expect(monthlyFinalReadingItemProblems("Please check the report before noon. What should you do?", "Check the report", "report")).toEqual([]);
    expect(monthlyFinalReadingItemProblems("Please send the ____ before noon.", "report", "report")).toEqual([]);
    expect(monthlyFinalReadingItemProblems("Our slides are ready for the client meeting.", "Prepared", "ready")).toEqual(["chưa có câu hỏi hoặc chỗ trống"]);
    expect(monthlyFinalReadingItemProblems("Our team found a new way to fix the login error. Which word is closest in meaning to 'solution'?", "answer", "solution"))
      .toEqual([`"solution" không có trong câu ngữ cảnh (chỉ có ở câu hỏi/đáp án)`]);
    const { blueprint, contract } = generated("B1");
    const gen07 = (draft: StoredAssessmentDefinition) => evaluateMonthlyFinal(draft, contract).checks.find((item) => item.code === "GEN07")!;
    expect(gen07(blueprint).status).toBe("needs_review");
    const noQuestion = mutate(blueprint, (draft) => { const task = draft.sections[1]!.groups[0]!.tasks[0]!; task.prompt = task.prompt.replace(" What should you do?", ""); });
    expect(gen07(noQuestion)).toMatchObject({ status: "fail", detail: expect.stringContaining("R01: chưa có câu hỏi") });
    const wordInQuestionOnly = mutate(blueprint, (draft) => { const task = draft.sections[1]!.groups[0]!.tasks[0]!; const word = draft.monthlyExam!.mapping.find((row) => row.taskKey === task.key)!.word; task.prompt = `Please check the file before noon. What does '${word}' mean?`; });
    expect(gen07(wordInQuestionOnly)).toMatchObject({ status: "fail", detail: expect.stringContaining("không có trong câu ngữ cảnh") });
    // Confirming GEN07 by hand cannot override a failing pre-check.
    const confirmed = mutate(noQuestion, (draft) => { draft.monthlyExam!.manualConfirmations = ["GEN07"]; });
    expect(gen07(confirmed).status).toBe("fail");
  });

  it("balances answer letters without runs or an A-B-C cycle (GEN17)", () => {
    const items = Array.from({ length: 22 }, (_, index) => ({ termId: `t${index}`, prompt: "p", options: [`right ${index}`, "x", "y"], correctIndex: 0, explanation: "e" }));
    const balanced = rebalanceAnswerPositions(items, "seed-1");
    const letters = balanced.map((item) => item.correctIndex);
    const counts = [0, 1, 2].map((letter) => letters.filter((value) => value === letter).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    for (let index = 2; index < letters.length; index += 1) expect(letters[index] === letters[index - 1] && letters[index] === letters[index - 2]).toBe(false);
    expect(balanced.every((item, index) => item.options[item.correctIndex] === `right ${index}`)).toBe(true);
  });
});

describe("monthly final operator edits and manual fallback", () => {
  it("locks the v2.0 frame and validates GA/GB main/secondary against taught steps", () => {
    const { blueprint, contract } = generated("B1");
    const extraTask = updateBody(blueprint);
    extraTask.sections[1]!.groups[0]!.tasks.push({ ...extraTask.sections[1]!.groups[0]!.tasks[0]!, key: "R99" });
    expect(() => applyMonthlyFinalUpdate(blueprint, extraTask, "op", new Date())).toThrow("MONTHLY_FINAL_STRUCTURE_LOCKED");
    expect(() => applyMonthlyFinalUpdate(blueprint, updateBody(blueprint, { grammar: [{ code: "GA", mainStepId: "ga-1", secondaryStepId: "ga-1" }] }), "op", new Date())).toThrow("MONTHLY_FINAL_GRAMMAR_COMPONENT_INVALID");
    expect(() => applyMonthlyFinalUpdate(blueprint, updateBody(blueprint, { grammar: [{ code: "GA", mainStepId: "gb-1", secondaryStepId: "ga-2" }] }), "op", new Date())).toThrow("MONTHLY_FINAL_GRAMMAR_COMPONENT_INVALID");
    const changed = withEvaluation(applyMonthlyFinalUpdate(blueprint, updateBody(blueprint, { grammar: [{ code: "GA", mainStepId: "ga-3", secondaryStepId: "ga-2" }] }), "op", new Date()), contract);
    expect(changed.monthlyExam!.grammar[0]).toMatchObject({ main: { stepId: "ga-3", acceptedPatterns: ["should + V"] }, secondary: { stepId: "ga-2" } });
    expect(changed.monthlyExam!.checks.find((item) => item.code === "GEN01")!.status).toBe("pass");
    const scored = updateBody(blueprint);
    scored.sections[2]!.groups[0]!.tasks[0]!.maxScore = 5;
    expect(applyMonthlyFinalUpdate(blueprint, scored, "op", new Date()).sections[2]!.groups[0]!.tasks[0]!.maxScore).toBe(25);
  });

  it("opens the editing window only before 00:00 of the exam date", () => {
    expect(monthlyFinalWindowOpen("2026-11-29", "2026-11-30")).toBe(true);
    expect(monthlyFinalWindowOpen("2026-11-30", "2026-11-30")).toBe(false);
    expect(monthlyFinalWindowOpen("2026-12-01", "2026-11-30")).toBe(false);
  });

  it("builds a v2.0 manual frame with mapping and taught pronunciation words, kept as DRAFT", () => {
    const contract = monthlyFinalContract("A1");
    const manual = buildManualMonthlyFinalDraft(contract, frameworkRef);
    expect(manual.monthlyExam).toMatchObject({ source: "manual", status: "DRAFT", allocation: { l: 17, r: 24, w: 4, s: 3 } });
    expect(manual.sections.map((section) => section.groups.flatMap((group) => group.tasks).length)).toEqual([17, 24, 1, 2]);
    expect(manual.monthlyExam!.mapping.map((row) => row.termId)).toEqual(contract.coreTerms.map((term) => term.id));
    expect(manual.monthlyExam!.pronunciation.every((target) => target.positions.length === 2)).toBe(true);
    expect(manual.monthlyExam!.checks.find((item) => item.code === "GEN03")!.status).toBe("pass");
  });
});

describe("monthly final AI output validation", () => {
  it("asks the gateway to retry when a target term is missing or repeated", () => {
    const { input, ai } = generated("B1");
    expect(validateMonthlyFinalReceptiveOutput(ai.receptive, input)).toEqual([]);
    expect(validateMonthlyFinalProductiveOutput(ai.productive, input)).toEqual([]);
    const repeated = structuredClone(ai.receptive);
    repeated.reading.questions[1]!.termId = repeated.reading.questions[0]!.termId;
    expect(validateMonthlyFinalReceptiveOutput(repeated, input).map((issue) => issue.message).join(" ")).toMatch(/assessed twice.*needs exactly one question/su);
    const wrongWord = structuredClone(ai.productive);
    wrongWord.speakingA.positions[0]!.word = "laptop";
    expect(validateMonthlyFinalProductiveOutput(wrongWord, input)).not.toEqual([]);
    const sameStep = structuredClone(ai.productive);
    sameStep.grammarComponents[0]!.secondaryStepId = sameStep.grammarComponents[0]!.mainStepId;
    expect(validateMonthlyFinalProductiveOutput(sameStep, input)).not.toEqual([]);
  });
});

describe("monthly final AI slices: flat tool schemas mapped back to the stored shape", () => {
  const { input, ai } = generated();
  const listening = ai.receptive.listening;
  const reading = ai.receptive.reading;
  const productive = ai.productive;

  it("exposes flat listening/reading tool schemas (no single wrapper object)", () => {
    expect(monthlyFinalListeningOutputJsonSchema.required).toEqual(["messages"]);
    expect(Object.keys(monthlyFinalListeningOutputJsonSchema.properties)).toEqual(["messages"]);
    expect(monthlyFinalReadingOutputJsonSchema.required).toEqual(["questions"]);
    expect(Object.keys(monthlyFinalReadingOutputJsonSchema.properties)).toEqual(["questions"]);
    expect(AI_TASKS.get("monthly_final_listening_generation").outputJsonSchema).toBe(monthlyFinalListeningOutputJsonSchema);
    expect(AI_TASKS.get("monthly_final_reading_generation").outputJsonSchema).toBe(monthlyFinalReadingOutputJsonSchema);
    expect(monthlyFinalProductiveOutputJsonSchema.required).toEqual(["title", "grammarComponents", "writing", "speakingA", "speakingB"]);
  });

  it.each([
    ["flat", { messages: listening.messages }],
    ["wrapped", { listening }],
    ["wrapped as a JSON string", { listening: JSON.stringify(listening) }],
    ["flat messages as a JSON string", { messages: JSON.stringify(listening.messages) }],
    ["whole output as a JSON string", JSON.stringify({ messages: listening.messages })],
    ["questions as JSON strings", { messages: listening.messages.map((message) => ({ ...message, questions: JSON.stringify(message.questions) })) }]
  ])("listening accepts %s output", (_label, raw) => {
    const parsed = monthlyFinalListeningOutputSchema.parse(raw);
    expect(parsed).toEqual({ listening });
    expect(validateMonthlyFinalListeningOutput(parsed, input)).toEqual([]);
    expect(AI_TASKS.get("monthly_final_listening_generation").validateOutput?.(parsed, input)).toEqual([]);
  });

  it.each([
    ["flat", { questions: reading.questions }],
    ["wrapped", { reading }],
    ["wrapped as a JSON string", { reading: JSON.stringify(reading) }],
    ["flat questions as a JSON string", { questions: JSON.stringify(reading.questions) }],
    ["whole output as a JSON string", JSON.stringify({ questions: reading.questions })]
  ])("reading accepts %s output", (_label, raw) => {
    const parsed = monthlyFinalReadingOutputSchema.parse(raw);
    expect(parsed).toEqual({ reading });
    expect(validateMonthlyFinalReadingOutput(parsed, input)).toEqual([]);
    expect(AI_TASKS.get("monthly_final_reading_generation").validateOutput?.(parsed, input)).toEqual([]);
  });

  it.each([
    ["flat", productive],
    ["fields as JSON strings", { ...productive, grammarComponents: JSON.stringify(productive.grammarComponents), writing: JSON.stringify(productive.writing), speakingA: JSON.stringify(productive.speakingA), speakingB: JSON.stringify(productive.speakingB) }],
    ["whole output as a JSON string", JSON.stringify(productive)],
    ["wrapped", { productive }]
  ])("productive accepts %s output", (_label, raw) => {
    const parsed = monthlyFinalProductiveOutputSchema.parse(raw);
    expect(parsed).toEqual(productive);
    expect(validateMonthlyFinalProductiveOutput(parsed, input)).toEqual([]);
  });

  it("still rejects malformed or missing slices", () => {
    expect(monthlyFinalListeningOutputSchema.safeParse({ messages: "[{\"label\":\"A\"," }).success).toBe(false);
    expect(monthlyFinalListeningOutputSchema.safeParse({}).success).toBe(false);
    expect(monthlyFinalReadingOutputSchema.safeParse({ questions: "not json" }).success).toBe(false);
    expect(monthlyFinalProductiveOutputSchema.safeParse({ ...productive, writing: "{broken" }).success).toBe(false);
  });

  it("assembles the exam from flat slices exactly as from wrapped ones", () => {
    const contract = monthlyFinalContract("B1");
    const receptive = {
      listening: monthlyFinalListeningOutputSchema.parse({ messages: listening.messages }).listening,
      reading: monthlyFinalReadingOutputSchema.parse({ questions: reading.questions }).reading
    };
    const now = new Date("2026-11-20T03:00:00Z");
    expect(assembleMonthlyFinalFromAi(contract, frameworkRef, receptive, monthlyFinalProductiveOutputSchema.parse(productive), now))
      .toEqual(assembleMonthlyFinalFromAi(contract, frameworkRef, ai.receptive, ai.productive, now));
  });
});
