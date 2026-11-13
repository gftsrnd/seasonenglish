import { describe, expect, it } from "vitest";
import { describeMonthlyFindings } from "./monthly-failure-findings.js";

const practice = (code: string, content: Record<string, unknown> = { prompt: "Q", options: ["a", "b"], answer: "a" }) => ({ code, content });
const dailyParts = [
  { code: "instruction", content: {} }, { code: "vocabulary", content: { items: [] } },
  practice("listening"), practice("reading"), practice("writing"), practice("word_class"),
  practice("word_use", { prompt: "Choose", options: ["My colleague sent me the report.", "My colleague made the report.", "My colleague was colleagueing me with the client report.", "Report me."], answer: "My colleague sent me the report." }),
  practice("speaking")
];
const invented = { severity: "severe" as const, code: "MONTHLY_INVENTED_WORD_FORM", component: "word_use", dayNumber: 3, message: "Every option must be a real, correctly formed English word or phrase; replace invented forms such as sended/maked/feedbacked with real forms (sent, made, gave feedback). Fix: word_use (colleagueing)" };

describe("describeMonthlyFindings", () => {
  it("says where (exercise number as the preview shows it) and what to fix, in Vietnamese", () => {
    expect(describeMonthlyFindings([invented], { kind: "new", parts: dailyParts })).toEqual([{
      key: "MONTHLY_INVENTED_WORD_FORM-0-0", code: "MONTHLY_INVENTED_WORD_FORM", component: "word_use", severity: "severe", where: "Câu 5 · Dùng từ",
      what: "Lựa chọn C dùng từ không có thật “colleagueing”; thay bằng một từ tiếng Anh có thật.", option: 2
    }]);
  });

  it("splits a grouped finding into one line per question and names review sections and items", () => {
    const parts = [{ code: "word_use", content: { items: [{ prompt: "1", options: ["ok", "fine"], answer: "ok" }, { prompt: "2", options: ["he sended it", "he sent it"], answer: "he sent it" }] } }];
    const lines = describeMonthlyFindings([{ ...invented, message: "Every option must be real. Fix: word_use item 2 (sended); word_use item 1 variant 1 (maked)" }], { kind: "review", parts });
    expect(lines.map((line) => `${line.where}: ${line.what}`)).toEqual([
      "Phần 2 · Word use · câu 2: Lựa chọn A dùng từ không có thật “sended”; thay bằng một từ tiếng Anh có thật.",
      "Phần 2 · Word use · câu 1 (bản làm lại 1): Có từ không có thật “maked”; thay bằng một từ tiếng Anh có thật."
    ]);
    // The editor lands on the exact question, retry version and answer choice.
    expect(lines.map(({ item, variant, option }) => ({ item, variant, option }))).toEqual([{ item: 2, variant: undefined, option: 0 }, { item: 1, variant: 1, option: undefined }]);
  });

  it("maps answer-key findings and keeps the gate text for unknown codes", () => {
    const lines = describeMonthlyFindings([
      { severity: "severe", code: "MONTHLY_ANSWER_NOT_UNIQUE", component: "word_class", message: "Every item must have exactly one correct option; rewrite the sentence: word_class: \"decision\" and \"decisions\" are all correct" },
      { severity: "light", code: "MONTHLY_SOMETHING_NEW", component: "grammar", message: "Raw gate text" }
    ], { kind: "new", parts: dailyParts });
    expect(lines.map((line) => `${line.where}: ${line.what}`)).toEqual([
      "Câu 4 · Từ loại: Có nhiều lựa chọn cùng đúng (“decision”, “decisions”); viết lại câu hoặc thay các lựa chọn sai cho rõ.",
      "Ngữ pháp: Raw gate text"
    ]);
  });
});

describe("grammar formula vs examples warning (24/12 Bài 15)", () => {
  it("is a friendly light line per mismatching grammar step", () => {
    const finding = { severity: "light" as const, code: "MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH", component: "grammar", dayNumber: 15, message: "Grammar formula and examples do not match (the formula is locked). grammar.steps[0]: formula row \"x\" has no example that uses it | grammar.steps[1]: it has fewer examples than formula rows" };
    expect(describeMonthlyFindings([finding], { kind: "new", parts: dailyParts }).map((line) => `${line.severity} ${line.where}: ${line.what}`)).toEqual([
      "light Ngữ pháp · bước 1: Công thức ngữ pháp không khớp câu ví dụ; sửa tay công thức/ví dụ hoặc sinh lại ngày này.",
      "light Ngữ pháp · bước 2: Công thức ngữ pháp không khớp câu ví dụ; sửa tay công thức/ví dụ hoặc sinh lại ngày này."
    ]);
  });
});
