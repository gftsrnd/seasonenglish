import type { MonthlyFinalCheckStatus, MonthlyFinalCheckView, MonthlyFinalExamMeta, MonthlyFinalExamStatus, MonthlyFinalGenCode } from "@e4s/contracts";
import type { MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { publicAssessmentDefinition, type StoredAssessmentDefinition, type StoredAssessmentTask } from "@e4s/database";
import {monthlyFinalContainsTerm as containsTerm,monthlyFinalWordCount as wordCount,monthlyFinalIsWordList,monthlyFinalWritingOpening} from "@e4s/ai";
import {
  MONTHLY_FINAL_LEVEL_PROFILES, MONTHLY_FINAL_OPTION_COUNT, MONTHLY_FINAL_SECTION_MINUTES, MONTHLY_FINAL_SECTION_SCORE,
  MONTHLY_FINAL_SPEAKING_A_SCORE, MONTHLY_FINAL_SPEAKING_B_SCORE, MONTHLY_FINAL_TOTAL_MINUTES, MONTHLY_FINAL_TOTAL_SCORE,
  monthlyFinalAllocation
} from "./monthly-final-spec.js";

/**
 * GEN01–GEN23 report (section 10). "auto" rules are decided here by program.
 * "manual" rules need an Operator's judgement: they may have an automatic
 * pre-check (a failing pre-check is a hard fail) and otherwise stay
 * needs_review until the Operator confirms them on the review screen.
 * A model's own claim of compliance is never used as evidence.
 */
const TITLES: Record<MonthlyFinalGenCode, string> = {
  GEN01: "Không thay, bỏ hoặc thêm mục tiêu chấm (tập V, G, P khớp khung)",
  GEN02: "Đủ L câu Nghe, R câu Đọc, 1 Writing, 1 Speaking A, 1 Speaking B",
  GEN03: "Mỗi mục từ có đúng một vị trí đánh giá chính",
  GEN04: "Từ chỉ có trong lời dẫn/đáp án nhiễu không được tính độ phủ",
  GEN05: "Câu khách quan có một đáp án đúng duy nhất",
  GEN06: "Câu Listening cần thông tin trong audio",
  GEN07: "Câu Reading cần hiểu nghĩa, không chỉ đoán theo từ loại",
  GEN08: "Không mâu thuẫn tên, giờ, số tiền, vai trò",
  GEN09: "Từ và cấu trúc ngoài phạm vi không thành rào cản",
  GEN10: "Writing cần GA/GB chính + phụ; Speaking B cần GA/GB chính",
  GEN11: "Speaking A có đúng 8 vị trí, 2 mỗi P, từ thuộc bộ từ ví dụ của tháng",
  GEN12: "Không ép nhồi từ thiếu tự nhiên",
  GEN13: "Tổng 100 điểm, 30 phút",
  GEN14: "Khóa key và rubric trước khi phát hành",
  GEN15: "Mỗi câu có giải thích; câu nghe có trích đoạn bằng chứng",
  GEN16: "Lựa chọn có hình thức tương đương, không mẹo vô nghĩa",
  GEN17: "Không tạo quy luật đoán theo độ dài hoặc vị trí A/B/C",
  GEN18: "Gói học viên không chứa key, script, bài mẫu",
  GEN19: "Không có câu hỏi thích ứng hay gợi ý trong khi thi",
  GEN20: "Chưa có audio đã nghe soát thì chưa phát hành Listening",
  GEN21: "Mỗi bản nghe có ít nhất 1 câu dùng GA và 1 câu dùng GB",
  GEN22: "Hướng dẫn, độ dài ngữ liệu và sản phẩm đúng hồ sơ level",
  GEN23: "Gói học viên không nêu tên chủ điểm, công thức hay mẫu câu ngữ pháp"
};

/** Rules that only a person can finally decide (they keep needs_review until confirmed). */
export const MONTHLY_FINAL_MANUAL_RULES: readonly MonthlyFinalGenCode[] = ["GEN04", "GEN05", "GEN06", "GEN07", "GEN08", "GEN09", "GEN10", "GEN12", "GEN16", "GEN21"];

type Result = { status: MonthlyFinalCheckStatus; detail: string };
const pass = (detail: string): Result => ({ status: "pass", detail });
const fail = (problems: string[]): Result => ({ status: "fail", detail: problems.slice(0, 8).join(" · ") + (problems.length > 8 ? ` · (+${problems.length - 8})` : "") });
const verdict = (problems: string[], ok: string): Result => problems.length ? fail(problems) : pass(ok);

export interface MonthlyFinalEvaluation { checks: MonthlyFinalCheckView[]; status: MonthlyFinalExamStatus }

export function evaluateMonthlyFinal(blueprint: StoredAssessmentDefinition, contract: MonthlyCurriculumContract): MonthlyFinalEvaluation {
  const exam = blueprint.monthlyExam;
  if (!exam) {
    const checks = (Object.keys(TITLES) as MonthlyFinalGenCode[]).map((code) => ({ code, title: TITLES[code], mode: "auto" as const, status: "fail" as const, detail: "Đề không có gói kiểm tra v2.0." }));
    return { checks, status: "DRAFT" };
  }
  const context = buildContext(blueprint, exam, contract);
  const confirmed = new Set(exam.manualConfirmations);
  const auto: Partial<Record<MonthlyFinalGenCode, Result>> = {
    GEN01: gen01(context), GEN02: gen02(context), GEN03: gen03(context), GEN11: gen11(context), GEN13: gen13(context),
    GEN14: gen14(context), GEN15: gen15(context), GEN17: gen17(context), GEN18: gen18(context), GEN19: gen19(context),
    GEN20: gen20(context), GEN22: gen22(context), GEN23: gen23(context)
  };
  const precheck: Partial<Record<MonthlyFinalGenCode, string[]>> = {
    GEN04: gen04Precheck(context), GEN05: gen05Precheck(context), GEN06: gen15(context).status === "fail" ? ["Thiếu trích đoạn bằng chứng trong script (xem GEN15)"] : [],
    GEN10: gen10Precheck(context), GEN21: gen21Precheck(context)
  };
  const checks: MonthlyFinalCheckView[] = (Object.keys(TITLES) as MonthlyFinalGenCode[]).map((code) => {
    if (!MONTHLY_FINAL_MANUAL_RULES.includes(code)) {
      const result = auto[code]!;
      return { code, title: TITLES[code], mode: "auto", ...result };
    }
    const problems = precheck[code] ?? [];
    if (problems.length) return { code, title: TITLES[code], mode: "manual", ...fail(problems) };
    if (confirmed.has(code)) return { code, title: TITLES[code], mode: "manual", status: "pass", detail: "Người vận hành đã rà soát và xác nhận." };
    return { code, title: TITLES[code], mode: "manual", status: "needs_review", detail: manualHint(code) };
  });
  return { checks, status: statusFromChecks(checks) };
}

export function statusFromChecks(checks: readonly MonthlyFinalCheckView[]): MonthlyFinalExamStatus {
  if (checks.some((check) => check.status === "fail")) return "DRAFT";
  if (checks.some((check) => check.status === "needs_review")) return "NEEDS_REVIEW";
  return "READY";
}

function manualHint(code: MonthlyFinalGenCode): string {
  switch (code) {
    case "GEN04": return "Kiểm tra tự động: mỗi mục từ có mặt ở vị trí chấm. Cần người rà vai trò từng lần xuất hiện.";
    case "GEN05": return "Lắp từng lựa chọn vào ngữ cảnh và phản biện; cần người xác nhận.";
    case "GEN06": return "Đối chiếu câu hỏi với script; cần người xác nhận.";
    case "GEN07": return "Đọc phần giải thích vì sao đáp án đúng về nghĩa; cần người xác nhận.";
    case "GEN08": return "Đối chiếu tên, giờ, số tiền, vai trò giữa script, câu hỏi và dữ kiện.";
    case "GEN09": return "Soát từ/cấu trúc theo kiến thức nền và hồ sơ level.";
    case "GEN10": return "Kiểm tra tự động: có thành phần chính/phụ và bằng chứng trong bài mẫu. Cần người xác nhận tình huống gợi ra đủ GA, GB.";
    case "GEN12": return "Đọc bài mẫu Writing/Speaking B: dùng đủ từ một cách tự nhiên.";
    case "GEN16": return "Rà hình thức các lựa chọn; không mẹo vô nghĩa.";
    case "GEN21": return "Kiểm tra tự động: câu GA/GB được trích có trong script. Cần người xác nhận đúng cấu trúc.";
    default: return "Cần người rà soát.";
  }
}

interface ChoiceItem { sectionCode: "listening" | "reading"; groupKey: string; task: StoredAssessmentTask }
interface Context {
  blueprint: StoredAssessmentDefinition;
  exam: MonthlyFinalExamMeta;
  contract: MonthlyCurriculumContract;
  section: (code: string) => StoredAssessmentDefinition["sections"][number] | undefined;
  tasks: (code: string) => StoredAssessmentTask[];
  choices: ChoiceItem[];
  scriptByGroup: Map<string, string>;
  taskByKey: Map<string, { sectionCode: string; groupKey: string; task: StoredAssessmentTask }>;
}

function buildContext(blueprint: StoredAssessmentDefinition, exam: MonthlyFinalExamMeta, contract: MonthlyCurriculumContract): Context {
  const section = (code: string) => blueprint.sections.find((item) => item.code === code);
  const tasks = (code: string) => section(code)?.groups.flatMap((group) => group.tasks) ?? [];
  const choices: ChoiceItem[] = (["listening", "reading"] as const).flatMap((sectionCode) =>
    section(sectionCode)?.groups.flatMap((group) => group.tasks.map((task) => ({ sectionCode, groupKey: group.key, task }))) ?? []);
  const scriptByGroup = new Map((section("listening")?.groups ?? []).map((group) => [group.key, group.stimulus?.type === "audio_script" ? (group.stimulus.lines ?? []).map((line) => line.text).join("\n") : ""]));
  const taskByKey = new Map(blueprint.sections.flatMap((item) => item.groups.flatMap((group) => group.tasks.map((task) => [task.key, { sectionCode: item.code, groupKey: group.key, task }] as const))));
  return { blueprint, exam, contract, section, tasks, choices, scriptByGroup, taskByKey };
}

function gen01(context: Context): Result {
  const { exam, contract } = context;
  const problems: string[] = [];
  const coreIds = new Set(contract.coreTerms.map((term) => term.id));
  const mapped = new Set(exam.mapping.map((row) => row.termId));
  const extra = [...mapped].filter((id) => !coreIds.has(id));
  const missing = [...coreIds].filter((id) => !mapped.has(id));
  if (extra.length) problems.push(`Mục ngoài khung: ${extra.slice(0, 5).join(", ")}`);
  if (missing.length) problems.push(`Thiếu mục từ: ${missing.slice(0, 5).join(", ")}`);
  const topics = contract.grammarTopics;
  if (exam.grammar.length !== 2 || exam.grammar.some((target, index) => target.topicId !== topics[index]?.id || target.code !== (index === 0 ? "GA" : "GB"))) problems.push("GA/GB không khớp 2 chủ điểm của khung");
  for (const target of exam.grammar) {
    const taught = new Set(target.taughtSteps.map((step) => step.stepId));
    const topic = topics.find((item) => item.id === target.topicId);
    const topicSteps = new Set(topic?.steps.map((step) => step.id) ?? []);
    if (!taught.has(target.main.stepId) || !topicSteps.has(target.main.stepId)) problems.push(`${target.code} chính không thuộc bước đã dạy`);
    if (!taught.has(target.secondary.stepId) || !topicSteps.has(target.secondary.stepId)) problems.push(`${target.code} phụ không thuộc bước đã dạy`);
    if (target.main.stepId === target.secondary.stepId) problems.push(`${target.code} chính và phụ trùng nhau`);
  }
  if (exam.pronunciation.length !== 4 || exam.pronunciation.some((target, index) => target.soundId !== contract.sounds[index]?.id)) problems.push("P1–P4 không khớp 4 mục phát âm của khung");
  const scope = context.blueprint.monthlyScope;
  if (!scope || scope.month !== contract.month || scope.cefr !== contract.cefr || JSON.stringify(scope.coreTermIds) !== JSON.stringify(contract.coreTerms.map((term) => term.id))) problems.push("Ảnh chụp phạm vi tháng không khớp khung");
  return verdict(problems, `${coreIds.size} mục từ, 2 chủ điểm, 4 mục phát âm khớp khung đã duyệt.`);
}

function gen02(context: Context): Result {
  const { exam, contract } = context;
  const problems: string[] = [];
  let expected = exam.allocation;
  try { expected = monthlyFinalAllocation(contract.coreTerms.length, contract.cefr); } catch { problems.push("Không phân bổ được L/R/W/S cho N"); }
  // Compare field by field: allocations reloaded from jsonb come back with reordered keys.
  if ((["n", "l", "r", "w", "s"] as const).some((key) => expected[key] !== exam.allocation[key])) problems.push(`Phân bổ lưu ${JSON.stringify(exam.allocation)} khác công thức`);
  const listening = context.section("listening");
  const l = context.tasks("listening").length;
  const r = context.tasks("reading").length;
  if (l !== expected.l) problems.push(`Listening có ${l} câu, cần ${expected.l}`);
  if (r !== expected.r) problems.push(`Reading có ${r} câu, cần ${expected.r}`);
  if ((listening?.groups.length ?? 0) !== 2 || listening?.groups.some((group) => !group.tasks.length || group.maxPlays !== 2 || group.stimulus?.type !== "audio_script")) problems.push("Listening cần 2 bản nghe, mỗi bản phát 2 lần và có câu hỏi");
  if (context.choices.some((item) => item.task.responseType !== "single_choice" || (item.task.options?.length ?? 0) !== MONTHLY_FINAL_OPTION_COUNT)) problems.push("Câu Nghe/Đọc phải là trắc nghiệm 3 lựa chọn A/B/C");
  const writing = context.tasks("writing");
  if (writing.length !== 1 || writing[0]?.responseType !== "long_text") problems.push("Writing cần đúng 1 tin nhắn/email");
  const speaking = context.section("speaking");
  const a = speaking?.groups.find((group) => group.key === "SA")?.tasks ?? [];
  const b = speaking?.groups.find((group) => group.key === "SB")?.tasks ?? [];
  if (speaking?.groups.length !== 2 || a.length !== 1 || b.length !== 1 || [...a, ...b].some((task) => task.responseType !== "speaking_evidence")) problems.push("Speaking cần đúng 1 phần A (đọc thành tiếng) và 1 phần B (voice note)");
  return verdict(problems, `L ${l} · R ${r} · W 1 · Speaking A 1 · Speaking B 1 (N = ${contract.coreTerms.length}, ${contract.cefr}).`);
}

function gen03(context: Context): Result {
  const { exam } = context;
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const row of exam.mapping) seen.set(row.termId, (seen.get(row.termId) ?? 0) + 1);
  const repeated = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (repeated.length) problems.push(`Mục có hơn 1 vị trí chính: ${repeated.slice(0, 5).join(", ")}`);
  if (exam.mapping.length !== context.contract.coreTerms.length) problems.push(`Bảng mapping có ${exam.mapping.length} hàng, cần ${context.contract.coreTerms.length}`);
  for (const row of exam.mapping) {
    const found = context.taskByKey.get(row.taskKey);
    if (!found || found.sectionCode !== row.skill) problems.push(`${row.code} trỏ tới vị trí không tồn tại (${row.position})`);
  }
  const objectiveKeys = context.choices.map((item) => item.task.key);
  const mappedObjective = exam.mapping.filter((row) => row.skill === "listening" || row.skill === "reading").map((row) => row.taskKey);
  const unmapped = objectiveKeys.filter((key) => !mappedObjective.includes(key));
  const doubled = mappedObjective.filter((key, index) => mappedObjective.indexOf(key) !== index);
  if (unmapped.length) problems.push(`Câu chưa gắn mục từ: ${unmapped.slice(0, 5).join(", ")}`);
  if (doubled.length) problems.push(`Câu gắn hơn 1 mục từ: ${doubled.slice(0, 5).join(", ")}`);
  const count = (skill: string) => exam.mapping.filter((row) => row.skill === skill).length;
  if (count("writing") !== exam.allocation.w || count("speaking") !== exam.allocation.s) problems.push("Số mục W2/S3 khác phân bổ");
  return verdict(problems, `${exam.mapping.length} hàng, mỗi mục một vị trí chính.`);
}

