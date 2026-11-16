// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonDraftInput } from "@e4s/contracts";
import { ModalProvider } from "../shared/ModalProvider.js";
import { LessonFormEditor } from "./LessonFormEditor.js";
import { readGrammarDraft, writeGrammarDraft } from "./lesson-editor-grammar.js";
import { readPronunciationDraft, writePronunciationDraft } from "./lesson-editor-pronunciation.js";
import { monthlyDayGrammarSteps } from "./monthly-day-grammar-steps.js";

afterEach(cleanup);

type Content = Record<string, unknown>;
type Lesson = ContentLessonDraftInput;
const marks = (row: number, ...words: string[]) => ({ row, marks: words });

/** Shape of the 4300 B1 2026-12 days with two grammar points and four review sounds (lessons 17/19): steps + reviewTargets + passage. */
const twoPointGrammar = (): Content => ({
  text: "Use the present for facts and the past for finished actions.",
  items: [{ id: "g1", prompt: "Choose.", options: ["a", "b", "c", "d"], answer: "a", explanation: "Why.", variants: [{ id: "g1-v1", prompt: "Again.", options: ["a", "b", "c", "d"], answer: "b", explanation: "Why again." }] }],
  steps: [
    { text: "Use the present simple for facts and state verbs.", formula: "Subject + (always) + am/is/are + verb-ing for complaints; Subject + present simple for facts and state verbs", examples: ["My manager is always changing the goal.", "I know the new branch manager well.", "Our team meets every Monday."], exampleMarks: [marks(1, "is", "always", "changing"), marks(2, "know"), marks(2, "meets")] },
    { text: "Use the past simple for finished actions and the past continuous for background actions.", formula: "Subject + past simple / past continuous + when/while + clause\nSubject + have/has (got) + noun for possession", examples: ["When I joined the team, we had a small budget.", "While the team was reviewing the task, the printer broke.", "We have got a clear goal.", "She was writing when he called.", "They had a meeting yesterday."], exampleMarks: [marks(1, "joined", "had"), marks(1, "was", "reviewing", "broke"), marks(2, "have", "got"), marks(1, "was", "writing", "called"), marks(1, "had")] }
  ],
  formula: "Subject + (always) + am/is/are + verb-ing for complaints; Subject + present simple for facts and state verbs\nSubject + past simple / past continuous + when/while + clause; Subject + have/has (got) + noun for possession",
  examples: ["My manager is always changing the goal.", "I know the new branch manager well.", "When I joined the team, we had a small budget.", "While the team was reviewing the task, the printer broke.", "We have got a clear goal."],
  exampleMarks: [marks(1, "is", "always", "changing"), marks(2, "know"), marks(3, "joined", "had"), marks(3, "was", "reviewing", "broke"), marks(4, "have", "got")],
  dailyCode: "K3",
  objective: "Workplace task: describe current and previous jobs.",
  milestoneIds: ["b1-grammar-1-step-3", "b1-grammar-2-step-3"],
  recallMilestoneIds: []
});
const fourSoundPronunciation = (): Content => ({
  focus: "/-ed=t/", stage: "voice_note",
  words: [{ ipa: "/ɑːskt/", word: "asked" }, { ipa: "/tʃekt/", word: "checked" }, { ipa: "/ˈfɪnɪʃt/", word: "finished" }],
  objective: "Record a workplace voice note using the month's sounds.",
  reviewTargets: [
    { focus: "/-ed=t/", words: [{ ipa: "/ɑːskt/", word: "asked" }, { ipa: "/tʃekt/", word: "checked" }], soundId: "b1-sound-1" },
    { focus: "/-ed=d/", words: [{ ipa: "/kɔːld/", word: "called" }, { ipa: "/plænd/", word: "planned" }], soundId: "b1-sound-2" },
    { focus: "/-ed=ɪd/", words: [{ ipa: "/ˈstɑːtɪd/", word: "started", audioUrl: "/a/started.mp3" }, { ipa: "/ˈniːdɪd/", word: "needed" }], soundId: "b1-sound-3" },
    { focus: "/-ed‿V/", words: [{ ipa: "/bʊkt‿ɪt/", word: "booked it" }, { ipa: "/muːvd‿ɒn/", word: "moved on" }], soundId: "b1-sound-4" }
  ],
  passage: "We asked and checked, called and planned, started what we needed, booked it and moved on.",
  targetPositions: [{ soundId: "b1-sound-1", exampleId: "b1-sound-1-word-1" }]
});
const lessonWith = (grammar: Content, pronunciation: Content): Lesson => ({ dayNumber: 16, title: "Year-End Review", durationMinutes: 10, parts: [
  { code: "objective", title: "Mục tiêu bài học", content: { text: "Review", items: [{ text: "Review" }] } },
  { code: "grammar", title: "Ngữ pháp", content: grammar },
  { code: "pronunciation", title: "Phát âm", content: pronunciation }
] });
/** Shape of the 4300 B1 2026-12 day 1 (one grammar topic, one sound). */
const singleGrammar = (): Content => ({
  text: "We use the present simple for routines and facts at work.",
  items: [{ id: "g1", prompt: "Choose.", options: ["a", "b", "c", "d"], answer: "a", explanation: "Why.", milestoneId: "b1-grammar-1-step-1" }],
  formula: "Subject + base verb (he/she/it + -s) + object",
  examples: ["Our manager reviews the weekly report every Friday.", "The team completes the plan before the meeting.", "Linh knows the tool well."],
  dailyCode: "A1", objective: "Day 1: notice the present simple.",
  exampleMarks: [marks(1, "reviews"), marks(1, "completes"), marks(1, "knows")],
  milestoneIds: ["b1-grammar-1-step-1"], recallMilestoneIds: []
});
const singlePronunciation = (): Content => ({ focus: "/-ed=t/", stage: "recognize", words: [{ ipa: "/ɑːskt/", word: "asked" }, { ipa: "/tʃekt/", word: "checked" }, { ipa: "/ˈfɪnɪʃt/", word: "finished" }], objective: "Hear and produce the target sound." });

