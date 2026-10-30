/**
 * Bài thi tháng theo "E4S Cấu trúc bài thi cuối tháng và quy tắc AI" (bản làm việc v1.1, 31/10/2026).
 * - 4 kỹ năng, 25 điểm/kỹ năng, 100 điểm; cấu hình chuẩn 30 phút (8–8–8–6).
 * - Listening 20 câu (2 bản nghe × 10), Reading 30 câu, Writing 1 bài (6 mục từ), Speaking = Read Aloud (4 âm × 2 vị trí) + voice note (4 mục từ).
 * - Mỗi mục từ có đúng MỘT vị trí đánh giá chính; 3 chủ điểm ngữ pháp có yêu cầu bằng chứng ở Writing và Speaking.
 * - Đề sinh TỪ KHUNG, không lấy phần soạn tay. Gói học viên không chứa key/script; gói người chấm giữ riêng.
 * Đây là bản dựng deterministic (template). AI có thể sinh bản tự nhiên hơn nhưng phải qua validateMonthlyExamBlueprint.
 */
import type { AssessmentDefinitionView, AssessmentOption, AssessmentTaskView, CefrLevel } from "@e4s/contracts";
import type { MonthFramework } from "./framework.js";

export interface MonthlyExamConfig {
  /** Tổng thời gian; chuẩn PO = 30 phút. */
  durationMinutes: number;
  /** Số mục từ đánh giá ở từng phần; chuẩn 20–30–6–4 cho N = 60. */
  allocation: { listening: number; reading: number; writing: number; speaking: number };
  /** Phút từng phần; chuẩn 8–8–8–6. */
  minutes: { listening: number; reading: number; writing: number; speaking: number };
  /** Số từ mẫu mỗi âm trong Read Aloud; chuẩn 2. */
  samplesPerSound: number;
  /** Số bản nghe; chuẩn 2. */
  listeningBlocks: number;
  /** Số lần phát mỗi bản nghe; chuẩn 2. */
  listeningPlays: number;
  writingWords: { min: number; max: number };
  speakingSeconds: { min: number; max: number };
}

export const SCORE_PER_SECTION = 25;

/** Chia N mục từ thành 4 nhóm theo tỉ lệ 20:30:6:4 (N = 60 ra đúng cấu hình chuẩn). */
export function allocateExamItems(vocabularyCount: number): MonthlyExamConfig["allocation"] {
  const weights = { listening: 20, reading: 30, writing: 6, speaking: 4 };
  const total = 60;
  const raw = {
    listening: Math.floor((vocabularyCount * weights.listening) / total),
    reading: Math.floor((vocabularyCount * weights.reading) / total),
    writing: Math.max(1, Math.floor((vocabularyCount * weights.writing) / total)),
    speaking: Math.max(1, Math.floor((vocabularyCount * weights.speaking) / total))
  };
  let remainder = vocabularyCount - raw.listening - raw.reading - raw.writing - raw.speaking;
  // Phần dư ưu tiên Reading rồi Listening để giữ tải tiếp nhận ở phần khách quan.
  for (const key of ["reading", "listening", "reading", "listening"] as const) {
    if (remainder <= 0) break;
    raw[key] += 1; remainder -= 1;
  }
  while (remainder > 0) { raw.reading += 1; remainder -= 1; }
  while (remainder < 0) { if (raw.reading > 1) raw.reading -= 1; else raw.listening -= 1; remainder += 1; }
  return raw;
}

export function defaultMonthlyExamConfig(vocabularyCount: number, durationMinutes = 30): MonthlyExamConfig {
  // 8–8–8–6 của 30 phút; scale theo thời lượng cấu hình.
  const unit = durationMinutes / 30;
  const listening = Math.max(1, Math.round(8 * unit));
  const reading = Math.max(1, Math.round(8 * unit));
  const writing = Math.max(1, Math.round(8 * unit));
  const speaking = Math.max(1, durationMinutes - listening - reading - writing);
  return {
    durationMinutes,
    allocation: allocateExamItems(vocabularyCount),
    minutes: { listening, reading, writing, speaking },
    samplesPerSound: 2,
    listeningBlocks: 2,
    listeningPlays: 2,
    writingWords: { min: 80, max: 100 },
    speakingSeconds: { min: 60, max: 75 }
  };
}

