export type LessonInstructionTab = "study" | "practice";

type InstructionPart = {
  code: string;
  content: Record<string, unknown>;
};

const practiceLabels: Record<string, string> = {
  listening: "Nghe",
  reading: "Đọc",
  writing: "Viết",
  word_class: "Từ loại",
  word_use: "Dùng từ",
  speaking: "Nói"
};

const practiceCodes = Object.keys(practiceLabels);

function isVisible(part: InstructionPart): boolean {
  return !(part.content.hidden === true && part.content.status === "unavailable");
}

function vocabularyCount(parts: InstructionPart[]): number {
  const vocabulary = parts.find((part) => part.code === "vocabulary");
  return Array.isArray(vocabulary?.content.items) ? vocabulary.content.items.length : 0;
}

/** Keeps Operator and Learner guidance identical and tied to the content actually shown. */
export function lessonInstructionSteps(parts: InstructionPart[], tab: LessonInstructionTab): string[] {
  const visibleParts = parts.filter(isVisible);
  if (tab === "practice") {
    const labels = visibleParts.filter((part) => practiceCodes.includes(part.code)).map((part) => practiceLabels[part.code]!);
    if (!labels.length) return ["Bài này chưa có phần bài tập."];
    return [
      `Làm lần lượt ${labels.length} phần: ${labels.join(" → ")}.`,
      "Đọc yêu cầu từng phần, chọn hoặc nhập câu trả lời rồi bấm Nộp bài.",
      "Nếu sai lượt đầu, xem gợi ý và thử lại; mỗi phần có tối đa 2 lượt."
    ];
  }

  const visibleCodes = new Set(visibleParts.map((part) => part.code));
  const instruction = visibleParts.find((part) => part.code === "instruction");
  const rawSteps = Array.isArray(instruction?.content.steps)
    ? instruction.content.steps.filter((step): step is string => typeof step === "string" && Boolean(step.trim()))
    : [];
  const validSteps = rawSteps.filter((step) => {
    if (!visibleCodes.has("grammar") && /ngữ pháp|câu mẫu|cấu trúc|công thức/iu.test(step)) return false;
    if (!visibleCodes.has("pronunciation") && /phát âm|luyện âm/iu.test(step)) return false;
    if (!visibleCodes.has("vocabulary") && /từ vựng/iu.test(step)) return false;
    return true;
  });
  const count = vocabularyCount(visibleParts);
  const fallbacks = [
    visibleCodes.has("vocabulary") ? `Học ${count || "các"} từ vựng, nghĩa và các cụm từ thường dùng.` : null,
    visibleCodes.has("grammar") ? "Đọc cấu trúc ngữ pháp, cách dùng và các câu ví dụ." : null,
    visibleCodes.has("pronunciation") ? "Luyện âm mục tiêu và ba từ mẫu phát âm." : null
  ].filter((step): step is string => Boolean(step));
  return [...validSteps, ...fallbacks].slice(0, 3);
}
