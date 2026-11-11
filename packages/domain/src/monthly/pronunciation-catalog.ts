import type { CefrLevel } from "@e4s/contracts";
import { monthlyIpaExampleMatchesTarget, monthlyIpaPhonemes, monthlyIpaBaseToken, monthlyIpaShape } from "./pronunciation-ipa.js";

/**
 * Product pronunciation roadmap (docs/pronunciation-roadmap.md, chốt 03/11/2026)
 * encoded as one ordered catalog per level. Month numbers in the roadmap are
 * ignored (product decision 11/11): each month takes the next four items in
 * roadmap order (rows top→bottom, P1→P4 inside a row) that the same level has
 * not taught in the previous 12 months; when the catalog is exhausted a new
 * cycle starts from the beginning. The AI only writes the label, explanation
 * and examples of the items chosen here.
 */

export type MonthlyPronunciationItemType = "phoneme" | "pair" | "phenomenon";
export type MonthlyPronunciationCatalogKey = "A1A2" | "B1" | "B2" | "C1";

/** Deterministic form rule a phenomenon example must show (checked by `monthlyPronunciationPhenomenonExampleIssue`). */
export type MonthlyPronunciationForm =
  | { kind: "ending"; ending: "s_s" | "s_z" | "s_iz" | "ed_t" | "ed_d" | "ed_id" }
  | { kind: "contraction_s" }
  | { kind: "ed_link" }
  | { kind: "onset"; spellings: readonly string[]; clusters: readonly string[] }
  | { kind: "coda"; clusters: readonly string[] }
  | { kind: "stress"; pattern: "first_of_two" | "second_of_two" | "compound" | "shift_pair" | "suffix" | "office_word" | "compound_vs_phrase" | "multi_compound" | "phrasal_noun_verb"; suffixes?: readonly string[] }
  | { kind: "syllable_elision" }
  | { kind: "phrase"; marker: MonthlyPhraseMarker; functionWords?: readonly string[] };

export type MonthlyPhraseMarker =
  | "weak" | "link_cv" | "link_vv" | "elision" | "assimilation"
  | "caps" | "caps_rhythm" | "caps_contrast" | "caps_particle" | "caps_aux" | "caps_cleft" | "caps_correction"
  | "fall" | "rise" | "tag" | "list" | "polite" | "pause" | "numbers" | "unfinished"
  | "teen_ty" | "symbols" | "abbreviation" | "reduced_forms" | "long_link" | "attitude" | "figures" | "sentence";

export interface MonthlyPronunciationCatalogItem {
  /** Stable catalog ID stored on the generated sound (`catalogId`). */
  id: string;
  /** 1-based position in the level's roadmap order. */
  order: number;
  type: MonthlyPronunciationItemType;
  /** Target notation stored as the sound's `ipa`; unique inside the level catalog. */
  notation: string;
  /** Roadmap row (Vietnamese, as in the roadmap). */
  group: string;
  labelVi: string;
  labelEn: string;
  /** Phoneme items: [phoneme]; pair items: phonemes of both sides. */
  phonemes?: readonly string[];
  /** Pair items: the two sides of the contrast (each a list of phonemes). */
  sides?: readonly (readonly string[])[];
  form?: MonthlyPronunciationForm;
  /** Word-stress items: single-word examples are limited to three syllables. */
  wordStress?: boolean;
  /** How an example must look (sent to the AI and mirrored by the form gate). */
  exampleGuidance: string;
  /** Older notations of the same item, so earlier frameworks count as taught. */
  aliases?: readonly string[];
}

// ---------------------------------------------------------------------------
// A1–A2: 44 phonemes in the roadmap's easy→hard order, then the review pairs.
// ---------------------------------------------------------------------------

const A1A2_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["m", "n", "l", "h"],
  ["iː", "ɪ", "e", "æ"],
  ["p", "b", "t", "d"],
  ["ʌ", "ɑː", "ɒ", "ɔː"],
  ["f", "v", "s", "z"],
  ["ʊ", "uː", "ə", "ɜː"],
  ["k", "g", "w", "j"],
  ["eɪ", "aɪ", "ɔɪ", "aʊ"],
  ["ŋ", "r", "ʃ", "tʃ"],
  ["əʊ", "ɪə", "eə", "ʊə"],
  ["ʒ", "dʒ", "θ", "ð"]
];
const LONG_VOWELS = new Set(["iː", "ɑː", "ɔː", "uː", "ɜː"]);
const SHORT_VOWELS = new Set(["ɪ", "e", "æ", "ʌ", "ɒ", "ʊ", "ə"]);
const DIPHTHONGS = new Set(["eɪ", "aɪ", "ɔɪ", "aʊ", "əʊ", "ɪə", "eə", "ʊə"]);

function phonemeLabels(phoneme: string): { vi: string; en: string } {
  if (LONG_VOWELS.has(phoneme)) return { vi: `Nguyên âm dài /${phoneme}/`, en: `Long vowel /${phoneme}/` };
  if (SHORT_VOWELS.has(phoneme)) return { vi: `Nguyên âm ngắn /${phoneme}/`, en: `Short vowel /${phoneme}/` };
  if (DIPHTHONGS.has(phoneme)) return { vi: `Nguyên âm đôi /${phoneme}/`, en: `Diphthong /${phoneme}/` };
  return { vi: `Phụ âm /${phoneme}/`, en: `Consonant /${phoneme}/` };
}

const PHONEME_GUIDANCE = "Single real words of one to three syllables that genuinely contain the target phoneme in their standard British pronunciation; for a vowel target it must be the vowel of the stressed syllable; mark ˈ before the stressed syllable of every word with two or more syllables; vary the position (initial, middle, final) where the language allows.";

const A1A2_PAIRS: ReadonlyArray<{ id: string; notation: string; sides: readonly (readonly string[])[]; vi: string; en: string }> = [
  { id: "pair-ih-ee", notation: "/ɪ/–/iː/", sides: [["ɪ"], ["iː"]], vi: "Cặp dễ nhầm /ɪ/ – /iː/", en: "Confusable pair /ɪ/ – /iː/" },
  { id: "pair-e-ae", notation: "/e/–/æ/", sides: [["e"], ["æ"]], vi: "Cặp dễ nhầm /e/ – /æ/", en: "Confusable pair /e/ – /æ/" },
  { id: "pair-s-sh", notation: "/s/–/ʃ/", sides: [["s"], ["ʃ"]], vi: "Cặp dễ nhầm /s/ – /ʃ/", en: "Confusable pair /s/ – /ʃ/" },
  { id: "pair-th-t-dh-d", notation: "/θ/–/t/ & /ð/–/d/", sides: [["θ", "ð"], ["t", "d"]], vi: "Cặp dễ nhầm /θ/ – /t/ và /ð/ – /d/", en: "Confusable pairs /θ/ – /t/ and /ð/ – /d/" }
];

