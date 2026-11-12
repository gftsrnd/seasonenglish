import type { AiTaskRunner, MonthlyFinalGenerationInput, MonthlyFinalReceptiveOutput } from "@e4s/ai";

type ReadingTerm = MonthlyFinalGenerationInput["targets"]["reading"][number];
type Reading = MonthlyFinalReceptiveOutput["reading"];
type Issue = { path: string; message: string };

export function monthlyFinalReadingSystemPrompt(taskPrompt: string, terms: readonly ReadingTerm[]): string {
  const balancedTerms = terms.filter((_, index) => index % 2 === 0).map(term => term.id);
  return [
    taskPrompt,
    `Generate only Reading, one question for each of these ${terms.length} terms: ${terms.map(term => term.id).join(", ")}.`,
    "Use fresh, short context sentences within levelProfile.readingItem.maxWords. Do not copy any taught grammar example.",
    "Test the supplied meaning. All three options should use the same grammatical shape and different meanings, with exactly one correct interpretation. Do not use conjugations or plurals of the same word as distractors.",
    "In a gap item all three options are the same word class as the key (three verbs, three nouns or three adjectives), so the learner must understand the meaning; a key that is the only verb among nouns is answered from grammar alone and is rejected. Exactly one option may fit: if a second option also makes a correct, natural sentence (\"Please ____ your results in the report\": write / explain), replace that distractor.",
    "Vary the item types across the set, roughly one third each: (1) gap items: one context sentence with a single blank written as ____ where the target word is the correct option; (2) action items: the context sentence contains the target word and a short question asks what someone should do next or why; (3) meaning-in-context or main-idea items: the context sentence contains the target word and a short question asks what it means here or what the message is mainly about. Use 'Which word is closest in meaning to ...' for at most one item in six.",
    "Every prompt follows exactly one of these templates (TARGET = the item's target word; -s/-ed/-ing endings are allowed):",
    "  gap: \"<context sentence with ____ in place of TARGET>\" and TARGET is the correct option. Example for 'invoice': \"Please send the ____ to the finance team today.\" with options invoice / meeting / laptop.",
    "  action: \"<context sentence that contains TARGET>. <short question ending in '?'>\" Example for 'invoice': \"The invoice shows the wrong price. What should the team do next?\"",
    "  meaning: \"<context sentence that contains TARGET>. <short question ending in '?'>\" Example for 'invoice': \"Our invoice for October is ready. What is the invoice here?\"",
    "Never put TARGET only in the question or only in the options: the context sentence before the question must contain TARGET itself (gap items: TARGET fills the blank). Every prompt without a blank ends with exactly one short question ending in '?'; a statement or instruction alone is not an item.",
    "If you use a blank, each option must fit the blank without repeating other words in the prompt. The prompt length limit includes that question.",
    "Before returning, check every item: (1) is TARGET in the context sentence, or is it the correct option of the blank? (2) does the prompt end with '?' or contain ____? Rewrite any item that fails either check.",
    `For these specific IDs, at least one distractor must be as long as the correct option in characters: ${balancedTerms.join(", ")}.`,
    "Keep the right meaning compact. Give the distractors a comparable amount of detail. For example, use 'get more details', 'wait until next week', and 'ask about the price' rather than a long explanation and two short labels.",
    "Explain the answer by meaning in context. Before returning, compare the option lengths for the listed IDs and fix any uniquely longest correct option."
  ].join("\n");
}

const READING_REPAIR_PROMPT = [
  "Repair the supplied Reading draft. Preserve the term IDs, correct meanings and answer positions. Change only the items named in the findings and keep every other item exactly as it is.",
  "Option length: for every listed term, shorten the correct phrase or give a plausible wrong phrase comparable detail. All three choices must fit the same grammatical slot or use parallel meaning phrases. Never add empty padding or make two choices correct.",
  "Missing question: keep the context sentence and add one short question ending in '?', or replace the target word with a single ____ blank whose correct option is the target word.",
  "Word class: in a gap item replace the two distractors with words of the key's word class that are wrong in meaning; keep the blank and the key.",
  "Second correct option or disputed key (independent checker): keep the term and its correct meaning; rewrite the context sentence so only the key fits, or replace the distractor that also fits.",
  "Target word only in the question or options: rewrite the context sentence so it contains the exact target word (-s/-ed/-ing endings are allowed), then ask one short question ending in '?' about its meaning or what someone should do.",
  "Compare character lengths. At least half of the correct choices must be tied with or shorter than another choice. Return the complete Reading result."
].join("\n");

