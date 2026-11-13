// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedLessonPartContent } from "./Learning.js";
import { OperatorLessonPreview } from "../operator/adapters.js";
import { learnerLessonCopy } from "../shared/lesson/language.js";
import { grammarExampleMatcher, grammarExampleSegments, grammarFormulaSegments, grammarPointName, pronunciationEndingSegments, type HighlightSegment } from "../shared/lesson/study-highlight.js";

afterEach(cleanup);

const marked = (segments: HighlightSegment[]) => segments.filter((segment) => segment.mark).map((segment) => segment.text);
const joined = (segments: HighlightSegment[]) => segments.map((segment) => segment.text).join("");
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const PRESENT_SIMPLE = "Subject + base verb (add -s/-es for he/she/it): I work / She manages / The team meets";

describe("grammar highlight derivation", () => {
  it("marks the key slots of a formula and the verb forms of its own examples, keeping the text", () => {
    const segments = grammarFormulaSegments(PRESENT_SIMPLE);
    expect(joined(segments)).toBe(PRESENT_SIMPLE);
    expect(marked(segments)).toEqual(["base verb", "-s/-es", "work", "manages", "meets"]);
    expect(marked(grammarFormulaSegments("Subject + am/is/are + V-ing"))).toEqual(["am/is/are", "V-ing"]);
    expect(marked(grammarFormulaSegments("Question: Do/Does + subject + base verb?"))).toEqual(["Do/Does", "base verb"]);
  });

  it("marks the matching words of example sentences", () => {
    const simple = grammarExampleMatcher([PRESENT_SIMPLE]);
    expect(marked(grammarExampleSegments("She manages the weekly budget.", simple))).toEqual(["manages"]);
    expect(marked(grammarExampleSegments("The team meets on Monday.", simple))).toEqual(["meets"]);
    expect(marked(grammarExampleSegments("I usually work from home.", simple))).toEqual(["work"]);
    const continuous = grammarExampleMatcher(["Subject + am/is/are + V-ing"]);
    expect(marked(grammarExampleSegments("We are preparing the report now.", continuous))).toEqual(["are", "preparing"]);
    const question = grammarExampleMatcher(["Question: Do/Does + subject + base verb?"]);
    expect(marked(grammarExampleSegments("Does she send the invoice?", question))).toEqual(["Does", "send"]);
    expect(joined(grammarExampleSegments("Does she send the invoice?", question))).toBe("Does she send the invoice?");
  });

  it("falls back to no highlight when unsure", () => {
    expect(marked(grammarFormulaSegments("Use polite language with clients"))).toEqual([]);
    expect(marked(grammarFormulaSegments("Subject + object + complement"))).toEqual([]);
    expect(grammarExampleMatcher(["Subject + object"])).toBeNull();
    // A determiner + noun subject whose verb is not one of the formula's own examples stays plain.
    expect(marked(grammarExampleSegments("The new manager reviews it.", grammarExampleMatcher([PRESENT_SIMPLE])))).toEqual([]);
    expect(marked(grammarExampleSegments("She manages it.", null))).toEqual([]);
  });

  it("names the grammar point from the level roadmap catalog, or not at all", () => {
    expect(grammarPointName("B1", { dailyCode: "B1", objective: "Step B1 (Identify): Notice past simple sequences and past continuous background in a meeting summary." })).toBe("Past simple vs past continuous and past habits");
    expect(grammarPointName("B1", { dailyCode: "A1", objective: "Notice the present simple for routines; compare it with the present continuous." })).toBe("Present simple vs present continuous");
    expect(grammarPointName("A1", { dailyCode: "A2", objective: "Bước 2: Luyện thì present simple với he/she/it." })).toBe("Present simple (Hiện tại đơn)");
    expect(grammarPointName("A2", { catalogId: "a2-p2-a" })).toBe("Present perfect 1 (Hiện tại hoàn thành 1)");
    expect(grammarPointName("B1", { objective: "Use polite phrases with clients." })).toBeUndefined();
    // Same mention on both sides without a daily code: ambiguous, so no name.
    expect(grammarPointName("A1", { objective: "Use the present simple, not the present continuous." })).toBeUndefined();
  });
});

describe("pronunciation ending derivation", () => {
  it("marks the written and the spoken ending", () => {
    const ed = pronunciationEndingSegments("asked", "/ɑːskt/", { ending: "ed", result: "/t/" });
    expect(marked(ed.word)).toEqual(["ed"]);
    expect(joined(ed.ipa)).toBe("/ɑːskt/");
    expect(marked(ed.ipa)).toEqual(["t"]);
    expect(marked(pronunciationEndingSegments("offices", "/ˈɒfɪsɪz/", { ending: "s", result: "/ɪz/" }).ipa)).toEqual(["ɪz"]);
    expect(marked(pronunciationEndingSegments("offices", "/ˈɒfɪsɪz/", { ending: "s", result: "/ɪz/" }).word)).toEqual(["es"]);
  });

  it("marks nothing when the word does not show the ending or there is no rule core", () => {
    expect(marked(pronunciationEndingSegments("went", "/went/", { ending: "ed", result: "/t/" }).word)).toEqual([]);
    expect(marked(pronunciationEndingSegments("asked", "/ɑːskt/", undefined).word)).toEqual([]);
    expect(marked(pronunciationEndingSegments("asked", "/ɑːskd/", { ending: "ed", result: "/t/" }).ipa)).toEqual([]);
  });
});

