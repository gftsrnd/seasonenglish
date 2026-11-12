/**
 * British RP and well-formedness checks for monthly IPA (December 2026
 * evaluation): 7–14 of 54 core words per level had American transcriptions
 * (hard /hɑːrd/, new /nuː/, clear /klɪr/, notes /noʊts/, document /ˈdɑːkjumənt/,
 * last /læst/ used as an /æ/ example), and B2 had malformed phrase IPA
 * ("next month /ˈnekis(t)/", "to our agenda /tuː‿w‿ˈaʊər ə‿j‿ˈdʒendə/").
 * The product standard is British English (docs/pronunciation-roadmap.md).
 *
 * The checks only reject; the rejection reasons go back to the generator
 * (core IPA repair round, pronunciation example retries).
 */
import { monthlyPronunciationExampleText } from "@e4s/domain";

const VOWEL = "aeiouæɑɒɔəɜɪʊʌɛɐ";
const VOWEL_CHAR = new RegExp(`[${VOWEL}]`, "u");

/** BATH-set words: /ɑː/ in British RP, /æ/ in General American. */
const BATH_WORDS = new Set([
  "last", "past", "fast", "cast", "vast", "task", "tasks", "ask", "asks", "asked", "asking", "basket", "class", "classes", "glass",
  "grass", "pass", "passes", "passed", "passing", "after", "afternoon", "answer", "answers", "answered", "can't", "plant", "plants",
  "dance", "chance", "chances", "advance", "advanced", "advantage", "example", "examples", "demand", "demands", "staff", "path", "paths",
  "bath", "half", "laugh", "rather", "aunt", "branch", "branches", "command", "draft", "drafts", "craft", "master", "castle", "fasten",
  "nasty", "sample", "samples", "grant", "grants", "contrast", "forecast", "broadcast", "podcast", "graph", "graphs", "transfer", "France"
].map((word) => word.toLocaleLowerCase("en-US")));

/** Spellings with LOT /ɒ/ in RP that General American gives /ɑː/; words with an "a" are not judged. */
const LOT_EXCEPTIONS = new Set(["clerk", "clerks", "derby"]);

