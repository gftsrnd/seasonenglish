// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { learnerLessonCopy } from "../shared/lesson/language.js";
import { grammarMarkedExampleSegments, readAloudPassageSegments } from "../shared/lesson/study-highlight.js";
import { SharedLessonPartContent } from "./Learning.js";

afterEach(cleanup);

/** Live B1 2026-12 lesson 17 on 4300 (framework 900fd0fb-397c-4b62-8c4a-2ce655a27369), with the marks a new generation returns. */
const STATE_VERB = "Error check: [subject] + [state verb] (NOT is knowing) / always + am/is/are + verb-ing (complaint about repeated habit)";
const PAST = "Error check: [subject] + verb-ed/irregular (NOT did + verb-ed) / have/has + noun (I have two projects) vs have got (I have got a new laptop)";
const grammarPart = (marked: boolean) => ({
  code: "grammar",
  title: "Grammar",
  content: {
    formula: `${STATE_VERB}\n${PAST}`,
    steps: [
      { formula: STATE_VERB, text: "Use state verbs in the simple present.", examples: ["Our team knows the testing schedule for the new release.", "I agree with the shortage plan, but we need more time.", "Our manager is always asking for changes at the last minute."], ...(marked ? { exampleMarks: [{ row: 1, marks: ["knows"] }, { row: 1, marks: ["agree", "need"] }, { row: 2, marks: ["is", "always", "asking"] }] } : {}) },
      { formula: PAST, text: "Use the past simple, never with did.", examples: ["Last week the attendee registered for the workshop online.", "Yesterday the team wrote the testing report before lunch.", "We have got a new meeting room, and we had only one last year."], ...(marked ? { exampleMarks: [{ row: 1, marks: ["registered"] }, { row: 1, marks: ["wrote"] }, { row: 3, marks: ["have got", "had"] }] } : {}) }
    ]
  }
});
const PASSAGE = "Last week our team asked the vendor about the new schedule. Minh checked the file before the call, and then he checked it again after lunch. Lan finished the draft on time. After the meeting, we planned the next steps and started the testing phase. Later the client called us to confirm the budget, and the vendor called the office twice. We needed more staff, so the manager approved a new hire. Finally, Hoa updated the shared folder.";
const TARGETS = ["asked", "checked", "called", "planned", "started", "needed", "checked it", "called us"];

const view = (part: unknown) => render(<SharedLessonPartContent cefr={"B1" as never} language="en" copy={learnerLessonCopy.en} grammarAvailable sectionNumber={1} part={part as never} speak={vi.fn()} openVocabularyModal={vi.fn()} />);
const marksOf = (element: Element) => Array.from(element.querySelectorAll(".lesson-study-mark")).map((mark) => mark.textContent);

describe("generated grammar example marks (live B1 2026-12 lesson 17)", () => {
  it("highlights exactly the marked words of each example: knows, agree, need, registered, wrote, have got, had", () => {
    const { container } = view(grammarPart(true));
    const examples = Array.from(container.querySelectorAll(".lesson-grammar-step .lesson-example-list > *"));
    expect(examples.map(marksOf)).toEqual([["knows"], ["agree", "need"], ["is", "always", "asking"], ["registered"], ["wrote"], ["have got", "had"]]);
  });

  it("a lesson stored without marks keeps the formula-based highlight", () => {
    const { container } = view(grammarPart(false));
    const examples = Array.from(container.querySelectorAll(".lesson-grammar-step .lesson-example-list > *"));
    expect(examples.map(marksOf)).not.toEqual([["knows"], ["agree", "need"], ["is", "always", "asking"], ["registered"], ["wrote"], ["have got", "had"]]);
  });

  it("marks only the Right sentence of a Wrong/Right example, and nothing the model did not mark", () => {
    const segments = grammarMarkedExampleSegments("Right: I know the answer.", ["know"]);
    expect(segments.filter((segment) => segment.mark).map((segment) => segment.text)).toEqual(["know"]);
    expect(grammarMarkedExampleSegments("We have got a room.", []).some((segment) => segment.mark)).toBe(false);
  });
});

describe("read-aloud passage targets (live B1 2026-12 lesson 17)", () => {
  it("bolds each target occurrence the server counts, phrases first", () => {
    const marked = readAloudPassageSegments(PASSAGE, TARGETS).filter((segment) => segment.mark).map((segment) => segment.text);
    expect(marked).toEqual(["asked", "checked", "checked it", "planned", "started", "called us", "called", "needed"]);
    expect(readAloudPassageSegments(PASSAGE, []).some((segment) => segment.mark)).toBe(false);
  });

  it("shows the marks in the learner lesson and the operator preview (shared part view)", () => {
    const { container } = view({ code: "pronunciation", title: "Pronunciation", content: { focus: "/-ed=t/", words: [{ word: "asked", ipa: "/ɑːskt/" }], passage: PASSAGE, passageTargets: TARGETS } });
    const passage = container.querySelector(".lesson-read-aloud-passage")!;
    expect(passage).toHaveTextContent(PASSAGE);
    expect(marksOf(passage)).toEqual(["asked", "checked", "checked it", "planned", "started", "called us", "called", "needed"]);
  });

  it("an old lesson without targets shows the passage unmarked", () => {
    const { container } = view({ code: "pronunciation", title: "Pronunciation", content: { focus: "/-ed=t/", words: [{ word: "asked", ipa: "/ɑːskt/" }], passage: PASSAGE } });
    expect(container.querySelector(".lesson-read-aloud-passage .lesson-study-mark")).toBeNull();
  });
});