async function save(user: ReturnType<typeof userEvent.setup>, onSave: ReturnType<typeof vi.fn>): Promise<{ grammar: Content; pronunciation: Content }> {
  await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
  const force = screen.queryByRole("button", { name: "Lưu dù còn thiếu" });
  if (force) { await user.click(force); await user.click(screen.getByRole("button", { name: "Lưu tạm" })); }
  else await user.click(screen.getAllByRole("button", { name: "Kiểm tra & lưu" }).at(-1)!);
  const lesson = onSave.mock.calls.at(-1)![0] as Lesson;
  return { grammar: lesson.parts.find(part => part.code === "grammar")!.content as Content, pronunciation: lesson.parts.find(part => part.code === "pronunciation")!.content as Content };
}
const open = (initial: Lesson, kind: "lesson" | "review" = "review", onSave = vi.fn()) => {
  render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="B1" monthly kind={kind} vocabularyCount={1} grammarStepLabels={{ "b1-grammar-1-step-3": "Present: complaints and state verbs", "b1-grammar-2-step-3": "Past: when/while and possession" }} initial={initial} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
  return onSave;
};

describe("Sửa tay mirrors the lesson view: grammar points and pronunciation sounds", () => {
  it("review day with 2 grammar points and 4 sounds: one block each, every example and word, the passage after the sounds", () => {
    open(lessonWith(twoPointGrammar(), fourSoundPronunciation()));
    const points = screen.getAllByRole("group", { name: /^Điểm ngữ pháp \d$/u });
    expect(points).toHaveLength(2);
    expect(points[0]).toHaveTextContent("Present: complaints and state verbs");
    expect(within(points[0]!).getByLabelText("Giải thích điểm ngữ pháp 1")).toHaveValue("Use the present simple for facts and state verbs.");
    // One formula line per stored line; the second point has two.
    expect(within(points[1]!).getByLabelText("Công thức điểm ngữ pháp 2 – dòng 1")).toHaveValue("Subject + past simple / past continuous + when/while + clause");
    expect(within(points[1]!).getByLabelText("Công thức điểm ngữ pháp 2 – dòng 2")).toHaveValue("Subject + have/has (got) + noun for possession");
    // Examples belong to their point, as many as stored, no "tối đa 3" hint; the view shows the first 3.
    expect(within(points[0]!).getAllByLabelText(/^Điểm 1 – câu ví dụ \d$/u)).toHaveLength(3);
    expect(within(points[1]!).getAllByLabelText(/^Điểm 2 – câu ví dụ \d$/u)).toHaveLength(5);
    expect(within(points[1]!).getByLabelText("Điểm 2 – câu ví dụ 4")).toHaveValue("She was writing when he called.");
    expect(points[1]).toHaveTextContent("Học viên thấy 3 câu đầu.");
    expect(screen.queryByText(/tối đa 3/u)).toBeNull();

    const sounds = screen.getAllByRole("group", { name: /^Âm luyện \d$/u });
    expect(sounds).toHaveLength(4);
    expect(within(sounds[2]!).getByLabelText("Âm mục tiêu 3")).toHaveValue("/-ed=ɪd/");
    expect(within(sounds[2]!).getByLabelText("Âm 3 – từ 1")).toHaveValue("started");
    expect(within(sounds[2]!).getByLabelText("Phiên âm âm 3 – từ 1")).toHaveValue("/ˈstɑːtɪd/");
    expect(screen.queryByText(/Ô bên dưới là âm hiển thị đầu tiên/u)).toBeNull();
    // B1: the rule, "How to remember" and "Common mistake" come from the level catalog, read-only, as the view shows them.
    const rule = within(sounds[0]!).getByRole("note", { name: "Quy tắc âm 1" });
    expect(rule).toHaveTextContent("How to remember:");
    expect(rule).toHaveTextContent("Common mistake:");
    expect(rule.querySelector("textarea, input")).toBeNull();
    // The shared passage comes after the sounds, in the Phát âm section only.
    const passage = screen.getByLabelText("Đoạn đọc luyện âm");
    expect(passage).toHaveValue("We asked and checked, called and planned, started what we needed, booked it and moved on.");
    expect(sounds[3]!.compareDocumentPosition(passage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByLabelText("Đoạn đọc luyện âm")).toHaveLength(1);
  });

  it("round trip: a save with no edit writes grammar and pronunciation back exactly as stored", async () => {
    const user = userEvent.setup();
    const onSave = open(lessonWith(twoPointGrammar(), fourSoundPronunciation()));
    const saved = await save(user, onSave);
    expect(saved.grammar).toEqual(twoPointGrammar());
    expect(saved.pronunciation).toEqual(fourSoundPronunciation());
  });

  it("an edited explanation changes only that field of that point", async () => {
    const user = userEvent.setup();
    const onSave = open(lessonWith(twoPointGrammar(), fourSoundPronunciation()));
    fireEvent.change(screen.getByLabelText("Giải thích điểm ngữ pháp 2"), { target: { value: "Past simple: finished. Past continuous: background." } });
    const saved = await save(user, onSave);
    const expected = twoPointGrammar();
    (expected.steps as Content[])[1]!.text = "Past simple: finished. Past continuous: background.";
    expect(saved.grammar).toEqual(expected);
    expect(saved.pronunciation).toEqual(fourSoundPronunciation());
  });

  it("an edited example drops only its own point's stale marks; a removed example takes nothing else with it", async () => {
    const user = userEvent.setup();
    const onSave = open(lessonWith(twoPointGrammar(), fourSoundPronunciation()));
    fireEvent.change(screen.getByLabelText("Điểm 1 – câu ví dụ 2"), { target: { value: "I need the report today." } });
    await user.click(screen.getByRole("button", { name: "Xoá điểm 2 – câu ví dụ 5" }));
    const saved = await save(user, onSave);
    const [first, second] = saved.grammar.steps as Content[];
    const [storedFirst, storedSecond] = twoPointGrammar().steps as Content[];
    expect(first).toEqual({ text: storedFirst!.text, formula: storedFirst!.formula, examples: ["My manager is always changing the goal.", "I need the report today.", "Our team meets every Monday."] });
    expect(second!.examples).toEqual((storedSecond!.examples as string[]).slice(0, 4));
    expect(second).not.toHaveProperty("exampleMarks");
    // The top level is not shown for a two-point day and stays as stored.
    const { steps: _steps, ...top } = saved.grammar;
    const { steps: _storedSteps, ...storedTop } = twoPointGrammar();
    expect(top).toEqual(storedTop);
  });

  it("an edited formula line rewrites that point's formula with one rule per line and drops its marks", async () => {
    const user = userEvent.setup();
    const onSave = open(lessonWith(twoPointGrammar(), fourSoundPronunciation()));
    fireEvent.change(screen.getByLabelText("Công thức điểm ngữ pháp 2 – dòng 2"), { target: { value: "Subject + have/has + noun" } });
    const saved = await save(user, onSave);
    const second = (saved.grammar.steps as Content[])[1]!;
    expect(second.formula).toBe("Subject + past simple / past continuous + when/while + clause\nSubject + have/has + noun");
    expect(second).not.toHaveProperty("exampleMarks");
    expect((saved.grammar.steps as Content[])[0]).toEqual((twoPointGrammar().steps as Content[])[0]);
  });

  it("an edited sound word changes only that word; its other stored fields and every other sound stay", async () => {
    const user = userEvent.setup();
    const onSave = open(lessonWith(twoPointGrammar(), fourSoundPronunciation()));
    fireEvent.change(screen.getByLabelText("Phiên âm âm 3 – từ 1"), { target: { value: "/ˈstɑːrtɪd/" } });
    fireEvent.change(screen.getByLabelText("Đoạn đọc luyện âm"), { target: { value: "We asked, called, started and booked it." } });
    const saved = await save(user, onSave);
    const expected = fourSoundPronunciation();
    ((expected.reviewTargets as Content[])[2]!.words as Content[])[0] = { ipa: "/ˈstɑːrtɪd/", word: "started", audioUrl: "/a/started.mp3" };
    expected.passage = "We asked, called, started and booked it.";
    expect(saved.pronunciation).toEqual(expected);
    expect(saved.grammar).toEqual(twoPointGrammar());
  });

  it("single-topic day: one grammar block and one sound block; round trip unchanged; the explanation saves into the field the view reads", async () => {
    const user = userEvent.setup();
    const onSave = open(lessonWith(singleGrammar(), singlePronunciation()), "lesson");
    expect(screen.getAllByRole("group", { name: /^Điểm ngữ pháp/u })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: /^Âm luyện/u })).toHaveLength(1);
    expect(screen.getByLabelText("Giải thích ngữ pháp")).toHaveValue("We use the present simple for routines and facts at work.");
    expect(screen.getByLabelText("Câu ví dụ ngữ pháp 3")).toHaveValue("Linh knows the tool well.");
    expect(screen.getByLabelText("Từ luyện âm 2")).toHaveValue("checked");
    expect(screen.getByLabelText("Phiên âm từ luyện âm 2")).toHaveValue("/tʃekt/");
    expect(screen.queryByLabelText("Đoạn đọc luyện âm")).toBeNull();
    const unchanged = await save(user, onSave);
    expect(unchanged.grammar).toEqual(singleGrammar());
    expect(unchanged.pronunciation).toEqual(singlePronunciation());
    cleanup();

    const onEdit = open(lessonWith(singleGrammar(), singlePronunciation()), "lesson");
    fireEvent.change(screen.getByLabelText("Giải thích ngữ pháp"), { target: { value: "Use the present simple for routines." } });
    fireEvent.change(screen.getByLabelText("Từ luyện âm 3"), { target: { value: "helped" } });
    fireEvent.change(screen.getByLabelText("Phiên âm từ luyện âm 3"), { target: { value: "/helpt/" } });
    const edited = await save(user, onEdit);
    expect(edited.grammar).toEqual({ ...singleGrammar(), text: "Use the present simple for routines." });
    expect(edited.pronunciation).toEqual({ ...singlePronunciation(), words: [{ ipa: "/ɑːskt/", word: "asked" }, { ipa: "/tʃekt/", word: "checked" }, { word: "helped", ipa: "/helpt/" }] });
  });

  it("validation stays in Vietnamese and names the point or sound", async () => {
    const user = userEvent.setup();
    open(lessonWith(twoPointGrammar(), fourSoundPronunciation()));
    for (const field of within(screen.getByRole("group", { name: "Điểm ngữ pháp 2" })).getAllByLabelText(/^Điểm 2 – câu ví dụ \d$/u)) fireEvent.change(field, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Âm mục tiêu 4"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    const alert = screen.getByText(/mục cần bổ sung/u).closest("[role=alert]")!;
    expect(alert).toHaveTextContent("Ngữ pháp – điểm 2: thiếu câu ví dụ");
    expect(alert).toHaveTextContent("Phát âm – âm 4: thiếu âm mục tiêu");
  });

  it("daily practice no longer has its own copy of the passage", () => {
    open(lessonWith(twoPointGrammar(), fourSoundPronunciation()), "lesson");
    const daily = screen.getByText("Luyện tập theo ngày", { selector: "legend" }).closest("fieldset")!;
    expect(within(daily).queryByLabelText("Đoạn đọc luyện âm")).toBeNull();
    expect(screen.getAllByLabelText("Đoạn đọc luyện âm")).toHaveLength(1);
  });
});

