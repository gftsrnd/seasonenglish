import type { ContentGenerationFindingView, ContentLessonDraftInput } from "@e4s/contracts";
import { containsVietnameseLearnerText } from "@e4s/domain/content";
import { relationExemptionIsCredible } from "./lexical-relations.js";

export type LessonRepairMode = "enrich" | "fill-phrases";
export type LessonGenerationComponent = "foundation" | "vocabulary" | "skills";

export type VocabularyEnrichmentIssue = {
  path: string;
  message: string;
};

export type VocabularyEnrichmentPromptInput = {
  headword?: string;
  pos?: string;
  sense?: string;
  example?: string;
  cefr?: string;
  context?: string;
};

type HeteronymPosSpec = {
  canonicalIpa: string;
  stressedSyllable: 1 | 2;
  canonicalStress: string;
  ipaPattern: RegExp;
  wrongSenseKeywords?: RegExp;
};

const HETERONYM_POS_RULES: Readonly<Record<string, Partial<Record<"noun" | "verb" | "adjective", HeteronymPosSpec>>>> = {
  present: {
    noun: {
      canonicalIpa: "/ˈprezənt/",
      stressedSyllable: 1,
      canonicalStress: "PRE-sent",
      ipaPattern: /^\/ˈpr[eɛ]z[əɪ]?nt\/$/u,
      wrongSenseKeywords: /\b(?:introduce formally|show to a group|deliver a talk)\b|(?:trình bày|giới thiệu)/iu
    },
    adjective: {
      canonicalIpa: "/ˈprezənt/",
      stressedSyllable: 1,
      canonicalStress: "PRE-sent",
      ipaPattern: /^\/ˈpr[eɛ]z[əɪ]?nt\/$/u
    },
    verb: {
      canonicalIpa: "/prɪˈzent/",
      stressedSyllable: 2,
      canonicalStress: "pre-SENT",
      ipaPattern: /^\/pr[ɪiə]ˈz[eɛ]nt\/$/u,
      wrongSenseKeywords: /\b(?:a gift|something given|current time)\b|(?:món quà|quà tặng)/iu
    }
  },
  record: {
    noun: {
      canonicalIpa: "/ˈrekərd/",
      stressedSyllable: 1,
      canonicalStress: "RE-cord",
      ipaPattern: /^\/ˈr[eɛ]k(?:ərd|ɔːr?d|əd)\/$/u,
      wrongSenseKeywords: /\b(?:to capture audio|to tape|to write down an action)\b|(?:ghi âm|thu âm)/iu
    },
    verb: {
      canonicalIpa: "/rɪˈkɔːrd/",
      stressedSyllable: 2,
      canonicalStress: "re-CORD",
      ipaPattern: /^\/r[ɪiə]ˈkɔːr?d\/$/u
    }
  },
  object: {
    noun: {
      canonicalIpa: "/ˈɑːbdʒekt/",
      stressedSyllable: 1,
      canonicalStress: "OB-ject",
      ipaPattern: /^\/ˈ[ɑːɒɔ]bdʒ[eɛɪ]kt\/$/u
    },
    verb: {
      canonicalIpa: "/əbˈdʒekt/",
      stressedSyllable: 2,
      canonicalStress: "ob-JECT",
      ipaPattern: /^\/[əɑɒ]bˈdʒ[eɛ]kt\/$/u
    }
  },
  project: {
    noun: {
      canonicalIpa: "/ˈprɑːdʒekt/",
      stressedSyllable: 1,
      canonicalStress: "PRO-ject",
      ipaPattern: /^\/ˈpr[ɑːɒɔ]dʒ[eɛɪ]kt\/$/u
    },
    verb: {
      canonicalIpa: "/prəˈdʒekt/",
      stressedSyllable: 2,
      canonicalStress: "pro-JECT",
      ipaPattern: /^\/pr[əoʊ]ˈdʒ[eɛ]kt\/$/u
    }
  },
  contract: {
    noun: {
      canonicalIpa: "/ˈkɑːntrækt/",
      stressedSyllable: 1,
      canonicalStress: "CON-tract",
      ipaPattern: /^\/ˈk[ɑːɒɔ]ntrækt\/$/u
    },
    verb: {
      canonicalIpa: "/kənˈtrækt/",
      stressedSyllable: 2,
      canonicalStress: "con-TRACT",
      ipaPattern: /^\/kənˈtrækt\/$/u
    }
  },
  conduct: {
    noun: {
      canonicalIpa: "/ˈkɑːndʌkt/",
      stressedSyllable: 1,
      canonicalStress: "CON-duct",
      ipaPattern: /^\/ˈk[ɑːɒɔ]ndʌkt\/$/u
    },
    verb: {
      canonicalIpa: "/kənˈdʌkt/",
      stressedSyllable: 2,
      canonicalStress: "con-DUCT",
      ipaPattern: /^\/kənˈdʌkt\/$/u
    }
  },
  produce: {
    noun: {
      canonicalIpa: "/ˈprɑːduːs/",
      stressedSyllable: 1,
      canonicalStress: "PRO-duce",
      ipaPattern: /^\/ˈpr[ɑːɒoʊ]d(?:uːs|juːs)\/$/u
    },
    verb: {
      canonicalIpa: "/prəˈduːs/",
      stressedSyllable: 2,
      canonicalStress: "pro-DUCE",
      ipaPattern: /^\/prəˈd(?:uːs|juːs)\/$/u
    }
  },
  permit: {
    noun: {
      canonicalIpa: "/ˈpɜːrmɪt/",
      stressedSyllable: 1,
      canonicalStress: "PER-mit",
      ipaPattern: /^\/ˈpɜːr?mɪt\/$/u
    },
    verb: {
      canonicalIpa: "/pərˈmɪt/",
      stressedSyllable: 2,
      canonicalStress: "per-MIT",
      ipaPattern: /^\/pə?r?ˈmɪt\/$/u
    }
  },
  update: {
    noun: {
      canonicalIpa: "/ˈʌpdeɪt/",
      stressedSyllable: 1,
      canonicalStress: "UP-date",
      ipaPattern: /^\/ˈʌpdeɪt\/$/u
    },
    verb: {
      canonicalIpa: "/ˌʌpˈdeɪt/",
      stressedSyllable: 2,
      canonicalStress: "up-DATE",
      ipaPattern: /^\/ˌ?ʌpˈdeɪt\/$/u
    }
  },
  increase: {
    noun: {
      canonicalIpa: "/ˈɪŋkriːs/",
      stressedSyllable: 1,
      canonicalStress: "IN-crease",
      ipaPattern: /^\/ˈɪ[ŋn]kriːs\/$/u
    },
    verb: {
      canonicalIpa: "/ɪnˈkriːs/",
      stressedSyllable: 2,
      canonicalStress: "in-CREASE",
      ipaPattern: /^\/ɪ[nŋ]ˈkriːs\/$/u
    }
  },
  decrease: {
    noun: {
      canonicalIpa: "/ˈdiːkriːs/",
      stressedSyllable: 1,
      canonicalStress: "DE-crease",
      ipaPattern: /^\/ˈdiːkriːs\/$/u
    },
    verb: {
      canonicalIpa: "/dɪˈkriːs/",
      stressedSyllable: 2,
      canonicalStress: "de-CREASE",
      ipaPattern: /^\/d[ɪiː]ˈkriːs\/$/u
    }
  },
  export: {
    noun: {
      canonicalIpa: "/ˈekspɔːrt/",
      stressedSyllable: 1,
      canonicalStress: "EX-port",
      ipaPattern: /^\/ˈ[eɛ]kspɔːr?t\/$/u
    },
    verb: {
      canonicalIpa: "/ɪkˈspɔːrt/",
      stressedSyllable: 2,
      canonicalStress: "ex-PORT",
      ipaPattern: /^\/[ɪeɛ]kˈspɔːr?t\/$/u
    }
  },
  import: {
    noun: {
      canonicalIpa: "/ˈɪmpɔːrt/",
      stressedSyllable: 1,
      canonicalStress: "IM-port",
      ipaPattern: /^\/ˈɪmpɔːr?t\/$/u
    },
    verb: {
      canonicalIpa: "/ɪmˈpɔːrt/",
      stressedSyllable: 2,
      canonicalStress: "im-PORT",
      ipaPattern: /^\/ɪmˈpɔːr?t\/$/u
    }
  },
  conflict: {
    noun: {
      canonicalIpa: "/ˈkɑːnflɪkt/",
      stressedSyllable: 1,
      canonicalStress: "CON-flict",
      ipaPattern: /^\/ˈk[ɑːɒɔ]nflɪkt\/$/u
    },
    verb: {
      canonicalIpa: "/kənˈflɪkt/",
      stressedSyllable: 2,
      canonicalStress: "con-FLICT",
      ipaPattern: /^\/kənˈflɪkt\/$/u
    }
  },
  suspect: {
    noun: {
      canonicalIpa: "/ˈsʌspekt/",
      stressedSyllable: 1,
      canonicalStress: "SUS-pect",
      ipaPattern: /^\/ˈsʌsp[eɛ]kt\/$/u
    },
    adjective: {
      canonicalIpa: "/ˈsʌspekt/",
      stressedSyllable: 1,
      canonicalStress: "SUS-pect",
      ipaPattern: /^\/ˈsʌsp[eɛ]kt\/$/u
    },
    verb: {
      canonicalIpa: "/səˈspekt/",
      stressedSyllable: 2,
      canonicalStress: "sus-PECT",
      ipaPattern: /^\/səˈsp[eɛ]kt\/$/u
    }
  },
  protest: {
    noun: {
      canonicalIpa: "/ˈproʊtest/",
      stressedSyllable: 1,
      canonicalStress: "PRO-test",
      ipaPattern: /^\/ˈpr(?:oʊ|əʊ)t[eɛ]st\/$/u
    },
    verb: {
      canonicalIpa: "/prəˈtest/",
      stressedSyllable: 2,
      canonicalStress: "pro-TEST",
      ipaPattern: /^\/pr[əoʊ]ˈt[eɛ]st\/$/u
    }
  },
  survey: {
    noun: {
      canonicalIpa: "/ˈsɜːrveɪ/",
      stressedSyllable: 1,
      canonicalStress: "SUR-vey",
      ipaPattern: /^\/ˈsɜːr?veɪ\/$/u
    },
    verb: {
      canonicalIpa: "/sərˈveɪ/",
      stressedSyllable: 2,
      canonicalStress: "sur-VEY",
      ipaPattern: /^\/sə?r?ˈveɪ\/$/u
    }
  },
  progress: {
    noun: {
      canonicalIpa: "/ˈprɑːɡres/",
      stressedSyllable: 1,
      canonicalStress: "PRO-gress",
      ipaPattern: /^\/ˈpr[ɑːɒoʊ]ɡr[eɛə]s\/$/u
    },
    verb: {
      canonicalIpa: "/prəˈɡres/",
      stressedSyllable: 2,
      canonicalStress: "pro-GRESS",
      ipaPattern: /^\/prəˈɡr[eɛ]s\/$/u
    }
  },
  refund: {
    noun: {
      canonicalIpa: "/ˈriːfʌnd/",
      stressedSyllable: 1,
      canonicalStress: "RE-fund",
      ipaPattern: /^\/ˈriːfʌnd\/$/u
    },
    verb: {
      canonicalIpa: "/rɪˈfʌnd/",
      stressedSyllable: 2,
      canonicalStress: "re-FUND",
      ipaPattern: /^\/r[ɪiː]ˈfʌnd\/$/u
    }
  },
  reject: {
    noun: {
      canonicalIpa: "/ˈriːdʒekt/",
      stressedSyllable: 1,
      canonicalStress: "RE-ject",
      ipaPattern: /^\/ˈriːdʒ[eɛ]kt\/$/u
    },
    verb: {
      canonicalIpa: "/rɪˈdʒekt/",
      stressedSyllable: 2,
      canonicalStress: "re-JECT",
      ipaPattern: /^\/r[ɪi]ˈdʒ[eɛ]kt\/$/u
    }
  },
  subject: {
    noun: {
      canonicalIpa: "/ˈsʌbdʒɪkt/",
      stressedSyllable: 1,
      canonicalStress: "SUB-ject",
      ipaPattern: /^\/ˈsʌbdʒ[ɪeɛ]kt\/$/u
    },
    adjective: {
      canonicalIpa: "/ˈsʌbdʒɪkt/",
      stressedSyllable: 1,
      canonicalStress: "SUB-ject",
      ipaPattern: /^\/ˈsʌbdʒ[ɪeɛ]kt\/$/u
    },
    verb: {
      canonicalIpa: "/səbˈdʒekt/",
      stressedSyllable: 2,
      canonicalStress: "sub-JECT",
      ipaPattern: /^\/səbˈdʒ[eɛ]kt\/$/u
    }
  },
  convert: {
    noun: {
      canonicalIpa: "/ˈkɑːnvɜːrt/",
      stressedSyllable: 1,
      canonicalStress: "CON-vert",
      ipaPattern: /^\/ˈk[ɑːɒɔ]nvɜːr?t\/$/u
    },
    verb: {
      canonicalIpa: "/kənˈvɜːrt/",
      stressedSyllable: 2,
      canonicalStress: "con-VERT",
      ipaPattern: /^\/kənˈvɜːr?t\/$/u
    }
  },
  refuse: {
    noun: {
      canonicalIpa: "/ˈrefjuːs/",
      stressedSyllable: 1,
      canonicalStress: "REF-use",
      ipaPattern: /^\/ˈr[eɛ]fjuːs\/$/u
    },
    verb: {
      canonicalIpa: "/rɪˈfjuːz/",
      stressedSyllable: 2,
      canonicalStress: "re-FUSE",
      ipaPattern: /^\/r[ɪi]ˈfjuːz\/$/u
    }
  },
  content: {
    noun: {
      canonicalIpa: "/ˈkɑːntent/",
      stressedSyllable: 1,
      canonicalStress: "CON-tent",
      ipaPattern: /^\/ˈk[ɑːɒɔ]nt[eɛ]nt\/$/u
    },
    adjective: {
      canonicalIpa: "/kənˈtent/",
      stressedSyllable: 2,
      canonicalStress: "con-TENT",
      ipaPattern: /^\/kənˈt[eɛ]nt\/$/u
    },
    verb: {
      canonicalIpa: "/kənˈtent/",
      stressedSyllable: 2,
      canonicalStress: "con-TENT",
      ipaPattern: /^\/kənˈt[eɛ]nt\/$/u
    }
  },
  use: {
    noun: {
      canonicalIpa: "/juːs/",
      stressedSyllable: 1,
      canonicalStress: "USE",
      ipaPattern: /^\/juːs\/$/u
    },
    verb: {
      canonicalIpa: "/juːz/",
      stressedSyllable: 1,
      canonicalStress: "USE",
      ipaPattern: /^\/juːz\/$/u
    }
  },
  close: {
    adjective: {
      canonicalIpa: "/kloʊs/",
      stressedSyllable: 1,
      canonicalStress: "CLOSE",
      ipaPattern: /^\/kl(?:oʊ|əʊ)s\/$/u
    },
    verb: {
      canonicalIpa: "/kloʊz/",
      stressedSyllable: 1,
      canonicalStress: "CLOSE",
      ipaPattern: /^\/kl(?:oʊ|əʊ)z\/$/u
    }
  },
  live: {
    adjective: {
      canonicalIpa: "/laɪv/",
      stressedSyllable: 1,
      canonicalStress: "LIVE",
      ipaPattern: /^\/laɪv\/$/u
    },
    verb: {
      canonicalIpa: "/lɪv/",
      stressedSyllable: 1,
      canonicalStress: "LIVE",
      ipaPattern: /^\/lɪv\/$/u
    }
  },
  separate: {
    adjective: {
      canonicalIpa: "/ˈseprət/",
      stressedSyllable: 1,
      canonicalStress: "SEP-rate",
      ipaPattern: /^\/ˈs[eɛ]p(?:ə)?r[əɪ]t\/$/u
    },
    verb: {
      canonicalIpa: "/ˈsepəreɪt/",
      stressedSyllable: 1,
      canonicalStress: "SEP-a-rate",
      ipaPattern: /^\/ˈs[eɛ]pəreɪt\/$/u
    }
  },
  estimate: {
    noun: {
      canonicalIpa: "/ˈestɪmət/",
      stressedSyllable: 1,
      canonicalStress: "ES-ti-mate",
      ipaPattern: /^\/ˈ[eɛ]st[ɪə]m[əɪ]t\/$/u
    },
    verb: {
      canonicalIpa: "/ˈestɪmeɪt/",
      stressedSyllable: 1,
      canonicalStress: "ES-ti-mate",
      ipaPattern: /^\/ˈ[eɛ]st[ɪə]meɪt\/$/u
    }
  },
  document: {
    noun: {
      canonicalIpa: "/ˈdɑːkjəmənt/",
      stressedSyllable: 1,
      canonicalStress: "DOC-u-ment",
      ipaPattern: /^\/ˈd[ɑːɒɔ]kj[əʊ]mənt\/$/u
    },
    verb: {
      canonicalIpa: "/ˈdɑːkjəment/",
      stressedSyllable: 1,
      canonicalStress: "DOC-u-ment",
      ipaPattern: /^\/ˈd[ɑːɒɔ]kj[əʊ]m[eɛ]nt\/$/u
    }
  }
};