function gen04Precheck(context: Context): string[] {
  const problems: string[] = [];
  const writingPrompt = context.tasks("writing")[0]?.prompt ?? "";
  const speakingPrompt = context.taskByKey.get("SB")?.task.prompt ?? "";
  for (const row of context.exam.mapping) {
    const found = context.taskByKey.get(row.taskKey);
    if (!found) continue;
    if (row.skill === "listening") {
      if (!containsTerm(context.scriptByGroup.get(found.groupKey) ?? "", row.word)) problems.push(`${row.position}: "${row.word}" không có trong bản nghe`);
    } else if (row.skill === "reading") {
      const correct = found.task.options?.find((option) => option.value === found.task.correctAnswer)?.label ?? "";
      if (!containsTerm(`${found.task.prompt}\n${correct}`, row.word)) problems.push(`${row.position}: "${row.word}" chỉ có ở đáp án nhiễu hoặc không có`);
    } else if (!containsTerm(row.skill === "writing" ? writingPrompt : speakingPrompt, row.word)) {
      problems.push(`${row.position}: yêu cầu chưa có "${row.word}"`);
    }
  }
  return problems;
}

function gen05Precheck(context: Context): string[] {
  const problems: string[] = [];
  for (const { task } of context.choices) {
    const labels = (task.options ?? []).map((option) => normalizeText(option.label));
    if (!task.prompt.trim() || labels.some((label) => !label)) problems.push(`${task.key}: thiếu nội dung câu hỏi hoặc lựa chọn`);
    else if (new Set(labels).size !== labels.length) problems.push(`${task.key}: có lựa chọn trùng nhau`);
  }
  return problems;
}

