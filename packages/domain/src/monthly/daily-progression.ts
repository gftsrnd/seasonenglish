import type { CefrLevel, MonthlyGrammarDayPlan, MonthlyPronunciationDayPlan } from "@e4s/contracts";
import type { GrammarTopic, PronunciationSound } from "./curriculum.js";
import { monthlyGrammarCatalog, monthlyGrammarDayStage, monthlyGrammarPairOf, monthlyGrammarTopicShortName, monthlyGrammarTopicTitle, MONTHLY_GRAMMAR_STAGE_GUIDE, type MonthlyGrammarCatalogPair, type MonthlyGrammarDayStage } from "./grammar-catalog.js";

/** New-learning ordinal only: Fridays and holidays never advance a separate counter. */
export function dailyTeachingPlan(n: number, topics: readonly GrammarTopic[], sounds: readonly PronunciationSound[], cefr: CefrLevel, _coreWords: readonly string[] = []): { grammarPlan: MonthlyGrammarDayPlan; pronunciationPlan: MonthlyPronunciationDayPlan } {
  if (!Number.isInteger(n) || n < 1 || n > 18 || topics.length !== 2 || sounds.length !== 4) throw new RangeError("Daily progression needs N1–N18, two topics and four pronunciation targets");
  const vi = cefr === "A1" || cefr === "A2";
  const topicIndex = n <= 6 ? 0 : 1;
  const dayInTopic = n <= 6 ? n : n - 6;
  const stepIndex = Math.floor((dayInTopic - 1) / 2);
  const combined = n > 12;
  const modes = ["contrast", "read_aloud", "voice_note", "personalize", "shadow", "mock"] as const;
  const mode = combined ? modes[n - 13]! : dayInTopic % 2 ? "recognize" : "apply";
  const milestones = combined ? topics.map(topic => topic.steps[2]!) : [topics[topicIndex]!.steps[stepIndex]!];
  const activity = vi
    ? { recognize: "Nhận diện, giải thích cấu trúc và chọn cách dùng", apply: "Vận dụng cấu trúc trong phản hồi công việc có hướng dẫn", contrast: "Phân biệt và phối hợp hai chủ điểm", read_aloud: "Đọc và giải thích cách dùng hai chủ điểm trong đoạn công việc", voice_note: "Tạo phản hồi công việc kết hợp hai chủ điểm", personalize: "Chẩn đoán và sửa lỗi cá nhân trên hai chủ điểm", shadow: "Nói nhại và vận dụng hai chủ điểm", mock: "Làm bài nói thử kết hợp hai chủ điểm" }[mode]
    : { recognize: "Identify, explain and select the form", apply: "Apply the form in a guided workplace response", contrast: "Contrast and combine the two topics", read_aloud: "Read and explain both topics in a workplace message", voice_note: "Produce a workplace response combining both topics", personalize: "Diagnose and correct personal errors on both topics", shadow: "Shadow and apply both topics", mock: "Complete a mock speaking task combining both topics" }[mode];
  const explicitObjective = !combined ? milestones[0]?.dailyObjectives?.[(dayInTopic - 1) % 2] : undefined;
  // Grammar roadmap months (topics carry roadmap catalog IDs): the day follows
  // the roadmap stage (A1–A6/B1–B6 scaffolding, K1–K3, M1–M3). The objective is
  // operator text: no internal code and no word list (the day's core words, still a
  // parameter for callers, are listed on their own in the dialog and the prompt).
  // Plans stored with the pre-13/11 wording still validate (monthlyPlanObjectivesMatch).
  const pair = monthlyGrammarPairOf(cefr, topics);
  const grammarStage = pair ? monthlyGrammarDayStage(n) : undefined;
  const grammarPlan: MonthlyGrammarDayPlan = {
    code: combined ? `${n <= 15 ? "K" : "M"}${n <= 15 ? n - 12 : n - 15}` : `${topicIndex === 0 ? "A" : "B"}${dayInTopic}`,
    mode: grammarStage ? ROADMAP_STAGE_MODES[grammarStage] : mode,
    objective: grammarStage && pair && combined
      ? roadmapCombinedObjective(grammarStage, pair, cefr)
      : explicitObjective || (grammarStage ? `${vi ? MONTHLY_GRAMMAR_STAGE_GUIDE[grammarStage].vi : MONTHLY_GRAMMAR_STAGE_GUIDE[grammarStage].en}: ${milestones[0]!.focus}.` : `${activity}: ${milestones.map(step => step.focus).join(" · ")}.`),
    milestoneIds: milestones.map(step => step.id),
    // Roadmap months recall topic A on every B day (N7–N12, product decision 12/11); older months keep N8–N12.
    recallMilestoneIds: grammarStage
      ? (n >= 7 && n <= 12 ? [topics[0]!.steps[Math.floor((n - 7) / 2)]!.id] : [])
      : (n >= 8 && n <= 12 ? [topics[0]!.steps[Math.min(2, Math.floor((n - 8) / 2))]!.id] : []),
    ...(grammarStage ? { stage: grammarStage } : {})
  };
  const soundIndex = Math.floor((n - 1) / 3);
  const exampleSet = (n - 1) % 3 + 1;
  const targetSounds = combined ? sounds : [sounds[soundIndex]!];
  const stage = combined ? modes[n - 13]! : (["recognize", "discriminate", "sentence"] as const)[exampleSet - 1]!;
  const exampleIds = targetSounds.flatMap(sound => combined ? sound.examples.slice(0, 2).map(example => example.id) : sound.examples.slice((exampleSet - 1) * 3, exampleSet * 3).map(example => example.id));
  if (exampleIds.length !== (combined ? 8 : 3)) throw new RangeError("Each pronunciation target needs three complete sets of three examples");
  const descriptions = vi ? PRONUNCIATION_OBJECTIVES.vi : PRONUNCIATION_OBJECTIVES.en;
  const pronunciationPlan: MonthlyPronunciationDayPlan = {
    slot: combined ? grammarPlan.code : `P${soundIndex + 1}`,
    stage, objective: descriptions[stage], targetIds: targetSounds.map(sound => sound.id), exampleIds,
    ...(!combined ? { exampleSet } : {}),
    ...(stage === "read_aloud" || stage === "mock" ? { requiredPositions: targetSounds.flatMap(sound => sound.examples.slice(0, 2).map(example => ({ soundId: sound.id, exampleId: example.id }))) } : {})
  };
  return { grammarPlan, pronunciationPlan };
}

