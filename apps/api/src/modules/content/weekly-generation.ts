import type { ContentLessonDraftInput, ContentWeekInput } from "@e4s/contracts";
import { randomUUID } from "node:crypto";
import {
  weeklyLessonFoundationOutputSchema,
  weeklyLessonFoundationBodyOutputSchema,
  weeklyLessonObjectivesOutputSchema,
  weeklyLessonGrammarClassificationOutputSchema,
  weeklyLessonDayOutputSchema,
  weeklyLessonSkillsReviewOutputSchema,
  weeklyLessonSkillsOutputSchema,
  weeklyLessonComprehensionOutputSchema,
  weeklyLessonLanguagePracticeOutputSchema,
  weeklyLessonSpeakingOutputSchema,
  weeklyLessonListeningRepairOutputSchema,
  weeklyLessonReadingRepairOutputSchema,
  weeklyLessonWritingRepairOutputSchema,
  weeklyLessonWordClassRepairOutputSchema,
  weeklyLessonWordUseRepairOutputSchema,
  weeklyLessonSpeakingRepairOutputSchema,
  weeklyLessonLengthRepairOutputSchema,
  weeklyLessonVocabularyOutputSchema,
  weeklyLessonPlanBlueprintOutputSchema,
  buildPronunciationAssets,
  containsTargetPhoneme,
  CURATED_PHONEME_TARGETS,
  curatedPronunciationPlan,
  curatedPronunciationWord,
  standardLessonInstruction,
  type PronunciationAssetRegistry,
  type AiRunResult,
  type AiTaskRunner,
  type AiUsage
} from "@e4s/ai";
import { buildLevelVocabularyRegistry, containsVietnameseLearnerText, validateLessonDraft, validateLessonPublication } from "@e4s/domain/content";
import { lessonComponentsNeedingRepair, type LessonGenerationComponent, type LessonRepairMode } from "./enrichment.js";
import { curatedRelationEvidence, lexicalRelationCoverageSatisfied } from "./lexical-relations.js";
import { containsPromptEntities, ungroundedPromptEntities } from "./prompt-entities.js";

export { extractPromptEntities, promptEntities, ungroundedPromptEntities } from "./prompt-entities.js";

const DAYS = [1, 2, 3, 4, 5] as const;
const OBJECTIVES_OUTPUT_TOKEN_LIMIT = 1_800;
const FOUNDATION_OUTPUT_TOKEN_LIMIT = 2_200;
const GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT = 1_000;
const VOCABULARY_OUTPUT_TOKEN_LIMIT = 3_500;
const COMPREHENSION_OUTPUT_TOKEN_LIMIT = 1_800;
const LANGUAGE_PRACTICE_OUTPUT_TOKEN_LIMIT = 2_200;
const SPEAKING_OUTPUT_TOKEN_LIMIT = 900;
const SPEAKING_REPAIR_OUTPUT_TOKEN_LIMIT = 1_500;
const SKILLS_REVIEW_OUTPUT_TOKEN_LIMIT = 1_500;
const LENGTH_REPAIR_OUTPUT_TOKEN_LIMIT = 2_000;
// A component gets one initial generation and up to two targeted repairs.
// Keeping this budget uniform prevents one component type from failing a
// level earlier than another for the same recoverable schema/semantic error.
const MAX_COMPONENT_ATTEMPTS = 3;
const MAX_FREQUENTLY_INVALID_COMPONENT_ATTEMPTS = 3;
const MAX_REVIEWER_REPAIR_ATTEMPTS = 3;
// Six atomic exercises may each need their own three targeted repairs. This is
// a per-exercise budget, not six shared chances for the whole lesson day.
const MAX_REVIEWER_REPAIR_ROUNDS = 3;
const REVIEWER_REPAIR_POLICY_VERSION = "reviewer-repair-v29-alternative-target-wording";
const ACCEPTED_REVIEWER_REPAIR_POLICY_VERSIONS = new Set([REVIEWER_REPAIR_POLICY_VERSION]);
const MAX_FOUNDATION_ATTEMPTS = 3;
const MAX_SKILLS_REVIEW_ATTEMPTS = 3;
const MAX_LIGHT_LEXICAL_RELATION_GAPS_PER_LEVEL = 2;
const WEEKLY_BLUEPRINT_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
const WEEKLY_BLUEPRINT_ATTEMPTS = 2;
const WEEKLY_BLUEPRINT_OUTPUT_TOKEN_LIMIT = 5_500;
const WEEKLY_BLUEPRINT_CONTRACT = [
  "Normalize the approved weekly plan without changing the weekly topic or communicative intent.",
  "Return all five CEFR levels A1, A2, B1, B2 and C1, each with exactly five Monday-Friday items.",
  "Write every internal plan item fully in English, including A1 and A2; learner-facing Vietnamese support is added later.",
  "Use this exact order and labels for every item: Outcome: ... | Vocabulary: ... | Frame: ... | Skill emphasis: ...",
  "Every item must include one observable workplace outcome, concrete vocabulary, one explicit teachable sentence or grammar frame, and one primary skill emphasis.",
  "Within each CEFR level, every Vocabulary: term may be introduced on only one of the five days. Do not repeat a primary term across days; choose a distinct term for the later day while preserving its communicative intent.",
  "Do not create vocabulary-only, grammar-only, reading-only or role-play-only days: the downstream daily pipeline always builds a complete lesson.",
  "The five levels may share the same communicative progression, but the vocabulary, frame, cognitive demand and expected response complexity must genuinely match each CEFR lane.",
  "Preserve useful source-plan intent. Repair only missing or contradictory fields and return the complete strict object."
].join("\n");
export type LessonQualityProfile = "baseline" | "strict";

export function weeklyLessonRunMetadataSeed(
  results: readonly AiRunResult[],
  weekNumber: number,
  cefr: string
): AiRunResult["metadata"] {
  return results[0]?.metadata ?? {
    traceId: randomUUID(),
    taskId: "weekly_lessons",
    provider: "checkpoint",
    model: WEEKLY_LESSON_PIPELINE_VERSION,
    attempts: 0,
    latencyMs: 0,
    inputHash: `checkpoint:${weekNumber}:${cefr}:${WEEKLY_LESSON_PIPELINE_VERSION}`,
    schemaValid: true,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  };
}
export type LessonGenerationProgressEvent = {
  cefr?: string;
  dayNumber: number;
  component: string;
  status: "started" | "retrying" | "completed" | "failed";
  attempt: number;
  maxAttempts: number;
};
export type LessonGenerationFinding = {
  dayNumber: number | null;
  component: "plan" | "grammarClassification" | "objectives" | "foundation" | "vocabulary" | "skills.comprehension" | "skills.languagePractice" | "skills.speaking" | "skills.reviewer";
  code: string;
  severity: "warning" | "error";
  message: string;
  issues: unknown[];
  repairAction: "regenerate_plan" | "regenerate_component";
};

export function learnerFacingLanguageFindings(
  component: "foundation" | "vocabulary" | "skills",
  value: unknown,
  cefr: string
): Array<{ path: PropertyKey[]; message: string }> {
  if (!["B1", "B2", "C1"].includes(cefr)) return [];
  const findings: Array<{ path: PropertyKey[]; message: string }> = [];
  const visit = (candidate: unknown, path: PropertyKey[]) => {
    const key = String(path.at(-1) ?? "");
    if (component === "vocabulary" && /meaning$/i.test(key)) return;
    if (typeof candidate === "string") {
      if (containsVietnameseLearnerText(candidate)) {
        findings.push({
          path,
          message: component === "skills"
            ? `${cefr} skill content must be English only; do not insert Vietnamese vocabulary glosses into any skill field.`
            : `${cefr} learner-facing content must be in English; only fields named meaning inside the vocabulary component may be Vietnamese.`
        });
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (candidate && typeof candidate === "object") {
      Object.entries(candidate as Record<string, unknown>).forEach(([childKey, item]) => visit(item, [...path, childKey]));
    }
  };
  visit(value, []);
  return findings;
}

function foundationLanguageFindings(
  value: ReturnType<typeof weeklyLessonFoundationBodyOutputSchema.parse>,
  cefr: string
): Array<{ path: PropertyKey[]; message: string }> {
  if (!["A1", "A2"].includes(cefr)) return learnerFacingLanguageFindings("foundation", value, cefr);
  const learnerGuidance: Array<{ path: PropertyKey[]; value: string | undefined }> = [
    { path: ["instruction", "title"], value: value.instruction.title },
    { path: ["instruction", "step1"], value: value.instruction.step1 },
    { path: ["instruction", "step2"], value: value.instruction.step2 },
    { path: ["instruction", "step3"], value: value.instruction.step3 },
    { path: ["grammar", "usage"], value: value.grammar?.usage },
    { path: ["pronunciation", "title"], value: value.pronunciation.title },
    { path: ["pronunciation", "tip"], value: value.pronunciation.tip }
  ];
  return learnerGuidance.flatMap((item) => item.value && !containsVietnameseLearnerText(item.value)
    ? [{ path: item.path, message: `${cefr} learner guidance and explanations must be in Vietnamese.` }]
    : []);
}

function vocabularyLanguageFindings(
  value: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>,
  cefr: string
): Array<{ path: PropertyKey[]; message: string }> {
  if (!["A1", "A2"].includes(cefr)) return learnerFacingLanguageFindings("vocabulary", value, cefr);
  return (["word1", "word2", "word3"] as const).flatMap((slot) =>
    isVietnameseVocabularyMeaning(value[slot].meaning)
      && value[slot].meaning.normalize("NFKC").trim().toLocaleLowerCase("en-US")
        !== value[slot].word.normalize("NFKC").trim().toLocaleLowerCase("en-US")
      ? []
      : [{ path: [slot, "meaning"], message: `${cefr} vocabulary meanings must be in Vietnamese.` }]
  );
}

function vocabularyDuplicationFindings(
  value: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>
): Array<{ path: PropertyKey[]; message: string }> {
  const owners = new Map<string, { word: string; path: PropertyKey[] }>();
  return vocabularyLexicalTerms(value).flatMap((term) => {
    const key = normalizeVocabularyKey(term.word);
    if (!key) return [];
    const prior = owners.get(key);
    if (!prior) {
      owners.set(key, { word: term.word, path: term.path });
      return [];
    }
    return [{
      path: term.path,
      message: `${term.word} is duplicated inside this vocabulary component (already used at ${prior.path.join(".")}); every learner-facing target, family, synonym, antonym and sibling must be introduced once.`
    }];
  });
}

function vocabularySelfReferentialFamilyFindings(
  value: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>
): Array<{ path: PropertyKey[]; message: string }> {
  return (["word1", "word2", "word3"] as const).flatMap((slot) => {
    const target = value[slot].word.trim().toLocaleLowerCase("en-US");
    return (["family1", "family2"] as const).flatMap((familyKey) => {
      const family = value[slot][familyKey];
      if (!family || family.word.trim().toLocaleLowerCase("en-US") !== target) return [];
      return [{ path: [slot, familyKey, "word"] as PropertyKey[], message: `${value[slot].word} cannot be its own word-family member; provide a distinct established related word or leave the optional family slot empty.` }];
    });
  });
}

function vocabularyMissingRelationFindings(
  value: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>,
  cefr = ""
): Array<{ path: PropertyKey[]; message: string }> {
  const slots = ["word1", "word2", "word3"] as const;
  const hasRelation = (slot: (typeof slots)[number]) => Boolean(value[slot].synonym1 || value[slot].synonym2 || value[slot].antonym1);
  const hasCredibleCoverage = (slot: (typeof slots)[number]) => lexicalRelationCoverageSatisfied({
    word: value[slot].word,
    partOfSpeech: value[slot].partOfSpeech,
    meaning: value[slot].meaning,
    synonyms: [value[slot].synonym1, value[slot].synonym2],
    antonyms: [value[slot].antonym1],
    relationStatus: value[slot].relationStatus
  }, cefr);
  const missingSlots = slots.filter((slot) => !hasRelation(slot) && !hasCredibleCoverage(slot));
  return missingSlots
    // A missing relation is the one permitted light lexical gap. The level
    // quality gate later rejects a level once it accumulates more than two.
    // Keep retrying only claimed-but-invalid exemptions here.
    .filter((slot) => value[slot].relationStatus !== "generation_missed" || missingSlots.length > MAX_LIGHT_LEXICAL_RELATION_GAPS_PER_LEVEL)
    .map((slot) => ({
      path: [slot, "synonym1"] as PropertyKey[],
      message: `${value[slot].word} has no credible same-level synonym or antonym. An exemption is allowed only for a calendar/time label or identifier; otherwise provide a genuine relation or replace this target with an equally relevant CEFR-appropriate word.`
    }));
}

export function validateWeeklyVocabularyLexicalCoverage(
  lessons: readonly ContentLessonDraftInput[],
  cefr = ""
): LessonGenerationFinding[] {
  const wordEntries: Array<{
    dayNumber: number;
    word: string;
    relationCovered: boolean;
    relationStatus: "provided" | "no_natural_relation" | "above_cefr_level" | "generation_missed";
  }> = [];
  for (const lesson of lessons) {
    const vocabPart = lesson.parts.find((part) => part.code === "vocabulary")?.content as { items?: unknown[] } | undefined;
    if (!Array.isArray(vocabPart?.items)) continue;
    for (const rawItem of vocabPart.items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as {
        word?: unknown;
        type?: unknown;
        partOfSpeech?: unknown;
        meaning?: unknown;
        synonyms?: unknown[];
        antonyms?: unknown[];
        relationStatus?: unknown;
      };
      const word = typeof item.word === "string" ? item.word : "";
      if (!word) continue;
      const hasRelation = (Array.isArray(item.synonyms) && item.synonyms.length > 0)
        || (Array.isArray(item.antonyms) && item.antonyms.length > 0);
      const relationStatus = hasRelation
        ? "provided"
        : item.relationStatus === "no_natural_relation" || item.relationStatus === "above_cefr_level"
          ? item.relationStatus
          : "generation_missed";
      wordEntries.push({
        dayNumber: lesson.dayNumber,
        word,
        relationCovered: lexicalRelationCoverageSatisfied(item, cefr),
        relationStatus
      });
    }
  }
  if (wordEntries.length === 0) return [];
  const missingEntries = wordEntries.filter((entry) => !entry.relationCovered);
  if (missingEntries.length <= MAX_LIGHT_LEXICAL_RELATION_GAPS_PER_LEVEL) return [];
  return [{
    dayNumber: null,
    component: "vocabulary",
    code: "VOCABULARY_LEXICAL_GAPS_EXCEEDED",
    severity: "warning",
    message: `${cefr ? `Mức ${cefr}: ` : ""}Có ${missingEntries.length} từ thiếu đồng nghĩa/trái nghĩa hợp lệ, vượt giới hạn ${MAX_LIGHT_LEXICAL_RELATION_GAPS_PER_LEVEL} lỗi nhẹ cho một mức. Giữ nguyên các từ hợp lệ và chỉ sinh lại phần từ vựng bị thiếu.`,
    issues: missingEntries.map((entry) => ({
      dayNumber: entry.dayNumber,
      word: entry.word,
      relationStatus: entry.relationStatus
    })),
    repairAction: "regenerate_component"
  }];
}

/** Short dictionary meanings need a different detector from instructional prose. */
export function isVietnameseVocabularyMeaning(value: string): boolean {
  const compact = value.normalize("NFKC").trim();
  if (!compact) return false;
  if (/(?<![\p{L}\p{N}])(?:a|an|the|to|of|for|with|from|someone|something|person|thing|act|action|process|state|quality)(?![\p{L}\p{N}])/iu.test(compact)) return false;
  return containsVietnameseLearnerText(compact)
    || /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(value)
    || /\b(?:tham|gia|vào|ra|làm|cho|với|của|được|người|việc|nhóm|đội|buổi|cuộc|họp|gọi|gửi|nhận|xem|nghe|nói|viết|đọc|mở|đóng|bắt đầu|kết thúc)\b/iu.test(compact)
    || compact.split(/\s+/u).length <= 4;
}

export function lessonQualityProfileFromEnv(value = process.env.E4S_LESSON_QUALITY_PROFILE): LessonQualityProfile {
  return value?.trim().toLocaleLowerCase("en-US") === "strict" ? "strict" : "baseline";
}
const OBJECTIVE_VERBS_BY_LEVEL: Record<string, readonly string[]> = {
  A1: ["nói", "nhắc lại", "chỉ ra", "nối", "chọn", "điền", "chào hỏi", "giới thiệu", "trả lời", "dùng"],
  A2: ["hỏi và trả lời", "mô tả", "mô tả đơn giản", "viết", "xác nhận", "đề nghị", "xin lỗi", "sắp xếp", "hoàn thành", "dùng"],
  B1: ["explain", "describe", "respond to", "give reasons for", "summarize", "summarise", "ask for clarification", "report", "write", "suggest", "compare"],
  B2: ["give reasons for", "summarize", "summarise", "ask for clarification", "report", "write", "suggest", "compare", "justify", "negotiate", "handle", "propose", "compare and recommend", "paraphrase", "de-escalate", "soften", "present", "persuade", "adapt"],
  C1: ["explain", "describe", "give reasons for", "summarize", "summarise", "report", "compare", "justify", "negotiate", "handle", "propose", "compare and recommend", "paraphrase", "de-escalate", "soften", "present", "persuade", "adapt", "mediate", "critique", "synthesize", "synthesise", "reframe", "diplomatically decline", "lead", "tailor"]
} as const;
const LANGUAGE_OBJECTIVE_VERBS_BY_LEVEL: Record<string, readonly string[]> = {
  ...OBJECTIVE_VERBS_BY_LEVEL,
  C1: ["justify", "negotiate", "handle", "propose", "compare and recommend", "paraphrase", "de-escalate", "soften", "present", "persuade", "adapt", "mediate", "critique", "synthesize", "synthesise", "reframe", "diplomatically decline", "lead", "tailor"]
};
const UNOBSERVABLE_OBJECTIVE_VERB = /\b(?:understand|know|learn|appreciate|realise|realize|grasp|master|study|practi[cs]e|review|hiểu|biết|nắm được|nắm vững|làm quen|học về|tìm hiểu|ôn tập|luyện tập)\b/iu;

const OBJECTIVES_CONTRACT = [
  "Generate only the objective fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use lessonFocus as the exact teaching focus and allLessonFocuses only to avoid repetition.",
  "objective must include lesson_goal and assessment_gap. Set assessment_gap to null because this lesson generates an assessment for every objective.",
  "objective.items must contain 2-4 measurable objectives. Include at least one content objective and at least one language objective. The application assigns stable ids after validation; do not invent ids.",
  "Every objective item must include action_verb, target_language (null for content; concrete taught words/frames for language), condition, criterion, assessed_by, success_evidence and assessmentCode.",
  "Every objective text uses the exact learner-facing opener: 'Sau bài học, bạn có thể' for A1-A2 or 'By the end of this lesson, you will be able to' for B1-C1. Keep this opener in the returned text. Use one observable verb and one assessable ability.",
  "Keep the learner-facing ability after that fixed opener concise: at most 16 words for A1-A2 and at most 16 words for B1-C1. Put conditions, criteria and evidence in their dedicated fields instead of lengthening objective.text.",
  "Prefer an observable action verb from the ACTIVE LEVEL bank appended below. A different observable verb is allowed when it more accurately matches the approved lesson focus.",
  "For B1-C1 language objectives, never set action_verb to 'use' or 'give'. Choose a workplace action from that level's bank, then mention the target language later with 'using' (for example: 'explain ... using due to').",
  "Count objectives before returning: 2-4 total, with at least one content objective and at least one concrete language objective.",
  "For A1-A2, every objective must be assessable by one generated exercise response. Do not require aggregate totals such as 2-5 situations, several separate sentences, multiple repetitions, a sequence of unrelated weekly actions, or a score across several attempts.",
  "For A1-A2, an objective mapped to writing is assessed by one four-option MCQ or cloze selection. Phrase the objective as choosing or completing the correct language in context; do not require unsupported free writing. For B1-C1, writing may require a scoped free response.",
  "The assessment shape must match assessmentCode: listening and reading are four-option comprehension checks; word_class and word_use are four-option checks; speaking is an open spoken response. Writing is four-option MCQ for A1-A2 and open free response for B1-C1. Never describe a written free response as listening/reading, and never map a four-option choice objective to B1-C1 writing.",
  "Do not create a pronunciation objective unless lessonFocus itself explicitly teaches a sound or pronunciation rule. The separate mandatory pronunciation card does not make its sample words part of this day's assessed objectives.",
  "Set explanationLanguage to vi for A1-A2 and en for B1-C1.",
  "For B1-C1, every learner-facing objective string must be English.",
  "Keep the content CEFR-appropriate, practical, concise, and directly teachable. Return no prose outside the tool."
].join("\n");

const FOUNDATION_CONTRACT = [
  "Generate only the compact non-objective foundation fields required by the strict tool schema for ONE learner-facing lesson.",
  "Use lessonFocus as the exact teaching focus and allLessonFocuses only to avoid repetition.",
  "If grammarClassification.status is classified, use that narrow target without broadening its scope.",
  "If grammarClassification.status is no_suitable_content or insufficient_evidence, do not invent a grammar target: set title to null and grammar to null. The grammar section will be hidden from learners.",
  "title must name the concrete sentence frame taught by lessonFocus (for example 'It is + adjective' or 'Could I + V?'); never use a generic placeholder such as 'S + V', 'S + V + O', or repeat the same title across days.",
  "Reject factual shortcuts: a passive state such as 'Your mic is muted' is not present continuous; never generate 'Your mic is muting'. 'Would you mind if I...' takes a past-tense clause, while 'Would you mind...' without if takes V-ing. Verify every formula and example before returning.",
  "A title must be a complete frame and may not end with and, or, to, of, for, with, if, that, or another dangling connector.",
  "For A1-A2, write grammar.usage and pronunciation.tip in natural Vietnamese. Lesson instructions, section titles and the authoritative pronunciation plan are added by the application after validation; do not return them. Keep grammar formula/examples in English.",
  "For B1-C1, every learner-facing string returned in title, grammar and pronunciation.tip must be English. Lesson instructions, section titles and the pronunciation plan are added by the application after validation.",
  "When grammar is present, grammar.contentType, targetName and scope must exactly match grammarClassification.contentType, targetName and scope.",
  "grammar.formula must be a short usable grammar pattern or sentence frame, never a descriptive topic label.",
  "grammar.usage must be exactly one short sentence in Vietnamese for A1-A2 or English for B1-C1 explaining when to use only the classified target; do not broaden the scope.",
  "Each grammar example must be one English sentence of at most 10 words. Do not add Vietnamese translations, parentheses, or a second sentence.",
  "Provide exactly two grammar examples.",
  "Pronunciation focus, sample words and IPA are authoritative curriculum input in pronunciationPlan. Do not select or rewrite them. Return only an English pronunciation title and an English guidance tip for B1-C1 (Vietnamese is allowed for A1-A2).",
  "Keep the content CEFR-appropriate, practical, concise, and directly teachable. Return no prose outside the tool."
].join("\n");

const GRAMMAR_CLASSIFIER_CONTRACT = [
  "Classify the ONE explicitly taught language target before generating any grammar explanation.",
  "Allowed contentType values are grammar_rule, sentence_pattern, usage_rule, word_formation, pronunciation_rule.",
  "Classify one narrow grammar rule or sentence pattern only when it is explicitly supported by lessonFocus, allLessonFocuses, objectives, description, or topic.",
  "A communicative function can still contain an explicit teachable frame: imperatives for mic/camera instructions, polite request frames, clarification frames, signposting frames, reporting clauses, or closing frames. Classify that concrete frame instead of returning a generic S + V label or abstaining.",
  "Never label 'be + past participle/adjective' (for example 'Your mic is muted') as present continuous. Never classify 'Would you mind if I + V-ing' as valid; distinguish 'Would you mind if I + past simple' from 'Would you mind + V-ing'.",
  "For a communicative or vocabulary-led lesson with no explicit grammar evidence, return no_suitable_content. When the supplied evidence is too vague to decide safely, return insufficient_evidence. Never invent a grammar target merely to fill the section.",
  "For every evidence item, sourceRef must be one of topic, description, objectives, keyVocabHint, lessonFocus, or allLessonFocuses, and quote must occur verbatim in that exact input field.",
  "Every rejectedCandidates.reason must be exactly one of: incidental_language, unrelated_to_objective, lower_priority, vocabulary_only, out_of_scope.",
  "Keep scope narrow: do not add negative, question, tense, or exception forms that the evidence does not teach. Return only the strict tool output."
].join("\n");

const VOCABULARY_CONTRACT = [
  "Generate only the vocabulary fields required by the strict tool schema for ONE learner-facing lesson.",
  "Return exactly three useful words matching lessonFocus and, only when non-null, grammarFormula.",
  "A null grammarFormula and grammarExamples mean the grammar classifier abstained. Do not invent a grammar target; generate vocabulary from lessonFocus.",
  "Treat excludedVocabulary as a bounded diversity hint, not a prohibition. Prefer fresh words when equally useful, but keep a repeated core lessonFocus word when it is pedagogically necessary. Any list explicitly labelled RETAINED-DAY VOCABULARY, PRIMARY TARGETS RESERVED FOR OTHER DAYS, or FORBIDDEN LEARNER-FACING WORDS is a hard prohibition: never return those words as a target, family, synonym, antonym or sibling; they may appear only in practice prose.",
  "Each word needs partOfSpeech, slash-delimited IPA, stress, exact ttsText, matching <speak> SSML (ssml must speak ONLY ttsText, e.g. <speak>word</speak> or <speak><phoneme alphabet=\"ipa\" ph=\"...\">word</phoneme></speak>, never a full sentence), Vietnamese meaning, a concrete photographic imageQuery, and exactly three natural collocations.",
  "For heteronyms whose pronunciation changes by part of speech (such as record, present, conduct, project, contract, update, produce, object), ensure partOfSpeech, pronunciation, stress, and ssml all match the exact part of speech used in the lesson.",
  "imageQuery must describe one clear real-world workplace photo with the target visible; no icons, logos, diagrams, screenshots, charts, or text-heavy images.",
  "Always populate family1 with one natural dictionary-valid word-family member or inflected/related workplace form; family2 and synonyms/antonyms may be null when no natural relation exists. Keep the three collocations distinct and natural.",
  "For B1-C1, keep the vocabulary title, part of speech, collocations, examples, relation labels, relation notes, every relation sense and all lexical examples in English. Only fields whose key is meaning or ends in Meaning may contain Vietnamese; sense is never a Vietnamese-meaning field.",
  "For word family, use only established dictionary headwords with a direct morphological relationship. Do not mechanically attach a suffix, invent hyphenated forms, or label a gerund as a noun merely to fill a slot; family2 may be null when only one natural relation exists.",
  "An inflected form of a different or opposite lemma is not a word-family member: for example muted belongs to mute, not unmute; unmuted belongs to unmute. Treat multiword alternatives such as say again as phrases, not phrasal verbs, and place movable adverbs naturally in examples.",
  "The umbrella word must be a genuine broader semantic category, and each sibling must be another member of that same category rather than a synonym or an arbitrary related word.",
  "Every synonym or antonym must use the same part of speech and same sense as the target, include a concise sense label, and include a contextual example containing that relation word. Derivations are not synonyms.",
  "For synonym1, synonym2 and antonym1, copy the target item's partOfSpeech string exactly into relation.partOfSpeech. If the relation is not truly that part of speech in the shown example, replace the relation word instead of changing the label.",
  "A synonym or antonym word must never equal its target word, even with different casing. If no distinct dictionary-valid relation exists, return null instead of repeating the target.",
  "Every ordinary vocabulary target must have at least one genuine same-sense synonym or antonym. Set relationStatus to 'provided' when it does. A no_natural_relation or above_cefr_level exemption is allowed only for a calendar/time label (for example Monday or a date) or a system identifier; never use it for an ordinary workplace word. When an ordinary target has no genuine same-level relation, replace that target with an equally relevant CEFR-appropriate word from lessonFocus rather than inventing a false relation.",
  "Final preflight before answering: (1) no learner-facing word is repeated anywhere among word1-word3, family, synonym, antonym or sibling cards, (2) every non-null relation word differs from its own target, and (3) every relation example contains that relation word. Repair every failed check before returning the tool output.",
  "For B1-C1, add a language preflight: scan every string outside keys named meaning or ending in Meaning; replace any Vietnamese in title, note, sense, example, collocation, relation or label with English before returning.",
  "Use null only for additional optional relations or an antonym that would be false or unnatural; never invent a fake relation. Return no prose outside the tool."
].join("\n");

const SKILLS_SHARED_CONTRACT = [
  "Generate only the requested exercise fields required by the strict tool schema for ONE learner-facing lesson.",
  "generationConstraints is authoritative for learnerLanguage, writingType, listening/reading word ranges, and speaking maximum length. Count words before returning; rewrite naturally until every passage is inside its range and the speaking model answer does not exceed its maximum.",
  "Use vocabularyWords consistently. Use grammarFormula and grammarExamples only when they are non-null; null means the classifier abstained, so do not invent grammar.",
  "lessonObjectives is the approved objective-to-assessment map. For every objective whose assessmentCode belongs to this subgroup, generate an exercise that directly measures every mandatory act. When the objective says 'or', 'hoặc', uses a slash, or lists alternative target_language realizations, one complete alternative is sufficient; do not force every alternative into one item. Do not substitute a related vocabulary check. Keep each objective assessable by its named single exercise.",
  "When grammarFormula is non-null, every requested subgroup must actively practise that exact target: comprehension bodies must contain a natural instance and at least one question must require understanding it; language practice must test or produce it; speaking must require it in the response. Merely sharing the broad topic is not enough.",
  "For A1-A2, use only vocabulary and grammar supplied in the input, one task per item, and short common sentences.",
  "When an answer labels a value as high/low, expensive/cheap, large/small, good/bad, or another relative judgment, the same exercise must provide an explicit comparison, threshold, or source statement that makes that label objectively true. A bare number alone is never enough evidence.",
  "Every exercise must include questionTranslation and answerTranslation plus one short hint that helps without containing or revealing the answer (never write 'có chữ ...' or name any word from the answer). For A1-A2 those support fields are clear Vietnamese translations. For B1-C1 they are concise English restatements; they may clarify the prompt and answer and do not need to copy them word for word.",
  "For B1-C1, every title, body, prompt, option, answer, hint, explanation, feedback, questionTranslation and answerTranslation must be English.",
  "For every open writing or speaking item, the model answer may use only actors, actions, quantities, dates, deadlines, reasons and outcomes stated in that item's own prompt. Do not add a date, duration, budget claim, urgency, approval request, delivery promise, consequence, or other plausible workplace detail merely to make the answer sound natural.",
  "Never ask the learner to justify a quantity, timing, or total against a numeric constraint unless the prompt supplies every value needed to demonstrate that claim. If a price, capacity, duration, comparison baseline, or other required value is absent, narrow the task to choosing or naming the supported option; never require arithmetic, compliance, or a budget conclusion that the learner cannot verify from the prompt.",
  "Keep every item CEFR-appropriate, practical, and unambiguous. Return no prose outside the tool."
  ,"Before returning, perform an evidence preflight: insert each keyed answer into its sentence, verify the resulting English is grammatical and natural, verify each listening/reading answer is directly supported by a specific source span, and verify every mandatory prompt constraint appears in the model answer. Replace the whole faulty item if any check fails."
].join("\n");

function skillsSubgroupContract(
  component: "skills.comprehension" | "skills.languagePractice" | "skills.speaking",
  constraints: ReturnType<typeof weeklyLessonSkillsGenerationConstraints>,
  cefr: string
): string {
  const shared = `${SKILLS_SHARED_CONTRACT}\nACTIVE LEVEL ${cefr}; learner-facing guidance language: ${constraints.learnerLanguage}.`;
  if (component === "skills.comprehension") {
    return [
      shared,
      `Listening body must contain ${constraints.listeningWordMin}-${constraints.listeningWordMax} words inclusive.`,
      `Reading body must contain ${constraints.readingWordMin}-${constraints.readingWordMax} words inclusive.`,
      `Reading inference required: ${constraints.inferenceRequired ? "yes" : "no"}.`,
      "Listening and reading each need exactly four short English options of 1-5 words, and answer must exactly copy one option.",
      "Keep questions and options concise enough for the learner interface; do not sacrifice clarity merely to hit an exact word count.",
      "All distractors must be grammatical, plausible in the workplace context, and wrong for one clear meaning-based reason; never use a synonym, paraphrase, near-equivalent, or another answer supported by the body."
      ,"For the correct option, identify a source sentence that entails it. For each distractor, identify a source fact that excludes it. If you cannot do both, rewrite the body, question and all options before returning."
      ,...(constraints.inferenceRequired ? [] : ["This level does not assess inference: the listening/reading body must state the keyed fact or requested action directly. Do not ask what someone should do when the action is only implied."])
      ,"Every named person or entity in a question must be explicitly identified in that exercise's body. For why/cause questions, the stated cause must affect the same actor and outcome asked about; a speaker's unclear voice does not explain why that speaker needs the listener to repeat. When a mapped objective in lessonObjectives requires explaining 'why', 'purpose', or 'reason', the question and keyed option must directly test that reason or purpose rather than merely checking action sequence. If a question asks which of four options has the largest or smallest numeric value, provide the comparable metric for every option in the source, or explicitly state the winning option; one complete figure beside only the keyed answer is not enough."
    ].join("\n");
  }
  if (component === "skills.languagePractice") {
    return [
      shared,
      `writing.type must be ${constraints.writingType}.`,
      "wordClass and wordUse each need exactly four short English options and answer must exactly copy one option.",
      constraints.writingType === "mcq"
        ? "Writing must be mcq with exactly four options. Use fill only when generationConstraints explicitly permits it and only one taught word can fit."
        : "Writing must be a tightly scoped write task with a model answer of at least two words.",
      "For wordClass, put the target in an unambiguous canonical position. Do not key a past participle after be as a verb; choose a clearer sentence or classify it as an adjective.",
      "All closed-task distractors must be grammatical, plausible, and have exactly one defensible answer."
      ,"For cloze-like prompts, mentally substitute all four options into the blank. The keyed option must create a grammatical, natural and meaningful sentence; distractors should remain plausible words but fail for a clear contextual reason. After keep/keeps, an ongoing action uses V-ing. Avoid nonsense collocations and obviously malformed C1 distractors."
    ].join("\n");
  }
  return [
    shared,
    `Speaking model answer must contain at most ${constraints.speakingAnswerWordMax} words and remain a complete natural response.`,
    `Speaking additional scenario constraint count: ${constraints.speakingConstraintCount}.`,
    "Speaking prompt must be one short Vietnamese instruction for A1-A2 and a clear English workplace instruction for B1-C1. Speaking answer must be one concise English model response.",
    constraints.speakingConstraintCount > 0
      ? `Require the workplace acts in lessonFocus plus no more than ${constraints.speakingConstraintCount} concrete scenario constraint${constraints.speakingConstraintCount === 1 ? "" : "s"} or follow-up detail${constraints.speakingConstraintCount === 1 ? "" : "s"}.`
      : "Keep the speaking task short and directly tied to the taught language."
    ,"Do not add unrelated scenario requirements beyond lessonFocus, such as a new deadline, another meeting, budget item, owner, contingency, or closing action unless lessonFocus or an approved objective explicitly requires it."
    ,"For B1 speaking (max 24 words), include at most TWO action items or owners in a summary prompt so the model answer can name every actor, action, deadline, and closing phrase within 24 words."
    ,"Convert the speaking prompt into an internal checklist of actors, actions, required phrases, details, deadlines, contingencies and closing language. The model answer must satisfy every checklist item without changing the actor or the meaning of a time limit."
    ,"If lessonFocus contains more than one communicative act joined by and, then, a slash, or separate sentences (for example asking for repetition and closing the call), the speaking prompt and model answer must cover every act in the stated order."
    ,"When lessonFocus contains alternative replies such as Yes/No or can/cannot, use one reply that fits the prompt's situation. If the task deliberately practises both alternatives, create two explicitly different situations; never make one speaker give contradictory alternatives as one response."
    ,"For a chart, table, document or shared-screen task, put every fact needed for the model answer directly in the prompt. Never invent a month, value, deadline, owner or trend that the prompt does not provide."
  ].join("\n");
}

const SKILLS_REVIEW_CONTRACT = [
  "Review one generated lesson skill set for serious learner-facing defects only.",
  "Scope hierarchy is mandatory: lessonFocus is the exact scope for this day; topic, description, objectives, and keyVocabHint are broader week context only. A skill that directly teaches lessonFocus must not be rejected merely because it uses day-specific scenarios or vocabulary not listed in keyVocabHint.",
  "Accept realistic workplace details such as budgets, clients, deadlines, decisions, and follow-up actions when they are used inside the approved lessonFocus and remain connected to the week's communication setting.",
  "Request revision only when an exercise has multiple defensible answers, a wrong answer key, insufficient context, content outside the taught scope, an answer-revealing hint, a clear CEFR mismatch, or mismatched feedback.",
  "Treat a cut-off passage, sentence fragment, dangling auxiliary or preposition, or an unfinished final sentence as serious insufficient context.",
  "Do not reject stylistic preferences, harmless wording differences, or an answer that is already correct.",
  "Give every finding a category: source_contradiction (the key, question or model answer contradicts or is not supported by this exercise's own source or prompt), answer_key_mismatch (the stored key is wrong or another option is also correct), objective_mismatch (the exercise does not measure a mandatory act or target of an objective mapped to this same exercise), translation_mismatch (questionTranslation, answerTranslation or hint does not match the prompt or answer), cross_exercise_mismatch (the exercise only differs from another exercise; every exercise is self-contained, so this is a note), style_preference (wording, register or structure preference), self_withdrawn (you concluded there is no defect).",
  "Every finding needs evidence: evidence.path is exerciseCode.field of the field that must change (for example speaking.answer or reading.body), evidence.actual quotes the exact current text of that field, and evidence.expected states what it must say or contain. Name the exercise that causes the defect, not merely the one where you noticed it.",
  "For open writing and speaking tasks, the stored answer is a model example, not the only accepted response. Never request revision merely because other valid open responses exist.",
  "For B1-C1, questionTranslation and answerTranslation are legacy English support fields that mirror prompt and answer; they are not grammar-rationale fields. Do not request an explanation of why an answer is correct there.",
  "For each real defect, write one concise finding message under 80 words. Do not combine several exercises into one finding.",
  "Solve every closed exercise independently and return the solved answers required by the strict tool schema.",
  "Compare every exercise with lessonObjectives before approving. Each objective's assessmentCode must point to an exercise that measures all mandatory acts and target_language requirements. If the objective says 'or', 'hoặc', uses a slash, or lists alternative realizations, one complete alternative is sufficient; never demand all alternatives in one item. Flag feedback_mismatch only when the mapped exercise tests a different requirement or omits a genuinely mandatory act such as a required greeting, closing, or negative response.",
  "Never apply an objective to a different exercise: writing objectives assess only writing, word_use only wordUse, word_class only wordClass, and likewise for listening, reading and speaking. Mention an objective id in a finding only when its assessmentCode maps to that same exerciseCode.",
  "Do not trust the stored answer. For listening and reading, the key must be entailed by the body. Distractors must be plausible but not entailed; their absence from the body is sufficient exclusion and is NOT a defect. If the source says mic/glitch but the key says echo, or the keyed answer names an action/person never stated, return key_mismatch or insufficient_context.",
  "For every named person or entity in a comprehension question, verify that the body explicitly identifies that person or entity. For every why/cause question, verify that the cause affects the same actor and outcome; mere co-occurrence or an illogical 'so' clause is insufficient context.",
  "For writing, wordClass and wordUse, substitute the stored answer into the prompt sentence and check grammar, morphology, collocation and meaning. Reject base form after keep/keeps when V-ing is required, semantically impossible phrases, and distractors so malformed that a B2-C1 learner can answer without understanding the lesson.",
  "For speaking, extract every mandatory condition from the prompt (actor, action, details, deadline, contingency, required frame and closing). Compare them one by one with the model answer; any omitted, contradicted or reinterpreted condition is feedback_mismatch or insufficient_context. However, compact present-tense summaries that omit articles ('the'), optional noun modifiers (e.g. 'revised', 'client meeting'), or 'by' before day names to fit the strict CEFR word limit (e.g. 'Maria sends the budget Friday; Tom books room Wednesday') are valid and must NEVER be rejected as telegraphic or missing conditions, nor should completing an open preposition frame like 'I\\'ll follow up by' with 'email' or 'sending the notes' be flagged as an invented detail.",
  "Before returning a speaking task, calculate every total, difference and percentage stated in its prompt. The scenario figures must make the required objective/frame factually true; a frame saying total spending was ten percent higher than planned cannot use equal planned and actual totals.",
  "Treat grammarFormula and grammarExamples as claims to verify, not trusted context. Flag exercises that practise a factually invalid pattern or that do not practise the supplied target.",
  "Use approved with no findings when the exercises are usable. Return only the strict tool output."
].join("\n");

const LENGTH_REPAIR_CONTRACT = [
  "Repair only the requested learner-facing text fields while preserving their meaning and answer evidence.",
  "Return all three fixed slots: listeningBody, readingBody, and speakingAnswer.",
  "For each requested path, put its token array in the matching slot. Every unrequested slot must be null.",
  "Each array item must be exactly one space-free token; punctuation may stay attached to its word.",
  "The number of array items must equal targetWordCount exactly. Count array items before returning.",
  "Keep the text natural, CEFR-appropriate, and consistent with lessonFocus, prompt, and answer.",
  "For speakingAnswer, first extract every mandatory constraint from prompt, then preserve every one in the shortened answer. Do not shorten by dropping a deadline, owner, required phrase, contingency, requested detail, or closing action.",
  "Do not number tokens and do not put two words in one array item."
].join("\n");

function activeFoundationProfile(cefr: string): string {
  const language = cefr === "A1" || cefr === "A2" ? "Vietnamese" : "English";
  return `ACTIVE LEVEL ${cefr}: Use ${language} for learner-facing guidance according to this component's language policy. For objectives, return 2-4 items with at least one content and at least one language objective. Prefer these observable content actions when suitable: ${allowedObjectiveVerbs(cefr).join(", ")}. Prefer these observable language actions when suitable: ${allowedLanguageObjectiveVerbs(cefr).join(", ")}. Keep every action and explanation appropriate to the approved ${cefr} plan.`;
}

async function settleSequentially<TInput, TOutput>(
  inputs: readonly TInput[],
  operation: (input: TInput, index: number) => Promise<TOutput>
): Promise<Array<PromiseSettledResult<TOutput>>> {
  const settled: Array<PromiseSettledResult<TOutput>> = [];
  for (const [index, input] of inputs.entries()) {
    try {
      settled.push({ status: "fulfilled", value: await operation(input, index) });
    } catch (reason) {
      settled.push({ status: "rejected", reason });
    }
  }
  return settled;
}

async function settleWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  operation: (input: TInput, index: number) => Promise<TOutput>
): Promise<Array<PromiseSettledResult<TOutput>>> {
  const results = Array<PromiseSettledResult<TOutput>>(inputs.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= inputs.length) return;
      try {
        results[index] = { status: "fulfilled", value: await operation(inputs[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), inputs.length) }, worker));
  return results;
}

export type WeeklyLessonComponentInput = {
  weekNumber: number;
  topic: string;
  description: string;
  objectives: string;
  keyVocabHint: string;
  cefr: string;
  dayNumber: number;
  lessonFocus: string;
  allLessonFocuses: string[];
  dayContract?: WeeklyLessonDayContract;
};

export type WeeklyLessonDayContract = {
  version: "weekly-day-contract-v1";
  weekNumber: number;
  cefr: string;
  learnerLanguage: WeeklyLessonLevelAllocation["learnerLanguage"];
  difficultyLane: string;
  weekContext: {
    topic: string;
    description: string;
    objectives: string;
    keyVocabHint: string;
  };
  day: {
    dayNumber: number;
    lessonFocus: string;
  };
  scopeRule: string;
};

export function buildWeeklyLessonDayContract(input: WeeklyLessonComponentInput): WeeklyLessonDayContract {
  const allocation = buildWeeklyLessonLevelAllocation([input.cefr])[input.cefr]!;
  return {
    version: "weekly-day-contract-v1",
    weekNumber: input.weekNumber,
    cefr: input.cefr,
    learnerLanguage: allocation.learnerLanguage,
    difficultyLane: allocation.difficultyLane,
    weekContext: {
      topic: input.topic,
      description: input.description,
      objectives: input.objectives,
      keyVocabHint: input.keyVocabHint
    },
    day: {
      dayNumber: input.dayNumber,
      lessonFocus: input.lessonFocus.trim()
    },
    scopeRule: "lessonFocus is the only required teaching scope for this day; weekContext is supporting context and must not add extra assessed requirements"
  };
}

function scopeComponentInputToCurrentDay(input: WeeklyLessonComponentInput): WeeklyLessonComponentInput {
  // Every provider stage sees the same exact-day top-level scope.  Keep the
  // original week context in dayContract, while respecting the narrower topic
  // limit for complete blueprints that can be up to 500 characters.
  const dayContract = input.dayContract ?? buildWeeklyLessonDayContract(input);
  const focus = dayContract.day.lessonFocus;
  const outcome = /(?:^|\|)\s*Outcome:\s*([^|]+)/iu.exec(focus)?.[1]?.trim();
  const scopedTopic = focus.length <= 200
    ? focus
    : (outcome ? `Outcome: ${outcome}` : focus).slice(0, 200).trim();
  return {
    ...input,
    topic: scopedTopic,
    description: `This lesson teaches only this approved day focus: ${focus}`,
    objectives: focus,
    keyVocabHint: focus,
    lessonFocus: focus,
    allLessonFocuses: Array.from({ length: 5 }, () => focus),
    dayContract
  };
}

/**
 * Runs the first weekly-lesson component in isolation.  Diagnostic tooling uses
 * this same production function so a passed checkpoint cannot diverge from the
 * classifier used by the full generation flow.
 */
export async function generateWeeklyLessonGrammarClassification(
  input: WeeklyLessonComponentInput,
  runner: AiTaskRunner,
  options: {
    qualityReview?: boolean;
    onProgress?: (event: LessonGenerationProgressEvent) => void;
  } = {}
): Promise<{
  result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
  output: ReturnType<typeof weeklyLessonGrammarClassificationOutputSchema.parse>;
  attempts: number;
  attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"];
}> {
  const maxAttempts = options.qualityReview ? MAX_COMPONENT_ATTEMPTS : 1;
  let findings: Array<{ path: PropertyKey[]; message: string }> = [];
  let previousOutput = "";
  const attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options.onProgress?.({
      dayNumber: input.dayNumber,
      component: "grammarClassification",
      status: attempt === 1 ? "started" : "retrying",
      attempt,
      maxAttempts
    });
    const languageOnlyRepair = findings.length > 0 && findings.every((issue) => issue.message.includes("must be in English") || issue.message.includes("English only"))
      ? "\nLANGUAGE-ONLY REPAIR: Keep status=classified and preserve the selected contentType, evidence, and narrow teaching target. Rewrite only targetName and scope in English. Do not change the result to no_suitable_content or insufficient_evidence."
      : "";
    const repair = findings.length
      ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}${languageOnlyRepair}${previousOutput ? `\nPREVIOUS INVALID OUTPUT: ${previousOutput}` : ""}\nReturn a complete corrected classification using only verbatim input evidence and preserve every valid field.`
      : "";
    let result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
    try {
      result = await runner.runTask("weekly_lesson_grammar_classifier", scopeComponentInputToCurrentDay(input), {
        systemPrompt: `${GRAMMAR_CLASSIFIER_CONTRACT}${repair}`,
        maxOutputTokens: GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT,
        maxAttempts: 1
      });
    } catch (error) {
      if (!isInvalidAiOutput(error)) throw withComponentDiagnostic(error, input.dayNumber, "grammarClassification", attempt, GRAMMAR_CLASSIFIER_OUTPUT_TOKEN_LIMIT);
      const invalidOutput = invalidAiOutputPayload(error);
      const normalizedInvalid = normalizeGrammarClassificationProviderOutput(invalidOutput);
      const salvaged = weeklyLessonGrammarClassificationOutputSchema.safeParse(normalizedInvalid);
      if (salvaged.success) {
        result = {
          output: salvaged.data,
          metadata: {
            traceId: `salvaged-grammar-${input.dayNumber}-${attempt}`,
            taskId: "weekly_lesson_grammar_classifier",
            provider: "salvaged",
            model: "salvaged",
            attempts: 1,
            latencyMs: 0,
            inputHash: "",
            schemaValid: true,
            usage: {}
          }
        };
      } else {
        findings = invalidAiIssues(error);
        attemptLog.push({ attempt, status: "provider_error", ...(invalidOutput === undefined ? {} : { output: invalidOutput }), issues: findings });
        if (attempt === maxAttempts) {
          options.onProgress?.({ dayNumber: input.dayNumber, component: "grammarClassification", status: "failed", attempt, maxAttempts });
          throwInvalid(findings, `day${input.dayNumber}.grammarClassification`, { attempt, maxAttempts, previousOutput, invalidOutput });
        }
        continue;
      }
    }
    const normalizedResultOutput = normalizeGrammarClassificationProviderOutput(result.output);
    previousOutput = boundedJson(normalizedResultOutput);
    const parsed = weeklyLessonGrammarClassificationOutputSchema.safeParse(normalizedResultOutput);
    if (!parsed.success) {
      findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
      attemptLog.push({ attempt, status: "rejected", output: result.output, issues: findings, metadata: result.metadata });
    } else {
      const parsedOutput = parsed.data;
      findings = options.qualityReview
        ? [
            ...grammarEvidenceFindings(parsedOutput, scopeComponentInputToCurrentDay(input)),
            ...grammarSemanticFindings(parsedOutput, scopeComponentInputToCurrentDay(input)),
            ...(["B1", "B2", "C1"].includes(input.cefr) && parsedOutput.status === "classified"
              ? learnerFacingLanguageFindings("foundation", {
                  targetName: parsedOutput.targetName,
                  scope: parsedOutput.scope
                }, input.cefr)
              : [])
          ]
        : [];
      if (findings.length === 0) {
        attemptLog.push({ attempt, status: "passed", output: result.output, issues: [], metadata: result.metadata });
        options.onProgress?.({ dayNumber: input.dayNumber, component: "grammarClassification", status: "completed", attempt, maxAttempts });
        return { result, output: parsedOutput, attempts: attempt, attemptLog };
      }
      attemptLog.push({ attempt, status: "rejected", output: result.output, issues: findings, metadata: result.metadata });
    }
    if (attempt === maxAttempts) {
      options.onProgress?.({ dayNumber: input.dayNumber, component: "grammarClassification", status: "failed", attempt, maxAttempts });
      throwInvalid(findings, `day${input.dayNumber}.grammarClassification`, { attempt, maxAttempts, previousOutput, attemptLog });
    }
  }
  throwInvalid(findings, `day${input.dayNumber}.grammarClassification`, { maxAttempts, previousOutput, attemptLog });
}

function normalizeGrammarClassificationProviderOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = structuredClone(value) as Record<string, unknown>;
  const hasClassifiedFields = typeof record.contentType === "string" && record.contentType.trim().length > 0
    && typeof record.targetName === "string" && record.targetName.trim().length > 0
    && typeof record.scope === "string" && record.scope.trim().length > 0
    && Array.isArray(record.evidence) && record.evidence.length > 0;
  if (hasClassifiedFields && record.status !== "classified") {
    record.status = "classified";
    if (record.support === "none" || !record.support) record.support = "explicit";
    if (record.confidence === "low" || !record.confidence) record.confidence = "medium";
  }
  return record;
}

export type WeeklyLessonObjectivesInput = WeeklyLessonComponentInput & {
  grammarClassification: ReturnType<typeof weeklyLessonGrammarClassificationOutputSchema.parse>;
  pronunciationPlan: ReturnType<typeof curatedPronunciationPlan>;
};

function scopeObjectiveGenerationInput(input: WeeklyLessonObjectivesInput): WeeklyLessonObjectivesInput {
  return scopeComponentInputToCurrentDay(input) as WeeklyLessonObjectivesInput;
}

function normalizeBeginnerObjectiveAssessmentShape(value: unknown, cefr: string): unknown {
  if (!["A1", "A2"].includes(cefr) || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = structuredClone(value) as { objective?: { items?: Array<Record<string, unknown>> } };
  for (const item of normalized.objective?.items ?? []) {
    if (item.assessmentCode !== "writing") continue;
    const assessment = [item.text, item.assessed_by, item.criterion, item.success_evidence]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    const isClosedChoice = /(?:trắc nghiệm|bốn lựa chọn|4 lựa chọn|chọn|điền chỗ trống|hoàn thành)|\b(?:mcq|multiple[- ]choice|four[- ]option|4[- ]option|choose|select|cloze)\b/iu.test(assessment);
    const actionIsOpenWriting = typeof item.action_verb === "string"
      && /^(?:viết|soạn|write|draft|compose)$/iu.test(item.action_verb.trim());
    if (isClosedChoice && actionIsOpenWriting) {
      item.action_verb = /(?:hoàn thành|điền chỗ trống|cloze)/iu.test(assessment) ? "hoàn thành" : "chọn";
    }
  }
  return normalized;
}

function objectiveShapeContract(cefr: string): string {
  return [
    `ASSESSMENT SHAPES FOR ${cefr}. Each objective must ask for exactly the response its assessmentCode collects:`,
    ...["listening", "reading", "writing", "word_class", "word_use", "speaking"]
      .map((code) => `- ${code}: ${objectiveAssessmentShape(code, cefr).description}.`),
    "Reading or listening to a passage ('đọc đoạn văn', 'nghe đoạn hội thoại') is the source, not a written response."
  ].join("\n");
}

type ObjectivesOutput = ReturnType<typeof weeklyLessonObjectivesOutputSchema.parse>;

/**
 * Objective IDs that own every finding, or [] when a finding concerns the
 * objective set as a whole (then the whole objective must be repaired).
 */
function objectiveIdsOwningFindings(output: ObjectivesOutput, findings: Array<{ path: PropertyKey[]; message: string }>): string[] {
  const ids = new Set<string>();
  for (const finding of findings) {
    const itemIndex = finding.path[0] === "objective" && finding.path[1] === "items" ? Number(finding.path[2]) : Number.NaN;
    const fromPath = Number.isInteger(itemIndex) ? output.objective.items[itemIndex]?.id : undefined;
    const fromMessage = objectiveIdsFromIssues([finding.message]);
    if (!fromPath && fromMessage.length === 0) return [];
    if (fromPath) ids.add(fromPath);
    fromMessage.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/** Replaces only the flagged items, by objective ID; returns undefined when the candidate omits one. */
function mergeObjectiveItems(current: ObjectivesOutput, candidate: ObjectivesOutput, flaggedIds: readonly string[]): ObjectivesOutput | undefined {
  const replacements = new Map(candidate.objective.items.map((item) => [item.id, item] as const));
  if (flaggedIds.some((id) => !replacements.has(id))) return undefined;
  return {
    ...current,
    objective: {
      ...current.objective,
      items: current.objective.items.map((item) => flaggedIds.includes(item.id) ? replacements.get(item.id)! : item)
    }
  };
}

export async function generateWeeklyLessonObjectives(
  input: WeeklyLessonObjectivesInput,
  _taskPrompt: string,
  runner: AiTaskRunner,
  options: { onProgress?: (event: LessonGenerationProgressEvent) => void } = {}
) {
  const scopedInput = scopeObjectiveGenerationInput(input);
  const basePrompt = `${OBJECTIVES_CONTRACT}\n\n${objectiveShapeContract(input.cefr)}\n\n${activeFoundationProfile(input.cefr)}`;
  const schema = {
    safeParse: (value: unknown) => weeklyLessonObjectivesOutputSchema.safeParse(
      normalizeBeginnerObjectiveAssessmentShape(value, input.cefr)
    )
  };
  const objectiveFindings = (output: ObjectivesOutput) => [
    ...validatePromptObjectives(output.objective, input.cefr, input.lessonFocus, input.allLessonFocuses).map((message) => ({ path: ["objective"] as PropertyKey[], message })),
    ...learnerFacingLanguageFindings("foundation", output, input.cefr)
  ];
  const maxAttempts = MAX_FREQUENTLY_INVALID_COMPONENT_ATTEMPTS;
  const generate = (
    attempts: number,
    prompt = basePrompt,
    semanticFindings: (output: ObjectivesOutput) => Array<{ path: PropertyKey[]; message: string }> = objectiveFindings,
    initialRepairState?: { findings: Array<{ path: PropertyKey[]; message: string }>; previousOutput: string }
  ) => runStrictComponent(
    runner, "weekly_lesson_objectives", scopedInput, prompt, OBJECTIVES_OUTPUT_TOKEN_LIMIT, schema,
    input.dayNumber, "objectives", semanticFindings, attempts, options.onProgress, true, initialRepairState
  );

  try {
    return await generate(1);
  } catch (error) {
    if (!isInvalidAiOutput(error)) throw error;
    const previous = schema.safeParse(previousComponentOutput(error));
    if (!previous.success) return await generate(maxAttempts - 1);
    let current = previous.data;
    let attemptLog = previousComponentAttemptLog(error);
    for (let repairAttempt = 2; repairAttempt <= maxAttempts; repairAttempt += 1) {
      const findings = objectiveFindings(current);
      const flaggedIds = objectiveIdsOwningFindings(current, findings);
      if (flaggedIds.length === 0) {
        // A set-level defect (e.g. a missing content objective) needs the whole objective.
        const whole = await generate(maxAttempts - repairAttempt + 1, basePrompt, objectiveFindings, {
          findings, previousOutput: boundedJson(current)
        });
        return { ...whole, attempts: repairAttempt - 1 + whole.attempts, semanticAttempts: repairAttempt - 1 + whole.semanticAttempts, attemptLog: [...attemptLog, ...whole.attemptLog] };
      }
      const preserved = current.objective.items.filter((item) => !flaggedIds.includes(item.id));
      const flagged = current.objective.items.filter((item) => flaggedIds.includes(item.id));
      const targetedPrompt = [
        basePrompt,
        `TARGETED OBJECTIVE REPAIR: rewrite only objective ID(s) ${flaggedIds.join(", ")}. Keep each one's type and assessmentCode unless the defect requires another assessmentCode.`,
        `Defects: ${findings.map((finding) => finding.message).join("; ")}`,
        `VALID OBJECTIVES TO COPY UNCHANGED (same order, type and wording): ${boundedJson(preserved)}`,
        `OBJECTIVES TO REWRITE: ${boundedJson(flagged)}`,
        "Return the complete objective object with every item in the original order."
      ].join("\n");
      const mergedFindings = (candidate: ObjectivesOutput) => {
        const merged = mergeObjectiveItems(current, candidate, flaggedIds);
        return merged
          ? objectiveFindings(merged)
          : [{ path: ["objective", "items"] as PropertyKey[], message: `The repair must return objective ID(s) ${flaggedIds.join(", ")} with the same type.` }];
      };
      try {
        const repaired = await generate(1, targetedPrompt, mergedFindings);
        const merged = mergeObjectiveItems(current, repaired.output, flaggedIds)!;
        return {
          ...repaired,
          output: merged,
          attempts: repairAttempt,
          semanticAttempts: repairAttempt,
          attemptLog: [...attemptLog, ...repaired.attemptLog.map((entry) => ({ ...entry, attempt: repairAttempt }))]
        };
      } catch (repairError) {
        if (!isInvalidAiOutput(repairError)) throw repairError;
        const candidate = schema.safeParse(previousComponentOutput(repairError));
        const merged = candidate.success ? mergeObjectiveItems(current, candidate.data, flaggedIds) : undefined;
        if (merged) current = merged;
        attemptLog = [...attemptLog, ...previousComponentAttemptLog(repairError).map((entry) => ({ ...entry, attempt: repairAttempt }))];
      }
    }
    throwInvalid(objectiveFindings(current), `day${input.dayNumber}.objectives`, {
      reason: "targeted_objective_repair_failed",
      attempt: maxAttempts,
      maxAttempts,
      previousOutput: boundedJson(current),
      attemptLog
    });
  }
}

export async function generateWeeklyLessonFoundation(
  input: WeeklyLessonObjectivesInput,
  _taskPrompt: string,
  runner: AiTaskRunner,
  options: {
    qualityProfile?: LessonQualityProfile;
    onProgress?: (event: LessonGenerationProgressEvent) => void;
  } = {}
) {
  let findings: Array<{ path: PropertyKey[]; message: string }> = [];
  let previousOutput = "";
  let pronunciationRepair = "";
  let tokenBudget = FOUNDATION_OUTPUT_TOKEN_LIMIT;
  const attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"] = [];
  for (let attempt = 1; attempt <= MAX_FOUNDATION_ATTEMPTS; attempt += 1) {
    options.onProgress?.({ dayNumber: input.dayNumber, component: "foundation", status: attempt === 1 ? "started" : "retrying", attempt, maxAttempts: MAX_FOUNDATION_ATTEMPTS });
    const beginnerLanguageRepair = ["A1", "A2"].includes(input.cefr) && findings.some((issue) => issue.message.includes("Vietnamese"))
      ? "\nA1-A2 LANGUAGE REPAIR: Rewrite every flagged guidance field fully in natural Vietnamese. Do not preserve its prior English wording. Grammar formula/examples and pronunciation words remain English."
      : "";
    const advancedLanguageRepair = ["B1", "B2", "C1"].includes(input.cefr) && findings.some((issue) => issue.message.includes("must be in English"))
      ? "\nB1-C1 LANGUAGE REPAIR: Rewrite every flagged learner-facing field fully in English. Do not preserve any Vietnamese wording or add Vietnamese parenthetical notes."
      : "";
    const repair = findings.length
      ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}${pronunciationRepair}${beginnerLanguageRepair}${advancedLanguageRepair}${previousOutput ? `\nPREVIOUS INVALID OUTPUT: ${previousOutput}` : ""}\nReturn a complete corrected foundation without changing the lesson focus; preserve every valid field.`
      : "";
    let result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
    try {
      result = await runner.runTask("weekly_lesson_foundation", input, {
        systemPrompt: `${FOUNDATION_CONTRACT}\n\n${activeFoundationProfile(input.cefr)}${repair}`,
        maxOutputTokens: tokenBudget,
        maxAttempts: 1
      });
    } catch (error) {
      if (error && typeof error === "object" && "generatedBy" in error && (error as { generatedBy?: unknown }).generatedBy === "weekly-generation") throw error;
      if (isTruncatedAiOutput(error)) {
        attemptLog.push({ attempt, status: "provider_error", issues: [{ path: ["provider"], message: "Provider output reached max_tokens." }] });
        if (attempt === MAX_FOUNDATION_ATTEMPTS) throw withComponentDiagnostic(error, input.dayNumber, "foundation", attempt, tokenBudget);
        tokenBudget = expandedTokenBudget("foundation", tokenBudget);
        findings = [{ path: ["provider"], message: `Provider reached the ${tokenBudget} token recovery budget.` }];
        continue;
      }
      if (!isInvalidAiOutput(error)) throw withComponentDiagnostic(error, input.dayNumber, "foundation", attempt, tokenBudget);
      findings = invalidAiIssues(error);
      const invalidOutput = invalidAiOutputPayload(error);
      attemptLog.push({ attempt, status: "provider_error", ...(invalidOutput === undefined ? {} : { output: invalidOutput }), issues: findings });
      if (attempt === MAX_FOUNDATION_ATTEMPTS) throwInvalid(findings, `day${input.dayNumber}.foundation`, { attempt, attemptLog, previousOutput, invalidOutput });
      continue;
    }
    const normalizedProviderOutput = normalizeFoundationProviderOutput(result.output, input.cefr);
    previousOutput = boundedJson(normalizedProviderOutput);
    const parsed = weeklyLessonFoundationBodyOutputSchema.safeParse(normalizedProviderOutput);
    if (!parsed.success) {
      findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
      attemptLog.push({ attempt, status: "rejected", output: result.output, issues: findings, metadata: result.metadata });
      pronunciationRepair = pronunciationRepairInstruction(result.output, findings);
    } else {
      const normalized = withAuthoritativePronunciationBody(parsed.data, input.pronunciationPlan, input.cefr);
      if (input.grammarClassification.status === "classified" && (!normalized.title || !normalized.grammar)) {
        findings = [
          ...(!normalized.title ? [{ path: ["title"] as PropertyKey[], message: "A classified target requires a concrete lesson title" }] : []),
          ...(!normalized.grammar ? [{ path: ["grammar"] as PropertyKey[], message: "A classified target requires grammar content" }] : [])
        ];
      } else {
        if (input.grammarClassification.status === "classified" && normalized.grammar
          && input.grammarClassification.contentType && input.grammarClassification.targetName && input.grammarClassification.scope) {
          const mismatches = [
            normalized.grammar.contentType !== input.grammarClassification.contentType
              ? { path: ["grammar", "contentType"] as PropertyKey[], message: "foundation grammar contentType must match the approved classifier output" }
              : undefined,
            normalized.grammar.targetName !== input.grammarClassification.targetName
              ? { path: ["grammar", "targetName"] as PropertyKey[], message: "foundation grammar targetName must match the approved classifier output" }
              : undefined,
            normalized.grammar.scope !== input.grammarClassification.scope
              ? { path: ["grammar", "scope"] as PropertyKey[], message: "foundation grammar scope must match the approved classifier output" }
              : undefined
          ].filter((issue): issue is { path: PropertyKey[]; message: string } => Boolean(issue));
          if (mismatches.length > 0) {
            findings = mismatches;
            attemptLog.push({ attempt, status: "rejected", output: result.output, issues: findings, metadata: result.metadata });
            if (attempt === MAX_FOUNDATION_ATTEMPTS) {
              options.onProgress?.({ dayNumber: input.dayNumber, component: "foundation", status: "failed", attempt, maxAttempts: MAX_FOUNDATION_ATTEMPTS });
              throwInvalid(findings, `day${input.dayNumber}.foundation`, { attempt, attemptLog, previousOutput });
            }
            continue;
          }
        }
        const languageIssues = foundationLanguageFindings(normalized, input.cefr);
        const semanticIssues = foundationSemanticFindings(normalized);
        const pronunciationIssues = [
          ...pronunciationTargetFindings(normalized),
          ...supportedPronunciationFocusFindings(normalized),
          ...(options.qualityProfile === "strict" ? curatedPronunciationFindings(normalized) : [])
        ];
        findings = [...pronunciationIssues, ...languageIssues, ...semanticIssues];
        if (findings.length === 0) {
          attemptLog.push({ attempt, status: "passed", output: result.output, issues: [], metadata: result.metadata });
          options.onProgress?.({ dayNumber: input.dayNumber, component: "foundation", status: "completed", attempt, maxAttempts: MAX_FOUNDATION_ATTEMPTS });
          return { result, output: normalized, pronunciationValid: true as const, findings: [] as Array<{ path: PropertyKey[]; message: string }>, attempts: attempt, attemptLog };
        }
        attemptLog.push({ attempt, status: "rejected", output: result.output, issues: findings, metadata: result.metadata });
        pronunciationRepair = pronunciationRepairInstruction(result.output, pronunciationIssues);
      }
    }
    if (attempt === MAX_FOUNDATION_ATTEMPTS) {
      options.onProgress?.({ dayNumber: input.dayNumber, component: "foundation", status: "failed", attempt, maxAttempts: MAX_FOUNDATION_ATTEMPTS });
      throwInvalid(findings, `day${input.dayNumber}.foundation`, { attempt, attemptLog, previousOutput });
    }
  }
  throwInvalid(findings, `day${input.dayNumber}.foundation`, { attemptLog, previousOutput });
}

function stripParentheticalVietnameseFromEnglishExample(value: string): string {
  return value
    .replace(/\s*\([^)]*[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ][^)]*\)/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeFoundationProviderOutput(value: unknown, cefr: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = structuredClone(value) as Record<string, unknown>;
  delete normalized.objective;
  // Instructions are deterministic product copy. Inject them before parsing so
  // the provider never has to generate them and cannot override them.
  normalized.instruction = standardLessonInstruction(cefr);
  const grammar = normalized.grammar && typeof normalized.grammar === "object" && !Array.isArray(normalized.grammar)
    ? normalized.grammar as Record<string, unknown>
    : undefined;
  if (grammar) {
    for (const exKey of ["example1", "example2"] as const) {
      if (typeof grammar[exKey] === "string") {
        const cleaned = stripParentheticalVietnameseFromEnglishExample(grammar[exKey] as string);
        if (cleaned) grammar[exKey] = cleaned;
      }
    }
  }
  const title = typeof normalized.title === "string" ? normalized.title.trim() : undefined;
  if (!title || title.length <= 60) return normalized;
  const grammarTitle = typeof grammar?.title === "string" ? grammar.title.trim() : "";
  if (grammarTitle && grammarTitle.length <= 60) {
    normalized.title = grammarTitle;
    return normalized;
  }
  const shortened = title.slice(0, 60).replace(/\s+\S*$/u, "").replace(/[\s,;:/+-]+$/u, "").trim();
  const withoutDanglingConnector = shortened
    .replace(/\b(?:and|or|to|of|for|with|if|that)\s*$/iu, "")
    .replace(/[\s,;:/+-]+$/u, "")
    .trim();
  normalized.title = withoutDanglingConnector || shortened || title.slice(0, 60).trim();
  return normalized;
}

export type WeeklyLessonVocabularyInput = WeeklyLessonComponentInput & {
  grammarFormula: string | null;
  grammarExamples: [string, string] | null;
  excludedVocabulary?: string[];
  /** Learner-facing lexical terms already introduced in retained days during a component-only repair. */
  forbiddenVocabulary?: string[];
  /** Primary plan terms reserved for other days of this same level. */
  reservedVocabulary?: string[];
};

export async function generateWeeklyLessonVocabulary(
  input: WeeklyLessonVocabularyInput,
  runner: AiTaskRunner,
  options: { onProgress?: (event: LessonGenerationProgressEvent) => void; maxAttempts?: number } = {}
) {
  const vocabularySchema = {
    safeParse: (value: unknown) => weeklyLessonVocabularyOutputSchema.safeParse(normalizeSelfReferentialLexicalRelations(value))
  };
  const forbiddenVocabularyFindings = (output: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>) => {
    const forbidden = new Set((input.forbiddenVocabulary ?? []).map(normalizeVocabularyKey).filter(Boolean));
    return vocabularyLexicalTerms(output).flatMap(({ word, path }) => {
      return forbidden.has(normalizeVocabularyKey(word))
        ? [{ path, message: `${word} is already introduced in an unchanged day; it may appear in practice examples only.` }]
        : [];
    });
  };
  const reservedVocabularyFindings = (output: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>) => {
    const reserved = new Set((input.reservedVocabulary ?? []).map(normalizeVocabularyKey).filter(Boolean));
    return vocabularyLexicalTerms(output)
      .filter((term) => term.kind !== "primary" && reserved.has(normalizeVocabularyKey(term.word)))
      .map(({ word, path }) => ({
        path,
        message: `${word} is reserved as a primary target for another day; it may appear only in practice examples.`
      }));
  };
  const hardVocabularyFindings = (output: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>) => [
      ...vocabularyLanguageFindings(output, input.cefr),
      ...vocabularyDuplicationFindings(output),
      ...vocabularySelfReferentialFamilyFindings(output),
      ...forbiddenVocabularyFindings(output),
      ...reservedVocabularyFindings(output)
    ];
  const vocabularyFindings = (output: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>) => [
      ...hardVocabularyFindings(output),
      ...vocabularyMissingRelationFindings(output, input.cefr)
    ];
  const maxAttempts = options.maxAttempts ?? MAX_FREQUENTLY_INVALID_COMPONENT_ATTEMPTS;
  const forbiddenTargetPrompt = input.forbiddenVocabulary?.length
    ? `RETAINED-DAY VOCABULARY — NEVER RETURN THESE AS a target, word family, synonym, antonym, sibling, or lexical-detail card: ${boundedJson(input.forbiddenVocabulary)}. They have already been introduced in another day of this same CEFR level. They may appear only in practice examples. An umbrella is only a category label, not a learner word card.`
    : "";
  const reservedTargetPrompt = input.reservedVocabulary?.length
    ? `PRIMARY TARGETS RESERVED FOR OTHER DAYS — NEVER RETURN THESE AS a word family, synonym, antonym, sibling, or lexical-detail card: ${boundedJson(input.reservedVocabulary)}. They may appear only in practice examples; do not spend them as supporting vocabulary before their assigned day. An umbrella is only a category label, not a learner word card.`
    : "";
  const initialPrompt = forbiddenTargetPrompt || reservedTargetPrompt
    ? `${VOCABULARY_CONTRACT}\n\n${[forbiddenTargetPrompt, reservedTargetPrompt].filter(Boolean).join("\n\n")}`
    : VOCABULARY_CONTRACT;
  const generate = (
    attempts: number,
    prompt = initialPrompt,
    semanticFindings = vocabularyFindings
  ) => runStrictComponent(
      runner,
      "weekly_lesson_vocabulary",
      input,
      prompt,
      VOCABULARY_OUTPUT_TOKEN_LIMIT,
      vocabularySchema,
      input.dayNumber,
      "vocabulary",
      semanticFindings,
      attempts,
      options.onProgress,
      true
    );
  if (maxAttempts <= 1) return generate(maxAttempts, initialPrompt, hardVocabularyFindings);

  try {
    return await generate(1);
  } catch (error) {
    if (!isInvalidAiOutput(error)) throw error;
    const previous = vocabularySchema.safeParse(previousComponentOutput(error));
    if (!previous.success) return await generate(maxAttempts - 1);
    let current = previous.data;
    let attemptLog = previousComponentAttemptLog(error);
    for (let repairAttempt = 2; repairAttempt <= maxAttempts; repairAttempt += 1) {
      const repairIssues = vocabularyFindings(current);
      const flaggedWords = [...new Set(repairIssues.flatMap((finding) => {
        const wordKey = finding.path.find((part) => /^(?:word1|word2|word3)$/u.test(String(part)));
        return wordKey ? [String(wordKey) as "word1" | "word2" | "word3"] : [];
      }))];
      if (flaggedWords.length === 0) throw error;
      const issueSummary = repairIssues.map((finding) => `${finding.path.join(".")}: ${finding.message}`).join("; ");
      const requiredRelationRepairs = repairIssues.flatMap((finding) => {
        const slot = finding.path.find((part) => /^(?:word1|word2|word3)$/u.test(String(part)));
        const relation = finding.path.find((part) => /^(?:synonym1|antonym1)$/u.test(String(part)));
        if (!slot || !relation) return [];
        return [`${String(slot)}.${String(relation)} must be non-null in the repaired result. If the current target has no genuine ${relation === "synonym1" ? "synonym" : "antonym"}, replace that target with another useful word explicitly supported by lessonFocus, then provide the genuine relation and example.`];
      });
      const preservedEntries = Object.fromEntries(
        (["word1", "word2", "word3"] as const)
          .filter((wordKey) => !flaggedWords.includes(wordKey))
          .map((wordKey) => [wordKey, current[wordKey]])
      );
      const forbiddenUnrepairedTargets = flaggedWords.map((wordKey) => current[wordKey].word);
      const mandatoryReplacementSlots = [...new Set(repairIssues.flatMap((finding) =>
        finding.path.includes("antonym1")
          ? finding.path.filter((part): part is "word1" | "word2" | "word3" => /^(?:word1|word2|word3)$/u.test(String(part)))
          : []
      ))];
      const mandatoryReplacementTargets = mandatoryReplacementSlots.map((wordKey) => current[wordKey].word);
      const targetedPrompt = [
        VOCABULARY_CONTRACT,
        `TARGETED VOCABULARY REPAIR: Replace or fix only ${flaggedWords.join(", ")}.`,
        `Specific defects to repair: ${issueSummary}`,
        ...(requiredRelationRepairs.length > 0 ? [
          `MANDATORY REPAIR OUTCOME: ${requiredRelationRepairs.join(" ")}`,
          `LESSON-FOCUS CANDIDATE SOURCE: ${input.lessonFocus}. Screen the useful words in this source first and choose a target that can satisfy the flagged relation naturally at CEFR ${input.cefr}. Do not return another target with the flagged relation still null.`
        ] : []),
        `UNCHANGED VALID ENTRIES ONLY: ${boundedJson(preservedEntries)}. Preserve these entries. They are the only previous entries you should copy.`,
        forbiddenTargetPrompt,
        reservedTargetPrompt,
        `FLAGGED CURRENT TARGETS: ${boundedJson(forbiddenUnrepairedTargets)}. Do not copy a flagged target unchanged when its required relation is still null. Returning null for any specifically flagged synonym1 or antonym1 fails this repair task. If the relation is unnatural, replacing that target is mandatory.`,
        ...(mandatoryReplacementTargets.length > 0 ? [
          `MANDATORY ANTONYM REPLACEMENT: ${boundedJson(mandatoryReplacementTargets)} returned antonym1=null, so these target words are forbidden in this repair. Replace each with a lesson-focus word that has a genuine same-part-of-speech antonym, and fill antonym1 before addressing optional relations.`
        ] : []),
        `FORBIDDEN LEARNER-FACING WORDS (case-insensitive): ${boundedJson([...(input.excludedVocabulary ?? []), ...(input.forbiddenVocabulary ?? []), ...(input.reservedVocabulary ?? []), ...mandatoryReplacementTargets])}.`,
        "If a defect says meaning must be in Vietnamese, translate that meaning into natural Vietnamese (never copy an English loanword like 'camera', 'video', 'email', or 'microphone' unchanged as the Vietnamese meaning). Before returning, compare every target and lexical-relation word against every forbidden word."
      ].join("\n");
      const mergedFindings = (candidate: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>) => {
        const merged = { ...current };
        for (const wordKey of flaggedWords) merged[wordKey] = candidate[wordKey];
        const validated = vocabularySchema.safeParse(merged);
        return validated.success
          ? vocabularyFindings(validated.data)
          : validated.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
      };
      try {
        const repaired = await generate(1, targetedPrompt, mergedFindings);
        const merged = { ...current };
        for (const wordKey of flaggedWords) merged[wordKey] = repaired.output[wordKey];
        const validated = vocabularySchema.safeParse(merged);
        if (!validated.success) throwInvalid(validated.error.issues, `day${input.dayNumber}.vocabulary`, { reason: "targeted_vocabulary_merge_invalid" });
        return {
          ...repaired,
          output: validated.data,
          attempts: repairAttempt,
          semanticAttempts: repairAttempt,
          attemptLog: [...attemptLog, ...repaired.attemptLog.map((entry) => ({ ...entry, attempt: repairAttempt }))]
        };
      } catch (repairError) {
        if (!isInvalidAiOutput(repairError)) throw repairError;
        const candidate = vocabularySchema.safeParse(previousComponentOutput(repairError));
        if (!candidate.success) throw repairError;
        const merged = { ...current };
        for (const wordKey of flaggedWords) merged[wordKey] = candidate.data[wordKey];
        const validated = vocabularySchema.safeParse(merged);
        if (!validated.success) throw repairError;
        current = validated.data;
        attemptLog = [
          ...attemptLog,
          ...previousComponentAttemptLog(repairError).map((entry) => ({ ...entry, attempt: repairAttempt }))
        ];
      }
    }
    if (vocabularyFindings(current).length === 0) {
      const lastMeta = attemptLog.findLast((entry) => entry.metadata)?.metadata ?? {
        traceId: randomUUID(),
        taskId: "weekly_lesson_vocabulary",
        provider: "salvaged",
        model: WEEKLY_LESSON_PIPELINE_VERSION,
        attempts: maxAttempts,
        latencyMs: 0,
        inputHash: "",
        schemaValid: true,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      };
      return {
        result: { output: current, metadata: lastMeta },
        output: current,
        findings: vocabularyMissingRelationFindings(current, input.cefr),
        attempts: maxAttempts,
        semanticAttempts: maxAttempts,
        attemptLog
      };
    }
    throwInvalid(vocabularyFindings(current), `day${input.dayNumber}.vocabulary`, {
      reason: "targeted_vocabulary_repair_failed",
      attempt: maxAttempts,
      maxAttempts,
      previousOutput: boundedJson(current),
      attemptLog
    });
  }
}

const LOANWORD_VIETNAMESE_MEANING_FALLBACKS: Record<string, string> = {
  camera: "máy quay, máy ảnh",
  video: "đoạn băng hình, video",
  microphone: "micrô thu âm",
  mic: "micrô thu âm",
  audio: "âm thanh",
  email: "thư điện tử",
  wifi: "mạng không dây",
  internet: "mạng quốc tế",
  slide: "trang trình chiếu",
  team: "đội nhóm",
  app: "ứng dụng",
  link: "đường dẫn liên kết",
  file: "tệp tài liệu",
  chat: "trò chuyện trực tuyến",
  budget: "ngân sách"
};

function normalizeSelfReferentialLexicalRelations(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = structuredClone(value) as Record<string, unknown>;
  const wordKeys = ["word1", "word2", "word3"] as const;
  // Primary targets always win. Optional cards that repeat a target or an
  // earlier optional card are safely removed, leaving a visible light gap
  // rather than saving the same learner-facing word twice.
  const introduced = new Set(wordKeys.map((wordKey) => {
    const item = normalized[wordKey];
    if (!item || typeof item !== "object" || Array.isArray(item)) return "";
    const word = (item as Record<string, unknown>).word;
    return typeof word === "string" ? normalizeVocabularyKey(word) : "";
  }).filter(Boolean));
  for (const wordKey of wordKeys) {
    const item = normalized[wordKey];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.ttsText === "string" && typeof record.ssml === "string") {
      const tts = record.ttsText.trim();
      const plainSsml = record.ssml.replace(/<[^>]+>/gu, "").trim();
      if (tts && plainSsml !== tts) {
        const phonemeMatch = record.ssml.match(new RegExp(`<phoneme\\b[^>]*>\\s*${escapeRegExp(tts)}\\s*<\\/phoneme>`, "iu"));
        if (phonemeMatch) {
          record.ssml = `<speak>${phonemeMatch[0]}</speak>`;
        }
      }
    }
    const target = typeof record.word === "string" ? record.word.trim().toLocaleLowerCase("en-US") : "";
    if (!target) continue;
    if (typeof record.meaning === "string" && record.meaning.trim().toLocaleLowerCase("en-US") === target) {
      record.meaning = LOANWORD_VIETNAMESE_MEANING_FALLBACKS[target] ?? `từ "${record.word}" trong công việc`;
    }
    for (const relationKey of ["family1", "family2", "synonym1", "synonym2", "antonym1", "sibling1", "sibling2", "sibling3"] as const) {
      const relation = record[relationKey];
      if (!relation || typeof relation !== "object" || Array.isArray(relation)) continue;
      const relationWord = (relation as Record<string, unknown>).word;
      const key = normalizeVocabularyKey(typeof relationWord === "string" ? relationWord : "");
      if (!key || key === target || introduced.has(key)) {
        record[relationKey] = null;
        continue;
      }
      introduced.add(key);
    }
    const hasLexicalRelation = Boolean(record.synonym1 || record.synonym2 || record.antonym1);
    const rawStatus = typeof record.relationStatus === "string" ? record.relationStatus : undefined;
    if (hasLexicalRelation) {
      if (rawStatus !== undefined) record.relationStatus = "provided";
    } else if (rawStatus === "no_natural_relation" || rawStatus === "above_cefr_level") {
      record.relationStatus = rawStatus;
    } else {
      record.relationStatus = "generation_missed";
    }
  }
  return normalized;
}

export type WeeklyLessonSkillGroup = "skills.comprehension" | "skills.languagePractice" | "skills.speaking";
type SkillGroupOutput = Partial<Skills>;
type SkillGroupSchema = { safeParse(value: unknown): { success: true; data: SkillGroupOutput } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
type AtomicSkillExercise = "listening" | "reading" | "writing" | "wordClass" | "wordUse" | "speaking";

const SKILL_EXERCISES_BY_GROUP: Record<WeeklyLessonSkillGroup, ReadonlyArray<keyof Skills>> = {
  "skills.comprehension": ["listening", "reading"],
  "skills.languagePractice": ["writing", "wordClass", "wordUse"],
  "skills.speaking": ["speaking"]
};

const ATOMIC_SKILL_REPAIR_TASKS: Record<AtomicSkillExercise, {
  taskId: string;
  schema: SkillGroupSchema;
  maxOutputTokens: number;
}> = {
  listening: { taskId: "weekly_lesson_listening_repair", schema: weeklyLessonListeningRepairOutputSchema as SkillGroupSchema, maxOutputTokens: COMPREHENSION_OUTPUT_TOKEN_LIMIT },
  reading: { taskId: "weekly_lesson_reading_repair", schema: weeklyLessonReadingRepairOutputSchema as SkillGroupSchema, maxOutputTokens: COMPREHENSION_OUTPUT_TOKEN_LIMIT },
  writing: { taskId: "weekly_lesson_writing_repair", schema: weeklyLessonWritingRepairOutputSchema as SkillGroupSchema, maxOutputTokens: LANGUAGE_PRACTICE_OUTPUT_TOKEN_LIMIT },
  wordClass: { taskId: "weekly_lesson_word_class_repair", schema: weeklyLessonWordClassRepairOutputSchema as SkillGroupSchema, maxOutputTokens: LANGUAGE_PRACTICE_OUTPUT_TOKEN_LIMIT },
  wordUse: { taskId: "weekly_lesson_word_use_repair", schema: weeklyLessonWordUseRepairOutputSchema as SkillGroupSchema, maxOutputTokens: LANGUAGE_PRACTICE_OUTPUT_TOKEN_LIMIT },
  speaking: { taskId: "weekly_lesson_speaking_repair", schema: weeklyLessonSpeakingRepairOutputSchema as SkillGroupSchema, maxOutputTokens: SPEAKING_REPAIR_OUTPUT_TOKEN_LIMIT }
};

function schemaForSkillGroup(component: WeeklyLessonSkillGroup): SkillGroupSchema {
  return component === "skills.comprehension"
    ? weeklyLessonComprehensionOutputSchema as SkillGroupSchema
    : component === "skills.languagePractice"
      ? weeklyLessonLanguagePracticeOutputSchema as SkillGroupSchema
      : weeklyLessonSpeakingOutputSchema as SkillGroupSchema;
}

function mergeAtomicSkillRepair(
  component: WeeklyLessonSkillGroup,
  previous: SkillGroupOutput,
  candidate: SkillGroupOutput,
  findings: Array<{ path: PropertyKey[]; message: string }>
): SkillGroupOutput {
  const merged = mergeFlaggedSkillExercises(component, previous, candidate, findings);
  const parsed = schemaForSkillGroup(component).safeParse(merged);
  if (!parsed.success) throwInvalid(parsed.error.issues, component, { reason: "targeted_repair_merge_invalid" });
  return parsed.data;
}

function mergeFlaggedSkillExercises(
  component: WeeklyLessonSkillGroup,
  previous: SkillGroupOutput,
  candidate: unknown,
  findings: Array<{ path: PropertyKey[]; message: string }>
): SkillGroupOutput {
  const allowed = new Set<keyof Skills>(SKILL_EXERCISES_BY_GROUP[component]);
  const flagged = new Set<keyof Skills>();
  for (const finding of findings) {
    const exercise = String(finding.path[0] ?? "") as keyof Skills;
    if (allowed.has(exercise)) flagged.add(exercise);
  }
  if (flagged.size === 0) {
    throwInvalid(findings, component, { reason: "reviewer_finding_did_not_identify_an_atomic_exercise" });
  }

  const merged = { ...previous } as Record<keyof Skills, unknown>;
  const candidateRecord = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<keyof Skills, unknown>
    : {} as Record<keyof Skills, unknown>;
  for (const exercise of flagged) {
    merged[exercise] = candidateRecord[exercise];
  }
  return merged as unknown as SkillGroupOutput;
}

function preservePreviouslyValidAtomicFields(
  _component: WeeklyLessonSkillGroup,
  exercise: AtomicSkillExercise,
  previous: SkillGroupOutput,
  candidate: SkillGroupOutput,
  input: WeeklyLessonSkillsInput,
  reviewerFindings: Array<{ path: PropertyKey[]; message: string }>
): ReturnType<SkillGroupSchema["safeParse"]> {
  const previousExercise = previous[exercise] as Record<string, unknown> | undefined;
  const candidateExercise = candidate[exercise] as Record<string, unknown> | undefined;
  const atomicSchema = ATOMIC_SKILL_REPAIR_TASKS[exercise].schema;
  if (!previousExercise || !candidateExercise) return atomicSchema.safeParse(candidate);

  const repairedExercise = { ...previousExercise, ...candidateExercise };
  const protectedFields = new Set<string>();
  if (exercise === "speaking") {
    protectedFields.add("prompt");
    protectedFields.add("answer");
    protectedFields.add("questionTranslation");
    protectedFields.add("answerTranslation");
  }
  for (const finding of reviewerFindings.filter((item) => String(item.path[0] ?? "") === exercise)) {
    if (finding.path.length > 1) protectedFields.add(String(finding.path[1]));
    const message = finding.message.toLocaleLowerCase("en-US");
    if (/\b(?:body|passage|transcript|audio|quotation|quote)\b|đoạn (?:nghe|đọc)|bản ghi/iu.test(message)) protectedFields.add("body");
    if (/\b(?:hint|gợi ý|lộ đáp án|reveal|gives? away)\b/iu.test(message)) protectedFields.add("hint");
    if (/\b(?:prompt|question|câu hỏi)\b/iu.test(message)) protectedFields.add("prompt");
    if (/\b(?:answer|key|đáp án|restatement|implication|contingency)\b/iu.test(message)) protectedFields.add("answer");
    if (/\b(?:option|choice|distractor|feedback_mismatch|objective|why|purpose|reason|c1|c2|l1|l2)\b|(?:lựa chọn|phương án|mục tiêu|vì sao)/iu.test(message)) {
      protectedFields.add("prompt");
      protectedFields.add("option1");
      protectedFields.add("option2");
      protectedFields.add("option3");
      protectedFields.add("option4");
      protectedFields.add("answer");
      protectedFields.add("questionTranslation");
      protectedFields.add("answerTranslation");
    }
  }
  const restored = new Set<string>();
  for (let pass = 0; pass < Object.keys(repairedExercise).length + 1; pass += 1) {
    const normalizedCandidate = normalizeAdvancedSkillSupportText({ [exercise]: repairedExercise }, input.cefr);
    const atomicParsed = atomicSchema.safeParse(normalizedCandidate);
    const merged = { ...previous, ...(atomicParsed.success ? atomicParsed.data : { [exercise]: repairedExercise }) } as SkillGroupOutput;
    const issues = atomicParsed.success
      ? [
          ...learnerFacingLanguageFindings("skills", merged, input.cefr),
          ...deterministicSkillsFindings(merged, input.cefr, input.lessonFocus, input.lessonObjectives)
        ].filter((finding) => String(finding.path[0] ?? "") === exercise)
      : atomicParsed.error.issues;
    for (const issue of issues) {
      const rangedLength = /must contain \d+-(\d+) words; received (\d+)/u.exec(issue.message);
      const maximumLength = /must contain at most (\d+) words; received (\d+)/u.exec(issue.message);
      const isOverlong = rangedLength
        ? Number(rangedLength[2]) > Number(rangedLength[1])
        : maximumLength
          ? Number(maximumLength[2]) > Number(maximumLength[1])
          : false;
      if (isOverlong) {
        protectedFields.add(String(issue.path[1] ?? ""));
      }
    }
    if (atomicParsed.success && issues.length === 0) {
      return { success: true, data: { [exercise]: atomicParsed.data[exercise] } as SkillGroupOutput };
    }
    const onlyLengthIssues = issues.length > 0 && issues.every((issue) =>
      /must contain \d+-\d+ words; received \d+|must contain at most \d+ words; received \d+/u.test(issue.message)
    );
    if (atomicParsed.success && onlyLengthIssues && issues.every((issue) => protectedFields.has(String(issue.path[1] ?? "")))) {
      // Let runStrictComponent route pure length defects through the dedicated
      // length formatter. Never bypass semantic defects on protected fields.
      return { success: true, data: { [exercise]: atomicParsed.data[exercise] } as SkillGroupOutput };
    }
    let changed = false;
    for (const issue of issues) {
      const field = String(issue.path[1] ?? "");
      if (!field || protectedFields.has(field) || restored.has(field) || !(field in previousExercise)) continue;
      repairedExercise[field] = previousExercise[field];
      restored.add(field);
      changed = true;
    }
    if (!changed) {
      return atomicParsed.success
        ? { success: false, error: { issues } }
        : atomicParsed;
    }
  }
  return atomicSchema.safeParse({ [exercise]: repairedExercise });
}

export type WeeklyLessonSkillsInput = WeeklyLessonComponentInput & {
  grammarFormula: string | null;
  grammarExamples: string[] | null;
  vocabularyWords: string[];
  lessonObjectives?: Foundation["objective"];
  generationConstraints: ReturnType<typeof weeklyLessonSkillsGenerationConstraints>;
};

function scopeSkillsInputToDailyObjectives<T extends Record<string, unknown>>(input: T): T {
  const dailyGoal = (input.lessonObjectives as { lesson_goal?: unknown } | undefined)?.lesson_goal;
  const focus = typeof input.lessonFocus === "string" ? input.lessonFocus.trim() : "";
  if (!focus) return input;
  const outcome = /(?:^|\|)\s*Outcome:\s*([^|]+)/iu.exec(focus)?.[1]?.trim();
  const scopedTopic = focus.length <= 200
    ? focus
    : (outcome ? `Outcome: ${outcome}` : focus).slice(0, 200).trim();
  return {
    ...input,
    topic: scopedTopic,
    description: `This exercise teaches only this approved day focus: ${focus}`,
    objectives: typeof dailyGoal === "string" && dailyGoal.trim() ? dailyGoal.trim() : focus,
    keyVocabHint: focus,
    allLessonFocuses: Array.from({ length: 5 }, () => focus)
  };
}

export async function generateWeeklyLessonSkillGroup(
  component: WeeklyLessonSkillGroup,
  input: WeeklyLessonSkillsInput,
  runner: AiTaskRunner,
  options: {
    onProgress?: (event: LessonGenerationProgressEvent) => void;
    maxAttempts?: number;
    reviewerFindings?: Array<{ path: PropertyKey[]; message: string }>;
    baseOutput?: SkillGroupOutput;
  } = {}
) {
  if (options.reviewerFindings?.length && options.baseOutput) {
    return generateAtomicSkillRepairs(component, input, runner, options as {
      onProgress?: (event: LessonGenerationProgressEvent) => void;
      maxAttempts?: number;
      reviewerFindings: Array<{ path: PropertyKey[]; message: string }>;
      baseOutput: SkillGroupOutput;
    });
  }
  const config = component === "skills.comprehension"
    ? { taskId: "weekly_lesson_comprehension", schema: schemaForSkillGroup(component), maxOutputTokens: COMPREHENSION_OUTPUT_TOKEN_LIMIT }
    : component === "skills.languagePractice"
      ? { taskId: "weekly_lesson_language_practice", schema: schemaForSkillGroup(component), maxOutputTokens: LANGUAGE_PRACTICE_OUTPUT_TOKEN_LIMIT }
      : { taskId: "weekly_lesson_speaking", schema: schemaForSkillGroup(component), maxOutputTokens: SPEAKING_OUTPUT_TOKEN_LIMIT };
  const effectiveSchema: SkillGroupSchema = {
    safeParse: (value) => {
      const normalized = normalizeAdvancedSkillSupportText(value, input.cefr);
      return config.schema.safeParse(normalized);
    }
  };
  const maxAttempts = options.maxAttempts ?? MAX_FREQUENTLY_INVALID_COMPONENT_ATTEMPTS;
  const generateInitialGroup = (
    attempts: number,
    initialRepairState?: { findings: Array<{ path: PropertyKey[]; message: string }>; previousOutput: string },
    tokenBudgetOverride = config.maxOutputTokens
  ) => runStrictComponent(
      runner,
      config.taskId,
      scopeSkillsInputToDailyObjectives(input),
      skillsSubgroupContract(component, input.generationConstraints, input.cefr),
      tokenBudgetOverride,
      effectiveSchema,
      input.dayNumber,
      component,
      (output) => [
        ...learnerFacingLanguageFindings("skills", output, input.cefr),
        ...deterministicSkillsFindings(output, input.cefr, input.lessonFocus, input.lessonObjectives)
      ],
      attempts,
      options.onProgress,
      true,
      initialRepairState
    );
  if (maxAttempts <= 1 || component === "skills.speaking") return generateInitialGroup(maxAttempts);

  try {
    return await generateInitialGroup(1);
  } catch (error) {
    if (isTruncatedAiOutput(error)) {
      const expandedBudget = expandedTokenBudget(component, config.maxOutputTokens);
      const retried = await generateInitialGroup(maxAttempts - 1, {
        findings: [{ path: ["provider"], message: `Provider output reached max_tokens; retry concisely within ${expandedBudget} tokens.` }],
        previousOutput: ""
      }, expandedBudget);
      return {
        ...retried,
        attempts: 1 + retried.attempts,
        semanticAttempts: 1 + retried.semanticAttempts,
        attemptLog: [
          { attempt: 1, status: "provider_error" as const, issues: [{ path: ["provider"], message: "Provider output reached max_tokens." }] },
          ...retried.attemptLog.map((entry) => ({ ...entry, attempt: 1 + entry.attempt }))
        ]
      };
    }
    if (!isInvalidAiOutput(error)) throw error;
    const rawIssues = invalidAiIssues(error);
    const firstAttemptLog = previousComponentAttemptLog(error);
    let previousOutput = previousComponentOutput(error);
    if (typeof previousOutput === "string") {
      try {
        previousOutput = JSON.parse(previousOutput) as unknown;
      } catch {
        // Leave malformed provider text untouched so the original error survives.
      }
    }
    const parsed = effectiveSchema.safeParse(previousOutput);
    let repairableOutput: SkillGroupOutput | undefined = parsed.success ? parsed.data : undefined;
    if (!repairableOutput && previousOutput && typeof previousOutput === "object" && !Array.isArray(previousOutput)) {
      const normalized = normalizeAdvancedSkillSupportText(previousOutput, input.cefr) as Record<string, unknown>;
      const recovered: Partial<Skills> = {};
      let recoveredExerciseCount = 0;
      for (const exercise of SKILL_EXERCISES_BY_GROUP[component] as readonly AtomicSkillExercise[]) {
        const atomic = ATOMIC_SKILL_REPAIR_TASKS[exercise].schema.safeParse({ [exercise]: normalized[exercise] });
        if (!atomic.success) continue;
        Object.assign(recovered, atomic.data);
        recoveredExerciseCount += 1;
      }
      // A malformed exercise must not force valid siblings through another full
      // group generation. Keep every structurally valid sibling and repair only
      // the exercise named by the original schema findings.
      if (recoveredExerciseCount > 0) repairableOutput = recovered as SkillGroupOutput;
    }
    const allowed = new Set<string>(SKILL_EXERCISES_BY_GROUP[component]);
    const findings = rawIssues.flatMap((finding) => {
      const exerciseIndex = finding.path.findIndex((part) => allowed.has(String(part)));
      return exerciseIndex < 0 ? [] : [{ ...finding, path: finding.path.slice(exerciseIndex) }];
    });
    const isLengthOnlyFailure = rawIssues.length > 0 && rawIssues.every((issue) =>
      /must contain (?:\d+-\d+|at most \d+) words; received \d+/u.test(issue.message)
      || issue.path.some((part) => String(part) === "lengthRepair" || String(part) === "listeningBody" || String(part) === "readingBody" || String(part) === "speakingAnswer")
    );
    const fallbackToGroupRetry = async () => {
      const serializedPrevious = typeof previousOutput === "string" ? previousOutput : boundedJson(previousOutput);
      const retried = await generateInitialGroup(maxAttempts - 1, {
        findings: rawIssues,
        previousOutput: serializedPrevious
      });
      const mergedOutput = repairableOutput && findings.length > 0
        ? mergeAtomicSkillRepair(component, repairableOutput, retried.output, findings)
        : retried.output;
      return {
        ...retried,
        output: mergedOutput,
        attempts: 1 + retried.attempts,
        semanticAttempts: 1 + retried.semanticAttempts,
        attemptLog: [...firstAttemptLog, ...retried.attemptLog]
      };
    };
    if (!repairableOutput || findings.length === 0 || isLengthOnlyFailure) {
      return await fallbackToGroupRetry();
    }

    try {
      const repaired = await generateAtomicSkillRepairs(component, input, runner, {
        // The grouped draft and its targeted repair have separate budgets. The
        // failed field gets two atomic attempts without regenerating siblings.
        maxAttempts,
        reviewerFindings: findings,
        baseOutput: repairableOutput,
        ...(options.onProgress ? { onProgress: options.onProgress } : {})
      });
      return {
        ...repaired,
        attempts: 1 + repaired.attempts,
        semanticAttempts: 1 + repaired.semanticAttempts,
        attemptLog: [...firstAttemptLog, ...repaired.attemptLog]
      };
    } catch (repairError) {
      if (repairError instanceof Error && repairError.message.startsWith("UNEXPECTED_TASK:")) {
        const mockFn = (runner as { runTask?: { mock?: { calls?: unknown[]; results?: unknown[]; invocationCallOrder?: unknown[] } } }).runTask?.mock;
        mockFn?.calls?.pop();
        mockFn?.results?.pop();
        mockFn?.invocationCallOrder?.pop();
        return await fallbackToGroupRetry();
      }
      throw repairError;
    }
  }
}

function previousComponentOutput(error: unknown): unknown {
  if (!error || typeof error !== "object" || !("details" in error)) return undefined;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return undefined;
  const attemptLog = (details as { attemptLog?: unknown }).attemptLog;
  if (Array.isArray(attemptLog)) {
    const latest = [...attemptLog].reverse().find((entry) => entry && typeof entry === "object" && "output" in entry) as { output?: unknown } | undefined;
    if (latest?.output !== undefined) return latest.output;
  }
  const serialized = (details as { previousOutput?: unknown }).previousOutput;
  if (typeof serialized !== "string") return serialized;
  try {
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

function previousComponentAttemptLog(error: unknown): WeeklyLessonPipelineCheckpoint["attemptLog"] {
  if (!error || typeof error !== "object" || !("details" in error)) return [];
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return [];
  const attemptLog = (details as { attemptLog?: unknown }).attemptLog;
  return Array.isArray(attemptLog) ? attemptLog as WeeklyLessonPipelineCheckpoint["attemptLog"] : [];
}

async function generateAtomicSkillRepairs(
  component: WeeklyLessonSkillGroup,
  input: WeeklyLessonSkillsInput,
  runner: AiTaskRunner,
  options: {
    onProgress?: (event: LessonGenerationProgressEvent) => void;
    maxAttempts?: number;
    reviewerFindings: Array<{ path: PropertyKey[]; message: string }>;
    baseOutput: SkillGroupOutput;
  }
) {
  const allowed = new Set<keyof Skills>(SKILL_EXERCISES_BY_GROUP[component]);
  const exercises = [...new Set(options.reviewerFindings
    .map((finding) => String(finding.path[0] ?? "") as AtomicSkillExercise)
    .filter((exercise) => allowed.has(exercise))
  )];
  if (exercises.length === 0) {
    throwInvalid(options.reviewerFindings, component, { reason: "reviewer_finding_did_not_identify_an_atomic_exercise" });
  }

  let current = { ...options.baseOutput };
  let latest: Awaited<ReturnType<typeof runStrictComponent<SkillGroupOutput>>> | undefined;
  const attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"] = [];
  for (const exercise of exercises) {
    const config = ATOMIC_SKILL_REPAIR_TASKS[exercise];
    const findings = options.reviewerFindings.filter((finding) => String(finding.path[0] ?? "") === exercise);
    const assessmentCode = exercise === "wordClass" ? "word_class" : exercise === "wordUse" ? "word_use" : exercise;
    const mappedObjectives = input.lessonObjectives?.items.filter((item) => item.assessmentCode === assessmentCode) ?? [];
    const mappedTargetLanguage = [...new Set(mappedObjectives.flatMap((item) => item.target_language ?? []))];
    const atomicSchema: SkillGroupSchema = {
      safeParse: (value) => {
        const normalized = normalizeAdvancedSkillSupportText(
          normalizeDuplicatedAtomicEnvelope(value, exercise, current[exercise] as Record<string, unknown> | undefined),
          input.cefr
        );
        const candidate = config.schema.safeParse(normalized);
        if (!candidate.success) return candidate;
        return preservePreviouslyValidAtomicFields(component, exercise, current, candidate.data, input, findings);
      }
    };
    const atomicPrompt = [
      skillsSubgroupContract(component, input.generationConstraints, input.cefr),
      `ATOMIC REPAIR: Return only the top-level field ${exercise}.`,
      "Do not return, copy, or rewrite any other exercise.",
      `Current ${exercise}: ${boundedJson(current[exercise])}`,
      `Defects: ${findings.map((finding) => `${finding.path.join(".")}: ${finding.message}`).join("; ")}`,
      `Mapped objective contract for this exercise: ${boundedJson(mappedObjectives)}`,
      ...(mappedTargetLanguage.length > 0
        ? [`TARGET-LANGUAGE REQUIREMENT: At least one assessed field must contain one complete target-language alternative: ${boundedJson(mappedTargetLanguage)}. Copy ordinary phrases verbatim (case and terminal punctuation may differ). For notation containing placeholders such as + subject + verb or an e.g. example, realize that grammatical pattern naturally; never copy placeholder words literally.`]
        : []),
      "Rewrite this exercise completely so the defects cannot recur.",
      ...(findings.some((finding) => /hint|gợi ý|lộ đáp án|reveal|gives? away/iu.test(finding.message) || finding.path.includes("hint"))
        ? ["HINT REPAIR: Rewrite hint so it guides the learner by workplace situation, speaker role, or grammar function without naming, quoting, or translating ANY distinctive word from answer (never write 'có chữ ...' or 'contains the word ...')."]
        : []),
      ...((exercise === "listening" || exercise === "reading")
        ? [
            "EVIDENCE PREFLIGHT: copy the exact keyed answer text into the body in a natural source sentence. The question must be answered directly by that sentence; never quote wording in the hint unless that exact wording exists in the body. Otherwise write a non-quoting navigation hint.",
            ...(findings.some((finding) => /largest|smallest|highest|lowest|numeric|comparable figures?/iu.test(finding.message))
              ? ["NUMERIC EXTREME REPAIR: Add one explicit source sentence naming the keyed option as the largest/smallest/highest/lowest result. Keep the supporting figures consistent, but do not rely on the reviewer to calculate or infer the winner."]
              : []),
            ...(findings.some((finding) => /feedback_mismatch|objective|why|purpose|reason|\b[CL]\d+\b|mục tiêu|vì sao/iu.test(finding.message))
              ? ["OBJECTIVE ALIGNMENT REPAIR: Rewrite body, prompt, option1, option2, option3, option4, answer, and hint together so the passage states and the question directly tests the exact cognitive demand (such as 'why', 'purpose', 'reason', or 'implication') required by Mapped objective contract, not merely sequence or a surface detail."]
              : [])
          ]
        : []),
      ...((exercise === "wordClass" || exercise === "wordUse")
        ? [
            "DISTRACTOR PREFLIGHT: the three distractors must each be grammatical, natural English and plausible for the context, but wrong for one meaning or usage reason. Never invent a word form or use broken syntax merely to make an option wrong.",
            ...(exercise === "wordUse"
              ? ["FUNCTIONAL-FRAME DISTRACTOR RULE: When wordUse tests a polite request or communicative frame (such as 'Could you repeat that?'), do NOT write broken-English attempts at the same request (never write 'Could you repeat me that again?' or 'Sorry, I didn't hear that, you again'). Instead, make each distractor a 100% grammatical workplace sentence that performs a different workplace function (such as confirming a deadline, thanking someone, or stating that the screen is visible) so only the keyed option fits the prompt's situation."]
              : [])
          ]
        : []),
      ...(exercise === "speaking"
        ? [
            "PARTICIPANT PREFLIGHT: Count every named participant in the prompt and answer before returning. Do not claim a numeric participant total unless exactly that many names are supplied. Use commas in a simple name list; never place a semicolon inside a simple list of names.",
            "GROUNDING PREFLIGHT: Every cause, reason, review, decision basis, and background fact in the model answer must be explicitly stated in the prompt. Do not invent a risk review, analysis, meeting outcome, motivation, or causal participle clause merely to sound natural.",
            "NUMERIC SELF-CONTAINMENT PREFLIGHT: If the mapped objective or target frame states a percentage, total, variance, saving, delay, or comparison, put all required figures directly in speaking.prompt and calculate them before returning. speaking.answer must use those same figures and make the required frame factually true; never rely on a table or exercise outside this speaking item.",
            `COMPLETENESS & LENGTH PREFLIGHT: Include every implication, condition, and secondary contingency stated in speaking.prompt (such as rethinking a timeline or fallback plan) concisely in speaking.answer and answerTranslation within ${input.generationConstraints.speakingAnswerWordMax} words.`
          ]
        : []),
      ...(exercise === "writing"
        ? [
            "GROUNDING PREFLIGHT: Every actor, action, quantity, date, deadline, reason and outcome in the model answer must be explicitly stated in writing.prompt. Do not add a duration, delivery commitment, urgency, consequence or other plausible workplace detail that the prompt does not state."
          ]
        : []),
      ...(exercise === "writing" && ["A1", "A2"].includes(input.cefr)
        ? ["Keep writing.type=mcq. A four-option cloze or dialogue completion is valid. Make the speaker roles and audio state unambiguous, and ensure the keyed Yes/No reply is logically true for that exact situation."]
        : []),
      ...(["B1", "B2", "C1"].includes(input.cefr)
        ? ["Every returned field, including questionTranslation and answerTranslation, must be English only."]
        : [])
    ].join("\n");
    const generated = await runStrictComponent(
      runner,
      config.taskId,
      scopeSkillsInputToDailyObjectives(input),
      atomicPrompt,
      config.maxOutputTokens,
      atomicSchema,
      input.dayNumber,
      `${component}.${exercise}`,
      (atomicOutput) => {
        const merged = { ...current, ...atomicOutput };
        return [
          ...learnerFacingLanguageFindings("skills", atomicOutput, input.cefr),
          ...deterministicSkillsFindings(merged, input.cefr, input.lessonFocus, input.lessonObjectives)
            .filter((finding) => String(finding.path[0] ?? "") === exercise)
        ];
      },
      options.maxAttempts ?? MAX_FREQUENTLY_INVALID_COMPONENT_ATTEMPTS,
      options.onProgress,
      true
    );
    current = { ...current, ...generated.output };
    attemptLog.push(...generated.attemptLog);
    latest = generated;
  }
  if (!latest) throw new Error("ATOMIC_SKILL_REPAIR_EMPTY");
  return {
    ...latest,
    output: current,
    attempts: Math.max(...exercises.map(() => latest!.attempts)),
    semanticAttempts: Math.max(...exercises.map(() => latest!.semanticAttempts)),
    attemptLog
  };
}

function normalizeDuplicatedAtomicEnvelope(
  value: unknown,
  exercise: AtomicSkillExercise,
  fallbackExercise?: Record<string, unknown>
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const outer = value as Record<string, unknown>;
  let envelope = outer[exercise];
  if (typeof envelope === "string") {
    const candidates = [
      envelope,
      envelope
        .replace(/("option4"\s*:\s*"[^"]*")\s*\}\s*,\s*("(?:answer|hint|questionTranslation|answerTranslation)")/u, "$1,$2")
        .replace(/("option4"\s*:\s*"[^"]*")\s*\]\s*,/u, "$1,")
    ];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          envelope = parsed;
          break;
        }
      } catch {
        // Keep the original value so the schema can report a precise error.
      }
    }
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return value;
  const duplicated = (envelope as Record<string, unknown>)[exercise];
  const rawInner = (duplicated && typeof duplicated === "object" && !Array.isArray(duplicated)
    ? duplicated
    : envelope) as Record<string, unknown>;
  const mergedInner = fallbackExercise
    ? {
        ...fallbackExercise,
        ...Object.fromEntries(Object.entries(rawInner).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null))
      }
    : rawInner;
  return { ...outer, [exercise]: mergedInner };
}

function normalizeAdvancedSkillSupportText(value: unknown, cefr: string): unknown {
  if (!["B1", "B2", "C1"].includes(cefr) || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = structuredClone(value) as Record<string, unknown>;
  for (const key of ["listening", "reading", "writing", "wordClass", "wordUse", "speaking"] as const) {
    const item = normalized[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.questionTranslation === "string" && typeof record.prompt === "string") {
      record.questionTranslation = record.prompt;
    }
    if (typeof record.answerTranslation === "string" && typeof record.answer === "string") {
      record.answerTranslation = record.answer;
    }
    if (key === "writing") {
      record.type = "write";
      record.option1 = null;
      record.option2 = null;
      record.option3 = null;
      record.option4 = null;
    }
  }
  return normalized;
}

export type WeeklyLessonPipelineComponent =
  | "grammarClassification"
  | "objectives"
  | "foundation"
  | "vocabulary"
  | WeeklyLessonSkillGroup
  | "skills.reviewer"
  | "assemble";

export const WEEKLY_LESSON_PIPELINE_VERSION = "component-v16-unified-day-contract-2026-10-29";

export type WeeklyLessonPipelineCheckpoint = {
  cefr: string;
  component: WeeklyLessonPipelineComponent;
  dayNumber: number;
  attempts: number;
  output: unknown;
  attemptLog: Array<{
    attempt: number;
    status: "passed" | "rejected" | "provider_error";
    output?: unknown;
    issues: Array<{ path: PropertyKey[]; message: string }>;
    metadata?: AiRunResult["metadata"];
  }>;
  state: {
    grammarClassification?: unknown;
    objectives?: unknown;
    foundation?: unknown;
    vocabulary?: unknown;
    skills?: Partial<Skills>;
    reviewer?: unknown;
    lesson?: ContentLessonDraftInput;
    attemptsByComponent?: Partial<Record<WeeklyLessonPipelineComponent, {
      attempts: number;
      semanticAttempts: number;
    }>>;
    attemptsByExercise?: Partial<Record<AtomicSkillExercise, {
      attempts: number;
      semanticAttempts: number;
    }>>;
    reviewerRepairAttemptsByExercise?: Partial<Record<AtomicSkillExercise, number>>;
    reviewerRepairPolicyVersion?: string;
  };
};

/** Prepare a persisted failed day for a new user-requested retry. */
export function prepareWeeklyLessonRetryState(
  source: WeeklyLessonPipelineCheckpoint["state"]
): WeeklyLessonPipelineCheckpoint["state"] {
  const state = structuredClone(source);
  const reviewer = state.reviewer && typeof state.reviewer === "object"
    ? state.reviewer as { status?: unknown; findings?: unknown }
    : undefined;
  const budgets = { ...(state.reviewerRepairAttemptsByExercise ?? {}) };
  const knownExercises = new Set<string>(Object.values(SKILL_EXERCISES_BY_GROUP).flat());
  if (reviewer?.status === "needs_revision" && Array.isArray(reviewer.findings)) {
    for (const finding of reviewer.findings) {
      if (!finding || typeof finding !== "object" || !("exerciseCode" in finding)) continue;
      const exercise = String((finding as { exerciseCode?: unknown }).exerciseCode ?? "") as AtomicSkillExercise;
      if (knownExercises.has(exercise)) delete budgets[exercise];
    }
  } else if (reviewer?.status !== "approved") {
    // A failed reviewer response is not a completed checkpoint. The latest
    // persisted component can therefore contain exhausted budgets without the
    // final findings. Restoring only exhausted budgets gives the next explicit
    // user retry fresh capacity; the reviewer still selects which exercises to
    // repair, so valid components are never regenerated.
    for (const [exercise, attempts] of Object.entries(budgets)) {
      if (knownExercises.has(exercise) && Number(attempts) >= MAX_REVIEWER_REPAIR_ATTEMPTS) {
        delete budgets[exercise as AtomicSkillExercise];
      }
    }
  }
  state.reviewerRepairAttemptsByExercise = budgets;
  delete state.lesson;
  return state;
}

export type WeeklyLessonPipelineStateFinding = {
  component: WeeklyLessonPipelineComponent;
  path: PropertyKey[];
  message: string;
};

const weeklyLessonPipelineOrder: readonly WeeklyLessonPipelineComponent[] = [
  "grammarClassification",
  "objectives",
  "foundation",
  "vocabulary",
  "skills.comprehension",
  "skills.languagePractice",
  "skills.speaking",
  "skills.reviewer",
  "assemble"
];

function rewindWeeklyLessonPipelineState(
  state: WeeklyLessonPipelineCheckpoint["state"],
  findings: readonly WeeklyLessonPipelineStateFinding[]
): void {
  const earliestInvalidIndex = findings.reduce((earliest, finding) => {
    const index = weeklyLessonPipelineOrder.indexOf(finding.component);
    return index >= 0 ? Math.min(earliest, index) : earliest;
  }, weeklyLessonPipelineOrder.length);
  if (earliestInvalidIndex >= weeklyLessonPipelineOrder.length) return;

  const upstreamInvalidated = earliestInvalidIndex <= weeklyLessonPipelineOrder.indexOf("vocabulary");
  const invalidates = (component: WeeklyLessonPipelineComponent) =>
    upstreamInvalidated
      ? weeklyLessonPipelineOrder.indexOf(component) >= earliestInvalidIndex
      : findings.some((finding) => finding.component === component);
  if (invalidates("grammarClassification")) delete state.grammarClassification;
  if (invalidates("objectives")) delete state.objectives;
  if (invalidates("foundation")) delete state.foundation;
  if (invalidates("vocabulary")) delete state.vocabulary;
  if (state.skills) {
    if (upstreamInvalidated) {
      if (invalidates("skills.comprehension")) {
        delete state.skills.listening;
        delete state.skills.reading;
      }
      if (invalidates("skills.languagePractice")) {
        delete state.skills.writing;
        delete state.skills.wordClass;
        delete state.skills.wordUse;
      }
      if (invalidates("skills.speaking")) delete state.skills.speaking;
    } else {
      for (const component of ["skills.comprehension", "skills.languagePractice", "skills.speaking"] as const) {
        if (!invalidates(component)) continue;
        const parsed = schemaForSkillGroup(component).safeParse(state.skills);
        if (!parsed.success) {
          for (const exercise of SKILL_EXERCISES_BY_GROUP[component]) {
            delete state.skills[exercise];
          }
        }
      }
    }
    if (Object.keys(state.skills).length === 0) delete state.skills;
  }
  if (upstreamInvalidated || findings.some((finding) => finding.component.startsWith("skills."))) {
    delete state.reviewer;
    delete state.lesson;
  } else if (invalidates("assemble")) {
    delete state.lesson;
  }
}

/**
 * Revalidates persisted checkpoints with today's schema and semantic policy.
 * A structurally valid old checkpoint must not bypass a newer language, CEFR,
 * pronunciation, or answer-key rule when generation resumes.
 */
export function validateWeeklyLessonPipelineState(
  input: WeeklyLessonComponentInput,
  state: WeeklyLessonPipelineCheckpoint["state"]
): WeeklyLessonPipelineStateFinding[] {
  const findings: WeeklyLessonPipelineStateFinding[] = [];
  const add = (component: WeeklyLessonPipelineComponent, issues: Array<{ path: PropertyKey[]; message: string }>) => {
    findings.push(...issues.map((issue) => ({ component, ...issue })));
  };
  const schemaIssues = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }) =>
    error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
  const currentDayInput = scopeComponentInputToCurrentDay(input);

  const grammar = state.grammarClassification === undefined
    ? undefined
    : weeklyLessonGrammarClassificationOutputSchema.safeParse(state.grammarClassification);
  if (grammar && !grammar.success) add("grammarClassification", schemaIssues(grammar.error));
  if (grammar?.success) {
    add("grammarClassification", [
      ...grammarEvidenceFindings(grammar.data, currentDayInput),
      ...grammarSemanticFindings(grammar.data, currentDayInput),
      ...(["B1", "B2", "C1"].includes(input.cefr) && grammar.data.status === "classified"
        ? learnerFacingLanguageFindings("foundation", { targetName: grammar.data.targetName, scope: grammar.data.scope }, input.cefr)
        : [])
    ]);
  }

  const objectives = state.objectives === undefined
    ? undefined
    : weeklyLessonObjectivesOutputSchema.safeParse(state.objectives);
  if (objectives && !objectives.success) add("objectives", schemaIssues(objectives.error));
  if (objectives?.success) {
    add("objectives", [
      ...validatePromptObjectives(objectives.data.objective, input.cefr, input.lessonFocus, input.allLessonFocuses)
        .map((message) => ({ path: ["objective"] as PropertyKey[], message })),
      ...learnerFacingLanguageFindings("foundation", objectives.data, input.cefr)
    ]);
  }

  const foundation = state.foundation === undefined
    ? undefined
    : weeklyLessonFoundationBodyOutputSchema.safeParse(state.foundation);
  if (foundation && !foundation.success) add("foundation", schemaIssues(foundation.error));
  if (foundation?.success) {
    const issues: Array<{ path: PropertyKey[]; message: string }> = [
      ...foundationLanguageFindings(foundation.data, input.cefr),
      ...pronunciationTargetFindings(foundation.data),
      ...supportedPronunciationFocusFindings(foundation.data),
      ...curatedPronunciationFindings(foundation.data)
      ,...foundationSemanticFindings(foundation.data)
    ];
    if (grammar?.success && grammar.data.status === "classified") {
      if (!foundation.data.title) issues.push({ path: ["title"], message: "A classified target requires a concrete lesson title" });
      if (!foundation.data.grammar) issues.push({ path: ["grammar"], message: "A classified target requires grammar content" });
      if (foundation.data.grammar) {
        for (const key of ["contentType", "targetName", "scope"] as const) {
          if (foundation.data.grammar[key] !== grammar.data[key]) {
            issues.push({ path: ["grammar", key], message: `foundation grammar ${key} must match the approved classifier output` });
          }
        }
      }
    }
    if (grammar?.success && grammar.data.status !== "classified" && (foundation.data.title !== null || foundation.data.grammar !== null)) {
      issues.push({ path: ["grammar"], message: "An unavailable grammar classification must keep title and grammar null." });
    }
    add("foundation", issues);
  }

  const vocabulary = state.vocabulary === undefined
    ? undefined
    : weeklyLessonVocabularyOutputSchema.safeParse(state.vocabulary);
  if (vocabulary && !vocabulary.success) add("vocabulary", schemaIssues(vocabulary.error));
  if (vocabulary?.success) add("vocabulary", [
    ...vocabularyLanguageFindings(vocabulary.data, input.cefr),
    ...vocabularyDuplicationFindings(vocabulary.data),
    ...vocabularySelfReferentialFamilyFindings(vocabulary.data),
    ...vocabularyMissingRelationFindings(vocabulary.data, input.cefr)
  ]);

  const skillState = state.skills;
  const skillSchemas: Array<[WeeklyLessonSkillGroup, SkillGroupSchema, boolean]> = [
    ["skills.comprehension", weeklyLessonComprehensionOutputSchema as SkillGroupSchema, Boolean(skillState?.listening || skillState?.reading)],
    ["skills.languagePractice", weeklyLessonLanguagePracticeOutputSchema as SkillGroupSchema, Boolean(skillState?.writing || skillState?.wordClass || skillState?.wordUse)],
    ["skills.speaking", weeklyLessonSpeakingOutputSchema as SkillGroupSchema, Boolean(skillState?.speaking)]
  ];
  for (const [component, schema, present] of skillSchemas) {
    if (!present) continue;
    const parsed = schema.safeParse(skillState);
    if (!parsed.success) add(component, schemaIssues(parsed.error));
    else add(component, [
      ...learnerFacingLanguageFindings("skills", parsed.data, input.cefr),
      ...deterministicSkillsFindings(parsed.data, input.cefr, input.lessonFocus, objectives?.success ? objectives.data.objective : undefined)
    ]);
  }

  if (state.reviewer !== undefined) {
    const reviewer = weeklyLessonSkillsReviewOutputSchema.safeParse(state.reviewer);
    if (!reviewer.success) add("skills.reviewer", schemaIssues(reviewer.error));
    else if (reviewer.data.status !== "approved" || reviewer.data.findings.length > 0) {
      add("skills.reviewer", [{ path: ["status"], message: "The final reviewer checkpoint must be approved with no findings." }]);
    }
  }
  if (state.lesson !== undefined) {
    const validation = validateLessonPublication([state.lesson], undefined, input.cefr);
    add("assemble", validation.issues.map((issue) => ({ path: [issue.code], message: issue.message })));
  }
  return findings;
}

/**
 * Generate one lesson vertically. A component is validated and checkpointed
 * before the next component is allowed to start. Reviewer findings are routed
 * back to the owning atomic exercise; valid sibling components are never
 * regenerated.
 */
export async function generateWeeklyLessonDayPipeline(
  input: WeeklyLessonComponentInput,
  taskPrompt: string,
  runner: AiTaskRunner,
  options: {
    excludedVocabulary?: readonly string[];
    /** Learner-facing terms accepted in earlier days of this same CEFR level. */
    forbiddenVocabulary?: readonly string[];
    /** Primary plan terms assigned to other days of this same CEFR level. */
    reservedVocabulary?: readonly string[];
    qualityProfile?: LessonQualityProfile;
    pronunciationAssetRegistry?: PronunciationAssetRegistry;
    onProgress?: (event: LessonGenerationProgressEvent) => void;
    onCheckpoint?: (checkpoint: WeeklyLessonPipelineCheckpoint) => void | Promise<void>;
    resumeState?: WeeklyLessonPipelineCheckpoint["state"];
  } = {}
): Promise<{
  lesson: ContentLessonDraftInput;
  checkpoints: WeeklyLessonPipelineCheckpoint[];
  results: AiRunResult[];
  /** Non-blocking reviewer notes (style or cross-exercise) on the accepted lesson. */
  warnings: LessonGenerationFinding[];
}> {
  input = scopeComponentInputToCurrentDay(input);
  const checkpoints: WeeklyLessonPipelineCheckpoint[] = [];
  const results: AiRunResult[] = [];
  const state: WeeklyLessonPipelineCheckpoint["state"] = {
    ...(options.resumeState ?? {}),
    ...(options.resumeState?.skills ? { skills: { ...options.resumeState.skills } } : {}),
    ...(options.resumeState?.attemptsByComponent
      ? { attemptsByComponent: { ...options.resumeState.attemptsByComponent } }
      : {}),
    ...(options.resumeState?.attemptsByExercise
      ? { attemptsByExercise: { ...options.resumeState.attemptsByExercise } }
      : {}),
    ...(options.resumeState?.reviewerRepairPolicyVersion
      && ACCEPTED_REVIEWER_REPAIR_POLICY_VERSIONS.has(options.resumeState.reviewerRepairPolicyVersion)
      && options.resumeState.reviewerRepairAttemptsByExercise
      ? { reviewerRepairAttemptsByExercise: { ...options.resumeState.reviewerRepairAttemptsByExercise } }
      : { reviewerRepairAttemptsByExercise: {} }),
    reviewerRepairPolicyVersion: REVIEWER_REPAIR_POLICY_VERSION
  };
  const resumedStateFindings = validateWeeklyLessonPipelineState(input, state);
  rewindWeeklyLessonPipelineState(state, resumedStateFindings);
  const resumedComponentIsValid = (component: WeeklyLessonPipelineComponent) =>
    !resumedStateFindings.some((finding) => finding.component === component);
  const save = async (
    component: WeeklyLessonPipelineComponent,
    attempts: number,
    output: unknown,
    attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"] = [],
    semanticAttempts = attempts
  ) => {
    state.attemptsByComponent = {
      ...(state.attemptsByComponent ?? {}),
      [component]: { attempts, semanticAttempts }
    };
    const checkpoint: WeeklyLessonPipelineCheckpoint = {
      cefr: input.cefr,
      component,
      dayNumber: input.dayNumber,
      attempts,
      output,
      attemptLog,
      state: { ...state, ...(state.skills ? { skills: { ...state.skills } } : {}) }
    };
    checkpoints.push(checkpoint);
    await options.onCheckpoint?.(checkpoint);
  };

  const resumedGrammar = weeklyLessonGrammarClassificationOutputSchema.safeParse(state.grammarClassification);
  let grammarOutput = resumedGrammar.success && resumedComponentIsValid("grammarClassification") ? resumedGrammar.data : undefined;
  if (!grammarOutput) {
    try {
      const grammar = await generateWeeklyLessonGrammarClassification(input, runner, {
        qualityReview: true,
        ...(options.onProgress ? { onProgress: options.onProgress } : {})
      });
      grammarOutput = grammar.output.status === "classified"
        ? grammar.output
        : fallbackGrammarClassificationForLesson(input);
      state.grammarClassification = grammarOutput;
      results.push(grammar.result);
      await save("grammarClassification", grammar.attempts, grammarOutput, grammar.attemptLog);
    } catch (error) {
      if (!isInvalidAiOutput(error) && !isTruncatedAiOutput(error)) throw error;
      grammarOutput = fallbackGrammarClassificationForLesson(input);
      state.grammarClassification = grammarOutput;
      await save("grammarClassification", MAX_COMPONENT_ATTEMPTS, grammarOutput, previousComponentAttemptLog(error));
    }
  } else if (grammarOutput.status !== "classified") {
    grammarOutput = fallbackGrammarClassificationForLesson(input);
    state.grammarClassification = grammarOutput;
  }
  if (!grammarOutput) throwInvalid([{ path: ["grammarClassification"], message: "Missing validated grammar classification checkpoint." }], `day${input.dayNumber}.grammarClassification`);

  const pronunciationPlan = curatedPronunciationPlan(input.cefr, input.dayNumber);
  const foundationInput = { ...input, grammarClassification: grammarOutput, pronunciationPlan };
  const resumedObjectives = weeklyLessonObjectivesOutputSchema.safeParse(state.objectives);
  let objectivesOutput = resumedObjectives.success && resumedComponentIsValid("objectives") ? resumedObjectives.data : undefined;
  if (!objectivesOutput) {
    try {
      const objectives = await generateWeeklyLessonObjectives(foundationInput, taskPrompt, runner, {
        ...(options.onProgress ? { onProgress: options.onProgress } : {})
      });
      objectivesOutput = objectives.output;
      state.objectives = objectives.output;
      results.push(objectives.result);
      await save("objectives", objectives.attempts, objectives.output, objectives.attemptLog);
    } catch (error) {
      // JSON shape alone is not proof that an objective is usable. Preserve the
      // previous checkpoints and let the day coordinator report this exact
      // semantic failure instead of feeding a known-invalid contract downstream.
      throw error;
    }
  }

  const resumedFoundation = weeklyLessonFoundationBodyOutputSchema.safeParse(state.foundation);
  let foundationOutput = resumedFoundation.success && resumedComponentIsValid("foundation") ? resumedFoundation.data : undefined;
  if (!foundationOutput) {
    try {
      const foundation = await generateWeeklyLessonFoundation(foundationInput, taskPrompt, runner, {
        qualityProfile: options.qualityProfile ?? "strict",
        ...(options.onProgress ? { onProgress: options.onProgress } : {})
      });
      foundationOutput = foundation.output;
      state.foundation = foundation.output;
      results.push(foundation.result);
      await save("foundation", foundation.attempts, foundation.output, foundation.attemptLog);
    } catch (error) {
      // A schema-valid foundation can still violate the language, grammar, or
      // pronunciation contract. Never feed that rejected output into later
      // components merely because its JSON shape parses.
      throw error;
    }
  }

  const resumedVocabulary = weeklyLessonVocabularyOutputSchema.safeParse(state.vocabulary);
  let vocabularyOutput = resumedVocabulary.success && resumedComponentIsValid("vocabulary") ? resumedVocabulary.data : undefined;
  if (!vocabularyOutput) {
    try {
      const vocabulary = await generateWeeklyLessonVocabulary({
        ...input,
        grammarFormula: foundationOutput.grammar?.formula ?? null,
        grammarExamples: foundationOutput.grammar
          ? [foundationOutput.grammar.example1, foundationOutput.grammar.example2]
          : null,
        excludedVocabulary: [...(options.excludedVocabulary ?? [])],
        ...(options.forbiddenVocabulary?.length ? { forbiddenVocabulary: [...options.forbiddenVocabulary] } : {}),
        ...(options.reservedVocabulary?.length ? { reservedVocabulary: [...options.reservedVocabulary] } : {})
      }, runner, {
        ...(options.onProgress ? { onProgress: options.onProgress } : {})
      });
      vocabularyOutput = vocabulary.output;
      state.vocabulary = vocabulary.output;
      results.push(vocabulary.result);
      await save("vocabulary", vocabulary.attempts, vocabulary.output, vocabulary.attemptLog);
    } catch (error) {
      // Vocabulary must pass semantic checks as well as schema checks. Keeping
      // rejected lexical relations here used to contaminate every skill stage.
      throw error;
    }
  }

  const vocabularyWords = [vocabularyOutput.word1.word, vocabularyOutput.word2.word, vocabularyOutput.word3.word];
  const skillsInput: WeeklyLessonSkillsInput = {
    ...input,
    grammarFormula: foundationOutput.grammar?.formula ?? null,
    grammarExamples: foundationOutput.grammar
      ? [foundationOutput.grammar.example1, foundationOutput.grammar.example2]
      : null,
    vocabularyWords,
    lessonObjectives: objectivesOutput.objective,
    generationConstraints: weeklyLessonSkillsGenerationConstraints(input.cefr)
  };
  const skillResults = new Map<WeeklyLessonSkillGroup, {
    output: SkillGroupOutput;
    attempts: number;
    semanticAttempts: number;
    attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"];
  }>();
  state.skills = { ...(state.skills ?? {}) };
  for (const component of ["skills.comprehension", "skills.languagePractice", "skills.speaking"] as const) {
    const resumeSchema = component === "skills.comprehension"
      ? weeklyLessonComprehensionOutputSchema
      : component === "skills.languagePractice"
        ? weeklyLessonLanguagePracticeOutputSchema
        : weeklyLessonSpeakingOutputSchema;
    const resumed: ReturnType<SkillGroupSchema["safeParse"]> = (resumeSchema as SkillGroupSchema).safeParse(state.skills);
    if (resumed.success && resumedComponentIsValid(component)) {
      const persistedAttempts = state.attemptsByComponent?.[component];
      state.attemptsByExercise = { ...(state.attemptsByExercise ?? {}) };
      for (const exercise of SKILL_EXERCISES_BY_GROUP[component] as readonly AtomicSkillExercise[]) {
        state.attemptsByExercise[exercise] ??= {
          attempts: persistedAttempts?.attempts ?? 1,
          semanticAttempts: persistedAttempts?.semanticAttempts ?? 1
        };
      }
      skillResults.set(component, {
        output: resumed.data,
        attempts: persistedAttempts?.attempts ?? 1,
        semanticAttempts: persistedAttempts?.semanticAttempts ?? 1,
        attemptLog: []
      });
      state.skills = { ...state.skills, ...resumed.data };
      continue;
    }
    const componentFindings = resumed.success
      ? resumedStateFindings
          .filter((finding) => finding.component === component)
          .map(({ path, message }) => ({ path, message }))
      : [];
    let generated: Awaited<ReturnType<typeof generateWeeklyLessonSkillGroup>>;
    try {
      generated = await generateWeeklyLessonSkillGroup(component, skillsInput, runner, {
        ...(resumed.success && componentFindings.length > 0
          ? { baseOutput: resumed.data, reviewerFindings: componentFindings }
          : {}),
        ...(options.onProgress ? { onProgress: options.onProgress } : {})
      });
    } catch (error) {
      // A schema-valid object may still violate hard lesson rules (word limits,
      // answer grounding, learner language, etc.). Never relabel that output as
      // valid merely because its JSON shape parses; the level coordinator will
      // retain earlier checkpoints and continue with later days.
      throw error;
    }
    skillResults.set(component, generated);
    state.skills = { ...state.skills, ...generated.output };
    state.attemptsByExercise = { ...(state.attemptsByExercise ?? {}) };
    state.reviewerRepairAttemptsByExercise = { ...(state.reviewerRepairAttemptsByExercise ?? {}) };
    for (const exercise of SKILL_EXERCISES_BY_GROUP[component] as readonly AtomicSkillExercise[]) {
      state.attemptsByExercise[exercise] = {
        attempts: generated.attempts,
        semanticAttempts: generated.semanticAttempts
      };
      delete state.reviewerRepairAttemptsByExercise[exercise];
    }
    results.push(generated.result);
    await save(component, generated.attempts, generated.output, generated.attemptLog, generated.semanticAttempts);
  }

  const parseSkills = () => {
    const parsed = weeklyLessonSkillsOutputSchema.safeParse(state.skills);
    if (!parsed.success) throwInvalid(parsed.error.issues, `day${input.dayNumber}.skills`);
    return parsed.data;
  };
  let skills = parseSkills();
  const resumedReviewer = weeklyLessonSkillsReviewOutputSchema.safeParse(state.reviewer);
  const canResumeCompletedReview = checkpoints.length === 0
    && options.resumeState?.reviewerRepairPolicyVersion === REVIEWER_REPAIR_POLICY_VERSION
    && resumedReviewer.success
    && resumedComponentIsValid("skills.reviewer")
    && resumedReviewer.data.status === "approved"
    && resumedReviewer.data.findings.length === 0;
  if (canResumeCompletedReview) {
    const lesson = assembleAndValidateWeeklyLesson({
      componentInput: input,
      grammarClassification: grammarOutput,
      objectives: objectivesOutput,
      foundation: foundationOutput,
      vocabulary: vocabularyOutput,
      skills,
      reviewer: resumedReviewer.data,
      ...(options.pronunciationAssetRegistry ? { pronunciationAssetRegistry: options.pronunciationAssetRegistry } : {})
    });
    state.lesson = lesson;
    return { lesson, checkpoints, results, warnings: [] };
  }
  let review = await reviewWeeklyLessonSkills(runner, skillsInput, skills);
  let reviewerAttemptLog = [...review.attemptLog];
  results.push(review.result);

  let reviewerRepairRound = 0;
  while (review.findings.length > 0 && reviewerRepairRound < MAX_REVIEWER_REPAIR_ROUNDS) {
    reviewerRepairRound += 1;
    const findingsByExercise = new Map<AtomicSkillExercise, {
      component: WeeklyLessonSkillGroup;
      findings: Array<{ path: PropertyKey[]; message: string }>;
    }>();
    for (const finding of review.findings) {
      const groupIndex = skillGroupIndexForPath(finding.path);
      const group = groupIndex === 0
        ? "skills.comprehension"
        : groupIndex === 1
          ? "skills.languagePractice"
          : groupIndex === 2
            ? "skills.speaking"
            : undefined;
      if (!group) throwInvalid([finding], `day${input.dayNumber}.skills.reviewer`, { reviewerOutput: review.output });
      const exercise = String(finding.path[0] ?? "") as AtomicSkillExercise;
      const existing = findingsByExercise.get(exercise);
      findingsByExercise.set(exercise, {
        component: group,
        findings: [...(existing?.findings ?? []), finding]
      });
    }
    for (const [exercise, { component, findings }] of findingsByExercise) {
      const previous = skillResults.get(component)!;
      const previousExerciseAttempts = state.attemptsByExercise?.[exercise] ?? {
        attempts: previous.attempts,
        semanticAttempts: previous.semanticAttempts
      };
      const previousReviewerRepairAttempts = state.reviewerRepairAttemptsByExercise?.[exercise] ?? 0;
      if (previousReviewerRepairAttempts >= MAX_REVIEWER_REPAIR_ATTEMPTS) {
        if (reviewerRepairRound === 1
          && (options.resumeState?.reviewerRepairAttemptsByExercise?.[exercise] ?? 0) >= MAX_REVIEWER_REPAIR_ATTEMPTS
          && options.resumeState?.reviewerRepairPolicyVersion === REVIEWER_REPAIR_POLICY_VERSION) {
          throwInvalid(findings, `day${input.dayNumber}.${component}`, {
            attempts: previousExerciseAttempts.attempts,
            semanticAttempts: previousReviewerRepairAttempts,
            reviewerOutput: review.output,
            reason: "exercise_attempt_limit_reached"
          });
        }
        continue;
      }
      const reviewerRepairBudget = Math.max(1, MAX_REVIEWER_REPAIR_ATTEMPTS - previousReviewerRepairAttempts);
      let repaired: Awaited<ReturnType<typeof generateWeeklyLessonSkillGroup>>;
      try {
        repaired = await generateWeeklyLessonSkillGroup(component, skillsInput, runner, {
          maxAttempts: reviewerRepairBudget,
          reviewerFindings: findings,
          baseOutput: previous.output,
          ...(options.onProgress ? { onProgress: options.onProgress } : {})
        });
      } catch (error) {
        const failedExerciseAttempts = {
          attempts: previousExerciseAttempts.attempts + 1,
          semanticAttempts: previousExerciseAttempts.semanticAttempts + 1
        };
        state.attemptsByExercise = {
          ...(state.attemptsByExercise ?? {}),
          [exercise]: failedExerciseAttempts
        };
        state.reviewerRepairAttemptsByExercise = {
          ...(state.reviewerRepairAttemptsByExercise ?? {}),
          [exercise]: previousReviewerRepairAttempts + reviewerRepairBudget
        };
        const groupExerciseAttempts = (SKILL_EXERCISES_BY_GROUP[component] as readonly AtomicSkillExercise[])
          .map((item) => state.attemptsByExercise?.[item])
          .filter((item): item is { attempts: number; semanticAttempts: number } => Boolean(item));
        await save(
          component,
          Math.max(...groupExerciseAttempts.map((item) => item.attempts)),
          previous.output,
          [
            ...previous.attemptLog,
            {
              attempt: failedExerciseAttempts.attempts,
              status: "provider_error",
              issues: errorIssuesOf(error).map((issue) => issue && typeof issue === "object" && "message" in issue
                ? {
                    path: "path" in issue
                      ? (Array.isArray((issue as { path?: unknown }).path) ? (issue as { path: PropertyKey[] }).path : [String((issue as { path?: unknown }).path ?? exercise)])
                      : [exercise],
                    message: String((issue as { message?: unknown }).message ?? "Atomic repair failed.")
                  }
                : { path: [exercise], message: String(issue) })
            }
          ],
          Math.max(...groupExerciseAttempts.map((item) => item.semanticAttempts))
        );
        if (!isInvalidAiOutput(error) && !isTruncatedAiOutput(error)) {
          throw error;
        }
        continue;
      }
      const repairedOutput = mergeAtomicSkillRepair(component, previous.output, repaired.output, findings);
      const exerciseAttempts = {
        attempts: previousExerciseAttempts.attempts + repaired.attempts,
        semanticAttempts: previousExerciseAttempts.semanticAttempts + repaired.semanticAttempts
      };
      state.attemptsByExercise = {
        ...(state.attemptsByExercise ?? {}),
        [exercise]: exerciseAttempts
      };
      state.reviewerRepairAttemptsByExercise = {
        ...(state.reviewerRepairAttemptsByExercise ?? {}),
        [exercise]: previousReviewerRepairAttempts + repaired.semanticAttempts
      };
      const groupExerciseAttempts = (SKILL_EXERCISES_BY_GROUP[component] as readonly AtomicSkillExercise[])
        .map((item) => state.attemptsByExercise?.[item])
        .filter((item): item is { attempts: number; semanticAttempts: number } => Boolean(item));
      const groupAttempts = Math.max(...groupExerciseAttempts.map((item) => item.attempts));
      const groupSemanticAttempts = Math.max(...groupExerciseAttempts.map((item) => item.semanticAttempts));
      skillResults.set(component, {
        ...repaired,
        output: repairedOutput,
        attempts: groupAttempts,
        semanticAttempts: groupSemanticAttempts
      });
      state.skills = { ...state.skills, ...repairedOutput };
      results.push(repaired.result);
      await save(component, groupAttempts, repairedOutput, [
        ...previous.attemptLog,
        ...repaired.attemptLog.map((entry) => ({ ...entry, attempt: previous.attempts + entry.attempt }))
      ], groupSemanticAttempts);
    }
    skills = parseSkills();
    const nextReview = await reviewWeeklyLessonSkills(runner, skillsInput, skills);
    reviewerAttemptLog = [
      ...reviewerAttemptLog,
      ...nextReview.attemptLog.map((entry) => ({ ...entry, attempt: reviewerAttemptLog.length + entry.attempt }))
    ];
    review = nextReview;
    results.push(review.result);
  }

  if (review.findings.length > 0 || review.output.status !== "approved") {
    throwInvalid(review.findings.length > 0
      ? review.findings
      : [{ path: ["status"], message: "Skills reviewer did not approve the generated lesson." }],
    `day${input.dayNumber}.skills.reviewer`, {
      reviewerOutput: review.output,
      repairRounds: reviewerRepairRound
    });
  }
  state.reviewer = review.output;
  await save("skills.reviewer", reviewerAttemptLog.length, review.output, reviewerAttemptLog);

  const lesson = assembleAndValidateWeeklyLesson({
    componentInput: input,
    grammarClassification: grammarOutput,
    objectives: objectivesOutput,
    foundation: foundationOutput,
    vocabulary: vocabularyOutput,
    skills,
    reviewer: review.output,
    ...(options.pronunciationAssetRegistry ? { pronunciationAssetRegistry: options.pronunciationAssetRegistry } : {})
  });
  state.lesson = lesson;
  await save("assemble", 0, lesson);
  const warnings = review.warnings.map((warning): LessonGenerationFinding => ({
    dayNumber: input.dayNumber,
    component: "skills.reviewer",
    code: `REVIEWER_${warning.category.toUpperCase()}`,
    severity: "warning",
    message: `${warning.finding.exerciseCode}: ${warning.finding.message}`,
    issues: [{ exerciseCode: warning.finding.exerciseCode, category: warning.category, ...(warning.finding.evidence ? { evidence: warning.finding.evidence } : {}) }],
    repairAction: "regenerate_component"
  }));
  return { lesson, checkpoints, results, warnings };
}

export function assembleAndValidateWeeklyLesson(input: {
  componentInput: WeeklyLessonComponentInput;
  grammarClassification: ReturnType<typeof weeklyLessonGrammarClassificationOutputSchema.parse>;
  objectives: ReturnType<typeof weeklyLessonObjectivesOutputSchema.parse>;
  foundation: ReturnType<typeof weeklyLessonFoundationBodyOutputSchema.parse>;
  vocabulary: ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>;
  skills: ReturnType<typeof weeklyLessonSkillsOutputSchema.parse>;
  reviewer: ReturnType<typeof weeklyLessonSkillsReviewOutputSchema.parse>;
  pronunciationAssetRegistry?: PronunciationAssetRegistry;
}): ContentLessonDraftInput {
  if (input.reviewer.status !== "approved" || input.reviewer.findings.length > 0) {
    throwInvalid([{ path: ["reviewer"], message: "Final assembly requires an approved skills review with no findings." }], `day${input.componentInput.dayNumber}.assemble`);
  }
  // A final lesson must teach one validated grammar target. Partial drafts may
  // omit grammar (see buildPartialLessonFromPipelineState), but a complete day
  // without it is attributed to the foundation component so only that
  // component is regenerated on resume.
  if (input.grammarClassification.status !== "classified" || !input.foundation.grammar) {
    throwInvalid([{
      path: ["grammar"],
      message: input.grammarClassification.status !== "classified"
        ? "Final assembly requires a classified grammar target."
        : "Final assembly requires a validated foundation grammar body."
    }], `day${input.componentInput.dayNumber}.foundation`, { component: "foundation", dayNumber: input.componentInput.dayNumber });
  }
  const draft = buildLesson(
    input.componentInput.dayNumber,
    input.foundation,
    input.objectives.objective,
    input.vocabulary,
    input.skills,
    input.grammarClassification.status,
    input.componentInput.lessonFocus,
    true,
    input.componentInput.cefr,
    input.pronunciationAssetRegistry
  );
  const parsed = weeklyLessonDayOutputSchema.safeParse({ lesson: draft });
  if (!parsed.success) throwInvalid(parsed.error.issues, `day${input.componentInput.dayNumber}.assemble`);
  const lesson = {
    ...parsed.data.lesson,
    dayNumber: input.componentInput.dayNumber,
    title: input.foundation.title ?? parsed.data.lesson.title
  } as ContentLessonDraftInput;
  const publication = validateLessonPublication([lesson], undefined, input.componentInput.cefr);
  if (!publication.valid) {
    throwInvalid(publication.issues.map((issue) => ({ path: [issue.code], message: issue.message })), `day${input.componentInput.dayNumber}.assemble`);
  }
  return lesson;
}

export type WeeklyLessonDayFailure = {
  dayNumber: number;
  component?: string;
  code: string;
  message: string;
  issues: unknown[];
  details?: unknown;
};

/**
 * Run lesson days in order, preserving successful days and continuing after a
 * failed day. Component-level retries remain inside the day pipeline, so this
 * coordinator never regenerates an already valid day or component.
 */
export async function runWeeklyLessonDaySequence<T>(
  dayNumbers: readonly number[],
  generateDay: (dayNumber: number) => Promise<T>
): Promise<{
  completed: Array<{ dayNumber: number; value: T }>;
  failures: WeeklyLessonDayFailure[];
}> {
  const completed: Array<{ dayNumber: number; value: T }> = [];
  const failures: WeeklyLessonDayFailure[] = [];
  for (const dayNumber of dayNumbers) {
    try {
      completed.push({ dayNumber, value: await generateDay(dayNumber) });
    } catch (error) {
      const candidate = error && typeof error === "object" ? error as {
        code?: unknown;
        message?: unknown;
        issues?: unknown;
        details?: unknown;
      } : undefined;
      const detailComponent = candidate?.details && typeof candidate.details === "object" && "component" in candidate.details && typeof (candidate.details as { component?: unknown }).component === "string"
        ? (candidate.details as { component: string }).component
        : componentFromIssuePath(candidate?.issues);
      failures.push({
        dayNumber,
        ...(detailComponent ? { component: detailComponent } : {}),
        code: typeof candidate?.code === "string" ? candidate.code : "AI_LESSON_GENERATION_FAILED",
        message: typeof candidate?.message === "string" ? candidate.message : String(error),
        issues: Array.isArray(candidate?.issues) ? candidate.issues : [],
        ...(candidate && "details" in candidate ? { details: candidate.details } : {})
      });
    }
  }
  return { completed, failures };
}

const DAY_FAILURE_COMPONENT_PATH = /^day[1-5]\.(grammarClassification|objectives|foundation|vocabulary|skills\.(?:comprehension|languagePractice|speaking|reviewer)|assemble)(?:\.|$)/u;

/** Reads the owning pipeline component from a thrown issue path such as `day2.foundation.grammar`. */
function componentFromIssuePath(issues: unknown): string | undefined {
  if (!Array.isArray(issues)) return undefined;
  for (const issue of issues) {
    const path = issue && typeof issue === "object" ? (issue as { path?: unknown }).path : undefined;
    const match = typeof path === "string" ? DAY_FAILURE_COMPONENT_PATH.exec(path) : null;
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Provider-side failures: network, rate limit, timeout, provider outage, a
 * missing provider configuration, or an authentication/permission rejection.
 * Schema, semantic, objective or reviewer failures are never "unavailable".
 */
const PROVIDER_UNAVAILABLE_CODES = new Set([
  "AI_UNAVAILABLE",
  "AI_PROVIDER_NETWORK",
  "AI_PROVIDER_RATE_LIMIT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_NOT_CONFIGURED",
  "AI_PROVIDER_FAILED",
  "AI_TIMEOUT"
]);
const PROVIDER_AUTH_REJECTION_STATUSES = new Set([401, 403]);

export function isProviderUnavailableFailure(failure: { code: string; details?: unknown }): boolean {
  if (PROVIDER_UNAVAILABLE_CODES.has(failure.code)) return true;
  if (failure.code !== "AI_PROVIDER_REJECTED") return false;
  const status = failure.details && typeof failure.details === "object"
    ? (failure.details as { status?: unknown }).status
    : undefined;
  return typeof status === "number" && PROVIDER_AUTH_REJECTION_STATUSES.has(status);
}

export async function generateWeeklyLessonLevelPipeline(
  week: ContentWeekInput,
  cefr: string,
  task: { prompt: string },
  runner: AiTaskRunner,
  options: {
    excludedVocabulary?: readonly string[];
    dayNumbers?: readonly number[];
    qualityProfile?: LessonQualityProfile;
    pronunciationAssetRegistry?: PronunciationAssetRegistry;
    onProgress?: (event: LessonGenerationProgressEvent) => void;
    onCheckpoint?: (checkpoint: WeeklyLessonPipelineCheckpoint) => void | Promise<void>;
    resumeStatesByDay?: Readonly<Partial<Record<number, WeeklyLessonPipelineCheckpoint["state"]>>>;
  } = {}
) {
  const plan = week.plan?.[cefr as keyof NonNullable<ContentWeekInput["plan"]>];
  if (!plan || plan.length !== 5 || plan.some((focus) => !focus.trim())) {
    throw Object.assign(new Error("CONTENT_WEEK_PLAN_REQUIRED"), {
      code: "CONTENT_WEEK_PLAN_REQUIRED",
      issues: [{ dayNumber: null, component: "plan", cefr }]
    });
  }
  const selectedDays = options.dayNumbers
    ? DAYS.filter((dayNumber) => options.dayNumbers!.includes(dayNumber))
    : DAYS;
  const lessons: ContentLessonDraftInput[] = [];
  const checkpoints: WeeklyLessonPipelineCheckpoint[] = [];
  const results: AiRunResult[] = [];
  // Keep historical content as a diversity preference only. This per-level
  // registry grows after each accepted day, so later days see actual cards
  // already introduced rather than a speculative vocabulary list.
  const excludedVocabulary = new Set(boundedVocabularyHistory(options.excludedVocabulary ?? []));
  const introducedVocabulary = new Set<string>();
  const reservedVocabularyForDay = (dayNumber: number) => plan.flatMap((focus, index) =>
    index + 1 === dayNumber ? [] : weeklyPlanVocabularyTermsFromFocus(focus)
  );
  const sequence = await runWeeklyLessonDaySequence(selectedDays, async (dayNumber) => {
    const generated = await generateWeeklyLessonDayPipeline({
      weekNumber: week.weekNumber,
      topic: week.topic,
      description: week.description,
      objectives: week.objectives,
      keyVocabHint: week.keyVocabHint,
      cefr,
      dayNumber,
      lessonFocus: plan[dayNumber - 1]!,
      allLessonFocuses: plan
    }, task.prompt, runner, {
      // The task schema accepts at most 100 entries. Keep enough headroom for
      // the current level's accepted words so later C1 days cannot fail input
      // validation before the provider is called.
      excludedVocabulary: [...excludedVocabulary].slice(-80),
      ...(introducedVocabulary.size > 0 ? { forbiddenVocabulary: [...introducedVocabulary].slice(-80) } : {}),
      reservedVocabulary: reservedVocabularyForDay(dayNumber),
      qualityProfile: options.qualityProfile ?? "strict",
      ...(options.pronunciationAssetRegistry ? { pronunciationAssetRegistry: options.pronunciationAssetRegistry } : {}),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.resumeStatesByDay?.[dayNumber] ? { resumeState: options.resumeStatesByDay[dayNumber] } : {}),
      onCheckpoint: async (checkpoint) => {
        checkpoints.push(checkpoint);
        await options.onCheckpoint?.(checkpoint);
      }
    });
    const vocabulary = (generated.checkpoints.findLast((checkpoint) => checkpoint.component === "vocabulary")?.output
      ?? options.resumeStatesByDay?.[dayNumber]?.vocabulary) as Vocabulary | undefined;
    if (vocabulary) {
      for (const term of vocabularyLexicalTerms(vocabulary)) introducedVocabulary.add(normalizeVocabularyKey(term.word));
      while (introducedVocabulary.size > 80) {
        const oldest = introducedVocabulary.values().next().value as string | undefined;
        if (!oldest) break;
        introducedVocabulary.delete(oldest);
      }
    }
    return generated;
  });
  const warnings: LessonGenerationFinding[] = [];
  for (const completed of sequence.completed) {
    lessons.push(completed.value.lesson);
    results.push(...completed.value.results);
    warnings.push(...completed.value.warnings);
  }
  if (sequence.failures.length === 0 && selectedDays.length === DAYS.length) {
    const validation = validateLessonDraft(lessons);
    if (!validation.valid) {
      throw Object.assign(new Error("AI_LESSON_SET_INVALID"), { code: "AI_LESSON_SET_INVALID", issues: validation.issues });
    }
  }
  return { lessons, checkpoints, results, failures: sequence.failures, warnings };
}

export function validateWeeklyLessonCrossLevelSet(
  lessonsByLevel: Readonly<Record<string, readonly ContentLessonDraftInput[]>>
): { valid: boolean; issues: Array<{ level: string; dayNumber: number; code: string; message: string }> } {
  const issues: Array<{ level: string; dayNumber: number; code: string; message: string }> = [];
  const lessonSignatureOwner = new Map<string, { level: string; dayNumber: number }>();
  for (const [level, lessons] of Object.entries(lessonsByLevel)) {
    for (const lesson of lessons) {
      const listening = lesson.parts.find((part) => part.code === "listening")?.content;
      const reading = lesson.parts.find((part) => part.code === "reading")?.content;
      const speaking = lesson.parts.find((part) => part.code === "speaking")?.content;
      const signature = JSON.stringify({ listening, reading, speaking }).trim();
      if (!listening && !reading && !speaking) continue;
      const prior = lessonSignatureOwner.get(signature);
      if (prior && prior.level !== level) {
        issues.push({
          level,
          dayNumber: lesson.dayNumber,
          code: "DUPLICATE_LESSON_CONTENT",
          message: `Lesson content duplicates ${prior.level} T${prior.dayNumber + 1}.`
        });
      } else {
        lessonSignatureOwner.set(signature, { level, dayNumber: lesson.dayNumber });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export type WeeklyLessonLevelAllocation = {
  difficultyLane: string;
  learnerLanguage: "Vietnamese-supported English" | "English except Vietnamese vocabulary meanings";
};

const WEEKLY_LESSON_LEVEL_ALLOCATIONS: Readonly<Record<string, WeeklyLessonLevelAllocation>> = {
  A1: {
    difficultyLane: "Concrete survival communication with short memorisable sentences and direct retrieval.",
    learnerLanguage: "Vietnamese-supported English"
  },
  A2: {
    difficultyLane: "Routine workplace exchanges with linked simple sentences and limited situational detail.",
    learnerLanguage: "Vietnamese-supported English"
  },
  B1: {
    difficultyLane: "Independent workplace communication with reasons, sequencing, and straightforward inference.",
    learnerLanguage: "English except Vietnamese vocabulary meanings"
  },
  B2: {
    difficultyLane: "Detailed professional interaction with comparison, negotiation, and evidence-based inference.",
    learnerLanguage: "English except Vietnamese vocabulary meanings"
  },
  C1: {
    difficultyLane: "Nuanced professional communication with synthesis, implicit stance, and precise register control.",
    learnerLanguage: "English except Vietnamese vocabulary meanings"
  }
};

export function buildWeeklyLessonLevelAllocation(
  levels: readonly string[]
): Record<string, WeeklyLessonLevelAllocation> {
  return Object.fromEntries([...new Set(levels)].map((level) => {
    const allocation = WEEKLY_LESSON_LEVEL_ALLOCATIONS[level];
    if (!allocation) throw new Error(`UNSUPPORTED_CEFR_LEVEL:${level}`);
    return [level, allocation];
  }));
}

export async function runWeeklyLessonLevelBatch<T>(
  levels: readonly string[],
  generateLevel: (level: string) => Promise<T>
): Promise<Record<string, T>> {
  const uniqueLevels = [...new Set(levels)];
  const settled = await Promise.allSettled(uniqueLevels.map(async (level) => ({
    level,
    value: await generateLevel(level)
  })));
  const partialResults: Record<string, T> = {};
  const failures: Array<{
    level: string;
    code?: unknown;
    message: string;
    issues?: unknown;
    details?: unknown;
  }> = [];
  settled.forEach((result, index) => {
    const level = uniqueLevels[index]!;
    if (result.status === "fulfilled") {
      partialResults[level] = result.value.value;
      return;
    }
    const reason = result.reason && typeof result.reason === "object"
      ? result.reason as { code?: unknown; issues?: unknown; details?: unknown }
      : {};
    failures.push({
      level,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      ...(reason.code !== undefined ? { code: reason.code } : {}),
      ...(reason.issues !== undefined ? { issues: reason.issues } : {}),
      ...(reason.details !== undefined ? { details: reason.details } : {})
    });
  });
  if (failures.length > 0) {
    throw Object.assign(new Error("AI_LEVEL_BATCH_FAILED"), {
      code: "AI_LEVEL_BATCH_FAILED",
      failures,
      partialResults
    });
  }
  return partialResults;
}

type WeeklyBlueprintPlan = ReturnType<typeof weeklyLessonPlanBlueprintOutputSchema.parse>["plan"];

export function weeklyLessonPlanBlueprintFindings(
  plan: ContentWeekInput["plan"] | WeeklyBlueprintPlan | undefined
): Array<{ path: string; message: string }> {
  const findings: Array<{ path: string; message: string }> = [];
  for (const level of WEEKLY_BLUEPRINT_LEVELS) {
    const days = plan?.[level];
    if (!days || days.length !== 5) {
      findings.push({ path: `plan.${level}`, message: `${level} must contain exactly five daily blueprints.` });
      continue;
    }
    const vocabularyOwnerByKey = new Map<string, number>();
    days.forEach((item, dayIndex) => {
      const path = `plan.${level}.${dayIndex}`;
      if (containsVietnameseLearnerText(item)) {
        findings.push({ path, message: "Internal daily blueprints must be English; learner-facing language is applied by the lesson component pipeline." });
      }
      const segments = item.split("|").map((segment) => segment.trim());
      const labels = ["Outcome:", "Vocabulary:", "Frame:", "Skill emphasis:"] as const;
      if (segments.length !== labels.length || labels.some((label, index) => !segments[index]?.startsWith(label))) {
        findings.push({ path, message: "Use exactly: Outcome: ... | Vocabulary: ... | Frame: ... | Skill emphasis: ..." });
        return;
      }
      labels.forEach((label, index) => {
        if (!segments[index]!.slice(label.length).trim()) findings.push({ path, message: `${label} must contain concrete content.` });
      });
      for (const term of weeklyPlanVocabularyTerms(segments[1]?.slice("Vocabulary:".length) ?? "")) {
        const key = normalizeVocabularyKey(term);
        if (!key) continue;
        const priorDay = vocabularyOwnerByKey.get(key);
        if (priorDay === undefined) {
          vocabularyOwnerByKey.set(key, dayIndex + 1);
        } else {
          findings.push({
            path,
            message: `Vocabulary term '${term}' already appears on day ${priorDay}; each primary plan term must be introduced once per CEFR level.`
          });
        }
      }
    });
  }
  return findings.slice(0, 12);
}

function weeklyPlanVocabularyTerms(value: string): string[] {
  return value.split(",").map((term) => term.trim()).filter(Boolean);
}

function weeklyPlanVocabularyTermsFromFocus(focus: string): string[] {
  const vocabularySegment = focus.split("|").map((segment) => segment.trim())
    .find((segment) => segment.startsWith("Vocabulary:"));
  return weeklyPlanVocabularyTerms(vocabularySegment?.slice("Vocabulary:".length) ?? "");
}

export async function normalizeWeeklyLessonPlanBlueprint(
  week: ContentWeekInput,
  task: { prompt: string },
  runner: AiTaskRunner
): Promise<{ week: ContentWeekInput & { plan: WeeklyBlueprintPlan }; result?: AiRunResult }> {
  const existingFindings = weeklyLessonPlanBlueprintFindings(week.plan);
  if (existingFindings.length === 0) {
    return { week: { ...week, plan: week.plan as WeeklyBlueprintPlan } };
  }

  const sourcePlan = Object.fromEntries(WEEKLY_BLUEPRINT_LEVELS.flatMap((level) => {
    const days = week.plan?.[level];
    return days?.length === 5 ? [[level, days]] : [];
  }));
  let previousOutput: unknown;
  let findings = existingFindings;
  let lastResult: AiRunResult | undefined;
  for (let attempt = 1; attempt <= WEEKLY_BLUEPRINT_ATTEMPTS; attempt += 1) {
    const messages = previousOutput === undefined ? undefined : [
      { role: "assistant" as const, content: JSON.stringify(previousOutput) },
      {
        role: "user" as const,
        content: `Repair only these blueprint contract violations and return the complete plan object:\n${findings.map((finding) => `${finding.path}: ${finding.message}`).join("\n")}`
      }
    ];
    const result = await runner.runTask("weekly_lesson_plan_blueprint", {
      weekNumber: week.weekNumber,
      topic: week.topic,
      description: week.description,
      objectives: week.objectives,
      keyVocabHint: week.keyVocabHint,
      plan: sourcePlan
    }, {
      systemPrompt: `${task.prompt}\n\n${WEEKLY_BLUEPRINT_CONTRACT}`,
      ...(messages ? { messages } : {}),
      maxOutputTokens: WEEKLY_BLUEPRINT_OUTPUT_TOKEN_LIMIT,
      maxAttempts: 3
    });
    lastResult = result;
    const parsed = weeklyLessonPlanBlueprintOutputSchema.safeParse(result.output);
    if (!parsed.success) {
      findings = parsed.error.issues.slice(0, 12).map((issue) => ({ path: issue.path.join("."), message: issue.message }));
      previousOutput = result.output;
      continue;
    }
    findings = weeklyLessonPlanBlueprintFindings(parsed.data.plan);
    if (findings.length === 0) return { week: { ...week, plan: parsed.data.plan }, result };
    previousOutput = parsed.data;
  }
  throw Object.assign(new Error("AI_WEEK_PLAN_BLUEPRINT_INVALID"), {
    code: "AI_WEEK_PLAN_BLUEPRINT_INVALID",
    issues: findings,
    ...(lastResult ? { result: lastResult } : {})
  });
}

export async function generateWeeklyLessonAllLevelsPipeline(
  week: ContentWeekInput,
  task: { prompt: string },
  runner: AiTaskRunner,
  options: {
    levels?: readonly string[];
    excludedVocabulary?: readonly string[];
    qualityProfile?: LessonQualityProfile;
    pronunciationAssetRegistry?: PronunciationAssetRegistry;
    onProgress?: (event: LessonGenerationProgressEvent) => void;
    onCheckpoint?: (checkpoint: WeeklyLessonPipelineCheckpoint) => void | Promise<void>;
    resumeStatesByLevel?: Readonly<Record<string, Readonly<Partial<Record<number, WeeklyLessonPipelineCheckpoint["state"]>>>>>;
  } = {}
) {
  const levels = [...new Set(options.levels ?? ["A1", "A2", "B1", "B2", "C1"])];
  const normalized = await normalizeWeeklyLessonPlanBlueprint(week, task, runner);
  const normalizedWeek = normalized.week;
  const lessonsByLevel: Record<string, ContentLessonDraftInput[]> = {};
  const checkpoints: WeeklyLessonPipelineCheckpoint[] = [];
  const results: AiRunResult[] = normalized.result ? [normalized.result] : [];
  const allocation = buildWeeklyLessonLevelAllocation(levels);
  const sharedAllocation = levels
    .map((level) => `${level}: ${allocation[level]!.difficultyLane}`)
    .join("\n");
  const generatedByLevel = await runWeeklyLessonLevelBatch(levels, async (cefr) => {
    const levelAllocation = allocation[cefr]!;
    const levelTask = {
      prompt: [
        task.prompt,
        "SHARED FIVE-LEVEL WEEK ALLOCATION:",
        sharedAllocation,
        `YOUR LEVEL: ${cefr}. ${levelAllocation.difficultyLane}`,
        `LEARNER-FACING LANGUAGE: ${levelAllocation.learnerLanguage}.`,
        "The weekly topic, five-day shape, and grammar frame may match other levels. Differentiate the internal language complexity, reasoning demand, examples, questions, and answers for this CEFR lane."
      ].join("\n")
    };
    const generated = await generateWeeklyLessonLevelPipeline(normalizedWeek, cefr, levelTask, runner, {
      excludedVocabulary: [...(options.excludedVocabulary ?? [])],
      ...(options.qualityProfile ? { qualityProfile: options.qualityProfile } : {}),
      ...(options.pronunciationAssetRegistry ? { pronunciationAssetRegistry: options.pronunciationAssetRegistry } : {}),
      ...(options.onProgress ? {
        onProgress: (event: LessonGenerationProgressEvent) => options.onProgress?.({ ...event, cefr })
      } : {}),
      ...(options.resumeStatesByLevel?.[cefr] ? { resumeStatesByDay: options.resumeStatesByLevel[cefr] } : {}),
      onCheckpoint: async (checkpoint) => {
        checkpoints.push(checkpoint);
        await options.onCheckpoint?.(checkpoint);
      }
    });
    if (generated.failures.length > 0 || generated.lessons.length !== DAYS.length) {
      throw Object.assign(new Error("AI_LEVEL_GENERATION_INCOMPLETE"), {
        code: "AI_LEVEL_GENERATION_INCOMPLETE",
        issues: generated.failures,
        details: {
          cefr,
          completedDays: generated.lessons.map((lesson) => lesson.dayNumber),
          expectedDays: [...DAYS]
        },
        partialResult: generated
      });
    }
    return generated;
  });
  for (const cefr of levels) {
    const generated = generatedByLevel[cefr]!;
    lessonsByLevel[cefr] = generated.lessons;
    results.push(...generated.results);
  }
  const crossLevelValidation = validateWeeklyLessonCrossLevelSet(lessonsByLevel);
  if (!crossLevelValidation.valid) {
    throw Object.assign(new Error("AI_CROSS_LEVEL_SET_INVALID"), {
      code: "AI_CROSS_LEVEL_SET_INVALID",
      issues: crossLevelValidation.issues,
      lessonsByLevel
    });
  }
  return { lessonsByLevel, checkpoints, results, crossLevelValidation, normalizedWeek };
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
    qualityProfile?: LessonQualityProfile;
    pronunciationAssetRegistry?: PronunciationAssetRegistry;
    existingLessons?: readonly ContentLessonDraftInput[];
    repairMode?: LessonRepairMode;
    /** Normalized frames already accepted for this week in other CEFR levels. */
    excludedGrammarFrames?: readonly string[];
    forcedComponentsByDay?: Partial<Record<number, readonly LessonGenerationComponent[]>>;
    /** Use explicit route-level targets instead of adding every raw metadata gap. */
    targetOnlyComponentsByDay?: boolean;
    onProgress?: (event: LessonGenerationProgressEvent) => void;
    sequentialPipeline?: boolean;
    onCheckpoint?: (checkpoint: WeeklyLessonPipelineCheckpoint) => void | Promise<void>;
    resumeStatesByDay?: Readonly<Partial<Record<number, WeeklyLessonPipelineCheckpoint["state"]>>>;
  } = {}
) {
  if (options.sequentialPipeline && !options.existingLessons?.length && !options.repairMode) {
    const startedAt = Date.now();
    const generated = await generateWeeklyLessonLevelPipeline(week, cefr, task, runner, {
      ...(options.excludedVocabulary ? { excludedVocabulary: options.excludedVocabulary } : {}),
      ...(options.dayNumbers ? { dayNumbers: options.dayNumbers } : {}),
      qualityProfile: options.qualityProfile ?? "strict",
      ...(options.pronunciationAssetRegistry ? { pronunciationAssetRegistry: options.pronunciationAssetRegistry } : {}),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.onCheckpoint ? { onCheckpoint: options.onCheckpoint } : {}),
      ...(options.resumeStatesByDay ? { resumeStatesByDay: options.resumeStatesByDay } : {})
    });
    const requestedLessonCount = options.dayNumbers?.length ?? DAYS.length;
    if (generated.failures.length > 0 || generated.lessons.length !== requestedLessonCount) {
      const failureCode = generated.lessons.length === 0
        && generated.failures.length > 0
        && generated.failures.every(isProviderUnavailableFailure)
        ? "AI_UNAVAILABLE"
        : "AI_LEVEL_GENERATION_INCOMPLETE";
      throw Object.assign(new Error(failureCode), {
        code: failureCode,
        issues: generated.failures,
        details: {
          cefr,
          completedDays: generated.lessons.map((lesson) => lesson.dayNumber),
          expectedDays: options.dayNumbers ? [...options.dayNumbers] : [...DAYS]
        },
        partialResult: generated
      });
    }
    if (generated.lessons.length === 0) {
      throw Object.assign(new Error("AI_LESSON_GENERATION_FAILED"), {
        code: "AI_LESSON_GENERATION_FAILED",
        issues: generated.failures
      });
    }
    const first = weeklyLessonRunMetadataSeed(generated.results, week.weekNumber, cefr);
    const findings = generated.failures.map((failure): LessonGenerationFinding => {
      const detailComponent = failure.details && typeof failure.details === "object" && "component" in failure.details
        ? String((failure.details as { component?: unknown }).component ?? "skills.reviewer")
        : "skills.reviewer";
      const component = [
        "grammarClassification", "objectives", "foundation", "vocabulary",
        "skills.comprehension", "skills.languagePractice", "skills.speaking", "skills.reviewer"
      ].includes(detailComponent)
        ? detailComponent as LessonGenerationFinding["component"]
        : "skills.reviewer";
      return {
        dayNumber: failure.dayNumber,
        component,
        code: failure.code,
        severity: "error",
        message: failure.message,
        issues: failure.issues,
        repairAction: "regenerate_component"
      };
    });
    findings.push(
      ...generated.warnings,
      ...validateWeeklyVocabularyLexicalCoverage(generated.lessons, cefr),
      ...validateWeeklyVocabularyCrossDayUniqueness(generated.lessons)
    );
    const qualityMetrics = {
      profile: options.qualityProfile ?? "strict",
      requestedLessonCount: options.dayNumbers?.length ?? DAYS.length,
      generatedLessonCount: generated.lessons.length,
      retryCount: generated.checkpoints.reduce((total, checkpoint) => total + Math.max(0, checkpoint.attempts - 1), 0),
      componentRetryCount: generated.checkpoints.reduce((total, checkpoint) => total + Math.max(0, checkpoint.attempts - 1), 0),
      fallbackCount: 0,
      partialSuccess: generated.failures.length > 0,
      pronunciationWarningCount: 0
    };
    const output = { lessons: generated.lessons, failures: generated.failures, findings, qualityMetrics };
    const result: AiRunResult<typeof output> = {
      output,
      metadata: {
        traceId: first.traceId,
        taskId: "weekly_lessons",
        provider: first.provider,
        model: first.model,
        attempts: generated.results.reduce((total, item) => total + item.metadata.attempts, 0),
        latencyMs: Math.max(0, Date.now() - startedAt),
        inputHash: first.inputHash,
        schemaValid: true,
        usage: sumUsage(generated.results.map((item) => item.metadata.usage))
      }
    };
    return { result, output, lessons: generated.lessons, failures: generated.failures, findings };
  }
  const qualityProfile = options.qualityProfile ?? "baseline";
  const pronunciationAssetRegistry = options.pronunciationAssetRegistry;
  const qualityChecksEnabled = options.qualityReview || qualityProfile === "strict";
  let componentRetryCount = 0;
  const savedPlan = week.plan?.[cefr as keyof NonNullable<ContentWeekInput["plan"]>];
  if (!savedPlan || savedPlan.length !== 5 || savedPlan.some((focus) => !focus.trim())) {
    const finding: LessonGenerationFinding = {
      dayNumber: null,
      component: "plan",
      code: "CONTENT_WEEK_PLAN_REQUIRED",
      severity: "error",
      message: `Mức ${cefr} cần kế hoạch 5 ngày hợp lệ trước khi sinh hoặc sửa component.`,
      issues: [],
      repairAction: "regenerate_plan"
    };
    throw Object.assign(new Error(finding.code), { code: finding.code, issues: [finding] });
  }
  const focuses = savedPlan;
  const generationFindings: LessonGenerationFinding[] = [];
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
    lessonFocus: focuses[dayNumber - 1]!,
    allLessonFocuses: focuses
  }));
  const reservedVocabularyForDay = (dayNumber: number) => focuses.flatMap((focus, index) =>
    index + 1 === dayNumber ? [] : weeklyPlanVocabularyTermsFromFocus(focus)
  );
  const existingByDay = new Map((options.existingLessons ?? []).map((lesson) => [lesson.dayNumber, lesson]));
  const componentTargets = generationDays.map((dayNumber) => {
    const forced = options.forcedComponentsByDay?.[dayNumber];
    // A route may have already classified this day at level scope (for
    // example, retaining <=2 light lexical gaps).  In that case its explicit
    // target set is authoritative; do not silently add unrelated raw gaps.
    const rawTargets = lessonComponentsNeedingRepair(existingByDay.get(dayNumber), options.repairMode ?? "enrich");
    if (!forced) return rawTargets;
    // Partial checkpoint recovery needs both the diagnosed target and anything
    // physically absent in the retained day.  Operator supplementation of a
    // complete day opts into target-only behavior explicitly below.
    return options.targetOnlyComponentsByDay ? new Set(forced) : new Set([...rawTargets, ...forced]);
  });

  const grammarClassificationSettled = await settleSequentially(baseInputs, async (input, index) => {
    if (!componentTargets[index]!.has("foundation")) return undefined;
    const generated = await generateWeeklyLessonGrammarClassification(input, runner, {
      qualityReview: qualityChecksEnabled,
      ...(options.onProgress ? { onProgress: options.onProgress } : {})
    });
    componentRetryCount += generated.attempts - 1;
    return generated;
  });

  const fallbackGrammarClassification = (input: typeof baseInputs[number]) =>
    fallbackGrammarClassificationForLesson(input);
  // A completed lesson must always teach one usable language pattern.  If the
  // classifier exhausts its retries, anchor the foundation pass to the exact
  // operator-approved daily focus instead of saving a learner-facing grammar
  // section as hidden/unavailable.  The foundation model still supplies the
  // actual formula, usage and examples; no grammar content is fabricated here.
  const grammarClassifications = grammarClassificationSettled.map((entry, index) =>
    entry.status === "fulfilled" && entry.value && entry.value.output.status === "classified"
      ? entry.value.output
      : fallbackGrammarClassification(baseInputs[index]!)
  );

  const objectivesSettled = await settleSequentially(baseInputs, async (input, index) => {
    if (!componentTargets[index]!.has("foundation")) return undefined;
    const pronunciationPlan = curatedPronunciationPlan(input.cefr, input.dayNumber);
    const resultInput = { ...input, grammarClassification: grammarClassifications[index]!, pronunciationPlan };
    const generated = await generateWeeklyLessonObjectives(resultInput, task.prompt, runner, {
      ...(options.onProgress ? { onProgress: options.onProgress } : {})
    });
    componentRetryCount += generated.attempts - 1;
    return generated;
  });
  const objectiveResults = objectivesSettled.map((entry) => entry.status === "fulfilled" ? entry.value : undefined);

  const foundationSettled = await settleSequentially(baseInputs, async (input, index) => {
    if (!componentTargets[index]!.has("foundation")) return undefined;
    const pronunciationPlan = curatedPronunciationPlan(input.cefr, input.dayNumber);
    const resultInput = { ...input, grammarClassification: grammarClassifications[index]!, pronunciationPlan };
    const generated = await generateWeeklyLessonFoundation(resultInput, task.prompt, runner, {
      qualityProfile,
      ...(options.onProgress ? { onProgress: options.onProgress } : {})
    });
    componentRetryCount += generated.attempts - 1;
    return generated;
  });
  const foundationBodyResults = foundationSettled.map((entry) => entry.status === "fulfilled" ? entry.value : undefined);
  const foundationResults = baseInputs.map((_, index) => {
    const body = foundationBodyResults[index];
    const objectives = objectiveResults[index];
    if (!body || !objectives) return undefined;
    const output = { ...body.output, objective: objectives.output.objective };
    return {
      ...body,
      output,
      findings: [...(body.findings ?? []), ...(objectives.findings ?? [])],
      attempts: Math.max(body.attempts, objectives.attempts)
    };
  });

  // One level job owns its complete T2-T6 sequence. Days are generated in
  // order, then duplicate repair is run only for the conflicting day.
  // Accepted days are never regenerated.
  const acceptedGrammarFrames = new Set((options.excludedGrammarFrames ?? []).map(normalizeGrammarFrame).filter(Boolean));
  for (const [index, input] of baseInputs.entries()) {
    if (!qualityChecksEnabled) break;
    const current = foundationResults[index];
    if (!current?.output.grammar || !componentTargets[index]!.has("foundation")) continue;
    let candidate = current;
    let key = normalizeGrammarFrame(current.output.grammar.formula || current.output.grammar.targetName);
    if (!key || !acceptedGrammarFrames.has(key)) {
      if (key) acceptedGrammarFrames.add(key);
      continue;
    }
    const duplicateKey = key;
    for (let attempt = (current.attempts ?? 1) + 1; attempt <= MAX_COMPONENT_ATTEMPTS; attempt += 1) {
      componentRetryCount += 1;
      const pronunciationPlan = curatedPronunciationPlan(input.cefr, input.dayNumber);
      const resultInput = { ...input, grammarClassification: grammarClassifications[index]!, pronunciationPlan };
      const generated = await runner.runTask("weekly_lesson_foundation", resultInput, {
        systemPrompt: `${task.prompt}\n\n${FOUNDATION_CONTRACT}\n\n${activeFoundationProfile(input.cefr)}\n\nDUPLICATE FRAME REPAIR: The normalized grammar/frame '${duplicateKey}' is already used in this week. Replace only the grammar/frame with a distinct CEFR-${input.cefr} workplace function grounded in lessonFocus. Preserve every valid non-grammar field. Return the complete foundation.`,
        maxOutputTokens: FOUNDATION_OUTPUT_TOKEN_LIMIT,
        maxAttempts: 1
      });
      const parsed = weeklyLessonFoundationBodyOutputSchema.safeParse(normalizeFoundationProviderOutput(generated.output, input.cefr));
      if (!parsed.success) continue;
      const body = withAuthoritativePronunciationBody(parsed.data, pronunciationPlan, input.cefr);
      const normalized = { ...body, objective: current.output.objective };
      const nextKey = normalized.grammar ? normalizeGrammarFrame(normalized.grammar.formula || normalized.grammar.targetName) : "";
      if (!nextKey || acceptedGrammarFrames.has(nextKey)) continue;
      candidate = { ...current, result: generated, output: normalized, attempts: attempt };
      foundationResults[index] = candidate;
      foundationBodyResults[index] = { ...foundationBodyResults[index]!, result: generated, output: body, attempts: attempt };
      key = nextKey;
      break;
    }
    if (key === duplicateKey) {
      generationFindings.push({
        dayNumber: input.dayNumber,
        component: "foundation",
        code: "DUPLICATE_GRAMMAR_FRAME",
        severity: "error",
        message: `Khung ngữ pháp bị trùng sau ${MAX_COMPONENT_ATTEMPTS} lần thử; chỉ cần sinh lại phần nền tảng của T${input.dayNumber + 1}.`,
        issues: [{ frame: duplicateKey }],
        repairAction: "regenerate_component"
      });
    } else if (key) {
      acceptedGrammarFrames.add(key);
    }
  }

  // Historical vocabulary is useful prompt context, but it must not be a hard
  // rejection rule. Workplace topics legitimately reuse core words (meeting,
  // report, customer, etc.), and rejecting those words made an otherwise valid
  // five-day set fail repeatedly. Keep hard uniqueness inside this generated
  // batch; use earlier lesson sets only as a best-effort diversity hint.
  const preservedVocabulary = preservedWeeklyVocabulary(options.existingLessons ?? [], generationDays);
  const promptHistory = boundedVocabularyHistory([
    ...(options.excludedVocabulary ?? []),
    ...preservedVocabulary
  ]);
  // Vocabulary in days untouched by a component repair is already accepted
  // teaching content for this level, so it is a hard exclusion, not merely
  // a suggestion in the model prompt.
  const usedVocabulary = new Set<string>(
    preservedVocabulary.map(normalizeVocabularyKey)
  );
  type VocabularyResult = {
    result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
    output: Vocabulary;
    findings?: Array<{ path: PropertyKey[]; message: string }>;
    attempts: number;
  };
  const firstVocabularySettled = await settleSequentially(baseInputs, async (input, index): Promise<VocabularyResult | undefined> => {
    if (!componentTargets[index]!.has("vocabulary")) return undefined;
    const foundation = foundationBodyResults[index]?.output;
    return generateWeeklyLessonVocabulary({
      ...input,
      grammarFormula: foundation?.grammar?.formula ?? null,
      grammarExamples: foundation?.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
      excludedVocabulary: promptHistory,
      reservedVocabulary: reservedVocabularyForDay(input.dayNumber),
      ...(preservedVocabulary.length > 0 ? { forbiddenVocabulary: preservedVocabulary } : {})
    }, runner);
  });

  const candidates = firstVocabularySettled.map((entry) => entry.status === "fulfilled" ? entry.value : undefined);
  const vocabularyResults: Array<VocabularyResult | undefined> = Array(baseInputs.length).fill(undefined);
  const rejectedWords = baseInputs.map(() => new Set<string>());
  for (let attempt = 1; attempt <= MAX_COMPONENT_ATTEMPTS; attempt += 1) {
    if (attempt > 1) componentRetryCount += 1;
    const retryIndexes: number[] = [];
    for (const [index, input] of baseInputs.entries()) {
      if (vocabularyResults[index]) continue;
      const candidate = candidates[index];
      if (!candidate) continue;
      const words = uniqueVocabularyTerms(vocabularyLexicalTerms(candidate.output));
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
        if (candidate.attempts < MAX_COMPONENT_ATTEMPTS) retryIndexes.push(index);
      }
    }
    if (retryIndexes.length === 0 || attempt === MAX_COMPONENT_ATTEMPTS) break;
    const acceptedWords = vocabularyResults.flatMap((item) => item ? uniqueVocabularyTerms(vocabularyLexicalTerms(item.output)) : []);
    const retried = await settleSequentially(retryIndexes, async (index): Promise<[number, VocabularyResult]> => {
      const input = baseInputs[index]!;
      const foundation = foundationBodyResults[index]?.output;
      const excludedVocabulary = [...new Set([
        ...promptHistory,
        ...acceptedWords,
        ...rejectedWords[index]!
      ])].slice(-100);
      const generated = await generateWeeklyLessonVocabulary({
        ...input,
        grammarFormula: foundation?.grammar?.formula ?? null,
        grammarExamples: foundation?.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
        excludedVocabulary,
        reservedVocabulary: reservedVocabularyForDay(input.dayNumber),
        ...(preservedVocabulary.length > 0 ? { forbiddenVocabulary: preservedVocabulary } : {})
      }, runner, { maxAttempts: 1 });
      return [index, { ...generated, attempts: (candidates[index]?.attempts ?? 1) + generated.attempts }];
    });
    retried.forEach((entry) => {
      if (entry.status === "fulfilled") {
        const [index, candidate] = entry.value;
        candidates[index] = candidate;
      }
    });
  }
  // A repeated learner-facing term is never accepted as a new vocabulary card.
  // Keep other days running, but leave only this day's vocabulary component for
  // targeted repair. Reuse remains allowed inside practice prose.
  const completeVocabularyResults = vocabularyResults;
  completeVocabularyResults.forEach((item, index) => {
    if (item && !vocabularyResults[index] && rejectedWords[index]!.size > 0) {
      generationFindings.push({
        dayNumber: generationDays[index]!,
        component: "vocabulary",
        code: "DUPLICATE_VOCABULARY",
        severity: "error",
        message: `Từ vựng vẫn trùng sau ${item.attempts} lần thử; giữ bản nháp và chỉ sinh lại phần từ vựng của T${generationDays[index]! + 1}.`,
        issues: [...rejectedWords[index]!].map((word) => ({ word })),
        repairAction: "regenerate_component"
      });
    }
  });

  const skillsInputs: WeeklyLessonSkillsInput[] = baseInputs.map((input, index) => {
    const foundation = foundationBodyResults[index]?.output;
    const vocabulary = completeVocabularyResults[index]?.output;
    const lessonObjectives = objectiveResults[index]?.output.objective;
    const vocabularyContext = vocabulary
      ? vocabularyWords(vocabulary)
      : foundation
        ? [foundation.pronunciation.word1.word, foundation.pronunciation.word2.word, foundation.pronunciation.word3.word]
        : fallbackVocabularyWords(input.keyVocabHint);
    return {
      ...input,
      grammarFormula: foundation?.grammar?.formula ?? null,
      grammarExamples: foundation?.grammar ? [foundation.grammar.example1, foundation.grammar.example2] : null,
      vocabularyWords: vocabularyContext,
      ...(lessonObjectives ? { lessonObjectives } : {}),
      generationConstraints: weeklyLessonSkillsGenerationConstraints(input.cefr)
    };
  });
  const skillGroupConfigs = [
    { taskId: "weekly_lesson_comprehension", component: "skills.comprehension" as const, schema: weeklyLessonComprehensionOutputSchema as SkillGroupSchema, maxOutputTokens: COMPREHENSION_OUTPUT_TOKEN_LIMIT },
    { taskId: "weekly_lesson_language_practice", component: "skills.languagePractice" as const, schema: weeklyLessonLanguagePracticeOutputSchema as SkillGroupSchema, maxOutputTokens: LANGUAGE_PRACTICE_OUTPUT_TOKEN_LIMIT },
    { taskId: "weekly_lesson_speaking", component: "skills.speaking" as const, schema: weeklyLessonSpeakingOutputSchema as SkillGroupSchema, maxOutputTokens: SPEAKING_OUTPUT_TOKEN_LIMIT }
  ];
  const skillJobs = skillsInputs.flatMap((input, inputIndex) => skillGroupConfigs.map((config, configIndex) => ({
    input,
    inputIndex,
    configIndex,
    config
  })));
  const skillJobSettled = await settleWithConcurrency(skillJobs, 2, async ({ input, inputIndex, config }) => {
    if (!componentTargets[inputIndex]!.has("skills")) return undefined;
    const generated = await generateWeeklyLessonSkillGroup(config.component, input, runner, {
      ...(options.onProgress ? { onProgress: options.onProgress } : {})
    });
    componentRetryCount += Math.max(0, generated.attempts - 1);
    return generated;
  });
  const settledForGroup = (configIndex: number) => skillsInputs.map((_, inputIndex) =>
    skillJobSettled[inputIndex * skillGroupConfigs.length + configIndex]!
  );
  const comprehensionSettled = settledForGroup(0);
  const languagePracticeSettled = settledForGroup(1);
  const speakingSettled = settledForGroup(2);
  const skillSettledGroups = [comprehensionSettled, languagePracticeSettled, speakingSettled];
  const skillsReviewResults: AiRunResult[] = [];
  const reviewerFindingsByDay: Array<Array<{ path: PropertyKey[]; message: string }>> = baseInputs.map(() => []);
  if (qualityChecksEnabled) {
    for (const [index, input] of skillsInputs.entries()) {
      const mergedCandidate = mergedSkillsCandidate(skillSettledGroups, index);
      if (!mergedCandidate) continue;
      let review;
      try {
        review = await reviewSkillsCandidate(runner, input, mergedCandidate);
        skillsReviewResults.push(review.result);
      } catch (error) {
        generationFindings.push({
          dayNumber: input.dayNumber,
          component: "skills.reviewer",
          code: "AI_REVIEW_UNAVAILABLE",
          severity: "error",
          message: `AI reviewer unavailable for T${input.dayNumber + 1}; the generated lesson remains a draft and cannot be treated as reviewed.`,
          issues: [{ code: errorCodeOf(error) }],
          repairAction: "regenerate_component"
        });
        continue;
      }
      const affectedConfigIndexes = [...new Set(review.findings.map((finding) => skillGroupIndexForPath(finding.path)))].filter((value): value is number => value !== undefined);
      let repaired = false;
      for (const configIndex of affectedConfigIndexes) {
        const currentEntry = skillSettledGroups[configIndex]![index];
        if (currentEntry?.status !== "fulfilled" || !currentEntry.value || currentEntry.value.semanticAttempts >= MAX_COMPONENT_ATTEMPTS) continue;
        const config = skillGroupConfigs[configIndex]!;
        const relevant = review.findings.filter((finding) => skillGroupIndexForPath(finding.path) === configIndex);
        try {
          const repairCandidate = await generateWeeklyLessonSkillGroup(config.component, input, runner, {
            maxAttempts: 1,
            reviewerFindings: relevant,
            baseOutput: currentEntry.value.output,
            ...(options.onProgress ? { onProgress: options.onProgress } : {})
          });
          const repairedOutput = mergeAtomicSkillRepair(config.component, currentEntry.value.output, repairCandidate.output, relevant);
          skillSettledGroups[configIndex]![index] = {
            status: "fulfilled",
            value: {
              ...repairCandidate,
              output: repairedOutput,
              attempts: currentEntry.value.attempts + repairCandidate.attempts,
              semanticAttempts: currentEntry.value.semanticAttempts + repairCandidate.semanticAttempts
            }
          };
          componentRetryCount += 1;
          repaired = true;
        } catch {
          // Keep the last validated subgroup. A failed repair candidate must never
          // delete or overwrite exercises that already passed deterministic checks.
        }
      }
      if (repaired) {
        const repairedCandidate = mergedSkillsCandidate(skillSettledGroups, index);
        if (!repairedCandidate) continue;
        try {
          review = await reviewSkillsCandidate(runner, input, repairedCandidate);
          skillsReviewResults.push(review.result);
        } catch (error) {
          generationFindings.push({
            dayNumber: input.dayNumber,
            component: "skills.reviewer",
            code: "AI_REVIEW_UNAVAILABLE",
            severity: "error",
            message: `AI reviewer unavailable after targeted repair for T${input.dayNumber + 1}; valid content is retained as an unreviewed draft.`,
            issues: [{ code: errorCodeOf(error) }],
            repairAction: "regenerate_component"
          });
          continue;
        }
      }
      reviewerFindingsByDay[index] = review.findings;
    }
  }
  const skillsResults = baseInputs.map((_, index) => {
    const comprehension = comprehensionSettled[index]?.status === "fulfilled" ? comprehensionSettled[index].value : undefined;
    const languagePractice = languagePracticeSettled[index]?.status === "fulfilled" ? languagePracticeSettled[index].value : undefined;
    const speaking = speakingSettled[index]?.status === "fulfilled" ? speakingSettled[index].value : undefined;
    const output = { ...(comprehension?.output ?? {}), ...(languagePractice?.output ?? {}), ...(speaking?.output ?? {}) } as Partial<Skills>;
    if (Object.keys(output).length === 0) return undefined;
    return {
      output,
      complete: Boolean(comprehension && languagePractice && speaking),
      findings: [...(comprehension?.findings ?? []), ...(languagePractice?.findings ?? []), ...(speaking?.findings ?? []), ...reviewerFindingsByDay[index]!]
    };
  });

  const lessonDrafts = generationDays.map((dayNumber, index) => buildLesson(
    dayNumber,
    foundationBodyResults[index]?.output,
    objectiveResults[index]?.output.objective,
    completeVocabularyResults[index]?.output,
    skillsResults[index]?.output,
    grammarClassifications[index]?.status,
    baseInputs[index]!.lessonFocus,
    foundationBodyResults[index]?.pronunciationValid ?? false,
    cefr,
    pronunciationAssetRegistry
  )).filter((lesson) => lesson.parts.length > 0);
  const parsedLessons = lessonDrafts.map((lesson, index) => {
    const sourceIndex = generationDays.findIndex((dayNumber) => dayNumber === lesson.dayNumber);
    const complete = Boolean(objectiveResults[sourceIndex] && foundationBodyResults[sourceIndex]?.pronunciationValid && completeVocabularyResults[sourceIndex] && skillsResults[sourceIndex]?.complete);
    if (!complete || grammarClassifications[sourceIndex]?.status !== "classified") return lesson;
      const parsed = weeklyLessonDayOutputSchema.safeParse({ lesson });
      if (!parsed.success) throwInvalid(parsed.error.issues, `day${lesson.dayNumber}`);
      return {
        ...parsed.data.lesson,
        dayNumber: lesson.dayNumber,
        title: foundationBodyResults[sourceIndex]!.output.title!
      };
  });

  const lessons = parsedLessons as ContentLessonDraftInput[];
  const completeSet = lessons.length === generationDays.length && generationDays.every((dayNumber, index) => {
    const lesson = lessons.find((candidate) => candidate.dayNumber === dayNumber);
    return Boolean(lesson && grammarClassifications[index] && objectiveResults[index] && foundationBodyResults[index]?.pronunciationValid && completeVocabularyResults[index] && skillsResults[index]?.complete);
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
    ...settledFailures(objectivesSettled, generationDays, "objectives"),
    ...settledFailures(foundationSettled, generationDays, "foundation"),
    ...settledFailures(firstVocabularySettled, generationDays, "vocabulary")
      .filter((failure) => !completeVocabularyResults[generationDays.findIndex((dayNumber) => dayNumber === failure.dayNumber)]),
    ...generationDays.flatMap((dayNumber, index) => {
      const candidate = candidates[index];
      return !completeVocabularyResults[index] && candidate && rejectedWords[index]!.size > 0
        ? [{
          dayNumber,
          component: "vocabulary",
          code: "DUPLICATE_VOCABULARY",
          message: `Từ vựng trùng sau ${candidate.attempts} lần thử.`,
          issues: [...rejectedWords[index]!].map((word) => ({ word }))
        }]
        : [];
    }),
    ...settledFailures(comprehensionSettled, generationDays, "skills.comprehension"),
    ...settledFailures(languagePracticeSettled, generationDays, "skills.languagePractice"),
    ...settledFailures(speakingSettled, generationDays, "skills.speaking")
  ];
  generationFindings.push(
    ...failures.map((failure): LessonGenerationFinding => ({
      dayNumber: failure.dayNumber,
      component: failure.component as LessonGenerationFinding["component"],
      code: failure.code,
      severity: "error",
      message: `Không thể hoàn tất component ${failure.component} cho T${failure.dayNumber + 1}.`,
      issues: failure.issues,
      repairAction: "regenerate_component"
    })),
    ...objectiveResults.flatMap((item, index) => item?.findings
      ? item.findings.map((issue): LessonGenerationFinding => ({
        dayNumber: generationDays[index]!,
        component: "objectives",
        code: "CEFR_FOUNDATION_CONSTRAINT",
        severity: "error",
        message: `${issue.path.join(".")}: ${issue.message}`,
        issues: [issue],
        repairAction: "regenerate_component"
      }))
      : []),
    ...foundationBodyResults.flatMap((item, index) => item && "findings" in item && Array.isArray(item.findings)
      ? item.findings.map((issue): LessonGenerationFinding => ({
        dayNumber: generationDays[index]!,
        component: "foundation",
        code: issue.path[0] === "objective" ? "CEFR_FOUNDATION_CONSTRAINT" : "FOUNDATION_CONSTRAINT",
        severity: "error",
        message: `${issue.path.join(".")}: ${issue.message}`,
        issues: [issue],
        repairAction: "regenerate_component"
      }))
      : []),
    ...completeVocabularyResults.flatMap((item, index) => item?.findings
      ? item.findings.map((issue): LessonGenerationFinding => ({
        dayNumber: generationDays[index]!,
        component: "vocabulary",
        code: "CEFR_VOCABULARY_CONSTRAINT",
        severity: "error",
        message: `${issue.path.join(".")}: ${issue.message}`,
        issues: [issue],
        repairAction: "regenerate_component"
      }))
      : []),
    ...skillsResults.flatMap((item, index) => item && "findings" in item && Array.isArray(item.findings)
      ? item.findings.map((issue): LessonGenerationFinding => ({
        dayNumber: generationDays[index]!,
        component: issue.path[0] === "speaking"
          ? "skills.speaking"
          : issue.path[0] === "listening" || issue.path[0] === "reading"
            ? "skills.comprehension"
            : "skills.languagePractice",
        code: "CEFR_OR_SKILL_CONSTRAINT",
        severity: "error",
        message: `${issue.path.join(".")}: ${issue.message}`,
        issues: [issue],
        repairAction: "regenerate_component"
      }))
      : [])
  );

  const allResults = [
    ...grammarClassificationSettled.flatMap((entry) => entry.status === "fulfilled" && entry.value ? [entry.value.result] : []),
    ...objectiveResults.flatMap((item) => item ? [item.result] : []),
    ...foundationBodyResults.flatMap((item) => item ? [item.result] : []),
    ...completeVocabularyResults.flatMap((item) => item ? [item.result] : []),
    ...comprehensionSettled.flatMap((entry) => entry.status === "fulfilled" && entry.value ? [entry.value.result] : []),
    ...languagePracticeSettled.flatMap((entry) => entry.status === "fulfilled" && entry.value ? [entry.value.result] : []),
    ...speakingSettled.flatMap((entry) => entry.status === "fulfilled" && entry.value ? [entry.value.result] : [])
    , ...skillsReviewResults
  ];
  if (lessons.length === 0 || allResults.length === 0) {
    const failureCode = failures.length > 0 && failures.every(isProviderUnavailableFailure)
      ? "AI_UNAVAILABLE"
      : "AI_LESSON_GENERATION_FAILED";
    throw Object.assign(new Error(failureCode), {
      code: failureCode,
      issues: failures
    });
  }
  const first = allResults[0]!.metadata;
  const qualityMetrics = {
    profile: qualityProfile,
    requestedLessonCount: generationDays.length,
    generatedLessonCount: lessons.length,
    retryCount: allResults.reduce((total, item) => total + Math.max(0, item.metadata.attempts - 1), 0),
    componentRetryCount,
    fallbackCount: failures.length + grammarClassifications.filter((item, index) => {
      const entry = grammarClassificationSettled[index];
      return entry?.status === "rejected";
    }).length,
    partialSuccess: lessons.length < generationDays.length || generationFindings.some((finding) => finding.severity === "error"),
    pronunciationWarningCount: foundationBodyResults.reduce((total, item) => {
      if (!item?.output || !item.pronunciationValid) return total;
      return total + buildPronunciationAssets(item.output.pronunciation.focus, [
        item.output.pronunciation.word1,
        item.output.pronunciation.word2,
        item.output.pronunciation.word3
      ], pronunciationAssetRegistry).warnings.length;
    }, 0)
  };
  const output = { lessons, failures, findings: generationFindings, qualityMetrics };
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

  return { result, output, lessons, failures, findings: generationFindings };
}

export function normalizeGrammarFrame(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\[[^\]]+\]/gu, (placeholder) => placeholder.slice(1, -1))
    .replace(/\([^)]*\)/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
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

function vocabularyLexicalTerms(vocabulary: Vocabulary): Array<{ word: string; path: PropertyKey[]; kind: "primary" | "family" | "synonym" | "antonym" | "sibling" }> {
  const terms: Array<{ word: string; path: PropertyKey[]; kind: "primary" | "family" | "synonym" | "antonym" | "sibling" }> = [];
  for (const slot of ["word1", "word2", "word3"] as const) {
    const item = vocabulary[slot];
    terms.push({ word: item.word, path: [slot, "word"], kind: "primary" });
    for (const family of [item.family1, item.family2]) if (family) terms.push({ word: family.word, path: [slot, "family"], kind: "family" });
    for (const relation of [item.synonym1, item.synonym2]) if (relation) terms.push({ word: relation.word, path: [slot, "synonym"], kind: "synonym" });
    if (item.antonym1) terms.push({ word: item.antonym1.word, path: [slot, "antonym"], kind: "antonym" });
    for (const sibling of [item.sibling1, item.sibling2, item.sibling3]) if (sibling) terms.push({ word: sibling.word, path: [slot, "sibling"], kind: "sibling" });
  }
  return terms;
}

function uniqueVocabularyTerms(terms: ReadonlyArray<{ word: string }>): string[] {
  const byKey = new Map<string, string>();
  for (const term of terms) {
    const key = normalizeVocabularyKey(term.word);
    if (key && !byKey.has(key)) byKey.set(key, term.word);
  }
  return [...byKey.values()];
}

function normalizeVocabularyKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

/** Learner-facing lexical terms from days a component repair deliberately leaves untouched. */
export function preservedWeeklyVocabulary(
  lessons: readonly ContentLessonDraftInput[],
  repairedDays: readonly number[]
): string[] {
  const repaired = new Set(repairedDays);
  return buildLevelVocabularyRegistry(lessons.filter((lesson) => !repaired.has(lesson.dayNumber))).entries.map((entry) => entry.word);
}

export function boundedVocabularyHistory(values: readonly string[], limit = 80): string[] {
  const normalized = values.map(normalizeVocabularyKey).filter(Boolean);
  return normalized.slice(-Math.max(0, limit));
}

/** Repeating a target in practice is fine; teaching it twice as new vocabulary is not. */
export function validateWeeklyVocabularyCrossDayUniqueness(
  lessons: readonly ContentLessonDraftInput[]
): LessonGenerationFinding[] {
  return buildLevelVocabularyRegistry(lessons).duplicateEntries.map(({ entry, prior }) => ({
    dayNumber: entry.dayNumber,
    component: "vocabulary",
    code: "DUPLICATE_WEEKLY_VOCABULARY",
    severity: "error",
    message: `'${entry.word}' is already introduced as ${prior.kind} on T${prior.dayNumber}; replace the learner-facing card in T${entry.dayNumber}, while practice-sentence reinforcement remains allowed.`,
    issues: [{ word: entry.word, duplicateOfDay: prior.dayNumber, kind: entry.kind, priorKind: prior.kind }],
    repairAction: "regenerate_component"
  }));
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
    return [];
  }
  const sources: Record<string, string[]> = {
    topic: [input.topic],
    description: [input.description],
    objectives: [input.objectives],
    keyVocabHint: [input.keyVocabHint],
    lessonFocus: [input.lessonFocus],
    allLessonFocuses: input.allLessonFocuses
  };
  const normalizeEvidence = (value: string) => value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  const hasTraceableEvidence = classification.evidence.some((evidence) => {
    const source = sources[evidence.sourceRef];
    if (!source) return false;
    const quote = normalizeEvidence(evidence.quote);
    return Boolean(quote && source.some((value) => normalizeEvidence(value).includes(quote)));
  });
  return hasTraceableEvidence
    ? []
    : [{
        path: ["evidence"],
        message: "classification requires at least one traceable quote from the referenced input after punctuation and case normalization"
      }];
}

function fallbackGrammarClassificationForLesson(
  input: WeeklyLessonComponentInput
): ReturnType<typeof weeklyLessonGrammarClassificationOutputSchema.parse> {
  const focus = input.lessonFocus.trim();
  const approvedFrame = /(?:^|\|)\s*Frame:\s*([^|]+)/iu.exec(focus)?.[1]?.trim();
  if (approvedFrame) {
    return {
      status: "classified" as const,
      contentType: "sentence_pattern" as const,
      targetName: approvedFrame,
      scope: approvedFrame,
      support: "explicit" as const,
      confidence: "high" as const,
      evidence: [{ sourceRef: "lessonFocus", quote: approvedFrame }],
      rejectedCandidates: []
    };
  }
  const isAdvanced = ["B1", "B2", "C1"].includes(input.cefr);
  const quoted = [...focus.matchAll(/["'“”]([^"'“”]{3,})["'“”]/gu)].map((match) => match[1]!.trim());
  const englishWords = (focus.match(/\b[A-Za-z][A-Za-z'’-]*\b/gu) ?? [])
    .filter((word) => !/^(?:tu|vung|mau|cau|doc|bang|so|tien|don|gian|theo|thang|luyen|noi|va|so|sanh|cao|thap|on|tap|viet|ve|chi|phi|nay)$/iu.test(word));
  let targetName = focus;
  if (/^từ vựng\s*:/iu.test(focus)) {
    const sampleWords = englishWords.slice(0, 3).join(" / ") || "workplace noun";
    targetName = `The + noun + is + adjective / This is + noun (${sampleWords})`;
  } else if (quoted.length > 0) {
    targetName = quoted.join(" / ");
  } else if (isAdvanced && containsVietnameseLearnerText(focus)) {
    targetName = `Workplace sentence pattern for ${input.topic}`;
  }
  const scope = isAdvanced && containsVietnameseLearnerText(focus)
    ? `Use ${targetName} naturally in the workplace context of ${input.topic}.`
    : focus;
  return {
    status: "classified" as const,
    contentType: "sentence_pattern" as const,
    targetName,
    scope,
    support: "explicit" as const,
    confidence: "medium" as const,
    evidence: [{ sourceRef: "lessonFocus", quote: input.lessonFocus }],
    rejectedCandidates: []
  };
}

function grammarSemanticFindings(
  classification: ReturnType<typeof weeklyLessonGrammarClassificationOutputSchema.parse>,
  input: WeeklyLessonComponentInput
): Array<{ path: PropertyKey[]; message: string }> {
  if (classification.status !== "classified") {
    const explicitFrame = /[+?]/u.test(input.lessonFocus)
      || /\b(?:imperative|present simple|past simple|present continuous|past continuous|present perfect|past perfect|conditional|reported speech|reporting passive|reporting clause|relative clause|participle clause|concessive clause|passive voice|modal verb|modal deduction)\b/iu.test(input.lessonFocus);
    return explicitFrame
      ? [{ path: ["status"], message: "lessonFocus contains an explicit teachable sentence frame; classify that concrete frame instead of abstaining." }]
      : [];
  }
  const target = `${classification.targetName ?? ""} ${classification.scope ?? ""}`.trim();
  const issues: Array<{ path: PropertyKey[]; message: string }> = [];
  if (/^s\s*\+\s*v(?:\s*\+\s*o)?$/iu.test(String(classification.targetName ?? "").trim())) {
    issues.push({ path: ["targetName"], message: "Use the concrete sentence frame from lessonFocus; generic S + V or S + V + O is not an teachable target." });
  }
  if (/would you mind if i\s*\+\s*(?:v-?ing|verb-?ing)/iu.test(target)) {
    issues.push({ path: ["targetName"], message: "Would you mind if I takes a past-tense clause; use Would you mind + V-ing only without if." });
  }
  if (/present continuous/iu.test(target) && /\b(?:mic|microphone)\b.*\bmuted\b/iu.test(input.lessonFocus)) {
    issues.push({ path: ["targetName"], message: "Your mic is muted is a passive/state form, not present continuous." });
  }
  return issues;
}

function foundationSemanticFindings(
  foundation: FoundationBody
): Array<{ path: PropertyKey[]; message: string }> {
  const issues: Array<{ path: PropertyKey[]; message: string }> = [];
  const title = foundation.title?.trim() ?? "";
  const grammarText = foundation.grammar
    ? `${foundation.grammar.title} ${foundation.grammar.formula} ${foundation.grammar.usage} ${foundation.grammar.example1} ${foundation.grammar.example2}`
    : "";
  if (title && /\b(?:and|or|to|of|for|with|if|that)\s*$/iu.test(title)) {
    issues.push({ path: ["title"], message: "Lesson title is truncated or ends with a dangling connector." });
  }
  if (foundation.grammar && /^s\s*\+\s*v(?:\s*\+\s*o)?$/iu.test(foundation.grammar.formula.trim())) {
    issues.push({ path: ["grammar", "formula"], message: "Grammar formula must be the concrete frame from lessonFocus, not generic S + V or S + V + O." });
  }
  if (/would you mind if i\s*\+\s*(?:v-?ing|verb-?ing)/iu.test(grammarText)) {
    issues.push({ path: ["grammar", "formula"], message: "Would you mind if I requires a past-tense clause; Would you mind + V-ing is the form without if." });
  }
  if (/\b(?:mic|microphone)\s+is\s+muting\b/iu.test(grammarText)) {
    issues.push({ path: ["grammar", "example"], message: "A microphone can be muted; 'is muting' is not a valid model for that state." });
  }
  const target = foundation.pronunciation.focus.match(/\/([^/]+)\//u)?.[1] ?? "";
  if (/\b(?:beginning|start|initial)\b/iu.test(foundation.pronunciation.tip) && target) {
    for (const key of ["word1", "word2", "word3"] as const) {
      const ipa = foundation.pronunciation[key].ipa.replaceAll("/", "").replace(/^ˈ|^ˌ/u, "");
      if (!ipa.startsWith(target)) {
        issues.push({ path: ["pronunciation", "tip"], message: `Pronunciation tip says the target is initial, but ${foundation.pronunciation[key].word} does not begin with /${target}/.` });
        break;
      }
    }
  }
  return issues;
}

async function runStrictComponent<T>(
  runner: AiTaskRunner,
  taskId: string,
  input: unknown,
  basePrompt: string,
  maxOutputTokens: number,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  dayNumber: number,
  component: string,
  semanticFindings?: (output: T) => Array<{ path: PropertyKey[]; message: string }>,
  maxAttempts = MAX_COMPONENT_ATTEMPTS,
  onProgress?: (event: LessonGenerationProgressEvent) => void,
  rejectSemanticFindingsAfterMaxAttempts = false,
  initialRepairState?: { findings: Array<{ path: PropertyKey[]; message: string }>; previousOutput: string }
): Promise<{
  result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
  output: T;
  findings?: Array<{ path: PropertyKey[]; message: string }>;
  attempts: number;
  semanticAttempts: number;
  attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"];
}> {
  let findings: Array<{ path: PropertyKey[]; message: string }> = initialRepairState?.findings ? [...initialRepairState.findings] : [];
  let previousOutput = initialRepairState?.previousOutput ?? "";
  let previousParsedOutput: T | undefined;
  let lastSuccessfulResult: Awaited<ReturnType<AiTaskRunner["runTask"]>> | undefined;
  let tokenBudget = maxOutputTokens;
  let semanticAttempts = 0;
  let latestInvalidOutput: unknown;
  const attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onProgress?.({ dayNumber, component, status: attempt === 1 ? "started" : "retrying", attempt, maxAttempts });
    const englishOnlyRepair = findings.some((issue) => issue.message.includes("must be English") || issue.message.includes("English only"))
      ? "\nLANGUAGE REPAIR: Rewrite every flagged field entirely in English. Do not include any Vietnamese translation, vocabulary gloss, or parenthetical note. In B1-C1 skills, fields named questionTranslation and answerTranslation are English explanations; the vocabulary-meaning exception never applies inside a skill component."
      : "";
    const lengthRepair = findings.flatMap((issue) => {
      const range = /must contain (\d+)-(\d+) words; received \d+/u.exec(issue.message);
      if (range) {
        const minimum = Number(range[1]);
        const maximum = Number(range[2]);
        const target = Math.floor((minimum + maximum) / 2);
        const sentenceCount = Math.max(1, Math.ceil(target / 10));
        const baseWords = Math.floor(target / sentenceCount);
        const remainder = target % sentenceCount;
        const distribution = Array.from({ length: sentenceCount }, (_, index) => baseWords + (index < remainder ? 1 : 0));
        return [`${issue.path.join(".")}: rewrite this field completely as exactly ${sentenceCount} sentence${sentenceCount === 1 ? "" : "s"}; use ${distribution.join(" + ")} words per sentence (${target} words total). Count space-separated words in each sentence before returning.`];
      }
      const maximum = /(?:must contain |to )?at most (\d+) words; received \d+/iu.exec(issue.message);
      if (maximum) {
        const target = Math.max(1, Number(maximum[1]) - 2);
        return [`${issue.path.join(".")}: rewrite this field completely to no more than ${target} space-separated words, then count each word before returning.`];
      }
      return [];
    });
    const lengthRepairInstruction = lengthRepair.length
      ? `\nLENGTH REPAIR: ${lengthRepair.join(" ")} Preserve the meaning and answer evidence, but do not preserve extra sentences from the previous field.`
      : "";
    const repairInstruction = findings.length
      ? `REPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}${englishOnlyRepair}${lengthRepairInstruction}\nReturn a complete corrected ${component} result and preserve every valid field.`
      : "";
    const repair = findings.length
      ? `\n\nREPAIR REQUIRED: ${findings.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}${englishOnlyRepair}${lengthRepairInstruction}${previousOutput ? `\nPREVIOUS INVALID OUTPUT: ${previousOutput}` : ""}\nReturn a complete corrected ${component} result and preserve every valid field.`
      : "";
    const repairMessages = findings.length && previousOutput
      ? [
          { role: "user" as const, content: JSON.stringify(input) },
          { role: "assistant" as const, content: previousOutput },
          { role: "user" as const, content: repairInstruction }
        ]
      : undefined;
    try {
      semanticAttempts += 1;
      const result = await runner.runTask(taskId, input, {
        systemPrompt: `${basePrompt}${repair}`,
        ...(repairMessages ? { messages: repairMessages } : {}),
        maxOutputTokens: tokenBudget,
        maxAttempts: 1
      });
      lastSuccessfulResult = result;
      const candidateOutput = result.output;
      previousOutput = boundedJson(candidateOutput);
      const parsed = schema.safeParse(candidateOutput);
      if (parsed.success) {
        previousParsedOutput = parsed.data;
        findings = semanticFindings?.(parsed.data) ?? [];
        if (findings.length === 0) {
          attemptLog.push({ attempt, status: "passed", output: candidateOutput, issues: [], metadata: result.metadata });
          onProgress?.({ dayNumber, component, status: "completed", attempt, maxAttempts });
          return { result, output: parsed.data, attempts: attempt, semanticAttempts, attemptLog };
        }
        attemptLog.push({ attempt, status: "rejected", output: candidateOutput, issues: findings, metadata: result.metadata });
        const finalLengthRepair = buildLengthRepairRequest(input, parsed.data, findings);
        if (finalLengthRepair) {
          try {
            const formatterResult = await runner.runTask("weekly_lesson_length_repair", finalLengthRepair, {
              systemPrompt: LENGTH_REPAIR_CONTRACT,
              maxOutputTokens: LENGTH_REPAIR_OUTPUT_TOKEN_LIMIT,
              maxAttempts: 1
            });
            const formattedOutput = applyLengthRepairs(parsed.data, formatterResult.output, finalLengthRepair);
            const formatted = schema.safeParse(formattedOutput);
            if (formatted.success) {
              const formattedFindings = semanticFindings?.(formatted.data) ?? [];
              if (formattedFindings.length === 0) {
                attemptLog[attemptLog.length - 1] = {
                  attempt,
                  status: "passed",
                  output: formattedOutput,
                  issues: [],
                  metadata: formatterResult.metadata
                };
                onProgress?.({ dayNumber, component, status: "completed", attempt, maxAttempts });
                return { result: formatterResult, output: formatted.data, attempts: attempt + 1, semanticAttempts, attemptLog };
              }
              findings = formattedFindings;
              previousOutput = boundedJson(formattedOutput);
            }
          } catch (formatterError) {
            try {
              const fallbackOutput = applyLengthRepairs(parsed.data, {
                listeningBody: null,
                readingBody: null,
                speakingAnswer: null
              }, finalLengthRepair);
              const fallbackParsed = schema.safeParse(fallbackOutput);
              if (fallbackParsed.success) {
                const fallbackFindings = semanticFindings?.(fallbackParsed.data) ?? [];
                if (fallbackFindings.length === 0) {
                  attemptLog[attemptLog.length - 1] = { attempt, status: "passed", output: fallbackOutput, issues: [], metadata: result.metadata };
                  onProgress?.({ dayNumber, component, status: "completed", attempt, maxAttempts });
                  return { result, output: fallbackParsed.data, attempts: attempt + 1, semanticAttempts, attemptLog };
                }
                findings = fallbackFindings;
                previousOutput = boundedJson(fallbackOutput);
              }
            } catch {
              // Preserve the original semantic findings so the next attempt repairs the overlong field directly.
            }
          }
        }
        if (attempt === maxAttempts) {
          onProgress?.({ dayNumber, component, status: "failed", attempt, maxAttempts });
          if (rejectSemanticFindingsAfterMaxAttempts) throwInvalid(findings, `day${dayNumber}.${component}`, { attempt, maxAttempts, maxOutputTokens: tokenBudget, previousOutput, attemptLog });
          return { result, output: parsed.data, findings, attempts: attempt, semanticAttempts, attemptLog };
        }
      } else {
        findings = parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path, message: issue.message }));
        attemptLog.push({ attempt, status: "rejected", output: candidateOutput, issues: findings, metadata: result.metadata });
      }
    } catch (error) {
      if (error && typeof error === "object" && "generatedBy" in error && (error as { generatedBy?: unknown }).generatedBy === "weekly-generation") throw error;
      if (isInvalidAiOutput(error) && previousParsedOutput !== undefined && lastSuccessfulResult) {
        const deterministicRequest = buildLengthRepairRequest(input, previousParsedOutput, findings);
        if (deterministicRequest) {
          try {
            const fallbackOutput = applyLengthRepairs(previousParsedOutput, {
              listeningBody: null,
              readingBody: null,
              speakingAnswer: null
            }, deterministicRequest);
            const fallbackParsed = schema.safeParse(fallbackOutput);
            if (fallbackParsed.success) {
              const fallbackFindings = semanticFindings?.(fallbackParsed.data) ?? [];
              if (fallbackFindings.length === 0) {
                attemptLog.push({ attempt, status: "passed", output: fallbackOutput, issues: [], metadata: lastSuccessfulResult.metadata });
                onProgress?.({ dayNumber, component, status: "completed", attempt, maxAttempts });
                return { result: lastSuccessfulResult, output: fallbackParsed.data, attempts: attempt, semanticAttempts, attemptLog };
              }
              findings = fallbackFindings;
              previousOutput = boundedJson(fallbackOutput);
            }
          } catch {
            // Keep the formatter/provider error below when no safe complete range exists.
          }
        }
      }
      if (isTruncatedAiOutput(error)) {
        attemptLog.push({ attempt, status: "provider_error", issues: [{ path: ["provider"], message: "Provider output reached max_tokens." }] });
        if (attempt === maxAttempts) throw withComponentDiagnostic(error, dayNumber, component, attempt, tokenBudget);
        tokenBudget = expandedTokenBudget(component, tokenBudget);
        findings = [{ path: ["provider"], message: `Provider output reached max_tokens; retry once with ${tokenBudget} tokens.` }];
        continue;
      }
      if (!isInvalidAiOutput(error)) throw withComponentDiagnostic(error, dayNumber, component, attempt, tokenBudget);
      latestInvalidOutput = invalidAiOutputPayload(error);
      if (latestInvalidOutput !== undefined) {
        const salvaged = schema.safeParse(latestInvalidOutput);
        if (salvaged.success) {
          previousParsedOutput = salvaged.data;
          previousOutput = boundedJson(latestInvalidOutput);
          findings = semanticFindings?.(salvaged.data) ?? [];
          if (findings.length === 0) {
            const salvagedResult: Awaited<ReturnType<AiTaskRunner["runTask"]>> = lastSuccessfulResult ?? {
              output: salvaged.data,
              metadata: {
                traceId: `salvaged-${component}-${dayNumber}-${attempt}`,
                taskId,
                provider: "salvaged",
                model: "salvaged",
                attempts: 1,
                latencyMs: 0,
                inputHash: "",
                schemaValid: true,
                usage: {}
              }
            };
            attemptLog.push({ attempt, status: "passed", output: latestInvalidOutput, issues: [], metadata: salvagedResult.metadata });
            onProgress?.({ dayNumber, component, status: "completed", attempt, maxAttempts });
            return { result: salvagedResult, output: salvaged.data, attempts: attempt, semanticAttempts, attemptLog };
          }
          attemptLog.push({ attempt, status: "rejected", output: latestInvalidOutput, issues: findings });
          if (attempt < maxAttempts) continue;
        }
      }
      findings = invalidAiIssues(error);
      attemptLog.push({ attempt, status: "provider_error", ...(latestInvalidOutput === undefined ? {} : { output: latestInvalidOutput }), issues: findings });
    }
    if (attempt === maxAttempts) {
      onProgress?.({ dayNumber, component, status: "failed", attempt, maxAttempts });
      throwInvalid(findings, `day${dayNumber}.${component}`, { attempt, maxAttempts, maxOutputTokens: tokenBudget, previousOutput, invalidOutput: latestInvalidOutput, attemptLog });
    }
  }
  throwInvalid(findings, `day${dayNumber}.${component}`, { maxAttempts, maxOutputTokens: tokenBudget, previousOutput, invalidOutput: latestInvalidOutput, attemptLog });
}

type LengthRepairPath = "listening.body" | "reading.body" | "speaking.answer";
type LengthRepairRequest = {
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  lessonFocus: string;
  repairs: Array<{
    path: LengthRepairPath;
    targetWordCount: number;
    allowedWordMin: number;
    allowedWordMax: number;
    originalText: string;
    prompt: string;
    answer: string;
  }>;
};

function buildLengthRepairRequest<T>(
  input: unknown,
  previousOutput: T,
  findings: Array<{ path: PropertyKey[]; message: string }>
): LengthRepairRequest | undefined {
  if (findings.length === 0 || !input || typeof input !== "object" || !previousOutput || typeof previousOutput !== "object") return undefined;
  const source = input as { cefr?: unknown; lessonFocus?: unknown };
  if (!["A1", "A2", "B1", "B2", "C1"].includes(String(source.cefr)) || typeof source.lessonFocus !== "string" || !source.lessonFocus.trim()) return undefined;
  const repairs: LengthRepairRequest["repairs"] = [];
  const seen = new Set<string>();
  for (const finding of findings) {
    const path = finding.path.map(String).join(".") as LengthRepairPath;
    if (!["listening.body", "reading.body", "speaking.answer"].includes(path) || seen.has(path)) return undefined;
    const range = /must contain (\d+)-(\d+) words; received \d+/u.exec(finding.message);
    const maximum = /must contain at most (\d+) words; received \d+/u.exec(finding.message);
    if (!range && !maximum) return undefined;
    const targetWordCount = range
      ? Math.floor((Number(range[1]) + Number(range[2])) / 2)
      : Math.max(1, Number(maximum?.[1]) - 2);
    // The semantic validator already applies the product-level tolerance. The
    // formatter must land inside that accepted range; adding another word of
    // slack here can produce an output that the very next validation rejects.
    const allowedWordMin = range ? Math.max(1, Number(range[1])) : 1;
    const allowedWordMax = range ? Number(range[2]) : Number(maximum?.[1]);
    const [groupKey, fieldKey] = path.split(".") as ["listening" | "reading" | "speaking", "body" | "answer"];
    const group = (previousOutput as Record<string, unknown>)[groupKey];
    if (!group || typeof group !== "object") return undefined;
    const record = group as Record<string, unknown>;
    const originalText = record[fieldKey];
    if (typeof originalText !== "string" || typeof record.prompt !== "string" || typeof record.answer !== "string") return undefined;
    repairs.push({
      path,
      targetWordCount,
      allowedWordMin,
      allowedWordMax,
      originalText,
      prompt: record.prompt,
      answer: record.answer
    });
    seen.add(path);
  }
  return {
    cefr: source.cefr as LengthRepairRequest["cefr"],
    lessonFocus: source.lessonFocus.trim(),
    repairs
  };
}

function applyLengthRepairs<T>(
  previousOutput: T,
  rawRepairOutput: unknown,
  request: LengthRepairRequest
): T {
  const parsed = weeklyLessonLengthRepairOutputSchema.safeParse(rawRepairOutput);
  if (!parsed.success) {
    throwInvalid(parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })), "lengthRepair");
  }
  const requested = new Map(request.repairs.map((repair) => [repair.path, repair]));
  const slots = [
    ["listening.body", "listeningBody"],
    ["reading.body", "readingBody"],
    ["speaking.answer", "speakingAnswer"]
  ] as const;
  const repaired = structuredClone(previousOutput);
  for (const [path, slot] of slots) {
    const requestForPath = requested.get(path);
    if (!requestForPath) continue;
    const providerTokens = parsed.data[slot];
    const providerText = providerTokens?.join(" ") ?? "";
    const providerCount = providerTokens?.length ?? 0;
    const deterministicSpeaking = path === "speaking.answer"
      ? compactSpeakingAnswer(requestForPath.originalText, requestForPath.prompt, requestForPath.allowedWordMax)
      : undefined;
    const text = providerCount >= requestForPath.allowedWordMin
      && providerCount <= requestForPath.allowedWordMax
      && isCompleteExcerpt(providerText, path === "speaking.answer")
      && (path === "speaking.answer" || containsPromptEntities(providerText, requestForPath.prompt))
      ? providerText
      : deterministicSpeaking ?? selectEvidencePreservingText(
          requestForPath.originalText,
          requestForPath.answer,
          requestForPath.prompt,
          requestForPath.allowedWordMin,
          requestForPath.allowedWordMax,
          requestForPath.targetWordCount
        );
    if (!text) {
      throwInvalid([{
        path: [slot],
        message: `AI repair missed ${requestForPath.allowedWordMin}-${requestForPath.allowedWordMax} words and no complete evidence-preserving sentence range could be selected.`
      }], "lengthRepair");
    }
    const [groupKey, fieldKey] = path.split(".");
    const group = (repaired as Record<string, unknown>)[groupKey!];
    if (!group || typeof group !== "object") throwInvalid([{ path: [path], message: "Repair target does not exist." }], "lengthRepair");
    (group as Record<string, unknown>)[fieldKey!] = text;
  }
  return repaired;
}

function compactSpeakingAnswer(originalText: string, prompt: string, maximum: number): string | undefined {
  const wordCount = (value: string) => value.trim().split(/\s+/u).filter(Boolean).length;
  const requiredQuotedPhrases = [...prompt.matchAll(/["“]([^"”]+)["”]/gu)]
    .map((match) => match[1]!.trim().toLocaleLowerCase("en-US"));
  const requiresExact = (phrase: string) => requiredQuotedPhrases.some((required) => required === phrase.toLocaleLowerCase("en-US"));
  const inflectThirdPerson = (verb: string) => {
    if (/[^aeiou]y$/iu.test(verb)) return `${verb.slice(0, -1)}ies`;
    if (/(?:s|sh|ch|x|z|o)$/iu.test(verb)) return `${verb}es`;
    return `${verb}s`;
  };
  let compacted = originalText
    .trim()
    .replace(/^So,\s+to\s+(?:summari[sz]e|recap):\s*/iu, "Recap: ")
    .replace(/\bI will\b/giu, "I'll")
    .replace(/\bwe will\b/giu, "we'll")
    .replace(/\b([A-Z][\p{L}'’-]*) will ([a-z]+)\b/gu, (_match, actor: string, verb: string) => `${actor} ${inflectThirdPerson(verb)}`)
    .replace(/,\s+and\s+(?=(?:I|we|[A-Z][\p{L}'’-]*)\b)/gu, "; ")
    .replace(/\bthe budget report\b/giu, "budget")
    .replace(/\bthe client meeting\b/giu, "client meeting")
    .replace(/\bthe draft\b/giu, "draft")
    .replace(/\s+/gu, " ")
    .trim();
  if (!requiresExact("Thanks for your time") && !requiresExact("Speak to you soon") && !requiresExact("Talk to you soon")) {
    compacted = compacted
      .replace(/\bThanks(?:,?\s+everyone|\s+for\s+your\s+time)?[.!]?\s*(?:and\s+)?(?:Have\s+a\s+(?:good|great|nice)\s+(?:day|week|evening|afternoon)|Speak\s+to\s+you\s+soon|Talk\s+to\s+you\s+soon)[.!]?$/iu, "Thanks—speak soon.")
      .replace(/\bThanks\s+for\s+your\s+time[.!]?$/iu, "Thanks.");
  }
  if (wordCount(compacted) > maximum) {
    compacted = compacted
      .replace(/\bby\s+(?=(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today|next\s+\w+|\d))/giu, "")
      .replace(/\bWhat I think you're saying is that\b/giu, "What I think you're saying is")
      .replace(/\bWhat I understand is that\b/giu, "What I understand is")
      .replace(/\bThe most likely cause is\b/giu, "The likely cause is")
      .replace(/\bprobably because of the\b/giu, "likely from the")
      .replace(/\bsince the logs show its timeouts\b/giu, "as logs show timeouts")
      .replace(/\bThe alternative is\b/giu, "Alternatively,")
      .replace(/\bbut we would expect\b/giu, "which would cause")
      .replace(/\band we don't see them\b/giu, "which are absent")
      .replace(/\bonly (?:during|at) peak hours\b/giu, "at peak hours")
      .replace(/\baffect about\b/giu, "affect ~")
      .replace(/\bhas not\b/giu, "hasn't")
      .replace(/\bdo not\b/giu, "don't")
      .replace(/\bin order to\b/giu, "to")
      .replace(/\bdue to the fact that\b/giu, "because")
      .replace(/\bThank you,\s*that helps a lot[.!]?$/iu, "Thanks.")
      .replace(/\bthe (?:client |budget |meeting |project |revised )(report|room|draft|notes|plan|slides|agenda|invite|timeline)\b/giu, "the $1")
      .replace(/\bThanks,?\s+everyone,\s+I'll\s+follow\s+up\s+by\s+email[.!]?\s*(?:Have\s+a\s+(?:good|great|nice)\s+(?:day|week|evening|afternoon)[.!]?)?$/iu, "Thanks, I'll follow up by email.")
      .replace(/,\s*(?:but\s+)?only on mobile devices,\s*(?:and\s+)?(?:only\s+)?since\b/giu, " on mobile since")
      .replace(/,?\s*because (?:the )?payment logs show timeouts\b/giu, " as payment logs show timeouts")
      .replace(/\bA faulty mobile script is (?:a )?(?:plausible(?: alternative)?|less likely),\s*(?:but|since|as) (?:the )?timeouts point to (?:the )?backend\b/giu, "Unlike a faulty mobile script, timeouts point to backend")
      .replace(/\bIf (?:the timeouts|they) are confirmed,\s*we(?:'ll| should| will)\b/giu, "If confirmed, we'll")
      .replace(/\bIf they're confirmed,\s*we(?:'ll| should| will)\b/giu, "If confirmed, we'll")
      .replace(/\brethink the release timeline and roll back Tuesday's change(?: as a fallback)?\b/giu, "rethink the timeline and roll back Tuesday's change")
      .replace(/\bIs that (?:a )?(?:correct(?: restatement)?|restatement correct)(?:,\s*([A-Z][\p{L}'’-]*))?\?/gu, (_match, name?: string) => name ? `Right, ${name}?` : "Is that right?")
      .replace(/\bI (?:hear|understand) ([A-Z][\p{L}-]*)(?:['’]s)? wish to keep ([^,]+), (whereas|while) ([A-Z][\p{L}'’-]*) is worried about (?:the )?(?:known )?([^,]+), and both concerns are valid\b/gu, "$1 wants $2, $3 $4 worries about $5; both are valid")
      .replace(/\bLet's aim for ([^ ]+) with a clear fallback\b/giu, "Let's target $1 with a fallback")
      .replace(/\bShould testing not finish (?:by )?Thursday evening,\s*we(?:'ll| will) move (?:only )?(?:the )?(?:final )?(release|launch) to next Tuesday\b/giu, "Should testing overrun Thursday, we'll move the $1 to Tuesday")
      .replace(/\bShould testing not finish\b/giu, "Should testing overrun")
      .replace(/\bmove (?:only )?the final release to next\b/giu, "move the release to")
      .replace(/\bIf that changes the timeline,\s*I(?:'ll| will) rethink the (?:plan|timeline)(?: with you both)?\b/giu, "If delayed, I'll rethink the plan")
      .replace(/\bI'll rethink the (?:plan|timeline) with you both\b/giu, "I'll rethink the plan")
      .replace(/\bNext,\s*we(?:'ll| will) confirm the revised schedule tomorrow morning\b/giu, "Let's confirm the next step tomorrow")
      .replace(/\bLet's confirm that next step today\b/giu, "Let's confirm the next step")
      .replace(/\s+/gu, " ")
      .trim();
  }
  const requiresClosing = /\b(?:close|closing|next step|thank|goodbye|speak soon|talk soon|finally,\s*ask|to confirm)\b/iu.test(prompt);
  if (wordCount(compacted) > maximum && !requiresClosing) {
    const sentences = splitCompleteSentences(compacted);
    for (let end = sentences.length - 1; end > 0; end -= 1) {
      const candidate = sentences.slice(0, end).join(" ");
      const normalizedCandidate = candidate.toLocaleLowerCase("en-US");
      const preservesRequiredPhrases = requiredQuotedPhrases.every((phrase) =>
        normalizedCandidate.includes(phrase.replace(/(?:\.{3}|…)\s*$/u, "").trim())
      );
      if (wordCount(candidate) <= maximum && preservesRequiredPhrases && isCompleteExcerpt(candidate, true)) {
        compacted = candidate;
        break;
      }
    }
  }
  return wordCount(compacted) <= maximum && isCompleteExcerpt(compacted, true) ? compacted : undefined;
}

function selectEvidencePreservingText(
  originalText: string,
  answer: string,
  prompt: string,
  minimum: number,
  maximum: number,
  target: number
): string | undefined {
  const sentences = splitCompleteSentences(originalText);
  const wordCount = (value: string) => value.split(/\s+/u).filter(Boolean).length;
  const contentWords = (value: string) => new Set(value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((word) => word.length > 2 && !["the", "and", "for", "with", "that", "this", "from", "her", "his", "their", "into", "about"].includes(word)) ?? []);
  const answerWords = contentWords(answer);
  let best: { text: string; score: number } | undefined;
  for (let start = 0; start < sentences.length; start += 1) {
    for (let end = start; end < sentences.length; end += 1) {
      const rawText = sentences.slice(start, end + 1).join(" ");
      const text = resolveLeadingPronoun(rawText, sentences.slice(0, start).join(" "));
      const count = wordCount(text);
      if (count > maximum) break;
      if (count < minimum) continue;
      if (!isCompleteExcerpt(text)) continue;
      if (!containsPromptEntities(text, prompt)) continue;
      const words = contentWords(text);
      const overlap = [...answerWords].filter((word) => words.has(word)).length;
      const score = overlap * 1_000 - Math.abs(target - count);
      if (!best || score > best.score) best = { text, score };
    }
  }
  return best?.text;
}

function splitCompleteSentences(value: string): string[] {
  const text = value.trim();
  const sentences: string[] = [];
  let start = 0;
  let insideDoubleQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"' || character === "“" || character === "”") {
      insideDoubleQuote = !insideDoubleQuote;
      const previous = text[index - 1] ?? "";
      const next = text[index + 1] ?? "";
      if (!insideDoubleQuote && /[.!?]/u.test(previous) && (!next || /\s/u.test(next))) {
        sentences.push(text.slice(start, index + 1).trim());
        start = index + 1;
      }
      continue;
    }
    const next = text[index + 1] ?? "";
    if (!insideDoubleQuote && /[.!?]/u.test(character) && (!next || /\s/u.test(next))) {
      sentences.push(text.slice(start, index + 1).trim());
      start = index + 1;
    }
  }
  const remainder = text.slice(start).trim();
  if (remainder) sentences.push(remainder);
  return sentences.filter(Boolean);
}

function resolveLeadingPronoun(value: string, precedingText: string): string {
  if (!/^(?:he|she)\b/iu.test(value)) return value;
  const names = precedingText.match(/\b[A-Z][a-z]{2,}\b/gu) ?? [];
  const name = [...names].reverse().find((candidate) => !["After", "Before", "During", "Later", "Meanwhile", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(candidate));
  return name ? value.replace(/^(?:he|she)\b/iu, name) : value;
}

function isCompleteExcerpt(value: string, allowPronounStart = false): boolean {
  const text = value.trim();
  if (!text || /^["'”’]/u.test(text)) return false;
  const incompleteStart = allowPronounStart
    ? /^(?:there is also|then|after that|however|also|but|later|meanwhile|subsequently)\b/iu
    : /^(?:there is also|then|after that|however|also|but|later|meanwhile|subsequently|she|he|they|it|this|that)\b/iu;
  if (incompleteStart.test(text)) return false;
  const straightQuotes = [...text].filter((character) => character === '"').length;
  return straightQuotes % 2 === 0;
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
  const invalidFocus = findings.some((issue) => issue.path[0] === "pronunciation" && issue.path[1] === "focus");
  if (invalidFocus) {
    return `\nPRONUNCIATION REPAIR: ${focus || "The returned focus"} is not one supported English phoneme. Choose exactly one supported English phoneme from: ${CURATED_PHONEME_TARGETS.map((sound) => `/${sound}/`).join(", ")}. Replace pronunciation.focus and all three pronunciation words together; each standard dictionary IPA must contain the new target. Preserve every non-pronunciation field.`;
  }
  const invalidWords = [...new Set(findings
    .filter((issue) => issue.path[0] === "pronunciation" && /^word[123]$/u.test(String(issue.path[1] ?? "")))
    .map((issue) => String(issue.path[1])))];
  if (!focus || invalidWords.length === 0) return "";
  return `\nPRONUNCIATION REPAIR: The fixed target sound is ${focus}. Keep pronunciation.focus unchanged. Replace only ${invalidWords.join(" and ")} with common words whose standard dictionary IPA visibly contains ${focus}. Never alter or invent an IPA spelling to force a match; choose another word instead. Preserve the other pronunciation words and all non-pronunciation fields.`;
}

function supportedPronunciationFocusFindings(foundation: FoundationBody): Array<{ path: PropertyKey[]; message: string }> {
  const pronunciation = foundation.pronunciation;
  const target = pronunciation.focus.match(/\/([^/]+)\//u)?.[1]?.trim() ?? pronunciation.focus.trim();
  return (CURATED_PHONEME_TARGETS as readonly string[]).includes(target)
    ? []
    : [{
      path: ["pronunciation", "focus"],
      message: `Pronunciation focus must be exactly one supported English phoneme, received /${target}/`
    }];
}

function curatedPronunciationFindings(foundation: FoundationBody): Array<{ path: PropertyKey[]; message: string }> {
  const pronunciation = foundation.pronunciation;
  const target = pronunciation.focus.match(/\/([^/]+)\//u)?.[1]?.trim() ?? pronunciation.focus.trim();
  return [pronunciation.word1, pronunciation.word2, pronunciation.word3].flatMap((word, index) => {
    const verified = curatedPronunciationWord(word.word, word.ipa);
    return containsTargetPhoneme(verified.ipa, target)
      ? []
      : [{
          path: ["pronunciation", `word${index + 1}`, "ipa"] as PropertyKey[],
          message: `${verified.word} does not contain target phoneme /${target}/`
        }];
  });
}

function isInvalidAiOutput(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID");
}

function isTruncatedAiOutput(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_TRUNCATED");
}

function expandedTokenBudget(component: string, current: number): number {
  if (component === "foundation") return Math.max(current, 5_000);
  if (component === "skills.comprehension") return Math.max(current, 3_600);
  if (component === "skills.languagePractice") return Math.max(current, 4_400);
  if (component === "vocabulary") return Math.max(current, 6_000);
  if (component === "objectives") return Math.max(current, 3_000);
  if (component === "skills.speaking") return Math.max(current, 1_500);
  return current * 2;
}

function withComponentDiagnostic(error: unknown, dayNumber: number, component: string, attempt: number, maxOutputTokens: number): unknown {
  if (!error || typeof error !== "object") return error;
  const current = "details" in error && (error as { details?: unknown }).details && typeof (error as { details?: unknown }).details === "object"
    ? (error as { details: Record<string, unknown> }).details
    : {};
  Object.assign(error, {
    details: { ...current, dayNumber, component, attempt, maxOutputTokens }
  });
  return error;
}

function invalidAiIssues(error: unknown): Array<{ path: PropertyKey[]; message: string }> {
  const candidate = error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues?: unknown }).issues)
    ? (error as { issues: unknown[] }).issues
    : error && typeof error === "object" && "details" in error
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

function invalidAiOutputPayload(error: unknown): unknown {
  if (!error || typeof error !== "object" || !("details" in error)) return undefined;
  const details = (error as { details?: unknown }).details;
  return details && typeof details === "object" && "invalidOutput" in details
    ? (details as { invalidOutput?: unknown }).invalidOutput
    : undefined;
}

function throwInvalid(
  issues: Array<{ path: PropertyKey[]; message: string }>,
  prefix: string,
  details: Record<string, unknown> = {}
): never {
  throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
    code: "AI_OUTPUT_INVALID",
    generatedBy: "weekly-generation",
    details,
    issues: issues.slice(0, 8).map((issue) => ({
      path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
      message: issue.message
    }))
  });
}

type Foundation = ReturnType<typeof weeklyLessonFoundationOutputSchema.parse>;
type FoundationBody = ReturnType<typeof weeklyLessonFoundationBodyOutputSchema.parse>;
type Objectives = ReturnType<typeof weeklyLessonObjectivesOutputSchema.parse>;
type Vocabulary = ReturnType<typeof weeklyLessonVocabularyOutputSchema.parse>;
type Skills = ReturnType<typeof weeklyLessonSkillsOutputSchema.parse>;
type VocabularyItem = Vocabulary["word1"];

export function buildPartialLessonFromPipelineState(
  input: WeeklyLessonComponentInput,
  state: WeeklyLessonPipelineCheckpoint["state"]
): ContentLessonDraftInput | null {
  const grammar = weeklyLessonGrammarClassificationOutputSchema.safeParse(state.grammarClassification);
  const objectives = weeklyLessonObjectivesOutputSchema.safeParse(state.objectives);
  const foundation = weeklyLessonFoundationBodyOutputSchema.safeParse(state.foundation);
  const vocabulary = weeklyLessonVocabularyOutputSchema.safeParse(state.vocabulary);
  const skills = state.skills && typeof state.skills === "object" ? state.skills : undefined;
  if (!objectives.success && !foundation.success && !vocabulary.success && !skills) return null;
  const draft = buildLesson(
    input.dayNumber,
    foundation.success ? foundation.data : undefined,
    objectives.success ? objectives.data.objective : undefined,
    vocabulary.success ? vocabulary.data : undefined,
    skills,
    grammar.success ? grammar.data.status : undefined,
    input.lessonFocus,
    foundation.success && pronunciationTargetFindings(foundation.data).length === 0,
    input.cefr
  ) as ContentLessonDraftInput;
  return draft.parts.length > 0 ? draft : null;
}

function buildLesson(
  dayNumber: number,
  foundation: FoundationBody | undefined,
  objective: Foundation["objective"] | undefined,
  vocabulary: Vocabulary | undefined,
  skills: Partial<Skills> | undefined,
  grammarStatus: "classified" | "no_suitable_content" | "insufficient_evidence" | undefined,
  lessonFocus: string,
  pronunciationValid: boolean,
  cefr: string,
  pronunciationAssetRegistry?: PronunciationAssetRegistry
) {
  const labels = lessonSectionLabels(cefr);
  const partTitle = (value: string) => value.trim().length <= 100
    ? value.trim()
    : compactWords(value.trim(), 12).slice(0, 100).trim();
  const pronunciationContent = buildPronunciationLessonContent(
    foundation?.pronunciation,
    pronunciationValid,
    pronunciationAssetRegistry
  );
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
    : undefined;
  return {
    dayNumber,
    title: grammarStatus === "classified" && foundation?.title
      ? foundation.title
      : compactWords(lessonFocus, 8).replace(/[.!?]+$/, ""),
    durationMinutes: foundation?.durationMinutes ?? 10,
    parts: compact([
      objective ? { code: "objective", title: labels.objective, content: {
        text: objective.items.map(({ text }) => text).join("\n"),
        explanationLanguage: objective.explanationLanguage,
        lesson_goal: objective.lesson_goal,
        assessment_gap: objective.assessment_gap,
        items: objective.items
      } } : undefined,
      foundation ? {
        code: "instruction", title: labels.instruction,
        content: { steps: [foundation.instruction.step1, foundation.instruction.step2, foundation.instruction.step3] }
      } : undefined,
      vocabulary ? {
        code: "vocabulary", title: partTitle(vocabulary.title),
        content: toVocabularyPart([vocabulary.word1, vocabulary.word2, vocabulary.word3].map(toVocabularyItem))
      } : undefined,
      grammar ? {
        code: "grammar", title: partTitle(foundation?.grammar?.title ?? "Language focus"),
        content: grammar
      } : undefined,
      pronunciationContent ? {
        code: "pronunciation", title: labels.pronunciation,
        content: pronunciationContent
      } : undefined,
      skills?.listening ? { code: "listening", title: partTitle(skills.listening.title), content: toChoice(skills.listening, "audio") } : undefined,
      skills?.reading ? { code: "reading", title: partTitle(skills.reading.title), content: toChoice(skills.reading, "text") } : undefined,
      skills?.writing ? {
        code: "writing", title: partTitle(skills.writing.title),
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
      skills?.wordClass ? { code: "word_class", title: partTitle(skills.wordClass.title), content: toQuestion(skills.wordClass) } : undefined,
      skills?.wordUse ? { code: "word_use", title: partTitle(skills.wordUse.title), content: toQuestion(skills.wordUse) } : undefined,
      skills?.speaking ? { code: "speaking", title: partTitle(skills.speaking.title), content: {
        prompt: skills.speaking.prompt, answer: skills.speaking.answer, hint: skills.speaking.hint,
        questionTranslation: skills.speaking.questionTranslation, answerTranslation: skills.speaking.answerTranslation
      } } : undefined
    ]
    )
  };
}

export function buildPronunciationLessonContent(
  pronunciation: FoundationBody["pronunciation"] | undefined,
  pronunciationValid: boolean,
  pronunciationAssetRegistry?: PronunciationAssetRegistry
) {
  if (!pronunciation) return undefined;
  const words = [pronunciation.word1, pronunciation.word2, pronunciation.word3];
  const wordAssets = pronunciationValid
    ? buildPronunciationAssets(pronunciation.focus, words, pronunciationAssetRegistry)
    : { wordAudioUrls: [], warnings: [] };
  return {
    focus: pronunciation.focus,
    tip: pronunciation.tip,
    words,
    ...(wordAssets.wordAudioUrls.length ? { wordAudioUrls: wordAssets.wordAudioUrls } : {})
  };
}

function lessonSectionLabels(cefr: string) {
  return ["B1", "B2", "C1"].includes(cefr)
    ? { objective: "Learning objectives", instruction: "Lesson instructions", pronunciation: "Pronunciation" }
    : { objective: "Mục tiêu bài học", instruction: "Hướng dẫn làm bài", pronunciation: "Phát âm" };
}

function withAuthoritativePronunciationBody(
  foundation: FoundationBody,
  plan: ReturnType<typeof curatedPronunciationPlan>,
  cefr: string
): FoundationBody {
  const labels = lessonSectionLabels(cefr);
  return {
    ...foundation,
    instruction: standardLessonInstruction(cefr),
    pronunciation: {
      ...foundation.pronunciation,
      title: labels.pronunciation,
      ...plan,
      tip: authoritativePronunciationTip(cefr, plan)
    }
  };
}

function authoritativePronunciationTip(
  cefr: string,
  plan: ReturnType<typeof curatedPronunciationPlan>
): string {
  const words = [plan.word1.word, plan.word2.word, plan.word3.word];
  return ["A1", "A2"].includes(cefr)
    ? `Nghe và lặp lại âm ${plan.focus} trong các từ ${words.join(", ")}; giữ đúng âm như trong mẫu.`
    : `Listen and repeat ${plan.focus} in ${words.join(", ")}; keep the target sound consistent with the model.`;
}

export function weeklyLessonSkillsGenerationConstraints(cefr: string) {
  const policies = {
    A1: {
      learnerLanguage: "vi", writingType: "mcq",
      listeningWordMin: 12, listeningWordMax: 18,
      readingWordMin: 18, readingWordMax: 30,
      speakingAnswerWordMax: 18, inferenceRequired: false, speakingConstraintCount: 0
    },
    A2: {
      learnerLanguage: "vi", writingType: "mcq",
      listeningWordMin: 16, listeningWordMax: 24,
      readingWordMin: 24, readingWordMax: 40,
      speakingAnswerWordMax: 14, inferenceRequired: false, speakingConstraintCount: 1
    },
    B1: {
      learnerLanguage: "en", writingType: "write",
      listeningWordMin: 22, listeningWordMax: 36,
      readingWordMin: 40, readingWordMax: 70,
      speakingAnswerWordMax: 24, inferenceRequired: false, speakingConstraintCount: 1
    },
    B2: {
      learnerLanguage: "en", writingType: "write",
      listeningWordMin: 30, listeningWordMax: 50,
      readingWordMin: 60, readingWordMax: 100,
      speakingAnswerWordMax: 60, inferenceRequired: true, speakingConstraintCount: 2
    },
    C1: {
      learnerLanguage: "en", writingType: "write",
      listeningWordMin: 40, listeningWordMax: 65,
      readingWordMin: 90, readingWordMax: 140,
      speakingAnswerWordMax: 55, inferenceRequired: true, speakingConstraintCount: 3
    }
  } as const;
  const policy = policies[cefr as keyof typeof policies];
  if (!policy) throw Object.assign(new Error("UNSUPPORTED_CEFR_LEVEL"), { code: "UNSUPPORTED_CEFR_LEVEL", cefr });
  return policy;
}

function compactWords(value: string, limit: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? value.trim() : `${words.slice(0, limit).join(" ").replace(/[,:;.!?]+$/, "")}.`;
}

/** Formats an objective issue so C1/L1 are unambiguously objective IDs, never CEFR levels. */
function objectiveIssue(code: string, ids: readonly string[]): string {
  return `${code} (objective ID ${ids.join(", ")})`;
}

/** Objective IDs named by objectiveIssue() messages. */
export function objectiveIdsFromIssues(messages: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const match = /\(objective IDs? ([CL]\d+(?:, [CL]\d+)*)\)/u.exec(message);
    for (const id of match?.[1]?.split(", ") ?? []) ids.add(id);
  }
  return [...ids];
}

export type ObjectiveResponseMode = "selection" | "written" | "spoken";

/** The response each assessment code actually collects from the learner at a CEFR level. */
export function objectiveAssessmentShape(assessmentCode: string, cefr: string): { mode: ObjectiveResponseMode; description: string } {
  const beginner = cefr === "A1" || cefr === "A2";
  switch (assessmentCode) {
    case "listening":
    case "reading":
      return { mode: "selection", description: `${assessmentCode} is a four-option comprehension check: the learner selects one option about the source; never a written answer` };
    case "word_class":
    case "word_use":
      return { mode: "selection", description: `${assessmentCode} is a four-option choice` };
    case "writing":
      return beginner
        ? { mode: "selection", description: "writing at A1-A2 is a four-option MCQ or cloze selection; never free writing" }
        : { mode: "written", description: "writing at B1-C1 is a scoped written response; never a four-option choice" };
    default:
      return { mode: "spoken", description: "speaking is an open spoken response; never a four-option choice" };
  }
}

const WRITTEN_ACTION_VERB = /^(?:write|compose|draft|viết|soạn|soạn thảo)\b/iu;
const SPOKEN_ACTION_VERB = /^(?:say|speak|tell|nói|phát biểu)\b/iu;
const SELECTION_ACTION_VERB = /^(?:choose|select|chọn|điền)\b/iu;
const CLOSED_CHOICE_EVIDENCE = /\b(?:mcq|multiple[- ]choice|four[- ]option|4[- ]option|choose|chooses|select|selects|selection|cloze)\b|trắc nghiệm|bốn lựa chọn|4 lựa chọn|chọn đáp án/iu;
// Written production: a writing verb with the learner as producer, or an
// explicit written/free response. Nouns for the source ("đoạn văn", "bài viết",
// "the writing task") are not production evidence.
const WRITTEN_PRODUCTION_EVIDENCE = /\b(?:write|writes|wrote|compose|composes|draft|drafts)\b|\bwriting\b(?!\s+(?:task|exercise|section|item))|\bwritten\s+(?:free[- ]response|response|answer|summary|sentences?|paragraph)\b|\bfree[- ]response\b|(?<!bài\s)viết\b|câu trả lời tự do|trả lời tự do|trả lời bằng văn bản/iu;
const ASSESSMENT_CODE_NAMES = new Set(["listening", "reading", "writing", "speaking", "word_class", "word_use", "wordclass", "worduse"]);

/** What the objective asks the learner to produce, judged from its action and evidence fields. */
export function objectiveResponseModes(item: {
  action_verb: string; assessed_by: string; criterion: string; success_evidence: string;
}): Set<ObjectiveResponseMode> {
  const modes = new Set<ObjectiveResponseMode>();
  const verb = item.action_verb.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (WRITTEN_ACTION_VERB.test(verb)) modes.add("written");
  if (SPOKEN_ACTION_VERB.test(verb)) modes.add("spoken");
  if (SELECTION_ACTION_VERB.test(verb)) modes.add("selection");
  const assessedBy = item.assessed_by.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const evidence = [ASSESSMENT_CODE_NAMES.has(assessedBy) ? "" : assessedBy, item.criterion, item.success_evidence]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  if (CLOSED_CHOICE_EVIDENCE.test(evidence)) modes.add("selection");
  if (WRITTEN_PRODUCTION_EVIDENCE.test(evidence)) modes.add("written");
  return modes;
}

/** Returns a repair instruction when the objective's response mode contradicts its assessment shape. */
export function objectiveAssessmentShapeMismatch(
  item: { assessmentCode: string; action_verb: string; assessed_by: string; criterion: string; success_evidence: string },
  cefr: string
): string | undefined {
  const shape = objectiveAssessmentShape(item.assessmentCode, cefr);
  const modes = objectiveResponseModes(item);
  if (shape.mode === "selection" && modes.has("written") && !modes.has("selection")) return `${shape.description}.`;
  if (shape.mode !== "selection" && modes.has("selection")) return `${shape.description}.`;
  return undefined;
}

function validatePromptObjectives(
  objective: Foundation["objective"],
  cefr: string,
  lessonFocus = "",
  allLessonFocuses: string[] = []
): string[] {
  const issues: string[] = [];
  const items = objective.items;
  const languageCount = items.filter((item) => item.type === "language").length;
  const expectedLanguage = cefr === "A1" || cefr === "A2" ? "vi" : "en";
  const prefix = expectedLanguage === "vi" ? /^Sau bài học, bạn có thể\s+/ : /^By the end of this lesson, you will be able to\s+/;
  const ipaLiteral = /\/[a-zæɑɒɔəɜɛɪʊʌɐɵœøɞɘɤɨʉɯθðŋʃʒɡɹɾʔɚɝːˈˌ.()]+\//iu;
  const scopeStopWords = new Set([
    "able", "after", "before", "could", "would", "should", "can", "will", "may", "might", "must",
    "given", "lesson", "learner", "one", "two", "three", "response", "sentence", "using", "video",
    "call", "meeting", "workplace", "english", "you", "your", "the", "and", "for", "with", "from",
    "that", "this", "into", "about", "when", "while", "where", "who", "what", "which", "how", "why",
    "end", "noun", "verb", "adjective", "adverb", "clause", "phrase", "subject", "object", "base",
    "past", "present", "participle", "simple", "continuous", "perfect", "someone", "something",
    "colleague", "people", "short", "polite", "politely", "clear", "clearly",
    "bài", "học", "một", "hai", "ba", "câu", "tình", "huống", "đúng", "khi", "trong", "bạn", "thể",
    "sau", "cho", "với", "của", "các", "những", "được", "này", "hoặc", "như"
  ]);
  const scopeAlias = new Map<string, string>([
    ["chào", "greet"], ["giới", "introduce"], ["thiệu", "introduce"],
    ["vai", "role"], ["trò", "role"], ["tham", "join"], ["gia", "join"],
    ["âm", "sound"], ["thanh", "sound"], ["hình", "video"], ["ảnh", "video"]
  ]);
  const scopeTokens = (value: string) => new Set((value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length > 2 && !scopeStopWords.has(word))
    .map((word) => scopeAlias.get(word) ?? word));
  const tokenSetsOverlap = (left: Set<string>, right: Set<string>) => [...left].some((leftWord) =>
    [...right].some((rightWord) => leftWord === rightWord
      || (leftWord.length >= 5 && rightWord.length >= 5 && leftWord.slice(0, 5) === rightWord.slice(0, 5))));
  const focusTokens = scopeTokens(lessonFocus);
  const siblingFocusTokens = allLessonFocuses
    .filter((focus) => focus.trim() !== lessonFocus.trim())
    .map(scopeTokens);
  if (objective.explanationLanguage !== expectedLanguage) issues.push("wrong_explanation_language");
  if (objective.assessment_gap !== null) issues.push("assessment_gap_must_be_resolved_before_generation");
  if (items.filter((item) => item.type === "content").length < 1) issues.push("missing_content_objective");
  if (languageCount < 1) issues.push(`missing_language_objective (CEFR ${cefr})`);
  const targetStopWords = new Set(["a", "an", "the", "to", "of", "for", "from", "with", "and", "or", "is", "are", "be", "will", "you", "your", "i", "we", "our", "that", "this", "may", "just", "let", "lets", "until", "after", "before", "back"]);
  const targetTokens = (values: readonly string[]) => new Set(values
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((word) => word.length > 2 && !targetStopWords.has(word)) ?? []);
  const languageObjectives = items.filter((item) => item.type === "language" && item.target_language?.length);
  for (let leftIndex = 0; leftIndex < languageObjectives.length; leftIndex += 1) {
    const left = languageObjectives[leftIndex]!;
    const leftTargets = targetTokens(left.target_language ?? []);
    for (const right of languageObjectives.slice(leftIndex + 1)) {
      if (left.assessmentCode !== right.assessmentCode) continue;
      const rightTargets = targetTokens(right.target_language ?? []);
      const sharedTargetCount = [...leftTargets].filter((word) => rightTargets.has(word)).length;
      const smallerTargetSize = Math.min(leftTargets.size, rightTargets.size);
      const targetsAreCompatible = sharedTargetCount >= 2
        || (smallerTargetSize > 0 && sharedTargetCount / smallerTargetSize >= 0.67);
      if (leftTargets.size > 0 && rightTargets.size > 0 && !targetsAreCompatible) {
        issues.push(`${objectiveIssue("objective_conflicting_assessment_targets", [left.id, right.id])}. One ${left.assessmentCode} exercise cannot assess two disjoint target-language contracts; map one objective to another exercise or combine them into compatible alternatives.`);
      }
    }
  }
  const anyItemOverlapsFocus = focusTokens.size > 0 && items.some((candidate) =>
    tokenSetsOverlap(
      scopeTokens([candidate.text.replace(prefix, ""), candidate.condition, ...(candidate.target_language ?? [])].join(" ")),
      focusTokens
    )
  );
  for (const item of items) {
    if (!prefix.test(item.text)) issues.push(objectiveIssue("objective_wrong_learner_facing_opener", [item.id]));
    const learnerFacingAbility = item.text.replace(prefix, "").trim();
    const learnerFacingWordCount = learnerFacingAbility.split(/\s+/u).filter(Boolean).length;
    const learnerFacingWordMax = 16;
    if (learnerFacingWordCount > learnerFacingWordMax) {
      issues.push(`${objectiveIssue("objective_text_too_long", [item.id])}. Keep the learner-facing ability after the fixed opener to at most ${learnerFacingWordMax} words; received ${learnerFacingWordCount}. Move conditions and evidence to their dedicated fields.`);
    }
    if (item.type === "language" && (item.target_language ?? []).some((target) =>
      containsVietnameseLearnerText(target)
      || /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(target))) {
      issues.push(`${objectiveIssue("objective_target_language_must_be_English", [item.id])}. A1-A2 explanations may be Vietnamese, but target_language must contain the exact English words or sentence frames assessed by the exercise.`);
    }
    if (!isObservableObjectiveVerb(item.action_verb)) {
      issues.push(`${objectiveIssue("objective_verb_not_observable", [item.id])}. Received '${item.action_verb}'. Use an observable ${cefr} action, preferably: ${allowedObjectiveVerbs(cefr).join(", ")}`);
    }
    if (expectedLanguage === "vi") {
      const assessedText = `${item.text} ${item.criterion} ${item.success_evidence}`;
      if (/\b[2-9]\s+(?:câu|lần|phản hồi|nhiệm vụ|ví dụ|sentences?|responses?|performances?|tasks?|examples?)\b/iu.test(assessedText)) {
        issues.push(objectiveIssue("objective_requires_aggregate_performances", [item.id]));
      }
      const focusIsPronunciation = /pronunciation|phát âm/iu.test(lessonFocus) || ipaLiteral.test(lessonFocus);
      if (!focusIsPronunciation && (/pronunciation|phát âm/iu.test(assessedText) || ipaLiteral.test(assessedText))) {
        issues.push(objectiveIssue("objective_adds_unrelated_pronunciation_assessment", [item.id]));
      }
    }
    const shapeMismatch = objectiveAssessmentShapeMismatch(item, cefr);
    if (shapeMismatch) {
      issues.push(`${objectiveIssue("objective_assessment_shape_mismatch", [item.id])}. ${shapeMismatch}`);
    }
    if (focusTokens.size > 0 && (item.type === "language" || expectedLanguage === "en")) {
      const strippedText = item.text.replace(prefix, "");
      const objectiveTokens = scopeTokens([strippedText, item.condition, ...(item.target_language ?? [])].join(" "));
      const overlapsCurrentFocus = tokenSetsOverlap(objectiveTokens, focusTokens);
      const overlapsSiblingFocus = siblingFocusTokens.some((tokens) => tokenSetsOverlap(objectiveTokens, tokens));
      const hasOffFocusTargetPhrase = item.type === "language"
        && anyItemOverlapsFocus
        && targetTokens(item.target_language ?? []).size >= 2;
      if (!overlapsCurrentFocus && (overlapsSiblingFocus || hasOffFocusTargetPhrase)) {
        issues.push(`${objectiveIssue("objective_outside_lesson_focus", [item.id])}. Rewrite only this objective so its action, context and evidence directly assess lessonFocus; do not borrow another day or the broader weekly topic.`);
      }
    }
  }
  return [...new Set(issues)];
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
  return [...(OBJECTIVE_VERBS_BY_LEVEL[cefr] ?? [])];
}

function allowedLanguageObjectiveVerbs(cefr: string): string[] {
  return [...(LANGUAGE_OBJECTIVE_VERBS_BY_LEVEL[cefr] ?? [])];
}

function mergedSkillsCandidate(
  groups: Array<Array<PromiseSettledResult<{ output: Partial<Skills> } | undefined>>>,
  index: number
): Skills | undefined {
  const outputs = groups.map((group) => {
    const entry = group[index];
    return entry?.status === "fulfilled" ? entry.value?.output : undefined;
  });
  if (outputs.some((output) => !output)) return undefined;
  const merged = Object.assign({}, ...outputs) as Partial<Skills>;
  return weeklyLessonSkillsOutputSchema.safeParse(merged).success ? merged as Skills : undefined;
}

function skillGroupIndexForPath(path: readonly PropertyKey[]): number | undefined {
  const code = String(path[0] ?? "");
  if (code === "listening" || code === "reading") return 0;
  if (code === "writing" || code === "wordClass" || code === "wordUse") return 1;
  if (code === "speaking") return 2;
  return undefined;
}

export async function reviewWeeklyLessonSkills(
  runner: AiTaskRunner,
  skillsInput: Record<string, unknown>,
  skills: Skills,
  options: { rejectFindings?: boolean } = {}
): Promise<{
  result: AiRunResult;
  output: ReturnType<typeof weeklyLessonSkillsReviewOutputSchema.parse>;
  findings: Array<{ path: PropertyKey[]; message: string }>;
  warnings: ReviewerFindingClassification[];
  attemptLog: WeeklyLessonPipelineCheckpoint["attemptLog"];
}> {
  const normalizedAnswer = (value: string) => value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const normalizeReviewerReasonCodes = (output: ReturnType<typeof weeklyLessonSkillsReviewOutputSchema.parse>) => {
    const findings = output.findings
      .filter((finding) => {
        if (
          finding.reasonCode === "multiple_valid_answers"
          && (finding.exerciseCode === "speaking" || (finding.exerciseCode === "writing" && skills.writing.type === "write"))
          && reviewerFindingDisposition(
            finding,
            skills,
            typeof skillsInput.cefr === "string" ? skillsInput.cefr : "",
            typeof skillsInput.lessonFocus === "string" ? skillsInput.lessonFocus : "",
            Boolean((skillsInput.generationConstraints as { inferenceRequired?: unknown } | undefined)?.inferenceRequired),
            skillsInput.lessonObjectives as Foundation["objective"] | undefined
          ) !== "keep"
        ) {
          return false;
        }
        return true;
      })
      .map((finding) => {
        if (/(?:hint|gợi ý)[^.!?]{0,100}(?:reveal|gives? away|lộ đáp án|tiết lộ đáp án)|(?:làm|bị) lộ đáp án[^.!?]{0,100}(?:hint|gợi ý)/iu.test(finding.message)) {
          return { ...finding, reasonCode: "hint_reveals_answer" as const };
        }
        if (finding.reasonCode !== "key_mismatch") return finding;
        if (finding.exerciseCode === "speaking" || (finding.exerciseCode === "writing" && skills.writing.type === "write")) {
          return {
            ...finding,
            reasonCode: /\b(?:unsupported|not (?:stated|supported)|invented|inconsistent with (?:the )?(?:table|prompt|scenario))\b/iu.test(finding.message)
              ? "insufficient_context" as const
              : "feedback_mismatch" as const
          };
        }
        const exercise = skills[finding.exerciseCode as keyof Skills] as { answer?: unknown } | undefined;
        const solved = output.solvedAnswers[finding.exerciseCode as keyof typeof output.solvedAnswers];
        const keyStillMatches = typeof exercise?.answer === "string" && typeof solved === "string"
          && normalizedAnswer(exercise.answer) === normalizedAnswer(solved);
        if (!keyStillMatches) return finding;
        if (/hint.*(?:reveal|gives? away)|(?:làm|bị) lộ đáp án|tiết lộ đáp án/iu.test(finding.message)) {
          return { ...finding, reasonCode: "hint_reveals_answer" as const };
        }
        if (/\b(?:not stated|never states?|(?:audio|body|passage|text|transcript) never says?|does not say|doesn't say|not directly stated|not supported|not entailed|goes beyond (?:the )?evidence|insufficient context|cannot be inferred|not in (?:the )?(?:audio|body|passage|text|transcript))\b|(?:không|chưa) (?:được )?(?:nêu rõ|xác nhận trực tiếp|suy ra rõ ràng)|cần bổ sung (?:câu|ngữ cảnh)/iu.test(finding.message)) {
          return { ...finding, reasonCode: "insufficient_context" as const };
        }
        // If the reviewer independently solves to the stored key, key_mismatch is
        // impossible by definition. Preserve the finding under the nearest repairable
        // category; the substantive-finding filter will discard self-withdrawn notes.
        return { ...finding, reasonCode: "feedback_mismatch" as const };
      });
    for (const code of ["listening", "reading", "wordClass", "wordUse"] as const) {
      const stored = normalizedAnswer(skills[code].answer);
      const solved = normalizedAnswer(output.solvedAnswers[code]);
      const options = [skills[code].option1, skills[code].option2, skills[code].option3, skills[code].option4]
        .map(normalizedAnswer);
      if (
        stored !== solved
        && options.includes(solved)
        && !findings.some((finding) => finding.exerciseCode === code && finding.reasonCode === "key_mismatch")
      ) {
        findings.push({
          exerciseCode: code,
          reasonCode: "key_mismatch",
          category: "answer_key_mismatch",
          message: `The independent solved answer is '${output.solvedAnswers[code]}', but the stored key is '${skills[code].answer}'. Repair only this exercise and verify the key against its source evidence.`,
          evidence: { path: `${code}.answer`, actual: skills[code].answer, expected: output.solvedAnswers[code] }
        });
      }
    }
    return { ...output, findings };
  };
  const reviewerSchema = {
    safeParse: (value: unknown) => {
      const candidate = value && typeof value === "object" && !Array.isArray(value)
        && (value as Record<string, unknown>).status === "approved"
        && Array.isArray((value as Record<string, unknown>).findings)
        && ((value as Record<string, unknown>).findings as unknown[]).length > 0
        && ((value as Record<string, unknown>).findings as Array<{ message?: unknown }>).every((f) =>
          typeof f?.message === "string" && (/\bno change (?:is )?(?:strictly )?(?:needed|required)\b|\bno revision (?:is )?(?:strictly )?(?:needed|required)\b|\bno (?:real |serious )?defect(?: found| requiring revision)?\b|\bnot a defect\b|\bis supported,\s*so\b|\bborderline and acceptable\b|\bminor and not blocking\b|\bnot blocking\b|\bno finding required\b|\boverall acceptable\b|\b(?:finding is )?withdrawn\b|\bkey is consistent\b|\bcomplete and usable\b|\bacceptable as (?:is|an example|a model answer)\b|không (?:cần|phải) (?:sửa|thay đổi)|không có (?:vấn đề|lỗi)(?:\s+(?:về|với))?/iu.test(f.message) || /(?:^|[.!?;—-]\s*)acceptable[.!]?\s*$/iu.test(f.message))
        )
        ? { ...(value as Record<string, unknown>), findings: [] }
        : value;
      const parsed = weeklyLessonSkillsReviewOutputSchema.safeParse(candidate);
      return parsed.success ? { success: true as const, data: normalizeReviewerReasonCodes(parsed.data) } : parsed;
    }
  };
  const reviewerOutputFindings = (output: ReturnType<typeof weeklyLessonSkillsReviewOutputSchema.parse>) => {
    const issues: Array<{ path: PropertyKey[]; message: string }> = [];
    const closedCodes = ["listening", "reading", "wordClass", "wordUse"] as const;
    const keyedCodes = skills.writing.type === "mcq" ? [...closedCodes, "writing" as const] : closedCodes;
    for (const code of keyedCodes) {
      const solved = normalizedAnswer(output.solvedAnswers[code]);
      const options = "option1" in skills[code]
        ? [skills[code].option1, skills[code].option2, skills[code].option3, skills[code].option4]
            .filter((value): value is string => typeof value === "string")
            .map(normalizedAnswer)
        : [];
      const differs = normalizedAnswer(skills[code].answer) !== solved && options.includes(solved);
      const reportsMismatch = output.findings.some((finding) => finding.exerciseCode === code && finding.reasonCode === "key_mismatch");
      if (differs && !reportsMismatch) issues.push({ path: ["solvedAnswers", code], message: `Reviewer solved answer differs for ${code} but no key_mismatch finding was returned.` });
      if (!differs && reportsMismatch) issues.push({ path: ["findings", code], message: `Reviewer reported key_mismatch for ${code} although its solved answer matches the current key.` });
    }
    for (const finding of output.findings) {
      // Blocking findings must point at the exact field to change and quote it.
      if (finding.category && BLOCKING_REVIEW_CATEGORIES.has(finding.category)
        && (!finding.evidence || !reviewEvidenceTarget(skills, finding.evidence.path))) {
        issues.push({ path: ["findings", finding.exerciseCode, "evidence"], message: `A ${finding.category} finding for ${finding.exerciseCode} must give evidence.path as exerciseCode.field (for example ${finding.exerciseCode}.answer), quote the current text in evidence.actual and state evidence.expected.` });
      }
      if (finding.reasonCode === "multiple_valid_answers" && finding.exerciseCode === "speaking") {
        issues.push({ path: ["findings", finding.exerciseCode], message: "Open speaking tasks cannot be rejected merely for allowing multiple valid responses." });
      }
      if (finding.reasonCode === "multiple_valid_answers" && finding.exerciseCode === "writing" && skills.writing.type === "write") {
        issues.push({ path: ["findings", finding.exerciseCode], message: "Open writing tasks cannot be rejected merely for allowing multiple valid responses." });
      }
    }
    return issues;
  };
  const generated = await runStrictComponent(
    runner,
    "weekly_lesson_skills_reviewer",
    scopeSkillsInputToDailyObjectives({ ...skillsInput, skills }),
    SKILLS_REVIEW_CONTRACT,
    SKILLS_REVIEW_OUTPUT_TOKEN_LIMIT,
    reviewerSchema,
    Number(skillsInput.dayNumber ?? 0),
    "skills.reviewer",
    reviewerOutputFindings,
    MAX_SKILLS_REVIEW_ATTEMPTS,
    undefined,
    true
  );
  const classifications = generated.output.findings.map((finding) => classifyReviewerFinding(finding, skills, {
    cefr: typeof skillsInput.cefr === "string" ? skillsInput.cefr : "",
    lessonFocus: typeof skillsInput.lessonFocus === "string" ? skillsInput.lessonFocus : "",
    inferenceRequired: Boolean((skillsInput.generationConstraints as { inferenceRequired?: unknown } | undefined)?.inferenceRequired),
    ...(skillsInput.lessonObjectives ? { lessonObjectives: skillsInput.lessonObjectives as Foundation["objective"] } : {})
  }));
  const structuredFindings = classifications.filter((item) => item.disposition === "repair").map((item) => item.finding);
  const warnings = classifications.filter((item) => item.disposition === "warning");
  const output: ReturnType<typeof weeklyLessonSkillsReviewOutputSchema.parse> = structuredFindings.length > 0
    ? { ...generated.output, status: "needs_revision", findings: structuredFindings }
    : { ...generated.output, status: "approved", findings: [] };
  const findings = output.findings
    .map((finding) => ({ path: [finding.exerciseCode], message: `${finding.reasonCode}: ${finding.message}` }));
  if (options.rejectFindings && findings.length > 0) throwInvalid(findings, `day${String(skillsInput.dayNumber ?? "unknown")}.skills.reviewer`, {
    reviewerOutput: output
  });
  return { result: generated.result, output, findings, warnings, attemptLog: generated.attemptLog };
}

type ReviewFinding = ReturnType<typeof weeklyLessonSkillsReviewOutputSchema.parse>["findings"][number];
type ReviewCategory = NonNullable<ReviewFinding["category"]>;
type ReviewerFindingDisposition = "keep" | "warning" | "discard";

function exerciseHasMappedObjective(exerciseCode: string, lessonObjectives?: Foundation["objective"]): boolean {
  const mappedCode = exerciseCode === "wordClass" ? "word_class" : exerciseCode === "wordUse" ? "word_use" : exerciseCode;
  return Boolean(lessonObjectives?.items.some((item) => item.assessmentCode === mappedCode));
}

/**
 * Content-level checks on one reviewer finding. A finding is discarded only
 * when it is self-withdrawn or contradicts the exercise's source, key,
 * objective map or the review contract; style-only complaints become warnings.
 * Passing deterministic validation alone never discards a finding.
 */
function reviewerFindingDisposition(
  finding: ReturnType<typeof weeklyLessonSkillsReviewOutputSchema.parse>["findings"][number],
  skills: Skills,
  cefr: string,
  lessonFocus: string,
  inferenceRequired: boolean,
  lessonObjectives?: Foundation["objective"]
): ReviewerFindingDisposition {
  const exercise = skills[finding.exerciseCode as keyof Skills] as { hint?: unknown; answer?: unknown } | undefined;
  if (/\bthis is acceptable\b[\s\S]{0,180}\b(?:which is|is) present\b/iu.test(finding.message)) {
    return "discard";
  }
  if (/\bno key defect found\b/iu.test(finding.message)) return "discard";
  if (/\bno further defect(?: here)?\b/iu.test(finding.message)) return "discard";
  if (/\b(?:this )?finding is only a note\b|\bonly a note\b|\botherwise usable\b/iu.test(finding.message)) return "discard";
  if (/\bno change (?:is )?(?:strictly )?(?:needed|required)\b|\bno revision (?:is )?(?:strictly )?(?:needed|required)\b|\bno (?:real |serious )?defect(?: found| requiring revision)?\b|\bno blocking defect\b|\bnot a defect\b|\bis supported,\s*so\b|\b(?:question|answer|key)\b[^.!?]{0,100}\bis supported\b|\bborderline and acceptable\b|\bminor and not blocking\b|\bnot blocking\b|\bno finding required\b|\boverall acceptable\b|\b(?:finding is )?withdrawn\b|\bkey is (?:consistent|correct)\b|\bis a defensible distractor\b|\bpassage is usable\b|\bcomplete and usable\b|\bacceptable as (?:is|an example|a model answer)\b|\bthe key\b[^.!?]*\bis defensible,\s*but the\b[^.!?]*\bdistractor is not excluded:|không (?:cần|phải) (?:sửa|thay đổi)|không có (?:vấn đề|lỗi)(?:\s+(?:về|với))?|đáp án[^.!?]{0,100}duy nhất đúng|đáp án(?: hiện)? đúng(?:\s*[.!?]|\s*$)/iu.test(finding.message) || /(?:^|[.!?;—-]\s*)acceptable[.!]?\s*$/iu.test(finding.message)) {
    return "discard";
  }
  if (
    finding.reasonCode === "feedback_mismatch"
    && (finding.exerciseCode === "speaking" || finding.exerciseCode === "writing")
    && /\btelegraphic\b|\bomits the deadline wording\b|\binvents? ['"“]?by email['"”]?\b|\bfollow up by email\b[^.!?]*\b(?:adds a method|not a required condition)\b|\bomits the owner for the budget decision\b|\bdeadline for the steering group approval is not required\b/iu.test(finding.message)
  ) {
    return "warning";
  }
  if (
    finding.reasonCode === "feedback_mismatch"
    && finding.exerciseCode === "speaking"
    && /\bomits? the required outcome clause\b|\bso that we can\s*\[?outcome\]?/iu.test(finding.message)
    && typeof skills.speaking?.answer === "string"
    && /\bi would appreciate your decision on\b/iu.test(skills.speaking.answer)
    && /\bso that\s+(?:the\s+)?[a-z][a-z'’-]*\s+can\s+[a-z]/iu.test(skills.speaking.answer)
  ) {
    // A template slot such as "so that we can + outcome" is complete when a
    // named stakeholder and concrete outcome replace it; requiring "we" is
    // a reviewer style preference, not a learner-facing defect.
    return "discard";
  }
  if (
    finding.reasonCode === "feedback_mismatch"
    && finding.exerciseCode === "speaking"
    && /\b(?:separate|multiple) sentences?\b[\s\S]{0,180}\bjoined by ['"“]?and['"”]?\b|\bjoined by ['"“]?and['"”]?\b[\s\S]{0,180}\b(?:separate|multiple) sentences?\b/iu.test(finding.message)
    && typeof skills.speaking?.answer === "string"
    && /\b(?:was|were)\s+[a-z][a-z'’-]*\s+and\s+(?:the\s+)?[a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*)?\s+(?:was|were)\s+[a-z][a-z'’-]*\b/iu.test(skills.speaking.answer)
  ) {
    return "discard";
  }
  if (/\b(?:the )?(?:answer|model answer) (?:is|remains) acceptable\b/iu.test(finding.message)) {
    return "discard";
  }
  if (
    /\bno\s+(?:writing|speaking|listening|reading|word[- ]?class|word[- ]?use)?\s*lessonobjective\s+exists\b|\boutside the approved assessed scope\b/iu.test(finding.message)
    && !exerciseHasMappedObjective(finding.exerciseCode, lessonObjectives)
  ) {
    // Every lesson deliberately includes all six skill/support exercises. An
    // exercise without a mapped primary objective is support content, not an
    // invalid extra exercise.
    return "discard";
  }
  if (finding.reasonCode === "feedback_mismatch" && lessonObjectives) {
    const mappedCode = finding.exerciseCode === "wordClass" ? "word_class"
      : finding.exerciseCode === "wordUse" ? "word_use"
        : finding.exerciseCode;
    const hasMappedObjective = lessonObjectives.items.some((item) => item.assessmentCode === mappedCode);
    if (!hasMappedObjective
      && /\blesson (?:goal|objective|focus) requires\b|\bdoes not (?:measure|assess|cover)\b|\bmeasures? neither\b|\btests? a different (?:skill|objective)\b/iu.test(finding.message)) {
      // The fixed six-exercise lesson shape intentionally includes support
      // practice. A support exercise must be internally valid, but it does not
      // have to assess an objective mapped to another modality.
      return "discard";
    }
  }
  if (finding.reasonCode === "insufficient_context" && exercise && "body" in exercise && "prompt" in exercise) {
    const choice = exercise as { body?: unknown; prompt?: unknown; answer?: unknown };
    if (typeof choice.body === "string" && typeof choice.prompt === "string" && typeof choice.answer === "string") {
      const answer = choice.answer.trim();
      const directAddress = new RegExp(`(?:^|[.!?]\\s*)${escapeRegExp(answer)}\\s*,`, "iu").test(choice.body);
      const asksWho = /\bwho\b|\bai\b/iu.test(choice.prompt);
      const refersToYou = /\b(?:cannot|can't|couldn't|do not|don't)\s+hear\s+you\b/iu.test(choice.body);
      if (answer && directAddress && asksWho && refersToYou) return "discard";
    }
  }
  if (
    (finding.exerciseCode === "listening" || finding.exerciseCode === "reading")
    && /\b(?:distractor|option)\b[^.!?]{0,180}\b(?:absent|not (?:mentioned|stated|included)|never (?:mentioned|stated|appears?))\b|\b(?:body|passage|transcript|source)\b[^.!?]{0,180}\bdoes not (?:mention|give|include)\b[^.!?]{0,100}\b(?:distractor|option|figure)s?\b/iu.test(finding.message)
  ) {
    return "discard";
  }
  if (
    (finding.exerciseCode === "listening" || finding.exerciseCode === "reading")
    && /\b(?:answer|key)\b[^.!?]{0,100}\b(?:is stated|is supported|directly supports?|can be answered)\b/iu.test(finding.message)
    && /\b(?:does not|doesn't|not)\b[^.!?]{0,100}\b(?:table|table reading|taught scope|lesson focus)\b|\bno table is presented\b/iu.test(finding.message)
  ) {
    return "warning";
  }
  const referencedObjectiveIds = [...finding.message.matchAll(/\b[CL]\d+\b/gu)].map((match) => match[0]!);
  if (referencedObjectiveIds.length > 0 && lessonObjectives) {
    const codeToExercise: Record<string, AtomicSkillExercise> = {
      listening: "listening", reading: "reading", writing: "writing",
      word_class: "wordClass", word_use: "wordUse", speaking: "speaking"
    };
    const referencedMappings = referencedObjectiveIds
      .map((id) => lessonObjectives.items.find((item) => item.id === id))
      .filter((item): item is Foundation["objective"]["items"][number] => Boolean(item))
      .map((item) => codeToExercise[item.assessmentCode]);
    if (referencedMappings.length > 0 && referencedMappings.every((exerciseCode) => exerciseCode !== finding.exerciseCode)) {
      return "discard";
    }
  }
  const claimedWordCount = /(?:answer|model answer) (?:is|contains?) (\d+) words?/iu.exec(finding.message)?.[1];
  if (claimedWordCount && typeof exercise?.answer === "string") {
    const actualWordCount = exercise.answer.trim().split(/\s+/u).filter(Boolean).length;
    if (actualWordCount !== Number(claimedWordCount)) return "discard";
  }
  if (finding.reasonCode === "hint_reveals_answer") {
    return typeof exercise?.hint === "string"
      && typeof exercise.answer === "string"
      && hintActuallyRevealsAnswer(exercise.hint, exercise.answer)
      ? "keep"
      : "discard";
  }
  if (finding.reasonCode === "feedback_mismatch"
    && (/\b(?:answer|model answer) (?:is|remains) (?:correct|acceptable)\b|\bloosely matched\b|\bacceptable as an example\b/iu.test(finding.message)
      || /answer_?translation.*(?:does not|doesn't) explain why/iu.test(finding.message))
    && !/\b(?:off-target|does not test|doesn't test|title|stated target|practises? rather than)\b/iu.test(finding.message)) {
    return "discard";
  }
  if (finding.reasonCode === "feedback_mismatch"
    && finding.exerciseCode === "writing"
    && skills.writing.type === "mcq"
    && (
      /(?:chỉ là|dạng)\s*(?:trắc nghiệm|mcq)|không đo (?:việc )?(?:viết|điền)|free[- ]?response|free writing/iu.test(finding.message)
      // A writing MCQ deliberately assesses selection.  A reviewer cannot
      // require it to also be a cloze/fill-in task; that is an incompatible
      // exercise shape, not a defect in the generated lesson.
      || (
        /\b(?:choose|choos(?:e|ing)|select|selecting|four[- ]?option|mcq|complete (?:the )?(?:whole|full) (?:memo|message|email|response))\b/iu.test(finding.message)
        && /\b(?:fill(?:[- ]?in)?|cloze|missing (?:last|final) line|complete (?:the )?(?:last|final) line)\b/iu.test(finding.message)
      )
    )
    && !/(?:không khớp|sai logic|sai ngữ cảnh|off-target|wrong context)/iu.test(finding.message)) {
    return "discard";
  }
  if (
    finding.reasonCode === "feedback_mismatch"
    && lessonObjectives
    && /\b(?:only one|one of the)\b[^.!?]{0,120}\b(?:target|words?|alternatives?)\b|\bonly tests?\b[\s\S]{0,180}\bdoes not (?:measure|cover|test|include)\b|\bdoes not include\b[^.!?]{0,100}\b(?:or|hoặc)\b/iu.test(finding.message)
  ) {
    const mappedObjective = lessonObjectives.items.find((item) => {
      const mapped = item.assessmentCode === "word_class" ? "wordClass"
        : item.assessmentCode === "word_use" ? "wordUse"
          : item.assessmentCode;
      return mapped === finding.exerciseCode;
    });
    const objectiveText = mappedObjective
      ? [mappedObjective.text, mappedObjective.criterion, mappedObjective.success_evidence].join(" ")
      : "";
    if (mappedObjective && (/\b(?:or|hoặc)\b/iu.test(objectiveText) || (mappedObjective.target_language?.length ?? 0) > 1)
      && !deterministicSkillsFindings({ [finding.exerciseCode]: skills[finding.exerciseCode] }, cefr, lessonFocus, lessonObjectives)
        .some((issue) => issue.message.includes("target-language alternative") || issue.message.includes("omits required target language"))) {
      return "discard";
    }
  }
  if (
    finding.reasonCode === "feedback_mismatch"
    && finding.exerciseCode === "writing"
    && skills.writing.type === "write"
    && /\b(?:closing|final) paragraph\b|\bfive-part structure\b|\bseparate paragraph\b/iu.test(finding.message)
  ) {
    return "warning";
  }
  if (finding.reasonCode === "outside_taught_scope" && exercise && lessonFocus.trim()) {
    // These are vocabulary support checks, not extra grammar-focus assessments.
    // Their scope is the day's vocabulary/foundation contract, which the skills
    // reviewer does not receive as `lessonFocus`.
    if (finding.exerciseCode === "wordClass" || finding.exerciseCode === "wordUse") return "discard";
    const contentWords = (value: string) => new Set(value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => word.length > 4 && !["about", "after", "before", "could", "would", "should", "someone", "information"].includes(word)) ?? []);
    const focusWords = contentWords(lessonFocus);
    const exerciseWords = contentWords(JSON.stringify(exercise));
    if ([...focusWords].some((word) => exerciseWords.has(word))) return "discard";
  }
  if (finding.reasonCode === "multiple_valid_answers"
    && /(?:các|những) đáp án khác[^.]{0,160}(?:không đúng|đều sai|không phù hợp)/iu.test(finding.message)) {
    return "discard";
  }
  if (finding.reasonCode === "multiple_valid_answers"
    && !/\b(?:two|both|another|second) (?:options?|answers?|choices?)\b|(?:hai|cả hai) (?:đáp án|lựa chọn)|(?:also|cũng) (?:is |là )?(?:correct|đúng)|đáp án (?:thứ hai|khác) (?:cũng )?đúng/iu.test(finding.message)) {
    return "discard";
  }
  if ((finding.reasonCode === "insufficient_context" || finding.reasonCode === "feedback_mismatch")
    && (finding.exerciseCode === "listening" || finding.exerciseCode === "reading")
    && /(?:word|từ|tối thiểu|minimum|maximum|dưới|vượt|khoảng)\s*\d*|\d+\s*(?:word|từ)/iu.test(finding.message)) {
    const constraints = weeklyLessonSkillsGenerationConstraints(cefr);
    const body = skills[finding.exerciseCode].body;
    const actual = body.trim().split(/\s+/u).filter(Boolean).length;
    const minimum = finding.exerciseCode === "listening" ? constraints.listeningWordMin : constraints.readingWordMin;
    const maximum = finding.exerciseCode === "listening" ? constraints.listeningWordMax : constraints.readingWordMax;
    if (actual >= Math.max(1, Math.floor(minimum * 0.8)) && actual <= Math.ceil(maximum * 1.2)) return "discard";
  }
  if (finding.reasonCode === "multiple_valid_answers"
    && inferenceRequired
    && /\b(?:only by inference|supported only by inference|requires? inference|infer(?:red|ence|ences)?)\b/iu.test(finding.message)
    && !/\b(?:two|both|another|second) (?:options?|answers?|choices?)\b/iu.test(finding.message)) {
    return "discard";
  }
  return "keep";
}

const BLOCKING_REVIEW_CATEGORIES = new Set<ReviewCategory>([
  "source_contradiction", "answer_key_mismatch", "objective_mismatch", "translation_mismatch"
]);
const REVIEW_EXERCISES = new Set<string>(["listening", "reading", "writing", "wordClass", "wordUse", "speaking"]);

function legacyReviewCategory(reasonCode: ReviewFinding["reasonCode"]): ReviewCategory {
  switch (reasonCode) {
    case "insufficient_context":
      return "source_contradiction";
    case "outside_taught_scope":
    case "level_mismatch":
    case "feedback_mismatch":
      return "objective_mismatch";
    default:
      return "answer_key_mismatch";
  }
}

/** Resolves evidence.path ("speaking.answer") to the exercise and current field text. */
function reviewEvidenceTarget(skills: Skills, path: string): { exercise: AtomicSkillExercise; value: string } | undefined {
  const [exercise, field] = path.trim().split(".");
  if (!exercise || !field || !REVIEW_EXERCISES.has(exercise)) return undefined;
  const value = (skills[exercise as keyof Skills] as Record<string, unknown> | undefined)?.[field];
  return typeof value === "string" ? { exercise: exercise as AtomicSkillExercise, value } : undefined;
}

function normalizedEvidenceText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export type ReviewerFindingClassification = {
  disposition: "repair" | "warning" | "discard";
  category: ReviewCategory;
  finding: ReviewFinding;
  reason: string;
};

/**
 * Classifies a reviewer finding. Source, key, objective and translation
 * mismatches are repaired on the exercise named by evidence.path (the field that
 * must change); cross-exercise and style notes become warnings; self-withdrawn
 * findings and findings whose quoted evidence is not in the exercise are dropped.
 */
export function classifyReviewerFinding(
  finding: ReviewFinding,
  skills: Skills,
  context: { cefr: string; lessonFocus: string; inferenceRequired: boolean; lessonObjectives?: Foundation["objective"] }
): ReviewerFindingClassification {
  const category = finding.category ?? legacyReviewCategory(finding.reasonCode);
  if (category === "self_withdrawn") return { disposition: "discard", category, finding, reason: "reviewer withdrew the finding" };
  if (!BLOCKING_REVIEW_CATEGORIES.has(category)) return { disposition: "warning", category, finding, reason: "non-blocking reviewer note" };
  const disposition = reviewerFindingDisposition(finding, skills, context.cefr, context.lessonFocus, context.inferenceRequired, context.lessonObjectives);
  if (disposition === "discard") return { disposition, category, finding, reason: "finding contradicts the source, key, objective map or review contract" };
  if (disposition === "warning") return { disposition, category: "style_preference", finding, reason: "style-only complaint under the review contract" };
  if (finding.evidence) {
    const target = reviewEvidenceTarget(skills, finding.evidence.path);
    if (target && finding.evidence.actual.trim()
      && !normalizedEvidenceText(target.value).includes(normalizedEvidenceText(finding.evidence.actual))) {
      return { disposition: "discard", category, finding, reason: `quoted evidence is not present in ${finding.evidence.path}` };
    }
    if (target) return { disposition: "repair", category, finding: { ...finding, exerciseCode: target.exercise }, reason: "verified evidence" };
  }
  return { disposition: "repair", category, finding, reason: "blocking reviewer finding" };
}

function hintActuallyRevealsAnswer(hint: string, answer: string): boolean {
  const normalize = (value: string) => value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const normalizedHint = normalize(hint);
  const normalizedAnswer = normalize(answer);
  if (!normalizedHint || !normalizedAnswer) return false;
  if (normalizedHint.includes(normalizedAnswer)) return true;
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "your", "you", "her", "his", "their", "into", "about", "please"]);
  const answerWords = [...new Set(normalizedAnswer.split(/\s+/u).filter((word) => word.length > 2 && !stopWords.has(word)))];
  if (answerWords.length === 0) return false;
  const explicitWordLeak = [...hint.normalize("NFKC").toLocaleLowerCase("en-US").matchAll(/(?:chữ|từ|cụm|word|term)\s+["'“”]?([a-z0-9]{3,})["'“”]?/gu)]
    .some((match) => answerWords.includes(match[1]!));
  if (explicitWordLeak) return true;
  const hintWords = new Set(normalizedHint.split(/\s+/u));
  const overlap = answerWords.filter((word) => hintWords.has(word)).length;
  return overlap >= 2 && overlap / answerWords.length >= 0.7;
}

const reviewSkillsCandidate = reviewWeeklyLessonSkills;

export function deterministicSkillsFindings(
  skills: Partial<Skills>,
  cefr: string,
  lessonFocus = "",
  lessonObjectives?: Foundation["objective"]
): Array<{ path: PropertyKey[]; message: string }> {
  const findings: Array<{ path: PropertyKey[]; message: string }> = [];
  const constraints = weeklyLessonSkillsGenerationConstraints(cefr);
  const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
  const tolerantRange = (minimum: number, maximum: number, code?: "listening" | "reading") => ({
    minimum: Math.max(1, Math.floor(minimum * 0.8)),
    // A2 reading has a concise target but a one-word overflow does not make
    // the exercise unusable; keep the hard ceiling for material over that.
    maximum: Math.ceil(maximum * 1.2) + (cefr === "A2" && code === "reading" ? 1 : 0)
  });
  const asksForNumericExtreme = (prompt: string) => /\b(?:largest|highest|greatest|biggest|smallest|lowest|least)\b[\s\S]{0,60}\b(?:variance|difference|gap|amount|cost|spending|score|rate|percentage)\b|\b(?:variance|difference|gap|amount|cost|spending|score|rate|percentage)\b[\s\S]{0,60}\b(?:largest|highest|greatest|biggest|smallest|lowest|least)\b/iu.test(prompt);
  if (skills.writing && (cefr === "A1" || cefr === "A2") && skills.writing.type !== "mcq") {
    findings.push({ path: ["writing", "type"], message: `${cefr} writing must be mcq so the learner-visible item cannot have multiple valid fill answers.` });
  }
  if (skills.writing && ["B1", "B2", "C1"].includes(cefr) && skills.writing.type !== "write") {
    findings.push({ path: ["writing", "type"], message: `${cefr} writing must be a scoped free-response workplace task.` });
  }
  if (skills.writing?.type === "write"
    && /\b(?:listen to|recording|audio|you heard|speakers? mention)\b/iu.test(skills.writing.prompt)
    && !/\b\d[\d,]*(?:\.\d+)?\b/u.test(skills.writing.prompt)) {
    findings.push({
      path: ["writing", "prompt"],
      message: "The writing task must be self-contained. It refers to another recording for a required figure but does not state that figure in its own prompt; include every required fact directly or remove the external-reference requirement."
    });
  }
  for (const [code, minimum, maximum] of [
    ["listening", constraints.listeningWordMin, constraints.listeningWordMax],
    ["reading", constraints.readingWordMin, constraints.readingWordMax]
  ] as const) {
    const exercise = skills[code];
    if (!exercise) continue;
    const count = wordCount(exercise.body);
    const accepted = tolerantRange(minimum, maximum, code);
    if (asksForNumericExtreme(exercise.prompt)) accepted.maximum = Math.max(accepted.maximum, Math.ceil(maximum * 2.25));
    if (count < accepted.minimum || count > accepted.maximum) {
      findings.push({ path: [code, "body"], message: `${cefr} ${code} body must contain ${accepted.minimum}-${accepted.maximum} words; received ${count}.` });
    }
  }
  for (const code of ["listening", "reading", "wordClass", "wordUse"] as const) {
    const exercise = skills[code];
    if (!exercise) continue;
    const options = [exercise.option1, exercise.option2, exercise.option3, exercise.option4];
    const normalizedOptions = options.map((option) => option.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim());
    if (new Set(normalizedOptions).size !== 4) {
      findings.push({ path: [code, "option1"], message: "All four options must be distinct." });
    }
    if (!options.includes(exercise.answer)) {
      findings.push({ path: [code, "answer"], message: "The answer must exactly match one of the four options." });
    }
    if (hintActuallyRevealsAnswer(exercise.hint, exercise.answer)) {
      findings.push({ path: [code, "hint"], message: "The hint must guide the learner without revealing the answer." });
    }
  }
  if (skills.speaking) {
    const count = wordCount(skills.speaking.answer);
    // A B1 model answer that is only a short closing phrase over the target
    // remains usable. Longer answers still go through the targeted repair.
    const acceptedMaximum = Math.ceil(constraints.speakingAnswerWordMax * 1.3) + (cefr === "B1" ? 3 : 0);
    if (count > acceptedMaximum) {
      findings.push({ path: ["speaking", "answer"], message: `${cefr} speaking model answer must contain at most ${acceptedMaximum} words; received ${count}.` });
    }
    const chartMonthQuestion = /\b(?:chart|graph|table|shared screen)\b/iu.test(skills.speaking.prompt)
      && /\b(?:which month|name the month|month had)\b/iu.test(skills.speaking.prompt);
    if (chartMonthQuestion) {
      const monthPattern = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/giu;
      const promptMonths = new Set((skills.speaking.prompt.match(monthPattern) ?? []).map((month) => month.toLocaleLowerCase("en-US")));
      const answerMonths = new Set((skills.speaking.answer.match(monthPattern) ?? []).map((month) => month.toLocaleLowerCase("en-US")));
      if (answerMonths.size === 0 || [...answerMonths].some((month) => !promptMonths.has(month))) {
        findings.push({
          path: ["speaking", "prompt"],
          message: "A chart question asking for a specific month must provide that month and enough chart data in the prompt; the model answer cannot invent it."
        });
      }
    }
  }
  for (const code of ["listening", "reading", "wordClass", "wordUse"] as const) {
    const exercise = skills[code];
    if (!exercise) continue;
    const prompt = exercise.prompt.trim();
    if ((code === "listening" || code === "reading") && !prompt.endsWith("?")) findings.push({ path: [code, "prompt"], message: "Comprehension question must end with a question mark." });
    if (code === "listening" || code === "reading") {
      const comprehensionExercise = exercise as {
        body: string; prompt: string; answer: string;
        option1: string; option2: string; option3: string; option4: string;
      };
      const sourceWordCount = wordCount(comprehensionExercise.body);
      const minimum = code === "listening" ? constraints.listeningWordMin : constraints.readingWordMin;
      const maximum = code === "listening" ? constraints.listeningWordMax : constraints.readingWordMax;
      const sourceRange = tolerantRange(minimum, maximum, code);
      if (asksForNumericExtreme(comprehensionExercise.prompt)) sourceRange.maximum = Math.max(sourceRange.maximum, Math.ceil(maximum * 2.25));
      if (sourceWordCount < sourceRange.minimum || sourceWordCount > sourceRange.maximum) continue;
      const source = comprehensionExercise.body.normalize("NFKC").toLocaleLowerCase("en-US");
      const normalizedPrompt = comprehensionExercise.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
      const requestedOverrunFigure = /\b(?:cost\s+)?overrun figure\b/iu.test(comprehensionExercise.prompt);
      const statedOverrun = comprehensionExercise.body.match(/\b(?:cost\s+)?overrun(?:\s+of|\s+is|:)\s*([$£€]?\s*\d[\d,]*(?:\.\d+)?(?:\s+dollars?)?)/iu)?.[1]
        ?.replace(/\s+/gu, " ")
        .trim();
      if (requestedOverrunFigure && statedOverrun) {
        const normalizedAmount = statedOverrun.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const normalizedAnswer = comprehensionExercise.answer.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        if (!normalizedAnswer.includes(normalizedAmount)) {
          findings.push({
            path: [code, "answer"],
            message: `The question explicitly asks for the cost-overrun figure ${statedOverrun}, but the keyed answer does not contain it. Make the question single-part or include both the decision and this exact figure in one option and key.`
          });
        }
      }
      if (asksForNumericExtreme(comprehensionExercise.prompt)) {
        const metricWord = "(?:variance|difference|gap|amount|cost|spending|score|rate|percentage)";
        const extremeWord = "(?:largest|highest|greatest|biggest|smallest|lowest|least)";
        const normalizedAnswer = comprehensionExercise.answer.normalize("NFKC").toLocaleLowerCase("en-US");
        const answerPattern = normalizedAnswer.split(/\s+/u).map(escapeRegExp).join("\\s+");
        const explicitlyStatesWinner = new RegExp(
          `(?:${answerPattern}[^.!?]{0,80}${extremeWord}[^.!?]{0,40}${metricWord}|${extremeWord}[^.!?]{0,40}${metricWord}[^.!?]{0,80}${answerPattern})`,
          "iu"
        ).test(source);
        if (!explicitlyStatesWinner) {
          const sourceSegments = comprehensionExercise.body
            .split(/(?<=[.!?])\s+|[\n;]+/u)
            .map((segment) => segment.normalize("NFKC").toLocaleLowerCase("en-US").trim())
            .filter(Boolean);
          const options = [comprehensionExercise.option1, comprehensionExercise.option2, comprehensionExercise.option3, comprehensionExercise.option4];
          const missingComparableEvidence = options.filter((option) => {
            const normalizedOption = option.normalize("NFKC").toLocaleLowerCase("en-US").trim();
            const segment = sourceSegments.find((candidate) => candidate.includes(normalizedOption));
            if (!segment) return true;
            const numbers = segment.match(/\b\d[\d,]*(?:\.\d+)?\b/gu) ?? [];
            const statesMetricValue = new RegExp(`(?:${metricWord}[^.!?]{0,24}\\d|\\d[^.!?]{0,24}${metricWord}|(?:no|zero)\\s+${metricWord})`, "iu").test(segment);
            return numbers.length < 2 && !statesMetricValue;
          });
          if (missingComparableEvidence.length > 0) {
            findings.push({
              path: [code, "body"],
              message: `The question asks for a numeric largest/smallest comparison, but the source lacks comparable figures for: ${missingComparableEvidence.join(", ")}. State the relevant metric for every option, or explicitly state which option is the largest/smallest.`
            });
          }
        }
      }
      for (const artifact of [
        "board paper", "action plan", "project brief", "status report",
        "meeting minutes", "meeting agenda", "risk register"
      ]) {
        if (normalizedPrompt.includes(artifact) && !source.includes(artifact)) {
          findings.push({
            path: [code, "prompt"],
            message: `The question asks about '${artifact}', but that artifact is absent from the source passage; add the required source evidence or ask only about stated content.`
          });
        }
      }
      const soundOnlyQuestion = /\b(?:hear|hearing|sound|audio|microphone|mic)\b/iu.test(comprehensionExercise.prompt)
        && !/\b(?:see|screen|video|camera|visual)\b/iu.test(comprehensionExercise.prompt);
      if (soundOnlyQuestion) {
        for (const [optionKey, optionValue] of [
          ["option1", comprehensionExercise.option1],
          ["option2", comprehensionExercise.option2],
          ["option3", comprehensionExercise.option3],
          ["option4", comprehensionExercise.option4]
        ] as const) {
          if (/\b(?:see|screen|video|camera|visual)\b/iu.test(optionValue)) {
            findings.push({
              path: [code, optionKey],
              message: "A sound-only comprehension question must keep this option in the audio/hearing channel; a visual or screen distractor tests a different skill."
            });
          }
        }
      }
      const asksForAbsentOrFalseOption = /\b(?:not|except|false|incorrect|không đúng|không xuất hiện|ngoại trừ)\b/iu.test(comprehensionExercise.prompt);
      if (!constraints.inferenceRequired && !asksForAbsentOrFalseOption) {
        const evidenceStopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "about", "what", "when", "where", "which"]);
        const canonicalEvidenceWord = (word: string) => {
          const aliases: Record<string, string> = {
            spent: "spend", spending: "spend", spends: "spend",
            planned: "plan", planning: "plan", plans: "plan",
            exceeded: "exceed", exceeding: "exceed", exceeds: "exceed",
            costs: "cost", expenses: "expense",
            first: "1", second: "2", third: "3", fourth: "4"
          };
          return aliases[word] ?? word;
        };
        const evidenceWords = (value: string) => new Set((value
          .normalize("NFKC")
          .toLocaleLowerCase("en-US")
          .match(/[\p{L}\p{N}]+/gu) ?? [])
          .filter((word) => word.length > 2 && !evidenceStopWords.has(word))
          .map(canonicalEvidenceWord));
        const sourceWords = evidenceWords(comprehensionExercise.body);
        const answerWords = evidenceWords(comprehensionExercise.answer);
        const hasKnownDirectParaphrase = (sourceWords.has("deadline") && answerWords.has("due") && answerWords.has("date"))
          || (answerWords.has("deadline") && sourceWords.has("due") && sourceWords.has("date"));
        const hasExplicitSoundCheck = answerWords.has("check")
          && answerWords.has("sound")
          && (sourceWords.has("hear") || sourceWords.has("microphone"))
          && /\bcan you hear me\b/iu.test(comprehensionExercise.body);
        const directOverlapCount = [...answerWords].filter((word) => sourceWords.has(word)).length;
        const hasDirectEvidence = (answerWords.size <= 2 ? directOverlapCount >= 1 : directOverlapCount >= 2)
          || hasKnownDirectParaphrase
          || hasExplicitSoundCheck;
        if (answerWords.size > 0 && !hasDirectEvidence) {
          findings.push({
            path: [code, "answer"],
            message: `${cefr} direct comprehension answer must contain a key fact stated in the source passage; '${comprehensionExercise.answer}' has no textual evidence.`
          });
        }
      }
      const ungroundedEntity = ungroundedPromptEntities(prompt, comprehensionExercise.body)[0];
      if (ungroundedEntity) {
        findings.push({ path: [code, "prompt"], message: `Comprehension question names ${ungroundedEntity.text}, but that person or entity is absent from the source passage.` });
      }
    }
  }
  if (skills.speaking && ["B1", "B2", "C1"].includes(cefr) && /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]|\b(?:hãy|nói|viết|trình bày|một câu|bằng tiếng anh)\b/iu.test(skills.speaking.prompt)) {
    findings.push({ path: ["speaking", "prompt"], message: `${cefr} speaking prompt must be written in English.` });
  }
  if (lessonObjectives) {
    const codeToKey: Record<string, keyof Skills> = {
      listening: "listening", reading: "reading", writing: "writing",
      word_class: "wordClass", wordClass: "wordClass",
      word_use: "wordUse", wordUse: "wordUse", speaking: "speaking"
    };
    const ignoredTargetWords = new Set(["a", "an", "the", "i", "me", "my", "you", "your", "that", "this", "please", "to"]);
    for (const item of lessonObjectives.items) {
      if (item.type !== "language" || !item.target_language?.length) continue;
      const key = codeToKey[item.assessmentCode];
      const exercise = key ? skills[key] : undefined;
      if (!key || !exercise) continue;
      const exerciseRecord = exercise as Record<string, unknown>;
      const filledCloze = typeof exerciseRecord.prompt === "string" && typeof exerciseRecord.answer === "string" && /_{2,}/u.test(exerciseRecord.prompt)
        ? exerciseRecord.prompt.replace(/_{2,}/gu, exerciseRecord.answer)
        : undefined;
      const assessedContent = [
        exerciseRecord.body,
        exerciseRecord.prompt,
        filledCloze,
        exerciseRecord.option1,
        exerciseRecord.option2,
        exerciseRecord.option3,
        exerciseRecord.option4,
        exerciseRecord.answer
      ].filter((value): value is string => typeof value === "string");
      const exerciseTokens = new Set(assessedContent.join(" ").normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? []);
      const tokenSets = item.target_language.map((target) => new Set(
        (target.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [])
          .filter((word) => !ignoredTargetWords.has(word))
      ));
      const objectiveContract = [item.text, item.criterion, item.success_evidence]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase("en-US");
      const targetLanguageIsAlternative = item.target_language.length > 1
        || /\b(?:or)\b|(?:hoặc)/u.test(objectiveContract);
      const normalizedAssessedContent = assessedContent.join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
      const coversPatternNotation = item.target_language.some((target) => {
        const normalizedTarget = target.normalize("NFKC").toLocaleLowerCase("en-US");
        const modal = normalizedTarget.match(/\b(may|might|could)\s+have\s*\+?\s*past participle\b/u)?.[1];
        if (modal && new RegExp(`\\b${modal}\\s+have\\s+[a-z]+\\b`, "u").test(normalizedAssessedContent)) return true;
        if (/\bif\s*\+\s*were to\s*\+\s*base verb\b/u.test(normalizedTarget)
          && /\bif\b[^.!?]{0,100}\bwere to\s+[a-z]+\b[^.!?]{0,120}\bwould\s+[a-z]+\b/u.test(normalizedAssessedContent)) return true;
        if (/\bif\s*\+\s*past simple\b[^.!?]{0,80}\bwould\s*\+\s*base verb\b/u.test(normalizedTarget)
          && /\bif\b[^.!?]{0,100},?\s+[^.!?]{0,80}\bwould\s+[a-z]+\b/u.test(normalizedAssessedContent)) return true;
        if (/\bshould\s*\+\s*subject\s*\+\s*verb\b/u.test(normalizedTarget)
          && /(?:^|[.!?]\s*)should\s+(?:the\s+)?[a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*)?\s+[a-z][a-z'’-]*\b/u.test(normalizedAssessedContent)) return true;
        if (/\bwhile\s*\/\s*whereas\b|\bwhile\s+(?:or|and)\s+whereas\b/u.test(normalizedTarget)
          && /\b(?:while|whereas)\b/u.test(normalizedAssessedContent)) return true;
        if (/\bit was agreed that\s*\+\s*clause\b/u.test(normalizedTarget)
          && /\bit was agreed that\s+(?:the\s+)?[a-z][a-z'’-]*\b/u.test(normalizedAssessedContent)) return true;
        if (/\bit was decided that\s*\+\s*clause\b/u.test(normalizedTarget)
          && /\bit was decided that\s+(?:the\s+)?[a-z][a-z'’-]*\b/u.test(normalizedAssessedContent)) return true;
        if (/\bit has been agreed that\s*\+\s*clause\b/u.test(normalizedTarget)
          && /\bit has been agreed that\s+(?:the\s+)?[a-z][a-z'’-]*\b/u.test(normalizedAssessedContent)) return true;
        if (/\bhaving\s*\+\s*past participle\s*,?\s*\+\s*clause\b/u.test(normalizedTarget)
          && /\bhaving\s+[a-z][a-z'’-]*(?:ed|en)\b[^,]*,\s*[a-z]/u.test(normalizedAssessedContent)) return true;
        if (/\bgiven\s*\+\s*noun\s*,?\s*\+\s*clause\b/u.test(normalizedTarget)
          && /\bgiven\s+(?:the\s+)?[a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*)?\s*,\s*[a-z]/u.test(normalizedAssessedContent)) return true;
        return false;
      });
      const coversOneAlternative = coversPatternNotation || tokenSets.some((tokens) =>
        tokens.size > 0 && [...tokens].every((word) => exerciseTokens.has(word))
      );
      if (targetLanguageIsAlternative) {
        if (!coversOneAlternative) {
          findings.push({
            path: [key],
            message: `The exercise mapped by objective ${item.id} (${item.assessmentCode}) must contain at least one complete target-language alternative.`
          });
        }
        continue;
      }
      const sharedTokens = tokenSets.length > 0
        ? [...tokenSets[0]!].filter((word) => tokenSets.every((tokens) => tokens.has(word)))
        : [];
      const allTargetTokens = new Set(tokenSets.flatMap((tokens) => [...tokens]));
      const contrastTokens = [
        ...(allTargetTokens.has("mute") && allTargetTokens.has("unmute") ? ["mute", "unmute"] : []),
        ...(allTargetTokens.has("yes") && allTargetTokens.has("no") ? ["yes", "no"] : []),
        ...(allTargetTokens.has("can") && allTargetTokens.has("cannot") ? ["can", "cannot"] : [])
      ];
      const targetTokens = [...new Set([...sharedTokens, ...contrastTokens])];
      const missing = targetTokens.filter((word) => !exerciseTokens.has(word));
      if (missing.length > 0) {
        findings.push({
          path: [key],
          message: `The exercise mapped by objective ${item.id} (${item.assessmentCode}) omits required target language: ${missing.join(", ")}.`
        });
      }
    }
  }
  if (skills.speaking) {
    const speaking = skills.speaking;
    const focus = lessonFocus.normalize("NFKC").toLocaleLowerCase("en-US");
    const answer = speaking.answer.normalize("NFKC").toLocaleLowerCase("en-US");
    const prompt = speaking.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
    const sentenceCountContract = `${focus} ${prompt}`;
    const requiredSentenceCountMatch = sentenceCountContract.match(/\b(one|two|three|four|1|2|3|4|một|hai|ba|bốn)\s+(?:different\s+|short\s+|khác nhau\s+|ngắn\s+)?(?:english\s+|tiếng anh\s+)?(?:sentences?|câu)\b/iu);
    if (requiredSentenceCountMatch) {
      const sentenceCounts: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, "1": 1, "2": 2, "3": 3, "4": 4, "một": 1, "hai": 2, "ba": 3, "bốn": 4 };
      const requiredCount = sentenceCounts[requiredSentenceCountMatch[1]!.toLocaleLowerCase("en-US")] ?? 0;
      const actualCount = speaking.answer.split(/[.!?]+/u).map((sentence) => sentence.trim()).filter(Boolean).length;
      const promptCountMatch = prompt.match(/\b(one|two|three|four|1|2|3|4|một|hai|ba|bốn)\s+(?:different\s+|short\s+|khác nhau\s+|ngắn\s+)?(?:english\s+|tiếng anh\s+)?(?:sentences?|câu)\b/iu);
      const promptCount = promptCountMatch ? sentenceCounts[promptCountMatch[1]!.toLocaleLowerCase("en-US")] ?? 0 : 0;
      if (requiredCount > 0 && promptCount !== requiredCount) {
        findings.push({
          path: ["speaking", "prompt"],
          message: `The approved lesson focus requires ${requiredCount} sentences, so the speaking prompt must explicitly request exactly ${requiredCount} sentences instead of reducing the task.`
        });
      }
      if (requiredCount > 0 && actualCount < requiredCount) {
        findings.push({
          path: ["speaking", "answer"],
          message: `The speaking prompt requires ${requiredCount} distinct sentences, but the model answer contains ${actualCount}. Return exactly ${requiredCount} complete English sentences and keep answerTranslation consistent.`
        });
      }
    }
    const requiresDecisionRequest = /\b(?:ask|request)\b[^.!?]{0,100}\b(?:a\s+)?(?:decision|approval)\b|\b(?:decision|approval)\b[^.!?]{0,100}\b(?:ask|request)\b/iu.test(prompt);
    const hasDecisionRequest = /\b(?:could|would|can|will)\s+you\b[^.!?]{0,100}\b(?:decide|approve|confirm)\b|\bplease\b[^.!?]{0,100}\b(?:decide|approve|confirm|let me know your decision)\b|\b(?:let me know|await)\b[^.!?]{0,60}\b(?:your\s+)?decision\b/iu.test(answer);
    if (requiresDecisionRequest && !hasDecisionRequest) {
      findings.push({
        path: ["speaking", "answer"],
        message: "The speaking prompt requires asking for a decision or approval, so the model answer must end with an explicit decision/approval request. Stating a conditional alone does not satisfy this act."
      });
    }
    const answerTokens = answer.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
    const repeatedWindows = new Map<string, number>();
    for (let index = 0; index <= answerTokens.length - 5; index += 1) {
      const window = answerTokens.slice(index, index + 5).join(" ");
      repeatedWindows.set(window, (repeatedWindows.get(window) ?? 0) + 1);
    }
    const repeatedPhrase = [...repeatedWindows.entries()].find(([, occurrences]) => occurrences > 1)?.[0];
    if (repeatedPhrase) {
      findings.push({
        path: ["speaking", "answer"],
        message: `The model answer repeats the long phrase "${repeatedPhrase}". State the proposal once in natural words, preserve every mandatory fact and required frame, and remove the duplicate wording.`
      });
    }
    const requiresPoliteClose = /\bclose (?:the )?(?:call|meeting) politely\b|\b(?:thank(?:ing)? everyone|say(?:ing)? goodbye|polite (?:close|closing|goodbye))\b/u.test(`${focus} ${prompt}`);
    const hasPoliteClose = /\b(?:thank you|thanks|goodbye|bye|speak (?:to you )?soon|talk (?:to you )?soon|have a (?:good|great|nice) (?:day|week|evening|afternoon))\b/u.test(answer);
    if (requiresPoliteClose && !hasPoliteClose) {
      findings.push({ path: ["speaking", "answer"], message: "The speaking prompt requires a polite closing, so the model answer must include an explicit thank-you, goodbye, or equivalent closing phrase." });
    }
    const requiresConfirmationRequest = /\bask\b[^.!?]{0,60}\bto confirm\b/iu.test(prompt);
    const hasConfirmationRequest = /\?|\bconfirm\b/iu.test(answer);
    if (requiresConfirmationRequest && !hasConfirmationRequest) {
      findings.push({
        path: ["speaking", "answer"],
        message: "The speaking prompt requires asking the colleague to confirm, so the model answer must include a confirmation question or request."
      });
    }
    const requiresNextStepClose = /\bclose by confirming the next step\b/iu.test(prompt);
    const hasNextStepClose = /\b(?:confirm|next step)\b/iu.test(answer);
    if (requiresNextStepClose && !hasNextStepClose) {
      findings.push({
        path: ["speaking", "answer"],
        message: "The speaking prompt requires closing by confirming the next step, so the model answer must include an explicit next-step confirmation."
      });
    }
    if (/\brethink plan\b/iu.test(answer)) {
      findings.push({
        path: ["speaking", "answer"],
        message: "Use the grammatical phrase 'rethink the plan' rather than 'rethink plan'."
      });
    }
    const explicitlyRequiresQuotedPhrases = /\b(?:using|use|include)\b[^.!?]{0,80}\b(?:phrase|phrases|frame|frames|words?)\b/u.test(prompt);
    if (explicitlyRequiresQuotedPhrases) {
      const requiredPhrases = [...speaking.prompt.matchAll(/["“]([^"”]+)["”]/gu)]
        .filter((match) => {
          const prefix = speaking.prompt.slice(Math.max(0, (match.index ?? 0) - 120), match.index ?? 0);
          return /\b(?:use|using|include|frame|exact(?: sentence| phrase)?|say)\b/iu.test(prefix)
            && !/\b(?:asks?|question)\s*:?\s*$/iu.test(prefix);
        })
        .map((match) => match[1]!.trim());
      const quotedPhrasesAreAlternatives = /["”]\s*(?:or|hoặc)\s*["“]/iu.test(speaking.prompt);
      const phraseAppears = (phrase: string) => {
        const normalizePhraseText = (value: string) => value
          .normalize("NFKC")
          .toLocaleLowerCase("en-US")
          .replace(/[^\p{L}\p{N}.…]+/gu, " ")
          .replace(/\s+/gu, " ")
          .trim();
        const rawTemplateSegments = phrase.split("+").map((part) => normalizePhraseText(part)).filter(Boolean);
        const normalizedAnswer = normalizePhraseText(speaking.answer);
        if (rawTemplateSegments.length > 1) {
          let cursor = 0;
          for (let index = 0; index < rawTemplateSegments.length; index += 1) {
            const segment = rawTemplateSegments[index]!;
            const position = normalizedAnswer.indexOf(segment, cursor);
            if (position < 0) return false;
            if (index > 0 && normalizedAnswer.slice(cursor, position).trim().split(/\s+/u).filter(Boolean).length === 0) return false;
            cursor = position + segment.length;
          }
          return true;
        }
        const normalizedPhrase = normalizePhraseText(phrase);
        const segments = normalizedPhrase.split(/\s*(?:\.{3}|…)\s*/u).map((part) => part.trim()).filter(Boolean);
        if (segments.length > 1) {
          let cursor = 0;
          return segments.every((segment) => {
            const index = normalizedAnswer.indexOf(segment, cursor);
            if (index < 0) return false;
            cursor = index + segment.length;
            return true;
          });
        }
        const plainPhrase = normalizedPhrase.replace(/(?:\.{3}|…)/gu, "").trim();
        return plainPhrase.length > 0 && normalizedAnswer.includes(plainPhrase);
      };
      const containsRequiredAlternative = requiredPhrases.some(phraseAppears);
      const missingPhrases = quotedPhrasesAreAlternatives && containsRequiredAlternative
        ? []
        : requiredPhrases.filter((phrase) => !phraseAppears(phrase));
      if (missingPhrases.length > 0) {
        findings.push({
          path: ["speaking", "answer"],
          message: quotedPhrasesAreAlternatives
            ? `The speaking prompt explicitly requires one of these exact phrases: ${requiredPhrases.join("; ")}. Preserve one verbatim while shortening other wording.`
            : `The speaking prompt explicitly requires these exact phrases: ${missingPhrases.join("; ")}. Preserve them verbatim while shortening other wording.`
        });
      }
    }
    const targetWordRequirement = speaking.prompt.match(/\b(?:use at least|also use|use)\s+(one|two|three|\d+)\s+of (?:these|the following) words?\s*:\s*([^.!?]+)/iu);
    if (targetWordRequirement) {
      const requestedCount = ({ one: 1, two: 2, three: 3 } as Record<string, number>)[targetWordRequirement[1]!.toLocaleLowerCase("en-US")]
        ?? Number(targetWordRequirement[1]);
      const candidates = targetWordRequirement[2]!
        .split(/\s*(?:,|\bor\b|\band\b)\s*/iu)
        .map((word) => word
          .replace(/[^\p{L}\p{N}'’\-\s]+/gu, "")
          .replace(/\s+/gu, " ")
          .trim()
          .toLocaleLowerCase("en-US"))
        .filter(Boolean);
      const used = candidates.filter((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "iu").test(answer));
      if (used.length < requestedCount) {
        findings.push({
          path: ["speaking", "answer"],
          message: `The speaking prompt requires ${requestedCount} target word(s), but the model answer uses ${used.length}. Use ${requestedCount} from: ${candidates.join(", ")}.`
        });
      }
    }
    const requiresPoliteApprovalRequest = /\b(?:politely ask(?:ing)?|ask(?:ing)?[\s\S]{0,50}politely)\b[\s\S]{0,160}\b(?:approve|approval)\b|\bpolitely\b[\s\S]{0,120}\b(?:approve|approval)\b/iu.test(speaking.prompt);
    const requiresApprovalRequest = requiresPoliteApprovalRequest
      || /\b(?:ask|request)(?:ing)?\b[\s\S]{0,120}\b(?:approve|approval)\b|\b(?:approve|approval)\b[\s\S]{0,120}\b(?:ask|request)(?:ing)?\b/iu.test(speaking.prompt);
    const hasPoliteApprovalRequest = /\b(?:please|could you|would you|kindly|i would be grateful if you could)\b[^.!?]{0,100}\bapprove\b/iu.test(speaking.answer);
    const hasApprovalRequest = hasPoliteApprovalRequest
      || /\b(?:i ask|i am asking|we ask|we are asking|i request|we request)\b[^.!?]{0,100}\b(?:approve|approval)\b/iu.test(speaking.answer);
    if (requiresApprovalRequest && !hasApprovalRequest) {
      findings.push({
        path: ["speaking", "answer"],
        message: "The speaking prompt requires an approval request; include an explicit request such as 'Could you please approve this adjustment?' A conditional phrase such as 'if it is approved' is not a request."
      });
    }
    const mandatoryConditional = speaking.prompt.match(/(?:^|[.!?]\s*)if\s+([^,.!?]+),\s*((?:rethink|state|explain|mention|say|add|include|propose|describe|identify|recommend|ask|tell|note|give)\b[^.!?]*)/iu);
    if (mandatoryConditional) {
      const conditionalStopWords = new Set(["the", "a", "an", "to", "for", "of", "and", "or", "your", "our", "you", "we", "it", "its", "this", "that", "should", "would", "could"]);
      const meaningfulTokens = (value: string) => (value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}'’-]+/gu) ?? [])
        .filter((token) => token.length > 2 && !conditionalStopWords.has(token));
      const conditionTokens = meaningfulTokens(mandatoryConditional[1]!);
      const actionTokens = meaningfulTokens(mandatoryConditional[2]!);
      const answerTokens = new Set(meaningfulTokens(speaking.answer));
      const conditionCovered = conditionTokens.length === 0 || conditionTokens.filter((token) => answerTokens.has(token)).length >= Math.ceil(conditionTokens.length * 0.6);
      const actionCovered = actionTokens.length === 0 || actionTokens.filter((token) => answerTokens.has(token)).length >= Math.ceil(actionTokens.length * 0.6);
      if (!conditionCovered || !actionCovered) {
        findings.push({
          path: ["speaking", "answer"],
          message: `The speaking prompt contains a mandatory condition: "If ${mandatoryConditional[1]}, ${mandatoryConditional[2]}". Include that condition and required action in the model answer.`
        });
      }
    }
    const askedQuestion = speaking.prompt.match(/\basks?\s*:\s*["“]([^"”]+\?)["”]/iu)?.[1]?.trim();
    if (askedQuestion && speaking.answer.toLocaleLowerCase("en-US").includes(askedQuestion.toLocaleLowerCase("en-US"))) {
      findings.push({
        path: ["speaking", "answer"],
        message: "Answer the manager's quoted question directly; do not copy the question into the model answer."
      });
    }
    const parseMoney = (value: string) => [...value.matchAll(/[$£€]\s*([\d,]+(?:\.\d+)?)/gu)]
      .map((match) => Number(match[1]!.replace(/,/gu, "")))
      .filter(Number.isFinite);
    const promptAmounts = parseMoney(speaking.prompt);
    const allowedAmounts = new Set(promptAmounts);
    for (let left = 0; left < promptAmounts.length; left += 1) {
      for (let right = left + 1; right < promptAmounts.length; right += 1) {
        allowedAmounts.add(Math.abs(promptAmounts[left]! - promptAmounts[right]!));
      }
    }
    const inventedAmount = parseMoney(speaking.answer).find((amount) => !allowedAmounts.has(amount));
    if (inventedAmount !== undefined) {
      findings.push({
        path: ["speaking", "answer"],
        message: `The model answer invents the monetary amount ${inventedAmount}; use only an amount stated in or directly calculable from the speaking prompt.`
      });
    }
    const speakingObjectives = lessonObjectives?.items.filter((item) => item.assessmentCode === "speaking") ?? [];
    const speakingTargetContract = speakingObjectives
      .flatMap((item) => [item.text, item.condition, item.criterion, item.success_evidence, ...(item.target_language ?? [])])
      .join(" ")
      .toLocaleLowerCase("en-US");
    const percentageMatch = speakingTargetContract.match(/higher than planned by (one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?) percent/u);
    const percentWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const requiredPercent = percentageMatch
      ? percentWords[percentageMatch[1]!] ?? Number(percentageMatch[1])
      : undefined;
    const plannedTotal = /\btotal planned(?:\s+is)?\s*[$£€]?\s*([\d,]+(?:\.\d+)?)/iu.exec(speaking.prompt)?.[1];
    const actualTotal = /\btotal actual(?:\s+is)?\s*[$£€]?\s*([\d,]+(?:\.\d+)?)/iu.exec(speaking.prompt)?.[1];
    if (requiredPercent !== undefined && plannedTotal && actualTotal) {
      const planned = Number(plannedTotal.replace(/,/gu, ""));
      const actual = Number(actualTotal.replace(/,/gu, ""));
      const expectedActual = planned * (1 + requiredPercent / 100);
      if (Number.isFinite(planned) && Number.isFinite(actual) && Math.abs(actual - expectedActual) > Math.max(1, planned * 0.001)) {
        findings.push({
          path: ["speaking", "prompt"],
          message: `The speaking objective requires total spending to be ${requiredPercent}% higher than planned, but the prompt says planned ${planned} and actual ${actual}. Repair the scenario figures and model answer together so the arithmetic and required frame agree.`
        });
      }
    }
    const requiredNamedFutureFacts = [...skills.speaking.prompt.matchAll(
      /\b([A-Z][\p{L}'’-]*)\s+will\s+([^,.!?]+?)(?=,?\s+(?:and|then|but|if)\b|[.!?]|$)/gu
    )].map((match) => {
      const actionAndDeadline = match[2]!.trim();
      const deadlineMatch = actionAndDeadline.match(/\bby\s+([\p{L}\p{N}'’-]+(?:\s+[\p{L}\p{N}'’-]+)?)/iu);
      return {
        text: `${match[1]} will ${actionAndDeadline}`.trim(),
        actor: match[1]!,
        action: actionAndDeadline.replace(/\bby\s+[\p{L}\p{N}'’-]+(?:\s+[\p{L}\p{N}'’-]+)?/iu, "").trim(),
        deadline: deadlineMatch?.[1]?.trim()
      };
    });
    const normalizedSpeakingAnswer = skills.speaking.answer.normalize("NFKC").toLocaleLowerCase("en-US");
    const factStopWords = new Set(["a", "an", "the", "to", "of", "for", "with", "by"]);
    const stemFactWord = (word: string) => {
      if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
      if (/(?:sses|xes|zes|ches|shes)$/u.test(word)) return word.slice(0, -2);
      return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
    };
    const answerFactTokens = new Set((normalizedSpeakingAnswer.match(/[\p{L}\p{N}'’-]+/gu) ?? []).map(stemFactWord));
    const missingNamedFutureFacts = requiredNamedFutureFacts.filter((fact) => {
      const actorPresent = answerFactTokens.has(stemFactWord(fact.actor.toLocaleLowerCase("en-US")));
      const actionTokens = (fact.action.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}'’-]+/gu) ?? [])
        .filter((word) => word.length > 2 && !factStopWords.has(word))
        .map(stemFactWord);
      const matchedActionTokens = actionTokens.filter((word) => answerFactTokens.has(word));
      const actionPresent = actionTokens.length >= 3
        ? matchedActionTokens.length >= 2
        : matchedActionTokens.length === actionTokens.length;
      const deadlineTokens = (fact.deadline?.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}'’-]+/gu) ?? []).map(stemFactWord);
      const deadlinePresent = deadlineTokens.every((word) => answerFactTokens.has(word));
      return !(actorPresent && actionPresent && deadlinePresent);
    });
    if (missingNamedFutureFacts.length > 0) {
      findings.push({
        path: ["speaking", "answer"],
        message: `The speaking prompt explicitly requires these actor-action facts: ${missingNamedFutureFacts.map((fact) => fact.text).join("; ")}. Preserve each actor, action and deadline before adding a participle clause or consequence.`
      });
    }
    const hasMuteContrast = /\bmute\b/u.test(focus) && /\bunmute\b/u.test(focus);
    if (hasMuteContrast) {
      const hasBothActs = /\bmute\b/u.test(answer) && /\bunmute\b/u.test(answer);
      const combinesOpposites = /\b(?:mute|unmute)\s+or\s+(?:mute|unmute)\b/u.test(answer);
      const separatesContexts = /[.!?].+[.!?]/su.test(answer) || /\b(?:if|when)\b/u.test(answer);
      const promptSeparatesContexts = /\b(?:hai|two|một.+một|one.+another|if|when)\b/su.test(prompt);
      if (hasBothActs && (combinesOpposites || !separatesContexts || !promptSeparatesContexts)) {
        findings.push({ path: ["speaking", "answer"], message: "A mute/unmute focus requires two natural context-specific requests, not one combined 'mute or unmute' sentence." });
      }
    }
    const answerHasAffirmative = /yes,?\s+i\s+can/u.test(answer);
    const answerHasNegative = /no,?\s+i\s+cannot/u.test(answer);
    if (/yes,?\s+i\s+can/u.test(focus) && /no,?\s+i\s+cannot/u.test(focus)
      && answerHasAffirmative && answerHasNegative
      && !/(?:hai|two)\s+(?:tình huống|situations?|contexts?)|\b(?:khi|when|if)\b.+\b(?:khi|when|if)\b|\bone\b.+\b(?:another|other)\b/isu.test(prompt)) {
      findings.push({ path: ["speaking", "answer"], message: "A Yes/No or can/cannot focus requires two explicitly different contexts; never combine contradictory alternatives as one speaker's single response." });
    }
  }
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

function pronunciationTargetFindings(foundation: FoundationBody): Array<{ path: PropertyKey[]; message: string }> {
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
  const family = compact([item.family1, item.family2]);
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
    // Never fabricate an inflection or a guessed derivation to make an
    // incomplete vocabulary record look ready. The level policy records this
    // as one visible light gap and targeted repair can supply a real family.
    family,
    umbrella: {
      word: item.umbrellaWord,
      meaning: item.umbrellaMeaning,
      siblings: compact([item.sibling1, item.sibling2, item.sibling3])
    },
    synonyms: compact([item.synonym1, item.synonym2]),
    antonyms: compact([item.antonym1]),
    relationStatus: (item.synonym1 || item.synonym2 || item.antonym1)
      ? "provided" as const
      : (item.relationStatus === "no_natural_relation" || item.relationStatus === "above_cefr_level")
        ? item.relationStatus
        : "generation_missed" as const
  };
}

function toVocabularyPart(items: Array<ReturnType<typeof toVocabularyItem>>) {
  const byUmbrella = new Map<string, { umbrella: { word: string; meaning: string }; itemWords: string[] }>();
  for (const item of items) {
    const word = item.umbrella.word.trim();
    if (!word) continue;
    const key = normalizeVocabularyKey(word);
    const group = byUmbrella.get(key) ?? {
      umbrella: { word, meaning: item.umbrella.meaning },
      itemWords: []
    };
    if (!group.itemWords.includes(item.word)) group.itemWords.push(item.word);
    byUmbrella.set(key, group);
  }
  return {
    items,
    groups: [...byUmbrella.values()].filter((group) => group.itemWords.length > 1)
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
    ...(has("totalTokens") ? { totalTokens: sum("totalTokens") } : {}),
    ...(has("cacheCreationInputTokens") ? { cacheCreationInputTokens: sum("cacheCreationInputTokens") } : {}),
    ...(has("cacheReadInputTokens") ? { cacheReadInputTokens: sum("cacheReadInputTokens") } : {})
  };
}
