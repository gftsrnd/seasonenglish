import { z } from "zod";
import type { AiValidationIssue } from "./types.js";

/**
 * Monthly final exam v2.0 generation. The route splits generation into a
 * receptive slice (two listening messages + reading items) and a productive
 * slice (grammar components, writing, speaking A/B) so neither tool result hits
 * the provider output ceiling. Both slices are validated here (shape) and in
 * the API (GEN01–GEN23 checks) before anything is stored.
 */
const cefr = z.enum(["A1", "A2", "B1", "B2", "C1"]);
const termSchema = z.object({
  id: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(10),
  word: z.string().trim().min(1).max(120),
  type: z.string().trim().max(60),
  meaning: z.string().trim().max(300)
});
const pronunciationCode = z.enum(["P1", "P2", "P3", "P4"]);
const grammarCode = z.enum(["GA", "GB"]);

export const monthlyFinalGenerationInputSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  cefr,
  formCode: z.string().trim().min(1).max(120),
  frameworkVersion: z.number().int().positive(),
  theme: z.object({ title: z.string().trim().min(1).max(300), brief: z.string().max(4_000), context: z.string().max(4_000), communicationGoal: z.string().max(4_000) }),
  levelProfile: z.record(z.string(), z.unknown()),
  allocation: z.object({ n: z.number().int().positive(), l: z.number().int().positive(), r: z.number().int().positive(), w: z.number().int().positive(), s: z.number().int().positive() }),
  targets: z.object({ listening: z.array(termSchema).min(1), reading: z.array(termSchema).min(1), writing: z.array(termSchema).min(1), speaking: z.array(termSchema).min(1) }),
  grammar: z.array(z.object({
    code: grammarCode, topicId: z.string().min(1), topicTitle: z.string().min(1),
    taughtSteps: z.array(z.object({ stepId: z.string().min(1), focus: z.string(), formula: z.string(), usage: z.string(), examples: z.array(z.string()) })).min(2)
  })).length(2),
  pronunciation: z.array(z.object({
    code: pronunciationCode, soundId: z.string().min(1), ipa: z.string(), label: z.string(),
    taughtExamples: z.array(z.object({ exampleId: z.string().min(1), word: z.string().min(1), ipa: z.string() })).min(2)
  })).length(4),
  backgroundWords: z.array(z.string()).max(1_000)
});
export type MonthlyFinalGenerationInput = z.infer<typeof monthlyFinalGenerationInputSchema>;

const choiceQuestion = z.object({
  termId: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(600),
  options: z.array(z.string().trim().min(1).max(200)).length(3),
  correctIndex: z.number().int().min(0).max(2),
  explanation: z.string().trim().min(1).max(600)
});

export const monthlyFinalReceptiveOutputSchema = z.object({
  listening: z.object({
    messages: z.array(z.object({
      label: z.enum(["A", "B"]),
      speaker: z.string().trim().min(1).max(80),
      script: z.string().trim().min(120).max(2_000),
      gaSentence: z.string().trim().min(1).max(400),
      gbSentence: z.string().trim().min(1).max(400),
      questions: z.array(choiceQuestion.extend({ evidence: z.string().trim().min(1).max(400) })).min(1).max(40)
    })).length(2)
  }),
  reading: z.object({ questions: z.array(choiceQuestion).min(1).max(40) })
});
export type MonthlyFinalReceptiveOutput = z.infer<typeof monthlyFinalReceptiveOutputSchema>;
/**
 * Listening and reading are generated in separate calls: one call producing
 * both left reading empty. The tool schemas the model sees are flat
 * (`{ messages }`, `{ questions }`): with a single wrapper object Claude Haiku
 * returned the whole slice as one JSON-encoded string. These schemas map the
 * flat output back to `{ listening: { messages } }` / `{ reading: { questions } }`
 * and still accept the wrapped (or stringified) shape.
 */
export const monthlyFinalListeningOutputSchema = z.preprocess(normalizeMonthlyFinalListeningOutput, monthlyFinalReceptiveOutputSchema.pick({ listening: true }));
export type MonthlyFinalListeningOutput = z.infer<typeof monthlyFinalListeningOutputSchema>;
export const monthlyFinalReadingOutputSchema = z.preprocess(normalizeMonthlyFinalReadingOutput, monthlyFinalReceptiveOutputSchema.pick({ reading: true }));
export type MonthlyFinalReadingOutput = z.infer<typeof monthlyFinalReadingOutputSchema>;