export interface MonthlyExamTask extends AssessmentTaskView {
  /** Chỉ có trong gói người chấm; runtime học viên phải lọc bỏ trước khi gửi xuống trình duyệt. */
  correctAnswer?: string;
  /** Mã mục từ (V01…) hoặc mã bằng chứng (W2 V51, S1 P1a…). */
  evidenceCodes?: string[];
}

export interface MonthlyExamMappingRow {
  objective: string;
  kind: "vocabulary" | "grammar" | "pronunciation";
  position: string;
  evidence: string;
  maxScore: number;
}

export interface MonthlyExamCheck { code: string; passed: boolean; detail: string }

export type MonthlyExamBlueprint = Omit<AssessmentDefinitionView, "sections"> & {
  month: string;
  examDate: string;
  targetLevel: CefrLevel;
  /** SCRIPT_ONLY cho tới khi có audio đã nghe soát (GEN20). */
  audioStatus: "SCRIPT_ONLY" | "READY";
  status: "DRAFT" | "NEEDS_REVIEW" | "READY";
  config: MonthlyExamConfig;
  sections: Array<Omit<AssessmentDefinitionView["sections"][number], "groups"> & {
    groups: Array<Omit<AssessmentDefinitionView["sections"][number]["groups"][number], "tasks"> & { tasks: MonthlyExamTask[] }>;
  }>;
  /** Ma trận mục tiêu → vị trí → bằng chứng → điểm (GEN03, GEN10, GEN11). */
  mapping: MonthlyExamMappingRow[];
  /** Gói người chấm: script, key, giải thích; không hiện cho học viên trước khi nộp (GEN18). */
  graderPackage: {
    scripts: Array<{ key: string; title: string; lines: Array<{ speaker: string; text: string }> }>;
    keys: Array<{ taskKey: string; answer: string; evidence: string; explanation: string }>;
    rubric: { writing: Array<{ code: string; label: string; max: number }>; speaking: Array<{ code: string; label: string; max: number }> };
    sampleAnswers: { writing: string; speaking: string };
  };
  checks: MonthlyExamCheck[];
};

const LETTERS = ["A", "B", "C"] as const;

function choice(key: string, prompt: string, labels: readonly string[], correctIndex: number, evidenceCodes: string[]): MonthlyExamTask {
  const options: AssessmentOption[] = labels.map((label, index) => ({ value: LETTERS[index] ?? String(index + 1), label }));
  return { key, prompt, responseType: "single_choice", maxScore: 1, options, correctAnswer: options[correctIndex]!.value, evidenceCodes };
}

