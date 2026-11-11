import { describe, expect, it } from "vitest";
import {
  answerIsUniqueLongestOption,
  bracketHintWords,
  containsVietnameseLetters,
  internalLearnerTerms,
  inventedWordForms,
  mentionsWordClass,
  offensiveWords,
  optionsAreWordClassLabels,
  validateLessonPublication
} from "../src/content/index.js";

describe("choice quality heuristics (AI quality plan 11/11)", () => {
  it("detects Word form prompts that ask for the word class (HV-R49)", () => {
    expect(mentionsWordClass("What is the word class of 'video' in the sentence?")).toBe(true);
    expect(mentionsWordClass("Which part of speech is 'quick'?")).toBe(true);
    expect(mentionsWordClass("Từ 'quick' thuộc từ loại nào?")).toBe(true);
    expect(mentionsWordClass("Please send the updated ____ to the client.")).toBe(false);
    expect(optionsAreWordClassLabels(["noun", "verb", "adjective", "adverb"])).toBe(true);
    expect(optionsAreWordClassLabels(["Danh từ", "Động từ", "Tính từ", "Trạng từ"])).toBe(true);
    expect(optionsAreWordClassLabels(["decide", "decision", "decisive", "decisively"])).toBe(false);
    expect(bracketHintWords("Please send the ____ (document) today.")).toEqual(["document"]);
  });

  it("flags invented forms from the real samples and accepts real ones", () => {
    expect(inventedWordForms("sended, maked, haves, gived, sendded")).toEqual(["sended", "maked", "haves", "gived", "sendded"]);
    expect(inventedWordForms("feedbacked colleagueship colleagued revisely accurating")).toHaveLength(5);
    expect(inventedWordForms("sent made has gave seed politely updated commented learned costed")).toEqual([]);
  });

  it("flags offensive words by whole word only", () => {
    expect(offensiveWords("sheet / shit")).toEqual(["shit"]);
    expect(offensiveWords("assess the class of Scunthorpe")).toEqual([]);
  });

  it("detects a unique longest answer", () => {
    expect(answerIsUniqueLongestOption(["The budget is ready now.", "No.", "Yes.", "Maybe."], "The budget is ready now.")).toBe(true);
    expect(answerIsUniqueLongestOption(["report", "different", "unrelated", "other"], "report")).toBe(false);
  });

  it("detects Vietnamese letters and internal planning wording", () => {
    expect(containsVietnameseLetters("Chọn đáp án đúng")).toBe(true);
    expect(containsVietnameseLetters("Choose the best answer.")).toBe(false);
    expect(internalLearnerTerms("Use one core term and one expanded term.")).toEqual(["core term", "expanded term"]);
    expect(internalLearnerTerms("Trong tháng 11, người học có thể…")).toEqual(["người học"]);
    expect(internalLearnerTerms("Talk about 'Update the client on project progress every week'", ["Update the client on project progress every week."])).toHaveLength(1);
    expect(internalLearnerTerms("Hãy nói với khách hàng.", ["Update the client on project progress every week."])).toEqual([]);
  });
});

describe("validateLessonPublication monthly options", () => {
  const lesson = (grammar: Record<string, unknown>, prompt = "What is high?") => ({
    dayNumber: 1, title: "Budget update", durationMinutes: 15,
    parts: [
      { code: "instruction" as const, title: "Instruction", content: { steps: ["Read the example.", "Answer the question."] } },
      { code: "grammar" as const, title: "Grammar", content: grammar },
      { code: "word_use" as const, title: "Word use", content: { prompt, options: ["The cost", "The room", "The plan", "The date"], answer: "The cost" } }
    ]
  });
  const grammarIssues = (result: ReturnType<typeof validateLessonPublication>) => result.issues.filter((issue) => issue.code === "grammar");

  it("exempts locked plan values from the B1+ English-only check only when passed (weekly default unchanged)", () => {
    const content = { formula: "S + V-ed", objective: "Dùng quá khứ đơn để kể lại việc đã làm.", dailyCode: "A4" };
    expect(grammarIssues(validateLessonPublication([lesson(content)], undefined, "B1"))).toHaveLength(1);
    expect(grammarIssues(validateLessonPublication([lesson(content)], undefined, "B1", { lockedPlanValues: { grammar: { objective: content.objective, dailyCode: "A4" } } }))).toEqual([]);
    expect(grammarIssues(validateLessonPublication([lesson({ ...content, objective: "Dùng quá khứ đơn." })], undefined, "B1", { lockedPlanValues: { grammar: { objective: content.objective } } }))).toHaveLength(1);
  });

  it("requires Vietnamese prompts and instructions at A1–A2 only when the monthly option is on", () => {
    const english = lesson({ formula: "S + V" });
    expect(validateLessonPublication([english], undefined, "A1").issues.filter((issue) => issue.rule)).toEqual([]);
    const issues = validateLessonPublication([english], undefined, "A1", { requireVietnameseInstructions: true }).issues.filter((issue) => issue.rule === "vietnamese_instructions");
    expect(issues.map((issue) => issue.code).sort()).toEqual(["instruction", "word_use"]);
    const vietnamese = { ...lesson({ formula: "S + V" }, "Chọn đáp án đúng: What is high?") };
    vietnamese.parts[0] = { code: "instruction", title: "Instruction", content: { steps: ["Đọc ví dụ.", "Trả lời câu hỏi."] } };
    expect(validateLessonPublication([vietnamese], undefined, "A2", { requireVietnameseInstructions: true }).issues.filter((issue) => issue.rule)).toEqual([]);
    expect(validateLessonPublication([english], undefined, "B1", { requireVietnameseInstructions: true }).issues.filter((issue) => issue.rule)).toEqual([]);
  });
});

describe("minimal pair heuristic (AI quality round 2, 11/11)", () => {
  it("accepts real minimal pairs, including the ones in approved review fixtures", async () => {
    const { isPlausibleMinimalPair } = await import("../src/content/index.js");
    for (const [a, b] of [["ship", "sheep"], ["think", "sink"], ["fan", "van"], ["light", "right"], ["see", "she"], ["cost", "coast"], ["soon", "noon"], ["three", "tree"], ["it", "eat"], ["very", "berry"], ["hat", "hate"], ["checks", "check"]]) {
      expect(isPlausibleMinimalPair(a!, b!), `${a}/${b}`).toBe(true);
    }
    expect(isPlausibleMinimalPair("ship", "sheep", { first: "/ʃɪp/", second: "/ʃiːp/" })).toBe(true);
  });

  it("rejects the invalid pairs seen in the 11/11 remeasure (event/segment, bat/box, sheet/shift, bomb/bond, correct/count)", async () => {
    const { isPlausibleMinimalPair } = await import("../src/content/index.js");
    for (const [a, b] of [["event", "segment"], ["correct", "count"], ["bat", "box"], ["sheet", "shift"], ["bomb", "bond"], ["soon", "shoe"], ["cost", "cost"]]) {
      expect(isPlausibleMinimalPair(a!, b!), `${a}/${b}`).toBe(false);
    }
    expect(isPlausibleMinimalPair("bomb", "bond", { first: "/bɒm/", second: "/bɒnd/" })).toBe(false);
    expect(isPlausibleMinimalPair("event", "segment", { first: "/ɪˈvent/", second: "/ˈseɡmənt/" })).toBe(false);
  });
});