/** Item-level findings a targeted repair of the existing draft can fix (option length, GEN07 question / context word, prompt length). */
function repairableReadingIssues(issues: readonly Issue[] | undefined): Issue[] {
  return (issues ?? []).filter(issue =>
    (issue.path === "reading.questions" && issue.message.includes("uniquely longest"))
    || /^reading\.questions\.\d+\.(?:prompt|termId)$/u.test(issue.path)
    || (/^reading\.questions\.\d+\.options$/u.test(issue.path) && issue.message.includes("word class")));
}

/**
 * Reading questions for a set of target terms. The same validation (option
 * length, GEN07 question and context-word pre-check) runs inside the bounded
 * repair loop of each call. A draft that still fails gets one targeted repair
 * of the reported items; like the level-up reading repair, a slice that still
 * fails is then split in half and each half is requested on its own (at most
 * two levels deep).
 */
export async function generateMonthlyFinalReading(runner: AiTaskRunner, input: MonthlyFinalGenerationInput, taskPrompt: string, terms: ReadingTerm[] = input.targets.reading, depth = 0): Promise<Reading> {
  const sliceInput = { ...input, targets: { ...input.targets, reading: terms } };
  try {
    const result = await runner.runTask("monthly_final_reading_generation", sliceInput, {
      systemPrompt: monthlyFinalReadingSystemPrompt(taskPrompt, terms),
      maxOutputTokens: 8_000,
      maxAttempts: 2
    });
    return (result.output as Pick<MonthlyFinalReceptiveOutput, "reading">).reading;
  } catch (error) {
    const retryable = error && typeof error === "object" && ["AI_OUTPUT_INVALID", "AI_OUTPUT_TRUNCATED"].includes(String((error as { code?: unknown }).code));
    if (!retryable) throw error;
    const diagnostic = (error as {details?: {invalidOutput?: string; issues?: Issue[]}}).details;
    const findings = repairableReadingIssues(diagnostic?.issues);
    if (findings.length && typeof diagnostic?.invalidOutput === "string") {
      try {
        const repaired = await runner.runTask("monthly_final_reading_generation", sliceInput, {
          systemPrompt: READING_REPAIR_PROMPT,
          messages: [
            {role: "user", content: JSON.stringify(sliceInput)},
            {role: "assistant", content: diagnostic.invalidOutput},
            {role: "user", content: findings.map(issue => `${issue.path}: ${issue.message}`).join("\n")}
          ],
          maxOutputTokens: 8000, maxAttempts: 2
        });
        return (repaired.output as Pick<MonthlyFinalReceptiveOutput, "reading">).reading;
      } catch (repairError) {
        if (!repairError || typeof repairError !== "object" || !("code" in repairError) || repairError.code !== "AI_OUTPUT_INVALID") throw repairError;
        error = repairError;
      }
    }
    if (depth >= 2 || terms.length < 2) throw error;
    const middle = Math.ceil(terms.length / 2);
    const [first, second] = await Promise.all([
      generateMonthlyFinalReading(runner, input, taskPrompt, terms.slice(0, middle), depth + 1),
      generateMonthlyFinalReading(runner, input, taskPrompt, terms.slice(middle), depth + 1)
    ]);
    return { questions: [...first.questions, ...second.questions] };
  }
}

/**
 * One targeted repair of an accepted Reading draft for the items an
 * independent answer check disputed (December 2026: R04 write / explain). The
 * output still goes through the reading validator of the task.
 */
export async function repairMonthlyFinalReadingItems(runner: AiTaskRunner, input: MonthlyFinalGenerationInput, reading: Reading, findings: readonly { termId: string; message: string }[]): Promise<Reading> {
  const indexOf = new Map(reading.questions.map((question, index) => [question.termId, index]));
  const lines = findings.flatMap((finding) => indexOf.has(finding.termId) ? [`reading.questions.${indexOf.get(finding.termId)} (${finding.termId}): ${finding.message}`] : []);
  if (!lines.length) return reading;
  const repaired = await runner.runTask("monthly_final_reading_generation", input, {
    systemPrompt: READING_REPAIR_PROMPT,
    messages: [
      { role: "user", content: JSON.stringify(input) },
      { role: "assistant", content: JSON.stringify({ questions: reading.questions }) },
      { role: "user", content: lines.join("\n") }
    ],
    maxOutputTokens: 8000, maxAttempts: 2
  });
  return (repaired.output as Pick<MonthlyFinalReceptiveOutput, "reading">).reading;
}