/** Đảo vị trí đáp án theo seed để không có quy luật A/B/C (GEN17). */
function rotate<T>(items: T[], seed: number): T[] {
  const shift = seed % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

function vocabularyId(index: number): string {
  return `V${String(index + 1).padStart(2, "0")}`;
}

export function buildMonthlyExamBlueprint(input: {
  framework: MonthFramework;
  month: string;
  examDate: string;
  durationMinutes?: number;
  lessonCount: number;
}): MonthlyExamBlueprint {
  const { framework } = input;
  const english = !(framework.cefr === "A1" || framework.cefr === "A2");
  const config = defaultMonthlyExamConfig(framework.vocabulary.length, input.durationMinutes ?? 30);
  const items = framework.vocabulary.map((item, index) => ({ ...item, id: vocabularyId(index) }));
  const { listening: nL, reading: nR, writing: nW, speaking: nS } = config.allocation;
  const listeningItems = items.slice(0, nL);
  const readingItems = items.slice(nL, nL + nR);
  const writingItems = items.slice(nL + nR, nL + nR + nW);
  const speakingItems = items.slice(nL + nR + nW, nL + nR + nW + nS);
  const grammar = framework.grammarTopics;
  const g = (index: number) => grammar[index % Math.max(1, grammar.length)];
  const mapping: MonthlyExamMappingRow[] = [];
  const keys: MonthlyExamBlueprint["graderPackage"]["keys"] = [];
  const distractorPool = (exclude: Set<string>) => items.filter((item) => !exclude.has(item.word));

  // ---------- Listening: 2 bản nghe, mỗi bản ~10 câu, mỗi câu kiểm một mục từ (GEN06). ----------
  const blocks = Math.max(1, config.listeningBlocks);
  const perBlock = Math.ceil(listeningItems.length / blocks);
  const scripts: MonthlyExamBlueprint["graderPackage"]["scripts"] = [];
  const listeningGroups: MonthlyExamBlueprint["sections"][number]["groups"] = [];
  for (let block = 0; block < blocks; block += 1) {
    const blockItems = listeningItems.slice(block * perBlock, (block + 1) * perBlock);
    if (!blockItems.length) continue;
    const letter = String.fromCharCode(65 + block);
    const lines = blockItems.map((item, index) => ({ speaker: index % 2 === 0 ? "Manager" : "Colleague", text: item.example }));
    scripts.push({ key: `L${letter}`, title: english ? `Message ${letter}` : `Bản nghe ${letter}`, lines });
    const tasks = blockItems.map((item, index) => {
      const globalIndex = block * perBlock + index;
      const taskKey = `L${String(globalIndex + 1).padStart(2, "0")}`;
      const pool = distractorPool(new Set([item.word])).filter((other) => other.type === item.type);
      const distractors = rotate(pool.length >= 2 ? pool : distractorPool(new Set([item.word])), globalIndex).slice(0, 2).map((other) => other.word);
      const labels = rotate([item.word, ...distractors], globalIndex);
      const task = choice(taskKey, english
        ? `In message ${letter}, which word does the speaker use to mean "${item.meaning}"?`
        : `Trong bản nghe ${letter}, người nói dùng từ nào với nghĩa "${item.meaning}"?`, labels, labels.indexOf(item.word), [item.id]);
      mapping.push({ objective: item.id, kind: "vocabulary", position: taskKey, evidence: "single_choice", maxScore: 1 });
      keys.push({ taskKey, answer: task.correctAnswer!, evidence: item.example, explanation: `${item.word} = ${item.meaning}; xuất hiện trong câu "${item.example}".` });
      return task;
    });
    listeningGroups.push({
      key: `L${letter}`, title: english ? `Message ${letter}` : `Bản nghe ${letter}`,
      instruction: english ? `Listen to message ${letter} (played ${config.listeningPlays} times) and answer.` : `Nghe bản ${letter} (phát ${config.listeningPlays} lần) rồi trả lời.`,
      maxPlays: config.listeningPlays, stimulus: { type: "audio_script", lines }, tasks
    });
  }

  // ---------- Reading: 30 thông điệp ngắn có chỗ trống (GEN07). ----------
  const readingTasks = readingItems.map((item, index) => {
    const taskKey = `R${String(index + 1).padStart(2, "0")}`;
    const blanked = item.example.replace(new RegExp(`\\b${escapeRegExp(item.word)}\\b`, "iu"), "___");
    const hasBlank = blanked !== item.example;
    const pool = distractorPool(new Set([item.word])).filter((other) => other.type === item.type);
    const distractors = rotate(pool.length >= 2 ? pool : distractorPool(new Set([item.word])), index + 3).slice(0, 2).map((other) => other.word);
    const labels = rotate([item.word, ...distractors], index + 1);
    const prompt = hasBlank
      ? (english ? `${blanked} (meaning: ${item.meaning})` : `${blanked} (nghĩa cần điền: ${item.meaning})`)
      : (english ? `"${item.example}" — which word means "${item.meaning}"?` : `"${item.example}" — từ nào có nghĩa "${item.meaning}"?`);
    const task = choice(taskKey, prompt, labels, labels.indexOf(item.word), [item.id]);
    mapping.push({ objective: item.id, kind: "vocabulary", position: taskKey, evidence: "single_choice", maxScore: 1 });
    keys.push({ taskKey, answer: task.correctAnswer!, evidence: item.example, explanation: `${item.word}: ${item.meaning}.` });
    return task;
  });

  // ---------- Writing: 1 email, 6 mục từ, G1/G2/G3 (GEN10, GEN12). ----------
  const writingWords = writingItems.map((item) => item.word);
  const g1 = g(0); const g2 = g(1); const g3 = g(2);
  const writingTask: MonthlyExamTask = {
    key: "W1", responseType: "long_text", maxScore: SCORE_PER_SECTION, minWords: config.writingWords.min, maxWords: config.writingWords.max,
    prompt: english
      ? `Write a short email to your manager (${config.writingWords.min}–${config.writingWords.max} words). Do three things: (1) report what you have completed this month and one thing you did last week; (2) explain what is still missing or blocked; (3) make one polite request and say what you will do next. Use all six words meaningfully: ${writingWords.join(", ")}. Grammar required: ${g1?.title ?? ""}; ${g2?.title ?? ""}; ${g3?.title ?? ""}.`
      : `Viết một email ngắn bằng tiếng Anh gửi quản lý (${config.writingWords.min}–${config.writingWords.max} từ). Làm ba việc: (1) báo phần đã hoàn thành trong tháng và một việc đã làm tuần trước; (2) giải thích phần còn thiếu hoặc vướng; (3) đưa một yêu cầu lịch sự và nói bạn sẽ làm gì tiếp theo. Dùng có nghĩa đủ sáu từ: ${writingWords.join(", ")}. Ngữ pháp bắt buộc: ${g1?.title ?? ""}; ${g2?.title ?? ""}; ${g3?.title ?? ""}.`,
    hint: english ? "Checklist: 3 points · 6 words · 3 grammar topics · no word lists." : "Tự kiểm: đủ 3 ý · 6 từ · 3 chủ điểm ngữ pháp · không chép danh sách từ.",
    evidenceCodes: ["W1", ...writingItems.map((item) => `W2 ${item.id}`), "W3 G1", "W3 G2", "W3 G3", "W4", "W5"]
  };
  writingItems.forEach((item) => mapping.push({ objective: item.id, kind: "vocabulary", position: `W2 ${item.id}`, evidence: "rubric 0/0.5/1", maxScore: 1 }));
  mapping.push({ objective: "G1", kind: "grammar", position: "W3 G1", evidence: "rubric", maxScore: 2 }, { objective: "G2", kind: "grammar", position: "W3 G2", evidence: "rubric", maxScore: 2 }, { objective: "G3", kind: "grammar", position: "W3 G3", evidence: "rubric", maxScore: 2 });

  // ---------- Speaking: Read Aloud (4 âm × 2 vị trí) + voice note (4 mục từ). ----------
  const readAloudWords = framework.sounds.map((sound, soundIndex) => sound.examples.slice(0, config.samplesPerSound).map((example, position) => ({ ...example, code: `P${soundIndex + 1}${String.fromCharCode(97 + position)}`, ipa: sound.ipa })));
  const readAloudSentence = readAloudWords.flat().map((entry) => entry.word);
  const readAloudText = english
    ? `Please read: "This month our team worked with ${readAloudSentence.slice(0, 4).join(", ")}; we also reviewed ${readAloudSentence.slice(4).join(", ")}."`
    : `Đọc thành tiếng: "This month our team worked with ${readAloudSentence.slice(0, 4).join(", ")}; we also reviewed ${readAloudSentence.slice(4).join(", ")}."`;
  const readAloud: MonthlyExamTask = {
    key: "S1", responseType: "speaking_evidence", maxScore: readAloudWords.flat().length,
    prompt: readAloudText,
    hint: english ? "45 seconds to prepare, one recording of up to 45 seconds." : "Chuẩn bị 45 giây, ghi một lần tối đa 45 giây.",
    evidenceCodes: readAloudWords.flat().map((entry) => `S1 ${entry.code}`)
  };
  readAloudWords.flat().forEach((entry) => mapping.push({ objective: entry.code.slice(0, 2), kind: "pronunciation", position: `S1 ${entry.code} (${entry.word} /${entry.ipa}/)`, evidence: "audio 0/0.5/1", maxScore: 1 }));
  const speakingWords = speakingItems.map((item) => item.word);
  const voiceNote: MonthlyExamTask = {
    key: "S2", responseType: "speaking_evidence", maxScore: SCORE_PER_SECTION - readAloud.maxScore,
    prompt: english
      ? `Record a voice note for your manager (${config.speakingSeconds.min}–${config.speakingSeconds.max} seconds). Do three things: (1) say what you have finished and one problem with today's plan; (2) propose an alternative time and explain why it suits everyone; (3) ask for confirmation politely and say what you will do after approval. Use all four words: ${speakingWords.join(", ")}. Grammar: ${g1?.title ?? ""}; ${g2?.title ?? ""}; ${g3?.title ?? ""}.`
      : `Ghi một voice note tiếng Anh gửi quản lý (${config.speakingSeconds.min}–${config.speakingSeconds.max} giây). Làm ba việc: (1) nói phần đã xong và một vấn đề với kế hoạch hôm nay; (2) đề xuất thời gian khác và giải thích vì sao phù hợp; (3) xin xác nhận lịch sự và nói bạn sẽ làm gì sau khi được đồng ý. Dùng đủ bốn từ: ${speakingWords.join(", ")}. Ngữ pháp: ${g1?.title ?? ""}; ${g2?.title ?? ""}; ${g3?.title ?? ""}.`,
    hint: english ? "Up to 90 seconds to prepare, one recording of up to 90 seconds." : "Chuẩn bị tối đa 90 giây, ghi một lần tối đa 90 giây.",
    evidenceCodes: ["S2", ...speakingItems.map((item) => `S3 ${item.id}`), "S4 G1", "S4 G2", "S4 G3", "S5"]
  };
  speakingItems.forEach((item) => mapping.push({ objective: item.id, kind: "vocabulary", position: `S3 ${item.id}`, evidence: "rubric 0/0.5/1", maxScore: 1 }));
  mapping.push({ objective: "G1", kind: "grammar", position: "S4 G1", evidence: "rubric", maxScore: 1 }, { objective: "G2", kind: "grammar", position: "S4 G2", evidence: "rubric", maxScore: 2 }, { objective: "G3", kind: "grammar", position: "S4 G3", evidence: "rubric", maxScore: 1 });

  const sections: MonthlyExamBlueprint["sections"] = [
    { code: "listening", title: english ? "Listening" : "Nghe", durationMinutes: config.minutes.listening, maxScore: SCORE_PER_SECTION,
      instructions: [english ? `${listeningItems.length} questions · each message is played ${config.listeningPlays} times · one answer per question.` : `${listeningItems.length} câu · mỗi bản nghe phát ${config.listeningPlays} lần · mỗi câu một đáp án.`],
      groups: listeningGroups },
    { code: "reading", title: english ? "Reading" : "Đọc", durationMinutes: config.minutes.reading, maxScore: SCORE_PER_SECTION,
      instructions: [english ? `${readingTasks.length} short workplace messages · choose the word that fits the whole context.` : `${readingTasks.length} thông điệp ngắn · chọn từ phù hợp toàn bộ ngữ cảnh.`],
      groups: [{ key: "R", title: english ? "Short messages" : "Thông điệp ngắn", instruction: english ? "Choose one answer." : "Chọn một đáp án.", tasks: readingTasks }] },
    { code: "writing", title: english ? "Writing" : "Viết", durationMinutes: config.minutes.writing, maxScore: SCORE_PER_SECTION,
      instructions: [english ? "One email, submitted once. Only the final version is graded." : "Một email, nộp một lần. Chỉ chấm bản cuối."],
      groups: [{ key: "W", title: english ? "Email to your manager" : "Email gửi quản lý", instruction: writingTask.prompt, tasks: [writingTask] }] },
    { code: "speaking", title: english ? "Speaking" : "Nói", durationMinutes: config.minutes.speaking, maxScore: SCORE_PER_SECTION,
      instructions: [english ? "Two recordings: read aloud, then a voice note. Do not read your Writing answer." : "Hai bản ghi: đọc thành tiếng, rồi voice note. Không đọc lại bài Viết."],
      groups: [
        { key: "SA", title: english ? "Speaking A — Read aloud" : "Speaking A — Đọc thành tiếng", instruction: readAloud.prompt, tasks: [readAloud] },
        { key: "SB", title: english ? "Speaking B — Voice note" : "Speaking B — Voice note", instruction: voiceNote.prompt, tasks: [voiceNote] }
      ] }
  ];

  const blueprint: MonthlyExamBlueprint = {
    key: `monthly-exam-${input.month}-${framework.cefr.toLowerCase()}`,
    kind: "monthly_exam",
    title: `Bài thi tháng ${Number(input.month.slice(5))}/${input.month.slice(0, 4)} · ${framework.cefr}`,
    version: 1,
    totalMinutes: config.durationMinutes,
    totalScore: SCORE_PER_SECTION * 4,
    month: input.month,
    examDate: input.examDate,
    targetLevel: framework.cefr,
    audioStatus: "SCRIPT_ONLY",
    status: "DRAFT",
    config,
    sections,
    mapping,
    graderPackage: {
      scripts,
      keys,
      rubric: {
        writing: [{ code: "W1", label: "Hoàn thành ba ý giao tiếp", max: 6 }, { code: "W2", label: "Vận dụng sáu mục từ", max: 6 }, { code: "W3", label: "G1 (1+1) · G2 (2) · G3 (2)", max: 6 }, { code: "W4", label: "Tổ chức ý và văn phong công sở", max: 4 }, { code: "W5", label: "Chính tả, viết hoa, dấu câu", max: 3 }],
        speaking: [{ code: "S1", label: "Bốn âm trọng tâm (4 × 2 vị trí)", max: 8 }, { code: "S2", label: "Hoàn thành ba ý", max: 6 }, { code: "S3", label: "Bốn mục từ", max: 4 }, { code: "S4", label: "G1 (1) · G2 (2) · G3 (1)", max: 4 }, { code: "S5", label: "Tính liên tục của lời nói", max: 3 }]
      },
      sampleAnswers: {
        writing: `Hi, here is my ${writingWords[0] ?? "update"}. ${g1?.steps[0]?.examples[0] ?? ""} ${g1?.steps[1]?.examples[0] ?? ""} ${g2?.steps[0]?.examples[0] ?? ""} ${g3?.steps[0]?.examples[0] ?? ""}`.trim(),
        speaking: `${g1?.steps[0]?.examples[0] ?? ""} ${g2?.steps[0]?.examples[0] ?? ""} ${g3?.steps[0]?.examples[0] ?? ""}`.trim()
      }
    },
    checks: []
  };
  blueprint.checks = validateMonthlyExamBlueprint(blueprint, framework);
  blueprint.status = blueprint.checks.every((check) => check.passed) ? "NEEDS_REVIEW" : "DRAFT";
  return blueprint;
}

/** Kiểm tra xác định được bằng chương trình (GEN02, GEN03, GEN10, GEN11, GEN13, GEN16/17 một phần). */
export function validateMonthlyExamBlueprint(blueprint: MonthlyExamBlueprint, framework: MonthFramework): MonthlyExamCheck[] {
  const tasks = blueprint.sections.flatMap((section) => section.groups.flatMap((group) => group.tasks));
  const listening = tasks.filter((task) => task.key.startsWith("L")).length;
  const reading = tasks.filter((task) => task.key.startsWith("R")).length;
  const writing = tasks.filter((task) => task.key.startsWith("W")).length;
  const speaking = tasks.filter((task) => task.key.startsWith("S")).length;
  const { allocation } = blueprint.config;
  const vocabularyRows = blueprint.mapping.filter((row) => row.kind === "vocabulary");
  const vocabularyIds = new Set(vocabularyRows.map((row) => row.objective));
  const duplicateVocabulary = vocabularyRows.length !== vocabularyIds.size;
  const expectedIds = framework.vocabulary.map((_, index) => vocabularyId(index));
  const grammarPositions = { writing: blueprint.mapping.filter((row) => row.kind === "grammar" && row.position.startsWith("W")).length, speaking: blueprint.mapping.filter((row) => row.kind === "grammar" && row.position.startsWith("S")).length };
  const pronunciationRows = blueprint.mapping.filter((row) => row.kind === "pronunciation");
  const totalMinutes = blueprint.sections.reduce((sum, section) => sum + section.durationMinutes, 0);
  const totalScore = blueprint.sections.reduce((sum, section) => sum + section.maxScore, 0);
  const choiceTasks = tasks.filter((task) => task.responseType === "single_choice");
  const badOptions = choiceTasks.filter((task) => !task.options || task.options.length !== 3 || new Set(task.options.map((option) => option.label)).size !== 3 || !task.options.some((option) => option.value === task.correctAnswer));
  const answerPositions = choiceTasks.map((task) => task.correctAnswer);
  const skewed = answerPositions.length >= 6 && LETTERS.some((letter) => answerPositions.filter((value) => value === letter).length > answerPositions.length * 0.6);
  return [
    { code: "GEN02", passed: listening === allocation.listening && reading === allocation.reading && writing === 1 && speaking === 2, detail: `L=${listening}/${allocation.listening}, R=${reading}/${allocation.reading}, W=${writing}/1, S=${speaking}/2` },
    { code: "GEN03", passed: !duplicateVocabulary && expectedIds.every((id) => vocabularyIds.has(id)) && vocabularyIds.size === expectedIds.length, detail: `${vocabularyIds.size}/${expectedIds.length} mục từ có đúng một vị trí đánh giá` },
    { code: "GEN10", passed: grammarPositions.writing === framework.grammarTopics.length && grammarPositions.speaking === framework.grammarTopics.length, detail: `Ngữ pháp: Writing ${grammarPositions.writing}, Speaking ${grammarPositions.speaking} / ${framework.grammarTopics.length} chủ điểm` },
    { code: "GEN11", passed: pronunciationRows.length === framework.sounds.length * blueprint.config.samplesPerSound, detail: `${pronunciationRows.length} vị trí âm / ${framework.sounds.length} × ${blueprint.config.samplesPerSound}` },
    { code: "GEN13", passed: totalScore === 100 && totalMinutes === blueprint.config.durationMinutes && blueprint.totalMinutes === totalMinutes, detail: `Tổng ${totalScore} điểm, ${totalMinutes}/${blueprint.config.durationMinutes} phút` },
    { code: "GEN16", passed: badOptions.length === 0, detail: badOptions.length ? `${badOptions.length} câu có lựa chọn không hợp lệ: ${badOptions.slice(0, 5).map((task) => task.key).join(", ")}` : "Mỗi câu khách quan có 3 lựa chọn khác nhau và một key hợp lệ" },
    { code: "GEN17", passed: !skewed, detail: skewed ? "Đáp án dồn vào một vị trí" : "Phân bố vị trí đáp án chấp nhận được" },
    { code: "GEN20", passed: blueprint.audioStatus === "READY", detail: blueprint.audioStatus === "READY" ? "Audio đã nghe soát" : "SCRIPT_ONLY: chưa có audio đã nghe soát; Listening chưa phát hành chính thức" }
  ];
}

/** Gói học viên: bỏ key, mã bằng chứng, script và gói người chấm (GEN18). */
export function studentPackageOf(blueprint: MonthlyExamBlueprint): AssessmentDefinitionView {
  return {
    key: blueprint.key, kind: blueprint.kind, title: blueprint.title, version: blueprint.version, totalMinutes: blueprint.totalMinutes, totalScore: blueprint.totalScore,
    sections: blueprint.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        tasks: group.tasks.map(({ correctAnswer: _correctAnswer, evidenceCodes: _evidenceCodes, ...task }) => task)
      }))
    }))
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// ---------- Nội dung do AI sinh: điền vào cấu hình đã khoá, không đổi số câu/trọng số (GEN01) ----------

