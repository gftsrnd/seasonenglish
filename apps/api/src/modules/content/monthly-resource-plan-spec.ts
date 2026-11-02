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
- Create exactly 3 distinct core items for every NEW lesson day.
- Create exactly 9 distinct expanded items for every NEW lesson day.
- Every item must have a real English form, a natural Vietnamese meaning, part
  of speech, accurate IPA where requested, a concise authentic example, and
  the new-lesson day number that introduces it.
- No duplicates after lowercasing and normalising spaces/punctuation: not
  within core, expanded, grammar examples or pronunciation words; core terms
  must also not appear as expanded terms.
- Each expanded item must state one relation: umbrella, synonym, antonym,
  word_family, or collocation; and identify the related core term. The relation
  must be linguistically real. A word family must belong to its stated base;
  a synonym/antonym must be a true semantic relation in this context.
- Balance each day around its three cores: use umbrella concepts, useful
  collocations and appropriate relations. Do not repeat one generic support
  phrase across days.

GRAMMAR PLAN
- Return exactly four genuine CEFR-appropriate grammar topics. Each topic has
  a meaningful Vietnamese title, a precise formula, a concise Vietnamese use
  explanation, at least three natural work-context examples, and explicit
  assigned new-lesson day numbers. Do not use generic descriptions such as
  'Dùng để diễn đạt ý chính'.

PRONUNCIATION PLAN
- Return exactly four genuine pronunciation targets. Each has accurate IPA,
  a meaningful Vietnamese label, assigned new-lesson day numbers, and a list
  of real words from this month's approved vocabulary or closely related,
  non-duplicate examples. Explain the actual sound contrast or stress pattern
  when relevant. Never return 'sound 1 word 1' or a fabricated transcription.

ASSIGNMENT RULES
- The caller supplies newLessonDays in chronological order. Each core and
  expanded item must be assigned to exactly one of those day numbers.
- Each grammar topic and pronunciation target must explicitly list the days
  on which it is used. This is part of the monthly plan, not a later guess.
- The daily lesson must expose its assigned core, expanded, grammar and sound
  material before creating exercises.
`;

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
        },
      },
    },
    expandedTerms: {
      type: "array",
      description:
        "Exactly nine unique real relation items for every new lesson day.",
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
        },
      },
    },
    grammarTopics: {
      type: "array",
      minItems: 4,
      maxItems: 4,
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
            minItems: 4,
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
    coreTerms: Array<{ dayNumber: number; word: string }>;
    expandedTerms: Array<{
      dayNumber: number;
      word: string;
      relatesToCoreId: string;
    }>;
    grammarTopics: unknown[];
    pronunciationTargets: unknown[];
  },
  newLessonDays: readonly number[],
): string[] {
  const errors: string[] = [];
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase("en").replace(/\\s+/g, " ");
  const core = plan.coreTerms.map((item) => normalize(item.word));
  const expanded = plan.expandedTerms.map((item) => normalize(item.word));
  const expectedCore = newLessonDays.length * 3;
  const expectedExpanded = newLessonDays.length * 9;
  if (core.length !== expectedCore)
    errors.push(`Expected ${expectedCore} core terms, got ${core.length}.`);
  if (expanded.length !== expectedExpanded)
    errors.push(
      `Expected ${expectedExpanded} expanded terms, got ${expanded.length}.`,
    );
  if (new Set(core).size !== core.length)
    errors.push("Core resources contain duplicate terms.");
  if (new Set(expanded).size !== expanded.length)
    errors.push("Expanded resources contain duplicate terms.");
  if (expanded.some((word) => core.includes(word)))
    errors.push("A core term is repeated in expanded resources.");
  for (const dayNumber of newLessonDays) {
    if (
      plan.coreTerms.filter((item) => item.dayNumber === dayNumber).length !== 3
    )
      errors.push(`Day ${dayNumber} does not have three core terms.`);
    if (
      plan.expandedTerms.filter((item) => item.dayNumber === dayNumber)
        .length !== 9
    )
      errors.push(`Day ${dayNumber} does not have nine expanded terms.`);
  }
  if (plan.grammarTopics.length !== 4)
    errors.push("Expected four grammar topics.");
  if (plan.pronunciationTargets.length !== 4)
    errors.push("Expected four pronunciation targets.");
  return errors;
}
