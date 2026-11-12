/**
 * Season's hint box ("Gợi ý ý tưởng") suggests an IDEA for the learner's
 * answer, never a ready-made English sentence the learner can copy.
 *
 * Language follows the app's learner-facing rule: A1–A2 Vietnamese, B1+
 * English. At B1+ the hint is an English description of what to talk about
 * ("Talk about why the slides look unclear."), not a first-person answer.
 */

export type CoachAnswerIdeaLanguage = "vi" | "en";

export function coachAnswerIdeaLanguage(cefr?: string): CoachAnswerIdeaLanguage {
  const level = cefr?.trim().toUpperCase();
  return level === "B1" || level === "B2" || level === "C1" ? "en" : "vi";
}

const VIETNAMESE_LETTER = /[À-ɏḀ-ỿ]/u;
const MAX_IDEA_WORDS = 30;

/** Prompt rule appended to every Season call (roleplay and feedback). */
export function coachAnswerIdeaPromptRule(cefr?: string): string {
  const language = coachAnswerIdeaLanguage(cefr);
  const languageRule = language === "vi"
    ? "Write answerIdea in natural Vietnamese (A1–A2 learners read hints in Vietnamese), e.g. \"Bạn có thể nói về việc mấy cái slide trông chưa ổn.\" Do not put an English answer sentence or English quotation inside it; a single English workplace keyword is allowed only when unavoidable."
    : "Write answerIdea in English (B1+ hints are English) as an idea description that starts with an instruction verb such as Talk about, Mention, Explain, Describe, Share, or Suggest, e.g. \"Talk about why the slides look unclear.\" Never write it in the first person (I/we/my/our) and never as a sentence the learner could say word for word.";
  return `ANSWER IDEA (overrides any earlier instruction about a suggested or example answer): the hint shown under Season's turn is an IDEA for how the learner could answer the final in-character question, not a ready-made answer. It names the content to talk about in one short sentence of at most ${MAX_IDEA_WORDS} words and contains no quotation marks. ${languageRule} In the feedback JSON, suggestedAnswer.text is this idea${language === "vi" ? " and suggestedAnswer.translation is an empty string" : " and suggestedAnswer.translation is its natural Vietnamese translation"}.`;
}

/**
 * Issues that make a hint unusable as an idea. An English sample answer
 * ("The slides are stupid.") is rejected at every level.
 */
export function coachAnswerIdeaIssues(idea: string, cefr?: string): string[] {
  const text = idea.normalize("NFC").trim();
  if (!text) return ["Answer idea is empty."];
  const issues: string[] = [];
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length > MAX_IDEA_WORDS) issues.push("Answer idea is too long.");
  if (/["“”«»]/u.test(text)) issues.push("Answer idea must not quote a sentence for the learner to copy.");
  if (coachAnswerIdeaLanguage(cefr) === "vi") {
    if (!VIETNAMESE_LETTER.test(text)) issues.push("Answer idea must be written in Vietnamese at A1–A2.");
    // Four or more consecutive plain-ASCII words inside a Vietnamese hint is
    // an embedded English sample answer.
    if (embedsEnglishSentence(text)) {
      issues.push("Answer idea embeds an English sentence instead of describing an idea.");
    }
    return issues;
  }
  if (VIETNAMESE_LETTER.test(text)) issues.push("Answer idea must be written in English at B1+.");
  if (/^(?:i|we|my|our|i'm|i’m|we're|we’re|i've|i’ve|i'll|i’ll|yes|no|sure|thanks|thank you)\b/iu.test(text)
    || /\b(?:i|me|my|mine|we|our|us)\b/iu.test(text)) {
    issues.push("Answer idea is a first-person sample answer, not an idea description.");
  }
  if (!IDEA_VERB.test(text)) issues.push("Answer idea must start with an idea verb such as Talk about or Mention.");
  return issues;
}

const IDEA_VERB = /^(?:you\s+(?:could|can|might)\s+)?(?:talk|mention|explain|describe|share|suggest|say|give|tell|name|list|add|ask|offer|propose|compare|focus|point|outline|state|clarify|express|show|note|include|recommend|admit|thank|apologi[sz]e|agree|disagree|confirm|update|try|use)\b/iu;

const ENGLISH_FUNCTION_WORDS = new Set(["the", "a", "an", "is", "are", "am", "was", "were", "be", "to", "of", "and", "for", "will", "can", "i", "we", "you", "it", "my", "our", "your", "this", "that", "have", "has", "not", "do", "does", "with", "on", "in", "at", "please"]);

/**
 * A run of four or more plain-ASCII words with at least two English function
 * words ("The slides are stupid") is an English sentence. Vietnamese words
 * without diacritics ("deadline cho team khi") do not match.
 */
function embedsEnglishSentence(text: string): boolean {
  const tokens = text.split(/\s+/u).map((token) => token.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, "")).filter(Boolean);
  let run: string[] = [];
  const check = () => run.length >= 4 && run.filter((token) => ENGLISH_FUNCTION_WORDS.has(token.toLocaleLowerCase("en-US"))).length >= 2;
  for (const token of tokens) {
    if (/^[A-Za-z'’]+$/u.test(token)) { run.push(token); continue; }
    if (check()) return true;
    run = [];
  }
  return check();
}

export function isValidCoachAnswerIdea(idea: string, cefr?: string): boolean {
  return coachAnswerIdeaIssues(idea, cefr).length === 0;
}

/**
 * Deterministic idea used when the model returned an English sample answer
 * or nothing usable. It points at the question being asked without giving
 * the learner words to copy.
 */
export function fallbackCoachAnswerIdea(
  cefr: string | undefined,
  kind: "answer" | "dont_know" = "answer"
): { text: string; translation: string } {
  if (coachAnswerIdeaLanguage(cefr) === "vi") {
    return kind === "dont_know"
      ? { text: "Bạn có thể kể một việc cụ thể bạn đã làm hoặc định làm, rồi thêm một lý do ngắn.", translation: "" }
      : { text: "Bạn có thể trả lời bằng một chi tiết cụ thể trong công việc của mình, ví dụ việc gì, khi nào hoặc vì sao.", translation: "" };
  }
  return kind === "dont_know"
    ? { text: "Mention one specific thing you did or plan to do, then add a short reason.", translation: "Hãy nêu một việc cụ thể bạn đã làm hoặc định làm, rồi thêm một lý do ngắn." }
    : { text: "Share one specific detail from your work that answers the question, such as what, when, or why.", translation: "Hãy chia sẻ một chi tiết cụ thể trong công việc để trả lời câu hỏi, ví dụ việc gì, khi nào hoặc vì sao." };
}

/** The idea to store: the model's idea when it passes the gate, otherwise the fallback. */
export function repairCoachAnswerIdea(
  idea: { text?: string | undefined; translation?: string | undefined } | undefined,
  cefr: string | undefined
): { text: string; translation: string; repaired: boolean } {
  const text = idea?.text?.trim() ?? "";
  if (text && isValidCoachAnswerIdea(text, cefr)) {
    const translation = coachAnswerIdeaLanguage(cefr) === "vi" ? "" : (idea?.translation?.trim() ?? "");
    return { text, translation, repaired: false };
  }
  return { ...fallbackCoachAnswerIdea(cefr), repaired: true };
}
