import { describe, expect, it } from "vitest";
import { grammarFormulaLines } from "./presentation.js";
import { grammarFormulaBoxes } from "./study-highlight.js";

it("NP-02, NP-005 and NP-006 clarify A1 formulas without changing the rules", () => {
  expect(grammarFormulaBoxes("Chủ ngữ + am/is/are + (không bỏ) + danh từ/tính từ/nơi chốn", "vi")[0]?.lines)
    .toEqual(["Chủ ngữ + am/is/are + danh từ/tính từ/nơi chốn"]);
  expect(grammarFormulaBoxes("Do/Does + chủ ngữ + V?", "vi")[0]?.lines).toEqual(["Do/Does + chủ ngữ + V (base form)?"]);
  expect(grammarFormulaBoxes("Do + I/you/we/they + V?\nDoes + he/she/it + V?", "vi")[0]?.lines).toEqual([
    "Do + I/you/we/they/chủ ngữ số nhiều + V (base form)?",
    "Does + he/she/it + V (base form)?"
  ]);
  expect(grammarFormulaBoxes("Chủ ngữ + am / is / are (không được bỏ quên) + danh từ", "vi")[0]?.lines)
    .toEqual(["Chủ ngữ + am / is / are + danh từ"]);
  expect(grammarFormulaBoxes("Subject + am/is/are + (not) + adjective", "en")[0]?.lines)
    .toEqual(["Subject + am/is/are + (not) + adjective"]);
  expect(grammarFormulaBoxes("Do or does + the subject + V?", "en")[0]?.lines)
    .toEqual(["Do or does + the subject + V (base form)?"]);
  expect(grammarFormulaBoxes("Did + the subject + V?", "en")[0]?.lines)
    .toEqual(["Did + the subject + V?"]);
  expect(grammarFormulaBoxes("I/You/We/They + V (base form)\nHe/She/It + V-s/es", "vi")[0]?.lines).toEqual([
    "I/You/We/They/chủ ngữ số nhiều + V (base form)",
    "He/She/It/chủ ngữ số ít + V-s/es"
  ]);
});

describe("grammarFormulaLines", () => {
  it("puts two named patterns written as sentences on separate lines", () => {
    expect(grammarFormulaLines("Past simple: Subject + verb-ed / irregular past (I finished the report, then I sent it). Past continuous: Subject + was/were + verb-ing (I was writing the report when the call came)")).toEqual([
      "Past simple: Subject + verb-ed / irregular past (I finished the report, then I sent it)",
      "Past continuous: Subject + was/were + verb-ing (I was writing the report when the call came)"
    ]);
  });
  it("keeps a single pattern on one line", () => {
    expect(grammarFormulaLines("Subject + was/were + V-ing")).toEqual(["Subject + was/were + V-ing"]);
  });
});

describe("one formula rule per row (16/11, B1 December)", () => {
  const live = "Subject + (always) + am/is/are + verb-ing for complaints; Subject + present simple for facts and state verbs";
  it("puts each top-level \";\" rule and each line on its own row", () => {
    expect(grammarFormulaLines(live)).toEqual(["Subject + (always) + am/is/are + verb-ing for complaints", "Subject + present simple for facts and state verbs"]);
    expect(grammarFormulaLines("Subject + V-ing\nSubject + V-ed")).toEqual(["Subject + V-ing", "Subject + V-ed"]);
    expect(grammarFormulaLines("Subject + V (work; works)")).toEqual(["Subject + V (work; works)"]);
  });
  it("shows the rules as rows of one band, not as one line or two compare boxes", () => {
    expect(grammarFormulaBoxes(live, "en", grammarFormulaLines)).toEqual([{ tone: "neutral", lines: ["Subject + (always) + am/is/are + verb-ing for complaints", "Subject + present simple for facts and state verbs"] }]);
    expect(grammarFormulaBoxes("Subject + am/is/are + V-ing ; Subject + V-s", "en")).toEqual([{ tone: "neutral", lines: ["Subject + am/is/are + V-ing", "Subject + V-s"] }]);
    expect(grammarFormulaBoxes("Subject + V-ed\nSubject + was/were + V-ing", "en")).toEqual([{ tone: "neutral", lines: ["Subject + V-ed", "Subject + was/were + V-ing"] }]);
  });
});