export const TESOL_VOCABULARY_ENRICHMENT_CONTRACT = [
  "You are a senior ESL lexicographer and pronunciation specialist for E4S.",
  "Generate vocabulary, synonyms, antonyms, and umbrella words (hypernyms) for ONE headword in ONE specific workplace sense, with pronunciation data accurate enough for TTS.",
  "1. HETERONYM DISAMBIGUATION: For heteronyms whose pronunciation changes by part of speech or sense (e.g. present, record, object, project, contract, conduct, produce, permit, update, increase, decrease, export, import, conflict, suspect, protest, survey, progress, refund, reject, subject, convert, refuse, content, use, close, live, separate, estimate, document), partOfSpeech, slash-delimited IPA (with primary stress mark ˈ), stress (e.g. pre-SENT vs PRE-sent), and SSML (<speak><phoneme alphabet=\"ipa\" ph=\"IPA_WITHOUT_SLASHES\">word</phoneme></speak>) MUST all match the exact contextual part of speech.",
  "2. SAME POS & CONTEXTUAL SENSE: Every synonym and antonym must have the exact same partOfSpeech and contextual sense as the target headword and pass the substitution test in the example sentence.",
  "3. SELF-SYNONYM & DERIVATION GUARD: A synonym or antonym must never repeat the target headword itself (case-insensitively). Morphological derivatives or inflections of the headword (e.g. introduction, reintroduce, introducing for introduce; presentation for present; reporter for report) belong only in word family and are NEVER synonyms or antonyms.",
  "4. UMBRELLA WORDS (HYPERNYMS): Must pass the IS-A test ('A/An <headword> is a kind of <umbrella>' for nouns, 'To <headword> is a way to <umbrella>' for verbs) and name a genuine broader category with accurate POS and pronunciation.",
  "5. CEFR LANGUAGE POLICY: Keep meaning (and *Meaning / meaning_vi) in natural Vietnamese for this exact sense. For B1-C1, all learner-facing lexical fields (note, sense, example, collocations, and section title) MUST be in English."
].join("\n");

