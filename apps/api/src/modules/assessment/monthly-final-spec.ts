import type { CefrLevel, MonthlyFinalGraderPackage } from "@e4s/contracts";

/**
 * Fixed parameters of "Cấu trúc bài thi cuối tháng & quy tắc AI v2.0".
 * Sections 2 (format/allocation), 3 (level profiles) and 8 (rubric).
 */
export const MONTHLY_FINAL_SPEC_VERSION = "2.0" as const;
export const MONTHLY_FINAL_TOTAL_MINUTES = 30;
export const MONTHLY_FINAL_TOTAL_SCORE = 100;
export const MONTHLY_FINAL_SECTION_SCORE = 25;
export const MONTHLY_FINAL_SECTION_MINUTES = { listening: 8, reading: 8, writing: 8, speaking: 6 } as const;
/** S1 (read-aloud) is worth 8; S2–S5 (voice note) 6 + 4 + 4 + 3 = 17. */
export const MONTHLY_FINAL_SPEAKING_A_SCORE = 8;
export const MONTHLY_FINAL_SPEAKING_B_SCORE = 17;
export const MONTHLY_FINAL_LISTENING_SPLIT_FACTOR = 0.43;
export const MONTHLY_FINAL_OPTION_COUNT = 3;

export interface MonthlyFinalAllocation { n: number; l: number; r: number; w: number; s: number }

export interface MonthlyFinalLevelProfile {
  instructionLanguage: "vi" | "en";
  writingTerms: number;
  speakingTerms: number;
  listeningScriptWords: { min: number; max: number; delivery: string };
  readingItem: { sentences: string; maxWords: number };
  writing: { genre: "message" | "email"; minWords: number; maxWords: number; ideas: number; support: string };
  speakingA: { sentences: string; maxWords: number };
  speakingB: { minSeconds: number; maxSeconds: number; limitSeconds: number; ideas: number };
  pronunciationType: string;
}

export const MONTHLY_FINAL_LEVEL_PROFILES: Record<CefrLevel, MonthlyFinalLevelProfile> = {
  A1: {
    instructionLanguage: "vi", writingTerms: 4, speakingTerms: 3,
    listeningScriptWords: { min: 70, max: 90, delivery: "slow, clear" },
    readingItem: { sentences: "1 sentence", maxWords: 12 },
    writing: { genre: "message", minWords: 35, maxWords: 45, ideas: 2, support: "Give an opening-sentence hint." },
    speakingA: { sentences: "1–2 sentences", maxWords: 18 },
    speakingB: { minSeconds: 20, maxSeconds: 30, limitSeconds: 45, ideas: 2 },
    pronunciationType: "single IPA sound"
  },
  A2: {
    instructionLanguage: "vi", writingTerms: 5, speakingTerms: 3,
    listeningScriptWords: { min: 90, max: 110, delivery: "fairly slow" },
    readingItem: { sentences: "1–2 sentences", maxWords: 15 },
    writing: { genre: "message", minWords: 50, maxWords: 70, ideas: 3, support: "Give linking-word hints." },
    speakingA: { sentences: "2 sentences", maxWords: 22 },
    speakingB: { minSeconds: 30, maxSeconds: 45, limitSeconds: 60, ideas: 3 },
    pronunciationType: "single IPA sound or sound pair"
  },
  B1: {
    instructionLanguage: "en", writingTerms: 6, speakingTerms: 4,
    listeningScriptWords: { min: 110, max: 130, delivery: "moderate" },
    readingItem: { sentences: "1–2 sentences", maxWords: 20 },
    writing: { genre: "email", minWords: 80, maxWords: 100, ideas: 3, support: "Facts only." },
    speakingA: { sentences: "2 sentences", maxWords: 25 },
    speakingB: { minSeconds: 60, maxSeconds: 75, limitSeconds: 90, ideas: 3 },
    pronunciationType: "final sounds, consonant clusters, word stress"
  },
  B2: {
    instructionLanguage: "en", writingTerms: 6, speakingTerms: 4,
    listeningScriptWords: { min: 130, max: 150, delivery: "near natural" },
    readingItem: { sentences: "2 sentences", maxWords: 25 },
    writing: { genre: "email", minWords: 100, maxWords: 120, ideas: 3, support: "Facts only." },
    speakingA: { sentences: "2–3 sentences", maxWords: 35 },
    speakingB: { minSeconds: 75, maxSeconds: 90, limitSeconds: 90, ideas: 3 },
    pronunciationType: "weak forms, linking, sentence stress, intonation"
  },
  C1: {
    instructionLanguage: "en", writingTerms: 6, speakingTerms: 4,
    listeningScriptWords: { min: 140, max: 160, delivery: "natural, with linking" },
    readingItem: { sentences: "2–3 sentences", maxWords: 30 },
    writing: { genre: "email", minWords: 120, maxWords: 140, ideas: 3, support: "Facts include details the learner must select." },
    speakingA: { sentences: "3 sentences", maxWords: 45 },
    speakingB: { minSeconds: 90, maxSeconds: 110, limitSeconds: 120, ideas: 3 },
    pronunciationType: "advanced stress, emphasis, attitudinal intonation"
  }
};

/** L = floor(0.43 × (N − W − S)); R = N − W − S − L (section 2, VH-R61). */
export function monthlyFinalAllocation(n: number, cefr: CefrLevel): MonthlyFinalAllocation {
  const profile = MONTHLY_FINAL_LEVEL_PROFILES[cefr];
  const w = profile.writingTerms;
  const s = profile.speakingTerms;
  const remaining = n - w - s;
  if (!Number.isInteger(n) || remaining < 2) throw new RangeError("MONTHLY_FINAL_TERM_COUNT_TOO_SMALL");
  // Integer arithmetic avoids 0.43 × 38 = 16.339999… style drift.
  const l = Math.floor((43 * remaining) / 100);
  return { n, l, r: remaining - l, w, s };
}

