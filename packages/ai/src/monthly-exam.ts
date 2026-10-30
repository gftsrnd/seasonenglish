import { z } from "zod";

/**
 * Task AI mới `monthly_exam`: sinh đề thi tháng theo "E4S Cấu trúc bài thi cuối tháng và quy tắc AI" v1.1.
 * AI chỉ ĐIỀN NỘI DUNG vào cấu hình đã khoá (GEN01); số câu, trọng số, ngưỡng do chương trình kiểm tra.
 * Đầu ra được domain `validateMonthlyExamBlueprint` kiểm tra; không đạt thì worker dùng bản template.
 */
export const MONTHLY_EXAM_TASK_KEY = "monthly_exam";

const choiceTask = z.object({
  /** Mã mục từ V01… mà câu này đánh giá chính. */
  vocabularyId: z.string().regex(/^V\d{2,3}$/),
  prompt: z.string().min(1).max(400),
  /** Đúng 3 lựa chọn, hình thức tương đương (GEN16). */
  options: z.array(z.string().min(1).max(160)).length(3),
  /** 0..2 — vị trí đáp án đúng; chương trình sẽ đảo lại để tránh quy luật (GEN17). */
  correctIndex: z.number().int().min(0).max(2),
  /** Trích đoạn bằng chứng trong script/thông điệp (GEN15). */
  evidence: z.string().min(1).max(400),
  explanation: z.string().min(1).max(400)
});

export const monthlyExamOutputSchema = z.object({
  listening: z.object({
    blocks: z.array(z.object({
      title: z.string().min(1).max(80),
      /** 120–140 từ, giọng công sở, chứa đúng các mục từ được phân cho block. */
      lines: z.array(z.object({ speaker: z.string().min(1).max(40), text: z.string().min(1).max(600) })).min(1).max(12),
      tasks: z.array(choiceTask).min(1)
    })).min(1).max(4)
  }),
  reading: z.object({ tasks: z.array(choiceTask).min(1) }),
  writing: z.object({
    /** Dữ kiện tình huống (độc lập với bản nghe). */
    scenario: z.string().min(1).max(900),
    /** Ba việc email phải làm. */
    points: z.array(z.string().min(1).max(240)).length(3),
    sampleAnswer: z.string().min(1).max(1200)
  }),
  speaking: z.object({
    /** Câu đọc thành tiếng chứa đủ 2 từ mẫu cho mỗi âm (GEN11). */
    readAloud: z.string().min(1).max(400),
    scenario: z.string().min(1).max(900),
    points: z.array(z.string().min(1).max(240)).length(3),
    sampleAnswer: z.string().min(1).max(1200)
  })
});
export type MonthlyExamOutput = z.infer<typeof monthlyExamOutputSchema>;

const choiceTaskJson = {
  type: "object", additionalProperties: false, required: ["vocabularyId", "prompt", "options", "correctIndex", "evidence", "explanation"],
  properties: {
    vocabularyId: { type: "string" }, prompt: { type: "string" }, options: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
    correctIndex: { type: "integer", minimum: 0, maximum: 2 }, evidence: { type: "string" }, explanation: { type: "string" }
  }
} as const;

export const monthlyExamOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["listening", "reading", "writing", "speaking"],
  properties: {
    listening: { type: "object", additionalProperties: false, required: ["blocks"], properties: { blocks: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "lines", "tasks"], properties: {
      title: { type: "string" }, lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["speaker", "text"], properties: { speaker: { type: "string" }, text: { type: "string" } } } }, tasks: { type: "array", items: choiceTaskJson }
    } } } } },
    reading: { type: "object", additionalProperties: false, required: ["tasks"], properties: { tasks: { type: "array", items: choiceTaskJson } } },
    writing: { type: "object", additionalProperties: false, required: ["scenario", "points", "sampleAnswer"], properties: { scenario: { type: "string" }, points: { type: "array", items: { type: "string" } }, sampleAnswer: { type: "string" } } },
    speaking: { type: "object", additionalProperties: false, required: ["readAloud", "scenario", "points", "sampleAnswer"], properties: { readAloud: { type: "string" }, scenario: { type: "string" }, points: { type: "array", items: { type: "string" } }, sampleAnswer: { type: "string" } } }
  }
} as const;

/** Prompt sinh đề tháng (mục 11 của đặc tả), rút gọn cho đầu ra JSON có cấu trúc. */
export const MONTHLY_EXAM_PROMPT = [
  "Return valid JSON only. You build the E4S monthly test for ONE level and ONE month from the locked framework provided in input.",
  "The format is fixed (GEN01): four skills, 25 points each; Listening has `allocation.listening` single-choice questions split across `listeningBlocks` recorded messages (each message 120–140 words, workplace context); Reading has `allocation.reading` short workplace messages, most with one blank, each testing ONE assigned vocabulary item by meaning in context (GEN07); Writing is ONE email that must use the `writing` vocabulary items meaningfully and produce evidence for every grammar topic (GEN10); Speaking is a read-aloud sentence containing exactly `samplesPerSound` sample words for EACH sound (GEN11) plus a voice note that uses the `speaking` vocabulary items and every grammar topic.",
  "Every vocabulary item has exactly ONE main assessment position: use `assignments` from input and never move, drop or add items (GEN01, GEN03). Words that only appear in instructions or distractors do not count (GEN04).",
  "Each objective question has exactly 3 options of equivalent form, one correct answer by the whole context (GEN05, GEN16); Listening questions must need the audio (GEN06); no contradictions in names, times, money or roles (GEN08); no new hard words beyond the framework and basic workplace words (GEN09); writing and speaking tasks must allow a natural answer, not forced word stuffing (GEN12).",
  "Do not include Season Chat or process scores. Do not change counts, weights or thresholds. Give evidence and explanation for every question (GEN15).",
  "For A1/A2 write instructions and scenarios in Vietnamese with English content; for B1+ write everything in English."
].join(" ");