const ROADMAP_STAGE_MODES: Readonly<Record<MonthlyGrammarDayStage, MonthlyGrammarDayPlan["mode"]>> = {
  identify: "recognize", structure: "apply", variation: "apply", meaning_use: "recognize", common_errors: "recognize", application: "apply",
  link: "contrast", mixed_practice: "apply", workplace_task: "voice_note", error_review: "personalize", long_context: "read_aloud", mock_test: "mock"
};

type PronunciationStage = MonthlyPronunciationDayPlan["stage"];

/**
 * Pronunciation day objectives, shown to the Operator (and copied into the lesson).
 * Plain wording (13/11): no "target positions" / "Speaking A" jargon.
 */
const PRONUNCIATION_OBJECTIVES: Readonly<Record<"vi" | "en", Readonly<Record<PronunciationStage, string>>>> = {
  vi: {
    recognize: "Nghe, nhận diện và tập tạo âm/hiện tượng mục tiêu; lặp lại ba từ theo mẫu",
    discriminate: "Phân biệt mục tiêu với âm/hiện tượng dễ nhầm trong từ; đọc không nghe mẫu trước",
    sentence: "Vận dụng mục tiêu trong câu tự tạo về công việc, dùng ít nhất hai từ cốt lõi",
    contrast: "Nghe, phân biệt và đọc các cặp từ trộn đủ 4 âm của tháng",
    read_aloud: "Đọc đoạn ngắn có đủ 4 âm của tháng, mỗi âm 2 lần",
    voice_note: "Ghi âm lời nhắn công việc dùng các âm của tháng và hai chủ điểm ngữ pháp",
    personalize: "Luyện lại các lỗi phát âm đã ghi nhận; chưa có lỗi thì kiểm tra lại 4 âm đã học",
    shadow: "Nói nhại theo một đoạn công việc có các âm đã học",
    mock: "Thi thử nói: đọc đoạn có đủ 4 âm của tháng (mỗi âm 2 lần), rồi ghi âm lời nhắn công việc"
  },
  en: {
    recognize: "Hear, identify and produce the target sound or feature; repeat three words after a model",
    discriminate: "Distinguish the target from a confusable sound or feature in words; read before hearing the model",
    sentence: "Use the target in workplace sentences with at least two daily core words",
    contrast: "Hear, tell apart and read mixed word pairs with the month's 4 sounds",
    read_aloud: "Read a short passage using each of the month's 4 sounds twice",
    voice_note: "Record a workplace voice note using the month's sounds and both grammar topics",
    personalize: "Practise your recorded pronunciation mistakes; if there are none, check the 4 sounds taught",
    shadow: "Shadow a workplace passage with the sounds taught",
    mock: "Mock speaking test: read a passage using each of the month's 4 sounds twice, then record a workplace voice note"
  }
};

