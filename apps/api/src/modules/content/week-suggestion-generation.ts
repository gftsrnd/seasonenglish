import {
  weekSuggestionsInputSchema,
  weekSuggestionsOutputSchema,
  type AiTaskRunner
} from "@e4s/ai";

const WEEK_SUGGESTION_ATTEMPTS = 2;
const WEEK_SUGGESTION_OUTPUT_TOKENS = 8_000;
const WEEK_SUGGESTION_CONTRACT = [
  "Return one result for every requested weekNumber and no other weeks.",
  "For each week return exactly the requested CEFR levels and exactly three distinct, new workplace topic options.",
  "Never repeat a topic from usedTopics or another option in this response, comparing case-insensitively.",
  "Every option.plan must contain every requested CEFR level and exactly five non-empty day items for each level.",
  "Return the complete strict tool object; never omit a level, option, plan, or required text field."
].join("\n");

type SuggestionInput = ReturnType<typeof weekSuggestionsInputSchema.parse>;
type SuggestionOutput = ReturnType<typeof weekSuggestionsOutputSchema.parse>;

export async function generateWeekSuggestions(
  rawInput: SuggestionInput,
  task: { prompt: string },
  runner: AiTaskRunner
) {
  const input = weekSuggestionsInputSchema.parse(rawInput);
  let findings: Array<{ path: string; message: string }> = [];
  for (let attempt = 1; attempt <= WEEK_SUGGESTION_ATTEMPTS; attempt += 1) {
    const repair = findings.length
      ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path}: ${issue.message}`).join("; ")} Return a complete corrected response, preserving valid content.`
      : "";
    try {
      const result = await runner.runTask("week_suggestions", input, {
        systemPrompt: `${task.prompt}\n\n${WEEK_SUGGESTION_CONTRACT}${repair}`,
        maxOutputTokens: WEEK_SUGGESTION_OUTPUT_TOKENS
      });
      const parsed = weekSuggestionsOutputSchema.safeParse(result.output);
      if (!parsed.success) {
        findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path.join("."), message: issue.message }));
      } else {
        findings = validateSuggestionSemantics(parsed.data, input);
        if (findings.length === 0) return { result, output: parsed.data };
      }
    } catch (error) {
      if (!isInvalidOutput(error)) throw error;
      findings = invalidOutputIssues(error);
    }
    if (attempt === WEEK_SUGGESTION_ATTEMPTS) throwSuggestionInvalid(findings);
  }
  throwSuggestionInvalid(findings);
}

/**
 * A full pilot can contain more than two weeks.  Asking the model to return
 * every option and every five-day CEFR plan in a single response becomes
 * unreliable as the pilot grows, even though the contract supports it.
 * Generate one week at a time and carry each accepted topic into the next
 * request so the result remains complete and non-duplicated for weeks 3+.
 */
export async function generateWeekSuggestionBatches(
  rawInput: SuggestionInput,
  task: { prompt: string },
  runner: AiTaskRunner
) {
  const input = weekSuggestionsInputSchema.parse(rawInput);
  const usedTopics = [...input.usedTopics];
  const weeks: SuggestionOutput["weeks"] = [];
  const results = [] as Array<Awaited<ReturnType<typeof generateWeekSuggestions>>["result"]>;

  for (const weekNumber of input.weekNumbers) {
    const generated = await generateWeekSuggestions(
      { ...input, weekNumbers: [weekNumber], usedTopics },
      task,
      runner
    );
    weeks.push(...generated.output.weeks);
    results.push(generated.result);
    for (const option of generated.output.weeks.flatMap((week) => week.options)) usedTopics.push(option.topic);
  }

  return { output: { weeks }, results };
}

function validateSuggestionSemantics(output: SuggestionOutput, input: SuggestionInput) {
  const issues: Array<{ path: string; message: string }> = [];
  const expectedWeeks = new Set(input.weekNumbers);
  const returnedWeeks = new Set(output.weeks.map((week) => week.weekNumber));
  if (output.weeks.length !== expectedWeeks.size || returnedWeeks.size !== expectedWeeks.size || input.weekNumbers.some((week) => !returnedWeeks.has(week))) {
    issues.push({ path: "weeks", message: `Expected exactly one result for each requested week (${input.weekNumbers.join(", ")}).` });
  }
  const expectedLevels = new Set<string>(input.levels);
  const usedTopics = input.usedTopics.map((topic) => ({ raw: topic, key: topicKey(topic) }));
  const responseTopics: Array<{ raw: string; key: string }> = [];
  for (const week of output.weeks) {
    const returnedLevels = new Set(week.levels);
    if (returnedLevels.size !== expectedLevels.size || week.levels.some((level) => !expectedLevels.has(level)) || input.levels.some((level) => !returnedLevels.has(level))) {
      issues.push({ path: `weeks.${week.weekNumber}.levels`, message: `CEFR levels must exactly match: ${input.levels.join(", ")}.` });
    }
    for (const [optionIndex, option] of week.options.entries()) {
      const key = topicKey(option.topic);
      const conflict = [...usedTopics, ...responseTopics].find((candidate) => topicsOverlap(key, candidate.key));
      if (conflict) {
        issues.push({
          path: `weeks.${week.weekNumber}.options.${optionIndex}.topic`,
          message: `Topic is a duplicate or near-duplicate of \"${conflict.raw}\". Choose a meaningfully different workplace situation.`
        });
      }
      responseTopics.push({ raw: option.topic, key });
      const planLevels = Object.keys(option.plan);
      if (planLevels.length !== expectedLevels.size || planLevels.some((level) => !expectedLevels.has(level)) || input.levels.some((level) => option.plan[level]?.length !== 5)) {
        issues.push({ path: `weeks.${week.weekNumber}.options.${optionIndex}.plan`, message: "Each requested CEFR level must contain exactly 5 day-plan items." });
      }
    }
  }
  return issues.slice(0, 8);
}

function topicKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function topicsOverlap(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const dice = (2 * shared) / (leftTokens.size + rightTokens.size);
  return shared >= 2 && dice >= 0.65;
}

function isInvalidOutput(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID");
}

function invalidOutputIssues(error: unknown): Array<{ path: string; message: string }> {
  const value = error && typeof error === "object" ? error as {
    details?: { issues?: unknown };
    issues?: unknown;
  } : {};
  const candidate = Array.isArray(value.details?.issues) ? value.details.issues : value.issues;
  if (!Array.isArray(candidate)) return [{ path: "output", message: "The structured response was incomplete or invalid." }];
  return candidate.slice(0, 8).map((item) => {
    const issue = item && typeof item === "object" ? item as { path?: unknown; message?: unknown } : {};
    return {
      path: Array.isArray(issue.path) ? issue.path.map(String).join(".") : typeof issue.path === "string" ? issue.path : "output",
      message: typeof issue.message === "string" ? issue.message.replace(/[\r\n\t]+/g, " ").trim().slice(0, 300) : "Invalid structured output."
    };
  });
}

function throwSuggestionInvalid(issues: Array<{ path: string; message: string }>): never {
  throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
    code: "AI_OUTPUT_INVALID",
    issues: issues.slice(0, 8)
  });
}
