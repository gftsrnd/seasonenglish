import {
  countsTowardCorePhraseLimit,
  buildMonthlyCalendar,
  describeRequiredSupportRelations,
  hasRequiredMonthlySupportRelations,
  isMonthlySupportLevelAllowed,
  maxMonthlyPhrasePlacements,
  maxMonthlySupportRepeats,
  monthlySupportLevelRule,
  monthlyDayKind,
  MONTHLY_MAX_SUPPORTS_PER_CORE,
  MONTHLY_MIN_SUPPORTS_PER_CORE,
  planMonthlyResourcePool,
  requiredSupportRelationsFor,
  validateMonthlyCurriculum,
  type MonthlyResourcePoolContract
} from "@e4s/domain";
import type { CefrLevel, MonthlyResourceEditInput, MonthlyResourceEditIssue, SharedMonthBriefView } from "@e4s/contracts";
import { z } from "zod";
import { isPronunciationTargetAllowedForLevel, isValidMonthlyPronunciationIpaTarget } from "./monthly-resource-plan-spec.js";
import { isVietnameseMonthlyText, monthlyDailyObjectivesMustBeEnglish } from "./monthly-resource-generation.js";
import { findMonthlyPronunciationCatalogItem, monthlyPronunciationExampleIssue, monthlyPronunciationMaxSyllables } from "@e4s/domain";

/**
 * Manual editing of a DRAFT monthly resource pool (VH-R30/VH-R35).
 *
 * The Operator may edit every field, add/remove support terms per core and
 * replace a core word in place, but the number of cores, grammar topics/steps
 * and pronunciation targets (and their IDs, which the lesson roadmap keys on)
 * are fixed. The edited pool must pass the same whole-pool rules as a generated
 * draft (`planMonthlyResourcePool` + `validateMonthlyCurriculum`); this module
 * re-states the per-row rules first so each problem can be shown on its line.
 */

const resourceId = z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}_.:-]+$/u);
const text = (max: number) => z.string().max(max);
const cefr = z.enum(["A1", "A2", "B1", "B2", "C1"]);

export const monthlyResourceEditInputSchema = z.object({
  expectedVersion: z.int().positive(),
  coreTerms: z.array(z.object({ id: resourceId, word: text(80), type: text(40), meaning: text(300), ipa: text(120) })).max(120),
  supportTerms: z.array(z.object({
    id: resourceId, word: text(120), meaning: text(300), type: text(40),
    relation: z.enum(["umbrella", "synonym", "antonym", "word_family", "collocation"]),
    relatedCoreTermId: resourceId,
    cefr: cefr.optional()
  })).max(120 * MONTHLY_MAX_SUPPORTS_PER_CORE),
  grammarTopics: z.array(z.object({
    id: resourceId, title: text(200),
    steps: z.array(z.object({ id: resourceId, focus: text(300), formula: text(300), usage: text(1_000), examples: z.array(text(300)).max(20), dailyObjectives: z.array(text(500)).length(2).optional() })).max(10)
  })).max(10),
  sounds: z.array(z.object({
    id: resourceId, ipa: text(40), label: text(200),
    examples: z.array(z.object({ id: resourceId, word: text(80), ipa: text(120) })).max(40)
  })).max(10)
}) satisfies z.ZodType<MonthlyResourceEditInput>;

export type MonthlyResourceEditResult =
  | { ok: true; pool: MonthlyResourcePoolContract; warnings: MonthlyResourceEditIssue[] }
  | { ok: false; issues: MonthlyResourceEditIssue[]; warnings: MonthlyResourceEditIssue[] };

/** Core words of the other CEFR levels of the same month (WP9 cross-level overlap check). */
export interface MonthlyResourceEditOptions {
  otherLevelCoreTerms?: ReadonlyArray<{ cefr: CefrLevel; words: readonly string[] }>;
}

/** B1 and C1 must not share core words; any other cross-level overlap is only a warning. */
function isBlockingLevelOverlap(left: CefrLevel, right: CefrLevel): boolean {
  return (left === "C1" && right === "B1") || (left === "B1" && right === "C1");
}