/** Pronunciation objectives written before 13/11, still stored on older months and lessons. */
const LEGACY_PRONUNCIATION_OBJECTIVES: Readonly<Record<"vi" | "en", Partial<Record<PronunciationStage, string>>>> = {
  vi: {
    contrast: "Nghe, phân biệt và đọc các cặp trộn bốn mục phát âm của tháng",
    read_aloud: "Đọc đoạn ngắn có đúng tám vị trí mục tiêu: hai vị trí cho mỗi mục phát âm",
    voice_note: "Ghi âm lời nhắn công việc kết hợp các mục phát âm và hai chủ điểm ngữ pháp",
    personalize: "Dùng lỗi đã ghi nhận để luyện cá nhân; chưa có lỗi thì làm chẩn đoán trên bốn mục đã học",
    shadow: "Nói nhại đoạn công việc với các mục phát âm đã học",
    mock: "Thi thử Speaking A đọc đoạn tám vị trí và Speaking B lời nhắn công việc"
  },
  en: {
    contrast: "Contrast and read mixed pairs covering all four monthly targets",
    read_aloud: "Read a short passage with exactly eight target positions, two per target",
    voice_note: "Record a workplace voice note combining the pronunciation targets and both grammar topics",
    personalize: "Practise recorded personal errors; when none exist, diagnose the four taught targets",
    shadow: "Shadow a workplace passage using the taught pronunciation targets",
    mock: "Mock Speaking A eight-position read-aloud and Speaking B workplace voice note"
  }
};

/**
 * Objective of a roadmap combination day (internal codes K1–K3, M1–M3 are never
 * part of it); K1 depends on the pair type. Topics are named by their short label.
 */