export function buildVocabularyEnrichmentPrompt(input: VocabularyEnrichmentPromptInput = {}): string {
  const contextLines = [
    input.headword ? `- Headword: ${input.headword}` : "",
    input.pos ? `- Part of speech (POS) in this lesson: ${input.pos}` : "",
    input.sense ? `- Sense being taught: ${input.sense}` : "",
    input.example ? `- Example sentence: ${input.example}` : "",
    input.cefr ? `- Learner level: ${input.cefr}` : "",
    input.context ? `- Workplace context: ${input.context}` : ""
  ].filter(Boolean);
  const languageDirective = input.cefr && ["B1", "B2", "C1"].includes(input.cefr)
    ? `ACTIVE LEVEL ${input.cefr}: Write note, sense, example, and collocations in English only; keep meaning fields in Vietnamese.`
    : input.cefr
      ? `ACTIVE LEVEL ${input.cefr}: Keep meaning fields in Vietnamese matching the exact contextual sense.`
      : "";
  return [
    TESOL_VOCABULARY_ENRICHMENT_CONTRACT,
    ...(contextLines.length ? ["INPUT", ...contextLines] : []),
    ...(languageDirective ? [languageDirective] : [])
  ].join("\n");
}

const PART_ORDER = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;

type JsonRecord = Record<string, unknown>;

export function lessonDaysNeedingRepair(
  lessons: readonly ContentLessonDraftInput[],
  mode: LessonRepairMode,
  cefr?: string
): number[] {
  return [...lessonRepairComponentsByDay(lessons, mode, cefr).keys()].sort((left, right) => left - right);
}

/**
 * Repair targets for one whole CEFR level.
 *
 * Two absent lexical metadata fields are deliberately non-blocking.  This is
 * a level-level policy, so it cannot be decided by looking at one lesson in
 * isolation.  A missing vocabulary part, invalid lexical data, or any other
 * component stays a repair target.
 */
export function lessonRepairComponentsByDay(
  lessons: readonly ContentLessonDraftInput[],
  mode: LessonRepairMode,
  cefr?: string
): Map<number, Set<LessonGenerationComponent>> {
  const byDay = new Map(lessons.map((lesson) => [lesson.dayNumber, lesson]));
  const targetsByDay = new Map<number, Set<LessonGenerationComponent>>();
  for (const dayNumber of [1, 2, 3, 4, 5]) {
    const targets = lessonComponentsNeedingRepair(byDay.get(dayNumber), mode, cefr);
    if (targets.size > 0) targetsByDay.set(dayNumber, targets);
  }
  if (mode !== "enrich") return targetsByDay;

  const lightGaps = lessons.reduce((count, lesson) => count + vocabularyLightGapCount(lesson, cefr), 0);
  if (lightGaps > 2) return targetsByDay;

  for (const [dayNumber, targets] of targetsByDay) {
    const lesson = byDay.get(dayNumber);
    if (!targets.has("vocabulary") || vocabularyHasHeavyGap(lesson, cefr)) continue;
    targets.delete("vocabulary");
    if (targets.size === 0) targetsByDay.delete(dayNumber);
  }
  return targetsByDay;
}

function vocabularyLightGapCount(lesson: ContentLessonDraftInput, cefr?: string): number {
  const vocabulary = asRecord(lesson.parts.find((part) => part.code === "vocabulary")?.content);
  const items = asArray(vocabulary.items).map(asRecord);
  return items.reduce((count, item) => {
    const hasValidRelation = validLexicalRelations(item, "synonyms", cefr).length > 0
      || validLexicalRelations(item, "antonyms", cefr).length > 0;
    const declaresExemption = item.relationStatus === "no_natural_relation" || item.relationStatus === "above_cefr_level";
    const exemptionIsCredible = relationExemptionIsCredible({
      word: typeof item.word === "string" ? item.word : "",
      partOfSpeech: typeof item.type === "string" ? item.type : null,
      meaning: typeof item.meaning === "string" ? item.meaning : null
    }, cefr ?? "");
    return count
      + (meaningful(item.family) ? 0 : 1)
      + (meaningful(item.umbrella) ? 0 : 1)
      + (hasValidRelation || (declaresExemption && exemptionIsCredible) ? 0 : 1);
  }, 0);
}

function vocabularyHasHeavyGap(lesson: ContentLessonDraftInput | undefined, cefr?: string): boolean {
  if (!lesson) return true;
  const parts = new Map(lesson.parts.map((part) => [part.code, part]));
  const vocabulary = asRecord(parts.get("vocabulary")?.content);
  const items = asArray(vocabulary.items).map(asRecord);
  if (!parts.has("vocabulary") || items.length === 0) return true;
  if (items.some((item) => validCollocations(item, cefr).length < 3)) return true;
  return items.some((item) => !validateVocabularyEnrichmentItem(item, { cefr }).valid);
}

