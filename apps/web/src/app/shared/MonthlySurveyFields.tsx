import { useId } from "react";
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
      return <fieldset className="monthly-survey-rating" key={id}>
        <legend>{label}</legend>
        <div className="row">
          {monthlyRatingChoices.map(rating => <label key={rating}>
            <input type="radio" name={id} value={rating} checked={value === rating} required={question.required} onChange={() => onAnswer(index, rating)} />
            <span>{rating}</span>
          </label>)}
          {!question.required && value !== undefined && value !== "" ? <button type="button" className="btn-sm" onClick={() => onAnswer(index, "")}>Bỏ chọn</button> : null}
        </div>
      </fieldset>;
    })}
  </div>;
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
