import { levelFormItemRepairOutputSchema, type AiTaskRunner, type LevelFormTaskOutput } from "@e4s/ai";
import { rebalanceAnswerPositions } from "../shared/answer-order.js";
import {
  evaluateLevelFormQuality, hasCanonicalLevelFormListeningParts, levelFormNearDuplicatePairs,
  levelFormQualityInputFromOutput, splitLevelFormListeningParts, type LevelFormQualityIssue, type LevelFormQualityReport
} from "./level-form-quality.js";

/**
 * Auto-fix of a generated level-up form BEFORE the draft is saved and shown
 * (the Operator checklist keeps only what the system cannot fix itself).
 *
 * - answer-position clustering: deterministic, the seeded answer-order module
 *   (option order only; keys, prompts and scripts are unchanged; no AI call);
 * - duplicate options, an exact or near-duplicate question, a NOT question whose key is in the text:
 *   ONE targeted AI call per section with only the offending questions
 *   (`level_form_item_repair`), then the checks run again; at most two rounds.
 *
 * A repaired question is accepted only when it is well-formed and, for an
 * option rewrite, keeps the prompt and the exact correct option text. An AI
 * failure keeps the original question (the issue then stays in the checklist).
 */

type Choice = LevelFormTaskOutput["listening"]["questions"][number];
type Section = "listening" | "reading";
export type LevelFormRepairKind = "distinct_options" | "replace";
export interface LevelFormRepairRequest { id: number; kind: LevelFormRepairKind; reason: string }

export const LEVEL_FORM_AUTO_FIX_MAX_ROUNDS = 2;
export const LEVEL_FORM_AUTO_FIX_MAX_ITEMS_PER_CALL = 15;
const QUESTIONS_PER_LISTENING_PART = 4;
const SECTION_LABEL: Record<Section, string> = { listening: "Nghe", reading: "Đọc" };

const LEVEL_FORM_ITEM_REPAIR_PROMPT = [
  "You repair a few multiple-choice questions of a Workplace English CEFR promotion test. Return exactly one item for every requested id, with that same id, and nothing else.",
  "Each question has four concise options and exactly one correct option that is clearly supported by its source text. correctIndex is the 0-based index of the correct option in your options array.",
  "kind \"distinct_options\": keep the prompt and the correct option text EXACTLY; replace the duplicated or empty wrong options with distinct plausible wrong ones of similar length.",
  "kind \"replace\": write a NEW question about a different detail of the same source text. It must not ask the same fact as any prompt in existingPrompts, its correct option must not be the single longest option, and if it is a NOT question exactly one option must be absent from the source.",
  "Prompts contain only the question text: no part labels such as \"Part 1:\" and no numbering. Return only the structured tool input."
].join("\n");

