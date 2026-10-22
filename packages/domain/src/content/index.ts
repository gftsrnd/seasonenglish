import type { LessonPart, LessonPartCode } from "@e4s/contracts";
import { validateLessonPartOrder } from "../learning/index.js";

const requiredParts = [
  ["objective", "Mục tiêu"],
  ["instruction", "Hướng dẫn"],
  ["vocabulary", "Từ vựng"],
  ["grammar", "Ngữ pháp"],
  ["pronunciation", "Phát âm"],
  ["listening", "Nghe"],
  ["reading", "Đọc"],
  ["writing", "Viết"],
  ["speaking", "Nói"]
] as const satisfies readonly (readonly [LessonPartCode, string])[];

export interface ContentLessonDraft {
  readonly dayNumber: number;
  readonly title: string;
  readonly durationMinutes: number;
  readonly parts: readonly LessonPart[];
}

export interface ContentValidationIssue {
  dayNumber: number;
  code: LessonPartCode | "title" | "order";
  message: string;
}

export function validateLessonDraft(lessons: readonly ContentLessonDraft[]): {
  valid: boolean;
  issues: ContentValidationIssue[];
} {
  const issues: ContentValidationIssue[] = [];
  for (const lesson of lessons) {
    if (!lesson.title.trim()) {
      issues.push({ dayNumber: lesson.dayNumber, code: "title", message: "Thiếu tên bài." });
    }
    const codes = lesson.parts.map((part) => part.code);
    for (const [code, label] of requiredParts) {
      if (!codes.includes(code)) issues.push({ dayNumber: lesson.dayNumber, code, message: `Thiếu phần ${label}.` });
    }
    if (!validateLessonPartOrder(codes).valid) {
      issues.push({ dayNumber: lesson.dayNumber, code: "order", message: "Các phần của bài chưa đúng thứ tự đã thống nhất." });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function submitContentForReview(input: {
  status: "draft" | "review" | "published" | "retired";
  lessons: readonly ContentLessonDraft[];
}): { status: "review" } {
  if (input.status !== "draft") throw new Error("CONTENT_NOT_DRAFT");
  const days = [...new Set(input.lessons.map((lesson) => lesson.dayNumber))].sort((a, b) => a - b);
  if (days.length !== 5 || days.some((day, index) => day !== index + 1)) {
    throw new Error("CONTENT_LESSON_SET_INCOMPLETE");
  }
  const validation = validateLessonDraft(input.lessons);
  if (!validation.valid) throw new Error("CONTENT_VALIDATION_FAILED");
  return { status: "review" };
}

export function approveContentVersion(input: {
  status: "draft" | "review" | "published" | "retired";
  createdBy: string;
  checkerId: string;
}): { status: "published"; approvedBy: string } {
  if (input.status !== "review") throw new Error("CONTENT_NOT_IN_REVIEW");
  return { status: "published", approvedBy: input.checkerId };
}

export function retirePublishedContent<T>(input: {
  status: "draft" | "review" | "published" | "retired";
  payload: T;
}): { status: "retired"; payload: T } {
  if (input.status !== "published") throw new Error("CONTENT_NOT_PUBLISHED");
  return { status: "retired", payload: input.payload };
}
