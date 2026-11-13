// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { learnerLessonCopy } from "../shared/lesson/language.js";
import { grammarExamplePair, grammarFormulaBoxes } from "../shared/lesson/study-highlight.js";
import { SharedLessonPartContent } from "./Learning.js";

afterEach(cleanup);

const STATE_VERB = "Error check: [subject] + [state verb] (NOT is knowing) / always + am/is/are + verb-ing (complaint about repeated habit)";
const PAST = "Error check: [subject] + verb-ed/irregular (NOT did + verb-ed) / have/has + noun (I have two projects) vs have got (I have got a new laptop)";

describe("common-errors formula boxes", () => {
  it("drops the Error check label: one neutral box, a row per rule, the NOT form attached to its own rule", () => {
    expect(grammarFormulaBoxes(STATE_VERB, "en")).toEqual([{
      tone: "neutral",
      lines: ["[subject] + [state verb]", "always + am/is/are + verb-ing"],
      rules: [
        { pattern: "[subject] + [state verb]", notes: [], wrong: ["is knowing"] },
        { pattern: "always + am/is/are + verb-ing", notes: ["(complaint about repeated habit)"], wrong: [] }
      ]
    }]);
  });

  it("never reads an Error check line as two compared structures", () => {
    expect(grammarFormulaBoxes(PAST, "vi")).toEqual([{
      tone: "neutral",
      lines: ["[subject] + verb-ed/irregular", "have/has + noun", "have got"],
      rules: [
        { pattern: "[subject] + verb-ed/irregular", notes: [], wrong: ["did + verb-ed"] },
        { pattern: "have/has + noun", notes: ["(I have two projects)"], wrong: [] },
        { pattern: "have got", notes: ["(I have got a new laptop)"], wrong: [] }
      ]
    }]);
    expect(grammarFormulaBoxes("Error check: subject + V-ed / subject + was/were + V-ing", "en")[0]!.rules!.map((rule) => rule.pattern)).toEqual(["subject + V-ed", "subject + was/were + V-ing"]);
  });

  it("gives a lone (NOT …) line one rule row and keeps a (not) slot in its pattern", () => {
    expect(grammarFormulaBoxes("Subject + did + (not) + base verb (NOT didn't went)", "en")[0]!.rules).toEqual([{ pattern: "Subject + did + (not) + base verb", notes: [], wrong: ["didn't went"] }]);
  });

  it("keeps ordinary compares and lowercase (not) slots as before", () => {
    expect(grammarFormulaBoxes("Past simple: S + V2 vs Past continuous: S + was/were + V-ing", "en").map((box) => box.label)).toEqual(["Past simple", "Past continuous"]);
    expect(grammarFormulaBoxes("Subject + am/is/are + (not) + complement", "en")).toEqual([{ tone: "neutral", lines: ["Subject + am/is/are + (not) + complement"] }]);
  });
});

describe("wrong/right example pairs", () => {
  it("splits every marker variant, in either order", () => {
    const pair = { wrong: "She work in Hanoi.", right: "She works in Hanoi." };
    expect(grammarExamplePair("Wrong: She work in Hanoi. Right: She works in Hanoi.")).toEqual(pair);
    expect(grammarExamplePair("Wrong: She work in Hanoi. → Right: She works in Hanoi.")).toEqual(pair);
    expect(grammarExamplePair("Sai: She work in Hanoi. Đúng: She works in Hanoi.")).toEqual(pair);
    expect(grammarExamplePair("Incorrect: She work in Hanoi. Correct: She works in Hanoi.")).toEqual(pair);
    expect(grammarExamplePair("✗ She work in Hanoi. ✓ She works in Hanoi.")).toEqual(pair);
    expect(grammarExamplePair("Right: She works in Hanoi. Wrong: She work in Hanoi.")).toEqual(pair);
  });

  it("leaves ordinary examples alone", () => {
    expect(grammarExamplePair("She is right about the plan.")).toBeUndefined();
    expect(grammarExamplePair("Said: the client is happy. Right: yes.")).toBeUndefined();
  });
});