function gen10Precheck(context: Context): string[] {
  const { exam } = context;
  const problems: string[] = [];
  for (const target of exam.grammar) {
    if (!target.main.acceptedPatterns.some((item) => item.trim()) || !target.secondary.acceptedPatterns.some((item) => item.trim())) problems.push(`${target.code}: thiếu mẫu chấp nhận`);
  }
  const writing = exam.grader.writingGrammarEvidence;
  if (!exam.grader.writingSample.trim() || !writing.gaMain.trim() || !writing.gaSecondary.trim() || !writing.gbMain.trim() || !writing.gbSecondary.trim()) problems.push("Bài Writing mẫu chưa chứng minh đủ GA/GB chính + phụ");
  else for (const sentence of Object.values(writing)) if (!includesNormalized(exam.grader.writingSample, sentence)) problems.push("Bằng chứng ngữ pháp không có trong bài Writing mẫu");
  const speaking = exam.grader.speakingGrammarEvidence;
  if (!exam.grader.speakingSample.trim() || !speaking.gaMain.trim() || !speaking.gbMain.trim()) problems.push("Bài Speaking B mẫu chưa chứng minh GA/GB chính");
  else for (const sentence of Object.values(speaking)) if (!includesNormalized(exam.grader.speakingSample, sentence)) problems.push("Bằng chứng ngữ pháp không có trong bài Speaking B mẫu");
  return [...new Set(problems)];
}