/** B1 2026-12 day 30/12 (lesson 22, "bài 30"), grammar as stored on 4300 (read via GET): no steps, 4-row formula, a mark per example. */
const day30Grammar = (): Content => ({
  text: "This mock test checks the present and past tenses you have studied this month.",
  formula: "Subject + (always) + am/is/are + verb-ing for complaints\nSubject + present simple for facts and state verbs\nSubject + past simple / past continuous + when/while + clause\nSubject + have/has (got) + noun for possession and obligation",
  examples: ["Our team investigates every measurable result before the year-end review.", "The manager is always changing the deadline, and it makes planning difficult.", "When the project started, we had a small budget and a short timeline.", "While the team was discussing the suggestion, the server went down.", "We have got a measurable goal for next year, and our team has a bigger budget."],
  dailyCode: "M3", objective: "Mock test: a short practice test.",
  exampleMarks: [marks(2, "investigates", "every"), marks(1, "is", "always", "changing"), marks(4, "had"), marks(3, "While", "was", "discussing"), marks(4, "have", "got")],
  milestoneIds: ["b1-grammar-1-step-3", "b1-grammar-2-step-3"], recallMilestoneIds: []
});
const present = { id: "b1-grammar-1-step-3", formula: "Subject + (always) + am/is/are + verb-ing for complaints; Subject + present simple for facts and state verbs" };
const past = { id: "b1-grammar-2-step-3", formula: "Subject + past simple / past continuous + when/while + clause; Subject + have/has (got) + noun for possession and obligation" };

