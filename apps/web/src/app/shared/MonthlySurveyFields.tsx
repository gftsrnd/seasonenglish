import { useId, useState, type PointerEvent, type ReactNode } from "react";
import { Star } from "lucide-react";
import { MONTHLY_SURVEY_LIMITS as limits, type MonthlySurveyAnswer, type MonthlySurveyQuestion } from "@e4s/contracts";
import "./monthly-surveys.css";

const submittedDateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
export const monthlyRatingChoices = Array.from({ length: limits.ratingMax }, (_, index) => index + 1);

export function surveyMonthLabel(month: string) {
  const [year, monthOfYear] = month.split("-");
  return `Tháng ${monthOfYear}/${year}`;
}

export function SurveyDate({ value }: { value: string }) {
  return <time dateTime={value}>{submittedDateFormat.format(new Date(value))}</time>;
}

type SurveyFieldsProps = {
  questions: MonthlySurveyQuestion[];
  answers: Partial<Record<number, string | number>>;
  onAnswer: (index: number, value: string | number) => void;
};

export function MonthlySurveyFields({ questions, answers, onAnswer }: SurveyFieldsProps) {
  const prefix = useId();
  return <div className="monthly-survey-stack">
    {questions.map((question, index) => {
      const id = `${prefix}-${index}`;
      const label = <>{index + 1}. {question.prompt || "Chưa có nội dung"}{question.required ? <span className="small muted"> · Bắt buộc</span> : null}</>;
      const value = answers[index];
      if (question.kind === "text") return <label key={id} className="monthly-survey-field" htmlFor={id}>
        <span>{label}</span>
        <textarea id={id} rows={3} maxLength={limits.answer} required={question.required} value={value ?? ""} onChange={event => onAnswer(index, event.target.value)} />
      </label>;
      if (question.kind === "single_choice") return <label key={id} className="monthly-survey-field" htmlFor={id}>
        <span>{label}</span>
        <select id={id} value={value ?? ""} required={question.required} onChange={event => onAnswer(index, event.target.value)}>
          <option value="">Chọn một phương án</option>
          {question.options.filter(Boolean).map((option, optionIndex) => <option key={optionIndex} value={option}>{option}</option>)}
        </select>
      </label>;
      return <MonthlyRating key={id} id={id} label={label} required={question.required}
        value={typeof value === "number" ? value : undefined} onAnswer={rating => onAnswer(index, rating)} />;
    })}
  </div>;
}

function MonthlyRating({ id, label, required, value, onAnswer }: {
  id: string;
  label: ReactNode;
  required: boolean;
  value: number | undefined;
  onAnswer: (value: number | "") => void;
}) {
  const [preview, setPreview] = useState<number>();
  const current = preview ?? value ?? 0;

  function ratingAt(event: PointerEvent<HTMLDivElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const rating = Math.floor((event.clientX - left) / width * monthlyRatingChoices.length) + 1;
    return Math.max(1, Math.min(monthlyRatingChoices.length, rating));
  }

  return <fieldset className="monthly-survey-rating">
    <legend>{label}</legend>
    <div className="monthly-survey-stars"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || !event.currentTarget.setPointerCapture || event.currentTarget.querySelector("input:disabled")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPreview(ratingAt(event));
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) setPreview(ratingAt(event));
      }}
      onPointerUp={event => {
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
        const rating = ratingAt(event);
        onAnswer(rating);
        setPreview(undefined);
        event.currentTarget.querySelector<HTMLInputElement>('input[value="' + rating + '"]')?.focus({ preventScroll: true });
      }}
      onLostPointerCapture={() => setPreview(undefined)}>
      {monthlyRatingChoices.map(rating => <label key={rating} data-filled={rating <= current} title={rating + " sao"}>
        <input type="radio" name={id} value={rating} aria-label={rating + " sao"} checked={value === rating}
          required={required} onChange={() => onAnswer(rating)} />
        <Star size={34} strokeWidth={1.7} aria-hidden="true" />
      </label>)}
    </div>
    {!required && value !== undefined ? <div className="form-actions">
      <button type="button" className="btn-sm" onClick={() => onAnswer("")}>Bỏ chọn</button>
    </div> : null}
  </fieldset>;
}

export function MonthlySurveyAnswers({ questions, answers }: { questions: MonthlySurveyQuestion[]; answers: MonthlySurveyAnswer[] }) {
  const byIndex = new Map(answers.map(answer => [answer.questionIndex, answer.value]));
  return <dl className="monthly-survey-answers">
    {questions.map((question, index) => {
      const value = byIndex.get(index);
      return <div key={index}>
        <dt>{index + 1}. {question.prompt}</dt>
        <dd>{value === undefined ? <span className="muted">Không trả lời</span> : question.kind === "rating" ? `${value}/${limits.ratingMax}` : value}</dd>
      </div>;
    })}
  </dl>;
}