function roadmapCombinedObjective(stage: MonthlyGrammarDayStage, pair: MonthlyGrammarCatalogPair, cefr: CefrLevel): string {
  const vi = cefr === "A1" || cefr === "A2";
  const a = monthlyGrammarTopicShortName(cefr, pair.topicA);
  const b = monthlyGrammarTopicShortName(cefr, pair.topicB);
  const situation = vi ? pair.situationVi : pair.situationEn;
  const text: Record<CombinedStage, { vi: string; en: string }> = {
    link: pair.pairType === "contrast"
      ? { vi: `Phân biệt (${situation}): chọn đúng ${a} hay ${b} theo từng tình huống`, en: `Contrast (${situation}): choose ${a} or ${b} for each situation` }
      : { vi: `Nối hai chủ điểm (${situation}): ghép ${a} và ${b} vào cùng một câu`, en: `Link (${situation}): join ${a} and ${b} in one sentence` },
    mixed_practice: { vi: `Luyện trộn: điền chỗ trống trong email 4–6 câu, dùng cả ${a} và ${b}`, en: `Mixed practice: fill the gaps in a 4–6 sentence email using both ${a} and ${b}` },
    workplace_task: { vi: `Tình huống công sở (${situation}): viết 2–3 câu dùng cả ${a} và ${b}, rồi so với bài mẫu`, en: `Workplace task (${situation}): write 2–3 sentences using both ${a} and ${b}, then compare with a model answer` },
    error_review: { vi: `Sửa lỗi: các lỗi hay gặp nhất với ${a} và ${b}`, en: `Error review: fix the most common mistakes with ${a} and ${b}` },
    long_context: { vi: `Đoạn dài: hội thoại hoặc email công sở dài hơn, dùng ${a} và ${b}`, en: `Longer text: a longer workplace dialogue or email using ${a} and ${b}` },
    mock_test: { vi: `Thi thử: bài thi ngắn theo dạng đề cuối tháng với ${a} và ${b}`, en: `Mock test: a short practice test in the monthly exam format with ${a} and ${b}` }
  };
  const entry = text[stage as CombinedStage];
  return `${vi ? entry.vi : entry.en}.`;
}

/** A combination-day objective as written before 13/11 (code prefix, full titles), without its word list and final period. */
function legacyRoadmapCombinedObjective(stage: CombinedStage, pair: MonthlyGrammarCatalogPair, cefr: CefrLevel): string {
  const vi = cefr === "A1" || cefr === "A2";
  const a = monthlyGrammarTopicTitle(cefr, pair.topicA);
  const b = monthlyGrammarTopicTitle(cefr, pair.topicB);
  const situation = vi ? pair.situationVi : pair.situationEn;
  const text: Record<CombinedStage, { vi: string; en: string }> = {
    link: pair.pairType === "contrast"
      ? { vi: `K1 Phân biệt A–B: chọn đúng ${a} hay ${b} theo tình huống ${situation}`, en: `K1 Contrast A–B: choose ${a} or ${b} for each situation about ${situation}` }
      : { vi: `K1 Nối A–B: ghép ${a} và ${b} vào cùng một câu về ${situation}`, en: `K1 Link A–B: join ${a} and ${b} in one sentence about ${situation}` },
    mixed_practice: { vi: `K2 Luyện trộn: điền chỗ trống trong email/tin nhắn 4–6 câu cần cả ${a} và ${b}`, en: `K2 Mixed practice: fill the gaps in a 4–6 sentence email or message that needs both ${a} and ${b}` },
    workplace_task: { vi: `K3 Task công sở: viết 2–3 câu dùng cả ${a} và ${b} cho tình huống ${situation}, so với đáp án mẫu`, en: `K3 Workplace task: write 2–3 sentences using both ${a} and ${b} about ${situation}, then compare with a model answer` },
    error_review: { vi: `M1 Sửa lỗi: tổng hợp lỗi hay gặp nhất của ${a} và ${b}`, en: `M1 Error review: the most common errors with ${a} and ${b}` },
    long_context: { vi: `M2 Ngữ cảnh dài: hội thoại hoặc email công sở dài hơn dùng ${a} và ${b}`, en: `M2 Longer context: a longer workplace dialogue or email using ${a} and ${b}` },
    mock_test: { vi: `M3 Thi thử: bài thi thử theo cấu trúc đề tháng với ${a} và ${b}`, en: `M3 Mock test: a short mock in the monthly exam format with ${a} and ${b}` }
  };
  return vi ? text[stage].vi : text[stage].en;
}

