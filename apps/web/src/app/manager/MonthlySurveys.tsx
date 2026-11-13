import { useEffect, useState, type FormEvent } from "react";
import { LineField } from "../shared/LineField.js";
import {
  MONTHLY_SURVEY_LIMITS as limits,
  type ManagerMonthlySurveyView,
  type MonthlySurveyDefinition,
  type MonthlySurveyDraft,
  type MonthlySurveyQuestion
} from "@e4s/contracts";
import { monthlySurveyApi } from "../../api/monthly-surveys.js";
import { ApiError } from "../../api/runtime.js";
import { MonthlySurveyAnswers, MonthlySurveyFields, SurveyDate, monthlyRatingChoices, surveyMonthLabel } from "../shared/MonthlySurveyFields.js";
import { useModal } from "../shared/ModalProvider.js";
import { Badge, PageTitle } from "./shared.js";

const newQuestion: MonthlySurveyQuestion = { kind: "text", prompt: "", required: false };
const emptySurvey: MonthlySurveyDefinition = { title: "", questions: [newQuestion] };
const monthPattern = /^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/;

export function ManagerMonthlySurveys() {
  const modal = useModal();
  const [view, setView] = useState<ManagerMonthlySurveyView>();
  const [monthInput, setMonthInput] = useState("");
  const [query, setQuery] = useState<{ month?: string }>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<MonthlySurveyDefinition | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Partial<Record<number, string | number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    void monthlySurveyApi.getManager(query.month, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setView(result);
      setEditor(result.draft ? { title: result.draft.title, questions: result.draft.questions } : null);
      setMonthInput(result.month);
      setLoading(false);
    }, () => {
      if (controller.signal.aborted) return;
      setLoadError(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [query]);

  const draft = view?.draft;
  const published = view?.publishedForms[0];
  const dirty = editor !== null && (!draft || editor.title !== draft.title || JSON.stringify(editor.questions) !== JSON.stringify(draft.questions));

  function openEditor(source: MonthlySurveyDefinition) {
    setEditor({ title: source.title, questions: source.questions });
    setPreview(false);
    setPreviewAnswers({});
    setError("");
    setNotice("");
  }

  async function discardChanges() {
    return !dirty || modal.confirm({
      title: "Bỏ thay đổi chưa lưu?",
      message: "Các chỉnh sửa kể từ lần lưu gần nhất sẽ bị mất.",
      confirmLabel: "Bỏ thay đổi"
    });
  }

  async function loadMonth(month?: string) {
    if (!(await discardChanges())) return;
    setEditor(null);
    setPreview(false);
    setPreviewAnswers({});
    setError("");
    setNotice("");
    setLoading(true);
    setQuery(month ? { month } : {});
  }

  async function closeEditor() {
    if (!(await discardChanges())) return;
    setEditor(null);
    setPreview(false);
    setPreviewAnswers({});
    setError("");
  }

  async function runAction(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "";
      if (code === "MONTHLY_SURVEY_REVISION_CONFLICT") {
        setError("Khảo sát vừa được cập nhật. Hãy tải lại dữ liệu tháng trước khi chỉnh sửa.");
      } else if (code === "MONTHLY_SURVEY_DRAFT_INCOMPLETE") {
        setError("Điền tiêu đề và nội dung mọi câu hỏi. Mỗi câu một lựa chọn cần ít nhất hai phương án khác nhau.");
      } else {
        setError("Không lưu được thay đổi. Vui lòng thử lại.");
      }
    } finally {
      setBusy(false);
    }
  }

  function acceptDraft(saved: MonthlySurveyDraft) {
    setView(current => current && { ...current, draft: saved });
    setEditor({ title: saved.title, questions: saved.questions });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!view || !editor) return;
    void runAction(async () => {
      acceptDraft(await monthlySurveyApi.saveDraft(view.month, {
        ...editor,
        baseRevision: published?.revision ?? 0,
        version: draft?.version ?? null
      }));
    }, "Đã lưu bản nháp.");
  }

  function copyPrevious() {
    if (!view) return;
    void runAction(async () => {
      acceptDraft(await monthlySurveyApi.copyPrevious(view.month, published?.revision ?? 0));
    }, "Đã sao chép thành bản nháp cho tháng đang chọn.");
  }

  async function publishDraft() {
    if (!view || !draft || dirty || busy) return;
    const confirmed = await modal.confirm({
      title: "Công bố khảo sát?",
      message: view.month > view.currentMonth
        ? `Khảo sát sẽ hiện cho học viên từ ${surveyMonthLabel(view.month).toLowerCase()}. Câu trả lời cũ vẫn được giữ theo phiên bản đã gửi.`
        : "Học viên có thể trả lời sau khi công bố. Câu trả lời cũ vẫn được giữ theo phiên bản đã gửi.",
      confirmLabel: "Công bố"
    });
    if (!confirmed) return;
    await runAction(async () => {
      const form = await monthlySurveyApi.publish(view.month, draft.revision, draft.version);
      setView(current => current && { ...current, draft: null, publishedForms: [form, ...current.publishedForms] });
      setEditor(null);
      setPreview(false);
      setPreviewAnswers({});
    }, view.month > view.currentMonth ? `Đã công bố khảo sát. Học viên sẽ thấy từ ${surveyMonthLabel(view.month).toLowerCase()}.` : "Đã công bố khảo sát cho học viên.");
  }

  const changeEditor = (next: MonthlySurveyDefinition) => {
    setEditor(next);
    setPreviewAnswers({});
  };
  const previewForm = editor ?? draft ?? published;
  const onMonthSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (monthPattern.test(monthInput) && monthInput !== view?.month) void loadMonth(monthInput);
  };

  return <div className="manager-page monthly-surveys-page">
    <PageTitle description={<p className="muted">Soạn khảo sát và xem phản hồi.</p>}><h1>Khảo sát hằng tháng</h1></PageTitle>
    <form className="card monthly-survey-month-filter" onSubmit={onMonthSubmit}>
      <label className="monthly-survey-field"><span>Tháng khảo sát</span>
        <input type="month" value={monthInput} placeholder="YYYY-MM" required disabled={loading || busy} onChange={event => setMonthInput(event.target.value)} />
      </label>
      <button type="submit" className="btn" disabled={loading || busy || !monthPattern.test(monthInput) || monthInput === view?.month}>Xem tháng</button>
      {view ? <button type="button" className="btn" disabled={loading || busy} onClick={() => void loadMonth(view.month)}>Tải lại dữ liệu tháng</button> : null}
    </form>
    {notice ? <p className="card" role="status">{notice}</p> : null}
    {loadError ? <div className="card monthly-survey-stack" role="alert">
      <p>Chưa tải được khảo sát. Vui lòng thử lại.</p>
      <div className="row"><button type="button" className="btn-sm" onClick={() => void loadMonth(query.month)}>Thử lại</button></div>
    </div> : loading || !view ? <p className="card" role="status">Đang tải khảo sát…</p> : <>
      <section className="card monthly-survey-stack" aria-labelledby="manager-monthly-survey-editor">
        <div className="monthly-survey-heading"><h2 id="manager-monthly-survey-editor">Biểu mẫu · {surveyMonthLabel(view.month)}</h2></div>
        {published ? <p><Badge tone="ok">Đã công bố</Badge> <b>{published.title}</b> · Phiên bản {published.revision}</p> : <p className="muted">Tháng này chưa có khảo sát được công bố.</p>}
        {draft ? <p><Badge tone="warn">Bản nháp</Badge> Phiên bản {draft.revision}{draft.title ? ` · ${draft.title}` : ""}</p> : null}
        {editor ? <SurveyDraftEditor definition={editor} busy={busy} onChange={changeEditor} onSave={save} onClose={() => void closeEditor()} />
          : <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => openEditor(draft ?? published ?? emptySurvey)}>
              {draft ? "Chỉnh sửa bản nháp" : published ? "Tạo phiên bản mới" : "Tạo bản nháp"}
            </button>
            {!draft && view.previousPublishedMonth ? <button type="button" className="btn" disabled={busy} onClick={copyPrevious}>
              Sao chép khảo sát {surveyMonthLabel(view.previousPublishedMonth).toLowerCase()}
            </button> : null}
          </div>}
        {previewForm ? <div className="row monthly-survey-actions">
          <button type="button" className="btn" aria-expanded={preview} aria-controls="manager-monthly-survey-preview" disabled={busy} onClick={() => {
            setPreview(value => !value);
            setPreviewAnswers({});
          }}>{preview ? "Đóng xem trước" : "Xem trước biểu mẫu"}</button>
          {draft ? <button type="button" className="btn btn-primary" disabled={busy || dirty} onClick={() => void publishDraft()}>Công bố khảo sát</button> : null}
        </div> : null}
        {preview && previewForm ? <section id="manager-monthly-survey-preview" className="monthly-survey-question monthly-survey-stack">
          <h3>Xem trước</h3>
          <p className="small muted">Giao diện học viên · Câu trả lời thử không được lưu</p>
          <p><strong>{previewForm.title || "Khảo sát chưa có tiêu đề"}</strong></p>
          <MonthlySurveyFields questions={previewForm.questions} answers={previewAnswers} onAnswer={(index, value) => setPreviewAnswers(current => ({ ...current, [index]: value }))} />
          {dirty ? <p className="small muted">Lưu bản nháp để công bố nội dung đang xem.</p> : null}
        </section> : null}
        {error ? <p role="alert" className="monthly-survey-error">{error}</p> : null}
      </section>
      <SurveyResults view={view} />
    </>}
  </div>;
}

