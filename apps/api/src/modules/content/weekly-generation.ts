import type { ContentLessonDraftInput, ContentWeekInput } from "@e4s/contracts";
import {
  weeklyLessonFoundationOutputSchema,
  weeklyLessonGrammarClassificationOutputSchema,
  weeklyLessonDayOutputSchema,
  weeklyLessonSkillsReviewOutputSchema,
  weeklyLessonSkillsOutputSchema,
  weeklyLessonVocabularyOutputSchema,
  type AiRunResult,
  type AiTaskRunner,
  type AiUsage
} from "@e4s/ai";
import { validateLessonDraft } from "@e4s/domain/content";
import { lessonComponentsNeedingRepair, type LessonRepairMode } from "./enrichment.js";

const DAYS = [1, 2, 3, 4, 5] as const;
const FOUNDATION_OUTPUT_TOKEN_LIMIT = 3_500;
const GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT = 1_000;
const VOCABULARY_OUTPUT_TOKEN_LIMIT = 3_500;
const SKILLS_OUTPUT_TOKEN_LIMIT = 2_500;
const SKILLS_REVIEW_OUTPUT_TOKEN_LIMIT = 1_500;
const MAX_COMPONENT_ATTEMPTS = 3;
const MAX_FOUNDATION_ATTEMPTS = 3;
const MAX_SKILLS_REVIEW_ATTEMPTS = 3;
const OBJECTIVE_VERBS_BY_LEVEL = {
  A1: "nói, nhắc lại, chỉ ra, nối, chọn, điền, chào hỏi, giới thiệu, trả lời, dùng",
  A2: "hỏi và trả lời, mô tả, viết, xác nhận, đề nghị, xin lỗi, sắp xếp, hoàn thành, dùng",
  B1: "explain, describe, respond to, give reasons/give reasons for, summarize, ask for clarification, report, write, suggest, compare",
  B2: "justify, negotiate, handle, propose, compare, recommend, paraphrase, de-escalate, present, persuade, adapt",
  C1: "persuade, mediate, critique, synthesize, reframe, decline, lead, tailor"
} as const;
const UNOBSERVABLE_OBJECTIVE_VERB = /\b(?:understand|know|learn|appreciate|realise|realize|grasp|master|study|practi[cs]e|review|hiểu|biết|nắm được|nắm vững|làm quen|học về|tìm hiểu|ôn tập|luyện tập)\b/iu;

const FOUNDATION_CONTRACT = [
  "Generate only the compact foundation fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use lessonFocus as the exact teaching focus and allLessonFocuses only to avoid repetition.",
  "If grammarClassification.status is classified, use that narrow target without broadening its scope.",
  "If grammarClassification.status is no_suitable_content or insufficient_evidence, do not invent a grammar target: set title to null and grammar to null. The grammar section will be hidden from learners.",
  "title must name the concrete sentence frame taught by lessonFocus (for example 'It is + adjective' or 'Could I + V?'); never use a generic placeholder such as 'S + V', 'S + V + O', or repeat the same title across days.",
  "objective must include lesson_goal and assessment_gap. Set assessment_gap to null because this lesson generates an assessment for every objective.",
  "objective.items must contain 2-4 measurable objectives with stable ids. Exactly one is type content. Language-objective counts are A1=1, A2=1-2, B1=2, B2-C1=2-3.",
  "Every objective item must include id, action_verb, target_language (null for content; concrete taught words/frames for language), condition, criterion, assessed_by, success_evidence and assessmentCode.",
  "Every objective text uses the exact learner-facing opener: 'Sau bài học, bạn có thể' for A1-A2 or 'By the end of this lesson, you will be able to' for B1-C1. Keep this opener in the returned text. Use one observable verb and one assessable ability.",
  "Use the level verb bank exactly and keep action_verb in the objective language: A1 nói/nhắc lại/chỉ ra/nối/chọn/điền/chào hỏi/giới thiệu/trả lời/dùng; A2 hỏi và trả lời/mô tả/viết/xác nhận/đề nghị/xin lỗi/sắp xếp/hoàn thành/dùng; B1 explain/describe/respond to/give reasons for/summarize/ask for clarification/report/write/suggest/compare; B2 justify/negotiate/handle/propose/compare and recommend/paraphrase/de-escalate/present/persuade/adapt; C1 persuade/mediate/critique/synthesize/reframe/diplomatically decline/lead/tailor.",
  "For B1-C1 language objectives, never set action_verb to 'use' or 'give'. Choose a workplace action from that level's bank, then mention the target language later with 'using' (for example: 'explain ... using due to').",
  "Count objectives before returning: A1 exactly 2 total (1 content + 1 language); A2 exactly 2-3; B1 exactly 3; B2-C1 exactly 3-4. Never omit a required language objective.",
  "Set explanationLanguage to vi for A1-A2 and en for B1-C1.",
  "When grammar is present, grammar.contentType, targetName and scope must exactly match grammarClassification.contentType, targetName and scope.",
  "grammar.formula must be a short usable grammar pattern or sentence frame, never a descriptive topic label.",
  "grammar.usage must be exactly one short sentence in Vietnamese for A1-A2 or English for B1-C1 explaining when to use only the classified target; do not broaden the scope.",
  "Each grammar example must be one English sentence of at most 10 words. Do not add Vietnamese translations, parentheses, or a second sentence.",
  "Provide exactly three instruction steps, two grammar examples, and three pronunciation words.",
  "For pronunciation, extract the one slash-delimited target sound from pronunciation.focus, then verify word1.ipa, word2.ipa, and word3.ipa each literally contain that target sound. IPA must be the standard pronunciation of its word: never alter or invent an IPA spelling to force a match; replace the word instead.",
  "Keep the content CEFR-appropriate, practical, concise, and directly teachable. Return no prose outside the tool."
].join("\n");

const GRAMMAR_CLASSIFIER_CONTRACT = [
  "Classify the ONE explicitly taught language target before generating any grammar explanation.",
  "Allowed contentType values are grammar_rule, sentence_pattern, usage_rule, word_formation, pronunciation_rule.",
  "Every planned lesson must classify one narrow grammar rule or sentence pattern supported by its lessonFocus, allLessonFocuses, objectives, description, or topic.",
  "A communicative or vocabulary-led lesson still needs a usable sentence pattern; use the lesson focus to choose the narrowest teachable target rather than hiding grammar.",
  "Use no_suitable_content or insufficient_evidence only when every supplied instructional input is empty, which is not valid for a generated lesson.",
  "For every evidence item, sourceRef must be one of topic, description, objectives, keyVocabHint, lessonFocus, or allLessonFocuses, and quote must occur verbatim in that exact input field.",
  "Every rejectedCandidates.reason must be exactly one of: incidental_language, unrelated_to_objective, lower_priority, vocabulary_only, out_of_scope.",
  "Keep scope narrow: do not add negative, question, tense, or exception forms that the evidence does not teach. Return only the strict tool output."
].join("\n");

