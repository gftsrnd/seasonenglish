import type { AiTaskRunner } from "@e4s/ai";
import type { MonthlyFinalGenCode } from "@e4s/contracts";
import type { StoredAssessmentDefinition } from "@e4s/database";

/**
 * Independent answer check for a generated monthly final (December 2026 re-run:
 * the published A1 form had R04 "Please ____ your results in the report" keyed
 * "write" while "explain" also fits, and a garbled Vietnamese Writing task that
 * forced the word "jump"). One `monthly_answer_verification` call per form
 * (the approach of b8e3c20): the checker solves every Listening and Reading
 * item WITHOUT the key, and judges the Writing and Speaking B tasks. It only
 * reports problems; the route turns them into a targeted Reading repair or a
 * quality failure. A failed call never fails the generation.
 */
export interface MonthlyFinalVerificationFinding {
  code: Extract<MonthlyFinalGenCode, "GEN05" | "GEN12">;
  taskKey: string;
  section: "listening" | "reading" | "writing" | "speaking";
  /** Vietnamese, for the Operator. */
  message: string;
  /** English, for a targeted repair request. */
  hint: string;
}

interface VerificationItem { ref: string; section: MonthlyFinalVerificationFinding["section"]; prompt: string; options: string[]; key?: string; context?: string }

const PRODUCTIVE_OK = "OK: the Vietnamese task is clear, natural and consistent (one opening hint at most), and the facts give a natural place to use every required word";
const PRODUCTIVE_PROBLEM = "PROBLEM: the Vietnamese is garbled, ungrammatical or contradictory, gives two different opening hints, or a required word has no natural use in the situation";

export const MONTHLY_FINAL_VERIFICATION_PROMPT = [
  "You are an independent English teacher checking a monthly workplace English exam before learners see it. You did not write it.",
  "Objective items (listening, reading): solve each item yourself - the key is NOT given. Read the prompt, the context (listening script) when there is one, and every option.",
  "correctOptions = EVERY option, copied exactly, that you would mark fully correct: grammatical British English, natural, and the meaning fits the sentence or is stated in the script. If two options both make a correct, natural sentence (Please ____ your results in the report: write and explain), list both. If none is acceptable, return an empty list.",
  "For a listening question an option is correct only when the script states it; an option that is only partly supported or mixes two details is not correct.",
  `Task items (ref W or SB): the prompt is a Vietnamese learner task with facts and the required English words (the line "Dùng đủ N từ sau: ..."). Return in correctOptions the one option that is true: "${PRODUCTIVE_OK}" or "${PRODUCTIVE_PROBLEM}". In note, name the garbled sentence or the word with no natural use.`,
  "note: one short English sentence. Return one entry per input item with its ref unchanged."
].join("\n");

function normalized(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[“”"’']/gu, "").replace(/\s+/gu, " ").replace(/[.!?]+$/u, "").trim();
}

/** The items one verification call checks: every Listening/Reading choice item, then the Writing and Speaking B tasks. */
export function monthlyFinalVerificationItems(blueprint: StoredAssessmentDefinition): VerificationItem[] {
  const items: VerificationItem[] = [];
  for (const section of blueprint.sections) {
    for (const group of section.groups) {
      const script = group.stimulus?.type === "audio_script" ? (group.stimulus.lines ?? []).map((line) => `${line.speaker}: ${line.text}`).join("\n") : "";
      for (const task of group.tasks) {
        if ((section.code === "listening" || section.code === "reading") && task.options?.length) {
          const key = task.options.find((option) => option.value === task.correctAnswer)?.label ?? "";
          if (!task.prompt.trim() || !key) continue;
          items.push({ ref: task.key, section: section.code, prompt: task.prompt, options: task.options.map((option) => option.label), key, ...(script ? { context: script } : {}) });
        } else if ((section.code === "writing" || task.key === "SB") && task.prompt.trim()) {
          items.push({ ref: task.key, section: section.code === "writing" ? "writing" : "speaking", prompt: task.prompt, options: [PRODUCTIVE_OK, PRODUCTIVE_PROBLEM] });
        }
      }
    }
  }
  return items;
}

interface Verdict { ref: string; correctOptions: string[]; note?: string }

/** Verdicts -> findings: a key the checker rejects or a second correct option (GEN05); a task judged garbled or forcing a word (GEN12). */
export function monthlyFinalVerificationFindings(items: readonly VerificationItem[], verdicts: readonly Verdict[]): MonthlyFinalVerificationFinding[] {
  const byRef = new Map(verdicts.map((verdict) => [verdict.ref, verdict]));
  const findings: MonthlyFinalVerificationFinding[] = [];
  for (const item of items) {
    const verdict = byRef.get(item.ref);
    if (!verdict) continue;
    const accepted = new Set(verdict.correctOptions.map(normalized));
    const note = verdict.note?.trim() ? ` (${verdict.note.trim()})` : "";
    if (!item.key) {
      if (accepted.has(normalized(PRODUCTIVE_PROBLEM)) && !accepted.has(normalized(PRODUCTIVE_OK))) {
        findings.push({ code: "GEN12", taskKey: item.ref, section: item.section, message: `${item.ref}: người kiểm độc lập thấy đề tiếng Việt rối hoặc ép dùng từ không tự nhiên${note}`, hint: `The task is garbled or forces a required word${note}` });
      }
      continue;
    }
    const others = item.options.filter((option) => normalized(option) !== normalized(item.key!) && accepted.has(normalized(option)));
    if (!accepted.has(normalized(item.key))) findings.push({ code: "GEN05", taskKey: item.ref, section: item.section, message: `${item.ref}: người kiểm độc lập không chọn đáp án "${item.key}"${others.length ? ` mà chọn "${others.join("\", \"")}"` : ""}${note}`, hint: `An independent checker does not accept the key "${item.key}"${others.length ? ` and accepts "${others.join("\", \"")}"` : ""}${note}. Make the key the only correct option.` });
    else if (others.length) findings.push({ code: "GEN05", taskKey: item.ref, section: item.section, message: `${item.ref}: "${others.join("\", \"")}" cũng đúng bên cạnh đáp án "${item.key}"${note}`, hint: `"${others.join("\", \"")}" is also correct next to the key "${item.key}"${note}. Replace that distractor or rewrite the context so only the key fits.` });
  }
  return findings;
}

/** Runs the check (one call). `only` limits it to some task keys (re-check after a repair). */
export async function verifyMonthlyFinalAnswers(runner: AiTaskRunner, cefr: string, blueprint: StoredAssessmentDefinition, only?: ReadonlySet<string>): Promise<MonthlyFinalVerificationFinding[]> {
  const items = monthlyFinalVerificationItems(blueprint).filter((item) => !only || only.has(item.ref));
  if (!items.length) return [];
  try {
    const result = await runner.runTask("monthly_answer_verification", {
      cefr,
      items: items.map(({ ref, prompt, options, context }) => ({ ref, prompt, options, ...(context ? { context } : {}) }))
    }, { systemPrompt: MONTHLY_FINAL_VERIFICATION_PROMPT, maxOutputTokens: 8_000, temperature: 0, maxAttempts: 2 });
    const output = result.output as { items?: unknown };
    const verdicts = Array.isArray(output?.items)
      ? output.items.filter((entry): entry is Verdict => Boolean(entry) && typeof entry === "object" && typeof (entry as Verdict).ref === "string" && Array.isArray((entry as Verdict).correctOptions))
      : [];
    return monthlyFinalVerificationFindings(items, verdicts);
  } catch {
    return [];
  }
}
