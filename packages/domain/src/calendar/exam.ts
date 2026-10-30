/**
 * Đề thi tháng sinh TỪ KHUNG (không lấy phần soạn tay). Dùng lại cấu trúc 4 kỹ năng của bài kiểm tra đầu vào.
 * Đây là bản đề mặc định (deterministic); AI có thể làm giàu sau nhưng cấu trúc giữ nguyên.
 */
import type { AssessmentDefinitionView, AssessmentOption, AssessmentTaskView } from "@e4s/contracts";
import { distributeFramework, type MonthFramework } from "./framework.js";

export interface MonthlyExamTask extends AssessmentTaskView { correctAnswer?: string }
export type MonthlyExamBlueprint = Omit<AssessmentDefinitionView, "sections"> & {
  month: string;
  examDate: string;
  targetLevel: MonthFramework["cefr"];
  sections: Array<Omit<AssessmentDefinitionView["sections"][number], "groups"> & {
    groups: Array<Omit<AssessmentDefinitionView["sections"][number]["groups"][number], "tasks"> & { tasks: MonthlyExamTask[] }>;
  }>;
};

const LETTERS = ["A", "B", "C", "D"] as const;

function choice(key: string, prompt: string, labels: readonly string[], correctIndex: number, maxScore = 1): MonthlyExamTask {
  const options: AssessmentOption[] = labels.map((label, index) => ({ value: LETTERS[index] ?? String(index + 1), label }));
  return { key, prompt, responseType: "single_choice", maxScore, options, correctAnswer: options[correctIndex]!.value };
}