function gen11(context: Context): Result {
  const problems: string[] = [];
  const text = context.taskByKey.get("SA")?.task.prompt ?? "";
  let total = 0;
  for (const target of context.exam.pronunciation) {
    total += target.positions.length;
    if (target.positions.length !== 2) problems.push(`${target.code} có ${target.positions.length} vị trí, cần 2`);
    const taught = new Map(target.taughtExamples.map((example) => [example.exampleId, example.word.toLocaleLowerCase("en-US")]));
    const words = new Set<string>();
    for (const position of target.positions) {
      const word = position.word.toLocaleLowerCase("en-US");
      if (taught.get(position.exampleId) !== word) problems.push(`${target.code}: "${position.word}" không thuộc bộ từ ví dụ đã học`);
      if (!wordRegex(position.word).test(text)) problems.push(`${target.code}: "${position.word}" không có trong bài đọc thành tiếng`);
      if (!position.target.trim()) problems.push(`${target.code}: chưa nêu vị trí chấm của "${position.word}"`);
      words.add(word);
    }
    if (target.positions.length === 2 && words.size !== 2) problems.push(`${target.code}: 2 vị trí phải là 2 từ khác nhau`);
  }
  if (total !== 8) problems.push(`Có ${total} vị trí phát âm, cần 8`);
  if(monthlyFinalIsWordList(text,context.exam.pronunciation.flatMap(target=>target.positions.map(position=>position.word))))problems.push("Bài đọc thành tiếng phải là câu tự nhiên, không phải danh sách từ");
  return verdict(problems, "8 vị trí, 2 cho mỗi P1–P4, đều lấy từ bộ từ ví dụ đã học và có trong bài đọc.");
}