const b1Grammar = {
  code: "grammar", title: "Grammar",
  content: {
    dailyCode: "A1",
    objective: "Step A1 (Identify): Notice the present simple for routines.",
    formula: PRESENT_SIMPLE,
    usage: "Use it for routines and facts at work.",
    examples: ["She manages the weekly budget.", "The team meets on Monday.", "I work from home on Fridays."]
  }
};
const edT = { focus: "/-ed=t/", words: [{ word: "asked", ipa: "/ɑːskt/" }, { word: "helped", ipa: "/helpt/" }, { word: "finished", ipa: "/ˈfɪnɪʃt/" }] };

function show(part: unknown, cefr: "A1" | "A2" | "B1" = "B1") {
  const language = cefr === "B1" ? "en" : "vi";
  return render(<SharedLessonPartContent cefr={cefr} language={language} copy={learnerLessonCopy[language]} grammarAvailable sectionNumber={1} part={part as never} speak={vi.fn()} openVocabularyModal={vi.fn()} />);
}

describe("study block layout", () => {
  it("renders the B1 grammar card as label, name, usage, formula box, examples, with the key slot marked", () => {
    const { container } = show(b1Grammar);
    const label = screen.getByRole("heading", { name: "GRAMMAR" });
    const name = container.querySelector(".lesson-grammar-name")!;
    expect(name).toHaveTextContent("Present simple vs present continuous");
    const usage = screen.getByText(/Use it for routines and facts at work\./u);
    const box = container.querySelector(".lesson-study-formula-box")!;
    expect(box).toHaveTextContent(PRESENT_SIMPLE);
    expect(Array.from(box.querySelectorAll(".lesson-study-mark")).map((node) => node.textContent)).toEqual(["base verb", "-s/-es", "work", "manages", "meets"]);
    const chip = screen.getByRole("button", { name: "Listen to example: She manages the weekly budget." });
    expect(chip).toHaveTextContent("She manages the weekly budget.");
    expect(chip.querySelector(".lesson-study-mark")).toHaveTextContent("manages");
    for (const [a, b] of [[label, name], [name, usage], [usage, box], [box, chip]] as const) expect(follows(a, b)).toBe(true);
  });

  it("renders the B1 pronunciation card with the rule core box, marked endings and no mouth image or button", () => {
    const { container } = show({ code: "pronunciation", title: "Pronunciation", content: edT });
    const rule = screen.getByText(/-ed is \/t\/ after the voiceless sounds/u);
    const mistake = screen.getByText("Common mistake:").parentElement!;
    const box = container.querySelector(".lesson-pronunciation-formula")!;
    expect(box).toHaveTextContent("voiceless sound /p k f s ʃ tʃ θ/ + -ed → /t/");
    expect(box.querySelector(".lesson-study-mark")).toHaveTextContent("/t/");
    const chip = screen.getByRole("button", { name: "Listen to pronunciation word: asked" });
    expect(chip).toHaveTextContent("asked /ɑːskt/");
    expect(Array.from(chip.querySelectorAll(".lesson-study-mark")).map((node) => node.textContent)).toEqual(["ed", "t"]);
    for (const [a, b] of [[rule, mistake], [mistake, box], [box, chip]] as const) expect(follows(a, b)).toBe(true);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: /mouth|khẩu hình/iu })).not.toBeInTheDocument();
  });

  it("shows no mouth image at B1 even for a sound that has one", () => {
    const { container } = show({ code: "pronunciation", title: "Pronunciation", content: { focus: "/f/", words: [{ word: "file", ipa: "/faɪl/" }] } });
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the A1–A2 mouth image inline between the guidance and the example chips", () => {
    const objective = "Nghe, nhận diện và tập tạo âm mục tiêu; lặp lại ba từ theo mẫu.";
    show({ code: "pronunciation", title: "Phát âm", content: { focus: "/iː/", objective, words: [{ word: "team", ipa: "/tiːm/" }] } }, "A2");
    const guidance = screen.getByText(objective);
    const image = screen.getByRole("img", { name: /Khẩu hình cho âm \/iː\//u });
    const chip = screen.getByRole("button", { name: "Nghe từ phát âm: team" });
    expect(follows(guidance, image)).toBe(true);
    expect(follows(image, chip)).toBe(true);
    expect(screen.queryByRole("button", { name: /khẩu hình/iu })).not.toBeInTheDocument();
  });

  it("keeps the operator preview in sync (name, formula box, no B1 image)", () => {
    const { container } = render(<OperatorLessonPreview cefr="B1" lessonId="l1" parts={[b1Grammar, { code: "pronunciation", title: "Pronunciation", content: edT }] as never} />);
    expect(container.querySelector(".lesson-grammar-name")).toHaveTextContent("Present simple vs present continuous");
    expect(container.querySelector(".lesson-pronunciation-formula")).toHaveTextContent("→ /t/");
    expect(container.querySelector("img")).toBeNull();
  });
});