const VOCABULARY_CONTRACT = [
  "Generate only the vocabulary fields required by the strict tool schema for ONE learner-facing lesson.",
  "Return exactly three useful words matching lessonFocus and, only when non-null, grammarFormula.",
  "A null grammarFormula and grammarExamples mean the grammar classifier abstained. Do not invent a grammar target; generate vocabulary from lessonFocus.",
  "Never return a word listed in excludedVocabulary. The three words must also be distinct from each other and from vocabulary used by the other lessons in this week.",
  "Before answering, compare every generated word case-insensitively with excludedVocabulary and replace every match; a repeated word makes the entire response invalid.",
  "Each word needs partOfSpeech, slash-delimited IPA, stress, exact ttsText, matching <speak> SSML, Vietnamese meaning, a concrete photographic imageQuery, and exactly three natural collocations.",
  "imageQuery must describe one clear real-world workplace photo with the target visible; no icons, logos, diagrams, screenshots, charts, or text-heavy images.",
  "Every word must include at least one real word-family relation, one umbrella category, and one real synonym so the learner controls are never empty.",
  "For B1-B2-C1 this extended lexical data is mandatory for every word, not optional enrichment: three collocations, word family, umbrella category, and a same-sense synonym must all be populated.",
  "For word family, use only established dictionary headwords with a direct morphological relationship. Do not mechanically attach a suffix, invent hyphenated forms, or label a gerund as a noun merely to fill a slot; family2 may be null when only one natural relation exists.",
  "The umbrella word must be a genuine broader semantic category, and each sibling must be another member of that same category rather than a synonym or an arbitrary related word.",
  "Every synonym or antonym must use the same part of speech and same sense as the target, include a concise sense label, and include a contextual example containing that relation word. Derivations are not synonyms.",
  "For synonym1, synonym2 and antonym1, copy the target item's partOfSpeech string exactly into relation.partOfSpeech. If the relation is not truly that part of speech in the shown example, replace the relation word instead of changing the label.",
  "Use null only for additional optional relations or an antonym that would be false or unnatural; never invent a fake relation. Return no prose outside the tool."
].join("\n");

const SKILLS_CONTRACT = [
  "Generate only the skill and exercise fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use vocabularyWords consistently. Use grammarFormula and grammarExamples only when they are non-null; null means the classifier abstained, so do not invent grammar.",
  "For A1-A2, use only vocabulary and grammar supplied in the input, one task per item, and short common sentences.",
  "Listening body must be a natural 12-18 word audio script; reading body must be a coherent 18-30 word passage.",
  "Listening, reading, wordClass, and wordUse each need exactly four short English options of 1-5 words, and answer must exactly copy one option.",
  "Questions must be direct and no more than 10 English words. For A1-A2, writing must be fill or mcq, not an open writing task.",
  "For A1-A2, default writing to mcq. Use fill only when the learner-visible sentence itself makes exactly one taught word possible; if a common synonym or modal also fits, use mcq instead.",
  "For a fill task, make the visible sentence specific enough that only the keyed word fits the taught meaning; do not rely on the hint or answer translation to disambiguate it.",
  "For B1-B2-C1, prefer a tightly scoped write task with a model answer of at least two words over a modal-verb blank that permits several grammatical answers.",
  "All multiple-choice distractors must be grammatical, plausible in the workplace context, and wrong for one clear meaning-based reason; never use broken-English distractors.",
  "No distractor may be a synonym, paraphrase, near-equivalent phrase, or another answer supported by the body. Silently solve every option before returning and replace any second defensible answer.",
  "For wordClass, put the target in an unambiguous canonical position. Do not key a past participle after be (for example 'is delayed') as a verb; choose a clearer sentence or classify it as an adjective.",
  "At B2-C1, speaking must require the level's workplace function and at least two concrete constraints or follow-up details, not one short generic sentence.",
  "Every exercise must include questionTranslation and answerTranslation in clear Vietnamese, plus one short hint that helps without containing or revealing the answer.",
  "Speaking prompt must be one short Vietnamese instruction. Speaking answer must be one easy English model sentence of no more than 10 words.",
  "Keep every item CEFR-appropriate, practical, and unambiguous. Return no prose outside the tool."
].join("\n");

const SKILLS_REVIEW_CONTRACT = [
  "Review one generated lesson skill set for serious learner-facing defects only.",
  "Request revision only when an exercise has multiple defensible answers, a wrong answer key, insufficient context, content outside the taught scope, an answer-revealing hint, a clear CEFR mismatch, or mismatched feedback.",
  "Treat a cut-off passage, sentence fragment, dangling auxiliary or preposition, or an unfinished final sentence as serious insufficient context.",
  "Do not reject stylistic preferences, harmless wording differences, or an answer that is already correct.",
  "Solve every closed exercise independently and return the solved answers required by the strict tool schema.",
  "Use approved with no findings when the exercises are usable. Return only the strict tool output."
].join("\n");

const NON_BLOCKING_REVIEW_NOTE = /(?:non[- ]?blocking|acceptable|already correct|no blocking|harmless|không cần thay đổi|không phải lỗi|đáp án đúng|đáp ứng đúng|bản dịch khớp)/iu;

function activeFoundationProfile(cefr: string): string {
  const profiles: Record<string, string> = {
    A1: "ACTIVE LEVEL A1: Return exactly 2 objectives: 1 content + 1 language. Write them in Vietnamese. action_verb must be exactly one of: nói, nhắc lại, chỉ ra, nối, chọn, điền, chào hỏi, giới thiệu, trả lời, dùng.",
    A2: "ACTIVE LEVEL A2: Return exactly 2 or 3 objectives: 1 content + 1 or 2 language. Write them in Vietnamese. action_verb must be exactly one of: hỏi và trả lời, mô tả, mô tả đơn giản, viết, xác nhận, đề nghị, xin lỗi, sắp xếp, hoàn thành, dùng.",
    B1: "ACTIVE LEVEL B1: Return exactly 3 objectives: 1 content + 2 language. Write them in English. action_verb must be exactly one of: explain, describe, respond to, give reasons for, summarize, ask for clarification, report, write, suggest, compare. Never use 'use' or 'give' alone.",
    B2: "ACTIVE LEVEL B2: Return exactly 3 or 4 objectives: 1 content + 2 or 3 language. Write them in English. action_verb must be exactly one of: justify, negotiate, handle, propose, compare and recommend, paraphrase, de-escalate, present, persuade, adapt. Never shorten 'compare and recommend' to 'compare'.",
    C1: "ACTIVE LEVEL C1: Return exactly 3 or 4 objectives: 1 content + 2 or 3 language. Write them in English. action_verb must be exactly one of: persuade, mediate, critique, synthesize, reframe, diplomatically decline, lead, tailor."
  };
  return profiles[cefr] ?? `ACTIVE LEVEL ${cefr}: Follow only this level's profile.`;
}

