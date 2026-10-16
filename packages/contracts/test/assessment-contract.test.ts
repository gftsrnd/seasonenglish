import { describe, expect, it } from "vitest";
import type { AssessmentReviewOverviewView, AssessmentRuntimeView, AssessmentView } from "@e4s/contracts";

describe("assessment runtime contract", () => {
  it("describes authoritative timer, integrity, submit and media state", () => {
    const runtime = {
      remainingSeconds: 299,
      violationCount: 1,
      violationLimit: 3,
      submitReason: null,
      status: "in_progress",
      currentSection: "listening",
      audioPlayCounts: { "listening:LA": 1 },
      deviceEvidence: {
        microphoneSupported: true,
        microphoneState: "idle",
        soundCheck: "passed"
      },
      mediaEvidence: {
        recordings: {},
        uploads: []
      }
    } satisfies AssessmentRuntimeView;

    const view = { runtime } as Pick<AssessmentView, "runtime">;

    expect(view.runtime!.remainingSeconds).toBe(299);
    expect(view.runtime!.violationCount).toBe(1);
    expect(view.runtime!.violationLimit).toBe(3);
    expect(view.runtime!.audioPlayCounts["listening:LA"]).toBe(1);
    expect(view.runtime!.mediaEvidence.uploads).toEqual([]);
  });

  it("allows the server to explain why a submitted attempt transitioned", () => {
    const reasons: AssessmentRuntimeView["submitReason"][] = ["manual", "timeout", "violations", null];
    expect(reasons).toContain("violations");
  });

  it("describes persisted level-up flow evidence and its detail actions", () => {
    const signals = {
      windowDays: 14,
      ready: [],
      weak: [],
      inFlow: [{
        learnerId: "learner-1",
        learnerName: "Lan",
        currentLevel: "A2",
        targetLevel: "B1",
        phase: "challenge",
        metrics: "đang thử thách Season (2/6)",
        assessmentAttemptId: "attempt-1",
        challengeAttemptId: "attempt-1"
      }]
    } satisfies AssessmentReviewOverviewView["levelSignals"];

    expect(signals.inFlow[0]).toMatchObject({ phase: "challenge", assessmentAttemptId: "attempt-1" });
  });
});
