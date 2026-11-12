import { describe, expect, it } from "vitest";
import { gameWordContextSpan, pickGameWordExample, validGameWordExample } from "../src/engagement/index.js";

describe("Word sort context sentences", () => {
  it("finds the word, inflections and phrases as whole words", () => {
    expect(gameWordContextSpan("We need a change in the plan.", "change")).toEqual({ start: 10, end: 16 });
    expect(gameWordContextSpan("She changed the date.", "change")).not.toBeNull();
    expect(gameWordContextSpan("I am preparing a report.", "prepare")).not.toBeNull();
    expect(gameWordContextSpan("The team stopped early.", "stop")).not.toBeNull();
    expect(gameWordContextSpan("Two companies joined.", "company")).not.toBeNull();
    expect(gameWordContextSpan("I work with the AI team.", "work with")).toEqual({ start: 2, end: 11 });
    expect(gameWordContextSpan("Interchangeable parts.", "change")).toBeNull();
    expect(gameWordContextSpan("A new colleague.", "role")).toBeNull();
  });

  it("keeps only short lines that contain the word", () => {
    expect(validGameWordExample("  We need a   change. ", "change")).toBe("We need a change.");
    expect(validGameWordExample("We need a new plan.", "change")).toBeUndefined();
    expect(validGameWordExample("change", "change")).toBeUndefined();
    expect(validGameWordExample(`${"very ".repeat(20)}change`, "change")).toBeUndefined();
    expect(validGameWordExample(42, "change")).toBeUndefined();
  });

  it("prefers a full lesson sentence, then the longest collocation containing the word", () => {
    expect(pickGameWordExample("work with", { examples: ["I work with the AI team."] })).toBe("I work with the AI team.");
    expect(pickGameWordExample("delegate", { collocations: ["a team delegate", "the delegate list from finance", "proxy vote"] })).toBe("the delegate list from finance");
    expect(pickGameWordExample("colleague", { examples: ["my colleague"], collocations: ["a new colleague"] })).toBe("a new colleague");
    expect(pickGameWordExample("role", { examples: ["my job"], collocations: [] })).toBeUndefined();
  });
});
