import { describe, expect, it } from "vitest";
import { grammarFormulaLines } from "./presentation.js";
import { grammarFormulaBoxes } from "./study-highlight.js";

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