function activeSkillsProfile(cefr: string): string {
  if (cefr === "A1" || cefr === "A2") {
    return `ACTIVE LEVEL ${cefr}: Prefer writing.type=mcq with four options. Use fill only if no other common taught word can fit. speaking.prompt is a short Vietnamese learner instruction. Before returning, verify each choice task has exactly one defensible answer and every distractor is grammatical but meaningfully wrong.`;
  }
  return `ACTIVE LEVEL ${cefr}: writing.type=write with a model answer of at least two words. speaking.prompt is a clear English workplace task. Before returning, verify each closed task has exactly one defensible answer and every distractor is grammatical but meaningfully wrong.`;
}

export async function generateWeeklyLessons(
  week: ContentWeekInput,
  cefr: string,
  task: { prompt: string },
  runner: AiTaskRunner,
  options: {
    excludedVocabulary?: readonly string[];
    dayNumbers?: readonly number[];
    qualityReview?: boolean;
    existingLessons?: readonly ContentLessonDraftInput[];
    repairMode?: LessonRepairMode;
  } = {}
) {
  const savedPlan = week.plan?.[cefr as keyof NonNullable<ContentWeekInput["plan"]>];
  const focuses = savedPlan?.length === 5
    ? savedPlan
    : DAYS.map((dayNumber) => `${week.topic} - day ${dayNumber}`);
  const startedAt = Date.now();
  const generationDays = options.dayNumbers
    ? DAYS.filter((dayNumber) => options.dayNumbers!.includes(dayNumber))
    : DAYS;
  const baseInputs = generationDays.map((dayNumber) => ({
    weekNumber: week.weekNumber,
    topic: week.topic,
    description: week.description,
    objectives: week.objectives,
    keyVocabHint: week.keyVocabHint,
    cefr,
    dayNumber,
    lessonFocus: focuses[dayNumber - 1] ?? `${week.topic} - day ${dayNumber}`,
    allLessonFocuses: focuses
  }));
  const existingByDay = new Map((options.existingLessons ?? []).map((lesson) => [lesson.dayNumber, lesson]));
  const componentTargets = generationDays.map((dayNumber) => lessonComponentsNeedingRepair(
    existingByDay.get(dayNumber), options.repairMode ?? "enrich"
  ));

  const grammarClassificationSettled = await Promise.allSettled(baseInputs.map(async (input, index) => {
    if (!componentTargets[index]!.has("foundation")) return undefined;
    let findings: Array<{ path: PropertyKey[]; message: string }> = [];
    let previousOutput = "";
    for (let attempt = 1; attempt <= (options.qualityReview ? MAX_COMPONENT_ATTEMPTS : 1); attempt += 1) {
      const repair = findings.length
        ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}${previousOutput ? `\nPREVIOUS INVALID OUTPUT: ${previousOutput}` : ""}\nReturn a complete corrected classification using only verbatim input evidence and preserve every valid field.`
        : "";
      let result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
      try {
        result = await runner.runTask("weekly_lesson_grammar_classifier", input, {
          systemPrompt: `${GRAMMAR_CLASSIFIER_CONTRACT}${repair}`,
          maxOutputTokens: GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT
        });
      } catch (error) {
        if (!isInvalidAiOutput(error)) throw error;
        findings = invalidAiIssues(error);
        if (attempt === (options.qualityReview ? MAX_COMPONENT_ATTEMPTS : 1)) throwInvalid(findings, `day${input.dayNumber}.grammarClassification`);
        continue;
      }
      previousOutput = boundedJson(result.output);
      const parsed = weeklyLessonGrammarClassificationOutputSchema.safeParse(result.output);
      if (!parsed.success) {
        findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
      } else {
        findings = options.qualityReview ? grammarEvidenceFindings(parsed.data, input) : [];
        if (findings.length === 0) return { result, output: parsed.data };
      }
      if (attempt === (options.qualityReview ? MAX_COMPONENT_ATTEMPTS : 1)) throwInvalid(findings, `day${input.dayNumber}.grammarClassification`);
    }
    throwInvalid(findings, `day${input.dayNumber}.grammarClassification`);
  }));

  const fallbackGrammarClassification = (input: typeof baseInputs[number]) => ({
    status: "classified" as const,
    contentType: "sentence_pattern" as const,
    targetName: input.lessonFocus,
    scope: input.lessonFocus,
    support: "explicit" as const,
    // This is a deterministic fallback to the operator-approved daily focus,
    // not a model-provided low-confidence classification.  The foundation
    // input schema correctly rejects low-confidence primary targets.
    confidence: "medium" as const,
    evidence: [{ sourceRef: "lessonFocus", quote: input.lessonFocus }],
    rejectedCandidates: []
  });
  // A completed lesson must always teach one usable language pattern.  If the
  // classifier exhausts its retries, anchor the foundation pass to the exact
  // operator-approved daily focus instead of saving a learner-facing grammar
  // section as hidden/unavailable.  The foundation model still supplies the
  // actual formula, usage and examples; no grammar content is fabricated here.
  const grammarClassifications = grammarClassificationSettled.map((entry, index) =>
    entry.status === "fulfilled" && entry.value
      ? entry.value.output
      : fallbackGrammarClassification(baseInputs[index]!)
  );

  const foundationSettled = await Promise.allSettled(baseInputs.map(async (input, index) => {
    if (!componentTargets[index]!.has("foundation")) return undefined;
    const resultInput = { ...input, grammarClassification: grammarClassifications[index]! };
    let findings: Array<{ path: PropertyKey[]; message: string }> = [];
    let previousOutput = "";
    let pronunciationRepair = "";
    for (let attempt = 1; attempt <= MAX_FOUNDATION_ATTEMPTS; attempt += 1) {
      const repair = findings.length
        ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}${pronunciationRepair}${previousOutput ? `\nPREVIOUS INVALID OUTPUT: ${previousOutput}` : ""}\nReturn a complete corrected foundation without changing the lesson focus; preserve every valid field.`
        : "";
      let result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
      try {
        result = await runner.runTask("weekly_lesson_foundation", resultInput, {
          systemPrompt: `${task.prompt}\n\n${FOUNDATION_CONTRACT}\n\n${activeFoundationProfile(input.cefr)}${repair}`,
          maxOutputTokens: FOUNDATION_OUTPUT_TOKEN_LIMIT
        });
      } catch (error) {
        if (!isInvalidAiOutput(error)) throw error;
        findings = invalidAiIssues(error);
        if (attempt === MAX_FOUNDATION_ATTEMPTS) throwInvalid(findings, `day${input.dayNumber}.foundation`);
        continue;
      }
      previousOutput = boundedJson(result.output);
      const parsed = weeklyLessonFoundationOutputSchema.safeParse(result.output);
      if (!parsed.success) {
        findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
        pronunciationRepair = pronunciationRepairInstruction(result.output, findings);
      } else {
        const normalized = normalizeFoundationObjectiveActions(parsed.data, input.cefr);
        if (resultInput.grammarClassification.status === "classified" && (!normalized.title || !normalized.grammar)) {
          findings = [
            ...(!normalized.title ? [{ path: ["title"], message: "A classified target requires a concrete lesson title" }] : []),
            ...(!normalized.grammar ? [{ path: ["grammar"], message: "A classified target requires grammar content" }] : [])
          ];
          if (attempt === MAX_FOUNDATION_ATTEMPTS) throwInvalid(findings, `day${input.dayNumber}.foundation`);
          continue;
        }
        const objectiveIssues = validatePromptObjectives(normalized.objective, input.cefr);
        if (resultInput.grammarClassification.status === "classified" && normalized.grammar
          && resultInput.grammarClassification.contentType
          && resultInput.grammarClassification.targetName
          && resultInput.grammarClassification.scope
          && (normalized.grammar.contentType !== resultInput.grammarClassification.contentType
            || normalized.grammar.targetName !== resultInput.grammarClassification.targetName
            || normalized.grammar.scope !== resultInput.grammarClassification.scope)) {
          normalized.grammar = {
            ...normalized.grammar,
            contentType: resultInput.grammarClassification.contentType,
            targetName: resultInput.grammarClassification.targetName,
            scope: resultInput.grammarClassification.scope
          };
        }
        const pronunciationIssues = pronunciationTargetFindings(normalized);
        if (objectiveIssues.length === 0 && pronunciationIssues.length === 0) {
          return { result, output: normalized, pronunciationValid: true };
        }
        if (objectiveIssues.length === 0 && attempt === MAX_FOUNDATION_ATTEMPTS) {
          return { result, output: normalized, pronunciationValid: false };
        }
        findings = [
          ...[...new Set(objectiveIssues)].map((message) => ({ path: ["objective"] as PropertyKey[], message })),
          ...pronunciationIssues
        ];
        pronunciationRepair = pronunciationRepairInstruction(result.output, pronunciationIssues);
      }
      if (attempt === MAX_FOUNDATION_ATTEMPTS) throwInvalid(findings, `day${input.dayNumber}.foundation`);
    }
    throwInvalid(findings, `day${input.dayNumber}.foundation`);
  }));
  const foundationResults = foundationSettled.map((entry) => entry.status === "fulfilled" ? entry.value : undefined);

  // Historical vocabulary is useful prompt context, but it must not be a hard
  // rejection rule. Workplace topics legitimately reuse core words (meeting,
  // report, customer, etc.), and rejecting those words made an otherwise valid
  // five-day set fail repeatedly. Keep hard uniqueness inside this generated
  // batch; use earlier lesson sets only as a best-effort diversity hint.
  const promptHistory = (options.excludedVocabulary ?? []).map(normalizeVocabularyKey).filter(Boolean).slice(0, 80);
  const usedVocabulary = new Set<string>();
  type VocabularyResult = {
    result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
    output: Vocabulary;
  };
  const firstVocabularySettled = await Promise.allSettled(baseInputs.map(async (input, index): Promise<VocabularyResult | undefined> => {
    if (!componentTargets[index]!.has("vocabulary")) return undefined;
    const foundation = foundationResults[index]?.output;
    return runStrictComponent(runner, "weekly_lesson_vocabulary", {
      ...input,
      grammarFormula: foundation?.grammar?.formula ?? null,
      grammarExamples: foundation?.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
      excludedVocabulary: promptHistory
    }, VOCABULARY_CONTRACT, VOCABULARY_OUTPUT_TOKEN_LIMIT, weeklyLessonVocabularyOutputSchema, input.dayNumber, "vocabulary");
  }));

  const candidates = firstVocabularySettled.map((entry) => entry.status === "fulfilled" ? entry.value : undefined);
  const vocabularyResults: Array<VocabularyResult | undefined> = Array(baseInputs.length).fill(undefined);
  const rejectedWords = baseInputs.map(() => new Set<string>());
  for (let attempt = 1; attempt <= MAX_COMPONENT_ATTEMPTS; attempt += 1) {
    const retryIndexes: number[] = [];
    for (const [index, input] of baseInputs.entries()) {
      if (vocabularyResults[index]) continue;
      const candidate = candidates[index];
      if (!candidate) continue;
      const words = vocabularyWords(candidate.output);
      const local = new Set<string>();
      const duplicates = words.filter((word) => {
        const key = normalizeVocabularyKey(word);
        const duplicate = !key || usedVocabulary.has(key) || local.has(key);
        local.add(key);
        return duplicate;
      });
      if (duplicates.length === 0) {
        words.forEach((word) => usedVocabulary.add(normalizeVocabularyKey(word)));
        vocabularyResults[index] = candidate;
      } else {
        duplicates.forEach((word) => rejectedWords[index]!.add(normalizeVocabularyKey(word)));
        retryIndexes.push(index);
      }
    }
    if (retryIndexes.length === 0 || attempt === MAX_COMPONENT_ATTEMPTS) break;
    const acceptedWords = vocabularyResults.flatMap((item) => item ? vocabularyWords(item.output) : []);
    const retried = await Promise.allSettled(retryIndexes.map(async (index): Promise<[number, VocabularyResult]> => {
      const input = baseInputs[index]!;
      const foundation = foundationResults[index]?.output;
      const excludedVocabulary = [...new Set([
        ...promptHistory,
        ...acceptedWords,
        ...rejectedWords[index]!
      ])].slice(-100);
      const generated = await runStrictComponent(runner, "weekly_lesson_vocabulary", {
        ...input,
        grammarFormula: foundation?.grammar?.formula ?? null,
        grammarExamples: foundation?.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
        excludedVocabulary
      }, VOCABULARY_CONTRACT, VOCABULARY_OUTPUT_TOKEN_LIMIT, weeklyLessonVocabularyOutputSchema, input.dayNumber, "vocabulary");
      return [index, generated];
    }));
    retried.forEach((entry) => {
      if (entry.status === "fulfilled") {
        const [index, candidate] = entry.value;
        candidates[index] = candidate;
      }
    });
  }
  // A thematic week may legitimately recycle one core word for spaced practice.
  // We ask once for a more diverse replacement, but a repeated cross-day word
  // must not discard five otherwise valid lessons. Per-day distinctness remains
  // enforced by the strict vocabulary schema.
  const completeVocabularyResults = vocabularyResults.map((item, index) => item ?? candidates[index]);

  const skillsReviewResults: AiRunResult[] = [];
  const skillsSettled = await Promise.allSettled(baseInputs.map(async (input, index) => {
    if (!componentTargets[index]!.has("skills")) return undefined;
    const foundation = foundationResults[index]?.output;
    const vocabulary = completeVocabularyResults[index]?.output;
    const vocabularyContext = vocabulary
      ? vocabularyWords(vocabulary)
      : foundation
        ? [foundation.pronunciation.word1.word, foundation.pronunciation.word2.word, foundation.pronunciation.word3.word]
        : fallbackVocabularyWords(input.keyVocabHint);
    const skillsInput = {
      ...input,
      grammarFormula: foundation?.grammar?.formula ?? null,
      grammarExamples: foundation?.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
      vocabularyWords: vocabularyContext
    };
    if (!options.qualityReview) {
      return runStrictComponent(runner, "weekly_lesson_skills", skillsInput, SKILLS_CONTRACT, SKILLS_OUTPUT_TOKEN_LIMIT, weeklyLessonSkillsOutputSchema, input.dayNumber, "skills");
    }
    let reviewFindings: Array<{ path: PropertyKey[]; message: string }> = [];
    let previousSkills: Skills | undefined;
    for (let attempt = 1; attempt <= MAX_SKILLS_REVIEW_ATTEMPTS; attempt += 1) {
      const repair = reviewFindings.length
        ? `\n\nINDEPENDENT REVIEW REJECTED THE PREVIOUS EXERCISES: ${reviewFindings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")} Preserve every valid item and correct the listed defects in this previous skill set: ${JSON.stringify(previousSkills)}. Return the complete corrected skill set.`
        : "";
      const generated = await runStrictComponent(runner, "weekly_lesson_skills", skillsInput, `${SKILLS_CONTRACT}\n\n${activeSkillsProfile(input.cefr)}${repair}`, SKILLS_OUTPUT_TOKEN_LIMIT, weeklyLessonSkillsOutputSchema, input.dayNumber, "skills");
      const normalizedSkills = normalizeExercisePunctuation(generated.output);
      previousSkills = normalizedSkills;
      const findings = deterministicSkillsFindings(normalizedSkills, input.cefr);
      if (findings.length > 0) {
        reviewFindings = findings;
        // Word-count and other quality findings should trigger repairs, but they
        // must not erase an otherwise schema-valid six-exercise block after the
        // retry budget is exhausted. Keep the last complete candidate as the
        // learner-safe fallback; structural validity is still enforced by the
        // strict schema in runStrictComponent above.
        if (attempt === MAX_SKILLS_REVIEW_ATTEMPTS) return { ...generated, output: normalizedSkills };
        continue;
      }

      const reviewed = await reviewSkillsCandidate(runner, skillsInput, normalizedSkills).catch(() => undefined);
      if (!reviewed) return { ...generated, output: normalizedSkills };
      skillsReviewResults.push(reviewed.result);
      if (reviewed.findings.length === 0) return { ...generated, output: normalizedSkills };
      reviewFindings = reviewed.findings;
      if (attempt === MAX_SKILLS_REVIEW_ATTEMPTS) return { ...generated, output: normalizedSkills };
    }
    throwInvalid(reviewFindings, `day${input.dayNumber}.skillsReview`);
  }));
  const skillsResults = skillsSettled.map((entry) => entry.status === "fulfilled" ? entry.value : undefined);

  const lessonDrafts = generationDays.map((dayNumber, index) => buildLesson(
    dayNumber,
    foundationResults[index]?.output,
    completeVocabularyResults[index]?.output,
    skillsResults[index]?.output,
    grammarClassifications[index]?.status,
    baseInputs[index]!.lessonFocus ?? `${week.topic} - day ${dayNumber}`,
    foundationResults[index]?.pronunciationValid ?? false
  )).filter((lesson) => lesson.parts.length > 0);
  const parsedLessons = lessonDrafts.map((lesson, index) => {
    const sourceIndex = generationDays.findIndex((dayNumber) => dayNumber === lesson.dayNumber);
    const complete = Boolean(foundationResults[sourceIndex]?.pronunciationValid && completeVocabularyResults[sourceIndex] && skillsResults[sourceIndex]);
    if (!complete || grammarClassifications[sourceIndex]?.status !== "classified") return lesson;
      const parsed = weeklyLessonDayOutputSchema.safeParse({ lesson });
      if (!parsed.success) throwInvalid(parsed.error.issues, `day${lesson.dayNumber}`);
      return {
        ...parsed.data.lesson,
        dayNumber: lesson.dayNumber,
        title: foundationResults[sourceIndex]!.output.title!
      };
  });

  const lessons = parsedLessons as ContentLessonDraftInput[];
  const completeSet = lessons.length === generationDays.length && generationDays.every((dayNumber, index) => {
    const lesson = lessons.find((candidate) => candidate.dayNumber === dayNumber);
    return Boolean(lesson && grammarClassifications[index] && foundationResults[index]?.pronunciationValid && completeVocabularyResults[index] && skillsResults[index]);
  });
  const validation = completeSet ? validateLessonDraft(lessons) : { valid: true, issues: [] };
  if (!validation.valid) {
    throw Object.assign(new Error("AI_LESSON_SET_INVALID"), {
      code: "AI_LESSON_SET_INVALID",
      issues: validation.issues
    });
  }

  const failures = [
    ...settledFailures(grammarClassificationSettled, generationDays, "grammarClassification"),
    ...settledFailures(foundationSettled, generationDays, "foundation"),
    ...settledFailures(firstVocabularySettled, generationDays, "vocabulary")
      .filter((failure) => !completeVocabularyResults[generationDays.findIndex((dayNumber) => dayNumber === failure.dayNumber)]),
    ...settledFailures(skillsSettled, generationDays, "skills")
  ];

  const allResults = [
    ...grammarClassificationSettled.flatMap((entry) => entry.status === "fulfilled" && entry.value ? [entry.value.result] : []),
    ...foundationResults.flatMap((item) => item ? [item.result] : []),
    ...completeVocabularyResults.flatMap((item) => item ? [item.result] : []),
    ...skillsResults.flatMap((item) => item ? [item.result] : []),
    ...skillsReviewResults
  ];
  if (lessons.length === 0 || allResults.length === 0) {
    const failureCode = failures.length > 0 && failures.every((failure) => failure.code === "AI_UNAVAILABLE")
      ? "AI_UNAVAILABLE"
      : "AI_LESSON_GENERATION_FAILED";
    throw Object.assign(new Error(failureCode), {
      code: failureCode,
      issues: failures
    });
  }
  const first = allResults[0]!.metadata;
  const output = { lessons, failures };
  const result: AiRunResult<typeof output> = {
    output,
    metadata: {
      traceId: first.traceId,
      taskId: "weekly_lessons",
      provider: first.provider,
      model: first.model,
      attempts: allResults.reduce((total, item) => total + item.metadata.attempts, 0),
      latencyMs: Math.max(0, Date.now() - startedAt),
      inputHash: first.inputHash,
      schemaValid: true,
      usage: sumUsage(allResults.map((item) => item.metadata.usage))
    }
  };

  return { result, output, lessons, failures };
}

