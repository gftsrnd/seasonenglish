// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedLessonPartContent } from "./Learning.js";
import { OperatorLessonPreview } from "../operator/adapters.js";
import { learnerLessonCopy } from "../shared/lesson/language.js";
import { grammarExampleMatcher, grammarExampleSegments, grammarFormulaBoxes, grammarFormulaSegments, grammarPointName, pronunciationEndingSegments, pronunciationTargetSegments, type HighlightSegment } from "../shared/lesson/study-highlight.js";

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

// Real A1 lesson (13/11): stored content has no topic; the API attaches it from the day plan.
const BE_FORMULA = "I am / He is / She is / We are / They are + danh từ hoặc tính từ";
const a1BeGrammar = {
  code: "grammar", title: "Ngữ pháp",
  content: {
    topicTitle: "The verb to be", topicTitleVi: "Động từ to be",
    objective: "Ghi nhớ cấu trúc khẳng định với am, is, are.",
    formula: BE_FORMULA,
    usage: "Dùng am với I, is với he/she/it. Câu khẳng định luôn có động từ to be đứng sau chủ ngữ.",
    examples: ["I am the staff member at the front desk.", "She is our new staff leader.", "We are ready for the meeting."]
  }
};

describe("grammar name from the day plan, be-form highlights and the full-width band", () => {
  it("prefers the planned topic name: A1–A2 with Vietnamese, B1+ English only", () => {
    expect(grammarPointName("A1", { topicTitle: "The verb to be", topicTitleVi: "Động từ to be" })).toBe("The verb to be (Động từ to be)");
    expect(grammarPointName("A2", { topicTitle: "Động từ to be (am / is / are)" })).toBe("Động từ to be (am / is / are)");
    expect(grammarPointName("B1", { topicTitle: "Present simple vs present continuous", topicTitleVi: "Hiện tại đơn vs tiếp diễn" })).toBe("Present simple vs present continuous");
    expect(grammarPointName("A1", { topicTitle: "The verb to be · Pronouns and possessives", topicTitleVi: "Động từ to be · Đại từ & sở hữu" })).toBe("The verb to be (Động từ to be) · Pronouns and possessives (Đại từ & sở hữu)");
  });

  it("marks the be forms of 'pronoun + form' pieces, not the pronouns or the placeholder", () => {
    const segments = grammarFormulaSegments(BE_FORMULA);
    expect(joined(segments)).toBe(BE_FORMULA);
    expect(marked(segments)).toEqual(["am", "is", "is", "are", "are"]);
    expect(marked(grammarFormulaSegments("I'm / You're / He's + adjective"))).toEqual(["I'm", "You're", "He's"]);
    expect(marked(grammarFormulaSegments("I can / She will + base verb"))).toEqual(["can", "will", "base verb"]);
    const matcher = grammarExampleMatcher([BE_FORMULA]);
    expect(marked(grammarExampleSegments("I am the staff member at the front desk.", matcher))).toEqual(["am"]);
    expect(marked(grammarExampleSegments("She is our new staff leader.", matcher))).toEqual(["is"]);
    expect(marked(grammarExampleSegments("We are ready for the meeting.", matcher))).toEqual(["are"]);
    // Unsure pieces stay plain.
    expect(marked(grammarFormulaSegments("Anna works / The team meets + noun"))).toEqual([]);
  });

  it("renders the A1 card: label, bold name with Vietnamese, grey usage, full-width band with be forms, marked chips", () => {
    const { container } = show(a1BeGrammar, "A1");
    const name = container.querySelector(".lesson-grammar-name")!;
    expect(name).toHaveTextContent("The verb to be (Động từ to be)");
    expect(name.querySelector("strong")).not.toBeNull();
    const band = container.querySelector(".lesson-study-formula-band")!;
    expect(band).toHaveClass("lesson-study-formula-box");
    expect(band).toHaveTextContent(BE_FORMULA);
    expect(Array.from(band.querySelectorAll(".lesson-study-mark")).map((node) => node.textContent)).toEqual(["am", "is", "is", "are", "are"]);
    const chip = screen.getByRole("button", { name: "Nghe câu ví dụ: She is our new staff leader." });
    expect(chip.querySelector(".lesson-study-mark")).toHaveTextContent("is");
    expect(follows(name, band)).toBe(true);
    expect(follows(band, chip)).toBe(true);
  });

  it("renders the B1 name in English only from the planned topic", () => {
    const { container } = show({ ...b1Grammar, content: { ...b1Grammar.content, dailyCode: undefined, objective: "Notice routines.", topicTitle: "Present simple vs present continuous", topicTitleVi: "Hiện tại đơn vs tiếp diễn" } });
    expect(container.querySelector(".lesson-grammar-name")).toHaveTextContent(/^Present simple vs present continuous$/u);
  });
});

