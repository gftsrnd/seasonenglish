export function publicLessonGenerationFailure(_error: unknown): {
  code: "AI_LESSON_GENERATION_FAILED";
  message: string;
} {
  return {
    code: "AI_LESSON_GENERATION_FAILED",
    message: "AI chưa tạo được bộ bài hợp lệ. Nội dung hiện có vẫn được giữ; vui lòng thử lại."
  };
}