function fallbackVocabularyWords(value: string): [string, string, string] {
  const words = value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  const defaults = ["work", "team", "task"];
  while (words.length < 3) words.push(defaults[words.length]!);
  return [words[0]!, words[1]!, words[2]!];
}

function settledFailures(
  settled: readonly PromiseSettledResult<unknown>[],
  dayNumbers: readonly number[],
  component: string
): Array<{ dayNumber: number; component: string; code: string; issues: unknown[] }> {
  return settled.flatMap((entry, index) => entry.status === "rejected" ? [{
    dayNumber: dayNumbers[index]!,
    component,
    code: errorCodeOf(entry.reason),
    issues: errorIssuesOf(entry.reason)
  }] : []);
}

function errorCodeOf(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : error instanceof Error ? error.message : "AI_COMPONENT_FAILED";
}

function errorIssuesOf(error: unknown): unknown[] {
  if (!error || typeof error !== "object") return [];
  if ("issues" in error && Array.isArray((error as { issues?: unknown }).issues)) return (error as { issues: unknown[] }).issues;
  if ("details" in error && (error as { details?: { issues?: unknown } }).details && Array.isArray((error as { details: { issues?: unknown } }).details.issues)) {
    return (error as { details: { issues: unknown[] } }).details.issues;
  }
  return [];
}