const MIN_GRAMMAR_EXAMPLES = 3;
const MIN_PRONUNCIATION_EXAMPLES = 9;

export function blankMonthlyResourcePool(brief: SharedMonthBriefView, level: CefrLevel): MonthlyResourcePoolContract {
  const calendar = buildMonthlyCalendar(brief.month);
  const count = calendar.effectiveDays.filter((_, index) => monthlyDayKind(index + 1, calendar) === "new").length * 3;
  return {
    month: brief.month, cefr: level, version: 1,
    theme: { version: brief.version, title: brief.title, brief: brief.brief, context: brief.context, communicationGoal: brief.communicationGoal },
    coreTerms: Array.from({ length: count }, (_, index) => ({
      id: `core-${index + 1}`, word: "", meaning: "", type: "", ipa: "", source: "core_registry", component: "core"
    })),
    supportTerms: [],
    grammarTopics: Array.from({ length: 2 }, (_, index) => ({
      id: `grammar-${index + 1}`, title: "",
      steps: Array.from({ length: 3 }, (_, step) => ({
        id: `grammar-${index + 1}-${step + 1}`, focus: "", formula: "", usage: "", examples: []
      }))
    })),
    sounds: Array.from({ length: 4 }, (_, index) => ({ id: `sound-${index + 1}`, ipa: "", label: "", examples: [] }))
  };
}

