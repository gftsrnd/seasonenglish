import { isMonthlyPronunciationCatalogNotation, monthlyPronunciationMaxSyllables, isMonthlySupportLevelAllowed, maxMonthlySupportRepeats, monthlySupportLevelRule, monthlySupportLevelBand, MONTHLY_MAX_SUPPORTS_PER_CORE, MONTHLY_MIN_SUPPORTS_PER_CORE, describeRequiredSupportRelations, hasRequiredMonthlySupportRelations } from "@e4s/domain";

/**
 * Reusable contract for AI generation of monthly hard learning resources.
 * This is intentionally a generation specification, not a fixed monthly corpus:
 * the theme, CEFR level and number of study days are supplied by the caller.
 */
export const MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT = `
You are a CEFR curriculum designer. Build the fixed monthly learning resources
for one workplace-English month. This output will be approved before daily
lesson generation. Daily lesson generation may ONLY create activities, examples
and exercises from this approved plan; it may not invent new vocabulary,
grammar points or pronunciation material.

Return JSON only, matching the requested shape exactly. Use authentic,
level-appropriate English, Vietnamese meanings and reliable IPA. Never use
placeholder text, numbered fake words, template labels, invented compounds, or
repeated entries.

LEVEL DIFFERENTIATION
- A1: concrete routine workplace language, simple present, imperatives, basic
  requests; short high-frequency words and transparent phrases.
- A2: independent work, planning, customer service and collaboration;
  multi-syllable workplace vocabulary, comparison, modals, present perfect and
  first conditional where appropriate.
- B1: analysis, negotiation, problem solving and nuanced professional choices.
- B2/C1: abstract business reasoning, precise register, strategic and critical
  communication. Do not merely substitute harder-looking words.

VOCABULARY PLAN
- Create the requested number of distinct core items in the month-wide pool. Each core item is one standalone English lexical headword.
- In the completed month-wide pool, create three to nine expanded items per core (at least three, covering the relations the core's part of speech requires; add further genuine relations up to nine), never exceeding the caller's requested maximum. Prefer standalone headwords: at least 75% of the pool must be single words. A natural two-to-four-word expression is allowed for no more than one support per core (an umbrella group phrase such as office equipment does not count toward that one), and phrases may not exceed 35% of the pool. Expanded items may repeat across the month only when repeated entries stay at or below 35% of the total expanded set.
- Support words may come from the month's CEFR level or one adjacent level
  (±1, A1..C1). Label each expanded item with its own CEFR level in the
  optional cefr field. Never reject a genuine relation only because the word is
  one level above or below, and never use a word two or more levels away.
  Word-family items are the only exception: any level at or below the month
  and at most two levels above it (A1 up to B1, A2 up to B2, B1 and above up
  to C1), and only a common, frequently used derivation a learner actually
  meets at work, never a rare agent or abstract noun (texter, checker, payer,
  wrongness, busyness). Never force a relation that does not genuinely exist. During partial generation phases, follow the phase prompt's count and relation scope; do not try to complete the full pool in one response.
- Every item must have a real English form, a natural Vietnamese meaning, part
  of speech, accurate IPA where requested, a concise authentic example, and
  with no calendar-day assignment; the Operator reviews the pool before approval.
- Core terms must be unique after lowercasing and normalising spaces/
  punctuation; core terms must never appear as expanded terms. Every core word
  must be at the month's CEFR level or below, never above it, and directly on
  the approved theme; label it with its own level in the optional cefr field.
  Choose only standalone, level-appropriate workplace headwords that support
  the relations their part of speech requires (below): a noun needs a real
  umbrella and synonym; a verb, adjective or adverb needs a real synonym and a
  common, genuine non-inflectional word family.
  Avoid interjections, greetings, inflected forms, and unproductive words
  whose only related forms would be rare or fabricated.
- Each expanded item must state one relation: umbrella, synonym, antonym,
  word_family, or collocation; and identify the related core term. The relation
  must be linguistically real. The umbrella follows WordNet and depends on the
  core's part of speech:
  * noun: the hypernym, "A <core> is a kind of <umbrella>" (email -> message,
    invoice -> document); a two-to-three-word group noun phrase is fine
    (office equipment);
  * verb: a more general VERB the core is a way of doing, "To <core> is a way
    to <umbrella>" (email -> send, whisper -> speak, cancel -> stop, review ->
    check);
  * adjective/adverb: the attribute NOUN the word describes, "<core> describes
    <umbrella>" (small -> size, easy -> difficulty, happy -> mood, late -> time).
  An umbrella is never an associated topic or collocation, a narrower kind of
  the core (computer -> laptop), a synonym (leader -> boss), a related thing or
  event (attend -> meeting, pay -> salary), an adjective or modifier (designer
  -> graphic), or a generic placeholder (thing, stuff, item, action, activity,
  process, situation, status, quality, or work/job for a verb or adjective). A synonym must be close
  enough to replace the core in the stated sense; an antonym must express the
  opposite sense. A word_family item must share the core's lexical root through
  a real derivation (for example, manage → manager/management), not merely be
  related in meaning, share a workplace topic, or be a plural/past-tense form,
  the comparative or superlative of an adjective (smaller, easier), or the
  plain -ing form of a verb (sending); only established -ing nouns such as
  meeting, planning or training count.
  Collocation means words naturally used together, not an umbrella or synonym.
- Every core headword needs three to nine individually linked support items.
  Required relations depend on the core's part of speech: a noun needs one
  genuine umbrella/hypernym and one synonym (a word-family item is optional and
  taken when a common one exists); a verb, adjective or adverb needs one
  synonym and one word-family item (an umbrella is optional and taken when a
  genuine one exists). Further supports are added only when genuine. If a required relation is not accepted, keep the selected
  core stable and try distinct support candidates; never replace a core merely
  because one candidate or one audit attempt failed. Do not invent or mislabel
  a support, and report an unresolved relation only after the retry limit.
  Add useful collocations and a natural antonym or contextual
  contrast when one exists; never invent an antonym. Do not force all five
  relation groups when the language does not support them.
- Avoid shallow workflow-style variants around the core. Every support must
  add a distinct meaning or use, not a small wording change to one idea.

GRAMMAR PLAN
- Return exactly two genuine CEFR-appropriate grammar topics, each with three
  ordered progressive steps. Topic A steps progress over N1–N2, N3–N4 and
  N5–N6; topic B steps progress over N7–N8, N9–N10 and N11–N12. N13–N16
  combine both topics' third steps. Each step has a distinct focus, precise
  formula, concise Vietnamese use explanation and at least three natural
  work-context examples. Do not use generic descriptions such as
  'Dùng để diễn đạt ý chính'.

PRONUNCIATION PLAN
- Return exactly four distinct, genuine English pronunciation targets with
  accurate target IPA. The approval planner uses P1–P4 for N1–N12, then K1–K3 for
  N13–N15 and M1–M3 for N16–N18 where available. The application chooses the
  four roadmap items (docs/pronunciation-roadmap.md) and the phase prompt
  names them. Single-word examples of phonemes, confusable pairs and word
  stress have no more than three syllables; phenomenon items (linking, weak
  forms, sentence stress, intonation) may use short phrases or sentences.
  Every example must actually illustrate the item. Each has accurate IPA,
  a meaningful Vietnamese label, and a list
  of real words from this month's approved vocabulary or closely related,
  non-duplicate examples. Explain the actual sound contrast or stress pattern.
  A1–A2 targets must be foundational phonemes from the standard British
  English 44-sound inventory. B1–C1 targets must be level-appropriate advanced
  pronunciation phenomena, not beginner isolated-phoneme lessons.
  Use neutral workplace words; never invent cultural, historical or identity-
  based context. Never return 'sound 1 word 1' or a fabricated transcription.

POOL RULES
- The caller supplies newLessonCount and may provide a coreTermBatch. Never
  output dayNumber or dayNumbers fields. Allocation happens only after explicit
  Operator approval.
  - Follow the active phase prompt's requested candidate count and relation
    scope. A single-relation support phase must return only that exact relation;
    an optional-support phase may return several genuine relation types.
    The API selects three to nine valid linked items and accepts three when the
    relation types required for the core's part of speech are covered and further authentic relations are
    not available.
- Expanded resources must reference an exact core ID from the supplied batch.
- Daily lessons expose their approved resource assignments before exercises.
`;