describe("live B1 common-errors day (Bài 15)", () => {
  const speak = vi.fn();
  const part = {
    code: "grammar", title: "Ngữ pháp",
    content: {
      dailyCode: "K3",
      objective: "K3 Workplace task: write 2–3 sentences using both Present simple vs present continuous and Past simple vs past continuous (weekly, blocker, groupwork).",
      steps: [
        { formula: STATE_VERB, text: "Vietnamese has no tense marking on the verb, so check the time word before you choose the form.", examples: ["Wrong: She work in Hanoi. Right: She works in Hanoi.", "Wrong: I am knowing the answer. Right: I know the answer."] },
        { formula: PAST, text: "Use past simple for a finished action.", examples: ["Wrong: Yesterday I go to the client meeting. Right: Yesterday I went to the client meeting."] }
      ]
    }
  };
  const view = (cefr = "B1", language: "en" | "vi" = "en") => render(<SharedLessonPartContent cefr={cefr as never} language={language} copy={learnerLessonCopy[language]} grammarAvailable sectionNumber={1} part={part as never} speak={speak} openVocabularyModal={vi.fn()} />);

  it("never shows the day-plan objective, only the teaching explanation", () => {
    const { container } = view();
    expect(container).not.toHaveTextContent(/Workplace task|K3/);
    expect(container).toHaveTextContent("Vietnamese has no tense marking on the verb");
    expect(container).not.toHaveTextContent("Error check");
  });

  it("shows one neutral band per formula with a row per rule and the wrong form on its own rule's row", () => {
    const { container } = view();
    expect(container.querySelector(".lesson-study-formula-box--correct, .lesson-study-formula-box--wrong")).toBeNull();
    const bands = container.querySelectorAll(".lesson-grammar-rules");
    expect(bands).toHaveLength(2);
    const rows = Array.from(bands[0]!.querySelectorAll(".lesson-grammar-rule"));
    expect(rows).toHaveLength(2);
    // Row 1: the pattern, highlighted with the normal accent, then its own wrong form, struck through and unmarked.
    expect(rows[0]!.querySelector(".lesson-grammar-rule-pattern")).toHaveTextContent("[subject] + [state verb]");
    expect(rows[0]!.querySelector(".lesson-grammar-rule-pattern .lesson-study-mark")).toHaveTextContent("[state verb]");
    const wrong = rows[0]!.querySelector(".lesson-grammar-rule-wrong")!;
    expect(wrong).toHaveTextContent("✗is knowing");
    expect(wrong.querySelector("s")).toHaveTextContent("is knowing");
    expect(wrong.querySelector(".lesson-study-mark")).toBeNull();
    // Row 2: no wrong form; the note in parentheses is muted, not bold pattern text.
    expect(rows[1]!.querySelector(".lesson-grammar-rule-wrong")).toBeNull();
    expect(rows[1]!.querySelector(".lesson-grammar-rule-note")).toHaveTextContent("(complaint about repeated habit)");
    expect(rows[1]!.querySelector(".lesson-grammar-rule-pattern")).not.toHaveTextContent("complaint");
    // The past-simple rule line: three rows, the wrong form attached to the first rule only.
    const pastRows = Array.from(bands[1]!.querySelectorAll(".lesson-grammar-rule"));
    expect(pastRows.map((row) => row.querySelector(".lesson-grammar-rule-pattern")?.textContent)).toEqual(["[subject] + verb-ed/irregular", "have/has + noun", "have got"]);
    expect(pastRows.map((row) => row.querySelector(".lesson-grammar-rule-wrong s")?.textContent ?? null)).toEqual(["did + verb-ed", null, null]);
  });

  it("labels a wrong/right chip Wrong/Right from B1: wrong struck through and never marked, right marked, speaker plays the right sentence", () => {
    const { container } = view();
    const chips = container.querySelectorAll(".lesson-example-card");
    expect(Array.from(chips[0]!.querySelectorAll(".lesson-example-pair-label")).map((label) => label.textContent)).toEqual(["Wrong", "Right"]);
    expect(chips[0]!.querySelector(".lesson-example-right .lesson-study-mark")).toHaveTextContent("works");
    const wrong = chips[1]!.querySelector(".lesson-example-wrong")!;
    expect(wrong.tagName).toBe("S");
    expect(wrong).toHaveTextContent("I am knowing the answer.");
    expect(wrong.querySelector(".lesson-study-mark")).toBeNull();
    expect(chips[1]!.querySelector(".lesson-example-right")).toHaveTextContent("I know the answer.");
    speak.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Listen to example: I know the answer." }));
    expect(speak).toHaveBeenCalledWith("I know the answer.", "en-US", expect.anything());
  });

  it("labels the chip parts Sai/Đúng at A1–A2", () => {
    const { container } = view("A2", "vi");
    const chip = container.querySelector(".lesson-example-card")!;
    expect(Array.from(chip.querySelectorAll(".lesson-example-pair-label")).map((label) => label.textContent)).toEqual(["Sai", "Đúng"]);
    expect(chip).toHaveTextContent("SaiShe work in Hanoi.→ĐúngShe works in Hanoi.");
  });
});
