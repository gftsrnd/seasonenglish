import { describe, expectTypeOf, it } from "vitest";
import type { AuthClient, LoginCredentials } from "../src/features/auth/contracts.js";
import type { LessonSpeechOptions, LessonSpeechStatus } from "../src/features/experience/contracts.js";

describe("shared feature contracts", () => {
  it("keeps authentication independent from either login screen", () => {
    expectTypeOf<AuthClient["learnerLogin"]>().parameter(0).toEqualTypeOf<LoginCredentials>();
    expectTypeOf<AuthClient["staffLogin"]>().parameter(0).toEqualTypeOf<LoginCredentials>();
  });

  it("keeps speech status independent from learner presentation contracts", () => {
    expectTypeOf<NonNullable<LessonSpeechOptions["onStatus"]>>()
      .parameter(0)
      .toEqualTypeOf<LessonSpeechStatus>();
  });
});