/** Xáo trộn deterministic theo seed để đáp án không luôn ở vị trí A. */
function rotate<T>(items: T[], seed: number): T[] {
  const shift = seed % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

export function buildMonthlyExamBlueprint(input: {
  framework: MonthFramework;
  month: string;
  examDate: string;
  durationMinutes: number;
  lessonCount: number;
}): MonthlyExamBlueprint {
  const { framework } = input;
  const english = !(framework.cefr === "A1" || framework.cefr === "A2");
  const plan = distributeFramework(framework, input.lessonCount);
  const taughtIndices = [...new Set(plan.days.flatMap((day) => day.vocabulary.map((slot) => slot.index)))];
  const vocabulary = taughtIndices.map((index) => framework.vocabulary[index]!);
  const steps = framework.grammarTopics.flatMap((topic) => topic.steps.map((step) => ({ topic, step })));
  const pick = <T>(items: T[], index: number): T => items[index % items.length]!;

  // Thời lượng chia theo tỉ lệ 15/25/20/15 của bài đầu vào (tổng 75) → scale về durationMinutes.
  const share = (part: number) => Math.max(5, Math.round((input.durationMinutes * part) / 75));
  const listeningMinutes = share(15); const readingMinutes = share(25); const writingMinutes = share(20);
  const speakingMinutes = Math.max(5, input.durationMinutes - listeningMinutes - readingMinutes - writingMinutes);

  const listeningTasks: MonthlyExamTask[] = [];
  const listeningLines = vocabulary.slice(0, 6).map((item, index) => ({ speaker: index % 2 === 0 ? "Manager" : "Colleague", text: item.example }));
  vocabulary.slice(0, 6).forEach((item, index) => {
    const distractors = vocabulary.filter((other) => other.word !== item.word).slice(index, index + 3).map((other) => other.word);
    const labels = rotate([item.word, ...distractors], index);
    listeningTasks.push(choice(`ML_${index}`, english ? `Which word do you hear in sentence ${index + 1}?` : `Bạn nghe thấy từ nào trong câu ${index + 1}?`, labels, labels.indexOf(item.word)));
  });

  const readingText = vocabulary.slice(6, 14).map((item) => item.example).join(" ");
  const readingTasks: MonthlyExamTask[] = vocabulary.slice(6, 14).map((item, index) => {
    const distractors = vocabulary.filter((other) => other.word !== item.word).slice(index + 2, index + 5).map((other) => other.word);
    const labels = rotate([item.word, ...distractors], index + 1);
    return choice(`MR_${index}`, english ? `Which word is used in the text with the meaning "${item.meaning}"?` : `Từ nào trong bài có nghĩa "${item.meaning}"?`, labels, labels.indexOf(item.word));
  });
  const grammarTasks: MonthlyExamTask[] = steps.slice(0, 6).map(({ topic, step }, index) => {
    const correct = step.examples[0] ?? step.formula;
    const distractors = steps.filter((other) => other.step !== step).slice(index, index + 3).map((other) => other.step.examples[0] ?? other.step.formula);
    const labels = rotate([correct, ...distractors], index + 2);
    return choice(`MG_${index}`, english ? `Which sentence correctly uses "${step.focus}" (${topic.title})?` : `Câu nào dùng đúng "${step.focus}" (${topic.title})?`, labels, labels.indexOf(correct));
  });

  const writingWords = vocabulary.slice(14, 20).map((item) => item.word);
  const writingTask: MonthlyExamTask = {
    key: "MW_0", responseType: "long_text", maxScore: 25, minWords: english ? 80 : 40, maxWords: english ? 150 : 80,
    prompt: english
      ? `Write a short workplace update (one month review) using at least 4 of these words: ${writingWords.join(", ")}. Use ${pick(steps, 0).step.focus} and ${pick(steps, 3).step.focus}.`
      : `Viết một đoạn cập nhật công việc của tháng bằng tiếng Anh, dùng ít nhất 4 từ: ${writingWords.join(", ")}. Dùng mẫu "${pick(steps, 0).step.formula}" và "${pick(steps, 3).step.formula}".`,
    hint: english ? "Organise your answer in 2–3 short paragraphs." : "Chia 2–3 đoạn ngắn."
  };

  const soundWords = framework.sounds.flatMap((sound) => sound.examples.slice(0, 2).map((example) => example.word));
  const speakingTask: MonthlyExamTask = {
    key: "MS_0", responseType: "speaking_evidence", maxScore: 25,
    prompt: english
      ? `Speak for about one minute about what you learned this month at work. Use at least 3 of: ${vocabulary.slice(20, 26).map((item) => item.word).join(", ")}. Pronounce clearly: ${soundWords.join(", ")}.`
      : `Nói khoảng một phút bằng tiếng Anh về việc bạn đã học và làm trong tháng. Dùng ít nhất 3 từ: ${vocabulary.slice(20, 26).map((item) => item.word).join(", ")}. Phát âm rõ: ${soundWords.join(", ")}.`
  };

  const sections: MonthlyExamBlueprint["sections"] = [
    { code: "listening", title: english ? "Listening" : "Nghe", durationMinutes: listeningMinutes, maxScore: listeningTasks.length, instructions: [english ? "Listen to each sentence at most twice." : "Mỗi câu nghe tối đa 2 lần."],
      groups: [{ key: "ML", title: english ? "Workplace sentences" : "Câu nói nơi làm việc", instruction: english ? "Choose the word you hear." : "Chọn từ bạn nghe thấy.", maxPlays: 2, stimulus: { type: "audio_script", lines: listeningLines }, tasks: listeningTasks }] },
    { code: "reading", title: english ? "Reading & Grammar" : "Đọc & Ngữ pháp", durationMinutes: readingMinutes, maxScore: readingTasks.length + grammarTasks.length, instructions: [english ? "Read the text and answer." : "Đọc đoạn văn và trả lời."],
      groups: [
        { key: "MR", title: english ? "Monthly vocabulary" : "Từ vựng của tháng", instruction: english ? "Choose the correct word." : "Chọn từ đúng.", stimulus: { type: "passage", text: readingText }, tasks: readingTasks },
        { key: "MG", title: english ? "Grammar of the month" : "Ngữ pháp của tháng", instruction: english ? "Choose the correct sentence." : "Chọn câu đúng.", tasks: grammarTasks }
      ] },
    { code: "writing", title: english ? "Writing" : "Viết", durationMinutes: writingMinutes, maxScore: 25, instructions: [english ? "Write your own sentences." : "Tự viết câu của bạn."], groups: [{ key: "MW", title: english ? "Monthly update" : "Cập nhật tháng", instruction: writingTask.prompt, tasks: [writingTask] }] },
    { code: "speaking", title: english ? "Speaking" : "Nói", durationMinutes: speakingMinutes, maxScore: 25, instructions: [english ? "Record your answer." : "Ghi âm câu trả lời."], groups: [{ key: "MS", title: english ? "One-minute talk" : "Nói một phút", instruction: speakingTask.prompt, tasks: [speakingTask] }] }
  ];
  return {
    key: `monthly-exam-${input.month}-${framework.cefr.toLowerCase()}`,
    kind: "monthly_exam",
    title: `Bài thi tháng ${Number(input.month.slice(5))}/${input.month.slice(0, 4)} · ${framework.cefr}`,
    version: 1,
    totalMinutes: input.durationMinutes,
    totalScore: sections.reduce((sum, section) => sum + section.maxScore, 0),
    month: input.month,
    examDate: input.examDate,
    targetLevel: framework.cefr,
    sections
  };
}