const COMBINED_STAGES = ["link", "mixed_practice", "workplace_task", "error_review", "long_context", "mock_test"] as const satisfies readonly MonthlyGrammarDayStage[];
type CombinedStage = (typeof COMBINED_STAGES)[number];
const ROADMAP_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
let legacyObjectiveMap: Map<string, string> | undefined;

/** Pre-13/11 objective text (combination days without word list and period; pronunciation as is) → current objective. */
function legacyObjectives(): Map<string, string> {
  if (legacyObjectiveMap) return legacyObjectiveMap;
  const map = new Map<string, string>();
  for (const cefr of ROADMAP_LEVELS) for (const pair of monthlyGrammarCatalog(cefr)) for (const stage of COMBINED_STAGES) {
    map.set(legacyRoadmapCombinedObjective(stage, pair, cefr), roadmapCombinedObjective(stage, pair, cefr));
  }
  for (const language of ["vi", "en"] as const) for (const [stage, legacy] of Object.entries(LEGACY_PRONUNCIATION_OBJECTIVES[language])) {
    map.set(legacy, PRONUNCIATION_OBJECTIVES[language][stage as PronunciationStage]);
  }
  legacyObjectiveMap = map;
  return map;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const BRACKET_TAIL = /\s*\(([^()]*)\)$/u;

/**
 * Readable form of a stored daily grammar/pronunciation objective. Plans written
 * before 13/11 carry an internal code ("K2 …", "M3 …"), full topic titles and the
 * day's core words in brackets ("(testing, attendee, shortage)"); this returns the
 * current wording for them and leaves current objectives unchanged. Pass the day's
 * core words when known so only that exact list is dropped; without them a final
 * bracket of exactly three comma-separated words is treated as the word list.
 */
export function monthlyReadablePlanObjective(objective: string, coreWords: readonly string[] = []): string {
  const text = objective.trim();
  const map = legacyObjectives();
  const direct = map.get(text);
  if (direct) return direct;
  const period = text.endsWith(".");
  const body = period ? text.slice(0, -1).trimEnd() : text;
  const words = coreWords.filter((word) => word.trim());
  const exactTail = words.length ? new RegExp(`\\s*\\(${escapeRegExp(words.join(", "))}\\)$`, "u") : undefined;
  const bracket = BRACKET_TAIL.exec(body)?.[1];
  const withoutWords = exactTail
    ? body.replace(exactTail, "")
    : bracket !== undefined && bracket.split(",").filter((item) => item.trim()).length === 3 ? body.replace(BRACKET_TAIL, "") : body;
  const mapped = map.get(withoutWords) ?? map.get(body.replace(BRACKET_TAIL, ""));
  if (mapped) return mapped;
  return period ? `${withoutWords}.` : withoutWords;
}

/**
 * True when a stored objective is the planned one, verbatim or as the pre-13/11
 * wording of it, so month plans and lessons saved before the wording change stay valid.
 */
export function monthlyPlanObjectivesMatch(actual: unknown, planned: string | undefined, coreWords: readonly string[] = []): boolean {
  if (actual === planned) return true;
  if (typeof actual !== "string" || typeof planned !== "string") return false;
  return monthlyReadablePlanObjective(actual, coreWords) === monthlyReadablePlanObjective(planned, coreWords);
}

export function monthlyTeachingCode(n: number): string {
  return n <= 6 ? `A${n}` : n <= 12 ? `B${n - 6}` : n <= 15 ? `K${n - 12}` : `M${n - 15}`;
}

export function formatMonthlyDayLabel(day: { kind: "new" | "review"; newLessonNumber?: number | null | undefined; reviewWeekNumber?: number | undefined; grammarPlan?: MonthlyGrammarDayPlan; pronunciationPlan?: MonthlyPronunciationDayPlan }): string {
  if (day.kind === "review") return `Ôn tuần ${day.reviewWeekNumber ?? ""}`.trim();
  return day.newLessonNumber ? `Bài ${day.newLessonNumber}` : "Bài học mới";
}

const MONTHLY_ENGLISH_TITLE_LEVELS = new Set(["B1", "B2", "C1"]);

/**
 * Default learner-facing title of a monthly day before the Operator or the model names it.
 * B1+ lessons are English-only (the content gate rejects a Vietnamese title), so their
 * defaults are "Lesson N" / "Week N review"; A1-A2 keep "Bài N" / "Bài ôn tuần N".
 */
export function monthlyDefaultLessonTitle(day: { kind: "new" | "review"; newLessonNumber?: number | null | undefined; reviewWeekNumber?: number | null | undefined }, cefr?: string | null): string | undefined {
  const english = MONTHLY_ENGLISH_TITLE_LEVELS.has(cefr ?? "");
  if (day.kind === "review") return day.reviewWeekNumber ? (english ? `Week ${day.reviewWeekNumber} review` : `Bài ôn tuần ${day.reviewWeekNumber}`) : (english ? "Weekly review" : "Bài ôn tập");
  return day.newLessonNumber ? `${english ? "Lesson" : "Bài"} ${day.newLessonNumber}` : undefined;
}

const MONTHLY_TITLE_NUMBER_PREFIX = /^\s*(Bài học|Bài|Lesson)\s*#?\s*(\d+)(?!\d)\s*(?:[:\-–—·.|]\s*)?/iu;

/**
 * One numbering everywhere: new lessons count only new-lesson days ("Bài 1…N",
 * review days excluded) and review days are never "Bài N". Stored titles may
 * carry a number taken from the raw calendar slot (`lesson_number`, which also
 * counts review days), e.g. "Bài 6" for the 5th new lesson; this rewrites only
 * such a leading "Bài N" / "Lesson N" prefix and keeps the rest of the title.
 */
export function monthlyLessonDisplayTitle(title: string | null | undefined, day: { kind: "new" | "review"; newLessonNumber?: number | null | undefined; reviewWeekNumber?: number | null | undefined }): string {
  const text = (title ?? "").trim();
  const match = MONTHLY_TITLE_NUMBER_PREFIX.exec(text);
  if (!match) return text;
  const rest = text.slice(match[0].length).trim();
  if (day.kind === "review") {
    // Keep the title's language: an English "Lesson N" title (B1+) must not turn Vietnamese.
    const english = match[1]!.toLowerCase() === "lesson";
    const label = english ? (day.reviewWeekNumber ? `Week ${day.reviewWeekNumber} review` : "Weekly review") : day.reviewWeekNumber ? `Ôn tuần ${day.reviewWeekNumber}` : "Ôn tập";
    return rest ? `${label}: ${rest}` : label;
  }
  if (!day.newLessonNumber) return text;
  const separator = text.slice(match.index + match[1]!.length).match(/^\s*#?\s*\d+(\s*[:\-–—·.|]\s*|\s+)?/u)?.[1] ?? "";
  return `${match[1]} ${day.newLessonNumber}${rest ? separator || " " : ""}${rest}`;
}

/** Draft scaffolds may be inspected, but approval requires explicit reviewed daily goals. */
export function validateMonthlyGrammarObjectives(topics: readonly GrammarTopic[]): string[] {
  return topics.flatMap(topic => { const goals = topic.steps.flatMap(step => step.dailyObjectives ?? []); const problems: string[] = []; if (topic.steps.some(step => step.dailyObjectives?.length !== 2 || step.dailyObjectives.some(goal => goal.trim().length < 10))) problems.push(`Grammar topic ${topic.id} requires two explicit daily objectives per milestone`); if (new Set(goals.map(goal => goal.trim().toLocaleLowerCase("en-US").replace(/[\s\p{P}]+/gu," "))).size !== goals.length) problems.push(`Grammar topic ${topic.id} repeats a daily objective`); return problems; });
}