function normalise(value: string): string {
  return value.toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function wellFormed(question: Choice): boolean {
  const options = question.options.map((option) => normalise(option));
  return Boolean(question.prompt.trim()) && question.options.length === 4 && options.every(Boolean)
    && new Set(options).size === 4 && question.correctIndex >= 0 && question.correctIndex < 4;
}

/**
 * The offending questions of one section (0-based ids), most severe first.
 */
export function levelFormRepairRequests(questions: Choice[], report: LevelFormQualityReport, section: Section): LevelFormRepairRequest[] {
  const requests = new Map<number, LevelFormRepairRequest>();
  const add = (request: LevelFormRepairRequest) => { if (!requests.has(request.id)) requests.set(request.id, request); };
  for (const issue of [...report.severe, ...report.light]) {
    if (issue.section !== section || issue.questionIndex === undefined) continue;
    if (issue.code === "LEVEL_FORM_DUPLICATE_OPTIONS") add({ id: issue.questionIndex, kind: "distinct_options", reason: "two options are the same or empty" });
    if (issue.code === "LEVEL_FORM_DUPLICATE_PROMPT") add({ id: issue.questionIndex, kind: "replace", reason: "same prompt as another question" });
    if (issue.code === "LEVEL_FORM_NOT_QUESTION_KEY") add({ id: issue.questionIndex, kind: "replace", reason: "NOT question whose key is stated in the source" });
  }
  for (const [left, right] of levelFormNearDuplicatePairs(questions)) {
    if (!requests.has(left)) add({ id: right, kind: "replace", reason: `asks the same fact as question ${left + 1}` });
  }
  // Insertion order is severity order; the cap keeps one call small (token budget).
  return [...requests.values()].slice(0, LEVEL_FORM_AUTO_FIX_MAX_ITEMS_PER_CALL).sort((left, right) => left.id - right.id);
}

function sourcesFor(output: LevelFormTaskOutput, section: Section, ids: number[]): { sources: Array<{ sourceId: string; text: string }>; sourceOf: (id: number) => string } {
  if (section === "reading") return { sources: [{ sourceId: "passage", text: output.reading.passage }], sourceOf: () => "passage" };
  const parts = hasCanonicalLevelFormListeningParts(output.listening.script) ? splitLevelFormListeningParts(output.listening.script) : null;
  const sourceOf = (id: number) => parts ? `part-${Math.floor(id / QUESTIONS_PER_LISTENING_PART) + 1}` : "script";
  const used = [...new Set(ids.map(sourceOf))];
  return {
    sources: used.map((sourceId) => ({ sourceId, text: parts ? parts[Number(sourceId.slice(5)) - 1]!.script : output.listening.script })),
    sourceOf
  };
}

/** Merges the repaired questions that pass the acceptance rules; returns the accepted ids. */
export function mergeLevelFormRepairs(questions: Choice[], requests: LevelFormRepairRequest[], repaired: Array<Choice & { id: number }>): { questions: Choice[]; accepted: number[] } {
  const next = [...questions];
  const accepted: number[] = [];
  const wanted = new Map(requests.map((request) => [request.id, request]));
  for (const item of repaired) {
    const request = wanted.get(item.id);
    const original = questions[item.id];
    if (!request || !original || accepted.includes(item.id)) continue;
    const candidate: Choice = { prompt: item.prompt.trim(), options: item.options.map((option) => option.trim()), correctIndex: item.correctIndex };
    if (!wellFormed(candidate)) continue;
    if (request.kind !== "replace") {
      if (normalise(candidate.options[candidate.correctIndex]!) !== normalise(original.options[original.correctIndex]!)) continue;
      candidate.prompt = original.prompt;
    } else {
      const others = next.filter((_, index) => index !== item.id).map((question) => normalise(question.prompt));
      if (others.includes(normalise(candidate.prompt))) continue;
    }
    next[item.id] = candidate;
    accepted.push(item.id);
  }
  return { questions: next, accepted };
}

async function repairSection(
  runner: AiTaskRunner, targetLevel: string, output: LevelFormTaskOutput, section: Section, requests: LevelFormRepairRequest[]
): Promise<Array<Choice & { id: number }>> {
  const questions = output[section].questions;
  const { sources, sourceOf } = sourcesFor(output, section, requests.map((request) => request.id));
  const input = {
    targetLevel, section, sources,
    existingPrompts: questions.map((question) => question.prompt),
    items: requests.map((request) => ({ ...request, sourceId: sourceOf(request.id), ...questions[request.id]! }))
  };
  const result = await runner.runTask("level_form_item_repair", input, {
    systemPrompt: LEVEL_FORM_ITEM_REPAIR_PROMPT,
    maxOutputTokens: Math.min(4_000, 300 + requests.length * 220),
    maxAttempts: 1
  });
  const parsed = levelFormItemRepairOutputSchema.safeParse(result.output);
  return parsed.success ? parsed.data.items : [];
}

function sectionIssue(report: LevelFormQualityReport, section: Section, code: LevelFormQualityIssue["code"]): LevelFormQualityIssue | undefined {
  return [...report.severe, ...report.light].find((issue) => issue.section === section && issue.code === code);
}

function positionSummary(questions: Choice[]): string {
  const counts = [0, 0, 0, 0];
  for (const question of questions) if (question.correctIndex >= 0 && question.correctIndex < 4) counts[question.correctIndex]! += 1;
  const max = Math.max(...counts);
  return `${"ABCD"[counts.indexOf(max)]} ${max}/${questions.length}`;
}

export interface LevelFormAutoFixResult {
  /** The shuffled output after the deterministic and AI fixes (keys balanced again). */
  output: LevelFormTaskOutput;
  quality: LevelFormQualityReport;
  /** Short Vietnamese notes "what the system fixed", shown above the checklist. */
  autoFixed: string[];
  aiCalls: number;
}

/**
 * `original` is the canonical AI output (model order), `shuffled` the same
 * output after the seeded answer shuffle with `seed` (see assembleLevelFormFromAi).
 */
export async function autoFixLevelFormOutput(
  runner: AiTaskRunner | undefined,
  input: { targetLevel: string; original: LevelFormTaskOutput; shuffled: LevelFormTaskOutput; seed: string; log?: (message: string, details: Record<string, unknown>) => void }
): Promise<LevelFormAutoFixResult> {
  const autoFixed: string[] = [];
  const before = evaluateLevelFormQuality(levelFormQualityInputFromOutput(input.original));
  for (const section of ["listening", "reading"] as const) {
    if (sectionIssue(before, section, "LEVEL_FORM_ANSWER_POSITION_BIAS")) autoFixed.push(`Phần ${SECTION_LABEL[section]}: đổi thứ tự lựa chọn để đáp án chia đều A/B/C/D (bản AI dồn vào ${positionSummary(input.original[section].questions)}); nội dung câu và đáp án giữ nguyên.`);
  }
  let output = input.shuffled;
  let quality = evaluateLevelFormQuality(levelFormQualityInputFromOutput(output));
  const replaced: Record<Section, Map<number, string>> = { listening: new Map(), reading: new Map() };
  const distinct: Record<Section, Set<number>> = { listening: new Set(), reading: new Set() };
  let aiCalls = 0;
  for (let round = 0; runner && round < LEVEL_FORM_AUTO_FIX_MAX_ROUNDS; round += 1) {
    const plans = (["listening", "reading"] as const)
      .map((section) => ({ section, requests: levelFormRepairRequests(output[section].questions, quality, section) }))
      .filter((plan) => plan.requests.length);
    if (!plans.length) break;
    const results = await Promise.all(plans.map(async (plan) => {
      aiCalls += 1;
      try { return { ...plan, repaired: await repairSection(runner, input.targetLevel, output, plan.section, plan.requests) }; }
      catch (error) {
        input.log?.("Level form item repair failed", { section: plan.section, round, error: error instanceof Error ? error.message : String(error) });
        return { ...plan, repaired: [] };
      }
    }));
    let changed = false;
    let next = output;
    for (const { section, requests, repaired } of results) {
      const merged = mergeLevelFormRepairs(next[section].questions, requests, repaired);
      if (!merged.accepted.length) continue;
      changed = true;
      for (const id of merged.accepted) {
        const request = requests.find((item) => item.id === id)!;
        if (request.kind === "replace") replaced[section].set(id, request.reason);
        else distinct[section].add(id);
      }
      // Same seed -> same slots: the repaired keys go back to the balanced positions.
      next = { ...next, [section]: { ...next[section], questions: rebalanceAnswerPositions(merged.questions, `${input.seed}:${section}`, 4) } };
    }
    if (!changed) break;
    output = next;
    quality = evaluateLevelFormQuality(levelFormQualityInputFromOutput(output));
  }

  const REASON_VI: Record<string, string> = {
    "same prompt as another question": "trùng đề bài với câu khác",
    "NOT question whose key is stated in the source": "câu NOT có đáp án nằm trong bài"
  };
  const finalIssues = [...quality.severe, ...quality.light];
  for (const section of ["listening", "reading"] as const) {
    const label = SECTION_LABEL[section];
    const stillDuplicateOptions = (id: number) => finalIssues.some((issue) => issue.section === section && issue.questionIndex === id && issue.code === "LEVEL_FORM_DUPLICATE_OPTIONS");
    const distinctFixed = [...distinct[section]].filter((id) => !stillDuplicateOptions(id)).sort((left, right) => left - right);
    if (distinctFixed.length) autoFixed.push(`Phần ${label}: thay lựa chọn bị trùng ở câu ${distinctFixed.map((id) => id + 1).join(", ")}.`);
    const pairs = levelFormNearDuplicatePairs(output[section].questions);
    const replacedFixed = [...replaced[section].keys()].filter((id) => !pairs.some((pair) => pair.includes(id))
      && !finalIssues.some((issue) => issue.section === section && issue.questionIndex === id && (issue.code === "LEVEL_FORM_DUPLICATE_PROMPT" || issue.code === "LEVEL_FORM_NOT_QUESTION_KEY")))
      .sort((left, right) => left - right);
    if (replacedFixed.length) autoFixed.push(`Phần ${label}: thay ${replacedFixed.map((id) => {
      const reason = replaced[section].get(id)!;
      const pair = /^asks the same fact as question (\d+)$/u.exec(reason);
      return `câu ${id + 1} (${pair ? `trùng ý với câu ${pair[1]}` : REASON_VI[reason] ?? reason})`;
    }).join(", ")} bằng câu hỏi mới về chi tiết khác của bài.`);
  }
  return { output, quality, autoFixed, aiCalls };
}