function vocabularyWords(vocabulary: Vocabulary): string[] {
  return [vocabulary.word1.word, vocabulary.word2.word, vocabulary.word3.word];
}

function normalizeVocabularyKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function parseComponent<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  value: unknown,
  dayNumber: number,
  component: string
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throwInvalid(parsed.error.issues, `day${dayNumber}.${component}`);
  return parsed.data;
}

function grammarEvidenceFindings(
  classification: ReturnType<typeof weeklyLessonGrammarClassificationOutputSchema.parse>,
  input: {
    topic: string;
    description: string;
    objectives: string;
    keyVocabHint: string;
    lessonFocus: string;
    allLessonFocuses: string[];
  }
): Array<{ path: PropertyKey[]; message: string }> {
  if (classification.status !== "classified") {
    return [{
      path: ["status"],
      message: "every planned lesson requires one narrow grammar rule or sentence pattern; classify the most supportable target instead of hiding grammar"
    }];
  }
  const sources: Record<string, string[]> = {
    topic: [input.topic],
    description: [input.description],
    objectives: [input.objectives],
    keyVocabHint: [input.keyVocabHint],
    lessonFocus: [input.lessonFocus],
    allLessonFocuses: input.allLessonFocuses
  };
  return classification.evidence.flatMap((evidence, index) => {
    const source = sources[evidence.sourceRef];
    if (!source) {
      return [{
        path: ["evidence", index, "sourceRef"],
        message: "evidence sourceRef must identify an exact classifier input field"
      }];
    }
    if (!source.some((value) => value.includes(evidence.quote))) {
      return [{
        path: ["evidence", index, "quote"],
        message: "evidence quote must appear verbatim in the referenced input field"
      }];
    }
    return [];
  });
}

