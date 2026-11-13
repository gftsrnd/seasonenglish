// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedLessonPartContent } from "./Learning.js";
import { learnerLessonCopy } from "../shared/lesson/language.js";
import { OperatorLessonPreview } from "../operator/adapters.js";

afterEach(cleanup);
const GENERIC = "Distinguish the target from a confusable sound or feature in words; read before hearing the model";
const edT = { focus: "/-ed=t/", stage: "discriminate", objective: GENERIC, words: [{ word: "helped", ipa: "/helpt/" }, { word: "looked", ipa: "/lʊkt/" }, { word: "missed", ipa: "/mɪst/" }] };

describe("pronunciation rule block", () => {
  it("shows the B1 -ed rule, memory hint and common mistake above the chips instead of the generic line (published lesson, no catalogId)", () => {
    render(<SharedLessonPartContent cefr="B1" language="en" copy={learnerLessonCopy.en} grammarAvailable sectionNumber={1}
      part={{ code: "pronunciation", title: "Pronunciation", content: edT } as never} speak={vi.fn()} openVocabularyModal={vi.fn()} />);
    const rule = screen.getByText(/-ed is \/t\/ after the voiceless sounds/u);
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
    const remember = screen.getByText("How to remember:").parentElement!;
    const mistake = screen.getByText("Common mistake:").parentElement!;
    expect(mistake).toHaveTextContent(/every -ed as \/ɪd\//u);
    const chip = screen.getByRole("button", { name: "Listen to pronunciation word: helped" });
    for (const [a, b] of [[rule, remember], [remember, mistake], [mistake, chip]] as const) expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body).not.toHaveTextContent(/month\s*\d|tháng\s*\d/iu);
  });

  it("shows the same rule in the operator lesson preview", () => {
    render(<OperatorLessonPreview cefr="B1" lessonId="l1" parts={[{ code: "pronunciation", title: "Pronunciation", content: edT }] as never} />);
    expect(screen.getByText(/-ed is \/t\/ after the voiceless sounds/u)).toBeInTheDocument();
    expect(screen.getByText("How to remember:")).toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it("keeps A1–A2 pronunciation guidance unchanged", () => {
    const objective = "Nghe, nhận diện và tập tạo âm mục tiêu; lặp lại ba từ theo mẫu.";
    render(<SharedLessonPartContent cefr="A2" language="vi" copy={learnerLessonCopy.vi} grammarAvailable sectionNumber={1}
      part={{ code: "pronunciation", title: "Phát âm", content: { focus: "/iː/", objective, words: [{ word: "team", ipa: "/tiːm/" }] } } as never} speak={vi.fn()} openVocabularyModal={vi.fn()} />);
    expect(screen.getByText(objective)).toBeInTheDocument();
    expect(screen.queryByText("Cách nhớ:")).not.toBeInTheDocument();
    expect(screen.queryByText("Lỗi hay gặp:")).not.toBeInTheDocument();
  });
});
