import { Plus, X } from "lucide-react";
import type { CefrLevel } from "@e4s/contracts";
import { monthlyPronunciationLessonRule, monthlyPronunciationRuleCopy } from "@e4s/domain/monthly";
import { Field, LineField } from "./LessonEditorFields.js";
import "./lesson-editor-points.css";

/**
 * Monthly "Sửa tay" pronunciation: the same structure the lesson view renders.
 *
 * - `pronunciation.reviewTargets` with at least one usable sound (focus + words) → one block per sound:
 *   `focus` and `words: [{ word, ipa }]`. The top-level focus/words (the first sound's three words) are then
 *   not shown by the view and are kept as stored.
 * - otherwise → one block from the top-level `focus` and `words` (strings or { word, ipa }).
 * - The guidance line (`instruction`, or legacy `tip`) belongs to the first sound; the read-aloud `passage`
 *   is shared by every sound.
 * - B1–C1 rule, "How to remember", "Common mistake" and the rule formula come from the level's pronunciation
 *   catalog at render time (monthlyPronunciationLessonRule), not from the lesson, so they are shown read-only.
 *
 * Saving writes back only what changed, into the field it was read from; every other stored field is kept.
 */
export type PronunciationWordDraft = { word: string; ipa: string; /** Index in the stored word list, -1 for a new row. */ source: number };
export type PronunciationSoundDraft = { focus: string; words: PronunciationWordDraft[] };
export type PronunciationDraft = {
  mode: "targets" | "single";
  sounds: PronunciationSoundDraft[];
  /** Raw index in reviewTargets of each sound (targets mode). */
  targetIndexes: number[];
  instruction: string;
  passage: string;
  /** The day has a read-aloud passage (stored, or required by its target positions). */
  hasPassage: boolean;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const rawList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const wordOf = (value: unknown) => typeof value === "string" ? value : text(record(value).word ?? record(value).w);
const ipaOf = (value: unknown) => typeof value === "string" ? "" : text(record(value).ipa);
const usableWord = (value: unknown) => Boolean(wordOf(value).trim());

function readWords(value: unknown, minimum: number): PronunciationWordDraft[] {
  const words = rawList(value).flatMap((item, index) => typeof item === "string" || (item && typeof item === "object" && !Array.isArray(item)) ? [{ word: wordOf(item), ipa: ipaOf(item), source: index }] : []);
  while (words.length < minimum) words.push({ word: "", ipa: "", source: -1 });
  return words;
}

/** Sounds the view renders: a review target with a focus and at least one word. */
function viewTargets(content: Record<string, unknown>): number[] {
  return rawList(content.reviewTargets).flatMap((target, index) => {
    const item = record(target);
    return text(item.focus).trim() && rawList(item.words).some(usableWord) ? [index] : [];
  });
}

const instructionKey = (content: Record<string, unknown>) => text(content.instruction) || !text(content.tip) ? "instruction" : "tip";

export function readPronunciationDraft(content: Record<string, unknown>): PronunciationDraft {
  const targetIndexes = viewTargets(content);
  const targets = rawList(content.reviewTargets);
  const sounds = targetIndexes.length
    ? targetIndexes.map(index => { const target = record(targets[index]); return { focus: text(target.focus), words: readWords(target.words, 1) }; })
    : [{ focus: text(content.focus), words: readWords(content.words, 3) }];
  return {
    mode: targetIndexes.length ? "targets" : "single",
    sounds,
    targetIndexes,
    instruction: text(content[instructionKey(content)]),
    passage: text(content.passage),
    hasPassage: typeof content.passage === "string" || Array.isArray(content.targetPositions)
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A stored word with the edited text: plain strings stay strings, records keep their other fields (audio …). */
function writeWord(stored: unknown, row: PronunciationWordDraft, before: PronunciationWordDraft | undefined): unknown {
  if (before && same({ ...row }, { ...before }) && stored !== undefined) return stored;
  const word = row.word.trim(), ipa = row.ipa.trim();
  if (typeof stored === "string" || stored === undefined) return ipa ? { word, ipa } : word;
  const { ipa: _ipa, ...rest } = record(stored);
  return { ...rest, word, ...(ipa ? { ipa } : {}) };
}

function writeWords(storedWords: unknown, rows: PronunciationWordDraft[], beforeRows: PronunciationWordDraft[]): unknown[] {
  const stored = rawList(storedWords);
  const beforeBySource = new Map(beforeRows.filter(row => row.source >= 0).map(row => [row.source, row]));
  return rows.filter(row => row.word.trim()).map(row => writeWord(row.source >= 0 ? stored[row.source] : undefined, row, beforeBySource.get(row.source)));
}

export function writePronunciationDraft(content: Record<string, unknown>, draft: PronunciationDraft): Record<string, unknown> {
  const before = readPronunciationDraft(content);
  if (same(draft, before)) return content;
  const next: Record<string, unknown> = { ...content };
  if (draft.instruction !== before.instruction) next[instructionKey(content)] = draft.instruction.trim();
  if (draft.passage !== before.passage) next.passage = draft.passage.trim();
  if (draft.mode === "single") {
    const sound = draft.sounds[0]!, old = before.sounds[0]!;
    if (sound.focus !== old.focus) next.focus = sound.focus.trim();
    if (!same(sound.words, old.words)) {
      next.words = writeWords(content.words, sound.words, old.words);
      // Per-word audio stays with its word.
      if ("wordAudioUrls" in content) { const audio = rawList(content.wordAudioUrls); next.wordAudioUrls = sound.words.filter(row => row.word.trim()).map(row => row.source >= 0 ? audio[row.source] ?? "" : ""); }
    }
    return next;
  }
  const targets = [...rawList(content.reviewTargets)];
  draft.targetIndexes.forEach((index, at) => {
    const sound = draft.sounds[at]!, old = before.sounds[at]!;
    if (same(sound, old)) return;
    const target = record(targets[index]);
    targets[index] = { ...target, ...(sound.focus !== old.focus ? { focus: sound.focus.trim() } : {}), ...(!same(sound.words, old.words) ? { words: writeWords(target.words, sound.words, old.words) } : {}) };
  });
  next.reviewTargets = targets;
  // The view shows the pronunciation block only when the part has a focus.
  if (!text(content.focus).trim() && draft.sounds[0]?.focus.trim()) next.focus = draft.sounds[0].focus.trim();
  return next;
}

/** Vietnamese problems for the save check (prefixed "Phát âm" so the editor opens the Phát âm section). */
export function validatePronunciationDraft(draft: PronunciationDraft): string[] {
  const words = (sound: PronunciationSoundDraft) => sound.words.filter(row => row.word.trim()).length;
  if (!draft.sounds.some(sound => sound.focus.trim() || words(sound)) && !draft.instruction.trim()) return ["thiếu phần Phát âm"];
  if (draft.mode === "single") {
    const sound = draft.sounds[0]!;
    return [...(!sound.focus.trim() ? ["Phát âm: thiếu âm mục tiêu"] : []), ...(words(sound) < 3 ? ["Phát âm: cần đủ 3 từ luyện"] : [])];
  }
  return draft.sounds.flatMap((sound, index) => [
    ...(!sound.focus.trim() ? [`Phát âm – âm ${index + 1}: thiếu âm mục tiêu`] : []),
    ...(!words(sound) ? [`Phát âm – âm ${index + 1}: cần ít nhất 1 từ luyện`] : [])
  ]);
}

const replace = <T,>(list: readonly T[], index: number, value: T): T[] => list.map((item, at) => at === index ? value : item);
const advanced = (cefr: string): cefr is "B1" | "B2" | "C1" => cefr === "B1" || cefr === "B2" || cefr === "C1";

export function PronunciationSoundsEditor({ draft, onChange, cefr, catalogId }: { draft: PronunciationDraft; onChange(next: PronunciationDraft): void; cefr: string; /** Stored catalog item of a single-sound lesson. */ catalogId?: string | undefined }) {
  const many = draft.sounds.length > 1;
  const setSound = (index: number, sound: PronunciationSoundDraft) => onChange({ ...draft, sounds: replace(draft.sounds, index, sound) });
  return <div className="operator-lesson-points">
    {draft.sounds.map((sound, index) => {
      const name = many ? `Âm ${index + 1}` : "Âm";
      // B1–C1: the rule block the view shows, from the level catalog (English for B1+ learners).
      const found = advanced(cefr) && sound.focus.trim() ? monthlyPronunciationLessonRule(cefr as CefrLevel, { focus: sound.focus.trim(), ...(draft.mode === "single" && catalogId ? { catalogId } : {}) }) : undefined;
      const rule = found ? monthlyPronunciationRuleCopy(found, "en") : undefined;
      const shownWords = sound.words.filter(row => row.word.trim()).length;
      return <section className="operator-lesson-point" role="group" aria-label={many ? `Âm luyện ${index + 1}` : "Âm luyện"} data-pronunciation-sound={index + 1} key={index}>
        <header className="operator-lesson-point-head"><b>{many ? `Âm ${index + 1}/${draft.sounds.length}` : "Âm luyện"}</b></header>
        <Field label="Âm mục tiêu (IPA)"><LineField aria-label={many ? `Âm mục tiêu ${index + 1}` : "Âm mục tiêu"} value={sound.focus} placeholder="/θ/" onChange={event => setSound(index, { ...sound, focus: event.target.value })} /></Field>
        {rule ? <div className="operator-lesson-rule" role="note" aria-label={`Quy tắc ${name.toLowerCase()}`}>
          <p>{rule.rule}</p>
          <p><b>{rule.rememberLabel}:</b> {rule.remember}</p>
          <p><b>{rule.mistakeLabel}:</b> {rule.mistake}</p>
          {rule.core ? <p className="operator-lesson-rule-band"><b>{rule.core.pattern} → {rule.core.result}</b></p> : null}
          <small className="xs muted">Quy tắc lấy từ danh mục phát âm của cấp độ theo âm mục tiêu; không sửa trong bài.</small>
        </div> : null}
        {index === 0 && (!rule || draft.instruction.trim()) ? <Field label="Hướng dẫn phát âm" hint={rule ? "Học viên B1+ thấy quy tắc ở trên thay cho dòng này." : "Dòng hướng dẫn dưới âm đầu tiên."}><textarea aria-label="Mẹo phát âm" rows={2} value={draft.instruction} onChange={event => onChange({ ...draft, instruction: event.target.value })} /></Field> : null}
        <div className="field" role="group" aria-label={`Từ luyện ${name.toLowerCase()}`}>
          <span>Từ luyện và phiên âm</span>
          <div className="operator-lesson-point-list">{sound.words.map((row, at) => {
            const label = many ? `Âm ${index + 1} – từ ${at + 1}` : `Từ luyện âm ${at + 1}`;
            return <div className="operator-lesson-point-row operator-lesson-point-row--word" key={at}>
              <LineField aria-label={label} value={row.word} placeholder={`Từ ${at + 1}`} onChange={event => setSound(index, { ...sound, words: replace(sound.words, at, { ...row, word: event.target.value }) })} />
              <LineField aria-label={`Phiên âm ${label.charAt(0).toLowerCase()}${label.slice(1)}`} value={row.ipa} placeholder="/…/" onChange={event => setSound(index, { ...sound, words: replace(sound.words, at, { ...row, ipa: event.target.value }) })} />
              <button type="button" className="btn-sm operator-lesson-icon-button" aria-label={`Xoá ${label.charAt(0).toLowerCase()}${label.slice(1)}`} title="Xoá từ" onClick={() => setSound(index, { ...sound, words: sound.words.filter((_, i) => i !== at) })}><X size={15} aria-hidden="true" /></button>
            </div>;
          })}</div>
          {draft.mode === "single" && shownWords > 3 ? <small className="xs muted">Học viên thấy 3 từ đầu.</small> : null}
          <button type="button" className="btn-sm operator-lesson-add-button" onClick={() => setSound(index, { ...sound, words: [...sound.words, { word: "", ipa: "", source: -1 }] })}><Plus size={15} aria-hidden="true" />Thêm từ</button>
        </div>
      </section>;
    })}
    {draft.hasPassage ? <Field label="Đoạn đọc luyện âm" hint="Đoạn đọc chung cho các âm, hiện sau các âm. Phải chứa đủ các vị trí âm đã phân bổ cho ngày này; từ in đậm lấy theo kế hoạch."><textarea aria-label="Đoạn đọc luyện âm" rows={3} value={draft.passage} onChange={event => onChange({ ...draft, passage: event.target.value })} /></Field> : null}
  </div>;
}