function gen13(context: Context): Result {
  const { blueprint } = context;
  const problems: string[] = [];
  if (blueprint.totalScore !== MONTHLY_FINAL_TOTAL_SCORE) problems.push(`Tổng điểm ${blueprint.totalScore}`);
  if (blueprint.totalMinutes !== MONTHLY_FINAL_TOTAL_MINUTES) problems.push(`Tổng thời gian ${blueprint.totalMinutes} phút`);
  const minutes = blueprint.sections.reduce((sum, section) => sum + section.durationMinutes, 0);
  if (minutes !== MONTHLY_FINAL_TOTAL_MINUTES) problems.push(`Cộng thời gian các phần = ${minutes} phút`);
  for (const code of ["listening", "reading", "writing", "speaking"] as const) {
    const section = context.section(code);
    if (!section) { problems.push(`Thiếu phần ${code}`); continue; }
    if (section.maxScore !== MONTHLY_FINAL_SECTION_SCORE) problems.push(`${code} ${section.maxScore} điểm`);
    if (section.durationMinutes !== MONTHLY_FINAL_SECTION_MINUTES[code]) problems.push(`${code} ${section.durationMinutes} phút, cần ${MONTHLY_FINAL_SECTION_MINUTES[code]}`);
    const sum = section.groups.flatMap((group) => group.tasks).reduce((total, task) => total + task.maxScore, 0);
    if (Math.abs(sum - MONTHLY_FINAL_SECTION_SCORE) > 1e-6) problems.push(`${code}: cộng điểm câu = ${round(sum)}`);
  }
  if (context.taskByKey.get("SA")?.task.maxScore !== MONTHLY_FINAL_SPEAKING_A_SCORE || context.taskByKey.get("SB")?.task.maxScore !== MONTHLY_FINAL_SPEAKING_B_SCORE) problems.push("Speaking A phải 8 điểm (S1), B 17 điểm (S2–S5)");
  return verdict(problems, "100 điểm (4 × 25), 30 phút (8 + 8 + 8 + 6).");
}