function SurveyDraftEditor({ definition, busy, onChange, onSave, onClose }: {
  definition: MonthlySurveyDefinition;
  busy: boolean;
  onChange: (value: MonthlySurveyDefinition) => void;
  onSave: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const { questions } = definition;
  const setQuestions = (next: MonthlySurveyQuestion[]) => onChange({ ...definition, questions: next });
  const updateQuestion = (index: number, next: MonthlySurveyQuestion) => {
    setQuestions(questions.map((item, currentIndex) => currentIndex === index ? next : item));
  };

  return <form className="monthly-survey-editor" onSubmit={onSave}>
    <fieldset className="monthly-survey-stack monthly-survey-fieldset" disabled={busy} aria-label="Soạn khảo sát">
      <label className="monthly-survey-field"><span>Tiêu đề khảo sát</span>
        <LineField value={definition.title} maxLength={limits.title} onChange={event => onChange({ ...definition, title: event.target.value })} />
      </label>
      {questions.map((question, index) => <fieldset className="monthly-survey-question monthly-survey-stack" key={index}>
        <legend>Câu hỏi {index + 1}</legend>
        <label className="monthly-survey-field"><span>Nội dung câu hỏi</span>
          <LineField value={question.prompt} maxLength={limits.prompt} onChange={event => updateQuestion(index, { ...question, prompt: event.target.value })} />
        </label>
        <label className="monthly-survey-field"><span>Loại câu hỏi</span>
          <select value={question.kind} onChange={event => {
            const kind = event.target.value as MonthlySurveyQuestion["kind"];
            const fields = { prompt: question.prompt, required: question.required };
            updateQuestion(index, kind === "single_choice" ? { ...fields, kind, options: ["", ""] } : { ...fields, kind });
          }}>
            <option value="text">Văn bản</option>
            <option value="rating">Đánh giá 1–{limits.ratingMax}</option>
            <option value="single_choice">Một lựa chọn</option>
          </select>
        </label>
        {question.kind === "single_choice" ? <>
          {question.options.map((option, optionIndex) => <div key={optionIndex} className="monthly-survey-option">
            <label className="monthly-survey-field"><span>Lựa chọn {optionIndex + 1}</span>
              <LineField value={option} maxLength={limits.option} onChange={event => updateQuestion(index, {
                ...question, options: question.options.map((item, i) => i === optionIndex ? event.target.value : item)
              })} />
            </label>
            <button className="btn-sm" type="button" aria-label={`Xoá lựa chọn ${optionIndex + 1} của câu hỏi ${index + 1}`} onClick={() => updateQuestion(index, {
              ...question, options: question.options.filter((_item, i) => i !== optionIndex)
            })}>Xoá</button>
          </div>)}
          <div className="row"><button type="button" className="btn-sm" disabled={question.options.length >= limits.options} onClick={() => updateQuestion(index, {
            ...question, options: [...question.options, ""]
          })}>Thêm lựa chọn</button></div>
        </> : null}
        <div className="row between">
          <label className="row"><input type="checkbox" checked={question.required} onChange={event => updateQuestion(index, { ...question, required: event.target.checked })} />Bắt buộc</label>
          <button type="button" className="btn-sm" aria-label={`Xoá câu hỏi ${index + 1}`} onClick={() => setQuestions(questions.filter((_question, i) => i !== index))}>Xoá câu hỏi</button>
        </div>
      </fieldset>)}
      <div className="form-actions">
        <button type="button" className="btn" disabled={questions.length >= limits.questions} onClick={() => setQuestions([...questions, newQuestion])}>Thêm câu hỏi</button>
        <button type="button" className="btn" onClick={onClose}>Đóng soạn thảo</button>
        <button type="submit" className="btn btn-primary">{busy ? "Đang lưu…" : "Lưu bản nháp"}</button>
      </div>
    </fieldset>
  </form>;
}

function SurveyResults({ view }: { view: ManagerMonthlySurveyView }) {
  const formsByRevision = new Map(view.publishedForms.map(form => [form.revision, form]));
  return <section className="card monthly-survey-stack" aria-labelledby="manager-monthly-survey-results">
    <h2 id="manager-monthly-survey-results">Kết quả · {surveyMonthLabel(view.month)}</h2>
    <p><strong>{view.submissions.length}</strong> phản hồi</p>
    {view.publishedForms.map(form => {
      const responses = view.submissions.filter(submission => submission.revision === form.revision);
      return <details className="monthly-survey-details" key={form.revision}>
        <summary><strong>Phiên bản {form.revision}</strong> · {responses.length} phản hồi</summary>
        <ol className="monthly-survey-results-list">
          {form.questions.map((question, index) => {
            const values = responses.flatMap(response => response.answers.filter(answer => answer.questionIndex === index).map(answer => answer.value));
            const choices = question.kind === "rating" ? monthlyRatingChoices : question.kind === "single_choice" ? question.options : [];
            return <li key={index}>
              <strong>{question.prompt}</strong> · {values.length} lượt trả lời
              {choices.length > 0 ? <ul>{choices.map(choice => <li key={choice}>{choice}{typeof choice === "number" ? " điểm" : ""} · {values.filter(value => value === choice).length}</li>)}</ul> : null}
            </li>;
          })}
        </ol>
      </details>;
    })}
    {view.submissions.length > 0 ? <h3>Từng phản hồi</h3> : null}
    {view.submissions.map(submission => {
      const form = formsByRevision.get(submission.revision);
      return <details className="monthly-survey-details" key={submission.learnerId}>
        <summary>
          <strong>{submission.learnerName}</strong> · Phiên bản {submission.revision}
          <span className="small muted"><SurveyDate value={submission.submittedAt} /></span>
        </summary>
        {form ? <MonthlySurveyAnswers questions={form.questions} answers={submission.answers} /> : null}
      </details>;
    })}
  </section>;
}