const A1_A2_ENGLISH_44_PHONEMES = new Set([
  "/iː/", "/ɪ/", "/e/", "/æ/", "/ʌ/", "/ɑː/", "/ɒ/", "/ɔː/", "/ʊ/", "/uː/", "/ə/", "/ɜː/",
  "/eɪ/", "/aɪ/", "/ɔɪ/", "/aʊ/", "/əʊ/", "/ɪə/", "/eə/", "/ʊə/",
  "/p/", "/b/", "/t/", "/d/", "/k/", "/g/", "/f/", "/v/", "/θ/", "/ð/", "/s/", "/z/", "/ʃ/", "/ʒ/", "/tʃ/", "/dʒ/", "/m/", "/n/", "/ŋ/", "/h/", "/l/", "/r/", "/w/", "/j/"
]);

export function isPronunciationTargetAllowedForLevel(cefr: "A1" | "A2" | "B1" | "B2" | "C1", ipa: string): boolean {
  // Roadmap catalog items of this level (phonemes, confusable pairs, phenomena) are always allowed.
  if (isMonthlyPronunciationCatalogNotation(ipa, cefr)) return true;
  const isFoundationalPhoneme = A1_A2_ENGLISH_44_PHONEMES.has(ipa.trim().toLocaleLowerCase("en-US"));
  return cefr === "A1" || cefr === "A2" ? isFoundationalPhoneme : !isFoundationalPhoneme;
}

