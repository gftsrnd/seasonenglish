import { describe, expect, it } from "vitest";
import { grammarExampleMatcher, grammarExampleSegments, grammarFormulaSegments, type HighlightSegment } from "./study-highlight.js";

const show = (segments: HighlightSegment[]) => segments.map((segment) => segment.mark ? `[${segment.text}]` : segment.text).join("");

describe("negative and question forms of to be", () => {
  const formula = "I am not / He isn't / They aren't + ...; Am I...? / Is he...? / Are you...?";
  const matcher = grammarExampleMatcher([formula]);

  it("marks the forms in negative and question patterns, never the pronouns", () => {
    expect(show(grammarFormulaSegments(formula, matcher))).toBe("I [am] [not] / He [isn't] / They [aren't] + ...; [Am] I...? / [Is] he...? / [Are] you...?");
  });

  it("marks the same forms in the examples", () => {
    expect(show(grammarExampleSegments("The project table is ready today.", matcher))).toBe("The project table [is] ready today.");
    expect(show(grammarExampleSegments("We are happy with the results this week.", matcher))).toBe("We [are] happy with the results this week.");
    expect(show(grammarExampleSegments("He isn't here.", matcher))).toBe("He [isn't] here.");
  });

  it("keeps short answers after a semicolon plain", () => {
    const line = "Subject + am/is/are + (not) + thành phần; Yes, I am. / No, he isn't.";
    expect(show(grammarFormulaSegments(line, grammarExampleMatcher([line])))).toBe("Subject + [am/is/are] + (not) + thành phần; Yes, I am. / No, he isn't.");
  });
});
