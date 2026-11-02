import { describe, expect, it } from "vitest";
import {
  MONTH_BRIEF_STATUSES,
  MONTH_FRAMEWORK_STATUSES,
  MONTH_LESSON_STATUSES
} from "../src/monthly-contract.js";

describe("monthly content contract", () => {
  it("keeps the monthly lifecycle states explicit for API and UI clients", () => {
    expect(MONTH_BRIEF_STATUSES).toEqual(["missing", "draft", "approved"]);
    expect(MONTH_FRAMEWORK_STATUSES).toEqual(["missing", "draft", "generating", "approved", "failed"]);
    expect(MONTH_LESSON_STATUSES).toEqual(["pending", "generating", "draft", "approved", "failed"]);
  });
});