describe("grammar formula boxes", () => {
  const lines = (value: string) => [value.trim()];
  it("keeps a single correct formula in one box", () => {
    expect(grammarFormulaBoxes(BE_FORMULA, "vi", lines)).toEqual([{ tone: "neutral", lines: [BE_FORMULA] }]);
  });

  it("splits correct vs wrong patterns into a green and a red box", () => {
    expect(grammarFormulaBoxes("✓ I am a manager / ✗ I a manager", "vi", lines)).toEqual([
      { tone: "correct", label: "Đúng", lines: ["I am a manager"] },
      { tone: "wrong", label: "Sai", lines: ["I a manager"] }
    ]);
    expect(grammarFormulaBoxes("She works here (not: She work here)", "en", lines)).toEqual([
      { tone: "correct", label: "Correct", lines: ["She works here"] },
      { tone: "wrong", label: "Incorrect", lines: ["She work here"] }
    ]);
    expect(grammarFormulaBoxes("Đúng: He is busy. Sai: He busy.", "vi", lines).map((box) => box.tone)).toEqual(["correct", "wrong"]);
  });

  it("shows two compared structures as two boxes, named from the topic", () => {
    expect(grammarFormulaBoxes("Subject + V/V-s vs Subject + am/is/are + V-ing", "en", lines, ["Present simple", "present continuous"])).toEqual([
      { tone: "neutral", label: "Present simple", lines: ["Subject + V/V-s"] },
      { tone: "neutral", label: "present continuous", lines: ["Subject + am/is/are + V-ing"] }
    ]);
    // Rules separated by ";" are rows of one band (16/11), not two compared boxes.
    expect(grammarFormulaBoxes("Was/Were + subject + V-ing? ; past continuous + when + simple past", "en")).toEqual([{ tone: "neutral", lines: ["Was/Were + subject + V-ing?", "past continuous + when + simple past"] }]);
  });

  it("keeps one box when unsure", () => {
    expect(grammarFormulaBoxes("Subject + am/is/are + V-ing; Subject + am not + V-ing", "en", lines)).toHaveLength(1);
    expect(grammarFormulaBoxes("Use not only… but also for emphasis", "en", lines)).toHaveLength(1);
    expect(grammarFormulaBoxes("✗ I a manager", "vi", lines)).toHaveLength(1);
  });

  it("renders correct vs wrong side by side with tones and labels, slots still marked", () => {
    const { container } = show({ code: "grammar", title: "Ngữ pháp", content: { formula: "✓ I am / He is + noun ✗ I + noun", examples: ["I am a manager."] } }, "A1");
    const compare = container.querySelector(".lesson-study-formula-compare")!;
    const boxes = compare.querySelectorAll(".lesson-study-formula-box");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveClass("lesson-study-formula-box--correct");
    expect(boxes[0]).toHaveTextContent("Đúng");
    expect(Array.from(boxes[0]!.querySelectorAll(".lesson-study-mark")).map((node) => node.textContent)).toEqual(["am", "is"]);
    expect(boxes[1]).toHaveClass("lesson-study-formula-box--wrong");
    expect(boxes[1]).toHaveTextContent("Sai");
  });
});

describe("pronunciation target sound in the IPA", () => {
  it("marks the target sound inside each example IPA", () => {
    expect(marked(pronunciationTargetSegments("/siː/", "/iː/"))).toEqual(["iː"]);
    expect(joined(pronunciationTargetSegments("/kliːn/", "/iː/"))).toBe("/kliːn/");
    expect(marked(pronunciationTargetSegments("/friː/", "/iː/"))).toEqual(["iː"]);
    expect(marked(pronunciationTargetSegments("/ˈθɪŋk/", "/θ/"))).toEqual(["θ"]);
  });

  it("skips occurrences that are only part of a longer symbol, and marks nothing when absent", () => {
    expect(marked(pronunciationTargetSegments("/tʃeɪndʒ/", "/t/"))).toEqual([]);
    expect(marked(pronunciationTargetSegments("/meɪk/", "/e/"))).toEqual([]);
    expect(marked(pronunciationTargetSegments("/siː/", "/ɪ/"))).toEqual([]);
    expect(marked(pronunciationTargetSegments("/siː/", "/i/"))).toEqual([]);
    expect(marked(pronunciationTargetSegments("/bɪg/", "/iː/"))).toEqual([]);
  });

  it("renders the A1 chips with the target sound marked in the IPA", () => {
    show({ code: "pronunciation", title: "Phát âm", content: { focus: "/iː/", words: [{ word: "see", ipa: "/siː/" }, { word: "free", ipa: "/friː/" }, { word: "clean", ipa: "/kliːn/" }] } }, "A1");
    const chip = screen.getByRole("button", { name: "Nghe từ phát âm: clean" });
    expect(chip).toHaveTextContent("clean /kliːn/");
    expect(Array.from(chip.querySelectorAll(".lesson-study-mark")).map((node) => node.textContent)).toEqual(["iː"]);
  });

  it("marks the target at B1 too", () => {
    show({ code: "pronunciation", title: "Pronunciation", content: { focus: "/θ/", words: [{ word: "think", ipa: "/θɪŋk/" }] } });
    expect(screen.getByRole("button", { name: "Listen to pronunciation word: think" }).querySelector(".lesson-study-mark")).toHaveTextContent("θ");
  });
});