describe("days whose grammar has 2 plan steps: the editor shows the preview's blocks (same example assignment)", () => {
  const openPlan = (grammar: Content, plan: Array<{ id: string; formula: string }>, onSave = vi.fn()) => {
    render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="B1" monthly vocabularyCount={1} grammarSteps={plan} initial={lessonWith(grammar, fourSoundPronunciation())} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
    return onSave;
  };
  const examplesOf = (point: number) => within(screen.getByRole("group", { name: `Điểm ngữ pháp ${point}` })).getAllByLabelText(new RegExp(`^Điểm ${point} – câu ví dụ \\d$`, "u")).map(field => (field as HTMLTextAreaElement).value);

  it("30/12: every example under its own point, in point order and in its original order; formulas read-only", () => {
    openPlan(day30Grammar(), [present, past]);
    expect(screen.getAllByRole("group", { name: /^Điểm ngữ pháp \d$/u })).toHaveLength(2);
    expect(examplesOf(1)).toEqual(["Our team investigates every measurable result before the year-end review.", "The manager is always changing the deadline, and it makes planning difficult."]);
    expect(examplesOf(2)).toEqual(["When the project started, we had a small budget and a short timeline.", "While the team was discussing the suggestion, the server went down.", "We have got a measurable goal for next year, and our team has a bigger budget."]);
    expect(screen.getByLabelText("Công thức điểm ngữ pháp 2 – dòng 1")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /Xoá dòng công thức/u })).toBeNull();
  });

  it("30/12: a save without edits keeps the stored grammar; an edit stores the preview's steps, and the preview then shows the editor's points", async () => {
    const user = userEvent.setup();
    const onSave = openPlan(day30Grammar(), [present, past]);
    expect((await save(user, onSave)).grammar).toEqual(day30Grammar());
    cleanup();

    const onEdit = openPlan(day30Grammar(), [present, past]);
    fireEvent.change(screen.getByLabelText("Điểm 2 – câu ví dụ 3"), { target: { value: "We have got a clear goal for next year." } });
    const saved = (await save(user, onEdit)).grammar;
    const { steps, ...top } = saved;
    expect(top).toEqual(day30Grammar());
    expect(steps).toEqual([
      { formula: present.formula, text: "", examples: ["Our team investigates every measurable result before the year-end review.", "The manager is always changing the deadline, and it makes planning difficult."], exampleMarks: [marks(2, "investigates", "every"), marks(1, "is", "always", "changing")] },
      { formula: past.formula, text: "", examples: ["When the project started, we had a small budget and a short timeline.", "While the team was discussing the suggestion, the server went down.", "We have got a clear goal for next year."] }
    ]);
    // What the preview builds from the saved lesson is what the editor showed.
    expect(readGrammarDraft(saved, [present, past]).points.map(point => point.examples.map(example => example.text))).toEqual([
      ["Our team investigates every measurable result before the year-end review.", "The manager is always changing the deadline, and it makes planning difficult."],
      ["When the project started, we had a small budget and a short timeline.", "While the team was discussing the suggestion, the server went down.", "We have got a clear goal for next year."]
    ]);
  });

  it("25/12 review (plan lists past before present): stored steps stay under their own plan formula", () => {
    const grammar = twoPointGrammar();
    grammar.steps = [...(grammar.steps as Content[])].reverse();
    openPlan(grammar, monthlyDayGrammarSteps([{ steps: [present] }, { steps: [past] }], [past.id, present.id]));
    expect(screen.getByLabelText("Công thức điểm ngữ pháp 1 – dòng 1")).toHaveValue("Subject + past simple / past continuous + when/while + clause; Subject + have/has (got) + noun for possession and obligation");
    expect(examplesOf(1)[0]).toBe("When I joined the team, we had a small budget.");
    expect(examplesOf(2)[0]).toBe("My manager is always changing the goal.");
  });

  it("the day's steps are taken in plan order, not resource order", () => {
    expect(monthlyDayGrammarSteps([{ steps: [present] }, { steps: [past] }], [past.id, present.id]).map(step => step.id)).toEqual([past.id, present.id]);
    expect(monthlyDayGrammarSteps([{ steps: [present] }], [past.id, present.id]).map(step => step.id)).toEqual([present.id]);
  });
});