export function lessonComponentsNeedingRepair(
  lesson: ContentLessonDraftInput | undefined,
  mode: LessonRepairMode = "enrich",
  cefr?: string
): Set<LessonGenerationComponent> {
  if (!lesson) return new Set(["foundation", "vocabulary", "skills"]);
  const effectiveCefr = cefr ?? inferLessonCefr(lesson);
  const parts = new Map(lesson.parts.map((part) => [part.code, part]));
  const vocabulary = asRecord(parts.get("vocabulary")?.content);
  const items = asArray(vocabulary.items).map(asRecord);
  const phrasesIncomplete = items.some((item) => validCollocations(item, effectiveCefr).length < 3);
  const hasValidRelation = (item: JsonRecord) =>
    validLexicalRelations(item, "synonyms", effectiveCefr).length > 0
    || validLexicalRelations(item, "antonyms", effectiveCefr).length > 0;
  const declaresExemption = (item: JsonRecord) =>
    item.relationStatus === "no_natural_relation" || item.relationStatus === "above_cefr_level";
  const exemptionIsCredible = (item: JsonRecord) => relationExemptionIsCredible({
    word: typeof item.word === "string" ? item.word : "",
    partOfSpeech: typeof item.type === "string" ? item.type : null,
    meaning: typeof item.meaning === "string" ? item.meaning : null
  }, effectiveCefr ?? "");
  const vocabularyIncomplete = !parts.has("vocabulary")
    || items.length === 0
    || phrasesIncomplete
    || items.some((item) => !meaningful(item.family) || !meaningful(item.umbrella))
    || (items.length > 0 && !items.some((item) => hasValidRelation(item) || (declaresExemption(item) && exemptionIsCredible(item))))
    // Same rule as generation: an exemption contradicted by curated evidence
    // reopens vocabulary repair even when other words are acceptable.
    || items.some((item) => !hasValidRelation(item) && declaresExemption(item) && !exemptionIsCredible(item))
    || items.some((item) => !validateVocabularyEnrichmentItem(item, { cefr: effectiveCefr }).valid);
  if (mode === "fill-phrases") return phrasesIncomplete ? new Set(["vocabulary"]) : new Set();

  const foundationCodes = ["objective", "instruction", "grammar", "pronunciation"] as const;
  const skillCodes = ["listening", "reading", "writing", "word_class", "word_use", "speaking"] as const;
  const choicesIncomplete = (code: "listening" | "reading") => asArray(asRecord(parts.get(code)?.content).options).length < 4;
  const targets = new Set<LessonGenerationComponent>();
  if (foundationCodes.some((code) => !parts.has(code)) || grammarUnavailable(parts.get("grammar")?.content)) targets.add("foundation");
  if (vocabularyIncomplete) targets.add("vocabulary");
  if (skillCodes.some((code) => !parts.has(code)) || choicesIncomplete("listening") || choicesIncomplete("reading")) targets.add("skills");
  return targets;
}

export function mergeGeneratedLessons(
  existing: readonly ContentLessonDraftInput[],
  generated: readonly ContentLessonDraftInput[],
  mode: LessonRepairMode,
  replaceComponentsByDay: Partial<Record<number, readonly LessonGenerationComponent[]>> = {},
  cefr?: string
): ContentLessonDraftInput[] {
  const existingByDay = new Map(existing.map((lesson) => [lesson.dayNumber, lesson]));
  const generatedByDay = new Map(generated.map((lesson) => [lesson.dayNumber, lesson]));
  const days = [...new Set([...existingByDay.keys(), ...generatedByDay.keys()])].sort((left, right) => left - right);
  return days.map((dayNumber) => {
    const generatedLesson = generatedByDay.get(dayNumber);
    return generatedLesson ? mergeGeneratedLesson(existingByDay.get(dayNumber), generatedLesson, mode, replaceComponentsByDay[dayNumber], cefr) : existingByDay.get(dayNumber)!;
  });
}

export function mergeGenerationFindingsAfterRepair(
  existing: readonly ContentGenerationFindingView[] = [],
  generated: readonly ContentGenerationFindingView[] = [],
  repairedComponentsByDay: Partial<Record<number, readonly LessonGenerationComponent[]>> = {}
): ContentGenerationFindingView[] {
  const retained = existing.filter((finding) => {
    if (finding.dayNumber === null) return true;
    const repaired = repairedComponentsByDay[finding.dayNumber] ?? [];
    if (finding.component === "plan") return true;
    const component: LessonGenerationComponent = finding.component === "grammarClassification" || finding.component === "objectives"
      ? "foundation"
      : finding.component.startsWith("skills.") ? "skills" : finding.component as LessonGenerationComponent;
    return !repaired.includes(component);
  });
  return [...retained, ...generated];
}

export function mergeGeneratedLesson(
  existing: ContentLessonDraftInput | undefined,
  generated: ContentLessonDraftInput,
  mode: LessonRepairMode,
  replaceComponents: readonly LessonGenerationComponent[] = [],
  cefr?: string
): ContentLessonDraftInput {
  const effectiveCefr = cefr ?? inferLessonCefr(generated) ?? inferLessonCefr(existing);
  if (!existing) return normalizeLessonVocabularyPart(generated, effectiveCefr);
  const replacements = new Set<LessonGenerationComponent>([
    ...lessonComponentsNeedingRepair(existing, mode, effectiveCefr),
    ...replaceComponents
  ]);
  const existingParts = new Map(existing.parts.map((part) => [part.code, part]));
  const parts = generated.parts.map((part) => {
    const normalizedPart = part.code === "vocabulary" ? normalizeVocabularyPart(part, effectiveCefr) : part;
    const previous = existingParts.get(part.code);
    if (!previous) return normalizedPart;
    const component = part.code === "vocabulary"
      ? "vocabulary"
      : ["objective", "instruction", "grammar", "pronunciation"].includes(part.code)
        ? "foundation"
        : "skills";
    if (!replacements.has(component)) return previous;
    if (component === "vocabulary" && mode === "enrich" && !replaceComponents.includes("vocabulary")) {
      return {
        ...normalizedPart,
        title: meaningful(previous.title) && (!isAdvancedCefr(effectiveCefr) || !containsVietnameseText(previous.title)) ? previous.title : normalizedPart.title,
        content: mergeLessonContent(previous.content, normalizedPart.content, effectiveCefr)
      };
    }
    if (mode !== "fill-phrases" || component !== "vocabulary") return normalizedPart;
    return {
      ...normalizedPart,
      title: meaningful(previous.title) ? previous.title : normalizedPart.title,
      content: mergePhraseContent(previous.content, normalizedPart.content, effectiveCefr)
    };
  });
  const knownCodes = new Set(parts.map((part) => part.code));
  parts.push(...existing.parts.filter((part) => !knownCodes.has(part.code)));
  parts.sort((left, right) => PART_ORDER.indexOf(left.code as typeof PART_ORDER[number]) - PART_ORDER.indexOf(right.code as typeof PART_ORDER[number]));
  return {
    ...generated,
    title: replacements.has("foundation") ? generated.title : meaningful(existing.title) ? existing.title : generated.title,
    durationMinutes: meaningful(existing.durationMinutes) ? existing.durationMinutes : generated.durationMinutes,
    parts
  };
}