function gen14(context: Context): Result {
  const problems: string[] = [];
  for (const { task } of context.choices) {
    if (!task.correctAnswer || !task.options?.some((option) => option.value === task.correctAnswer)) problems.push(`${task.key}: chưa khóa đáp án`);
  }
  const rubric = context.exam.grader.rubric;
  const total = (skill: "writing" | "speaking") => rubric.filter((item) => item.skill === skill).reduce((sum, item) => sum + item.maxScore, 0);
  if (total("writing") !== 25 || total("speaking") !== 25) problems.push("Rubric W1–W5/S1–S5 phải cộng 25 mỗi phần");
  if (!context.exam.framework.id || !context.exam.framework.scopeHash) problems.push("Thiếu phiên bản khung");
  return verdict(problems, `Key ${context.choices.length} câu và rubric W1–W5, S1–S5 đã khóa theo phiên bản đề.`);
}

function gen15(context: Context): Result {
  const problems: string[] = [];
  for (const { sectionCode, groupKey, task } of context.choices) {
    const item = context.exam.grader.items[task.key];
    if (!item?.explanation.trim()) problems.push(`${task.key}: thiếu giải thích`);
    if (sectionCode === "listening" && (!item?.evidence?.trim() || !includesNormalized(context.scriptByGroup.get(groupKey) ?? "", item.evidence))) problems.push(`${task.key}: trích đoạn bằng chứng không có trong script`);
  }
  return verdict(problems, "Mọi câu có giải thích; câu nghe có trích đoạn khớp script.");
}

function gen17(context: Context): Result {
  const problems: string[] = [];
  const summaries: string[] = [];
  for (const code of ["listening", "reading"] as const) {
    const items = context.choices.filter((item) => item.sectionCode === code);
    if (!items.length) continue;
    const answers = items.map((item) => item.task.correctAnswer ?? "");
    const counts = ["A", "B", "C"].map((letter) => answers.filter((answer) => answer === letter).length);
    summaries.push(`${code === "listening" ? "Nghe" : "Đọc"} A ${counts[0]} · B ${counts[1]} · C ${counts[2]}`);
    const n = items.length;
    if (n >= 6 && (Math.max(...counts) > Math.ceil(n * 0.45) || Math.min(...counts) < Math.floor(n * 0.2))) problems.push(`${code}: phân bố đáp án lệch (${counts.join("/")})`);
    let run = 1;
    for (let index = 1; index < answers.length; index += 1) {
      run = answers[index] === answers[index - 1] ? run + 1 : 1;
      if (run > 3) { problems.push(`${code}: ${run} câu liền có cùng đáp án`); break; }
    }
    if (n >= 6 && answers.every((answer, index) => answer === ["A", "B", "C"][index % 3])) problems.push(`${code}: đáp án theo chu kỳ A-B-C`);
    const longest = items.filter(({ task }) => {
      const lengths = (task.options ?? []).map((option) => option.label.trim().length);
      const correct = task.options?.findIndex((option) => option.value === task.correctAnswer) ?? -1;
      return correct >= 0 && lengths.every((length, index) => index === correct || length < lengths[correct]!);
    }).length;
    if (n >= 4 && longest / n > 0.5) problems.push(`${code}: đáp án đúng dài nhất ở ${longest}/${n} câu`);
  }
  return problems.length ? fail(problems) : pass(summaries.join(" · ") || "Không có câu khách quan.");
}

/** Every string a learner receives (GEN18, GEN22, GEN23 inspect the real learner package). */
export function learnerPackageStrings(blueprint: StoredAssessmentDefinition): string[] {
  const learner = publicAssessmentDefinition(blueprint);
  return learnerStrings(learner);
}

function learnerStrings(learner: ReturnType<typeof publicAssessmentDefinition>, writingPrompt?: string): string[] {
  const strings: string[] = [learner.title];
  for (const section of learner.sections) {
    strings.push(section.title, ...section.instructions);
    for (const group of section.groups) {
      strings.push(group.title, group.instruction);
      if (group.stimulus?.text) strings.push(group.stimulus.text);
      for (const line of group.stimulus?.lines ?? []) strings.push(line.text);
      for (const row of group.stimulus?.rows ?? []) strings.push(...row);
      for (const task of group.tasks) strings.push(section.code === "writing" && task.key === "W" && writingPrompt !== undefined ? writingPrompt : task.prompt, ...(task.title ? [task.title] : []), ...(task.hint ? [task.hint] : []), ...(task.options ?? []).map((option) => option.label));
    }
  }
  return strings.filter((value) => value.trim());
}

