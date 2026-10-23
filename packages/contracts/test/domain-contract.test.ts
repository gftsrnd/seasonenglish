import { describe, expect, it } from "vitest";
import { ACCOUNT_ROLES, ASSESSMENT_KINDS, CEFR_LEVELS } from "../src/domain-contract.js";

describe("shared domain contract", () => {
  it("keeps role and learning enums stable across database, API and UI", () => {
    expect(ACCOUNT_ROLES).toEqual(["learner", "operator", "manager"]);
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1"]);
    expect(ASSESSMENT_KINDS).toEqual(["placement", "level-up"]);
  });
});