describe("grammar / pronunciation drafts (pure)", () => {
  it("read → write without edits returns the stored object itself", () => {
    for (const content of [twoPointGrammar(), singleGrammar(), {}]) expect(writeGrammarDraft(content, readGrammarDraft(content))).toBe(content);
    for (const content of [fourSoundPronunciation(), singlePronunciation(), {}]) expect(writePronunciationDraft(content, readPronunciationDraft(content))).toBe(content);
  });

  it("an empty lesson starts with one grammar block of 3 examples and one sound of 3 words", () => {
    const grammar = readGrammarDraft({});
    expect(grammar.points).toHaveLength(1);
    expect(grammar.points[0]!.examples).toHaveLength(3);
    const pronunciation = readPronunciationDraft({});
    expect(pronunciation.sounds).toHaveLength(1);
    expect(pronunciation.sounds[0]!.words).toHaveLength(3);
  });

  it("single-topic: a new example keeps the stored per-example audio aligned and drops the stale marks", () => {
    const content = { formula: "was/were + V-ing", usage: "Past continuous.", examples: ["We were working.", "Was she calling?"], exampleAudioUrls: ["/e1.mp3", "/e2.mp3"], exampleMarks: [marks(1, "were", "working"), marks(1, "Was", "calling")] };
    const draft = readGrammarDraft(content);
    draft.points[0]!.examples[2] = { text: "They were sending files.", translation: "", source: -1 };
    const written = writeGrammarDraft(content, draft);
    expect(written).toEqual({ formula: "was/were + V-ing", usage: "Past continuous.", examples: ["We were working.", "Was she calling?", "They were sending files."], exampleAudioUrls: ["/e1.mp3", "/e2.mp3", ""] });
  });

  it("a review target without words is not a view block and is kept untouched", () => {
    const content = { focus: "/θ/", words: ["think"], reviewTargets: [{ focus: "/θ/", words: [{ word: "think", ipa: "/θɪŋk/" }] }, { focus: "/ð/", words: [] }] };
    const draft = readPronunciationDraft(content);
    expect(draft.sounds).toHaveLength(1);
    draft.sounds[0]!.focus = "/θ/ ";
    expect((writePronunciationDraft(content, draft).reviewTargets as Content[])[1]).toBe(content.reviewTargets[1]);
  });
});