function gen18(context: Context): Result {
  const problems: string[] = [];
  const learner = publicAssessmentDefinition(context.blueprint);
  const raw = JSON.stringify(learner);
  if (raw.includes("\"correctAnswer\"")) problems.push("Gói học viên còn đáp án");
  if (raw.includes("\"monthlyExam\"") || raw.includes("\"monthlyScope\"")) problems.push("Gói học viên còn dữ liệu người chấm");
  if (learner.sections.some((section) => section.groups.some((group) => group.stimulus?.type === "audio_script" && (group.stimulus.lines?.length || group.stimulus.text)))) problems.push("Gói học viên còn script nghe");
  const text = normalizeText(learnerPackageStrings(context.blueprint).join("\n"));
  const secrets = [
    ...[...context.scriptByGroup.values()].flatMap((script) => sentences(script)),
    ...sentences(context.exam.grader.speakingSample),
    ...Object.values(context.exam.grader.items).flatMap((item) => [item.explanation, item.evidence ?? ""])
  ].map(value=>normalizeText(value).replace(/[.!?]+$/u,"")).filter((value) => value.length >= 25);
  const leaked = secrets.filter((secret) => text.includes(secret));
  // A1 explicitly includes an opening-sentence cue. Exempt just that quoted
  // occurrence in W when comparing its own sample, never scripts or other fields.
  const writingPrompt=context.taskByKey.get("W")?.task.prompt ?? "";
  const allowedPrompt=context.contract.cefr === "A1" ? withoutMarkedWritingStarter(writingPrompt,context.exam.grader.writingSample) : writingPrompt;
  const writingText=normalizeText(learnerStrings(learner,allowedPrompt).join("\n"));
  const writingLeaks=sentences(context.exam.grader.writingSample).map(value=>normalizeText(value).replace(/[.!?]+$/u,"")).filter(secret=>secret.length>=25 && writingText.includes(secret));
  if (leaked.length || writingLeaks.length) problems.push(`Gói học viên chứa ${leaked.length+writingLeaks.length} câu từ script/bài mẫu/lời giải`);
  return verdict(problems, "Gói học viên chỉ có hướng dẫn, câu hỏi, dữ kiện và audio; key, script, bài mẫu nằm trong gói người chấm.");
}

