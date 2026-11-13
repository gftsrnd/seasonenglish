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
  it("drops the Error check label and puts the NOT form in a wrong box, one rule per line", () => {
    expect(grammarFormulaBoxes(STATE_VERB, "en")).toEqual([
      { tone: "correct", label: "Correct", lines: ["[subject] + [state verb]", "always + am/is/are + verb-ing (complaint about repeated habit)"] },
      { tone: "wrong", label: "Incorrect", lines: ["is knowing"] }
    ]);
  });

  it("never reads an Error check line as two compared structures", () => {
    expect(grammarFormulaBoxes(PAST, "vi")).toEqual([
      { tone: "correct", label: "Đúng", lines: ["[subject] + verb-ed/irregular", "have/has + noun (I have two projects)", "have got (I have got a new laptop)"] },
      { tone: "wrong", label: "Sai", lines: ["did + verb-ed"] }
    ]);
    expect(grammarFormulaBoxes("Error check: subject + V-ed / subject + was/were + V-ing", "en")).toEqual([{ tone: "neutral", lines: ["subject + V-ed", "subject + was/were + V-ing"] }]);
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
  const view = () => render(<SharedLessonPartContent cefr="B1" language="en" copy={learnerLessonCopy.en} grammarAvailable sectionNumber={1} part={part as never} speak={speak} openVocabularyModal={vi.fn()} />);

  it("never shows the day-plan objective, only the teaching explanation", () => {
    const { container } = view();
    expect(container).not.toHaveTextContent(/Workplace task|K3/);
    expect(container).toHaveTextContent("Vietnamese has no tense marking on the verb");
    expect(container).not.toHaveTextContent("Error check");
  });

  it("shows a correct and a wrong box per rule line, the wrong box unmarked", () => {
    const { container } = view();
    const wrong = container.querySelectorAll(".lesson-study-formula-box--wrong");
    expect(wrong).toHaveLength(2);
    expect(wrong[0]).toHaveTextContent("is knowing");
    expect(wrong[0]!.querySelector(".lesson-study-mark")).toBeNull();
    expect(container.querySelectorAll(".lesson-study-formula-box--correct")).toHaveLength(2);
  });

  it("splits a wrong/right chip: wrong struck through and never marked, right marked, speaker plays the right sentence", () => {
    const { container } = view();
    const chip = container.querySelectorAll(".lesson-example-card")[1]!;
    const wrong = chip.querySelector(".lesson-example-wrong")!;
    expect(wrong.tagName).toBe("S");
    expect(wrong).toHaveTextContent("I am knowing the answer.");
    expect(wrong.querySelector(".lesson-study-mark")).toBeNull();
    expect(chip.querySelector(".lesson-example-right")).toHaveTextContent("I know the answer.");
    speak.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Listen to example: I know the answer." }));
    expect(speak).toHaveBeenCalledWith("I know the answer.", "en-US", expect.anything());
  });
});