export function monthlyFinalFormCode(cefr: CefrLevel, month: string): string {
  return `E4S ${cefr} Monthly ${month} Form A v${MONTHLY_FINAL_SPEC_VERSION}`;
}

export function monthlyFinalRubric(): MonthlyFinalGraderPackage["rubric"] {
  return [
    { code: "W1", skill: "writing", maxScore: 6, description: "Communicative ideas: each idea 0–2, scaled to 6 (A1: total ÷ 4 × 6)." },
    { code: "W2", skill: "writing", maxScore: 6, description: "W target terms: each 0 / 0.5 / 1, W2 = total ÷ W × 6." },
    { code: "W3", skill: "writing", maxScore: 6, description: "GA main 2 + GA secondary 1 + GB main 2 + GB secondary 1." },
    { code: "W4", skill: "writing", maxScore: 4, description: "Organisation 0–2 + workplace register 0–2." },
    { code: "W5", skill: "writing", maxScore: 3, description: "Spelling, capitals, punctuation 0–3." },
    { code: "S1", skill: "speaking", maxScore: 8, description: "Read-aloud: P1–P4 × 2 positions, each 0 / 0.5 / 1, from audio only." },
    { code: "S2", skill: "speaking", maxScore: 6, description: "Voice note ideas: each 0–2, scaled to 6 (A1: total ÷ 4 × 6)." },
    { code: "S3", skill: "speaking", maxScore: 4, description: "S target terms: each 0 / 0.5 / 1, S3 = total ÷ S × 4." },
    { code: "S4", skill: "speaking", maxScore: 4, description: "GA main 0/1/2 + GB main 0/1/2." },
    { code: "S5", skill: "speaking", maxScore: 3, description: "Continuity of the voice note 0–3." }
  ];
}

/** Learner-facing chrome, written in the level's instruction language (GEN22). */
export function monthlyFinalChrome(cefr: CefrLevel) {
  const vi = MONTHLY_FINAL_LEVEL_PROFILES[cefr].instructionLanguage === "vi";
  return vi ? {
    title: (month: string) => `Bài thi tháng ${month}`,
    listening: { title: "Nghe", instruction: (l: number) => `8 phút · ${l} câu · 25 điểm. Nghe hai tin nhắn, mỗi tin nhắn được nghe 2 lần. Chọn A, B hoặc C.` },
    listeningGroup: (label: string, from: string, to: string) => ({ title: `Tin nhắn ${label}`, instruction: `Câu ${from}–${to} hỏi về tin nhắn ${label}. Bạn có 30 giây xem câu hỏi trước khi nghe.` }),
    reading: { title: "Đọc", instruction: (r: number) => `8 phút · ${r} câu · 25 điểm. Đọc từng tin nhắn. Nếu có chỗ trống, chọn từ đúng nhất cho cả tin nhắn; nếu không, chọn nghĩa hoặc hành động đúng.`, group: "Câu hỏi đọc" },
    writing: { title: "Viết", instruction: "8 phút · 25 điểm. Viết một lần, chỉ bản nộp cuối được chấm.", group: "Bài viết" },
    speaking: { title: "Nói", instruction: "6 phút · 25 điểm. Có hai bản ghi âm; mỗi phần chỉ có một lượt ghi chính thức.", groupA: "Phần A – Đọc thành tiếng", groupB: "Phần B – Tin nhắn thoại", instructionA: "Chuẩn bị 45 giây, sau đó đọc một lần (tối đa 45 giây).", instructionB: (min: number, max: number, limit: number) => `Chuẩn bị tối đa 90 giây. Ghi một tin nhắn thoại khoảng ${min}–${max} giây (tối đa ${limit} giây). Không đọc lại bài viết.` }
  } : {
    title: (month: string) => `Monthly Test ${month}`,
    listening: { title: "Listening", instruction: (l: number) => `8 minutes · ${l} questions · 25 points. Listen to two messages. You will hear each message twice. Choose A, B or C.` },
    listeningGroup: (label: string, from: string, to: string) => ({ title: `Message ${label}`, instruction: `Questions ${from}–${to} are about Message ${label}. You have 30 seconds to read the questions first.` }),
    reading: { title: "Reading", instruction: (r: number) => `8 minutes · ${r} questions · 25 points. Read each message. If there is a gap, choose the best word for the whole message. If there is no gap, choose the correct meaning or action.`, group: "Reading questions" },
    writing: { title: "Writing", instruction: "8 minutes · 25 points. Only your final submitted text is marked.", group: "Writing task" },
    speaking: { title: "Speaking", instruction: "6 minutes · 25 points. There are two recordings; each has one official attempt.", groupA: "Part A – Read aloud", groupB: "Part B – Voice note", instructionA: "Prepare for 45 seconds, then read once (maximum 45 seconds).", instructionB: (min: number, max: number, limit: number) => `Prepare for up to 90 seconds. Record a message of about ${min}–${max} seconds (maximum ${limit} seconds). Do not read your email aloud.` }
  };
}

export function positionCode(prefix: "L" | "R", index: number): string {
  return `${prefix}${String(index + 1).padStart(2, "0")}`;
}

export function termCode(index: number): string {
  return `V${String(index + 1).padStart(2, "0")}`;
}