function buildA1A2Catalog(): MonthlyPronunciationCatalogItem[] {
  const items: MonthlyPronunciationCatalogItem[] = [];
  A1A2_ROWS.forEach((row, rowIndex) => row.forEach((phoneme) => {
    const labels = phonemeLabels(phoneme);
    items.push({
      id: `phoneme-${phoneme}`, order: items.length + 1, type: "phoneme", notation: `/${phoneme}/`,
      group: `Nhóm ${rowIndex + 1}`, labelVi: labels.vi, labelEn: labels.en, phonemes: [phoneme], exampleGuidance: PHONEME_GUIDANCE
    });
  }));
  for (const pair of A1A2_PAIRS) {
    items.push({
      id: pair.id, order: items.length + 1, type: "pair", notation: pair.notation, group: "Ôn",
      labelVi: pair.vi, labelEn: pair.en, phonemes: pair.sides.flat(), sides: pair.sides,
      exampleGuidance: `Single real words of one to three syllables for a minimal-pair review: each example contains one side of the contrast (${pair.sides.map((side) => side.map((phoneme) => `/${phoneme}/`).join(" or ")).join(" versus ")}); give at least three examples of each side and, where possible, true minimal pairs (ship – sheep, bed – bad, see – she, think – tink is NOT a word). For a vowel side it must be the stressed vowel. Mark ˈ on words with two or more syllables.`
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// B1–C1: phenomena.
// ---------------------------------------------------------------------------

type PhenomenonSeed = Omit<MonthlyPronunciationCatalogItem, "order" | "type">;

const STRESS_RULE = "single real words of two or three syllables, standard British IPA with ˈ before the stressed syllable";
const PHRASE_RULE = "a short natural workplace phrase or sentence (2–12 words) with its IPA (under 110 characters)";

const B1_SEEDS: readonly PhenomenonSeed[] = [
  { id: "b1-s-s", notation: "/-s=s/", group: "Đuôi -s", labelVi: "Đuôi -s đọc /s/", labelEn: "Ending -s pronounced /s/", form: { kind: "ending", ending: "s_s" }, exampleGuidance: "A single plural or third-person -s word whose ending is /s/ after a voiceless sound /p t k f θ/ (tasks /tɑːsks/, helps, reports); the IPA must end in /s/." },
  { id: "b1-s-z", notation: "/-s=z/", group: "Đuôi -s", labelVi: "Đuôi -s đọc /z/", labelEn: "Ending -s pronounced /z/", form: { kind: "ending", ending: "s_z" }, exampleGuidance: "A single plural or third-person -s word whose ending is /z/ after a voiced sound (calls /kɔːlz/, plans, files); the IPA must end in /z/ (not /ɪz/)." },
  { id: "b1-s-iz", notation: "/-es=ɪz/", group: "Đuôi -s", labelVi: "Đuôi -s/-es đọc /ɪz/", labelEn: "Ending -s/-es pronounced /ɪz/", form: { kind: "ending", ending: "s_iz" }, exampleGuidance: "A single -s/-es word whose ending is /ɪz/ after /s z ʃ ʒ tʃ dʒ/ (offices /ˈɒfɪsɪz/, changes, pushes); the IPA must end in /ɪz/." },
  { id: "b1-s-contraction", notation: "/'s/", group: "Đuôi -s", labelVi: "'s rút gọn (it's, he's done)", labelEn: "Contracted 's (it's, he's done)", form: { kind: "contraction_s" }, exampleGuidance: `${PHRASE_RULE} containing a contracted 's (it's, that's, he's done, she's sent); the IPA shows the /s/ or /z/.` },
  { id: "b1-ed-t", notation: "/-ed=t/", group: "Đuôi -ed", labelVi: "Đuôi -ed đọc /t/", labelEn: "Ending -ed pronounced /t/", form: { kind: "ending", ending: "ed_t" }, exampleGuidance: "A single -ed verb whose ending is /t/ after a voiceless sound /p k f s ʃ tʃ θ/ (asked /ɑːskt/, checked, finished); the IPA must end in /t/." },
  { id: "b1-ed-d", notation: "/-ed=d/", group: "Đuôi -ed", labelVi: "Đuôi -ed đọc /d/", labelEn: "Ending -ed pronounced /d/", form: { kind: "ending", ending: "ed_d" }, exampleGuidance: "A single -ed verb whose ending is /d/ after a voiced sound (called /kɔːld/, planned, delivered); the IPA must end in /d/ (not /ɪd/)." },
  { id: "b1-ed-id", notation: "/-ed=ɪd/", group: "Đuôi -ed", labelVi: "Đuôi -ed đọc /ɪd/", labelEn: "Ending -ed pronounced /ɪd/", form: { kind: "ending", ending: "ed_id" }, exampleGuidance: "A single -ed verb whose ending is /ɪd/ after /t/ or /d/ (started /ˈstɑːtɪd/, needed, updated); the IPA must end in /ɪd/." },
  { id: "b1-ed-link", notation: "/-ed‿V/", group: "Đuôi -ed", labelVi: "-ed nối sang từ sau", labelEn: "-ed linked to the next word", form: { kind: "ed_link" }, exampleGuidance: `${PHRASE_RULE} where an -ed verb is followed by a word starting with a vowel (checked it /tʃekt‿ɪt/, called us, finished on time); mark the link with ‿ in the IPA.` },
  { id: "b1-onset-pl-pr", notation: "/pl- pr-/", group: "Cụm đầu", labelVi: "Cụm phụ âm đầu /pl/, /pr/", labelEn: "Initial clusters /pl/, /pr/", form: { kind: "onset", spellings: ["pl", "pr"], clusters: ["pl", "pr"] }, exampleGuidance: "A single word that begins with the cluster /pl/ or /pr/ (plan, price, problem); no vowel may be inserted between the two consonants in the IPA." },
  { id: "b1-onset-kl-kr", notation: "/kl- kr-/", group: "Cụm đầu", labelVi: "Cụm phụ âm đầu /kl/, /kr/", labelEn: "Initial clusters /kl/, /kr/", form: { kind: "onset", spellings: ["cl", "cr", "kl", "kr", "chr"], clusters: ["kl", "kr"] }, exampleGuidance: "A single word that begins with the cluster /kl/ or /kr/ (client, create, clear)." },
  { id: "b1-onset-st-sp", notation: "/st- sp-/", group: "Cụm đầu", labelVi: "Cụm phụ âm đầu /st/, /sp/", labelEn: "Initial clusters /st/, /sp/", form: { kind: "onset", spellings: ["st", "sp"], clusters: ["st", "sp"] }, exampleGuidance: "A single word that begins with the cluster /st/ or /sp/ (staff, speak, start)." },
  { id: "b1-onset-str-spl", notation: "/str- spl-/", group: "Cụm đầu", labelVi: "Cụm phụ âm đầu /str/, /spl/", labelEn: "Initial clusters /str/, /spl/", form: { kind: "onset", spellings: ["str", "spl", "spr", "scr"], clusters: ["str", "spl", "spr", "skr"] }, exampleGuidance: "A single word that begins with a three-consonant cluster /str/ or /spl/ (strategy, split, street; /spr/ and /skr/ are also accepted)." },
  { id: "b1-coda-nt-nd", notation: "/-nt -nd/", group: "Cụm cuối", labelVi: "Cụm phụ âm cuối /nt/, /nd/", labelEn: "Final clusters /nt/, /nd/", form: { kind: "coda", clusters: ["nt", "nd"] }, aliases: ["/nt/", "/nd/"], exampleGuidance: "A single word that ends a syllable with /nt/ or /nd/ (client, spend, send); the cluster must close the syllable, never be followed by a vowel." },
  { id: "b1-coda-ks", notation: "/-ks/", group: "Cụm cuối", labelVi: "Cụm phụ âm cuối /ks/", labelEn: "Final cluster /ks/", form: { kind: "coda", clusters: ["ks"] }, aliases: ["/ks/"], exampleGuidance: "A single word that ends a syllable with /ks/ (fix, tax, tasks)." },
  { id: "b1-coda-st", notation: "/-st/", group: "Cụm cuối", labelVi: "Cụm phụ âm cuối /st/", labelEn: "Final cluster /st/", form: { kind: "coda", clusters: ["st"] }, aliases: ["/st/"], exampleGuidance: "A single word that ends a syllable with /st/ (list, cost, request); never an initial /st/." },
  { id: "b1-coda-lt-ld", notation: "/-lt -ld/", group: "Cụm cuối", labelVi: "Cụm phụ âm cuối /lt/, /ld/", labelEn: "Final clusters /lt/, /ld/", form: { kind: "coda", clusters: ["lt", "ld"] }, aliases: ["/lt/", "/ld/"], exampleGuidance: "A single word that ends a syllable with /lt/ or /ld/ (result, build, field); the l must really be pronounced (should has no /l/)." },
  { id: "b1-stress-noun-adj", notation: "/ˈσσ/", group: "Trọng âm", labelVi: "Trọng âm danh từ/tính từ 2 âm tiết", labelEn: "Stress in two-syllable nouns and adjectives", form: { kind: "stress", pattern: "first_of_two" }, wordStress: true, exampleGuidance: `Two-syllable nouns or adjectives stressed on the FIRST syllable (office /ˈɒfɪs/, budget, busy); ${STRESS_RULE}.` },
  { id: "b1-stress-verb", notation: "/σˈσ/", group: "Trọng âm", labelVi: "Trọng âm động từ 2 âm tiết", labelEn: "Stress in two-syllable verbs", form: { kind: "stress", pattern: "second_of_two" }, wordStress: true, exampleGuidance: `Two-syllable verbs stressed on the SECOND syllable (repeat /rɪˈpiːt/, explain, confirm); ${STRESS_RULE}.` },
  { id: "b1-stress-compound", notation: "/ˈσ+σ/", group: "Trọng âm", labelVi: "Trọng âm danh từ ghép", labelEn: "Stress in compound nouns", form: { kind: "stress", pattern: "compound" }, wordStress: true, exampleGuidance: "Compound nouns stressed on the FIRST part, written as one word or two words (laptop /ˈlæptɒp/, deadline, car park /ˈkɑː pɑːk/); single words at most three syllables; ˈ before the stressed syllable." },
  { id: "b1-stress-shift", notation: "/ˈσσ~σˈσ/", group: "Trọng âm", labelVi: "Cặp đổi trọng âm theo từ loại", labelEn: "Stress shift by part of speech", form: { kind: "stress", pattern: "shift_pair" }, wordStress: true, exampleGuidance: "Two-syllable words whose stress changes with the part of speech, written as \"word (noun)\", \"word (verb)\" or \"word (adjective)\": noun/adjective stressed first, verb stressed second (record (noun) /ˈrekɔːd/, record (verb) /rɪˈkɔːd/, present (noun), increase (verb)). Give both members of several pairs." },
  { id: "b1-suffix-tion", notation: "/-tion -sion/", group: "Hậu tố", labelVi: "Hậu tố -tion/-sion", labelEn: "Suffixes -tion/-sion", form: { kind: "stress", pattern: "suffix", suffixes: ["tion", "sion"] }, wordStress: true, exampleGuidance: `Words ending in -tion or -sion, stressed on the syllable just before the suffix (action /ˈækʃn/, decision /dɪˈsɪʒn/, solution); ${STRESS_RULE}.` },
  { id: "b1-suffix-ic", notation: "/-ic -ical/", group: "Hậu tố", labelVi: "Hậu tố -ic/-ical", labelEn: "Suffixes -ic/-ical", form: { kind: "stress", pattern: "suffix", suffixes: ["ical", "ic"] }, wordStress: true, exampleGuidance: `Words ending in -ic (stress just before -ic: basic /ˈbeɪsɪk/, public) or -ical (stress two syllables before the end: logical /ˈlɒdʒɪkl/, practical); ${STRESS_RULE}.` },
  { id: "b1-suffix-ity", notation: "/-ity/", group: "Hậu tố", labelVi: "Hậu tố -ity", labelEn: "Suffix -ity", form: { kind: "stress", pattern: "suffix", suffixes: ["ity"] }, wordStress: true, exampleGuidance: `Words ending in -ity, stressed on the syllable before -ity (quality /ˈkwɒləti/, city, unity); ${STRESS_RULE}.` },
  { id: "b1-suffix-teen-ty", notation: "/-teen -ty/", group: "Hậu tố", labelVi: "-teen và -ty", labelEn: "-teen versus -ty", form: { kind: "stress", pattern: "suffix", suffixes: ["teen", "ty"] }, wordStress: true, exampleGuidance: "Number words: -teen stressed on -teen (thirteen /ˌθɜːˈtiːn/, fifteen) and -ty stressed on the first syllable (thirty /ˈθɜːti/, fifty); give both members of several pairs." }
];

const B2_SEEDS: readonly PhenomenonSeed[] = [
  { id: "b2-weak-articles", notation: "/ðə ə ən/", group: "Dạng yếu", labelVi: "Dạng yếu của mạo từ", labelEn: "Weak forms of articles", form: { kind: "phrase", marker: "weak", functionWords: ["a", "an", "the"] }, exampleGuidance: `${PHRASE_RULE} containing a, an or the in its weak form /ə/, /ən/, /ðə/ (send the file /ˈsend ðə ˈfaɪl/).` },
  { id: "b2-weak-prepositions", notation: "/tə fə əv ət/", group: "Dạng yếu", labelVi: "Dạng yếu của giới từ", labelEn: "Weak forms of prepositions", form: { kind: "phrase", marker: "weak", functionWords: ["to", "for", "of", "at", "from"] }, exampleGuidance: `${PHRASE_RULE} containing to, for, of, at or from in its weak form with /ə/ (a copy for you /ə ˈkɒpi fə ˈjuː/).` },
  { id: "b2-weak-auxiliaries", notation: "/kən həv wəz/", group: "Dạng yếu", labelVi: "Dạng yếu của trợ động từ", labelEn: "Weak forms of auxiliaries", form: { kind: "phrase", marker: "weak", functionWords: ["can", "could", "have", "has", "had", "do", "does", "was", "were", "are", "would", "should", "must", "been"] }, exampleGuidance: `${PHRASE_RULE} containing an auxiliary in its weak form with /ə/ (we can start /wi kən ˈstɑːt/, it was late).` },
  { id: "b2-weak-conjunctions", notation: "/ən ðət ðən/", group: "Dạng yếu", labelVi: "Dạng yếu của từ nối", labelEn: "Weak forms of conjunctions", form: { kind: "phrase", marker: "weak", functionWords: ["and", "but", "or", "than", "that", "as"] }, exampleGuidance: `${PHRASE_RULE} containing and, but, or, than, that or as in its weak form with /ə/ (fast and clear /ˈfɑːst ən ˈklɪə/).` },
  { id: "b2-link-cv", notation: "/C‿V/", group: "Nối âm", labelVi: "Nối phụ âm + nguyên âm", labelEn: "Linking consonant to vowel", form: { kind: "phrase", marker: "link_cv" }, exampleGuidance: `${PHRASE_RULE} where a word ending in a consonant sound links to a word starting with a vowel; mark every link with ‿ in the IPA (check it out /ˈtʃek‿ɪt‿ˈaʊt/).` },
  { id: "b2-link-vv", notation: "/V‿j‿V V‿w‿V/", group: "Nối âm", labelVi: "Nối nguyên âm + nguyên âm (/j/, /w/)", labelEn: "Linking vowel to vowel with /j/ or /w/", form: { kind: "phrase", marker: "link_vv" }, exampleGuidance: `${PHRASE_RULE} where a word ending in a vowel links to a word starting with a vowel through an inserted /j/ or /w/; show it as ‿j‿ or ‿w‿ in the IPA (go on /ɡəʊ‿w‿ɒn/, the end /ði‿j‿end/).` },
  { id: "b2-elision-t-d", notation: "/t d → ∅/", group: "Nối âm", labelVi: "Nuốt âm /t/, /d/", labelEn: "Dropping /t/ and /d/", form: { kind: "phrase", marker: "elision" }, exampleGuidance: `${PHRASE_RULE} where a word ending in /t/ or /d/ comes before a consonant and the /t/ or /d/ is usually dropped; write the dropped sound in brackets in the IPA (last week /ˈlɑːs(t) ˈwiːk/, send me /ˈsen(d) mi/).` },
  { id: "b2-assimilation", notation: "/t+j→tʃ d+j→dʒ/", group: "Nối âm", labelVi: "Đồng hóa /tʃ/, /dʒ/", labelEn: "Assimilation to /tʃ/ and /dʒ/", form: { kind: "phrase", marker: "assimilation" }, exampleGuidance: `${PHRASE_RULE} where a word ending in /t/ or /d/ is followed by you, your, yet or year and the sounds join as /tʃ/ or /dʒ/ (did you /ˈdɪdʒu/, meet you /ˈmiːtʃu/).` },
  { id: "b2-stress-content", notation: "/ˈcontent function/", group: "Trọng âm câu", labelVi: "Từ nội dung vs từ chức năng", labelEn: "Content words versus function words", form: { kind: "phrase", marker: "caps" }, exampleGuidance: `${PHRASE_RULE}; write the stressed content words in CAPITALS in the example (I SENT the REPORT to the CLIENT) and put ˈ before them in the IPA.` },
  { id: "b2-stress-rhythm", notation: "/ˈDA da ˈDA/", group: "Trọng âm câu", labelVi: "Nhịp theo trọng âm", labelEn: "Stress-timed rhythm", form: { kind: "phrase", marker: "caps_rhythm" }, exampleGuidance: `${PHRASE_RULE} with at least two stressed words written in CAPITALS to show the regular beat (WE can MEET on MONday) and ˈ before them in the IPA.` },
  { id: "b2-stress-contrast", notation: "/ˈTHIS not ˈTHAT/", group: "Trọng âm câu", labelVi: "Trọng âm tương phản", labelEn: "Contrastive stress", form: { kind: "phrase", marker: "caps_contrast" }, exampleGuidance: `${PHRASE_RULE} contrasting two options, with the contrasted words in CAPITALS (I said TUESDAY, not THURSDAY; the RED file, not the BLUE one) and ˈ before them in the IPA.` },
  { id: "b2-stress-phrasal", notation: "/verb ˈparticle/", group: "Trọng âm câu", labelVi: "Trọng âm cụm động từ", labelEn: "Stress in phrasal verbs", form: { kind: "phrase", marker: "caps_particle" }, exampleGuidance: `${PHRASE_RULE} with a phrasal verb whose stressed particle is in CAPITALS (please FILL it IN, we need to SET UP the room) and ˈ before it in the IPA.` },
  { id: "b2-intonation-fall", notation: "/↘ Wh-/", group: "Ngữ điệu", labelVi: "Ngữ điệu xuống: câu trần thuật, câu hỏi Wh-", labelEn: "Falling intonation: statements and Wh- questions", form: { kind: "phrase", marker: "fall" }, exampleGuidance: `${PHRASE_RULE}: a statement or a Wh- question ending with a falling tone, marked ↘ before the last stressed word in the example (When is the ↘MEETING?) or in the IPA.` },
  { id: "b2-intonation-rise", notation: "/↗ yes-no/", group: "Ngữ điệu", labelVi: "Ngữ điệu lên: câu hỏi Yes/No", labelEn: "Rising intonation: yes/no questions", form: { kind: "phrase", marker: "rise" }, exampleGuidance: `${PHRASE_RULE}: a yes/no question ending in ? with a rising tone marked ↗ before the last stressed word (Is the report ↗READY?).` },
  { id: "b2-intonation-tag", notation: "/↘↗ tag/", group: "Ngữ điệu", labelVi: "Câu hỏi đuôi", labelEn: "Question tags", form: { kind: "phrase", marker: "tag" }, exampleGuidance: `${PHRASE_RULE}: a statement with a question tag after a comma, ending in ?, with ↘ (checking) or ↗ (asking) marked on the tag (It's due today, ↘isn't it?).` },
  { id: "b2-intonation-list", notation: "/↗ ↗ ↘ list/", group: "Ngữ điệu", labelVi: "Ngữ điệu liệt kê", labelEn: "List intonation", form: { kind: "phrase", marker: "list" }, exampleGuidance: `${PHRASE_RULE} listing three or more items separated by commas and and/or, with ↗ on each item and ↘ on the last (We need ↗chairs, ↗cups and ↘water).` },
  { id: "b2-intonation-polite", notation: "/↗ polite/", group: "Ngữ điệu 2", labelVi: "Ngữ điệu yêu cầu lịch sự", labelEn: "Polite request intonation", form: { kind: "phrase", marker: "polite" }, exampleGuidance: `${PHRASE_RULE}: a polite request starting with Could, Would, Can or containing please, with its tone marked ↗ or ↘ (Could you ↗SEND it today?).` },
  { id: "b2-chunking", notation: "/| chunk |/", group: "Ngữ điệu 2", labelVi: "Chia cụm ý, ngắt nghỉ", labelEn: "Chunking and pausing", form: { kind: "phrase", marker: "pause" }, exampleGuidance: "A workplace sentence of 6–12 words divided into thought groups with | at each pause, in the example and in the IPA (After the meeting | please send me | the final notes)." },
  { id: "b2-numbers", notation: "/numbers £ ↘/", group: "Ngữ điệu 2", labelVi: "Đọc số, ngày, tiền", labelEn: "Numbers, dates and money", form: { kind: "phrase", marker: "numbers" }, exampleGuidance: `${PHRASE_RULE} containing a number, date, time or amount of money written in words or digits (the total is £250; on the 3rd of May) with ˈ marking the stressed parts in the IPA.` },
  { id: "b2-unfinished", notation: "/↗ … ,/", group: "Ngữ điệu 2", labelVi: "Mệnh đề chưa kết thúc", labelEn: "Unfinished clauses", form: { kind: "phrase", marker: "unfinished" }, exampleGuidance: `${PHRASE_RULE}: a sentence with an opening clause that ends in a comma and a rising tone ↗ before the comma (If you're ↗FREE, we can start).` },
  { id: "b2-teen-ty", notation: "/15 ≠ 50/", group: "Thông tin rõ", labelVi: "Số dễ nhầm (15/50)", labelEn: "Confusable numbers (15/50)", form: { kind: "phrase", marker: "teen_ty" }, exampleGuidance: `${PHRASE_RULE} containing a -teen or -ty number (it costs fifteen pounds; about fifty people) with ˈ showing the stress (-teen stressed on the end, -ty on the start).` },
  { id: "b2-symbols", notation: "/@ dot slash/", group: "Thông tin rõ", labelVi: "Đọc email, URL, ký hiệu", labelEn: "Saying emails, URLs and symbols", form: { kind: "phrase", marker: "symbols" }, exampleGuidance: "A short spoken form of an email address, web address or symbol, written as it is said (anna at company dot com; www dot site dot com slash help; hash tag) with its IPA." },
  { id: "b2-abbreviations", notation: "/ˌeɪtʃ ˈɑː/", group: "Thông tin rõ", labelVi: "Viết tắt công sở", labelEn: "Workplace abbreviations", form: { kind: "phrase", marker: "abbreviation" }, exampleGuidance: "A workplace abbreviation in CAPITALS said letter by letter, alone or in a short phrase (HR, the CEO, our KPI) with ˈ on the last letter in the IPA (HR /ˌeɪtʃ ˈɑː/)." },
  { id: "b2-office-words", notation: "/ˈoffice words/", group: "Thông tin rõ", labelVi: "Từ công sở hay đọc sai", labelEn: "Commonly mispronounced office words", form: { kind: "stress", pattern: "office_word" }, wordStress: true, exampleGuidance: `Single workplace words that Vietnamese learners often mispronounce (colleague /ˈkɒliːɡ/, receipt, schedule, suite, Wednesday, determine); ${STRESS_RULE} (one-syllable words need no ˈ).` }
];

const C1_SEEDS: readonly PhenomenonSeed[] = [
  { id: "c1-stress-suffix-shift", notation: "/ˈsuffix shift/", group: "Trọng âm từ", labelVi: "Trọng âm dịch chuyển theo hậu tố", labelEn: "Stress shift with suffixes", form: { kind: "stress", pattern: "suffix", suffixes: ["eer", "ee", "ese", "ique", "ette", "oon", "ian", "ion", "ic", "ical", "ity"] }, wordStress: true, exampleGuidance: `Words whose suffix moves the stress: -ee, -eer, -ese, -ique stressed on the suffix (employee /ɪmˈplɔɪiː/, engineer, Japanese, unique); -ic, -ion, -ian stressed just before it (strategic /strəˈtiːdʒɪk/); -ity, -ical two syllables before the end; ${STRESS_RULE}.` },
  { id: "c1-stress-compound-phrase", notation: "/ˈcompound vs adj ˈnoun/", group: "Trọng âm từ", labelVi: "Từ ghép vs tính từ + danh từ", labelEn: "Compound noun versus adjective + noun", form: { kind: "stress", pattern: "compound_vs_phrase" }, wordStress: true, exampleGuidance: "Either a compound noun stressed on its first part (greenhouse /ˈɡriːnhaʊs/, blackboard) or an adjective + noun phrase of two words stressed on the noun (green house /ˌɡriːn ˈhaʊs/, black board); give both members of several pairs; ˈ before the stressed syllable." },
  { id: "c1-stress-multi-compound", notation: "/ˈmulti-part compound/", group: "Trọng âm từ", labelVi: "Danh từ ghép nhiều thành phần", labelEn: "Multi-part compound nouns", form: { kind: "stress", pattern: "multi_compound" }, exampleGuidance: "A compound noun of two to four words (customer service desk, sales target report) with the main stress ˈ on the first word in the IPA (/ˈkʌstəmə ˌsɜːvɪs desk/)." },
  { id: "c1-stress-phrasal-noun-verb", notation: "/ˈsetup set ˈup/", group: "Trọng âm từ", labelVi: "Danh từ vs động từ của cụm động từ", labelEn: "Phrasal verb versus its noun", form: { kind: "stress", pattern: "phrasal_noun_verb" }, exampleGuidance: "A phrasal verb or its noun, written as \"word (noun)\" or \"verb particle (verb)\": the noun is stressed on the first part (setup (noun) /ˈsetʌp/, follow-up (noun)) and the verb on the particle (set up (verb) /ˌset ˈʌp/, follow up (verb)); give both members of several pairs." },
  { id: "c1-elision-syllable", notation: "/syllable elision/", group: "Lược âm", labelVi: "Lược âm tiết", labelEn: "Syllable elision", form: { kind: "syllable_elision" }, exampleGuidance: "A single word whose written syllable is usually dropped in speech, with the reduced IPA (comfortable /ˈkʌmftəbl/, different /ˈdɪfrənt/, interesting /ˈɪntrəstɪŋ/, business, family); the IPA must have fewer syllables than the spelling suggests." },
  { id: "c1-elision-cluster", notation: "/cluster (t)(d)/", group: "Lược âm", labelVi: "Lược phụ âm trong cụm", labelEn: "Consonant elision in clusters", form: { kind: "phrase", marker: "elision" }, exampleGuidance: `${PHRASE_RULE} (or a single word) where /t/ or /d/ inside a consonant cluster is usually dropped; write the dropped sound in brackets in the IPA (next steps /ˈneks(t) ˈsteps/, exactly /ɪɡˈzæk(t)li/).` },
  { id: "c1-reduced-forms", notation: "/gonna wanna/", group: "Lược âm", labelVi: "Dạng rút gọn khẩu ngữ (nhận diện)", labelEn: "Colloquial reduced forms (recognition)", form: { kind: "phrase", marker: "reduced_forms" }, exampleGuidance: `${PHRASE_RULE} written the way it is heard in fast speech with a reduced form (we're gonna be late; I'd've called; d'you know; what'll we do) and its IPA; the speaking task repeats or rephrases it.` },
  { id: "c1-long-linking", notation: "/long ‿ linking/", group: "Lược âm", labelVi: "Nối âm trong câu dài", labelEn: "Linking in long sentences", form: { kind: "phrase", marker: "long_link" }, exampleGuidance: "A workplace sentence of 6–12 words with at least two links marked ‿ in the IPA (We'll look at it in an hour /wiːl ˈlʊk‿ət‿ɪt‿ɪn‿ən ˈaʊə/); IPA under 110 characters." },
  { id: "c1-attitude-interest", notation: "/↗↘ interest/", group: "Thái độ", labelVi: "Quan tâm / ngạc nhiên", labelEn: "Interest and surprise", form: { kind: "phrase", marker: "attitude" }, exampleGuidance: `${PHRASE_RULE} showing interest or surprise with a wide tone marked ↗ or ↘ (↗REALLY? That's ↘GREAT news).` },
  { id: "c1-attitude-partial", notation: "/↘↗ partial/", group: "Thái độ", labelVi: "Đồng ý một phần / do dự", labelEn: "Partial agreement and hesitation", form: { kind: "phrase", marker: "attitude" }, exampleGuidance: `${PHRASE_RULE} showing partial agreement or hesitation with a fall-rise ↘↗ (That's ↘↗TRUE, but…; I ↘↗SUPPOSE so).` },
  { id: "c1-attitude-polite", notation: "/↘ polite vs blunt/", group: "Thái độ", labelVi: "Lịch sự vs cộc lốc", labelEn: "Polite versus blunt tone", form: { kind: "phrase", marker: "attitude" }, exampleGuidance: `${PHRASE_RULE}: a request or reply whose tone (marked ↗ or ↘) makes it polite or blunt (Could you ↗CHECK it?; ↘NO.).` },
  { id: "c1-attitude-certainty", notation: "/↘ certain ↘↗ unsure/", group: "Thái độ", labelVi: "Chắc chắn vs không chắc", labelEn: "Certainty versus uncertainty", form: { kind: "phrase", marker: "attitude" }, exampleGuidance: `${PHRASE_RULE} sounding certain (↘ fall) or uncertain (↘↗ fall-rise) (It's ↘DONE.; It ↘↗SHOULD be ready).` },
  { id: "c1-emphasis-new", notation: "/NEW vs given/", group: "Nhấn mạnh", labelVi: "Thông tin mới vs cũ", labelEn: "New versus given information", form: { kind: "phrase", marker: "caps" }, exampleGuidance: `${PHRASE_RULE} where the NEW information is in CAPITALS and given information is unstressed (We got the report. The report was LATE.), with ˈ before the stressed word in the IPA.` },
  { id: "c1-emphasis-aux", notation: "/I ˈDID/", group: "Nhấn mạnh", labelVi: "Nhấn trợ động từ", labelEn: "Emphatic auxiliaries", form: { kind: "phrase", marker: "caps_aux" }, exampleGuidance: `${PHRASE_RULE} with an emphatic auxiliary in CAPITALS (I DID send it; we DO need more time; it IS ready) and ˈ before it in the IPA.` },
  { id: "c1-emphasis-cleft", notation: "/What … ˈIS/", group: "Nhấn mạnh", labelVi: "Câu chẻ khi nói", labelEn: "Spoken cleft sentences", form: { kind: "phrase", marker: "caps_cleft" }, exampleGuidance: `${PHRASE_RULE}: a cleft sentence starting with What … or It's/It was … with the focus word in CAPITALS (What we need is more TIME; It was SARAH who called) and ˈ before it in the IPA.` },
  { id: "c1-emphasis-correction", notation: "/not X but ˈY/", group: "Nhấn mạnh", labelVi: "Nhấn để sửa thông tin", labelEn: "Stress to correct information", form: { kind: "phrase", marker: "caps_correction" }, exampleGuidance: `${PHRASE_RULE} correcting a detail with the corrected word in CAPITALS (No, the meeting is on THURSDAY; not ten, it's TWELVE) and ˈ before it in the IPA.` },
  { id: "c1-present-pausing", notation: "/| pause |/", group: "Thuyết trình", labelVi: "Ngắt nhịp có chủ đích", labelEn: "Purposeful pausing", form: { kind: "phrase", marker: "pause" }, exampleGuidance: "A presentation sentence of 6–12 words with | at each deliberate pause, in the example and in the IPA (Our sales | grew by twenty percent | this quarter)." },
  { id: "c1-present-pace", notation: "/pace | slow fast/", group: "Thuyết trình", labelVi: "Tốc độ và nhịp độ", labelEn: "Speed and pace", form: { kind: "phrase", marker: "pause" }, exampleGuidance: "A presentation sentence of 6–12 words with | marking where to slow down before key words, in the example and in the IPA (The key point | is | cost)." },
  { id: "c1-present-transition", notation: "/↗ transition/", group: "Thuyết trình", labelVi: "Ngữ điệu chuyển ý", labelEn: "Transition intonation", form: { kind: "phrase", marker: "attitude" }, exampleGuidance: `${PHRASE_RULE} that moves to a new point (Moving ↗ON, let's look at ↘COSTS; ↗FINALLY, …) with ↗ or ↘ marking the tone.` },
  { id: "c1-present-figures", notation: "/ˈ80% ˈso/", group: "Thuyết trình", labelVi: "Nhấn số liệu và kết luận", labelEn: "Stressing figures and conclusions", form: { kind: "phrase", marker: "figures" }, exampleGuidance: `${PHRASE_RULE} that stresses a figure or a conclusion, with the stressed word in CAPITALS or a number in it (Sales rose by EIGHTY percent; SO, we should act now) and ˈ before it in the IPA.` },
  { id: "c1-synthesis-report", notation: "/report ↘↗ |/", group: "Tổng hợp", labelVi: "Đọc diễn cảm đoạn báo cáo", labelEn: "Expressive reading of a report", form: { kind: "phrase", marker: "sentence" }, exampleGuidance: "A report sentence of 4–12 words read expressively, with ˈ stresses in the IPA and | or ↗/↘ marks where they help." },
  { id: "c1-synthesis-accents", notation: "/international accents/", group: "Tổng hợp", labelVi: "Nghe giọng quốc tế", labelEn: "Listening to international accents", form: { kind: "phrase", marker: "sentence" }, exampleGuidance: "A short workplace sentence of 4–12 words to be heard in different international accents and repeated or summarised, with its standard British IPA and ˈ stresses." },
  { id: "c1-synthesis-online", notation: "/online ˈclarity/", group: "Tổng hợp", labelVi: "Rõ ràng khi họp online", labelEn: "Clarity in online meetings", form: { kind: "phrase", marker: "sentence" }, exampleGuidance: "A short online-meeting sentence of 4–12 words said clearly (Can everyone hear me? Let me share my screen.) with ˈ stresses in the IPA." },
  { id: "c1-synthesis-self", notation: "/self-record/", group: "Tổng hợp", labelVi: "Tự ghi âm, tự sửa", labelEn: "Self-recording and self-correction", form: { kind: "phrase", marker: "sentence" }, exampleGuidance: "A workplace sentence of 4–12 words for learners to record and check themselves, with ˈ stresses in the IPA." }
];

function phenomena(seeds: readonly PhenomenonSeed[]): MonthlyPronunciationCatalogItem[] {
  return seeds.map((seed, index) => ({ ...seed, order: index + 1, type: "phenomenon" as const }));
}

const CATALOGS: Readonly<Record<MonthlyPronunciationCatalogKey, readonly MonthlyPronunciationCatalogItem[]>> = {
  A1A2: buildA1A2Catalog(),
  B1: phenomena(B1_SEEDS),
  B2: phenomena(B2_SEEDS),
  C1: phenomena(C1_SEEDS)
};

export function monthlyPronunciationCatalogKey(cefr: CefrLevel): MonthlyPronunciationCatalogKey {
  return cefr === "A1" || cefr === "A2" ? "A1A2" : cefr;
}

/** The level's roadmap catalog in roadmap order. */
export function monthlyPronunciationCatalog(cefr: CefrLevel): readonly MonthlyPronunciationCatalogItem[] {
  return CATALOGS[monthlyPronunciationCatalogKey(cefr)];
}

const normalizeNotation = (value: string) => value.trim().replace(/\s+/gu, " ").replace(/ɡ/gu, "g");

/** The catalog item of the level that a stored sound teaches (by catalogId, notation or legacy alias). */
export function findMonthlyPronunciationCatalogItem(cefr: CefrLevel, sound: { ipa: string; catalogId?: string | undefined }): MonthlyPronunciationCatalogItem | undefined {
  const catalog = monthlyPronunciationCatalog(cefr);
  if (sound.catalogId) {
    const byId = catalog.find((item) => item.id === sound.catalogId);
    if (byId) return byId;
  }
  const notation = normalizeNotation(sound.ipa);
  return catalog.find((item) => normalizeNotation(item.notation) === notation)
    ?? catalog.find((item) => item.aliases?.some((alias) => normalizeNotation(alias) === notation));
}

/** True when `ipa` is the exact notation of an item of any level catalog. */
export function isMonthlyPronunciationCatalogNotation(ipa: string, cefr?: CefrLevel): boolean {
  const notation = normalizeNotation(ipa);
  const catalogs = cefr ? [monthlyPronunciationCatalog(cefr)] : Object.values(CATALOGS);
  return catalogs.some((catalog) => catalog.some((item) => normalizeNotation(item.notation) === notation));
}

export interface MonthlyPronunciationHistoryEntry {
  /** YYYY-MM of an earlier month of the same level. */
  month: string;
  sounds: ReadonlyArray<{ ipa: string; catalogId?: string | undefined }>;
}

export function monthlyMonthOffset(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const MONTHLY_PRONUNCIATION_MEMORY_MONTHS = 12;

export interface MonthlyPronunciationSelection {
  items: MonthlyPronunciationCatalogItem[];
  /** Catalog item IDs taught by the same level in the memory window, oldest month first. */
  taughtIds: string[];
  /** True when fewer than `count` untaught items remained, so a new cycle started. */
  newCycle: boolean;
}

/**
 * Deterministic monthly pick (product decision 11/11): the next `count` items
 * in roadmap order after the last item taught by this level in the previous
 * `windowMonths` months, skipping items taught inside that window; when the
 * untaught items run out (catalog exhausted), the cycle restarts from the
 * beginning and earlier items are taught again in roadmap order.
 */
export function selectMonthlyPronunciationItems(input: {
  cefr: CefrLevel;
  month: string;
  history: readonly MonthlyPronunciationHistoryEntry[];
  count?: number;
  windowMonths?: number;
}): MonthlyPronunciationSelection {
  const catalog = monthlyPronunciationCatalog(input.cefr);
  const count = Math.min(input.count ?? 4, catalog.length);
  const windowStart = monthlyMonthOffset(input.month, -(input.windowMonths ?? MONTHLY_PRONUNCIATION_MEMORY_MONTHS));
  const window = input.history
    .filter((entry) => entry.month >= windowStart && entry.month < input.month)
    .sort((a, b) => a.month.localeCompare(b.month));
  const taught = new Set<string>();
  const taughtIds: string[] = [];
  let pointer = 0;
  for (const entry of window) {
    for (const sound of entry.sounds) {
      const item = findMonthlyPronunciationCatalogItem(input.cefr, sound);
      if (!item) continue;
      if (!taught.has(item.id)) taughtIds.push(item.id);
      taught.add(item.id);
      pointer = item.order % catalog.length;
    }
  }
  const rotated = [...catalog.slice(pointer), ...catalog.slice(0, pointer)];
  const untaught = rotated.filter((item) => !taught.has(item.id));
  const items = untaught.slice(0, count);
  const newCycle = items.length < count;
  if (newCycle) {
    // Catalog exhausted: continue in roadmap order (a new cycle from the beginning after the end).
    for (const item of rotated) {
      if (items.length === count) break;
      if (!items.includes(item)) items.push(item);
    }
  }
  return { items, taughtIds, newCycle };
}

// ---------------------------------------------------------------------------
// Example gates shared by generation, manual edit and approval.
// ---------------------------------------------------------------------------

const ARROW = /[↘↗↑↓]/u;
const AUXILIARIES = new Set(["DO", "DOES", "DID", "AM", "IS", "ARE", "WAS", "WERE", "HAVE", "HAS", "HAD", "CAN", "COULD", "WILL", "WOULD", "SHOULD", "MUST", "SHALL", "MIGHT", "MAY"]);
const PARTICLES = new Set(["UP", "DOWN", "OUT", "IN", "ON", "OFF", "OVER", "BACK", "AWAY", "THROUGH", "AROUND", "ALONG", "AHEAD"]);
const NUMBER_WORDS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\w+teen|\w+ty|hundred|thousand|million|billion|half|quarter|percent|per cent|pounds?|dollars?|euros?|dong|first|second|third|\w+th)\b/iu;
const TEEN_TY = /\b(?:thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|1[3-9]|[2-9]0)\b/iu;
const REDUCED_FORMS = /\b(?:gonna|wanna|gotta|kinda|sorta|dunno|lemme|gimme|outta|lotta|whaddaya|d'you|d’you|y'know|ya)\b|['’](?:ll|d|ve|re|s|m)\b|n['’]t\b/iu;

function wordsOf(text: string): string[] {
  return text.split(/\s+/u).map((token) => token.replace(/[^\p{L}\d'’-]/gu, "")).filter(Boolean);
}

function lettersOf(text: string): string {
  return text.toLocaleLowerCase("en-US").replace(/[^a-z]/gu, "");
}

function stripIpa(ipa: string): string {
  return ipa.trim().replace(/^[/[]/u, "").replace(/[/\]]$/u, "");
}

/** Final phonemes of a single-word transcription (stress marks removed, ɡ/ɹ folded). */
function finalPhonemes(ipa: string): string[] {
  return monthlyIpaPhonemes(ipa).filter((token) => !["ˈ", "ˌ", "."].includes(token)).map(monthlyIpaBaseToken);
}

const VOICELESS = new Set(["p", "t", "k", "f", "θ"]);
const SIBILANTS = new Set(["s", "z", "ʃ", "ʒ", "tʃ", "dʒ"]);
const ED_VOICELESS = new Set(["p", "k", "f", "θ", "s", "ʃ", "tʃ"]);

function isSingleWord(text: string): boolean {
  return /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(text.trim());
}

function syllablesOf(ipa: string): number {
  return monthlyIpaShape(ipa).syllables;
}

function stressCheck(ipa: string, expected: number, what: string): string | undefined {
  const shape = monthlyIpaShape(ipa);
  if (shape.stressedSyllable === undefined) return `IPA ${ipa} has no primary stress mark ˈ`;
  if (shape.stressedSyllable !== expected) return `${ipa} stresses syllable ${shape.stressedSyllable + 1}, but ${what} needs stress on syllable ${expected + 1}`;
  return undefined;
}

const SUFFIX_STRESS: ReadonlyArray<{ suffix: string; fromEnd: number }> = [
  { suffix: "eer", fromEnd: 1 }, { suffix: "ee", fromEnd: 1 }, { suffix: "ese", fromEnd: 1 }, { suffix: "ique", fromEnd: 1 },
  { suffix: "ette", fromEnd: 1 }, { suffix: "oon", fromEnd: 1 }, { suffix: "teen", fromEnd: 1 },
  { suffix: "ical", fromEnd: 3 }, { suffix: "ity", fromEnd: 3 },
  { suffix: "tion", fromEnd: 2 }, { suffix: "sion", fromEnd: 2 }, { suffix: "ian", fromEnd: 2 }, { suffix: "ion", fromEnd: 2 }, { suffix: "ic", fromEnd: 2 }
];

function phraseIssue(word: string, ipa: string, min = 2, max = 12, mergedWords = 0): string | undefined {
  const words = wordsOf(word);
  if (!words.some((token) => /\p{L}/u.test(token))) return `"${word}" is not a real phrase or sentence`;
  if (words.length < min) return `"${word}" must be a phrase or short sentence of at least ${min} words for this item`;
  if (words.length > max) return `"${word}" has ${words.length} words; keep it to at most ${max}`;
  const body = stripIpa(ipa);
  if (!body) return `"${word}" needs an IPA transcription`;
  // Spelling left inside the transcription ("team", "list", "check") is not IPA.
  if (/[cqx]|ea|ee|oo|th|sh|ch|ck|ph|wh/u.test(body.replace(/\([^)]*\)/gu, ""))) return `IPA ${ipa} contains English spelling, not a real transcription`;
  // Every word of the phrase must be transcribed (a form for the team /ˈfɔːm ðə ˈteam/ drops words).
  const chunks = body.split(/[\s‿|]+/u).filter((chunk) => /[\p{L}ə]/u.test(chunk));
  if (words.length >= 2 && chunks.length < words.length - mergedWords) return `IPA ${ipa} transcribes ${chunks.length} words, but "${word}" has ${words.length}; transcribe the whole phrase`;
  return undefined;
}

/**
 * Form gate for a phenomenon example (B1–C1): the example must be a real word,
 * phrase or short sentence that visibly shows the phenomenon (ending, cluster,
 * stress mark, link ‿, weak-form word, elided sound in brackets, intonation
 * arrow, pause bar, stressed word in CAPITALS). Returns the rejection reason.
 */
export function monthlyPronunciationPhenomenonExampleIssue(item: MonthlyPronunciationCatalogItem, example: { word: string; ipa: string }): string | undefined {
  const form = item.form;
  if (!form) return undefined;
  const word = example.word.trim();
  const ipa = example.ipa.trim();
  if (!word) return "the example is empty";
  if (!/^\/.+\/$/u.test(ipa)) return `IPA ${ipa} must be enclosed in slashes`;
  const lower = word.toLocaleLowerCase("en-US");
  const letters = lettersOf(word);
  const both = `${word} ${ipa}`;
  switch (form.kind) {
    case "ending": {
      if (!isSingleWord(word)) return `"${word}" must be one word ending in ${form.ending.startsWith("ed") ? "-ed" : "-s/-es"}`;
      const tokens = finalPhonemes(ipa);
      const last = tokens.at(-1);
      const beforeLast = tokens.at(-2);
      if (form.ending.startsWith("s")) {
        if (!/s$/u.test(letters)) return `"${word}" does not end in -s/-es`;
        if (form.ending === "s_iz") return last === "z" && (beforeLast === "ɪ" || beforeLast === "ə") && SIBILANTS.has(tokens.at(-3) ?? "") ? undefined : `${ipa} does not end in /ɪz/ after /s z ʃ ʒ tʃ dʒ/`;
        if ((beforeLast === "ɪ" || beforeLast === "ə") && last === "z") return `${ipa} ends in /ɪz/, not the target ending`;
        if (form.ending === "s_s") return last === "s" && VOICELESS.has(beforeLast ?? "") ? undefined : `${ipa} does not end in /s/ after a voiceless /p t k f θ/`;
        return last === "z" && !VOICELESS.has(beforeLast ?? "") && !SIBILANTS.has(beforeLast ?? "") ? undefined : `${ipa} does not end in /z/ after a voiced sound`;
      }
      if (!/ed$/u.test(letters)) return `"${word}" does not end in -ed`;
      if (form.ending === "ed_id") return last === "d" && (beforeLast === "ɪ" || beforeLast === "ə") && ["t", "d"].includes(tokens.at(-3) ?? "") ? undefined : `${ipa} does not end in /ɪd/ after /t/ or /d/`;
      if ((beforeLast === "ɪ" || beforeLast === "ə") && last === "d") return `${ipa} ends in /ɪd/, not the target ending`;
      if (form.ending === "ed_t") return last === "t" && ED_VOICELESS.has(beforeLast ?? "") ? undefined : `${ipa} does not end in /t/ after a voiceless sound`;
      return last === "d" && !ED_VOICELESS.has(beforeLast ?? "") && beforeLast !== "t" && beforeLast !== "d" ? undefined : `${ipa} does not end in /d/ after a voiced sound`;
    }
    case "contraction_s": {
      const issue = phraseIssue(word, ipa);
      if (issue) return issue;
      if (!/\b\p{L}+['’]s\b/iu.test(word)) return `"${word}" has no contracted 's`;
      return /[sz]/u.test(stripIpa(ipa)) ? undefined : `${ipa} does not show the /s/ or /z/ of 's`;
    }
    case "ed_link": {
      const issue = phraseIssue(word, ipa);
      if (issue) return issue;
      const words = wordsOf(lower);
      const linked = words.some((token, index) => /ed$/u.test(token) && /^[aeiou]/u.test(words[index + 1] ?? ""));
      if (!linked) return `"${word}" has no -ed word followed by a word starting with a vowel`;
      return ipa.includes("‿") ? undefined : `${ipa} does not mark the link with ‿`;
    }
    case "onset": {
      if (!isSingleWord(word)) return `"${word}" must be one word`;
      if (!form.spellings.some((spelling) => letters.startsWith(spelling))) return `"${word}" does not begin with ${form.spellings.join("/")}`;
      const start = finalPhonemes(ipa).join("");
      return form.clusters.some((cluster) => start.startsWith(cluster)) ? undefined : `${ipa} does not begin with the cluster ${form.clusters.map((cluster) => `/${cluster}/`).join(" or ")}`;
    }
    case "coda": {
      if (!isSingleWord(word)) return `"${word}" must be one word`;
      return form.clusters.some((cluster) => monthlyIpaExampleMatchesTarget(`/${cluster}/`, ipa)) ? undefined : `${ipa} has no syllable-final ${form.clusters.map((cluster) => `/${cluster}/`).join(" or ")}`;
    }
    case "syllable_elision": {
      if (!isSingleWord(word)) return `"${word}" must be one word`;
      // Written syllables: vowel groups, a silent final e dropped, a final consonant + "le" counted (ta-ble).
      const written = (letters.replace(/e$/u, "").match(/[aeiouy]+/gu) ?? []).length + (/[^aeiouy]le$/u.test(letters) ? 1 : 0);
      const spoken = syllablesOf(ipa);
      return spoken < written ? undefined : `${ipa} keeps all ${written} written syllables; show the reduced pronunciation`;
    }
    case "stress": {
      if (form.pattern === "multi_compound") {
        const words = wordsOf(word);
        if (words.length < 2 || words.length > 4) return `"${word}" must be a compound noun of two to four words`;
        const chunks = stripIpa(ipa).split(/\s+/u);
        return chunks[0]?.includes("ˈ") ? undefined : `${ipa} must carry the main stress ˈ on the first word`;
      }
      const note = /^(.+?)\s*\((noun|verb|adjective)\)$/iu.exec(word);
      if (form.pattern === "shift_pair") {
        if (!note || !isSingleWord(note[1]!)) return `"${word}" must be written as "word (noun)", "word (verb)" or "word (adjective)"`;
        if (syllablesOf(ipa) !== 2) return `${ipa} must have two syllables`;
        return stressCheck(ipa, note[2]!.toLocaleLowerCase("en-US") === "verb" ? 1 : 0, `a two-syllable ${note[2]!.toLocaleLowerCase("en-US")}`);
      }
      if (form.pattern === "phrasal_noun_verb") {
        if (!note) return `"${word}" must be written as "word (noun)" or "verb particle (verb)"`;
        const chunks = stripIpa(ipa).split(/\s+/u).filter(Boolean);
        if (note[2]!.toLocaleLowerCase("en-US") === "verb") {
          if (wordsOf(note[1]!).length !== 2) return `"${word}" must be a two-word phrasal verb`;
          return chunks.length >= 2 && chunks.at(-1)!.includes("ˈ") ? undefined : `${ipa} must stress the particle (ˈ on the last word)`;
        }
        if (note[2]!.toLocaleLowerCase("en-US") !== "noun") return `"${word}" must be marked (noun) or (verb)`;
        return stressCheck(ipa.replace(/\s+/gu, ""), 0, "a phrasal-verb noun");
      }
      if (form.pattern === "compound_vs_phrase") {
        const words = wordsOf(word);
        if (words.length === 1) return syllablesOf(ipa) >= 2 ? stressCheck(ipa, 0, "a compound noun") : `"${word}" is too short to be a compound`;
        if (words.length !== 2) return `"${word}" must be one compound word or an adjective + noun of two words`;
        const chunks = stripIpa(ipa).split(/\s+/u).filter(Boolean);
        return chunks.length === 2 && chunks[1]!.includes("ˈ") ? undefined : `${ipa} must put the main stress ˈ on the noun of an adjective + noun phrase`;
      }
      if (form.pattern === "compound") {
        const words = wordsOf(word);
        if (words.length === 2) {
          const chunks = stripIpa(ipa).split(/\s+/u).filter(Boolean);
          return chunks[0]?.includes("ˈ") && !chunks.slice(1).some((chunk) => chunk.includes("ˈ")) ? undefined : `${ipa} must put the main stress ˈ on the first part of the compound only`;
        }
        if (words.length !== 1) return `"${word}" must be a compound noun of one or two words`;
        if (syllablesOf(ipa) < 2) return `"${word}" is too short to be a compound`;
        return stressCheck(ipa, 0, "a compound noun");
      }
      if (!isSingleWord(word)) return `"${word}" must be one word`;
      const syllables = syllablesOf(ipa);
      if (form.pattern === "office_word") return syllables >= 2 && monthlyIpaShape(ipa).stressedSyllable === undefined ? `IPA ${ipa} has no primary stress mark ˈ` : undefined;
      if (form.pattern === "first_of_two" || form.pattern === "second_of_two") {
        if (syllables !== 2) return `"${word}" has ${syllables} syllables in ${ipa}; this item is about two-syllable words`;
        return stressCheck(ipa, form.pattern === "first_of_two" ? 0 : 1, form.pattern === "first_of_two" ? "this item" : "a two-syllable verb");
      }
      // suffix
      const rule = SUFFIX_STRESS.find((entry) => (form.suffixes ?? []).includes(entry.suffix) && letters.endsWith(entry.suffix))
        ?? ((form.suffixes ?? []).includes("ty") && /ty$/u.test(letters) ? { suffix: "ty", fromEnd: syllables } : undefined);
      if (!rule) return `"${word}" does not end in ${(form.suffixes ?? []).map((suffix) => `-${suffix}`).join(", ")}`;
      const expected = rule.suffix === "ty" ? 0 : syllables - rule.fromEnd;
      if (expected < 0) return `"${word}" is too short to show the -${rule.suffix} stress rule`;
      return stressCheck(ipa, expected, `a word ending in -${rule.suffix}`);
    }
    case "phrase": {
      const marker = form.marker;
      const sentenceMax = 12;
      const minWords = marker === "symbols" || marker === "abbreviation" || marker === "elision" ? 1 : marker === "pause" || marker === "long_link" ? 5 : marker === "sentence" ? 4 : 2;
      // Assimilated or reduced forms may join two written words into one spoken chunk (did you /ˈdɪdʒu/).
      const issue = phraseIssue(word, ipa, minWords, sentenceMax, marker === "assimilation" || marker === "reduced_forms" ? 2 : 0);
      if (issue) return issue;
      const words = wordsOf(lower);
      const capsTokens = word.split(/\s+/u).map((token) => token.replace(/[^A-Za-z']/gu, "")).filter((token) => token.length >= 2 && token === token.toUpperCase() && /[A-Z]/u.test(token));
      const hasStressMark = /ˈ/u.test(ipa);
      switch (marker) {
        case "weak": {
          const fw = (form.functionWords ?? []).find((functionWord) => words.includes(functionWord));
          if (!fw) return `"${word}" contains none of the weak-form words ${(form.functionWords ?? []).join(", ")}`;
          return /ə/u.test(ipa) ? undefined : `${ipa} does not show the weak vowel /ə/ of "${fw}"`;
        }
        case "link_cv": {
          if (!words.some((token, index) => /[^aeiouy]$/u.test(token) && /^[aeiou]/u.test(words[index + 1] ?? ""))) return `"${word}" has no consonant-final word followed by a vowel-initial word`;
          return ipa.includes("‿") ? undefined : `${ipa} does not mark the link with ‿`;
        }
        case "link_vv": {
          if (!words.some((token, index) => /^[aeiou]/u.test(words[index + 1] ?? "") && token.length > 0)) return `"${word}" has no word followed by a vowel-initial word`;
          return /‿\s*[jw]|[jw]\s*‿/u.test(ipa) ? undefined : `${ipa} does not show the linking /j/ or /w/ with ‿`;
        }
        case "elision": {
          if (!/\([td]\)/u.test(ipa)) return `${ipa} does not show the dropped /t/ or /d/ in brackets`;
          return /[td]/u.test(letters) ? undefined : `"${word}" has no t or d to drop`;
        }
        case "assimilation": {
          const joined = words.some((token, index) => /(?:t|d|['’]t)$/u.test(token) && /^y(?:ou|our|et|ear|esterday)/u.test(words[index + 1] ?? ""));
          if (!joined) return `"${word}" has no word ending in t/d before you, your, yet or year`;
          return /tʃ|dʒ/u.test(ipa) ? undefined : `${ipa} does not show the assimilated /tʃ/ or /dʒ/`;
        }
        case "caps":
        case "caps_rhythm":
        case "caps_contrast":
        case "caps_particle":
        case "caps_aux":
        case "caps_cleft":
        case "caps_correction": {
          if (!capsTokens.length) return `"${word}" does not show the stressed word in CAPITALS`;
          if (!hasStressMark) return `${ipa} has no stress mark ˈ`;
          if (marker === "caps_rhythm" && capsTokens.length < 2) return `"${word}" needs at least two stressed words in CAPITALS to show the rhythm`;
          if (marker === "caps_contrast" && capsTokens.length < 2 && !/\bnot\b|\bbut\b|\binstead\b|\brather\b/iu.test(word)) return `"${word}" does not contrast two options`;
          if (marker === "caps_particle" && !capsTokens.some((token) => PARTICLES.has(token))) return `"${word}" does not stress a phrasal-verb particle in CAPITALS`;
          if (marker === "caps_aux" && !capsTokens.some((token) => AUXILIARIES.has(token))) return `"${word}" does not stress an auxiliary in CAPITALS`;
          if (marker === "caps_cleft" && !/^(?:what|it['’]s|it is|it was|the thing)\b/iu.test(word)) return `"${word}" is not a cleft sentence (What … / It's …)`;
          if (marker === "caps_correction" && !/\bnot\b|\bno\b|\bactually\b|\bbut\b|\bin fact\b/iu.test(word)) return `"${word}" does not correct a detail (no …, not …, actually …)`;
          return undefined;
        }
        case "fall":
          if (!/↘|↓/u.test(both)) return `"${word}" does not mark the falling tone ↘`;
          return /\?\s*$/u.test(word) && !/^(?:what|when|where|who|whom|whose|which|why|how)\b/iu.test(word) ? `"${word}" is a yes/no question, not a statement or Wh- question` : undefined;
        case "rise":
          if (!/↗|↑/u.test(both)) return `"${word}" does not mark the rising tone ↗`;
          return /\?\s*$/u.test(word) && !/^(?:what|when|where|who|why|how|which)\b/iu.test(word) ? undefined : `"${word}" is not a yes/no question ending in ?`;
        case "tag":
          if (!ARROW.test(both)) return `"${word}" does not mark the tone of the tag with ↘ or ↗`;
          return /,\s*[^,]+\?\s*$/u.test(word) ? undefined : `"${word}" is not a statement with a question tag after a comma`;
        case "list":
          if (!ARROW.test(both)) return `"${word}" does not mark the list tones with ↗ and ↘`;
          return (word.match(/,/gu) ?? []).length >= 1 && /\b(?:and|or)\b/iu.test(word) ? undefined : `"${word}" is not a list of three or more items (commas and and/or)`;
        case "polite":
          if (!ARROW.test(both)) return `"${word}" does not mark the tone with ↗ or ↘`;
          return /^(?:could|would|can|may|please|do you mind|would you mind)\b|\bplease\b/iu.test(word) ? undefined : `"${word}" is not a polite request (Could/Would/Can you…, please)`;
        case "pause":
          return /\|/u.test(word) && /\|/u.test(ipa) ? undefined : `"${word}" must mark its pauses with | in the example and in the IPA`;
        case "numbers":
          if (!/\d|[£$€%]/u.test(word) && !NUMBER_WORDS.test(word)) return `"${word}" contains no number, date, time or amount`;
          return hasStressMark ? undefined : `${ipa} has no stress mark ˈ`;
        case "unfinished":
          if (!/↗|↑/u.test(both)) return `"${word}" does not mark the rising tone ↗ of the unfinished clause`;
          return /,/u.test(word) ? undefined : `"${word}" has no unfinished clause ending in a comma`;
        case "teen_ty":
          if (!TEEN_TY.test(word)) return `"${word}" contains no -teen or -ty number`;
          return hasStressMark ? undefined : `${ipa} has no stress mark ˈ`;
        case "symbols":
          return /[@/#_]|\b(?:at|dot|slash|underscore|hyphen|dash|hash|hashtag|percent|ampersand|backslash)\b/iu.test(word) ? undefined : `"${word}" is not a spoken email, web address or symbol`;
        case "abbreviation":
          if (!word.split(/\s+/u).some((token) => /^[A-Z]{2,5}s?$/u.test(token.replace(/[^A-Za-z]/gu, "")))) return `"${word}" contains no abbreviation in CAPITALS`;
          return /[ˈˌ]/u.test(ipa) ? undefined : `${ipa} has no stress mark`;
        case "reduced_forms":
          return REDUCED_FORMS.test(word) ? undefined : `"${word}" contains no colloquial reduced form (gonna, wanna, 'll, 'd, d'you …)`;
        case "long_link":
          return (ipa.match(/‿/gu) ?? []).length >= 2 ? undefined : `${ipa} needs at least two links marked ‿`;
        case "attitude":
          return ARROW.test(both) ? undefined : `"${word}" does not mark the tone with ↗ or ↘`;
        case "figures":
          if (!capsTokens.length && !/\d/u.test(word) && !NUMBER_WORDS.test(word)) return `"${word}" stresses no figure or conclusion`;
          return hasStressMark ? undefined : `${ipa} has no stress mark ˈ`;
        case "sentence":
          return hasStressMark ? undefined : `${ipa} has no stress mark ˈ`;
      }
    }
  }
  return undefined;
}

/** Pair items: the side (0/1) an example illustrates, or undefined when it contains neither side. */
export function monthlyPronunciationPairSide(item: MonthlyPronunciationCatalogItem, example: { word: string; ipa: string }): { side: number; phoneme: string } | undefined {
  for (const [side, phonemes] of (item.sides ?? []).entries()) {
    const phoneme = phonemes.find((candidate) => monthlyIpaExampleMatchesTarget(`/${candidate}/`, example.ipa, example.word));
    if (phoneme) return { side, phoneme };
  }
  return undefined;
}

/** Highest syllable count of a single-word example for this target (phonemes, pairs, word stress, and legacy targets); undefined = no limit. */
export function monthlyPronunciationMaxSyllables(cefr: CefrLevel, sound: { ipa: string; catalogId?: string | undefined }, exampleWord: string): number | undefined {
  const item = findMonthlyPronunciationCatalogItem(cefr, sound);
  if (!item || item.type !== "phenomenon") return 3;
  if (item.wordStress && isSingleWord(exampleWord)) return 3;
  return undefined;
}

/**
 * Approval/manual-edit example check by item type: phoneme items need the
 * phoneme, pair items one side of the pair, phenomenon items the form rule.
 * Targets outside the catalog (older drafts) keep the phoneme-token check.
 */
export function monthlyPronunciationExampleIssue(cefr: CefrLevel, sound: { ipa: string; catalogId?: string | undefined }, example: { word: string; ipa: string }): string | undefined {
  const item = findMonthlyPronunciationCatalogItem(cefr, sound);
  if (item?.type === "phenomenon") return monthlyPronunciationPhenomenonExampleIssue(item, example);
  if (item?.type === "pair") return monthlyPronunciationPairSide(item, example) ? undefined : `IPA ${example.ipa} contains neither side of ${item.notation}`;
  return monthlyIpaExampleMatchesTarget(sound.ipa, example.ipa, example.word) ? undefined : `IPA ${example.ipa} does not contain target ${sound.ipa}`;
}