export function normalizeMonthlyFinalListeningOutput(value: unknown): unknown {
  const output = decodeJson(value);
  if (!isRecord(output)) return output;
  const listening = "listening" in output ? decodeJson(output.listening) : output;
  if (!isRecord(listening)) return { listening };
  const messages = decodeJson(listening.messages);
  return {
    listening: {
      messages: Array.isArray(messages)
        ? messages.map((message) => {
          const decoded = decodeJson(message);
          return isRecord(decoded) ? { ...decoded, questions: decodeQuestions(decoded.questions) } : decoded;
        })
        : messages
    }
  };
}

export function normalizeMonthlyFinalReadingOutput(value: unknown): unknown {
  const output = decodeJson(value);
  if (!isRecord(output)) return output;
  const reading = "reading" in output ? decodeJson(output.reading) : output;
  if (!isRecord(reading)) return { reading };
  return { reading: { questions: decodeQuestions(reading.questions) } };
}

const grammarEvidence = z.string().trim().min(1).max(400);
const monthlyFinalProductiveBaseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  grammarComponents: z.array(z.object({
    code: grammarCode,
    mainStepId: z.string().trim().min(1), mainLabel: z.string().trim().min(1).max(200), mainPatterns: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
    secondaryStepId: z.string().trim().min(1), secondaryLabel: z.string().trim().min(1).max(200), secondaryPatterns: z.array(z.string().trim().min(1).max(200)).min(1).max(6)
  })).length(2),
  writing: z.object({
    task: z.string().trim().min(10).max(600),
    facts: z.string().trim().min(10).max(1_200),
    requirements: z.array(z.string().trim().min(5).max(400)).min(2).max(3),
    sample: z.string().trim().min(20).max(2_000),
    evidence: z.object({ gaMain: grammarEvidence, gaSecondary: grammarEvidence, gbMain: grammarEvidence, gbSecondary: grammarEvidence })
  }),
  speakingA: z.object({
    text: z.string().trim().min(10).max(400),
    positions: z.array(z.object({ code: pronunciationCode, exampleId: z.string().trim().min(1), word: z.string().trim().min(1).max(60), target: z.string().trim().min(1).max(120) })).length(8)
  }),
  speakingB: z.object({
    task: z.string().trim().min(10).max(600),
    facts: z.string().trim().min(10).max(1_200),
    requirements: z.array(z.string().trim().min(5).max(400)).min(2).max(3),
    sample: z.string().trim().min(20).max(2_000),
    evidence: z.object({ gaMain: grammarEvidence, gbMain: grammarEvidence })
  })
});
/**
 * The productive tool schema is already flat (five top-level fields, no single
 * wrapper), but any of those fields may still come back JSON-encoded; decode
 * them (and an accidental `{ productive: {...} }` wrapper) before validation.
 */
export const monthlyFinalProductiveOutputSchema = z.preprocess(normalizeMonthlyFinalProductiveOutput, monthlyFinalProductiveBaseSchema);
export type MonthlyFinalProductiveOutput = z.infer<typeof monthlyFinalProductiveOutputSchema>;

export function normalizeMonthlyFinalProductiveOutput(value: unknown): unknown {
  let output = decodeJson(value);
  if (!isRecord(output)) return output;
  if ("productive" in output && !("grammarComponents" in output)) output = decodeJson(output.productive);
  if (!isRecord(output)) return output;
  const grammarComponents = decodeJson(output.grammarComponents);
  const speakingA = decodeJson(output.speakingA);
  return {
    ...output,
    grammarComponents: Array.isArray(grammarComponents) ? grammarComponents.map(decodeJson) : grammarComponents,
    writing: decodeProduction(output.writing),
    speakingA: isRecord(speakingA) ? { ...speakingA, positions: decodeArrayOfObjects(speakingA.positions) } : speakingA,
    speakingB: decodeProduction(output.speakingB)
  };
}

function decodeProduction(value: unknown): unknown {
  const production = decodeJson(value);
  if (!isRecord(production)) return production;
  return { ...production, requirements: decodeJson(production.requirements), evidence: decodeJson(production.evidence) };
}

function decodeQuestions(value: unknown): unknown {
  const questions = decodeArrayOfObjects(value);
  return Array.isArray(questions)
    ? questions.map((question) => isRecord(question) ? { ...question, options: decodeJson(question.options) } : question)
    : questions;
}