function withoutMarkedWritingStarter(prompt:string,sample:string):string {
  const marker=/(?:bắt đầu[^:\n"“'‘]{0,100}bằng câu(?: gợi ý)?|câu mở đầu gợi ý|(?:start|begin)[^:\n"“'‘]{0,60}with(?: the suggested (?:opening|sentence))?)\s*:?\s*["“'‘]([^\n]{1,400}?[.!?])\s*["”'’]/iu;
  return prompt.replace(marker,(whole:string,quote:string)=>{
    const starter=normalizeText(quote),answer=normalizeText(sample);
    // The cue must be the beginning of a longer answer, not a later sentence
    // relabelled as a hint or the complete private answer.
    const sentenceBody=quote.replace(/\b(?:Mr|Mrs|Ms|Dr|Prof)\./giu,"");
    if(!starter || !answer.startsWith(starter) || wordCount(sample)-wordCount(quote)<5 || !/[.!?]$/u.test(sentenceBody.trim()) || sentences(sentenceBody).length!==1) return whole;
    return whole.replace(quote,"");
  });
}

function gen19(context: Context): Result {
  const adaptive = context.blueprint.sections.flatMap((section) => section.groups.flatMap((group) => group.tasks)).filter((task) => task.hint || task.interaction);
  return adaptive.length ? fail(adaptive.map((task) => `${task.key}: có gợi ý/tương tác trong khi thi`)) : pass(`Mã đề cố định ${context.exam.formCode}; không có gợi ý hay câu thích ứng.`);
}

function gen20(context: Context): Result {
  const groups = context.section("listening")?.groups ?? [];
  const missing = groups.filter((group) => group.stimulus?.type !== "audio_script" || !group.stimulus.audioSrc?.trim()).map((group) => group.title);
  if (missing.length) return { status: "needs_review", detail: `SCRIPT_ONLY · chưa có audio cho ${missing.join(", ")}.` };
  if (context.exam.audio.status !== "REVIEWED") return { status: "needs_review", detail: "Đã có audio. Chờ Người vận hành nghe kiểm tra và xác nhận." };
  return pass(`Audio đã nghe soát${context.exam.audio.reviewedAt ? ` lúc ${context.exam.audio.reviewedAt}` : ""}.`);
}

function gen21Precheck(context: Context): string[] {
  const problems: string[] = [];
  for (const [groupKey, script] of context.scriptByGroup) {
    const evidence = context.exam.grader.listening.find((item) => item.groupKey === groupKey);
    if (!evidence?.gaSentence.trim() || !includesNormalized(script, evidence.gaSentence)) problems.push(`${groupKey}: chưa có câu GA trong script`);
    if (!evidence?.gbSentence.trim() || !includesNormalized(script, evidence.gbSentence)) problems.push(`${groupKey}: chưa có câu GB trong script`);
  }
  return problems;
}

const VIETNAMESE = /[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/iu;

function gen22(context: Context): Result {
  const { blueprint, contract } = context;
  const profile = MONTHLY_FINAL_LEVEL_PROFILES[contract.cefr];
  const problems: string[] = [];
  const instructions = blueprint.sections.flatMap((section) => [...section.instructions, ...section.groups.map((group) => group.instruction)]).filter((item) => item.trim());
  if (profile.instructionLanguage === "vi" && instructions.some((item) => !VIETNAMESE.test(item))) problems.push("A1–A2: hướng dẫn phải bằng tiếng Việt");
  if (profile.instructionLanguage === "en" && instructions.some((item) => VIETNAMESE.test(item))) problems.push("B1–C1: hướng dẫn phải bằng tiếng Anh");
  for (const [groupKey, script] of context.scriptByGroup) {
    const words = wordCount(script);
    if (words < Math.floor(profile.listeningScriptWords.min * 0.85) || words > Math.ceil(profile.listeningScriptWords.max * 1.15)) problems.push(`${groupKey}: bản nghe ${words} từ, hồ sơ ${profile.listeningScriptWords.min}–${profile.listeningScriptWords.max}`);
  }
  const readingLimit = Math.ceil(profile.readingItem.maxWords * 1.2);
  const longReading = context.choices.filter((item) => item.sectionCode === "reading" && wordCount(item.task.prompt) > readingLimit).map((item) => item.task.key);
  if (longReading.length) problems.push(`Câu đọc dài hơn ${profile.readingItem.maxWords} từ: ${longReading.slice(0, 5).join(", ")}`);
  const writing = context.tasks("writing")[0];
  if (writing && (writing.minWords !== profile.writing.minWords || writing.maxWords !== profile.writing.maxWords)) problems.push(`Writing phải ${profile.writing.minWords}–${profile.writing.maxWords} từ`);
  if(contract.cefr==="A1"&&writing&&!monthlyFinalWritingOpening(writing.prompt))problems.push("A1: đề Writing cần câu mở đầu gợi ý được đánh dấu rõ");
  const writingSampleWords=wordCount(context.exam.grader.writingSample);
  if(writingSampleWords<profile.writing.minWords||writingSampleWords>profile.writing.maxWords)problems.push(`Bài Writing mẫu ${writingSampleWords} từ, cần ${profile.writing.minWords}–${profile.writing.maxWords}`);
  const readAloud = wordCount(context.taskByKey.get("SA")?.task.prompt ?? "");
  if (readAloud > profile.speakingA.maxWords) problems.push(`Bài đọc thành tiếng ${readAloud} từ, tối đa ${profile.speakingA.maxWords}`);
  if (!context.taskByKey.get("SA")?.task.prompt.trim()) problems.push("Chưa có bài đọc thành tiếng");
  return verdict(problems, `Ngôn ngữ hướng dẫn ${profile.instructionLanguage === "vi" ? "tiếng Việt" : "tiếng Anh"}; độ dài ngữ liệu đúng hồ sơ ${contract.cefr}.`);
}

const GRAMMAR_TERMS = /\b(grammar|tense|conditional|modal verbs?|passive voice|present perfect|past simple|present simple|present continuous|future simple|first conditional|second conditional|formula)\b|ngữ pháp|cấu trúc|công thức|câu điều kiện/iu;

function gen23(context: Context): Result {
  const problems: string[] = [];
  const text = normalizeText(learnerPackageStrings(context.blueprint).join("\n"));
  const raw = learnerPackageStrings(context.blueprint).join("\n");
  const forbidden = [
    ...context.contract.grammarTopics.map((topic) => topic.title),
    ...context.contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.formula)),
    ...context.exam.grammar.flatMap((target) => [target.main.label, target.secondary.label, ...target.main.acceptedPatterns, ...target.secondary.acceptedPatterns])
  ].map(normalizeText).filter((value) => value.length >= 6);
  const leaked = [...new Set(forbidden.filter((value) => text.includes(value)))];
  if (leaked.length) problems.push(`Lộ tên chủ điểm/công thức/mẫu: ${leaked.slice(0, 3).map((value) => `"${value}"`).join(", ")}`);
  const term = raw.match(GRAMMAR_TERMS)?.[0];
  if (term) problems.push(`Gói học viên dùng thuật ngữ ngữ pháp "${term}"`);
  if (/\+\s*V\b|\bS\s*\+|V-ing|\(to\)\s*V/u.test(raw)) problems.push("Gói học viên có công thức dạng S + V");
  return verdict(problems, "Yêu cầu viết theo chức năng giao tiếp; không lộ tên chủ điểm, công thức hay mẫu câu.");
}

function wordRegex(word: string): RegExp {
  return new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^\\p{L}]|$)`, "iu");
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[“”"’']/gu, "").replace(/\s+/gu, " ").trim();
}

function includesNormalized(haystack: string, needle: string): boolean {
  const target = normalizeText(needle).replace(/[.…]+$/u, "");
  return Boolean(target) && normalizeText(haystack).includes(target);
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/u).map((item) => item.trim()).filter(Boolean);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
