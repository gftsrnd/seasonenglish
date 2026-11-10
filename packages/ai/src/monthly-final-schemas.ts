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
export const monthlyFinalListeningMessageInputSchema=monthlyFinalGenerationInputSchema.extend({messageLabel:z.enum(["A","B"]),scriptPlan:z.object({blocks:z.array(z.object({index:z.number().int(),minWords:z.number().int(),maxWords:z.number().int(),termIds:z.array(z.string()),grammarRole:z.enum(["GA","GB"]).optional()})).min(1).max(12)})});
export const monthlyFinalListeningMessageOutputSchema=z.preprocess((value)=>{
  let message=decodeJson(value);
  if(isRecord(message) && "message" in message)message=decodeJson(message.message);
  if(!isRecord(message))return message;
  const blocks=decodeJson(message.scriptBlocks);
  return {...message,questions:decodeQuestions(message.questions),...(Array.isArray(blocks)&&blocks.every(block=>typeof block==="string") ? {scriptBlocks:blocks,script:blocks.join(" "),gaSentence:blocks[0],gbSentence:blocks.at(-1)} : {})};
},monthlyFinalReceptiveOutputSchema.shape.listening.shape.messages.element.extend({scriptBlocks:z.array(z.string()).optional()}));
export type MonthlyFinalListeningMessageOutput=z.infer<typeof monthlyFinalListeningMessageOutputSchema>;
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
export const monthlyFinalWritingExerciseSchema = monthlyFinalProductiveBaseSchema.shape.writing;
export const monthlyFinalWritingNotesSchema = monthlyFinalWritingExerciseSchema.pick({task:true,facts:true,requirements:true});
export const monthlyFinalWritingSampleRepairSchema=monthlyFinalWritingExerciseSchema.pick({sample:true,evidence:true});
export const monthlyFinalSpeakingSampleRepairSchema=monthlyFinalProductiveBaseSchema.shape.speakingB.pick({sample:true,evidence:true});
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
export const monthlyFinalListeningMessageOutputJsonSchema={
  type:"object",additionalProperties:false,required:["label","speaker","scriptBlocks","questions"],properties:{
    label:{type:"string",enum:["A","B"]},speaker:{type:"string"},scriptBlocks:{type:"array",minItems:1,maxItems:12,items:{type:"string"},description:"The short script blocks in scriptPlan order. Each has its own word budget and required words."},
    questions:monthlyFinalReceptiveOutputJsonSchema.properties.listening.properties.messages.items.properties.questions
  }
};
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

export const monthlyFinalWritingNotesJsonSchema = {
  type: "object", additionalProperties: false, required: ["task", "facts", "requirements"],
  properties: { task: { type: "string" }, facts: { type: "string" }, requirements: stringArray(2, 3) }
};

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
  return [...validateMonthlyFinalListeningOutput(output,input),...validateMonthlyFinalReadingOutput(output,input)];
}

export function validateMonthlyFinalListeningOutput(output: MonthlyFinalListeningOutput, input: MonthlyFinalGenerationInput,expectedLabels="AB"): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  const labels = output.listening.messages.map((message) => message.label).sort().join("");
  if (labels !== expectedLabels) issues.push({ path: "listening.messages", message: `Return exactly the assigned message label(s): ${expectedLabels}.` });
  const questions = output.listening.messages.flatMap(message => message.questions);
  issues.push(...exactTermSet("listening", questions.map(question => question.termId), input.targets.listening.map(term => term.id)));
  issues.push(...choiceLengthIssues("listening.messages", questions));
  for (const [index, message] of output.listening.messages.entries()) {
    if (!message.script.includes(message.gaSentence)) issues.push({ path: `listening.messages.${index}.gaSentence`, message: "gaSentence must be copied verbatim from the script." });
    if (!message.script.includes(message.gbSentence)) issues.push({ path: `listening.messages.${index}.gbSentence`, message: "gbSentence must be copied verbatim from the script." });
    const path=`listening.messages.${index}`;
    const bounds=profileBounds(input,"listeningScriptWords");
    const count=monthlyFinalWordCount(message.script);
    if(bounds && (count < Math.floor(bounds.min*0.85) || count > Math.ceil(bounds.max*1.15))) issues.push({path:`${path}.script`,message:`Write ${bounds.min}–${bounds.max} words for ${input.cefr}; this script has ${count}.`});
    for(const [questionIndex,question] of message.questions.entries()) {
      const target=input.targets.listening.find(term=>term.id===question.termId);
      if(target && !monthlyFinalContainsTerm(message.script,target.word)) issues.push({path:`${path}.questions.${questionIndex}.termId`,message:`The assessed word "${target.word}" must be spoken in this message's script, not only in a question or distractor. Rewrite the script naturally while preserving its other target words.`});
      if(!includesEvidence(message.script,question.evidence)) issues.push({path:`${path}.questions.${questionIndex}.evidence`,message:"Copy a supporting excerpt from this message's actual script; do not invent evidence."});
      issues.push(...choiceIssues(`${path}.questions.${questionIndex}`,question));
    }
  }
  return issues;
}