export interface MonthlyResourcePlanRequest {
  month: string;
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  theme: {
    title: string;
    brief: string;
    context: string;
    communicationGoal: string;
  };
  newLessonDays: number[];
}

export const monthlyResourcePlanSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "coreTerms",
    "expandedTerms",
    "grammarTopics",
    "pronunciationTargets",
  ],
  properties: {
    coreTerms: {
      type: "array",
      description: "Exactly three unique items for every new lesson day.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "dayNumber",
          "word",
          "meaning",
          "type",
          "ipa",
          "example",
        ],
        properties: {
          id: { type: "string" },
          dayNumber: { type: "integer", minimum: 1 },
          word: { type: "string" },
          meaning: { type: "string" },
          type: { type: "string" },
          ipa: { type: "string" },
          example: { type: "string" },
          cefr: { enum: ["A1", "A2", "B1", "B2", "C1"], description: "The core word's own CEFR level: the month's level or below, never above." },
        },
      },
    },
    expandedTerms: {
      type: "array",
      description:
        "Three to nine unique real relation items for every core headword. A noun core requires umbrella and synonym (word family optional); a verb, adjective or adverb core requires synonym and word family (umbrella optional); antonyms and other extra relations are optional when natural. Supports may be at the month's CEFR level or one adjacent level.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "dayNumber",
          "word",
          "meaning",
          "type",
          "relation",
          "relatesToCoreId",
          "example",
        ],
        properties: {
          id: { type: "string" },
          dayNumber: { type: "integer", minimum: 1 },
          word: { type: "string" },
          meaning: { type: "string" },
          type: { type: "string" },
          relation: {
            enum: [
              "umbrella",
              "synonym",
              "antonym",
              "word_family",
              "collocation",
            ],
          },
          relatesToCoreId: { type: "string" },
          example: { type: "string" },
          cefr: { enum: ["A1", "A2", "B1", "B2", "C1"], description: "The support word's own CEFR level: the month's level or one adjacent level; word-family items may be any lower level or up to two levels above the month." },
        },
      },
    },
    grammarTopics: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "formula", "usage", "examples", "dayNumbers"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          formula: { type: "string" },
          usage: { type: "string" },
          examples: { type: "array", minItems: 3, items: { type: "string" } },
          dayNumbers: {
            type: "array",
            minItems: 1,
            items: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    pronunciationTargets: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "ipa", "label", "explanation", "dayNumbers", "words"],
        properties: {
          id: { type: "string" },
          ipa: { type: "string" },
          label: { type: "string" },
          explanation: { type: "string" },
          dayNumbers: {
            type: "array",
            minItems: 1,
            items: { type: "integer", minimum: 1 },
          },
          words: {
            type: "array",
            minItems: 9,
            items: {
              type: "object",
              required: ["word", "ipa", "meaning"],
              properties: {
                word: { type: "string" },
                ipa: { type: "string" },
                meaning: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Example quality bar only; it is not a fallback corpus and must not be reused as month data. */
export const MONTHLY_RESOURCE_PLAN_QUALITY_EXAMPLE = {
  core: {
    dayNumber: 1,
    word: "milestone",
    meaning: "cột mốc",
    type: "noun",
    ipa: "/ˈmaɪlstəʊn/",
    example: "Finishing the draft is our first milestone.",
  },
  expanded: {
    dayNumber: 1,
    word: "set priorities",
    meaning: "đặt thứ tự ưu tiên",
    type: "collocation",
    relation: "collocation",
    relatesToCoreId: "core-1",
    example: "Set priorities before starting work.",
  },
  grammar: {
    title: "Hiện tại hoàn thành với already, yet và just",
    formula: "S + have/has + V3",
    usage: "Báo cáo việc vừa hoàn thành hoặc chưa hoàn thành.",
    examples: [
      "I have already sent the proposal.",
      "Has the client replied yet?",
      "We have just finished the review.",
    ],
    dayNumbers: [1, 2, 3, 4],
  },
  pronunciation: {
    ipa: "/ə/",
    label: "Âm /ə/ trong từ đa âm công việc",
    explanation: "Âm yếu trong agenda, proposal và professional.",
    dayNumbers: [1, 2, 3, 4],
    words: [
      { word: "agenda", ipa: "/əˈdʒendə/", meaning: "chương trình họp" },
      { word: "proposal", ipa: "/prəˈpəʊzl/", meaning: "đề xuất" },
      { word: "professional", ipa: "/prəˈfeʃənl/", meaning: "chuyên nghiệp" },
      { word: "available", ipa: "/əˈveɪləbl/", meaning: "có sẵn" },
    ],
  },
} as const;

export function validateMonthlyResourcePlanShape(
  plan: {
    coreTerms: Array<{ id: string; word: string; type?: string }>;
    expandedTerms: Array<{ id: string; word: string; relation: "umbrella" | "synonym" | "antonym" | "word_family" | "collocation"; relatesToCoreId: string; cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | undefined }>;
    grammarTopics: Array<{ id: string; steps: Array<{ id: string; focus: string }> }>;
    pronunciationTargets: Array<{ id: string; ipa: string; label: string; explanation: string; words: Array<{ word: string }> }>;
  },
  newLessonCount: number,
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1",
): string[] {
  const errors: string[] = [];
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();
  const core = plan.coreTerms.map((item) => normalize(item.word));
  const expanded = plan.expandedTerms.map((item) => normalize(item.word));
  const expectedCore = newLessonCount * 3;
  const minimumExpanded = newLessonCount * 3 * MONTHLY_MIN_SUPPORTS_PER_CORE;
  const maximumExpanded = newLessonCount * 3 * MONTHLY_MAX_SUPPORTS_PER_CORE;
  if (core.length !== expectedCore) errors.push(`Expected ${expectedCore} core terms, got ${core.length}.`);
  if (expanded.length < minimumExpanded || expanded.length > maximumExpanded) errors.push(`Expected ${minimumExpanded}-${maximumExpanded} expanded terms, got ${expanded.length}.`);
  const singleHeadword = (value: string) => /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(value.trim());
  const workplacePhrase = (value: string) => {
    const words = value.trim().split(/\s+/u);
    return words.length >= 2 && words.length <= 4 && words.every(singleHeadword);
  };
  if (new Set(core).size !== core.length) errors.push("Core resources contain duplicate terms.");
  if (plan.coreTerms.some((item) => !singleHeadword(item.word))) errors.push("Every core resource must be one standalone lexical headword.");
  if (plan.expandedTerms.some((item) => !singleHeadword(item.word) && !workplacePhrase(item.word))) errors.push("Expanded resources must be standalone lexical headwords or natural two-to-four-word workplace phrases.");
  if (plan.expandedTerms.filter((item) => !singleHeadword(item.word)).length > Math.floor(plan.expandedTerms.length * 0.35)) errors.push("Expanded phrases exceed the 35% ceiling; standalone words must remain the clear majority.");
  if (expanded.some((word) => core.includes(word))) errors.push("A core term is repeated in expanded resources.");
  if (expanded.length - new Set(expanded).size > maxMonthlySupportRepeats(expanded.length)) errors.push("Expanded resources repeat more than 35% of the monthly total.");
  if (cefr) {
    for (const item of plan.expandedTerms) {
      if (!isMonthlySupportLevelAllowed(cefr, item)) errors.push(`Expanded resource ${item.id} is CEFR ${item.cefr}; ${monthlySupportLevelRule(cefr)}.`);
    }
  }
  const coreIds = new Set(plan.coreTerms.map((item) => item.id));
  if (coreIds.size !== plan.coreTerms.length) errors.push("Core resource IDs must be unique.");
  if (new Set(plan.expandedTerms.map((item) => item.id)).size !== plan.expandedTerms.length) errors.push("Expanded resource IDs must be unique.");
  if (plan.expandedTerms.some((item) => !coreIds.has(item.relatesToCoreId))) errors.push("Expanded resources must reference a core term in this month.");
  const coreTypes = new Map(plan.coreTerms.map((item) => [item.id, item.type]));
  for (const coreId of coreIds) {
    const supports = plan.expandedTerms.filter((item) => item.relatesToCoreId === coreId);
    if (supports.length < MONTHLY_MIN_SUPPORTS_PER_CORE || supports.length > MONTHLY_MAX_SUPPORTS_PER_CORE) errors.push(`Core ${coreId} needs three to nine support resources.`);
    const coreType = coreTypes.get(coreId);
    if (!hasRequiredMonthlySupportRelations(coreType, supports)) {
      errors.push(`Core ${coreId} needs ${describeRequiredSupportRelations(coreType)} supports.`);
    }
    if (supports.filter((item) => item.relation !== "umbrella" && !singleHeadword(item.word)).length > 1) errors.push(`Core ${coreId} has more than one multi-word support item.`);
  }
  if (plan.grammarTopics.length !== 2) errors.push("Expected two grammar topics.");
  if (plan.grammarTopics.some((topic) => topic.steps.length !== 3)) errors.push("Every grammar topic needs exactly three ordered steps.");
  for (const [index, topic] of plan.grammarTopics.entries()) {
    if (new Set(topic.steps.map((step) => step.id)).size !== topic.steps.length) errors.push(`Grammar topic ${index + 1} repeats a step ID.`);
    if (new Set(topic.steps.map((step) => normalize(step.focus))).size !== topic.steps.length) errors.push(`Grammar topic ${index + 1} needs a distinct focus for each progressive step.`);
  }
  if (plan.pronunciationTargets.length !== 4) errors.push("Expected four pronunciation targets.");
  if (new Set(plan.pronunciationTargets.map((target) => normalize(target.ipa))).size !== plan.pronunciationTargets.length) errors.push("Monthly resources need four distinct pronunciation targets.");
  if (cefr && plan.pronunciationTargets.some((target) => !isPronunciationTargetAllowedForLevel(cefr, target.ipa))) {
    errors.push("A1-A2 pronunciation targets must come from the specified British English 44-phoneme inventory.");
  }
  for (const [index, target] of plan.pronunciationTargets.entries()) {
    if (!isValidMonthlyPronunciationIpaTarget(target.ipa)) errors.push(`Pronunciation target ${index + 1} needs a valid IPA target.`);
    if (!target.label.trim() || !target.explanation.trim()) errors.push(`Pronunciation target ${index + 1} needs an authentic label and sound explanation.`);
    if (target.words.length < 9) errors.push(`Pronunciation target ${index + 1} needs at least nine real words.`);
    if (target.words.some((word) => {
      const limit = cefr ? monthlyPronunciationMaxSyllables(cefr, target, word.word) : 3;
      return limit !== undefined && syllableCount(word.word) > limit;
    })) errors.push(`Pronunciation target ${index + 1} contains a word with more than three syllables.`);
  }
  const pronunciationWords = plan.pronunciationTargets.flatMap((target) => target.words.map((word) => normalize(word.word)));
  if (new Set(pronunciationWords).size !== pronunciationWords.length) errors.push("Pronunciation examples repeat between targets.");
  return errors;
}

/** Accept one slash-delimited IPA form, never a list of transcriptions or prose. */
export function isValidMonthlyPronunciationIpaTarget(value: string): boolean {
  // Roadmap notations (/ɪ/–/iː/, /-ed=t/, /C‿V/, /↘ Wh-/ …) are fixed by the catalog.
  if (isMonthlyPronunciationCatalogNotation(value)) return true;
  const match = value.trim().match(/^\/([^/\s]+)\/$/u);
  if (!match) return false;
  const symbols = match[1]!;
  if (!/^[a-z\u00e6\u00f8\u0153\u0250-\u02af\u02b0-\u02ff\u0300-\u036f\u1d00-\u1d7f.βθχ]+$/u.test(symbols)) return false;
  // Reject likely prose labels made only of ASCII letters while allowing short
  // consonant clusters and the IPA stress/length markers around real symbols.
  const transcription = symbols.replace(/[ˈˌːˑ.]/gu, "");
  return !/^[a-z]{4,}$/u.test(transcription);
}

function syllableCount(word: string): number {
  const parts = word.toLocaleLowerCase("en").match(/[aeiouy]+/gu) ?? [];
  return Math.max(1, parts.length);
}
