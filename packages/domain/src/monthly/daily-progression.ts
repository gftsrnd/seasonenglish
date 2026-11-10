import type { CefrLevel, MonthlyGrammarDayPlan, MonthlyPronunciationDayPlan } from "@e4s/contracts";
import type { GrammarTopic, PronunciationSound } from "./curriculum.js";

/** New-learning ordinal only: Fridays and holidays never advance a separate counter. */
export function dailyTeachingPlan(n: number, topics: readonly GrammarTopic[], sounds: readonly PronunciationSound[], cefr: CefrLevel, coreWords: readonly string[] = []): { grammarPlan: MonthlyGrammarDayPlan; pronunciationPlan: MonthlyPronunciationDayPlan } {
  if (!Number.isInteger(n) || n < 1 || n > 18 || topics.length !== 2 || sounds.length !== 4) throw new RangeError("Daily progression needs N1–N18, two topics and four pronunciation targets");
  const vi = cefr === "A1" || cefr === "A2";
  const topicIndex = n <= 6 ? 0 : 1;
  const dayInTopic = n <= 6 ? n : n - 6;
  const stepIndex = Math.floor((dayInTopic - 1) / 2);
  const combined = n > 12;
  const modes = ["contrast", "read_aloud", "voice_note", "personalize", "shadow", "mock"] as const;
  const mode = combined ? modes[n - 13]! : dayInTopic % 2 ? "recognize" : "apply";
  const milestones = combined ? topics.map(topic => topic.steps[2]!) : [topics[topicIndex]!.steps[stepIndex]!];
  const words = coreWords.join(", ");
  const activity = vi
    ? { recognize: "Nhận diện, giải thích cấu trúc và chọn cách dùng", apply: "Vận dụng cấu trúc trong phản hồi công việc có hướng dẫn", contrast: "Phân biệt và phối hợp hai chủ điểm", read_aloud: "Đọc và giải thích cách dùng hai chủ điểm trong đoạn công việc", voice_note: "Tạo phản hồi công việc kết hợp hai chủ điểm", personalize: "Chẩn đoán và sửa lỗi cá nhân trên hai chủ điểm", shadow: "Nói nhại và vận dụng hai chủ điểm", mock: "Làm bài nói thử kết hợp hai chủ điểm" }[mode]
    : { recognize: "Identify, explain and select the form", apply: "Apply the form in a guided workplace response", contrast: "Contrast and combine the two topics", read_aloud: "Read and explain both topics in a workplace message", voice_note: "Produce a workplace response combining both topics", personalize: "Diagnose and correct personal errors on both topics", shadow: "Shadow and apply both topics", mock: "Complete a mock speaking task combining both topics" }[mode];
  const explicitObjective = !combined ? milestones[0]?.dailyObjectives?.[(dayInTopic - 1) % 2] : undefined;
  const grammarPlan: MonthlyGrammarDayPlan = {
    code: combined ? `${n <= 15 ? "K" : "M"}${n <= 15 ? n - 12 : n - 15}` : `${topicIndex === 0 ? "A" : "B"}${dayInTopic}`,
    mode,
    objective: explicitObjective || `${activity}: ${milestones.map(step => step.focus).join(" · ")}${words ? ` (${words})` : ""}.`,
    milestoneIds: milestones.map(step => step.id),
    recallMilestoneIds: n >= 8 && n <= 12 ? [topics[0]!.steps[Math.min(2, Math.floor((n - 8) / 2))]!.id] : []
  };
  const soundIndex = Math.floor((n - 1) / 3);
  const exampleSet = (n - 1) % 3 + 1;
  const targetSounds = combined ? sounds : [sounds[soundIndex]!];
  const stage = combined ? modes[n - 13]! : (["recognize", "discriminate", "sentence"] as const)[exampleSet - 1]!;
  const exampleIds = targetSounds.flatMap(sound => combined ? sound.examples.slice(0, 2).map(example => example.id) : sound.examples.slice((exampleSet - 1) * 3, exampleSet * 3).map(example => example.id));
  if (exampleIds.length !== (combined ? 8 : 3)) throw new RangeError("Each pronunciation target needs three complete sets of three examples");
  const descriptions = vi
    ? { recognize: "Nghe, nhận diện và tập tạo âm/hiện tượng mục tiêu; lặp lại ba từ theo mẫu", discriminate: "Phân biệt mục tiêu với âm/hiện tượng dễ nhầm trong từ; đọc không nghe mẫu trước", sentence: "Vận dụng mục tiêu trong câu tự tạo về công việc, dùng ít nhất hai từ cốt lõi", contrast: "Nghe, phân biệt và đọc các cặp trộn bốn mục phát âm của tháng", read_aloud: "Đọc đoạn ngắn có đúng tám vị trí mục tiêu: hai vị trí cho mỗi mục phát âm", voice_note: "Ghi âm lời nhắn công việc kết hợp các mục phát âm và hai chủ điểm ngữ pháp", personalize: "Dùng lỗi đã ghi nhận để luyện cá nhân; chưa có lỗi thì làm chẩn đoán trên bốn mục đã học", shadow: "Nói nhại đoạn công việc với các mục phát âm đã học", mock: "Thi thử Speaking A đọc đoạn tám vị trí và Speaking B lời nhắn công việc" }
    : { recognize: "Hear, identify and produce the target sound or feature; repeat three words after a model", discriminate: "Distinguish the target from a confusable sound or feature in words; read before hearing the model", sentence: "Use the target in workplace sentences with at least two daily core words", contrast: "Contrast and read mixed pairs covering all four monthly targets", read_aloud: "Read a short passage with exactly eight target positions, two per target", voice_note: "Record a workplace voice note combining the pronunciation targets and both grammar topics", personalize: "Practise recorded personal errors; when none exist, diagnose the four taught targets", shadow: "Shadow a workplace passage using the taught pronunciation targets", mock: "Mock Speaking A eight-position read-aloud and Speaking B workplace voice note" };
  const pronunciationPlan: MonthlyPronunciationDayPlan = {
    slot: combined ? grammarPlan.code : `P${soundIndex + 1}`,
    stage, objective: descriptions[stage], targetIds: targetSounds.map(sound => sound.id), exampleIds,
    ...(!combined ? { exampleSet } : {}),
    ...(stage === "read_aloud" || stage === "mock" ? { requiredPositions: targetSounds.flatMap(sound => sound.examples.slice(0, 2).map(example => ({ soundId: sound.id, exampleId: example.id }))) } : {})
  };
  return { grammarPlan, pronunciationPlan };
}