function decodeArrayOfObjects(value: unknown): unknown {
  const array = decodeJson(value);
  return Array.isArray(array) ? array.map(decodeJson) : array;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Decode a JSON object/array the model returned as a string; anything else is returned unchanged. */
function decodeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!/^[[{]/u.test(text)) return value;
  try { return JSON.parse(text) as unknown; } catch { return value; }
}

const stringArray = (min: number, max: number) => ({ type: "array", minItems: min, maxItems: max, items: { type: "string" } });
const choiceJson = (withEvidence: boolean) => ({
  type: "object", additionalProperties: false,
  required: ["termId", "prompt", "options", "correctIndex", "explanation", ...(withEvidence ? ["evidence"] : [])],
  properties: {
    termId: { type: "string" }, prompt: { type: "string" }, options: stringArray(3, 3),
    correctIndex: { type: "integer", minimum: 0, maximum: 2 }, explanation: { type: "string" },
    ...(withEvidence ? { evidence: { type: "string" } } : {})
  }
});

export const monthlyFinalReceptiveOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["listening", "reading"],
  properties: {
    listening: {
      type: "object", additionalProperties: false, required: ["messages"],
      properties: {
        messages: { type: "array", minItems: 2, maxItems: 2, items: {
          type: "object", additionalProperties: false, required: ["label", "speaker", "script", "gaSentence", "gbSentence", "questions"],
          properties: {
            label: { type: "string", enum: ["A", "B"] }, speaker: { type: "string" }, script: { type: "string" },
            gaSentence: { type: "string" }, gbSentence: { type: "string" },
            questions: { type: "array", minItems: 1, maxItems: 40, items: choiceJson(true) }
          }
        } }
      }
    },
    reading: { type: "object", additionalProperties: false, required: ["questions"], properties: { questions: { type: "array", minItems: 1, maxItems: 40, items: choiceJson(false) } } }
  }
} satisfies Record<string, unknown>;

/** Flat tool schemas (no `listening` / `reading` wrapper object); the Zod schemas above map them back. */
export const monthlyFinalListeningOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["messages"],
  properties: {
    messages: {
      ...monthlyFinalReceptiveOutputJsonSchema.properties.listening.properties.messages,
      description: "Message A and Message B as a JSON array of objects, never a JSON-encoded string."
    }
  }
} satisfies Record<string, unknown>;
export const monthlyFinalReadingOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["questions"],
  properties: {
    questions: {
      ...monthlyFinalReceptiveOutputJsonSchema.properties.reading.properties.questions,
      description: "One reading question per target term, as a JSON array of objects, never a JSON-encoded string."
    }
  }
} satisfies Record<string, unknown>;

const productionJson = (evidenceKeys: string[]) => ({
  type: "object", additionalProperties: false, required: ["task", "facts", "requirements", "sample", "evidence"],
  properties: {
    task: { type: "string" }, facts: { type: "string" }, requirements: stringArray(2, 3), sample: { type: "string" },
    evidence: { type: "object", additionalProperties: false, required: evidenceKeys, properties: Object.fromEntries(evidenceKeys.map((key) => [key, { type: "string" }])) }
  }
});

export const monthlyFinalProductiveOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["title", "grammarComponents", "writing", "speakingA", "speakingB"],
  properties: {
    title: { type: "string" },
    grammarComponents: { type: "array", minItems: 2, maxItems: 2, items: {
      type: "object", additionalProperties: false,
      required: ["code", "mainStepId", "mainLabel", "mainPatterns", "secondaryStepId", "secondaryLabel", "secondaryPatterns"],
      properties: {
        code: { type: "string", enum: ["GA", "GB"] },
        mainStepId: { type: "string" }, mainLabel: { type: "string" }, mainPatterns: stringArray(1, 6),
        secondaryStepId: { type: "string" }, secondaryLabel: { type: "string" }, secondaryPatterns: stringArray(1, 6)
      }
    } },
    writing: productionJson(["gaMain", "gaSecondary", "gbMain", "gbSecondary"]),
    speakingA: {
      type: "object", additionalProperties: false, required: ["text", "positions"],
      properties: {
        text: { type: "string" },
        positions: { type: "array", minItems: 8, maxItems: 8, items: {
          type: "object", additionalProperties: false, required: ["code", "exampleId", "word", "target"],
          properties: { code: { type: "string", enum: ["P1", "P2", "P3", "P4"] }, exampleId: { type: "string" }, word: { type: "string" }, target: { type: "string" } }
        } }
      }
    },
    speakingB: productionJson(["gaMain", "gbMain"])
  }
} satisfies Record<string, unknown>;

