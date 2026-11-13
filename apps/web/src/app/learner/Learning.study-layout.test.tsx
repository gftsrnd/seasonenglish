// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharedLessonPartContent } from "./Learning.js";
import { learnerLessonCopy } from "../shared/lesson/language.js";

afterEach(cleanup);
const show = (code: "grammar" | "pronunciation", content: Record<string, unknown>) => render(<SharedLessonPartContent
  cefr="A1" language="vi" copy={learnerLessonCopy.vi} grammarAvailable sectionNumber={1}
  part={{ code, title: code, content } as never} speak={vi.fn()} openVocabularyModal={vi.fn()} />);

it("keeps grammar study compact and places its objective above the formula box, without an inline quiz", () => {
  const objective = "Nhận biết cách thêm -s cho he, she, it.";
  const {container} = show("grammar", { dailyCode: "A1", objective, formula: "Subject + V / V-s", text: "Dùng thì hiện tại đơn để nói về lịch làm việc.", examples: ["The team meets on Monday."], items: [{prompt: "The team ____.", options:["meets","meet","meeting","met"],answer:"meets"}] });
  const formula=container.querySelector(".lesson-study-formula-box")!;
  expect(formula).toHaveTextContent("Subject + V / V-s");
  expect(screen.getByText(objective).compareDocumentPosition(formula) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector("fieldset")).toBeNull();
  expect(screen.queryByText("The team ____." )).not.toBeInTheDocument();
});

it.each(["Thì hiện tại đơn diễn tả thói quen trong công việc.", "Dùng để diễn tả thói quen trong công việc.", "Dùng khi diễn tả thói quen trong công việc."])("keeps long authored grammar notes available behind a closed disclosure: %s", (first) => {
  const detail="Với I, you, we, they, dùng động từ nguyên mẫu; với he, she, it thêm -s hoặc -es. ".repeat(4).trim();
  const {container}=show("grammar", {formula:"Subject + V",text:`${first} ${detail}`});
  expect(screen.getByText(first.replace(/^Dùng khi /u,"Dùng để "))).toBeVisible();
  const details=container.querySelector("details")!;
  expect(details).not.toHaveAttribute("open");
  expect(details).toHaveTextContent(detail);
});

it("places pronunciation guidance below its main sound and above the example words", () => {
  const objective="Nghe, nhận diện và tập tạo âm mục tiêu; lặp lại ba từ theo mẫu.";
  show("pronunciation", {focus:"/iː/",objective,words:[{word:"team",ipa:"/tiːm/"}]});
  const target=screen.getByText("Âm /iː/ như trong “team”");
  const guidance=screen.getByText(objective);
  expect(target.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(guidance.compareDocumentPosition(screen.getByRole("button",{name:"Nghe từ phát âm: team"})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
