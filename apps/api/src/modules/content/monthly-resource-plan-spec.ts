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
- Create the requested number of distinct core items in the month-wide pool.
- Create the requested number of expanded items in the month-wide pool. Expanded items may repeat across the month only when repeated entries stay at or below 20% of the total expanded set.
- Every item must have a real English form, a natural Vietnamese meaning, part
  of speech, accurate IPA where requested, a concise authentic example, and
  with no calendar-day assignment; the Operator reviews the pool before approval.
- Core terms must be unique after lowercasing and normalising spaces/
  punctuation; core terms must never appear as expanded terms.
- Each expanded item must state one relation: umbrella, synonym, antonym,
  word_family, or collocation; and identify the related core term. The relation
  must be linguistically real. A word family must belong to its stated base;
  a synonym/antonym must be a true semantic relation in this context.
- Balance support relations across the supplied core batch. Do not repeat one
  generic support phrase across the month.

GRAMMAR PLAN
- Return exactly two genuine CEFR-appropriate grammar topics. Topic A covers new lessons N1–N6, topic B covers N7–N12, and N13–N15 combine both. Each topic has
  a meaningful Vietnamese title, a precise formula, a concise Vietnamese use
  explanation, at least three natural work-context examples, and no calendar
  assignment. Do not use generic descriptions such as
  'Dùng để diễn đạt ý chính'.

PRONUNCIATION PLAN
- Return exactly four genuine pronunciation targets. The approval planner uses P1–P4 for N1–N12, then K1–K3 for N13–N15 and M1–M3 for N16–N18 where available. Every pronunciation word must have no more than three syllables. Each has accurate IPA,
  a meaningful Vietnamese label, and a list
  of real words from this month's approved vocabulary or closely related,
  non-duplicate examples. Explain the actual sound contrast or stress pattern
  when relevant. Never return 'sound 1 word 1' or a fabricated transcription.

POOL RULES
- The caller supplies newLessonCount and may provide a coreTermBatch. Never
  output dayNumber or dayNumbers fields. Allocation happens only after explicit
  Operator approval.
- For a support phase with one core in coreTermBatch, return six ordered
  candidate expanded terms. The API selects the first three valid, linked
  candidates after checking core overlap and the monthly repeat budget.
- Expanded resources must reference an exact core ID from the supplied batch.
- Daily lessons expose their approved resource assignments before exercises.
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
    coreTerms: Array<{ id: string; word: string }>;
    expandedTerms: Array<{ id: string; word: string; relation: "umbrella" | "synonym" | "antonym" | "word_family" | "collocation"; relatesToCoreId: string }>;
    grammarTopics: Array<{ id: string; steps: Array<{ id: string }> }>;
    pronunciationTargets: Array<{ id: string; words: Array<{ word: string }> }>;
  },
  newLessonCount: number,
): string[] {
  const errors: string[] = [];
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();
  const core = plan.coreTerms.map((item) => normalize(item.word));
  const expanded = plan.expandedTerms.map((item) => normalize(item.word));
  const expectedCore = newLessonCount * 3;
  const expectedExpanded = newLessonCount * 9;
  if (core.length !== expectedCore) errors.push(`Expected ${expectedCore} core terms, got ${core.length}.`);
  if (expanded.length !== expectedExpanded) errors.push(`Expected ${expectedExpanded} expanded terms, got ${expanded.length}.`);
  const singleHeadword = (value: string) => /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(value.trim());
  const workplacePhrase = (value: string) => {
    const words = value.trim().split(/\s+/u);
    return words.length >= 2 && words.length <= 4 && words.every(singleHeadword);
  };
  if (new Set(core).size !== core.length) errors.push("Core resources contain duplicate terms.");
  if (plan.coreTerms.some((item) => !singleHeadword(item.word))) errors.push("Every core resource must be one standalone lexical headword.");
  if (plan.expandedTerms.some((item) => !singleHeadword(item.word) && !workplacePhrase(item.word))) errors.push("Expanded resources must be standalone lexical headwords or natural two-to-four-word workplace phrases.");
  if (plan.expandedTerms.filter((item) => !singleHeadword(item.word)).length > Math.floor(plan.expandedTerms.length * 0.25)) errors.push("Expanded phrases exceed the 25% ceiling; standalone words must remain the clear majority.");
  if (expanded.some((word) => core.includes(word))) errors.push("A core term is repeated in expanded resources.");
  if (expanded.length - new Set(expanded).size > Math.floor(expanded.length * 0.2)) errors.push("Expanded resources repeat more than 20% of the monthly total.");
  const coreIds = new Set(plan.coreTerms.map((item) => item.id));
  if (coreIds.size !== plan.coreTerms.length) errors.push("Core resource IDs must be unique.");
  if (new Set(plan.expandedTerms.map((item) => item.id)).size !== plan.expandedTerms.length) errors.push("Expanded resource IDs must be unique.");
  if (plan.expandedTerms.some((item) => !coreIds.has(item.relatesToCoreId))) errors.push("Expanded resources must reference a core term in this month.");
  for (const coreId of coreIds) {
    const supports = plan.expandedTerms.filter((item) => item.relatesToCoreId === coreId);
    if (supports.length !== 3) errors.push(`Core ${coreId} needs exactly three support resources.`);
    if (new Set(supports.map((item) => item.relation)).size !== supports.length) errors.push(`Core ${coreId} repeats a support relation.`);
    if (supports.filter((item) => !singleHeadword(item.word)).length > 1) errors.push(`Core ${coreId} has more than one multi-word support item.`);
  }
  if (plan.grammarTopics.length !== 2) errors.push("Expected two grammar topics.");
  if (plan.grammarTopics.some((topic) => topic.steps.length !== 3)) errors.push("Every grammar topic needs exactly three ordered steps.");
  if (plan.pronunciationTargets.length !== 4) errors.push("Expected four pronunciation targets.");
  for (const [index, target] of plan.pronunciationTargets.entries()) {
    if (target.words.length < 9) errors.push(`Pronunciation target ${index + 1} needs at least nine real words.`);
    if (target.words.some((word) => syllableCount(word.word) > 3)) errors.push(`Pronunciation target ${index + 1} contains a word with more than three syllables.`);
  }
  const pronunciationWords = plan.pronunciationTargets.flatMap((target) => target.words.map((word) => normalize(word.word)));
  if (new Set(pronunciationWords).size !== pronunciationWords.length) errors.push("Pronunciation examples repeat between targets.");
  return errors;
}

function syllableCount(word: string): number {
  const parts = word.toLocaleLowerCase("en").match(/[aeiouy]+/gu) ?? [];
  return Math.max(1, parts.length);
}