function choiceLengthIssues(path: string, questions: ReadonlyArray<{termId: string; options: string[]; correctIndex: number}>): AiValidationIssue[] {
  const longest = questions.filter(question => {
    const correct = question.options[question.correctIndex]?.trim().length ?? 0;
    return question.options.every((option, index) => index === question.correctIndex || option.trim().length < correct);
  });
  if (questions.length < 4 || longest.length <= questions.length / 2) return [];
  return [{
    path,
    message: `The correct option is uniquely longest for ${longest.length}/${questions.length} questions. Rewrite these options with comparable lengths: ${longest.map(question => question.termId).join(", ")}.`
  }];
}

export function validateMonthlyFinalReadingOutput(output: MonthlyFinalReadingOutput, input: MonthlyFinalGenerationInput): AiValidationIssue[] {
  const issues=exactTermSet("reading", output.reading.questions.map((question) => question.termId), input.targets.reading.map((term) => term.id));
  const bounds = profileBounds(input, "readingItem");
  const grammarExamples = input.grammar.flatMap(topic => topic.taughtSteps.flatMap(step => step.examples));
  issues.push(...choiceLengthIssues("reading.questions", output.reading.questions));
  for(const [index,question] of output.reading.questions.entries()) {
    const wordCount = monthlyFinalWordCount(question.prompt);
    if (bounds && wordCount > Math.ceil(bounds.max * 1.2)) {
      issues.push({
        path: `reading.questions.${index}.prompt`,
        message: `The prompt for ${question.termId} has ${wordCount} words. Use a natural context of at most ${bounds.max} words.`
      });
    }
    const target=input.targets.reading.find(term=>term.id===question.termId);
    if(target && !monthlyFinalContainsTerm(`${question.prompt}\n${question.options[question.correctIndex] ?? ""}`,target.word)) issues.push({path:`reading.questions.${index}.termId`,message:`Assess "${target.word}" in the reading prompt or correct answer; a distractor alone does not assess it.`});
    issues.push(...choiceIssues(`reading.questions.${index}`,question));
    if (grammarExamples.some(example => normalizeEvidence(example).length >= 6 &&
      [question.prompt, ...question.options].some(text => includesEvidence(text, example)))) {
      issues.push({path: `reading.questions.${index}`, message: "Write a fresh context for this term. Do not reuse a taught grammar example in the prompt or options."});
    }
    for(let a=0;a<question.options.length;a++)for(let b=a+1;b<question.options.length;b++){
      const left=question.options[a]!.trim(),right=question.options[b]!.trim();
      if(!/\s/u.test(left)&&!/\s/u.test(right)&&(monthlyFinalContainsTerm(left,right)||monthlyFinalContainsTerm(right,left)))issues.push({path:`reading.questions.${index}.options`,message:"Use different lexical meanings, not plural/tense/inflection variants of the same word. All three options must fit the grammatical slot; meaning alone selects the answer."});
    }
  }
  return issues;
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
      if(!exactWordPresent(output.speakingA.text,position.word)) issues.push({path:`speakingA.positions.${target.code}`,message:`The read-aloud passage must actually contain the assigned word "${position.word}". Keep all eight positions present in the passage.`});
    }
    if(new Set(positions.map(position=>position.word.toLocaleLowerCase("en-US"))).size!==positions.length) issues.push({path:`speakingA.positions.${target.code}`,message:"Use two different taught example words for this pronunciation target."});
  }
  const maxWords=profileBounds(input,"speakingA")?.max;
  if(maxWords && monthlyFinalWordCount(output.speakingA.text)>maxWords) issues.push({path:"speakingA.text",message:`Keep the complete read-aloud passage within ${maxWords} words for ${input.cefr}, including all eight assigned pronunciation words.`});
  if(monthlyFinalIsWordList(output.speakingA.text,output.speakingA.positions.map(position=>position.word)))issues.push({path:"speakingA.text",message:"Use natural sentences, not the assessed words copied as a list in any order."});
  if(input.cefr==="A1"&&!monthlyFinalWritingOpening(output.writing.task))issues.push({path:"writing.task",message:'A1 requires an explicitly marked quoted opening-sentence hint in the learner task, e.g. Bắt đầu bằng câu gợi ý: "...". It must be a complete short English opening sentence, not the entire answer.'});
  for(const [key,section,targets] of [["writing",output.writing,input.targets.writing],["speakingB",output.speakingB,input.targets.speaking]] as const) {
    for(const [evidenceKey,quote] of Object.entries(section.evidence)) if(!includesEvidence(section.sample,quote)) issues.push({path:`${key}.evidence.${evidenceKey}`,message:"Return only an exact sentence or excerpt from the actual sample answer. Do not add commentary, labels, alternative sentences or instructions to insert it later."});
    const missing=targets.filter(term=>!monthlyFinalContainsTerm(section.sample,term.word)).map(term=>term.word);
    if(missing.length) issues.push({path:`${key}.sample`,message:`The sample answer must use all assigned words naturally; missing: ${missing.join(", ")}.`});
    const copiedFact = section.sample.split(/(?<=[.!?])\s+/u).some(sentence =>
      normalizeEvidence(sentence).replace(/[.!?]+$/u, "").length >= 25 && includesEvidence(section.facts, sentence));
    if (copiedFact) issues.push({path: `${key}.sample`, message: "Paraphrase the learner-visible facts in the private model answer. Do not copy a whole sentence from the facts."});
    if(key==="writing"){
      const opening=input.cefr==="A1" ? monthlyFinalWritingOpening(section.task) : "";
      if (opening && !section.sample.trimStart().startsWith(opening)) {
        issues.push({path:"writing.sample",message:"Start the sample with the exact quoted opening sentence from the learner task."});
      }
      const bounds=profileBounds(input,"writing"),count=monthlyFinalWordCount(section.sample);
      if(bounds&&(count<bounds.min||count>bounds.max))issues.push({path:"writing.sample",message:`The complete model answer has ${count} words; use ${bounds.min}–${bounds.max} words including the opening, all assigned words and grammar.`});
    }
  }
  return issues;
}

