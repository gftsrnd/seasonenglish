/** Reusable prompt contract for AI-produced monthly hard resources. */

export const MONTHLY_RESOURCE_PLANNER_SYSTEM_PROMPT = `
You are the E4S monthly curriculum planner. Produce one complete, teachable,
internally consistent hard-resource plan for one CEFR level and one monthly
brief. It is reviewed by an English teacher and becomes the only resource
source for daily lessons.

Quality rules
- Write authentic, level-appropriate English and natural Vietnamese meanings.
- Adapt vocabulary, grammar complexity, communication function and pronunciation
  focus to the requested CEFR level. Different levels must not reuse the same
  corpus or merely rename the same items.
- Keep one coherent, practical topic drawn from the brief.
- Never use placeholders, template labels, numbered invented words, fake IPA,
  generic filler or mechanically repeated examples.
- A visible word, phrase or expression may appear only once in core and expanded
  resources combined. Check duplicates after lower-casing and removing
  punctuation and extra spaces.
- IPA must be valid dictionary-style IPA; all examples must be grammatical and
  useful in the monthly theme.

Daily resource plan
- The input supplies every new-lesson date. Create exactly 3 distinct core terms
  for each date: 3 × newLessonDates.length in total.
- Each core term needs word_or_phrase, Vietnamese meaning, part_of_speech, IPA,
  a real short example, date and lesson number.
- Create exactly 9 distinct expanded items for each new-lesson date: 3 umbrella
  topic items, 4 genuine synonym/antonym relations, and 2 word-family or natural
  collocation items. Each needs the same descriptive fields and the date/lesson.
- Every expanded item must have a real pedagogical relation to one of that date's
  three core terms. Never use synthetic forms such as "related to X", "X
  process", "X 2", or copies of an existing core/expanded expression.
- Plan all hard resources now. A daily generator may only turn resources assigned
  to its own date into exercises, examples, listening, reading, writing and
  speaking tasks; it must never add, replace or reassign hard resources.

Grammar
- Create exactly 4 concrete, distinct grammar topics.
- Each has a Vietnamese learner-facing title, precise formula, Vietnamese use
  explanation, at least three real theme-relevant examples, and planned lesson
  numbers/dates. Do not use titles such as "Grammar 1".

Pronunciation
- Create exactly 4 real phoneme focuses. Each needs valid IPA, a Vietnamese
  learner-facing title, planned lesson numbers/dates, and 8–12 unique real English
  example words relevant to the corpus. Include full IPA for each example word.
- Do not repeat a pronunciation word between phoneme groups.

Return valid JSON only, conforming exactly to the requested schema. Do not add
commentary, markdown or fields outside that schema.
`;

export const MONTHLY_RESOURCE_PLANNER_OUTPUT_SCHEMA = {
  type: "object",
  required: [
    "coreTerms",
    "expandedTerms",
    "grammarTopics",
    "pronunciationSounds",
  ],
  properties: {
    coreTerms: {
      type: "array",
      description: "Exactly 3 items for each supplied new-lesson date.",
    },
    expandedTerms: {
      type: "array",
      description:
        "Exactly 9 items for each supplied new-lesson date: 3 umbrella, 4 synonym/antonym, 2 family/collocation.",
    },
    grammarTopics: { type: "array", minItems: 4, maxItems: 4 },
    pronunciationSounds: { type: "array", minItems: 4, maxItems: 4 },
  },
} as const;

export const MONTHLY_RESOURCE_PLANNER_ITEM_SHAPE = {
  coreTerm: [
    "id",
    "date",
    "lessonNumber",
    "word",
    "meaning",
    "type",
    "ipa",
    "example",
  ],
  expandedTerm: [
    "id",
    "date",
    "lessonNumber",
    "category",
    "word",
    "meaning",
    "type",
    "ipa",
    "example",
    "relatedCoreIds",
  ],
  grammarTopic: [
    "id",
    "title",
    "formula",
    "usage",
    "examples",
    "lessonNumbers",
    "dates",
  ],
  pronunciationSound: [
    "id",
    "ipa",
    "title",
    "lessonNumbers",
    "dates",
    "examples",
  ],
  pronunciationExample: ["word", "ipa"],
} as const;

/** Rules the API must apply before storing the response. */
export const MONTHLY_RESOURCE_PLANNER_VALIDATION_RULES = [
  "coreTerms.length === newLessonDates.length * 3",
  "expandedTerms.length === newLessonDates.length * 9",
  "Every new-lesson date has exactly 3 core and 9 expanded assignments",
  "Each expanded day has 3 umbrella, 4 synonym/antonym and 2 family/collocation items",
  "Core and expanded words are globally unique after canonical normalization",
  "Every expanded item links to an assigned core term from the same date",
  "Reject template patterns: related to, process, word N, sound N, grammar N, and fake numeric suffixes",
  "Every lexical record has word, meaning, type, IPA, example, date and lessonNumber",
  "Exactly four grammar topics have formula, use, three examples and planned dates",
  "Exactly four phoneme focuses have valid IPA, planned dates and 8–12 unique examples with IPA",
  "Pronunciation words do not repeat across groups",
  "No grammar, pronunciation or lexical title may be a placeholder",
] as const;

/** A small real A1 reference for validation, never a fixed monthly corpus. */
export const MONTHLY_RESOURCE_PLANNER_A1_REFERENCE_SAMPLE = {
  core: {
    date: "2026-11-02",
    lessonNumber: 1,
    word: "agenda",
    meaning: "chương trình họp",
    type: "noun",
    ipa: "/əˈdʒendə/",
    example: "Please read the agenda before the meeting.",
  },
  expanded: {
    date: "2026-11-02",
    lessonNumber: 1,
    category: "collocation",
    word: "set an agenda",
    meaning: "lập chương trình họp",
    type: "phrase",
    ipa: "/set ən əˈdʒendə/",
    example: "We set an agenda for the client call.",
    relatedCoreIds: ["agenda"],
  },
  grammar: {
    title: "Giới thiệu vai trò công việc",
    formula: "I work as + job title.",
    usage:
      "Dùng để giới thiệu công việc hiện tại trong tình huống chuyên nghiệp.",
    examples: [
      "I work as a sales assistant.",
      "She works as a project coordinator.",
      "He works as a support officer.",
    ],
    lessonNumbers: [1, 2, 3, 4],
    dates: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"],
  },
  pronunciation: {
    ipa: "/iː/",
    title: "Âm /iː/ trong từ về cuộc họp",
    lessonNumbers: [1, 5, 9, 13],
    dates: ["2026-11-02", "2026-11-06", "2026-11-12", "2026-11-18"],
    examples: [
      { word: "meeting", ipa: "/ˈmiːtɪŋ/" },
      { word: "team", ipa: "/tiːm/" },
    ],
  },
} as const;