export function validateVocabularyEnrichmentItem(
  rawItem: unknown,
  options: { cefr?: string | undefined } = {}
): { valid: boolean; issues: VocabularyEnrichmentIssue[] } {
  const item = asRecord(rawItem);
  const issues: VocabularyEnrichmentIssue[] = [];
  const word = textOf(item.word ?? item.headword);
  const pos = canonicalPos(item.partOfSpeech ?? item.type ?? item.pos);
  const ipa = textOf(item.pronunciation ?? item.ipa);
  const stress = textOf(item.stress);
  const stressedSyllable = typeof item.stressed_syllable === "number" ? item.stressed_syllable : undefined;
  const ssml = textOf(item.ssml ?? item.tts_ssml);
  const ttsText = textOf(item.ttsText) || word;
  const meaning = textOf(item.meaning ?? item.meaning_vi);
  const sense = textOf(item.sense);
  const familyWords = extractFamilyWords(item);

  validateHeteronymFields(
    { word, pos, ipa, stress, stressedSyllable, ssml, ttsText, meaning, sense },
    "",
    issues
  );

  if (ssml) {
    if (!/^<speak>[\s\S]+<\/speak>$/u.test(ssml)) {
      issues.push({ path: "ssml", message: "SSML must be wrapped in <speak>...</speak>." });
    } else if (ttsText && normalizeComparableWord(spokenTextFromSsml(ssml)) !== normalizeComparableWord(ttsText)) {
      issues.push({ path: "ssml", message: "SSML spoken text must match the target word / ttsText." });
    }
    const phonemeIpa = extractSsmlPhonemeIpa(ssml);
    if (phonemeIpa !== undefined && ipa && stripIpaSlashes(ipa) !== stripIpaSlashes(phonemeIpa)) {
      issues.push({ path: "ssml", message: "SSML <phoneme> ph attribute must match the item's slash-stripped IPA." });
    }
  }

  const checkRelations = (kind: "synonyms" | "antonyms", entries: unknown[]) => {
    const label = kind === "synonyms" ? "synonym" : "antonym";
    const seen = new Set<string>();
    entries.forEach((rawEntry, index) => {
      const pathPrefix = `${kind}[${index}]`;
      if (typeof rawEntry === "string") {
        const relWord = rawEntry.trim();
        if (!relWord) return;
        if (word && normalizeComparableWord(relWord) === normalizeComparableWord(word)) {
          issues.push({ path: `${pathPrefix}.word`, message: `Self-${label} is forbidden: '${relWord}' repeats target word '${word}'.` });
        }
        if (word && isDerivationOrInflection(word, relWord, familyWords)) {
          issues.push({ path: `${pathPrefix}.word`, message: `Derivations or inflections ('${relWord}') are not valid ${kind} for '${word}'.` });
        }
        const key = normalizeComparableWord(relWord);
        if (seen.has(key)) {
          issues.push({ path: `${pathPrefix}.word`, message: `Duplicate ${label} '${relWord}'.` });
        }
        seen.add(key);
        return;
      }
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return;
      const entry = rawEntry as JsonRecord;
      const relWord = textOf(entry.word);
      const relPosRaw = textOf(entry.partOfSpeech ?? entry.pos ?? entry.type);
      const relPos = canonicalPos(relPosRaw);
      const relSense = textOf(entry.sense);
      const relNote = textOf(entry.note);
      const relExample = textOf(entry.example ?? entry.tts_sentence);
      if (word && relWord && normalizeComparableWord(relWord) === normalizeComparableWord(word)) {
        issues.push({ path: `${pathPrefix}.word`, message: `Self-${label} is forbidden: '${relWord}' repeats target word '${word}'.` });
      }
      if (word && relWord && isDerivationOrInflection(word, relWord, familyWords)) {
        issues.push({ path: `${pathPrefix}.word`, message: `Derivations or inflections ('${relWord}') are not valid ${kind} for '${word}'.` });
      }
      const key = normalizeComparableWord(relWord);
      if (key && seen.has(key)) {
        issues.push({ path: `${pathPrefix}.word`, message: `Duplicate ${label} '${relWord}'.` });
      }
      if (key) seen.add(key);

      if (pos && (!relPos || relPos !== pos)) {
        issues.push({
          path: `${pathPrefix}.partOfSpeech`,
          message: `${label} '${relWord}' partOfSpeech ('${relPosRaw || "missing"}') must match target partOfSpeech ('${pos}').`
        });
      }
      if (entry.substitution_ok === false) {
        issues.push({
          path: `${pathPrefix}.sense`,
          message: `${label} '${relWord}' failed the contextual substitution test.`
        });
      }
      if ("sense" in entry && !relSense) {
        issues.push({ path: `${pathPrefix}.sense`, message: `${label} '${relWord}' requires a non-empty contextual sense.` });
      }
      if ("example" in entry && !relExample) {
        issues.push({ path: `${pathPrefix}.example`, message: `${label} '${relWord}' requires a contextual example sentence.` });
      } else if (relWord && relExample && !exampleContainsTargetWord(relExample, relWord)) {
        issues.push({ path: `${pathPrefix}.example`, message: `${label} example must contain '${relWord}'.` });
      }

      const targetRule = word && pos ? HETERONYM_POS_RULES[normalizeComparableWord(word)]?.[pos] : undefined;
      if (targetRule?.wrongSenseKeywords && relSense && targetRule.wrongSenseKeywords.test(relSense)) {
        issues.push({
          path: `${pathPrefix}.sense`,
          message: `${label} '${relWord}' sense ('${relSense}') matches the wrong heteronym sense of '${word}' (${pos}).`
        });
      }

      validateHeteronymFields(
        {
          word: relWord,
          pos: relPos ?? pos,
          ipa: textOf(entry.ipa ?? entry.pronunciation),
          stress: textOf(entry.stress),
          stressedSyllable: typeof entry.stressed_syllable === "number" ? entry.stressed_syllable : undefined,
          ssml: textOf(entry.ssml ?? entry.tts_ssml),
          ttsText: relWord,
          meaning: textOf(entry.meaning ?? entry.meaning_vi),
          sense: relSense
        },
        `${pathPrefix}.`,
        issues
      );

      if (isAdvancedCefr(options.cefr)) {
        if (relNote && containsVietnameseText(relNote)) {
          issues.push({ path: `${pathPrefix}.note`, message: `${options.cefr} lexical note must be in English.` });
        }
        if (relSense && containsVietnameseText(relSense)) {
          issues.push({ path: `${pathPrefix}.sense`, message: `${options.cefr} lexical sense must be in English.` });
        }
        if (relExample && containsVietnameseText(relExample)) {
          issues.push({ path: `${pathPrefix}.example`, message: `${options.cefr} lexical example must be in English.` });
        }
      }
    });
  };

  checkRelations("synonyms", extractRelationList(item, "synonyms"));
  checkRelations("antonyms", extractRelationList(item, "antonyms"));

  if (isAdvancedCefr(options.cefr)) {
    if (meaning && !isVietnameseMeaning(meaning, word)) {
      issues.push({ path: "meaning", message: `${options.cefr} vocabulary meaning must stay in Vietnamese.` });
    }
    const rawCollocations = extractRawCollocations(item);
    rawCollocations.forEach((collocation, index) => {
      if (containsVietnameseText(collocation)) {
        issues.push({ path: `collocations[${index}]`, message: `${options.cefr} collocations must be in English.` });
      }
    });
    for (const field of ["note", "sense", "example"] as const) {
      const value = textOf(item[field]);
      if (value && containsVietnameseText(value)) {
        issues.push({ path: field, message: `${options.cefr} ${field} must be in English.` });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function normalizeVocabularyEnrichmentItem<T extends Record<string, unknown>>(
  rawItem: T,
  options: { cefr?: string | undefined } = {}
): T {
  const item: JsonRecord = { ...rawItem };
  const word = textOf(item.word ?? item.headword);
  const pos = canonicalPos(item.partOfSpeech ?? item.type ?? item.pos);
  const rule = word && pos ? HETERONYM_POS_RULES[normalizeComparableWord(word)]?.[pos] : undefined;

  if (rule) {
    const ipaKey = "pronunciation" in item ? "pronunciation" : "ipa" in item ? "ipa" : undefined;
    if (ipaKey) {
      const currentIpa = textOf(item[ipaKey]);
      if (!currentIpa || !heteronymIpaMatchesPos(currentIpa, rule)) {
        item[ipaKey] = rule.canonicalIpa;
      }
    }
    if ("stress" in item) {
      const currentStress = textOf(item.stress);
      if (!currentStress || !heteronymStressMatchesPos(currentStress, undefined, rule.stressedSyllable)) {
        item.stress = rule.canonicalStress;
      }
    }
    if ("stressed_syllable" in item && item.stressed_syllable !== rule.stressedSyllable) {
      item.stressed_syllable = rule.stressedSyllable;
    }
    const ssmlKey = "ssml" in item ? "ssml" : "tts_ssml" in item ? "tts_ssml" : undefined;
    if (ssmlKey) {
      const resolvedIpa = stripIpaSlashes(textOf(item[ipaKey ?? "pronunciation"]) || rule.canonicalIpa);
      const ttsText = textOf(item.ttsText) || word;
      const currentSsml = textOf(item[ssmlKey]);
      const phonemeIpa = extractSsmlPhonemeIpa(currentSsml);
      if (!currentSsml || phonemeIpa !== resolvedIpa || normalizeComparableWord(spokenTextFromSsml(currentSsml)) !== normalizeComparableWord(ttsText)) {
        item[ssmlKey] = `<speak><phoneme alphabet="ipa" ph="${resolvedIpa}">${ttsText}</phoneme></speak>`;
      }
    }
  }

  if (Array.isArray(item.synonyms)) {
    item.synonyms = validLexicalRelations(item, "synonyms", options.cefr);
  }
  if (Array.isArray(item.antonyms)) {
    item.antonyms = validLexicalRelations(item, "antonyms", options.cefr);
  }
  for (const slot of ["synonym1", "synonym2"] as const) {
    if (slot in item && item[slot] !== null && item[slot] !== undefined) {
      const valid = validLexicalRelations({ ...item, synonyms: [item[slot]] }, "synonyms", options.cefr);
      item[slot] = valid[0] ?? null;
    }
  }
  if ("antonym1" in item && item.antonym1 !== null && item.antonym1 !== undefined) {
    const valid = validLexicalRelations({ ...item, antonyms: [item.antonym1] }, "antonyms", options.cefr);
    item.antonym1 = valid[0] ?? null;
  }
  if (Array.isArray(item.collocations) && isAdvancedCefr(options.cefr)) {
    item.collocations = validCollocations(item, options.cefr);
  }
  if (word && Array.isArray(item.family) && item.family.filter(meaningful).length === 0) {
    item.family = [synthesizeDefaultWordFamilyEntry(word, pos ?? textOf(item.type ?? item.partOfSpeech) ?? "noun", textOf(item.meaning ?? item.meaning_vi))];
  }
  if (word && (!item.umbrella || typeof item.umbrella !== "object" || Array.isArray(item.umbrella) || !meaningful((item.umbrella as JsonRecord).word))) {
    item.umbrella = {
      word: "workplace communication",
      meaning: "giao tiếp công sở",
      siblings: [
        { word: "message", meaning: "tin nhắn" },
        { word: "update", meaning: "cập nhật" }
      ]
    };
  }
  if (item.umbrella && typeof item.umbrella === "object" && !Array.isArray(item.umbrella)) {
    const umbrella = { ...(item.umbrella as JsonRecord) };
    const umbrellaWord = textOf(umbrella.word);
    const umbrellaPos = canonicalPos(umbrella.pos ?? umbrella.partOfSpeech ?? pos);
    const umbrellaRule = umbrellaWord && umbrellaPos ? HETERONYM_POS_RULES[normalizeComparableWord(umbrellaWord)]?.[umbrellaPos] : undefined;
    if (umbrellaRule) {
      if ("ipa" in umbrella && !heteronymIpaMatchesPos(textOf(umbrella.ipa), umbrellaRule)) {
        umbrella.ipa = umbrellaRule.canonicalIpa;
      }
      if ("pronunciation" in umbrella && !heteronymIpaMatchesPos(textOf(umbrella.pronunciation), umbrellaRule)) {
        umbrella.pronunciation = umbrellaRule.canonicalIpa;
      }
      if ("stressed_syllable" in umbrella) umbrella.stressed_syllable = umbrellaRule.stressedSyllable;
      if ("tts_ssml" in umbrella) {
        const cleanIpa = stripIpaSlashes(textOf(umbrella.ipa ?? umbrella.pronunciation) || umbrellaRule.canonicalIpa);
        umbrella.tts_ssml = `<speak><phoneme alphabet="ipa" ph="${cleanIpa}">${umbrellaWord}</phoneme></speak>`;
      }
    }
    item.umbrella = umbrella;
  }

  return item as T;
}

const KNOWN_WORD_FAMILY_FALLBACKS: Record<string, { word: string; type: string; meaning: string }> = {
  money: { word: "monetary", type: "adjective", meaning: "thuộc về tiền tệ" },
  month: { word: "monthly", type: "adjective", meaning: "hàng tháng" },
  cost: { word: "costly", type: "adjective", meaning: "đắt đỏ, tốn kém" },
  high: { word: "highly", type: "adverb", meaning: "ở mức cao" },
  low: { word: "lower", type: "verb", meaning: "hạ thấp, giảm xuống" },
  budget: { word: "budgetary", type: "adjective", meaning: "thuộc về ngân sách" },
  number: { word: "numeric", type: "adjective", meaning: "thuộc về con số" },
  table: { word: "tabular", type: "adjective", meaning: "dạng bảng biểu" },
  chart: { word: "charting", type: "noun", meaning: "việc lập biểu đồ" },
  report: { word: "reporter", type: "noun", meaning: "người báo cáo" },
  plan: { word: "planner", type: "noun", meaning: "người lập kế hoạch" },
  review: { word: "reviewer", type: "noun", meaning: "người đánh giá" },
  team: { word: "teammate", type: "noun", meaning: "đồng đội, thành viên nhóm" },
  work: { word: "worker", type: "noun", meaning: "nhân viên, người làm việc" },
  time: { word: "timely", type: "adjective", meaning: "kịp thời, đúng lúc" },
  call: { word: "caller", type: "noun", meaning: "người gọi" },
  check: { word: "checklist", type: "noun", meaning: "danh sách kiểm tra" },
  camera: { word: "cameras", type: "noun", meaning: "các máy quay, máy ảnh" },
  video: { word: "videos", type: "noun", meaning: "các đoạn băng hình" },
  audio: { word: "audible", type: "adjective", meaning: "có thể nghe rõ" },
  microphone: { word: "microphones", type: "noun", meaning: "các micrô thu âm" },
  mic: { word: "microphone", type: "noun", meaning: "micrô thu âm" },
  screen: { word: "screening", type: "noun", meaning: "việc trình chiếu, kiểm duyệt" },
  slide: { word: "slides", type: "noun", meaning: "các trang trình chiếu" }
};

function synthesizeDefaultWordFamilyEntry(word: string, pos: string, meaning: string): { word: string; type: string; meaning: string } {
  const cleanWord = word.trim().toLocaleLowerCase("en-US");
  const known = KNOWN_WORD_FAMILY_FALLBACKS[cleanWord];
  if (known) return known;
  const cleanMeaning = meaning.trim() || "từ cùng gốc trong công việc";
  if (pos === "verb") {
    const ingForm = cleanWord.endsWith("e") && cleanWord.length > 2 ? `${cleanWord.slice(0, -1)}ing` : `${cleanWord}ing`;
    return { word: ingForm, type: "noun", meaning: `việc ${cleanMeaning}` };
  }
  if (pos === "adjective") {
    const lyForm = cleanWord.endsWith("y") && cleanWord.length > 2 ? `${cleanWord.slice(0, -1)}ily` : `${cleanWord}ly`;
    return { word: lyForm, type: "adverb", meaning: `một cách ${cleanMeaning}` };
  }
  const pluralForm = /(?:s|x|z|ch|sh)$/u.test(cleanWord) ? `${cleanWord}es` : cleanWord.endsWith("y") && !/[aeiou]y$/u.test(cleanWord) ? `${cleanWord.slice(0, -1)}ies` : `${cleanWord}s`;
  return { word: pluralForm, type: "noun", meaning: `các ${cleanMeaning}` };
}

function mergeLessonContent(previousValue: Record<string, unknown>, generatedValue: Record<string, unknown>, cefr?: string): JsonRecord {
  const previous = asRecord(previousValue);
  const generated = asRecord(generatedValue);
  const merged: JsonRecord = { ...generated, ...previous };
  for (const [key, value] of Object.entries(generated)) {
    if (!meaningful(previous[key])) merged[key] = value;
  }
  if (Array.isArray(previous.options) && previous.options.length < 4 && Array.isArray(generated.options) && generated.options.length >= 4) {
    merged.options = generated.options;
    if (meaningful(generated.answer)) merged.answer = generated.answer;
  }
  if (previous.items !== undefined || generated.items !== undefined) merged.items = mergeVocabularyItems(previous.items, generated.items, cefr);
  return merged;
}

function mergePhraseContent(previousValue: Record<string, unknown>, generatedValue: Record<string, unknown>, cefr?: string): JsonRecord {
  const merged = mergeLessonContent(previousValue, generatedValue, cefr);
  if (Array.isArray(previousValue.items) || Array.isArray(generatedValue.items)) {
    const generatedItems = asArray(generatedValue.items);
    const previousItems = asArray(previousValue.items);
    const byWord = new Map(previousItems.map((item) => [wordKey(item), item]));
    merged.items = generatedItems.map((item) => {
      const previous = byWord.get(wordKey(item));
      if (!previous) return normalizeVocabularyEnrichmentItem(asRecord(item), { cefr });
      const current = asRecord(previous);
      const next = asRecord(item);
      const priorPhrases = validCollocations(current, cefr);
      const generatedPhrases = validCollocations(next, cefr);
      return normalizeVocabularyEnrichmentItem({
        ...next,
        ...current,
        collocations: priorPhrases.length >= 3 ? priorPhrases.slice(0, 3) : uniqueStrings([...priorPhrases, ...generatedPhrases]).slice(0, 3)
      }, { cefr });
    });
  }
  return merged;
}

function mergeVocabularyItems(previousValue: unknown, generatedValue: unknown, cefr?: string): unknown[] {
  const generatedItems = asArray(generatedValue);
  const previousItems = asArray(previousValue);
  const byWord = new Map(previousItems.map((item) => [wordKey(item), item]));
  return generatedItems.map((item) => {
    const normalizedGenerated = normalizeVocabularyEnrichmentItem(asRecord(item), { cefr });
    const previous = byWord.get(wordKey(item));
    if (!previous) return normalizedGenerated;
    const current = asRecord(previous);
    const currentValidation = validateVocabularyEnrichmentItem(current, { cefr });
    const invalidCurrentPaths = new Set(currentValidation.issues.map((issue) => issue.path.split("[")[0]!.split(".")[0]!));
    const merged: JsonRecord = { ...normalizedGenerated, ...current };
    for (const key of ["word", "type", "partOfSpeech", "pronunciation", "stress", "ttsText", "ssml", "meaning", "imageQuery", "umbrella"] as const) {
      if (!meaningful(current[key]) || invalidCurrentPaths.has(key)) {
        if (key in normalizedGenerated) merged[key] = normalizedGenerated[key];
      }
    }
    const oldFamily = Array.isArray(current.family) ? current.family : [];
    merged.family = oldFamily.length ? oldFamily : normalizedGenerated.family ?? [];

    for (const key of ["synonyms", "antonyms"] as const) {
      const validOld = validLexicalRelations(current, key, cefr);
      const validNew = validLexicalRelations(normalizedGenerated, key, cefr);
      merged[key] = validOld.length ? validOld : validNew;
    }
    if ((Array.isArray(merged.synonyms) && merged.synonyms.length > 0) || (Array.isArray(merged.antonyms) && merged.antonyms.length > 0)) {
      merged.relationStatus = "provided";
    } else if (typeof normalizedGenerated.relationStatus === "string") {
      merged.relationStatus = normalizedGenerated.relationStatus;
    }
    const oldPhrases = validCollocations(current, cefr);
    const newPhrases = validCollocations(normalizedGenerated, cefr);
    merged.collocations = oldPhrases.length >= 3 ? oldPhrases.slice(0, 3) : uniqueStrings([...oldPhrases, ...newPhrases]).slice(0, 3);
    return normalizeVocabularyEnrichmentItem(merged, { cefr });
  });
}

function normalizeLessonVocabularyPart(lesson: ContentLessonDraftInput, cefr?: string): ContentLessonDraftInput {
  return {
    ...lesson,
    parts: lesson.parts.map((part) => part.code === "vocabulary" ? normalizeVocabularyPart(part, cefr) : part)
  };
}

function normalizeVocabularyPart(part: ContentLessonDraftInput["parts"][number], cefr?: string): ContentLessonDraftInput["parts"][number] {
  const content = asRecord(part.content);
  if (!Array.isArray(content.items)) return part;
  return {
    ...part,
    content: {
      ...content,
      items: content.items.map((item) => item && typeof item === "object" && !Array.isArray(item)
        ? normalizeVocabularyEnrichmentItem(item as JsonRecord, { cefr })
        : item)
    }
  };
}

function validateHeteronymFields(
  input: {
    word: string;
    pos: "noun" | "verb" | "adjective" | undefined;
    ipa: string;
    stress: string;
    stressedSyllable: number | undefined;
    ssml: string;
    ttsText: string;
    meaning: string;
    sense: string;
  },
  pathPrefix: string,
  issues: VocabularyEnrichmentIssue[]
): void {
  if (!input.word || !input.pos) return;
  const rule = HETERONYM_POS_RULES[normalizeComparableWord(input.word)]?.[input.pos];
  if (!rule) return;

  if (input.ipa && !heteronymIpaMatchesPos(input.ipa, rule)) {
    issues.push({
      path: `${pathPrefix}pronunciation`,
      message: `Heteronym '${input.word}' (${input.pos}) requires ${input.pos} IPA ${rule.canonicalIpa}, received '${input.ipa}'.`
    });
  }
  if ((input.stress || input.stressedSyllable !== undefined)
    && !heteronymStressMatchesPos(input.stress, input.stressedSyllable, rule.stressedSyllable)) {
    issues.push({
      path: `${pathPrefix}stress`,
      message: `Heteronym '${input.word}' (${input.pos}) requires primary stress on syllable ${rule.stressedSyllable} (${rule.canonicalStress}).`
    });
  }
  if (input.ssml) {
    const phonemeIpa = extractSsmlPhonemeIpa(input.ssml);
    if (!phonemeIpa || !heteronymIpaMatchesPos(`/${stripIpaSlashes(phonemeIpa)}/`, rule)) {
      issues.push({
        path: `${pathPrefix}ssml`,
        message: `Heteronym '${input.word}' (${input.pos}) SSML must specify <phoneme alphabet="ipa" ph="${stripIpaSlashes(rule.canonicalIpa)}">.`
      });
    }
  }
  if (rule.wrongSenseKeywords && (rule.wrongSenseKeywords.test(input.meaning) || rule.wrongSenseKeywords.test(input.sense))) {
    issues.push({
      path: `${pathPrefix}sense`,
      message: `Heteronym '${input.word}' (${input.pos}) meaning/sense contradicts its contextual part of speech.`
    });
  }
}

function heteronymIpaMatchesPos(ipa: string, rule: HeteronymPosSpec): boolean {
  const normalized = `/${stripIpaSlashes(ipa)}/`;
  if (rule.ipaPattern.test(normalized)) return true;
  const detectedSyllable = ipaPrimaryStressSyllable(normalized);
  if (detectedSyllable === undefined) return false;
  if (rule.canonicalIpa.includes("ˈ") && detectedSyllable !== rule.stressedSyllable) return false;
  return rule.ipaPattern.test(normalized);
}

function ipaPrimaryStressSyllable(ipa: string): 1 | 2 | undefined {
  const clean = stripIpaSlashes(ipa);
  const stressIndex = clean.indexOf("ˈ");
  if (stressIndex < 0) return undefined;
  const prefix = clean.slice(0, stressIndex);
  return /[aeiouɪiʊuəɜɔæʌɑɒɛ]/iu.test(prefix) ? 2 : 1;
}

function heteronymStressMatchesPos(stress: string, stressedSyllable: number | undefined, expectedSyllable: 1 | 2): boolean {
  if (stressedSyllable !== undefined && stressedSyllable !== expectedSyllable) return false;
  const trimmed = stress.trim();
  if (!trimmed) return true;
  if (/\b(?:first|1st|syllable\s*1)\b/iu.test(trimmed)) return expectedSyllable === 1;
  if (/\b(?:second|2nd|syllable\s*2)\b/iu.test(trimmed)) return expectedSyllable === 2;
  const parts = trimmed.split(/[-·.\s]+/u).filter(Boolean);
  if (parts.length >= 2) {
    const upperIndex = parts.findIndex((part) => /[A-Z]{2,}/u.test(part) && part === part.toLocaleUpperCase("en-US"));
    const hasLower = parts.some((part) => part !== part.toLocaleUpperCase("en-US"));
    if (upperIndex >= 0 && hasLower) {
      return upperIndex + 1 === expectedSyllable;
    }
  }
  return true;
}

function validLexicalRelations(item: JsonRecord, kind: "synonyms" | "antonyms", cefr?: string): unknown[] {
  const word = textOf(item.word ?? item.headword);
  const pos = canonicalPos(item.partOfSpeech ?? item.type ?? item.pos);
  const familyWords = extractFamilyWords(item);
  const targetRule = word && pos ? HETERONYM_POS_RULES[normalizeComparableWord(word)]?.[pos] : undefined;
  const seen = new Set<string>();
  const rawList = extractRelationList(item, kind);

  return rawList.flatMap<unknown>((rawEntry) => {
    if (typeof rawEntry === "string") {
      const relWord = rawEntry.trim();
      const key = normalizeComparableWord(relWord);
      if (!key || seen.has(key)) return [];
      if (word && key === normalizeComparableWord(word)) return [];
      if (word && isDerivationOrInflection(word, relWord, familyWords)) return [];
      if (isAdvancedCefr(cefr) && containsVietnameseText(relWord)) return [];
      seen.add(key);
      return [relWord];
    }
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return [];
    const entry: JsonRecord = { ...(rawEntry as JsonRecord) };
    const relWord = textOf(entry.word);
    const key = normalizeComparableWord(relWord);
    if (!key || seen.has(key)) return [];
    if (word && key === normalizeComparableWord(word)) return [];
    if (word && isDerivationOrInflection(word, relWord, familyWords)) return [];
    if (entry.substitution_ok === false) return [];

    const relPosRaw = textOf(entry.partOfSpeech ?? entry.pos ?? entry.type);
    const relPos = canonicalPos(relPosRaw);
    if (pos && relPos && relPos !== pos) return [];
    if (pos && !relPosRaw && "partOfSpeech" in entry) return [];

    const relSense = textOf(entry.sense);
    const relNote = textOf(entry.note);
    const relExample = textOf(entry.example ?? entry.tts_sentence);
    if ("sense" in entry && !relSense) return [];
    if ("example" in entry && (!relExample || !exampleContainsTargetWord(relExample, relWord))) return [];
    if (targetRule?.wrongSenseKeywords && relSense && targetRule.wrongSenseKeywords.test(relSense)) return [];
    if (isAdvancedCefr(cefr) && (containsVietnameseText(relNote) || containsVietnameseText(relSense) || containsVietnameseText(relExample))) {
      return [];
    }

    const effectiveRelPos = relPos ?? pos;
    const relHeteronymRule = effectiveRelPos ? HETERONYM_POS_RULES[key]?.[effectiveRelPos] : undefined;
    if (relHeteronymRule) {
      if ("ipa" in entry && !heteronymIpaMatchesPos(textOf(entry.ipa), relHeteronymRule)) {
        entry.ipa = relHeteronymRule.canonicalIpa;
      }
      if ("pronunciation" in entry && !heteronymIpaMatchesPos(textOf(entry.pronunciation), relHeteronymRule)) {
        entry.pronunciation = relHeteronymRule.canonicalIpa;
      }
      if ("stress" in entry && !heteronymStressMatchesPos(textOf(entry.stress), undefined, relHeteronymRule.stressedSyllable)) {
        entry.stress = relHeteronymRule.canonicalStress;
      }
      if ("stressed_syllable" in entry) {
        entry.stressed_syllable = relHeteronymRule.stressedSyllable;
      }
      const ssmlField = "tts_ssml" in entry ? "tts_ssml" : "ssml" in entry ? "ssml" : undefined;
      if (ssmlField) {
        const cleanIpa = stripIpaSlashes(textOf(entry.ipa ?? entry.pronunciation) || relHeteronymRule.canonicalIpa);
        entry[ssmlField] = `<speak><phoneme alphabet="ipa" ph="${cleanIpa}">${relWord}</phoneme></speak>`;
      }
    }

    seen.add(key);
    return [entry];
  });
}

const DERIVATION_SUFFIXES = [
  "s", "es", "ed", "d", "ing", "er", "ers", "or", "ors", "ist", "ists", "ian", "ians",
  "ment", "ments", "tion", "tions", "ation", "ations", "ition", "itions", "sion", "sions",
  "ness", "nesses", "ity", "ities", "ty", "ties", "able", "ible", "al", "ial", "ical",
  "ful", "less", "ive", "ative", "itive", "ous", "ious", "eous", "ly", "ally", "ory",
  "atory", "tory", "ery", "ry", "ance", "ances", "ence", "ences", "ant", "ants", "ent",
  "ents", "age", "ages", "ure", "ures", "ee", "ees"
] as const;

const DERIVATION_PREFIXES = [
  "re", "un", "in", "im", "il", "ir", "dis", "mis", "non", "pre", "post", "over", "under", "sub", "inter", "co", "de", "counter", "out"
] as const;

export function isDerivationOrInflection(
  headword: string,
  candidate: string,
  familyWords: readonly string[] = []
): boolean {
  const h = normalizeComparableWord(headword).replace(/[-\s]+/gu, "");
  const c = normalizeComparableWord(candidate).replace(/[-\s]+/gu, "");
  if (!h || !c || h === c) return false;
  if (familyWords.some((member) => normalizeComparableWord(member).replace(/[-\s]+/gu, "") === c)) {
    return true;
  }
  const stemsFor = (word: string): string[] => {
    if (word.length < 4) return [word];
    const stems = new Set<string>([word]);
    if (word.endsWith("e") && word.length >= 5) stems.add(word.slice(0, -1));
    if (word.endsWith("y") && word.length >= 5) stems.add(`${word.slice(0, -1)}i`);
    if (word.endsWith("de") && word.length >= 6) stems.add(`${word.slice(0, -2)}s`);
    if (word.endsWith("t") && word.length >= 5) stems.add(word.slice(0, -1));
    const last = word.at(-1);
    if (last && /[bcdgklmnprstvz]/u.test(last) && word.length >= 4) stems.add(`${word}${last}`);
    return [...stems].filter((stem) => stem.length >= 4);
  };

  const expandForms = (word: string): Set<string> => {
    const forms = new Set<string>();
    const baseStems = stemsFor(word);
    for (const stem of baseStems) {
      forms.add(stem);
      for (const suffix of DERIVATION_SUFFIXES) {
        forms.add(`${stem}${suffix}`);
      }
    }
    for (const prefix of DERIVATION_PREFIXES) {
      forms.add(`${prefix}${word}`);
      for (const stem of baseStems) {
        for (const suffix of DERIVATION_SUFFIXES) {
          forms.add(`${prefix}${stem}${suffix}`);
        }
      }
    }
    return forms;
  };

  const headForms = expandForms(h);
  if (headForms.has(c)) return true;
  const candidateForms = expandForms(c);
  return candidateForms.has(h);
}

function exampleContainsTargetWord(example: string, targetWord: string): boolean {
  const normalizedExample = example.normalize("NFKC").toLocaleLowerCase("en-US");
  const normalizedTarget = targetWord.normalize("NFKC").toLocaleLowerCase("en-US").trim();
  if (!normalizedTarget) return false;
  if (normalizedExample.includes(normalizedTarget)) return true;
  const stem = normalizedTarget.length >= 5 && normalizedTarget.endsWith("e")
    ? normalizedTarget.slice(0, -1)
    : normalizedTarget.length >= 5 && normalizedTarget.endsWith("y")
      ? normalizedTarget.slice(0, -1)
      : normalizedTarget;
  return stem.length >= 3 && normalizedExample.includes(stem);
}

function extractFamilyWords(item: JsonRecord): string[] {
  const rawFamily = [
    ...asArray(item.family),
    ...(item.family1 ? [item.family1] : []),
    ...(item.family2 ? [item.family2] : [])
  ];
  return rawFamily.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    const word = textOf(asRecord(entry).word);
    return word ? [word] : [];
  });
}

function extractRelationList(item: JsonRecord, kind: "synonyms" | "antonyms"): unknown[] {
  if (Array.isArray(item[kind])) return item[kind] as unknown[];
  if (kind === "synonyms") {
    return [item.synonym1, item.synonym2].filter((entry) => entry !== null && entry !== undefined);
  }
  return [item.antonym1].filter((entry) => entry !== null && entry !== undefined);
}

function extractRawCollocations(item: JsonRecord): string[] {
  const list = stringArray(item.collocations ?? item.phrases ?? item.examples);
  if (list.length > 0) return list;
  return stringArray([item.collocation1, item.collocation2, item.collocation3]);
}

function validCollocations(item: JsonRecord, cefr?: string): string[] {
  const raw = extractRawCollocations(item);
  if (!isAdvancedCefr(cefr)) return raw;
  return raw.filter((phrase) => !containsVietnameseText(phrase));
}

function canonicalPos(value: unknown): "noun" | "verb" | "adjective" | undefined {
  const normalized = textOf(value).toLocaleLowerCase("en-US");
  if (normalized === "noun" || normalized === "n") return "noun";
  if (normalized === "verb" || normalized === "v") return "verb";
  if (normalized === "adjective" || normalized === "adj") return "adjective";
  return undefined;
}

function inferLessonCefr(lesson: ContentLessonDraftInput | undefined): string | undefined {
  if (!lesson) return undefined;
  const objective = asRecord(lesson.parts.find((part) => part.code === "objective")?.content);
  if (objective.explanationLanguage === "en") return "B1";
  if (typeof objective.text === "string" && /^By the end of this lesson, you will be able to\b/iu.test(objective.text.trim())) {
    return "B1";
  }
  return undefined;
}

function isAdvancedCefr(cefr: string | undefined): boolean {
  return cefr === "B1" || cefr === "B2" || cefr === "C1";
}

function containsVietnameseText(value: string): boolean {
  const compact = value.normalize("NFKC").trim();
  if (!compact) return false;
  return containsVietnameseLearnerText(compact)
    || /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(compact);
}

function isVietnameseMeaning(value: string, headword: string): boolean {
  const compact = value.normalize("NFKC").trim();
  if (!compact) return false;
  if (headword && normalizeComparableWord(compact) === normalizeComparableWord(headword)) return false;
  if (/(?<![\p{L}\p{N}])(?:a|an|the|to|of|for|with|from|someone|something|person|thing|act|action|process|state|quality)(?![\p{L}\p{N}])/iu.test(compact)) {
    return false;
  }
  return containsVietnameseText(compact) || compact.split(/\s+/u).length <= 4;
}

function stripIpaSlashes(value: string): string {
  return value.trim().replace(/^\/+|\/+$/gu, "").trim();
}

function extractSsmlPhonemeIpa(ssml: string): string | undefined {
  const match = ssml.match(/<phoneme\b[^>]*\bph=["']([^"']+)["'][^>]*>/iu);
  return match?.[1]?.trim();
}

function spokenTextFromSsml(value: string): string {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeComparableWord(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function grammarUnavailable(value: unknown): boolean {
  const content = asRecord(value);
  return content.status === "unavailable" || content.hidden === true
    || content.reason === "no_suitable_content" || content.reason === "insufficient_evidence";
}
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function wordKey(value: unknown): string { const word = asRecord(value).word; return typeof word === "string" ? word.trim().toLocaleLowerCase() : ""; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : typeof value === "string" && value.trim() ? [value.trim()] : []; }
function uniqueStrings(values: string[]): string[] { return [...new Set(values)]; }
function meaningful(value: unknown): boolean { return Array.isArray(value) ? value.length > 0 : typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined; }