/** Semantic checks that let the AI gateway retry before the API's GEN checks run. */
export function validateMonthlyFinalReceptiveOutput(output: MonthlyFinalReceptiveOutput, input: MonthlyFinalGenerationInput): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  const labels = output.listening.messages.map((message) => message.label).sort().join("");
  if (labels !== "AB") issues.push({ path: "listening.messages", message: "Return exactly Message A and Message B." });
  const listeningIds = output.listening.messages.flatMap((message) => message.questions.map((question) => question.termId));
  issues.push(...exactTermSet("listening", listeningIds, input.targets.listening.map((term) => term.id)));
  issues.push(...exactTermSet("reading", output.reading.questions.map((question) => question.termId), input.targets.reading.map((term) => term.id)));
  for (const [index, message] of output.listening.messages.entries()) {
    if (!message.script.includes(message.gaSentence)) issues.push({ path: `listening.messages.${index}.gaSentence`, message: "gaSentence must be copied verbatim from the script." });
    if (!message.script.includes(message.gbSentence)) issues.push({ path: `listening.messages.${index}.gbSentence`, message: "gbSentence must be copied verbatim from the script." });
  }
  return issues;
}

export function validateMonthlyFinalListeningOutput(output: MonthlyFinalListeningOutput, input: MonthlyFinalGenerationInput): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  const labels = output.listening.messages.map((message) => message.label).sort().join("");
  if (labels !== "AB") issues.push({ path: "listening.messages", message: "Return exactly Message A and Message B." });
  issues.push(...exactTermSet("listening", output.listening.messages.flatMap((message) => message.questions.map((question) => question.termId)), input.targets.listening.map((term) => term.id)));
  for (const [index, message] of output.listening.messages.entries()) {
    if (!message.script.includes(message.gaSentence)) issues.push({ path: `listening.messages.${index}.gaSentence`, message: "gaSentence must be copied verbatim from the script." });
    if (!message.script.includes(message.gbSentence)) issues.push({ path: `listening.messages.${index}.gbSentence`, message: "gbSentence must be copied verbatim from the script." });
  }
  return issues;
}

export function validateMonthlyFinalReadingOutput(output: MonthlyFinalReadingOutput, input: MonthlyFinalGenerationInput): AiValidationIssue[] {
  return exactTermSet("reading", output.reading.questions.map((question) => question.termId), input.targets.reading.map((term) => term.id));
}

export function validateMonthlyFinalProductiveOutput(output: MonthlyFinalProductiveOutput, input: MonthlyFinalGenerationInput): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  for (const topic of input.grammar) {
    const chosen = output.grammarComponents.filter((component) => component.code === topic.code);
    if (chosen.length !== 1) { issues.push({ path: "grammarComponents", message: `Return exactly one ${topic.code} entry.` }); continue; }
    const component = chosen[0]!;
    const taught = new Set(topic.taughtSteps.map((step) => step.stepId));
    if (!taught.has(component.mainStepId) || !taught.has(component.secondaryStepId)) issues.push({ path: `grammarComponents.${topic.code}`, message: "Main and secondary must be taught step IDs of this topic." });
    if (component.mainStepId === component.secondaryStepId) issues.push({ path: `grammarComponents.${topic.code}`, message: "Main and secondary must be different steps." });
  }
  for (const target of input.pronunciation) {
    const positions = output.speakingA.positions.filter((position) => position.code === target.code);
    if (positions.length !== 2) issues.push({ path: "speakingA.positions", message: `${target.code} needs exactly two positions.` });
    for (const position of positions) {
      const example = target.taughtExamples.find((item) => item.exampleId === position.exampleId);
      if (!example || example.word.toLocaleLowerCase("en-US") !== position.word.toLocaleLowerCase("en-US")) issues.push({ path: `speakingA.positions.${target.code}`, message: `Use only ${target.code} taught example words with their exampleId.` });
    }
  }
  return issues;
}

function exactTermSet(path: string, actual: string[], expected: string[]): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  const expectedSet = new Set(expected);
  const seen = new Set<string>();
  for (const id of actual) {
    if (!expectedSet.has(id)) issues.push({ path, message: `termId ${id} is not a ${path} target.` });
    if (seen.has(id)) issues.push({ path, message: `termId ${id} is assessed twice.` });
    seen.add(id);
  }
  for (const id of expected) if (!seen.has(id)) issues.push({ path, message: `termId ${id} needs exactly one question.` });
  return issues;
}
