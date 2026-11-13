import { useState } from "react";
/** Same match rule as the server's lesson checks: case, repeated spaces and typographic apostrophes do not make a right answer wrong. */
const choiceKey = (value: string) => value.normalize("NFKC").replace(/[‘’ʼ]/gu, "'").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
export function DailyGrammarPractice({ value, language }: { value: unknown; language: "vi" | "en" }) {
  const [answers, setAnswers] = useState<Record<number,string>>({});
  const rows = Array.isArray(value) ? value.filter((raw): raw is Record<string,unknown> => !!raw && typeof raw === "object" && typeof raw.prompt === "string" && Array.isArray(raw.options) && typeof raw.answer === "string") : [];
  if (!rows.length) return null;
  return <section className="lesson-daily-grammar-practice" aria-label={language === "en" ? "Grammar practice" : "Luyện ngữ pháp"}><h3>{language === "en" ? "Practise today's grammar" : "Luyện ngữ pháp hôm nay"}</h3>{rows.map((row,index) => <fieldset className="card flat" key={String(row.id ?? index)}><legend>{index + 1}. {String(row.prompt)}</legend><div className="row" style={{flexWrap:"wrap",gap:8}}>{(row.options as unknown[]).filter((option): option is string => typeof option === "string").map((option,i) => <button type="button" className="btn" aria-pressed={answers[index] === option} key={i} onClick={() => setAnswers(current => ({...current,[index]:option}))}>{option}</button>)}</div>{answers[index] ? <p role="status">{choiceKey(answers[index]) === choiceKey(String(row.answer)) ? (language === "en" ? "Correct. " : "Đúng. ") : (language === "en" ? "Try again. " : "Thử lại nhé. ")}{String(row.explanation ?? "")}</p> : null}</fieldset>)}</section>;
}