export function monthlyTeachingCode(n: number): string {
  return n <= 6 ? `A${n}` : n <= 12 ? `B${n - 6}` : n <= 15 ? `K${n - 12}` : `M${n - 15}`;
}

export function formatMonthlyDayLabel(day: { kind: "new" | "review"; newLessonNumber?: number | null | undefined; reviewWeekNumber?: number | undefined; grammarPlan?: MonthlyGrammarDayPlan; pronunciationPlan?: MonthlyPronunciationDayPlan }): string {
  if (day.kind === "review") return `Ôn tuần ${day.reviewWeekNumber ?? ""}`.trim();
  return day.newLessonNumber ? `Bài ${day.newLessonNumber}` : "Bài học mới";
}

/** Draft scaffolds may be inspected, but approval requires explicit reviewed daily goals. */
export function validateMonthlyGrammarObjectives(topics: readonly GrammarTopic[]): string[] {
  return topics.flatMap(topic => { const goals = topic.steps.flatMap(step => step.dailyObjectives ?? []); const problems: string[] = []; if (topic.steps.some(step => step.dailyObjectives?.length !== 2 || step.dailyObjectives.some(goal => goal.trim().length < 10))) problems.push(`Grammar topic ${topic.id} requires two explicit daily objectives per milestone`); if (new Set(goals.map(goal => goal.trim().toLocaleLowerCase("en-US").replace(/[\s\p{P}]+/gu," "))).size !== goals.length) problems.push(`Grammar topic ${topic.id} repeats a daily objective`); return problems; });
}