function choiceIssues(path:string,question:{options:string[];correctIndex:number}):AiValidationIssue[] {
  return new Set(question.options.map(option=>normalizeEvidence(option))).size===question.options.length ? [] : [{path:`${path}.options`,message:"Use three distinct, meaningful answer options."}];
}

function profileBounds(input:MonthlyFinalGenerationInput,key:string):{min:number;max:number}|undefined {
  const value=input.levelProfile[key];
  if(!isRecord(value) || typeof value.maxWords!=="number") {
    if(isRecord(value) && typeof value.min==="number" && typeof value.max==="number") return {min:value.min,max:value.max};
    return undefined;
  }
  return {min:typeof value.minWords==="number" ? value.minWords : 0,max:value.maxWords};
}
export function monthlyFinalWordCount(text:string):number {return (text.match(/\p{L}+(?:[-'’]\p{L}+)*|\d+(?:[.,:]\d+)*/gu) ?? []).length;}
export function monthlyFinalWritingOpening(task:string):string {
  return task.match(/(?:bắt đầu[^:\n"“'‘]{0,100}bằng câu(?: gợi ý)?|câu mở đầu gợi ý|(?:start|begin)[^:\n"“'‘]{0,60}with(?: the suggested (?:opening|sentence))?)\s*:?\s*["“'‘]([^\n]{1,400}?[.!?])\s*["”'’]/iu)?.[1]?.trim()??"";
}
export function monthlyFinalIsWordList(text:string,words:string[]):boolean {
  const tokens=(value:string)=>(value.toLocaleLowerCase("en-US").match(/\p{L}+(?:[-'’]\p{L}+)*/gu)??[]).sort().join(" ");
  return tokens(text)===tokens(words.join(" "));
}
function normalizeEvidence(text:string):string {return text.toLocaleLowerCase("en-US").replace(/[“”"’']/gu,"").replace(/\s+/gu," ").trim();}
function includesEvidence(sample:string,quote:string):boolean {const target=normalizeEvidence(quote).replace(/[.…]+$/u,"");return Boolean(target) && normalizeEvidence(sample).includes(target);}
export {includesEvidence as monthlyFinalIncludesEvidence};
function exactWordPresent(text:string,word:string):boolean {return new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")}([^\\p{L}]|$)`,"iu").test(text);}
/** Same regular-inflection policy as the final exam's publication coverage check. */
export function monthlyFinalContainsTerm(text:string,word:string):boolean {
  const needle=word.trim().toLocaleLowerCase("en-US"),haystack=text.toLocaleLowerCase("en-US");if(!needle)return false;
  if(/\s/u.test(needle))return haystack.includes(needle);
  const tokens=new Set(haystack.match(/\p{L}+(?:[-'’]\p{L}+)*/gu)??[]),stem=needle.replace(/e$/u,""),last=needle.at(-1)??"";
  return [needle,`${needle}s`,`${needle}es`,`${needle}d`,`${needle}ed`,`${needle}ing`,`${stem}ing`,`${stem}ed`,`${needle}${last}ed`,`${needle}${last}ing`,needle.replace(/y$/u,"ies"),needle.replace(/y$/u,"ied"),`${needle}'s`].some(form=>tokens.has(form));
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
