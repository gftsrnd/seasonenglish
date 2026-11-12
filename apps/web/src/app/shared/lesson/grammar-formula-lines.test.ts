import { describe, expect, it } from "vitest";
import { grammarFormulaLines } from "./presentation.js";

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
