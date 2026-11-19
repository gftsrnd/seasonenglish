import { useEffect, useState, type FormEvent } from "react";
import type { LearnerMonthlySurveysView, MonthlySurveyPublished, MonthlySurveySubmission } from "@e4s/contracts";
import { monthlySurveyApi } from "../../api/monthly-surveys.js";
import { ApiError } from "../../api/runtime.js";
import { MonthlySurveyFields, surveyMonthLabel } from "../shared/MonthlySurveyFields.js";

export function useLearnerMonthlySurveys() {
  const [view, setView] = useState<LearnerMonthlySurveysView>();
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    void monthlySurveyApi.getLearner(controller.signal).then(
      result => { if (!controller.signal.aborted) setView(result); },
      () => { if (!controller.signal.aborted) setLoadError(true); }
    );
    return () => controller.abort();
  }, [reload]);

  function recordSubmission(month: string, submission: MonthlySurveySubmission) {
    setView(current => current && ({
      ...current,
      surveys: current.surveys.map(item => item.form.month === month ? { ...item, submission } : item)
    }));
    setNotice("Đã gửi phản hồi. Cảm ơn bạn!");
  }

  async function refreshAfterConflict(month: string) {
    const next = await monthlySurveyApi.getLearner();
    setView(next);
    if (next.surveys.some(item => item.form.month === month && item.submission)) {
      setNotice("Bạn đã gửi phản hồi cho tháng này. Xem câu trả lời trong lịch sử.");
    } else {
      setNotice("Khảo sát vừa được cập nhật. Vui lòng xem lại các câu hỏi trước khi gửi.");
    }
  }

  const available = view?.surveys.filter(item => item.submission === null && item.form.month <= view.currentMonth) ?? [];
  const submitted = view?.surveys.flatMap(item => item.submission ? [{ form: item.form, submission: item.submission }] : []) ?? [];
  return { available, submitted, view, loadError, notice, recordSubmission, refreshAfterConflict, retry: () => setReload(value => value + 1) };
}

export function LearnerMonthlySurveys({ surveys, month }: { surveys: ReturnType<typeof useLearnerMonthlySurveys>; month?: string | null }) {
  const { available, view, loadError, notice, recordSubmission, refreshAfterConflict, retry } = surveys;
  const [selectedMonth, setSelectedMonth] = useState(month ?? "");
  const form = (available.find(item => item.form.month === selectedMonth)
    ?? available.find(item => item.form.month === view?.currentMonth) ?? available[0])?.form;


  return <div className="monthly-survey-stack">
    {notice ? <p className="banner" role="status">{notice}</p> : null}
    {loadError ? <div className="card" role="alert">
      <p>Chưa tải được khảo sát.</p>
      <button type="button" className="btn" onClick={retry}>Thử lại</button>
    </div> : !view ? <p className="card" role="status">Đang tải khảo sát…</p> : <>
      {/* No open survey: the card is hidden (owner 19/11); history below says what was sent. */}
      {form ? <section className="card monthly-survey-stack" aria-labelledby="monthly-survey-open">
        <div className="monthly-survey-heading">
          <div>
            <div className="eyebrow">{surveyMonthLabel(form.month)}</div>
            <h2 id="monthly-survey-open">{form.title}</h2>
          </div>
          {available.length > 1 ? <label>Tháng khảo sát <select value={form.month} onChange={event => setSelectedMonth(event.target.value)}>
            {available.map(item => <option value={item.form.month} key={item.form.month}>{surveyMonthLabel(item.form.month)}</option>)}
          </select></label> : null}
        </div>
        <LearnerSurveyForm key={`${form.month}-${form.revision}`} form={form} onSubmitted={recordSubmission} onConflict={refreshAfterConflict} />
      </section> : null}

    </>}
  </div>;
}

function LearnerSurveyForm({ form, onSubmitted, onConflict }: {
  form: MonthlySurveyPublished;
  onSubmitted: (month: string, submission: MonthlySurveySubmission) => void;
  onConflict: (month: string) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Partial<Record<number, string | number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const values = form.questions.flatMap((_question, questionIndex) => {
      const value = answers[questionIndex];
      const cleaned = typeof value === "string" ? value.trim() : value;
      return cleaned === undefined || cleaned === "" ? [] : [{ questionIndex, value: cleaned }];
    });
    if (form.questions.some((question, index) => question.required && !values.some(value => value.questionIndex === index))) {
      setError("Vui lòng trả lời tất cả câu hỏi bắt buộc.");
      return;
    }
    setBusy(true);
    try {
      const submission = await monthlySurveyApi.submit(form.month, { revision: form.revision, answers: values });
      onSubmitted(form.month, submission);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try { await onConflict(form.month); }
        catch { setError("Chưa tải lại được khảo sát. Vui lòng thử lại."); }
      } else {
        setError("Chưa gửi được phản hồi. Kiểm tra câu trả lời rồi thử lại.");
      }
    } finally {
      setBusy(false);
    }
  }

  return <form className="monthly-survey-stack monthly-survey-form" noValidate onSubmit={submit}>
    <fieldset className="monthly-survey-fieldset monthly-survey-stack" disabled={busy}>
      <MonthlySurveyFields questions={form.questions} answers={answers} onAnswer={(index, value) => setAnswers(current => ({ ...current, [index]: value }))} />
      {error ? <p role="alert" className="monthly-survey-error">{error}</p> : null}
      <div className="form-actions"><button type="submit" className="btn btn-primary">{busy ? "Đang gửi…" : "Gửi phản hồi"}</button></div>
    </fieldset>
  </form>;
}