export interface AiMonthlyExamContent {
  listening: { blocks: Array<{ title: string; lines: Array<{ speaker: string; text: string }>; tasks: AiChoiceTask[] }> };
  reading: { tasks: AiChoiceTask[] };
  writing: { scenario: string; points: string[]; sampleAnswer: string };
  speaking: { readAloud: string; scenario: string; points: string[]; sampleAnswer: string };
}
export interface AiChoiceTask { vocabularyId: string; prompt: string; options: string[]; correctIndex: number; evidence: string; explanation: string }

/**
 * Ghép nội dung AI vào bản template: giữ nguyên key câu, ma trận mapping, điểm và thời gian.
 * Trả null nếu AI không phủ đúng tập mục từ đã phân (GEN01/GEN03) — worker sẽ giữ bản template.
 */
export function applyAiMonthlyExamContent(blueprint: MonthlyExamBlueprint, content: AiMonthlyExamContent, framework: MonthFramework): MonthlyExamBlueprint | null {
  const byId = new Map<string, AiChoiceTask>();
  for (const task of [...content.listening.blocks.flatMap((block) => block.tasks), ...content.reading.tasks]) {
    if (byId.has(task.vocabularyId)) return null;
    byId.set(task.vocabularyId, task);
  }
  const next: MonthlyExamBlueprint = structuredClone(blueprint);
  const keys = new Map(next.graderPackage.keys.map((key) => [key.taskKey, key]));
  const rewriteChoice = (task: MonthlyExamTask, seed: number): boolean => {
    const id = task.evidenceCodes?.[0];
    const ai = id ? byId.get(id) : undefined;
    if (!ai || ai.options.length !== 3 || new Set(ai.options).size !== 3) return false;
    const correct = ai.options[ai.correctIndex];
    if (!correct) return false;
    const labels = rotate([...ai.options], seed);
    task.prompt = ai.prompt;
    task.options = labels.map((label, index) => ({ value: LETTERS[index]!, label }));
    task.correctAnswer = LETTERS[labels.indexOf(correct)]!;
    const key = keys.get(task.key);
    if (key) { key.answer = task.correctAnswer; key.evidence = ai.evidence; key.explanation = ai.explanation; }
    return true;
  };
  let seed = 0;
  const listeningSection = next.sections.find((section) => section.code === "listening");
  const readingSection = next.sections.find((section) => section.code === "reading");
  if (!listeningSection || !readingSection) return null;
  for (const group of listeningSection.groups) for (const task of group.tasks) if (!rewriteChoice(task, seed++)) return null;
  for (const group of readingSection.groups) for (const task of group.tasks) if (!rewriteChoice(task, seed++)) return null;
  // Script bản nghe: thay theo block nếu AI trả đủ số block.
  if (content.listening.blocks.length === listeningSection.groups.length) {
    listeningSection.groups.forEach((group, index) => {
      const block = content.listening.blocks[index]!;
      group.stimulus = { type: "audio_script", lines: block.lines };
      const script = next.graderPackage.scripts[index];
      if (script) { script.lines = block.lines; script.title = block.title || script.title; }
    });
  }
  const writingTask = next.sections.find((section) => section.code === "writing")?.groups[0]?.tasks[0];
  if (writingTask) {
    writingTask.prompt = `${content.writing.scenario}\n\n${content.writing.points.map((point, index) => `${index + 1}. ${point}`).join("\n")}\n\n${writingTask.prompt}`;
    next.graderPackage.sampleAnswers.writing = content.writing.sampleAnswer;
  }
  const speakingGroups = next.sections.find((section) => section.code === "speaking")?.groups ?? [];
  const readAloud = speakingGroups[0]?.tasks[0];
  const requiredWords = framework.sounds.flatMap((sound) => sound.examples.slice(0, next.config.samplesPerSound).map((example) => example.word.toLowerCase()));
  if (readAloud && requiredWords.every((word) => content.speaking.readAloud.toLowerCase().includes(word))) {
    readAloud.prompt = content.speaking.readAloud;
    if (speakingGroups[0]) speakingGroups[0].instruction = content.speaking.readAloud;
  }
  const voiceNote = speakingGroups[1]?.tasks[0];
  if (voiceNote) {
    voiceNote.prompt = `${content.speaking.scenario}\n\n${content.speaking.points.map((point, index) => `${index + 1}. ${point}`).join("\n")}\n\n${voiceNote.prompt}`;
    if (speakingGroups[1]) speakingGroups[1].instruction = voiceNote.prompt;
    next.graderPackage.sampleAnswers.speaking = content.speaking.sampleAnswer;
  }
  next.checks = validateMonthlyExamBlueprint(next, framework);
  return next.checks.filter((check) => check.code !== "GEN20").every((check) => check.passed) ? next : null;
}