async function runStrictComponent<T>(
  runner: AiTaskRunner,
  taskId: string,
  input: unknown,
  basePrompt: string,
  maxOutputTokens: number,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  dayNumber: number,
  component: string
): Promise<{ result: Awaited<ReturnType<AiTaskRunner["runTask"]>>; output: T }> {
  let findings: Array<{ path: PropertyKey[]; message: string }> = [];
  let previousOutput = "";
  for (let attempt = 1; attempt <= MAX_COMPONENT_ATTEMPTS; attempt += 1) {
    const repair = findings.length
      ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}${previousOutput ? `\nPREVIOUS INVALID OUTPUT: ${previousOutput}` : ""}\nReturn a complete corrected ${component} result and preserve every valid field.`
      : "";
    try {
      const result = await runner.runTask(taskId, input, {
        systemPrompt: `${basePrompt}${repair}`,
        maxOutputTokens
      });
      previousOutput = boundedJson(result.output);
      const parsed = schema.safeParse(result.output);
      if (parsed.success) return { result, output: parsed.data };
      findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
    } catch (error) {
      if (!isInvalidAiOutput(error)) throw error;
      findings = invalidAiIssues(error);
    }
    if (attempt === MAX_COMPONENT_ATTEMPTS) throwInvalid(findings, `day${dayNumber}.${component}`);
  }
  throwInvalid(findings, `day${dayNumber}.${component}`);
}

function boundedJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 12_000);
  } catch {
    return "";
  }
}

function pronunciationRepairInstruction(
  output: unknown,
  findings: Array<{ path: PropertyKey[]; message: string }>
): string {
  const pronunciation = output && typeof output === "object"
    ? (output as { pronunciation?: { focus?: unknown } }).pronunciation
    : undefined;
  const focus = typeof pronunciation?.focus === "string" ? pronunciation.focus.trim() : "";
  const invalidWords = [...new Set(findings
    .filter((issue) => issue.path[0] === "pronunciation" && /^word[123]$/u.test(String(issue.path[1] ?? "")))
    .map((issue) => String(issue.path[1])))];
  if (!focus || invalidWords.length === 0) return "";
  return `\nPRONUNCIATION REPAIR: The fixed target sound is ${focus}. Keep pronunciation.focus unchanged. Replace only ${invalidWords.join(" and ")} with common words whose standard dictionary IPA visibly contains ${focus}. Never alter or invent an IPA spelling to force a match; choose another word instead. Preserve the other pronunciation words and all non-pronunciation fields.`;
}

function isInvalidAiOutput(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID");
}

function invalidAiIssues(error: unknown): Array<{ path: PropertyKey[]; message: string }> {
  const candidate = error && typeof error === "object" && "details" in error
    ? (error as { details?: { issues?: unknown } }).details?.issues
    : undefined;
  if (!Array.isArray(candidate)) return [{ path: [], message: "The structured result was incomplete or invalid" }];
  return candidate.slice(0, 8).map((issue) => {
    const value = issue && typeof issue === "object" ? issue as { path?: unknown; message?: unknown } : {};
    const path = Array.isArray(value.path) ? value.path.map(String) : typeof value.path === "string" ? value.path.split(".") : [];
    const message = typeof value.message === "string"
      ? value.message.replace(/[\r\n\t]+/g, " ").trim().slice(0, 240)
      : "The structured result was incomplete or invalid";
    return { path, message };
  });
}

function throwInvalid(issues: Array<{ path: PropertyKey[]; message: string }>, prefix: string): never {
  throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
    code: "AI_OUTPUT_INVALID",
    issues: issues.slice(0, 8).map((issue) => ({
      path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
      message: issue.message
    }))
  });
}

type Foundation = ReturnType<typeof weeklyLessonFoundationOutputSchema.parse>;
type Vocabulary = ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>;
type Skills = ReturnType<typeof weeklyLessonSkillsOutputSchema.parse>;
type VocabularyItem = Vocabulary["word1"];

function buildLesson(
  dayNumber: number,
  foundation: Foundation | undefined,
  vocabulary: Vocabulary | undefined,
  skills: Skills | undefined,
  grammarStatus: "classified" | "no_suitable_content" | "insufficient_evidence" | undefined,
  lessonFocus: string,
  pronunciationValid: boolean
) {
  const grammar = grammarStatus === "classified" && foundation?.grammar
    ? {
        title: foundation.grammar.title,
        contentType: foundation.grammar.contentType,
        targetName: foundation.grammar.targetName,
        scope: foundation.grammar.scope,
        formula: foundation.grammar.formula,
        usage: foundation.grammar.usage,
        examples: [foundation.grammar.example1, foundation.grammar.example2]
      }
    : { status: "unavailable", hidden: true, reason: grammarStatus };
  return {
    dayNumber,
    title: grammarStatus === "classified" && foundation?.title
      ? foundation.title
      : compactWords(lessonFocus, 8).replace(/[.!?]+$/, ""),
    durationMinutes: foundation?.durationMinutes ?? 10,
    parts: compact([
      foundation ? { code: "objective", title: foundation.objective.title, content: {
        text: foundation.objective.items.map(({ text }) => text).join("\n"),
        explanationLanguage: foundation.objective.explanationLanguage,
        lesson_goal: foundation.objective.lesson_goal,
        assessment_gap: foundation.objective.assessment_gap,
        items: foundation.objective.items
      } } : undefined,
      foundation ? {
        code: "instruction", title: foundation.instruction.title,
        content: { steps: [foundation.instruction.step1, foundation.instruction.step2, foundation.instruction.step3] }
      } : undefined,
      vocabulary ? {
        code: "vocabulary", title: vocabulary.title,
        content: { items: [vocabulary.word1, vocabulary.word2, vocabulary.word3].map(toVocabularyItem) }
      } : undefined,
      foundation && grammarStatus !== undefined ? {
        code: "grammar", title: foundation.grammar?.title ?? "Language focus",
        content: grammar
      } : undefined,
      foundation ? {
        code: "pronunciation", title: foundation.pronunciation.title,
        content: pronunciationValid ? {
          focus: foundation.pronunciation.focus,
          tip: foundation.pronunciation.tip,
          words: [foundation.pronunciation.word1, foundation.pronunciation.word2, foundation.pronunciation.word3]
        } : { status: "unavailable", hidden: true, reason: "invalid_pronunciation_target" }
      } : undefined,
      skills ? { code: "listening", title: skills.listening.title, content: toChoice(skills.listening, "audio") } : undefined,
      skills ? { code: "reading", title: skills.reading.title, content: toChoice(skills.reading, "text") } : undefined,
      skills ? {
        code: "writing", title: skills.writing.title,
        content: {
          type: skills.writing.type,
          prompt: skills.writing.prompt,
          options: compact([skills.writing.option1, skills.writing.option2, skills.writing.option3, skills.writing.option4]),
          answer: skills.writing.answer,
          hint: skills.writing.hint,
          questionTranslation: skills.writing.questionTranslation,
          answerTranslation: skills.writing.answerTranslation
        }
      } : undefined,
      skills ? { code: "word_class", title: skills.wordClass.title, content: toQuestion(skills.wordClass) } : undefined,
      skills ? { code: "word_use", title: skills.wordUse.title, content: toQuestion(skills.wordUse) } : undefined,
      skills ? { code: "speaking", title: skills.speaking.title, content: {
        prompt: skills.speaking.prompt, answer: skills.speaking.answer, hint: skills.speaking.hint,
        questionTranslation: skills.speaking.questionTranslation, answerTranslation: skills.speaking.answerTranslation
      } } : undefined
    ]
    )
  };
}

function compactWords(value: string, limit: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? value.trim() : `${words.slice(0, limit).join(" ").replace(/[,:;.!?]+$/, "")}.`;
}

function validatePromptObjectives(objective: Foundation["objective"], cefr: string): string[] {
  const issues: string[] = [];
  const items = objective.items;
  const languageCount = items.filter((item) => item.type === "language").length;
  const expectedLanguage = cefr === "A1" || cefr === "A2" ? "vi" : "en";
  const allowedLanguageCounts = cefr === "A1" ? [1] : cefr === "A2" ? [1, 2] : cefr === "B1" ? [2] : [2, 3];
  const prefix = expectedLanguage === "vi" ? /^Sau bài học, bạn có thể\s+/ : /^By the end of this lesson, you will be able to\s+/;
  if (objective.explanationLanguage !== expectedLanguage) issues.push("wrong_explanation_language");
  if (objective.assessment_gap !== null) issues.push("assessment_gap_must_be_resolved_before_generation");
  if (items.filter((item) => item.type === "content").length !== 1) issues.push("exactly_one_content_objective");
  if (!allowedLanguageCounts.includes(languageCount)) {
    issues.push(`wrong_language_objective_count:${cefr}. Return exactly 1 content objective and ${cefr === "B1" ? "exactly 2" : `one of ${allowedLanguageCounts.join(" or ")}`} language objectives`);
  }
  for (const item of items) {
    if (!prefix.test(item.text)) issues.push(`objective_wrong_learner_facing_opener:${item.id}`);
    if (!isObservableObjectiveVerb(item.action_verb)) {
      issues.push(`objective_verb_not_observable:${item.id}. Received '${item.action_verb}'. Use an observable ${cefr} action, preferably: ${OBJECTIVE_VERBS_BY_LEVEL[cefr as keyof typeof OBJECTIVE_VERBS_BY_LEVEL]}`);
    }
  }
  return [...new Set(issues)];
}

function normalizeFoundationObjectiveActions(foundation: Foundation, cefr: string): Foundation {
  const verbs = allowedObjectiveVerbs(cefr).sort((left, right) => right.length - left.length);
  return {
    ...foundation,
    objective: {
      ...foundation.objective,
      items: foundation.objective.items.map((item) => {
        if (isObservableObjectiveVerb(item.action_verb) && objectiveContainsAction(item.text, item.action_verb)) return item;
        const verbFromText = verbs.find((verb) => objectiveContainsAction(item.text, verb));
        return verbFromText ? { ...item, action_verb: verbFromText } : item;
      })
    }
  };
}

function objectiveContainsAction(text: string, actionVerb: string): boolean {
  const normalizedText = text.normalize("NFKC").toLocaleLowerCase("en-US");
  const firstWord = actionVerb.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/u)?.[0];
  return Boolean(firstWord && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(firstWord)}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizedText));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isObservableObjectiveVerb(value: string): boolean {
  return value.trim().length > 0 && !UNOBSERVABLE_OBJECTIVE_VERB.test(value);
}

function allowedObjectiveVerbs(cefr: string): string[] {
  const verbs: Record<string, string[]> = {
    A1: ["nói", "nhắc lại", "chỉ ra", "nối", "chọn", "điền", "chào hỏi", "giới thiệu", "trả lời", "dùng"],
    A2: ["hỏi và trả lời", "mô tả", "mô tả đơn giản", "viết", "xác nhận", "đề nghị", "xin lỗi", "sắp xếp", "hoàn thành", "dùng"],
    B1: ["explain", "describe", "respond", "respond to", "give reasons", "give reasons for", "summarize", "summarise", "ask for clarification", "report", "write", "suggest", "compare"],
    B2: ["justify", "negotiate", "handle", "propose", "compare and recommend", "paraphrase", "de-escalate", "present", "persuade", "adapt"],
    C1: ["persuade", "mediate", "critique", "synthesize", "synthesise", "reframe", "diplomatically decline", "lead", "tailor"]
  };
  return verbs[cefr] ?? [];
}

async function reviewSkillsCandidate(
  runner: AiTaskRunner,
  skillsInput: Record<string, unknown>,
  skills: Skills
): Promise<{ result: AiRunResult; findings: Array<{ path: PropertyKey[]; message: string }> }> {
  const result = await runner.runTask(
    "weekly_lesson_skills_reviewer",
    { ...skillsInput, skills },
    { systemPrompt: SKILLS_REVIEW_CONTRACT, maxOutputTokens: SKILLS_REVIEW_OUTPUT_TOKEN_LIMIT }
  );
  const parsed = weeklyLessonSkillsReviewOutputSchema.safeParse(result.output);
  if (!parsed.success) throwInvalid(parsed.error.issues, "skillsReviewer");
  const findings = parsed.data.status === "needs_revision"
    ? parsed.data.findings
      .filter((finding) => !NON_BLOCKING_REVIEW_NOTE.test(finding.message))
      .map((finding) => ({ path: [finding.exerciseCode], message: `${finding.reasonCode}: ${finding.message}` }))
    : [];
  return { result, findings };
}

function deterministicSkillsFindings(skills: Skills, cefr: string): Array<{ path: PropertyKey[]; message: string }> {
  const findings: Array<{ path: PropertyKey[]; message: string }> = [];
  if ((cefr === "A1" || cefr === "A2") && skills.writing.type !== "mcq") {
    findings.push({ path: ["writing", "type"], message: `${cefr} writing must be mcq so the learner-visible item cannot have multiple valid fill answers.` });
  }
  const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
  const listeningRange = cefr === "A1" || cefr === "A2" ? { min: 12, max: 18 } : { min: 12, max: 30 };
  const readingRange = cefr === "A1" || cefr === "A2" ? { min: 18, max: 30 } : { min: 18, max: 60 };
  if (wordCount(skills.listening.body) < listeningRange.min || wordCount(skills.listening.body) > listeningRange.max) findings.push({ path: ["listening", "body"], message: `Listening body must contain ${listeningRange.min}-${listeningRange.max} words for ${cefr}.` });
  if (wordCount(skills.reading.body) < readingRange.min || wordCount(skills.reading.body) > readingRange.max) findings.push({ path: ["reading", "body"], message: `Reading body must contain ${readingRange.min}-${readingRange.max} words for ${cefr}.` });
  for (const code of ["listening", "reading", "wordClass", "wordUse"] as const) {
    const prompt = skills[code].prompt.trim();
    if ((code === "listening" || code === "reading") && wordCount(prompt) > 14) findings.push({ path: [code, "prompt"], message: "Comprehension question must contain at most 14 words." });
    if ((code === "listening" || code === "reading") && !prompt.endsWith("?")) findings.push({ path: [code, "prompt"], message: "Comprehension question must end with a question mark." });
  }
  const speakingAnswerMax = cefr === "A1" || cefr === "A2" ? 10 : 16;
  if (wordCount(skills.speaking.answer) > speakingAnswerMax) findings.push({ path: ["speaking", "answer"], message: `Speaking model answer must contain at most ${speakingAnswerMax} words for ${cefr}.` });
  return findings;
}

const IPA_VOWEL = /[aeiouyæɑɒɔəɜɛɪʊʌɐɵœøɞɘɤɨʉɯ]/u;

function ipaContainsTargetSound(ipa: string, targetSound: string): boolean {
  if (!IPA_VOWEL.test(targetSound[0] ?? "")) return ipa.includes(targetSound);
  let index = ipa.indexOf(targetSound);
  while (index >= 0) {
    const before = ipa[index - 1] ?? "";
    const after = ipa[index + targetSound.length] ?? "";
    if (!IPA_VOWEL.test(before) && !IPA_VOWEL.test(after)) return true;
    index = ipa.indexOf(targetSound, index + 1);
  }
  return false;
}

function pronunciationTargetFindings(foundation: Foundation): Array<{ path: PropertyKey[]; message: string }> {
  const targetSound = foundation.pronunciation.focus.match(/\/([^/]+)\//)?.[1]?.trim();
  if (!targetSound || /\s/.test(targetSound)) return [];
  return (["word1", "word2", "word3"] as const).flatMap((key) => {
    const ipa = foundation.pronunciation[key].ipa.replaceAll("/", "");
    return ipaContainsTargetSound(ipa, targetSound)
      ? []
      : [{ path: ["pronunciation", key, "ipa"], message: `Pronunciation IPA must contain the target sound /${targetSound}/` }];
  });
}

function normalizeExercisePunctuation(skills: Skills): Skills {
  const normalizeStatement = <T extends { prompt: string }>(exercise: T): T => {
    const prompt = exercise.prompt.trim();
    const interrogative = /^(?:who|what|where|when|why|how|which|is|are|am|do|does|did|can|could|would|will|should|has|have|had)\b/iu.test(prompt);
    if (interrogative && !prompt.endsWith("?")) return { ...exercise, prompt: `${prompt.replace(/[.!]+$/u, "").trimEnd()}?` };
    if (!interrogative && prompt.endsWith("?")) return { ...exercise, prompt: `${prompt.slice(0, -1).trimEnd()}.` };
    return exercise;
  };
  return {
    ...skills,
    listening: normalizeStatement(skills.listening),
    reading: normalizeStatement(skills.reading),
    wordClass: normalizeStatement(skills.wordClass),
    wordUse: normalizeStatement(skills.wordUse),
    speaking: skills.speaking
  };
}

function toVocabularyItem(item: VocabularyItem) {
  return {
    word: item.word,
    type: item.partOfSpeech,
    pronunciation: item.pronunciation,
    stress: item.stress,
    ttsText: item.ttsText,
    ssml: item.ssml,
    meaning: item.meaning,
    imageQuery: item.imageQuery,
    collocations: [item.collocation1, item.collocation2, item.collocation3],
    family: compact([item.family1, item.family2]),
    umbrella: {
      word: item.umbrellaWord,
      meaning: item.umbrellaMeaning,
      siblings: compact([item.sibling1, item.sibling2, item.sibling3])
    },
    synonyms: compact([item.synonym1, item.synonym2]),
    antonyms: compact([item.antonym1])
  };
}

function toChoice(value: Skills["listening"] | Skills["reading"], bodyKey: "audio" | "text") {
  return {
    [bodyKey]: value.body,
    prompt: value.prompt,
    options: [value.option1, value.option2, value.option3, value.option4],
    answer: value.answer,
    hint: value.hint,
    questionTranslation: value.questionTranslation,
    answerTranslation: value.answerTranslation
  };
}

function toQuestion(value: Skills["wordClass"] | Skills["wordUse"]) {
  return {
    prompt: value.prompt,
    options: [value.option1, value.option2, value.option3, value.option4],
    answer: value.answer,
    hint: value.hint,
    questionTranslation: value.questionTranslation,
    answerTranslation: value.answerTranslation
  };
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined);
}

function sumUsage(usages: AiUsage[]): AiUsage {
  const sum = (key: keyof AiUsage) => usages.reduce((total, usage) => total + (usage[key] ?? 0), 0);
  const has = (key: keyof AiUsage) => usages.some((usage) => usage[key] !== undefined);
  return {
    ...(has("inputTokens") ? { inputTokens: sum("inputTokens") } : {}),
    ...(has("outputTokens") ? { outputTokens: sum("outputTokens") } : {}),
    ...(has("totalTokens") ? { totalTokens: sum("totalTokens") } : {})
  };
}
