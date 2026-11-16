import { expect, it } from "vitest";
import { finalExamMonthLabel } from "./OperatorRouteController.js";

it("labels each monthly final with its month so two exams are told apart", () => {
  expect(finalExamMonthLabel("Season English Monthly Final Exam – November 2026 (A1, Form A): Handling Client Feedback Meetings")).toBe("Tháng 11/2026");
  expect(finalExamMonthLabel("Season English – Monthly Final Exam A1 (2026-12) – Form A: Year-End Team Review Meetings")).toBe("Tháng 12/2026");
  expect(finalExamMonthLabel("Bài test đầu vào")).toBeNull();
});
