import { describe, expect, it } from "vitest";
import { publicLessonGenerationFailure, safeGenerationDiagnosticIssues } from "./generation-errors.js";

describe("safeGenerationDiagnosticIssues", () => {
  it("keeps final validator paths and messages from top-level issues", () => {
    const issues = safeGenerationDiagnosticIssues(Object.assign(new Error("AI_OUTPUT_INVALID"), {
      code: "AI_OUTPUT_INVALID",
      issues: [{
        path: "day4.objectives.content.text",
        message: "String must contain at most 500 character(s)"
      }]
    }));

    expect(issues).toEqual([{
      code: "AI_OUTPUT_INVALID",
      path: "day4.objectives.content.text",
      message: "String must contain at most 500 character(s)"
    }]);
  });

  it("keeps nested provider diagnostics and retry metadata", () => {
    const issues = safeGenerationDiagnosticIssues(Object.assign(new Error("AI_PROVIDER_REJECTED"), {
      code: "AI_PROVIDER_REJECTED",
      details: {
        issues: [{
          dayNumber: 2,
          component: "skills.speaking",
          code: "AI_OUTPUT_TRUNCATED",
          attempt: 2,
          maxOutputTokens: 8192,
          stopReason: "max_tokens"
        }]
      }
    }));

    expect(issues).toEqual([{
      dayNumber: 2,
      component: "skills.speaking",
      code: "AI_OUTPUT_TRUNCATED",
      attempt: 2,
      maxOutputTokens: 8192,
      stopReason: "max_tokens"
    }]);
  });

  it("flattens nested day failures while retaining their day and component context", () => {
    const issues = safeGenerationDiagnosticIssues(Object.assign(new Error("AI_LEVEL_GENERATION_INCOMPLETE"), {
      code: "AI_LEVEL_GENERATION_INCOMPLETE",
      issues: [{
        dayNumber: 1,
        component: "skills.languagePractice",
        code: "AI_OUTPUT_INVALID",
        issues: [{
          path: "writing.answer",
          message: "Writing answer must be one complete sentence"
        }]
      }]
    }));

    expect(issues).toEqual([{
      dayNumber: 1,
      component: "skills.languagePractice",
      code: "AI_OUTPUT_INVALID",
      path: "writing.answer",
      message: "Writing answer must be one complete sentence"
    }]);
  });

  it("removes secrets while retaining a useful safe message", () => {
    const issues = safeGenerationDiagnosticIssues({
      issues: [{
        path: "day1.lesson",
        message: "Authorization: Bearer sk-ant-secret-value\ninvalid output"
      }]
    });

    expect(issues).toEqual([{
      path: "day1.lesson",
      message: "Authorization: Bearer [REDACTED] invalid output"
    }]);
    expect(JSON.stringify(issues)).not.toContain("sk-ant-secret-value");
  });
});

describe("publicLessonGenerationFailure", () => {
  it("never exposes provider or schema paths to the operator", () => {
    const failure = publicLessonGenerationFailure(Object.assign(new Error("AI_OUTPUT_INVALID"), {
      code: "AI_OUTPUT_INVALID",
      details: {
        issues: [{
          path: "word3.synonym1.partOfSpeech",
          message: "synonym must have the same part of speech"
        }]
      }
    }));

    expect(failure).toEqual({
      code: "AI_LESSON_GENERATION_FAILED",
      message: "AI chưa tạo được bộ bài hợp lệ. Nội dung hiện có vẫn được giữ; vui lòng thử lại."
    });
    expect(JSON.stringify(failure)).not.toContain("word3");
    expect(JSON.stringify(failure)).not.toContain("partOfSpeech");
  });

  it("returns actionable component identities without exposing provider paths", () => {
    const failure = publicLessonGenerationFailure(Object.assign(new Error("AI_LESSON_GENERATION_FAILED"), {
      code: "AI_LESSON_GENERATION_FAILED",
      issues: [
        { dayNumber: 3, component: "skills.comprehension", code: "AI_PROVIDER_REJECTED", issues: [{ path: "reading.body", message: "secret provider detail" }] },
        { dayNumber: 5, component: "foundation", code: "AI_OUTPUT_TRUNCATED", issues: [] }
      ]
    }));

    expect(failure).toMatchObject({ findings: [
      { dayNumber: 3, component: "skills.comprehension", code: "AI_PROVIDER_REJECTED" },
      { dayNumber: 5, component: "foundation", code: "AI_OUTPUT_TRUNCATED" }
    ] });
    expect(JSON.stringify(failure)).not.toContain("reading.body");
    expect(JSON.stringify(failure)).not.toContain("secret provider detail");
  });

  it("maps final validation paths to a safe day and component finding", () => {
    const failure = publicLessonGenerationFailure(Object.assign(new Error("AI_OUTPUT_INVALID"), {
      code: "AI_OUTPUT_INVALID",
      issues: [{
        path: "day3.skills.languagePractice.writing.answer",
        message: "provider output and schema details must remain private"
      }]
    }));

    expect(failure).toMatchObject({ findings: [
      { dayNumber: 3, component: "skills.languagePractice", code: "AI_OUTPUT_INVALID" }
    ] });
    expect(JSON.stringify(failure)).not.toContain("writing.answer");
    expect(JSON.stringify(failure)).not.toContain("provider output");
  });
});