/** Applies an Operator edit to a stored draft pool and validates the result. */
export function applyMonthlyResourceEdit(existing: MonthlyResourcePoolContract, input: MonthlyResourceEditInput, options: MonthlyResourceEditOptions = {}): MonthlyResourceEditResult {
  const issues: MonthlyResourceEditIssue[] = [];
  const warnings: MonthlyResourceEditIssue[] = [];
  const add = (issue: MonthlyResourceEditIssue) => { issues.push(issue); };

  // Structure: the counts and IDs the lesson roadmap depends on are fixed.
  const existingCoreIds = existing.coreTerms.map((term) => term.id);
  const inputCoreIds = input.coreTerms.map((term) => term.id);
  if (inputCoreIds.length !== existingCoreIds.length || inputCoreIds.some((id, index) => id !== existingCoreIds[index])) {
    add({ section: "pool", message: `Số từ cốt lõi cố định là ${existingCoreIds.length}; chỉ được thay từ trong từng dòng, không thêm/xóa/đổi thứ tự.` });
  }
  const sameIds = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((id, index) => id === right[index]);
  if (!sameIds(input.grammarTopics.map((topic) => topic.id), existing.grammarTopics.map((topic) => topic.id))) {
    add({ section: "grammarTopics", message: "Giữ nguyên 2 chủ điểm ngữ pháp; chỉ sửa nội dung." });
  }
  for (const topic of input.grammarTopics) {
    const stored = existing.grammarTopics.find((item) => item.id === topic.id);
    if (stored && !sameIds(topic.steps.map((step) => step.id), stored.steps.map((step) => step.id))) {
      add({ section: "grammarTopics", rowId: topic.id, message: "Mỗi chủ điểm giữ nguyên 3 bước; chỉ sửa nội dung từng bước." });
    }
  }
  if (!sameIds(input.sounds.map((sound) => sound.id), existing.sounds.map((sound) => sound.id))) {
    add({ section: "sounds", message: "Giữ nguyên 4 mục tiêu phát âm; chỉ sửa nội dung." });
  }

  // Term IDs share one namespace (lesson exercises reference both); so do sounds and their examples.
  const idGroups = [
    [...input.coreTerms.map((term) => term.id), ...input.supportTerms.map((term) => term.id)],
    input.grammarTopics.flatMap((topic) => [topic.id, ...topic.steps.map((step) => step.id)]),
    input.sounds.flatMap((sound) => [sound.id, ...sound.examples.map((example) => example.id)])
  ];
  for (const ids of idGroups) {
    const seenIds = new Set<string>();
    for (const id of ids) {
      if (seenIds.has(id)) add({ section: "pool", rowId: id, message: `Mã tài nguyên ${id} bị trùng.` });
      seenIds.add(id);
    }
  }

  // Core rows.
  const coreWordOwner = new Map<string, string>();
  for (const core of input.coreTerms) {
    const word = core.word.trim();
    if (!word) add({ section: "coreTerms", rowId: core.id, field: "word", message: "Từ cốt lõi không được để trống." });
    else if (!isSingleHeadword(word)) add({ section: "coreTerms", rowId: core.id, field: "word", message: "Từ cốt lõi phải là một từ tiếng Anh đơn." });
    if (!core.type.trim()) add({ section: "coreTerms", rowId: core.id, field: "type", message: "Chọn từ loại." });
    if (!core.meaning.trim()) add({ section: "coreTerms", rowId: core.id, field: "meaning", message: "Nghĩa tiếng Việt không được để trống." });
    if (!core.ipa.trim()) add({ section: "coreTerms", rowId: core.id, field: "ipa", message: "IPA không được để trống." });
    const key = normalizeWord(word);
    if (key) {
      const owner = coreWordOwner.get(key);
      if (owner) add({ section: "coreTerms", rowId: core.id, field: "word", message: `Trùng từ cốt lõi "${word}".` });
      else coreWordOwner.set(key, core.id);
    }
    // Cross-level overlap in the same month: a C1 core that is already a B1 core
    // (or the reverse) is not a C1 word; other level pairs are flagged only.
    if (key) for (const other of options.otherLevelCoreTerms ?? []) {
      if (other.cefr === existing.cefr || !other.words.some((value) => normalizeWord(value) === key)) continue;
      const issue: MonthlyResourceEditIssue = { section: "coreTerms", rowId: core.id, field: "word", message: `"${word}" đã là từ cốt lõi ${other.cefr} của cùng tháng.` };
      if (isBlockingLevelOverlap(existing.cefr, other.cefr)) add(issue);
      else warnings.push(issue);
    }
  }

  // Support rows.
  const coreIds = new Set(inputCoreIds);
  for (const support of input.supportTerms) {
    const word = support.word.trim();
    if (!coreIds.has(support.relatedCoreTermId)) add({ section: "supportTerms", rowId: support.id, field: "relatedCoreTermId", message: "Từ mở rộng phải gắn với một từ cốt lõi của tháng." });
    if (!word) add({ section: "supportTerms", rowId: support.id, field: "word", message: "Từ mở rộng không được để trống." });
    else if (!isSingleHeadword(word) && !isNaturalPhrase(word)) add({ section: "supportTerms", rowId: support.id, field: "word", message: "Từ mở rộng phải là một từ đơn hoặc cụm 2–4 từ tiếng Anh." });
    if (!support.meaning.trim()) add({ section: "supportTerms", rowId: support.id, field: "meaning", message: "Nghĩa tiếng Việt không được để trống." });
    if (!support.type.trim()) add({ section: "supportTerms", rowId: support.id, field: "type", message: "Chọn từ loại." });
    if (word && coreWordOwner.has(normalizeWord(word))) add({ section: "supportTerms", rowId: support.id, field: "word", message: `"${word}" trùng một từ cốt lõi.` });
    if (!isMonthlySupportLevelAllowed(existing.cefr, support)) add({ section: "supportTerms", rowId: support.id, field: "cefr", message: `CEFR ${support.cefr} không hợp lệ: ${monthlySupportLevelRule(existing.cefr)}.` });
  }

  // Per-core support rules (count, relations required by part of speech, phrase limit, duplicates).
  for (const core of input.coreTerms) {
    const supports = input.supportTerms.filter((term) => term.relatedCoreTermId === core.id);
    if (supports.length < MONTHLY_MIN_SUPPORTS_PER_CORE || supports.length > MONTHLY_MAX_SUPPORTS_PER_CORE) {
      add({ section: "coreTerms", rowId: core.id, field: "supports", message: `Cần ${MONTHLY_MIN_SUPPORTS_PER_CORE}–${MONTHLY_MAX_SUPPORTS_PER_CORE} từ mở rộng (hiện có ${supports.length}).` });
    }
    if (!hasRequiredMonthlySupportRelations(core.type, supports)) {
      const present = new Set(supports.map((term) => term.relation));
      const missing = requiredSupportRelationsFor(core.type).filter((relation) => !present.has(relation));
      add({ section: "coreTerms", rowId: core.id, field: "supports", message: `Thiếu quan hệ bắt buộc: ${missing.map(relationLabel).join(", ")} (${describeRequiredSupportRelations(core.type)}).` });
    }
    const phrases = supports.filter(countsTowardCorePhraseLimit);
    if (phrases.length > 1) for (const phrase of phrases.slice(1)) add({ section: "supportTerms", rowId: phrase.id, field: "word", message: "Mỗi từ cốt lõi chỉ có tối đa 1 cụm từ (trừ cụm bao trùm)." });
    const seen = new Set<string>();
    for (const support of supports) {
      const key = normalizeWord(support.word);
      if (!key) continue;
      if (seen.has(key)) add({ section: "supportTerms", rowId: support.id, field: "word", message: `"${support.word.trim()}" lặp lại trong cùng từ cốt lõi.` });
      seen.add(key);
    }
  }

  // Pool-wide caps.
  const supportCount = input.supportTerms.length;
  const expectedCoreCount = existing.coreTerms.length;
  if (supportCount < expectedCoreCount * MONTHLY_MIN_SUPPORTS_PER_CORE || supportCount > expectedCoreCount * MONTHLY_MAX_SUPPORTS_PER_CORE) {
    add({ section: "pool", message: `Tổng từ mở rộng phải trong khoảng ${expectedCoreCount * MONTHLY_MIN_SUPPORTS_PER_CORE}–${expectedCoreCount * MONTHLY_MAX_SUPPORTS_PER_CORE} (hiện có ${supportCount}).` });
  }
  const phraseCount = input.supportTerms.filter((term) => term.word.trim() && !isSingleHeadword(term.word)).length;
  if (phraseCount > maxMonthlyPhrasePlacements(supportCount)) {
    add({ section: "pool", message: `Cụm từ vượt giới hạn 35% (${phraseCount}/${maxMonthlyPhrasePlacements(supportCount)} được phép).` });
  }
  const supportWords = input.supportTerms.map((term) => normalizeWord(term.word)).filter(Boolean);
  const repeats = supportWords.length - new Set(supportWords).size;
  if (repeats > maxMonthlySupportRepeats(supportCount)) {
    add({ section: "pool", message: `Từ mở rộng lặp lại vượt giới hạn 35% (${repeats}/${maxMonthlySupportRepeats(supportCount)} được phép).` });
  }

  // Grammar rows.
  for (const topic of input.grammarTopics) {
    if (!topic.title.trim()) add({ section: "grammarTopics", rowId: topic.id, field: "title", message: "Tên chủ điểm không được để trống." });
    const foci = new Set<string>();
    for (const step of topic.steps) {
      if (!step.focus.trim()) add({ section: "grammarTopics", rowId: step.id, field: "focus", message: "Trọng tâm bước không được để trống." });
      if (!step.formula.trim()) add({ section: "grammarTopics", rowId: step.id, field: "formula", message: "Công thức không được để trống." });
      if (!step.usage.trim()) add({ section: "grammarTopics", rowId: step.id, field: "usage", message: "Cách dùng không được để trống." });
      const examples = step.examples.filter((example) => example.trim());
      if (examples.length < MIN_GRAMMAR_EXAMPLES || examples.length !== step.examples.length) add({ section: "grammarTopics", rowId: step.id, field: "examples", message: `Cần ít nhất ${MIN_GRAMMAR_EXAMPLES} ví dụ, không có dòng trống.` });
      const focus = step.focus.trim().toLocaleLowerCase("en-US");
      if (focus && foci.has(focus)) add({ section: "grammarTopics", rowId: step.id, field: "focus", message: "Các bước trong một chủ điểm phải có trọng tâm khác nhau." });
      foci.add(focus);
      if (monthlyDailyObjectivesMustBeEnglish(existing.cefr) && (step.dailyObjectives ?? []).some(isVietnameseMonthlyText)) {
        add({ section: "grammarTopics", rowId: step.id, field: "dailyObjectives", message: `Mục tiêu từng ngày ở ${existing.cefr} phải bằng tiếng Anh đơn giản, không dùng tiếng Việt.` });
      }
    }
  }

  // Pronunciation rows.
  const soundIpas = new Set<string>();
  const exampleWords = new Map<string, string>();
  for (const sound of input.sounds) {
    const ipa = sound.ipa.trim();
    if (!isValidMonthlyPronunciationIpaTarget(ipa)) add({ section: "sounds", rowId: sound.id, field: "ipa", message: "IPA mục tiêu phải là một ký hiệu trong dấu /…/, ví dụ /ɪ/." });
    else if (!isPronunciationTargetAllowedForLevel(existing.cefr, ipa)) add({ section: "sounds", rowId: sound.id, field: "ipa", message: `${ipa} không phù hợp trình độ ${existing.cefr}.` });
    const ipaKey = ipa.toLocaleLowerCase("en-US");
    if (ipaKey && soundIpas.has(ipaKey)) add({ section: "sounds", rowId: sound.id, field: "ipa", message: "4 mục tiêu phát âm phải khác nhau." });
    soundIpas.add(ipaKey);
    if (!sound.label.trim()) add({ section: "sounds", rowId: sound.id, field: "label", message: "Tên mục tiêu không được để trống." });
    if (sound.examples.length < MIN_PRONUNCIATION_EXAMPLES) add({ section: "sounds", rowId: sound.id, field: "examples", message: `Cần ít nhất ${MIN_PRONUNCIATION_EXAMPLES} từ ví dụ (hiện có ${sound.examples.length}).` });
    for (const example of sound.examples) {
      const word = example.word.trim();
      if (!word) add({ section: "sounds", rowId: example.id, field: "word", message: "Từ ví dụ không được để trống." });
      else if (syllableCount(word) > (monthlyPronunciationMaxSyllables(existing.cefr, { ipa }, word) ?? Infinity)) add({ section: "sounds", rowId: example.id, field: "word", message: "Từ ví dụ phát âm tối đa 3 âm tiết." });
      if (!example.ipa.trim()) add({ section: "sounds", rowId: example.id, field: "ipa", message: "IPA của từ ví dụ không được để trống." });
      else if (isValidMonthlyPronunciationIpaTarget(ipa) && monthlyPronunciationExampleIssue(existing.cefr, { ipa }, { word, ipa: example.ipa })) {
        add({ section: "sounds", rowId: example.id, field: "ipa", message: `IPA ${example.ipa.trim()} của "${word}" không chứa âm mục tiêu ${ipa}.` });
      }
      const key = normalizeWord(word);
      if (key && exampleWords.has(key)) add({ section: "sounds", rowId: example.id, field: "word", message: `"${word}" đã dùng làm ví dụ phát âm khác.` });
      if (key) exampleWords.set(key, example.id);
    }
  }

  if (issues.length) return { ok: false, issues, warnings };

  const supportById = new Map(existing.supportTerms.map((term) => [term.id, term]));
  const pool: MonthlyResourcePoolContract = {
    month: existing.month,
    cefr: existing.cefr,
    theme: existing.theme,
    version: existing.version,
    coreTerms: input.coreTerms.map((core) => {
      // The generator's CEFR label stays only while the word itself is unchanged.
      const previous = existing.coreTerms.find((term) => term.id === core.id);
      const cefr = previous?.cefr && previous.word.trim().toLocaleLowerCase("en-US") === core.word.trim().toLocaleLowerCase("en-US") ? previous.cefr : undefined;
      return { id: core.id, word: core.word.trim(), meaning: core.meaning.trim(), type: core.type.trim(), ipa: core.ipa.trim(), source: "core_registry" as const, component: "core" as const, ...(cefr ? { cefr } : {}) };
    }),
    supportTerms: input.supportTerms.map((support) => ({
      id: support.id,
      word: support.word.trim(),
      meaning: support.meaning.trim(),
      type: support.type.trim(),
      relation: support.relation,
      // Generated rows keep their provenance; anything the Operator added is manual.
      source: supportById.get(support.id)?.source ?? "manual",
      component: "expanded",
      relatedCoreTermId: support.relatedCoreTermId,
      ...(support.cefr ? { cefr: support.cefr } : {})
    })),
    grammarTopics: input.grammarTopics.map((topic) => ({
      id: topic.id,
      title: topic.title.trim(),
      steps: topic.steps.map((step) => ({ id: step.id, focus: step.focus.trim(), formula: step.formula.trim(), usage: step.usage.trim(), examples: step.examples.map((example) => example.trim()), ...(step.dailyObjectives ? { dailyObjectives: step.dailyObjectives.map(value => value.trim()) } : {}) })),
      // The roadmap topic is a locked plan field: an edit keeps the stored catalogId.
      ...(() => {
        const catalogId = existing.grammarTopics.find((item) => item.id === topic.id)?.catalogId;
        return catalogId ? { catalogId } : {};
      })()
    })),
    sounds: input.sounds.map((sound) => ({
      id: sound.id,
      ipa: sound.ipa.trim(),
      label: sound.label.trim(),
      examples: sound.examples.map((example) => ({ id: example.id, word: example.word.trim(), ipa: example.ipa.trim() })),
      ...(() => {
        const catalogId = findMonthlyPronunciationCatalogItem(existing.cefr, { ipa: sound.ipa })?.id;
        return catalogId ? { catalogId } : {};
      })()
    }))
  };

  // Final gate: the exact approval-time rules. Anything the row checks above did
  // not catch is reported as a pool issue, anchored to a row when the message names one.
  try {
    const planErrors = validateMonthlyCurriculum(planMonthlyResourcePool(pool));
    if (planErrors.length) return { ok: false, issues: planErrors.map(poolIssue), warnings };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, issues: splitDomainMessages(error.message).map(poolIssue), warnings };
    throw error;
  }
  return { ok: true, pool, warnings };
}