function inner(ipa: string): string {
  return ipa.trim().replace(/^\//u, "").replace(/\/$/u, "");
}

/**
 * The first British-RP or well-formedness problem of an IPA transcription for
 * `word` (a word or a short phrase), or undefined. Messages say what to write instead.
 */
export function monthlyBritishIpaIssue(word: string, ipa: string): string | undefined {
  const raw = ipa.trim();
  if (!raw) return undefined;
  if (!/^\/[^/]+\/$/u.test(raw)) return `IPA "${raw}" must be one transcription between slashes, e.g. /ˈmænɪdʒə/`;
  const body = inner(raw);
  if ((body.match(/\(/gu) ?? []).length !== (body.match(/\)/gu) ?? []).length) return `IPA ${raw} has unbalanced brackets`;
  const american = [["ɹ", "/r/"], ["ɚ", "/ə/"], ["ɝ", "/ɜː/"], ["ɾ", "/t/ or /d/ (no American flap)"], ["ɫ", "/l/"]].find(([symbol]) => body.includes(symbol!));
  if (american) return `IPA ${raw} uses the American symbol ${american[0]}; write British RP with ${american[1]}`;
  if (/oʊ/u.test(body)) return `IPA ${raw} has the American /oʊ/; British RP uses /əʊ/ (notes /nəʊts/)`;
  const foreign = body.replace(/[͡‿̩̯ˈˌ.ː() ʔ]/gu, "").match(/[cqyx]|o(?!ʊ)|a(?![ɪʊ])/u);
  if (foreign) return `IPA ${raw} contains "${foreign[0]}", which is not a British RP symbol here (use /æ/, /ɑː/, /ɒ/, /ɔː/, /əʊ/, /k/, /j/…)`;
  if (/ɑ(?!ː)/u.test(body)) return `IPA ${raw} has a short /ɑ/; British RP has /ɒ/ (job /dʒɒb/) or long /ɑː/ (car /kɑː/)`;

  // Rhotic r: in RP /r/ is only pronounced before a vowel (linking r across words is fine).
  const joined = body.replace(/\([^)]*\)/gu, "").replace(/[ˈˌ.\s‿ʳ↗↘→|]/gu, "");
  for (let index = 0; index < joined.length; index += 1) {
    if (joined[index] !== "r") continue;
    let next = index + 1;
    while (next < joined.length && /[ː̩̯]/u.test(joined[next]!)) next += 1;
    if (next >= joined.length || !VOWEL_CHAR.test(joined[next]!)) return `IPA ${raw} pronounces an /r/ that is not followed by a vowel (American rhotic r); British RP drops it (hard /hɑːd/, manager /ˈmænɪdʒə/, clear /klɪə/, work /wɜːk/)`;
  }

  const spoken = monthlyPronunciationExampleText(word).toLocaleLowerCase("en-US");
  const tokens = spoken.match(/[a-z]+(?:'[a-z]+)?/gu) ?? [];
  const letters = tokens.join("");
  const bath = tokens.find((token) => BATH_WORDS.has(token));
  if (bath && /æ/u.test(body) && !/ɑː/u.test(body)) return `"${bath}" is a BATH word: British RP has /ɑː/ (last /lɑːst/, answer /ˈɑːnsə/), not the American /æ/`;
  if (/ɑː/u.test(body) && letters && !/a/u.test(letters) && !tokens.some((token) => LOT_EXCEPTIONS.has(token))) return `IPA ${raw} has the American /ɑː/ for the letter o; British RP uses /ɒ/ (project /ˈprɒdʒekt/, document /ˈdɒkjumənt/)`;
  // Yod: RP keeps /j/ after n, t, d before /uː/ (new /njuː/, student /ˈstjuːdənt/, duty /ˈdjuːti/).
  if (/(?:new|neu|nu|tu|tew|du|dew|deu)/u.test(letters) && /[ntd]uː/u.test(body.replace(/[ˈˌ.]/gu, ""))) return `IPA ${raw} drops the /j/ (American); British RP keeps it after n, t, d: new /njuː/, student /ˈstjuːdənt/, duty /ˈdjuːti/`;

  // Phrases: every word is transcribed, separated by a space or ‿.
  if (tokens.length >= 2 && !/[\s‿]/u.test(body)) return `"${spoken}" has ${tokens.length} words but IPA ${raw} is written as one word; transcribe every word, separated by spaces or ‿`;
  // A linking glide /j/ or /w/ stands between two vowels (do‿w‿it, the‿j‿end).
  for (const match of body.matchAll(/‿([jw])‿/gu)) {
    const before = body.slice(0, match.index).replace(/[ːˈˌ\s]+$/u, "").at(-1) ?? "";
    const after = body.slice(match.index! + match[0].length).replace(/^[ˈˌ\s]+/u, "")[0] ?? "";
    if (!VOWEL_CHAR.test(before) || !VOWEL_CHAR.test(after)) return `IPA ${raw} puts the linking /${match[1]}/ between "${before}" and "${after}"; a linking /j/ or /w/ only joins a vowel to a following vowel`;
  }
  return undefined;
}

/** Prompt rule shared by the core and pronunciation phases. */
export const MONTHLY_BRITISH_IPA_RULE = "IPA STANDARD (checked by the application): every ipa is standard British English (RP) between slashes. No rhotic r before a consonant or at the end (hard /hɑːd/, manager /ˈmænɪdʒə/, clear /klɪə/, work /wɜːk/; an r is written only before a vowel); /əʊ/ never /oʊ/ (notes /nəʊts/); /ɒ/ for the LOT vowel, never /ɑː/ or /ɑ/ (project /ˈprɒdʒekt/, document /ˈdɒkjumənt/); /ɑː/ in BATH words (last /lɑːst/, answer /ˈɑːnsə/, ask /ɑːsk/, staff /stɑːf/), so a BATH word never illustrates /æ/; /j/ kept after n, t, d (new /njuː/, student /ˈstjuːdənt/); no ɹ, ɚ, ɝ or flap ɾ. A phrase transcribes every word, separated by spaces or ‿; a linking /j/ or /w/ only joins two vowels.";

type CoreWithIpa = { id: string; word: string; meaning: string; type: string; ipa: string; cefr?: unknown };

/**
 * Up to `rounds` targeted repair calls for core terms whose IPA fails the British
 * check: the generator returns the same terms with corrected IPA; a correction
 * is taken only when it passes. Returns the terms that still fail.
 */
export async function repairMonthlyCoreIpa<T extends CoreWithIpa>(
  coreTerms: T[],
  generate: (prompt: string, batch: T[]) => Promise<{ coreTerms: ReadonlyArray<{ id: string; word: string; ipa: string }> }>,
  rounds = 2
): Promise<{ changed: boolean; remaining: Array<{ word: string; ipa: string; issue: string }> }> {
  let changed = false;
  const failing = () => coreTerms.flatMap((term) => {
    const issue = monthlyBritishIpaIssue(term.word, term.ipa);
    return issue ? [{ term, issue }] : [];
  });
  for (let round = 0; round < rounds; round += 1) {
    const current = failing();
    if (!current.length) break;
    const prompt = `PHASE IPA REPAIR — DO NOT CHANGE ANY WORD. Return coreTerms containing exactly the ${current.length} core terms of coreTermBatch, each with the same id, word, meaning and type, and its ipa corrected to standard British English (RP). Leave expandedTerms, grammarTopics and pronunciationTargets empty. The application rejected these transcriptions: ${current.map(({ term, issue }) => `${term.word} ${term.ipa} (${issue})`).join("; ")}. ${MONTHLY_BRITISH_IPA_RULE}`;
    let output: { coreTerms: ReadonlyArray<{ id: string; word: string; ipa: string }> };
    try { output = await generate(prompt, current.map(({ term }) => term)); } catch { break; }
    for (const { term } of current) {
      const returned = output.coreTerms.find((candidate) => candidate.id === term.id && candidate.word.trim().toLocaleLowerCase("en-US") === term.word.trim().toLocaleLowerCase("en-US"));
      const ipa = returned?.ipa?.trim();
      if (ipa && ipa !== term.ipa && !monthlyBritishIpaIssue(term.word, ipa)) { term.ipa = ipa; changed = true; }
    }
  }
  return { changed, remaining: failing().map(({ term, issue }) => ({ word: term.word, ipa: term.ipa, issue })) };
}
