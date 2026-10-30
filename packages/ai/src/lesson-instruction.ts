/**
 * Lesson instructions are fixed product copy, not AI output. They do not vary
 * with the daily content, so generating them only adds tokens and a failure
 * source. A1-A2 learners read Vietnamese guidance; B1-C1 learners read English.
 */
export type StandardLessonInstruction = {
  title: string;
  step1: string;
  step2: string;
  step3: string;
};

/** Each instruction step is one short sentence of at most this many words. */
export const LESSON_INSTRUCTION_STEP_MAX_WORDS = 12;

const BEGINNER_INSTRUCTION: StandardLessonInstruction = {
  title: "Hướng dẫn làm bài",
  step1: "Học nội dung và nghe các câu mẫu.",
  step2: "Làm lần lượt các bài tập.",
  step3: "Xem phản hồi và làm lại phần chưa đúng."
};

const ADVANCED_INSTRUCTION: StandardLessonInstruction = {
  title: "Lesson instructions",
  step1: "Study the lesson content and listen to the model sentences.",
  step2: "Complete each practice task in order.",
  step3: "Review the feedback and retry any incorrect task."
};

export function standardLessonInstruction(cefr: string): StandardLessonInstruction {
  return { ...(["A1", "A2"].includes(cefr) ? BEGINNER_INSTRUCTION : ADVANCED_INSTRUCTION) };
}