function poolIssue(message: string): MonthlyResourceEditIssue {
  const match = message.match(/^(Core term|Expanded term|Grammar topic|Pronunciation target|Sound) (\S+)/u);
  if (!match) return { section: "pool", message };
  const section = match[1] === "Core term" ? "coreTerms" : match[1] === "Expanded term" ? "supportTerms" : match[1] === "Grammar topic" ? "grammarTopics" : "sounds";
  return { section, rowId: match[2]!, message };
}

function splitDomainMessages(message: string): string[] {
  return message.split(/(?<=\.)\s+(?=[A-Z])/u).map((part) => part.trim()).filter(Boolean);
}

function relationLabel(relation: string): string {
  return relation === "umbrella" ? "bao trùm" : relation === "synonym" ? "đồng nghĩa" : relation === "word_family" ? "cùng họ từ" : relation;
}

function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function isSingleHeadword(value: string): boolean {
  return /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(value.trim());
}

function isNaturalPhrase(value: string): boolean {
  const words = value.trim().split(/\s+/u);
  return words.length >= 2 && words.length <= 4 && words.every(isSingleHeadword);
}

/** Vowel-group syllable estimate; mirrors the generator's pronunciation-example check. */
function syllableCount(word: string): number {
  const parts = word.toLocaleLowerCase("en").match(/[aeiouy]+/gu) ?? [];
  return Math.max(1, parts.length);
}
