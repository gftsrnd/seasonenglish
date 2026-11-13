import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CefrLevel, MonthFrameworkView, MonthlyResourceEditInput, MonthlyResourceEditIssue } from "@e4s/contracts";
import type { MonthlyIllustrationsView, MonthlyResourceCheckpointPrefillView } from "../../api/operator.js";
import { IllustrationTile, illustrationsEditable } from "./MonthlyIllustrationPanel.js";
import { operatorRegisterKindLabel, operatorRegisterNote } from "./register-terms.js";

type Resources = NonNullable<MonthFrameworkView["resources"]>;
type SupportRow = MonthlyResourceEditInput["supportTerms"][number];
type Relation = SupportRow["relation"];

const CORE_TYPES = ["noun", "verb", "adjective", "adverb"] as const;
const RELATIONS: Array<{ value: Relation; label: string }> = [
  { value: "umbrella", label: "Bao trùm" },
  { value: "synonym", label: "Đồng nghĩa" },
  { value: "word_family", label: "Cùng họ từ" },
  { value: "antonym", label: "Trái nghĩa" },
  { value: "collocation", label: "Kết hợp" }
];
const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

export interface MonthlyResourceEditorProps {
  cefr: CefrLevel;
  version: number;
  resources: Resources;
  busy?: boolean;
  onSave(input: MonthlyResourceEditInput): Promise<void>;
  onClose(): void;
  /** Set when the pool was prefilled from an unfinished AI generation checkpoint. */
  prefill?: MonthlyResourceCheckpointPrefillView;
  /** Core-word pictures of this draft; editable here until approval freezes them. */
  illustrations?: {
    view: MonthlyIllustrationsView;
    onGenerate(input: { words?: string[]; hint?: string }): Promise<void> | void;
    onUpload(word: string, file: File): Promise<void> | void;
    onRemove?(word: string): Promise<void> | void;
  };
}

/** Builds the editable copy of a draft pool; IDs are kept so the roadmap stays keyed. */
export function toMonthlyResourceEditInput(version: number, resources: Resources): MonthlyResourceEditInput {
  return {
    expectedVersion: version,
    coreTerms: resources.coreTerms.map(({ id, word, type, meaning, ipa }) => ({ id, word, type, meaning, ipa })),
    supportTerms: resources.supportTerms.map(({ id, word, meaning, type, relation, relatedCoreTermId, cefr }) => ({ id, word, meaning, type, relation, relatedCoreTermId: relatedCoreTermId ?? "", ...(cefr ? { cefr } : {}) })),
    grammarTopics: resources.grammarTopics.map((topic) => ({ id: topic.id, title: topic.title, steps: topic.steps.map((step) => ({ ...step, examples: [...step.examples] })) })),
    sounds: resources.sounds.map((sound) => ({ id: sound.id, ipa: sound.ipa, label: sound.label, examples: sound.examples.map((example) => ({ ...example })) }))
  };
}

const MIN_SUPPORTS = 3;
const MIN_GRAMMAR_EXAMPLES = 3;
const MIN_SOUND_EXAMPLES = 9;
type EditGrammarTopic = MonthlyResourceEditInput["grammarTopics"][number];
type EditSound = MonthlyResourceEditInput["sounds"][number];
/** A grammar topic still lacking a title, a step field or 3 examples per step. */
export function grammarTopicNeedsWork(topic: EditGrammarTopic): boolean {
  return !topic.title.trim() || topic.steps.some((step) => !step.focus.trim() || !step.formula.trim() || !step.usage.trim() || step.examples.filter((example) => example.trim()).length < MIN_GRAMMAR_EXAMPLES);
}
/** A pronunciation target still lacking its IPA, name or 9 example words. */
export function soundNeedsWork(sound: EditSound): boolean {
  return !sound.ipa.trim() || !sound.label.trim() || sound.examples.filter((example) => example.word.trim() && example.ipa.trim()).length < MIN_SOUND_EXAMPLES;
}
const NeedsWork = () => <em className="monthly-resource-editor-missing">Cần bổ sung</em>;

/**
 * Manual editor for a DRAFT monthly resource pool (VH-R30/VH-R35). The number
 * of core words is fixed (replace a word in its row); supports can be added or
 * removed per core. The server validates the whole pool and answers with
 * per-row issues that are shown on the matching line.
 */
export function MonthlyResourceEditor({ cefr, version, resources, busy = false, onSave, onClose, illustrations, prefill }: MonthlyResourceEditorProps) {
  const [draft, setDraft] = useState(() => toMonthlyResourceEditInput(version, resources));
  const [issues, setIssues] = useState<MonthlyResourceEditIssue[]>([]);
  // Large sections start folded; a section with save issues opens so its rows are visible.
  const [openSections, setOpenSections] = useState({ vocabulary: false, grammar: false, sounds: false });
  const toggleSection = (key: "vocabulary" | "grammar" | "sounds", open: boolean) => setOpenSections((current) => current[key] === open ? current : { ...current, [key]: open });
  useEffect(() => {
    if (!issues.length) return;
    setOpenSections((current) => ({
      vocabulary: current.vocabulary || issues.some((issue) => issue.section === "coreTerms" || issue.section === "supportTerms"),
      grammar: current.grammar || issues.some((issue) => issue.section === "grammarTopics"),
      sounds: current.sounds || issues.some((issue) => issue.section === "sounds")
    }));
  }, [issues]);
  const [failure, setFailure] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [openCores, setOpenCores] = useState<Set<string>>(() => new Set());
  const newId = useRef(0);
  const nextId = (prefix: string) => `${prefix}-m${Date.now().toString(36)}${(newId.current += 1)}`;

  const issuesByRow = useMemo(() => {
    const map = new Map<string, MonthlyResourceEditIssue[]>();
    for (const issue of issues) if (issue.rowId) map.set(issue.rowId, [...(map.get(issue.rowId) ?? []), issue]);
    return map;
  }, [issues]);
  const generalIssues = issues.filter((issue) => !issue.rowId);
  const supportsByCore = useMemo(() => {
    const map = new Map<string, SupportRow[]>();
    for (const support of draft.supportTerms) map.set(support.relatedCoreTermId, [...(map.get(support.relatedCoreTermId) ?? []), support]);
    return map;
  }, [draft.supportTerms]);
  const coresNeedingWork = draft.coreTerms.filter((core) => !core.word.trim() || (supportsByCore.get(core.id)?.length ?? 0) < MIN_SUPPORTS).length;
  const coreIssueCount = (coreId: string) => (issuesByRow.get(coreId)?.length ?? 0) + (supportsByCore.get(coreId) ?? []).reduce((count, support) => count + (issuesByRow.get(support.id)?.length ?? 0), 0);

  const updateCore = (id: string, patch: Partial<MonthlyResourceEditInput["coreTerms"][number]>) => setDraft((current) => ({ ...current, coreTerms: current.coreTerms.map((core) => core.id === id ? { ...core, ...patch } : core) }));
  const updateSupport = (id: string, patch: Partial<SupportRow>) => setDraft((current) => ({ ...current, supportTerms: current.supportTerms.map((support) => {
    if (support.id !== id) return support;
    const next = { ...support, ...patch };
    if (!next.cefr) delete next.cefr;
    return next;
  }) }));
  const removeSupport = (id: string) => setDraft((current) => ({ ...current, supportTerms: current.supportTerms.filter((support) => support.id !== id) }));
  const addSupport = (coreId: string) => setDraft((current) => ({ ...current, supportTerms: [...current.supportTerms, { id: nextId(`${cefr.toLowerCase()}-expanded`), word: "", meaning: "", type: "", relation: "synonym", relatedCoreTermId: coreId }] }));
  const updateTopic = (topicId: string, patch: { title?: string }) => setDraft((current) => ({ ...current, grammarTopics: current.grammarTopics.map((topic) => topic.id === topicId ? { ...topic, ...patch } : topic) }));
  const updateStep = (topicId: string, stepId: string, patch: Partial<MonthlyResourceEditInput["grammarTopics"][number]["steps"][number]>) => setDraft((current) => ({ ...current, grammarTopics: current.grammarTopics.map((topic) => topic.id !== topicId ? topic : { ...topic, steps: topic.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step) }) }));
  const updateSound = (soundId: string, patch: { ipa?: string; label?: string }) => setDraft((current) => ({ ...current, sounds: current.sounds.map((sound) => sound.id === soundId ? { ...sound, ...patch } : sound) }));
  const updateExample = (soundId: string, exampleId: string, patch: { word?: string; ipa?: string }) => setDraft((current) => ({ ...current, sounds: current.sounds.map((sound) => sound.id !== soundId ? sound : { ...sound, examples: sound.examples.map((example) => example.id === exampleId ? { ...example, ...patch } : example) }) }));
  const addExample = (soundId: string) => setDraft((current) => ({ ...current, sounds: current.sounds.map((sound) => sound.id !== soundId ? sound : { ...sound, examples: [...sound.examples, { id: nextId(`${soundId}-word`), word: "", ipa: "" }] }) }));
  const removeExample = (soundId: string, exampleId: string) => setDraft((current) => ({ ...current, sounds: current.sounds.map((sound) => sound.id !== soundId ? sound : { ...sound, examples: sound.examples.filter((example) => example.id !== exampleId) }) }));
  const toggleCore = (coreId: string, open: boolean) => setOpenCores((current) => {
    const next = new Set(current);
    if (open) next.add(coreId); else next.delete(coreId);
    return next;
  });

  const save = async () => {
    setSaving(true); setFailure(undefined);
    try {
      await onSave(draft);
      setIssues([]);
    } catch (reason) {
      const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: unknown }).details : undefined;
      const returned = details && typeof details === "object" && "issues" in details && Array.isArray((details as { issues?: unknown }).issues)
        ? (details as { issues: MonthlyResourceEditIssue[] }).issues
        : [];
      setIssues(returned);
      const code = reason instanceof Error ? reason.message : "";
      setFailure(returned.length
        ? `Chưa lưu: còn ${returned.length} lỗi cần sửa.`
        : code === "MONTHLY_FRAMEWORK_VERSION_CONFLICT" ? "Tài nguyên đã thay đổi ở nơi khác. Hãy đóng và mở lại trình sửa."
          : code === "MONTHLY_FRAMEWORK_IMMUTABLE" ? "Tài nguyên đã chốt; hãy yêu cầu Quản lý mở lại."
            : "Không lưu được tài nguyên. Hãy thử lại.");
      // Open every core that has a problem so its line is visible.
      setOpenCores((current) => {
        const next = new Set(current);
        for (const issue of returned) {
          if (issue.section === "coreTerms" && issue.rowId) next.add(issue.rowId);
          if (issue.section === "supportTerms" && issue.rowId) {
            const coreId = draft.supportTerms.find((support) => support.id === issue.rowId)?.relatedCoreTermId;
            if (coreId) next.add(coreId);
          }
        }
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  const rowErrors = (rowId: string) => issuesByRow.get(rowId)?.length
    ? <ul className="monthly-resource-editor-errors" role="alert">{issuesByRow.get(rowId)!.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
    : null;
  const invalid = (rowId: string, field: string) => issuesByRow.get(rowId)?.some((issue) => issue.field === field) ? true : undefined;
  const disabled = busy || saving;
  const imageEditable = illustrations ? illustrationsEditable(illustrations.view, disabled) : false;
  const illustrationFor = (coreId: string) => illustrations?.view.images.find((image) => image.coreTermId === coreId);

  return <div className="monthly-lesson-preview-backdrop" role="presentation">
    <section className="monthly-resource-editor card" role="dialog" aria-modal="true" aria-label={`Sửa tay tài nguyên ${cefr}`}>
      <header className="monthly-resource-editor-header">
        <div><span className="eyebrow">Bản nháp · {cefr}</span><h2>Sửa tay tài nguyên tháng</h2><p className="small muted">{draft.coreTerms.length} từ cốt lõi (cố định) · mỗi từ 3–9 từ mở rộng · 2 chủ điểm ngữ pháp · 4 mục tiêu phát âm.</p></div>
        <div className="monthly-resource-editor-actions">
          <button type="button" className="btn" disabled={saving} onClick={onClose}>Hủy</button>
          <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu bản nháp"}</button>
        </div>
      </header>
      {prefill && <p className="monthly-resource-editor-prefill" role="status">Đã nạp phần AI đã sinh: {[
        [prefill.categories.coreTerms, "từ cốt lõi"], [prefill.categories.expandedTerms, "từ mở rộng"], [prefill.categories.grammarTopics, "chủ điểm ngữ pháp"], [prefill.categories.pronunciationTargets, "mục tiêu phát âm"]
      ].filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`).join(", ")}. Chỉ cần bổ sung những mục đánh dấu “Cần bổ sung”, rồi bấm Lưu bản nháp.</p>}
      {failure && <div className="monthly-error" role="alert">{failure}{generalIssues.length > 0 && <ul>{generalIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}</div>}

      <details className="monthly-resource-editor-section" aria-label="Từ vựng" open={openSections.vocabulary} onToggle={(event) => toggleSection("vocabulary", event.currentTarget.open)}>
        <summary><h3>Từ cốt lõi &amp; từ mở rộng</h3><span className="small muted">{draft.coreTerms.length} từ cốt lõi · {draft.supportTerms.length} từ mở rộng</span>{coresNeedingWork > 0 && <><NeedsWork /><span className="small muted"> {coresNeedingWork} từ cốt lõi</span></>}</summary>
        {draft.coreTerms.map((core, index) => {
          const supports = supportsByCore.get(core.id) ?? [];
          const problems = coreIssueCount(core.id);
          // B1–C1 slang / poetic synonyms are AI-audited and read-only here; they stay while the core word is unchanged.
          const register = (resources.coreTerms.find((term) => term.id === core.id)?.registerTerms ?? []);
          const open = openCores.has(core.id);
          return <details key={core.id} className={`monthly-resource-editor-core${problems ? " has-errors" : ""}`} open={open} onToggle={(event) => toggleCore(core.id, (event.currentTarget as HTMLDetailsElement).open)}>
            <summary><i className="ui-chevron ui-chevron--right monthly-resource-editor-chevron" aria-hidden="true" /><b>{index + 1}.</b> <span className="monthly-resource-editor-word">{core.word || "(trống)"}</span><small className="monthly-resource-editor-type">{core.type}</small><small className="monthly-resource-editor-meaning">{core.meaning}</small>{register.length > 0 && <small className="monthly-resource-editor-register-count">{register.length} khẩu ngữ/văn chương</small>}<small className="monthly-resource-editor-count">{supports.length} từ mở rộng</small>{(!core.word.trim() || supports.length < MIN_SUPPORTS) && <NeedsWork />}{problems > 0 && <em>{problems} lỗi</em>}</summary>
            <div className="monthly-resource-editor-row core">
              <label>Từ<input aria-label={`Từ cốt lõi ${index + 1}`} aria-invalid={invalid(core.id, "word")} value={core.word} disabled={disabled} onChange={(event) => updateCore(core.id, { word: event.target.value })} /></label>
              <label>Từ loại<select aria-label={`Từ loại ${index + 1}`} aria-invalid={invalid(core.id, "type")} value={core.type} disabled={disabled} onChange={(event) => updateCore(core.id, { type: event.target.value })}>
                {!CORE_TYPES.includes(core.type as (typeof CORE_TYPES)[number]) && <option value={core.type}>{core.type || "—"}</option>}
                {CORE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select></label>
              <label>Nghĩa<input aria-label={`Nghĩa từ cốt lõi ${index + 1}`} aria-invalid={invalid(core.id, "meaning")} value={core.meaning} disabled={disabled} onChange={(event) => updateCore(core.id, { meaning: event.target.value })} /></label>
              <label>IPA<input aria-label={`IPA từ cốt lõi ${index + 1}`} aria-invalid={invalid(core.id, "ipa")} value={core.ipa} disabled={disabled} onChange={(event) => updateCore(core.id, { ipa: event.target.value })} /></label>
            </div>
            {rowErrors(core.id)}
            {open && register.length > 0 && <ul className="monthly-resource-editor-register" aria-label={`Khẩu ngữ và văn chương của ${core.word}`}>{register.map((term) => <li key={`${term.kind}-${term.word}`}><small>{operatorRegisterKindLabel(term)}</small> <b>{term.word}</b>{term.ipa ? <span className="muted"> {term.ipa}</span> : null}{term.definition ? <span className="muted"> — {term.definition}</span> : null}{operatorRegisterNote(term) ? <span className="muted"> · {term.kind === "slang" ? "Cách dùng" : "Xuất xứ"}: {operatorRegisterNote(term)}</span> : null}</li>)}</ul>}
            {open && illustrations && (() => {
              const image = illustrationFor(core.id);
              if (!image) return null;
              const renamed = core.word.trim().toLocaleLowerCase("en-US") !== image.word.trim().toLocaleLowerCase("en-US");
              return <div className="monthly-resource-editor-illustration">
                <IllustrationTile as="div" image={image} canEdit={imageEditable} canGenerate={illustrations.view.available} onGenerate={illustrations.onGenerate} onUpload={illustrations.onUpload} {...(illustrations.onRemove ? { onRemove: illustrations.onRemove } : {})} />
                <p className="small muted">{image.locked ? "Ảnh đã khóa cùng tài nguyên." : renamed ? `Ảnh đang gắn với từ đã lưu “${image.word}”. Lưu bản nháp rồi sinh lại hoặc tải ảnh cho từ mới.` : "Đổi ảnh được lưu ngay, không cần bấm Lưu bản nháp. Sau khi duyệt tài nguyên, ảnh sẽ bị khóa."}</p>
              </div>;
            })()}
            {open && <div className="monthly-resource-editor-supports" role="group" aria-label={`Từ mở rộng của ${core.word || `từ ${index + 1}`}`}>
              {supports.map((support, supportIndex) => <div key={support.id} className="monthly-resource-editor-support">
                <div className="monthly-resource-editor-row support">
                  <input aria-label={`Từ mở rộng ${supportIndex + 1} của ${core.word}`} aria-invalid={invalid(support.id, "word")} placeholder="Từ" value={support.word} disabled={disabled} onChange={(event) => updateSupport(support.id, { word: event.target.value })} />
                  <input aria-label={`Nghĩa từ mở rộng ${supportIndex + 1} của ${core.word}`} aria-invalid={invalid(support.id, "meaning")} placeholder="Nghĩa" value={support.meaning} disabled={disabled} onChange={(event) => updateSupport(support.id, { meaning: event.target.value })} />
                  <input aria-label={`Từ loại từ mở rộng ${supportIndex + 1} của ${core.word}`} aria-invalid={invalid(support.id, "type")} placeholder="Từ loại" value={support.type} disabled={disabled} onChange={(event) => updateSupport(support.id, { type: event.target.value })} />
                  <select aria-label={`Quan hệ từ mở rộng ${supportIndex + 1} của ${core.word}`} value={support.relation} disabled={disabled} onChange={(event) => updateSupport(support.id, { relation: event.target.value as Relation })}>{RELATIONS.map((relation) => <option key={relation.value} value={relation.value}>{relation.label}</option>)}</select>
                  <select aria-label={`CEFR từ mở rộng ${supportIndex + 1} của ${core.word}`} aria-invalid={invalid(support.id, "cefr")} value={support.cefr ?? ""} disabled={disabled} onChange={(event) => updateSupport(support.id, { cefr: (event.target.value || undefined) as CefrLevel | undefined })}><option value="">CEFR —</option>{LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select>
                  <button type="button" className="monthly-resource-editor-icon" aria-label={`Xóa từ mở rộng ${support.word || supportIndex + 1}`} title="Xóa" disabled={disabled} onClick={() => removeSupport(support.id)}><Trash2 aria-hidden="true" /></button>
                </div>
                {rowErrors(support.id)}
              </div>)}
              <button type="button" className="btn btn-sm" disabled={disabled || supports.length >= 9} onClick={() => addSupport(core.id)}><Plus aria-hidden="true" /> Thêm từ mở rộng</button>
            </div>}
          </details>;
        })}
      </details>

      <details className="monthly-resource-editor-section" aria-label="Ngữ pháp" open={openSections.grammar} onToggle={(event) => toggleSection("grammar", event.currentTarget.open)}>
        <summary><h3>Ngữ pháp</h3><span className="small muted">{draft.grammarTopics.length} chủ điểm · {draft.grammarTopics.reduce((total, topic) => total + topic.steps.length, 0)} bước</span>{draft.grammarTopics.some(grammarTopicNeedsWork) && <NeedsWork />}</summary>
        {draft.grammarTopics.map((topic, topicIndex) => <div key={topic.id} className="monthly-resource-editor-group">
          {grammarTopicNeedsWork(topic) && <NeedsWork />}
          <label>Chủ điểm {topicIndex + 1}<input aria-label={`Tên chủ điểm ${topicIndex + 1}`} aria-invalid={invalid(topic.id, "title")} value={topic.title} disabled={disabled} onChange={(event) => updateTopic(topic.id, { title: event.target.value })} /></label>
          {rowErrors(topic.id)}
          {topic.steps.map((step, stepIndex) => <div key={step.id} className="monthly-resource-editor-step">
            <span className="eyebrow">Bước {stepIndex + 1}</span>
            <div className="monthly-resource-editor-row grammar">
              <label>Trọng tâm<input aria-label={`Trọng tâm chủ điểm ${topicIndex + 1} bước ${stepIndex + 1}`} aria-invalid={invalid(step.id, "focus")} value={step.focus} disabled={disabled} onChange={(event) => updateStep(topic.id, step.id, { focus: event.target.value })} /></label>
              <label>Công thức<input aria-label={`Công thức chủ điểm ${topicIndex + 1} bước ${stepIndex + 1}`} aria-invalid={invalid(step.id, "formula")} value={step.formula} disabled={disabled} onChange={(event) => updateStep(topic.id, step.id, { formula: event.target.value })} /></label>
              <label>Cách dùng<textarea aria-label={`Cách dùng chủ điểm ${topicIndex + 1} bước ${stepIndex + 1}`} aria-invalid={invalid(step.id, "usage")} value={step.usage} disabled={disabled} onChange={(event) => updateStep(topic.id, step.id, { usage: event.target.value })} /></label>
              {[0, 1].map(offset => <label key={offset}>Mục tiêu ngày {stepIndex * 2 + offset + 1}<textarea aria-label={`Mục tiêu ngày ${stepIndex * 2 + offset + 1} chủ điểm ${topicIndex + 1}`} value={step.dailyObjectives?.[offset] ?? ""} disabled={disabled} onChange={event => { const objectives = [...(step.dailyObjectives ?? ["", ""])]; objectives[offset] = event.target.value; updateStep(topic.id, step.id, { dailyObjectives: objectives.some(Boolean) ? objectives : undefined }); }} /></label>)}
              <label>Ví dụ (mỗi dòng một câu)<textarea aria-label={`Ví dụ chủ điểm ${topicIndex + 1} bước ${stepIndex + 1}`} aria-invalid={invalid(step.id, "examples")} value={step.examples.join("\n")} disabled={disabled} onChange={(event) => updateStep(topic.id, step.id, { examples: event.target.value.split("\n") })} /></label>
            </div>
            {rowErrors(step.id)}
          </div>)}
        </div>)}
      </details>

      <details className="monthly-resource-editor-section" aria-label="Phát âm" open={openSections.sounds} onToggle={(event) => toggleSection("sounds", event.currentTarget.open)}>
        <summary><h3>Phát âm</h3><span className="small muted">{draft.sounds.length} âm · {draft.sounds.reduce((total, sound) => total + sound.examples.length, 0)} từ ví dụ</span>{draft.sounds.some(soundNeedsWork) && <NeedsWork />}</summary>
        {draft.sounds.map((sound, soundIndex) => <div key={sound.id} className="monthly-resource-editor-group">
          {soundNeedsWork(sound) && <NeedsWork />}
          <div className="monthly-resource-editor-row sound">
            <label>IPA mục tiêu {soundIndex + 1}<input aria-label={`IPA mục tiêu ${soundIndex + 1}`} aria-invalid={invalid(sound.id, "ipa")} value={sound.ipa} disabled={disabled} onChange={(event) => updateSound(sound.id, { ipa: event.target.value })} /></label>
            <label>Tên<input aria-label={`Tên mục tiêu ${soundIndex + 1}`} aria-invalid={invalid(sound.id, "label")} value={sound.label} disabled={disabled} onChange={(event) => updateSound(sound.id, { label: event.target.value })} /></label>
          </div>
          {rowErrors(sound.id)}
          <div className="monthly-resource-editor-examples">
            {sound.examples.map((example, exampleIndex) => <div key={example.id}>
              <div className="monthly-resource-editor-row example">
                <input aria-label={`Từ ví dụ ${exampleIndex + 1} của mục tiêu ${soundIndex + 1}`} aria-invalid={invalid(example.id, "word")} placeholder="Từ" value={example.word} disabled={disabled} onChange={(event) => updateExample(sound.id, example.id, { word: event.target.value })} />
                <input aria-label={`IPA từ ví dụ ${exampleIndex + 1} của mục tiêu ${soundIndex + 1}`} aria-invalid={invalid(example.id, "ipa")} placeholder="IPA" value={example.ipa} disabled={disabled} onChange={(event) => updateExample(sound.id, example.id, { ipa: event.target.value })} />
                <button type="button" className="monthly-resource-editor-icon" aria-label={`Xóa từ ví dụ ${example.word || exampleIndex + 1}`} title="Xóa" disabled={disabled} onClick={() => removeExample(sound.id, example.id)}><Trash2 aria-hidden="true" /></button>
              </div>
              {rowErrors(example.id)}
            </div>)}
          </div>
          <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => addExample(sound.id)}><Plus aria-hidden="true" /> Thêm từ ví dụ</button>
        </div>)}
      </details>
    </section>
  </div>;
}
