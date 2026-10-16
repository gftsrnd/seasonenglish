import { useState } from "react";
import { Link } from "react-router";
import type { ContentWeekFrameView, ContentWeekInput, ContentWeekSuggestionView } from "@e4s/contracts";

export function Weeks({ view, readOnly, error, onSave, onSuggest }: {
  view: ContentWeekFrameView;
  readOnly: boolean;
  error?: string;
  onSave: (weeks: ContentWeekInput[]) => void | Promise<void>;
  onSuggest?: (weekNumbers: number[]) => Promise<ContentWeekSuggestionView[]>;
}) {
  const [weeks, setWeeks] = useState<ContentWeekInput[]>(view.weeks.map(({ weekNumber, topic, description, objectives, keyVocabHint }) => ({
    weekNumber, topic, description, objectives, keyVocabHint
  })));
  const update = (weekNumber: number, field: keyof Omit<ContentWeekInput, "weekNumber">, value: string) => {
    setWeeks((current) => current.map((week) => week.weekNumber === weekNumber ? { ...week, [field]: value } : week));
  };
  const [suggesting, setSuggesting] = useState<number | "all" | null>(null);
  const [suggestions, setSuggestions] = useState<Record<number, WeekSuggestion[]>>({});
  const [confirmed, setConfirmed] = useState<Record<number, string>>({});
  const [suggestionError, setSuggestionError] = useState("");
  const applySuggestion = async (weekNumber: number, option: WeekSuggestion) => {
    const next = weeks.map((week) => week.weekNumber === weekNumber ? { ...week, ...option } : week);
    setWeeks(next);
    setConfirmed((current) => ({ ...current, [weekNumber]: option.topic }));
    setSuggesting(null);
    await onSave(next);
  };
  const requestSuggestions = async (weekNumbers: number[]) => {
    if (!onSuggest) return;
    setSuggestionError("");
    try {
      const generated = await onSuggest(weekNumbers);
      setSuggestions((current) => ({ ...current, ...Object.fromEntries(generated.map((week) => [week.weekNumber, week.options])) }));
    } catch { setSuggestionError("Không lấy được gợi ý AI. Kiểm tra kết nối rồi thử lại."); }
  };
  const suggestEmptyWeeks = async () => {
    const numbers = weeks.filter((week) => !week.topic.trim()).map((week) => week.weekNumber);
    if (!numbers.length) {
      setSuggestionError("Tất cả tuần đã có chủ đề. Bạn vẫn có thể bấm Gợi ý tại từng tuần để tạo phương án khác.");
      return;
    }
    await requestSuggestions(numbers);
    setSuggesting(numbers[0] ?? null);
  };
  return <main className="operator-page content-weeks-page">
    <header className="operator-heading page-title"><div><h1>Khung chủ đề tuần</h1><p>Mỗi tuần một chủ đề chung cho cả nhóm; AI sinh bài theo chủ đề này cho từng mức. Pilot: {view.pilot.weekCount} tuần, bắt đầu {shortDate(view.pilot.startDate)}.</p></div><div className="operator-row"><button type="button" disabled={readOnly || !onSuggest} onClick={() => void suggestEmptyWeeks()}>Gợi ý các tuần còn trống</button></div></header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem ở chế độ chỉ đọc.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {suggestionError ? <p className="form-error" role="alert">{suggestionError}</p> : null}
    <div className="operator-banner operator-banner--info"><div className="operator-banner__body">Bấm <b>Gợi ý</b>: 3 phương án hiện ngay dưới ô chủ đề, mỗi phương án có <b>kế hoạch đủ 5 ngày T2–T6 cho từng mức</b>; kế hoạch được dùng khi sinh bài. Bấm <b>Xác nhận</b> ở phương án bạn chọn để điền và lưu tuần đó tại chỗ; sau đó vẫn sửa tay được rồi bấm <b>Lưu khung chủ đề</b>.</div></div>
    <div className="week-card-list">{view.weeks.map((source, index) => {
      const week = weeks[index]!;
      return <section className="week-topic-card operator-card" key={source.id}>
        <div className="week-topic-heading operator-row operator-row--between"><h3>Tuần {source.weekNumber} <small>({shortDate(source.startDate)} – {shortDate(source.endDate)})</small></h3><div className="operator-row">{source.current ? <span className="operator-badge operator-badge--primary">Tuần hiện tại</span> : null}<button className="operator-button--small" type="button" disabled={readOnly || !onSuggest} onClick={() => { const open = suggesting !== source.weekNumber; setSuggesting(open ? source.weekNumber : null); if (open && !suggestions[source.weekNumber]) void requestSuggestions([source.weekNumber]); }}>Gợi ý</button></div></div>
        {confirmed[source.weekNumber] ? <div className="operator-banner operator-banner--ok"><div className="operator-banner__body">✓ Đã xác nhận và lưu chủ đề <b>{confirmed[source.weekNumber]}</b> cho tuần {source.weekNumber}. <button className="operator-link-button" type="button" onClick={() => setSuggesting(source.weekNumber)}>Xem lại các phương án</button></div></div> : null}
        <label>Chủ đề *<input aria-label="Chủ đề *" value={week.topic} disabled={readOnly} onChange={(event) => update(week.weekNumber, "topic", event.target.value)} placeholder="VD: Giới thiệu bản thân & công việc" /></label>
        <label>Mô tả ngắn / tình huống<textarea aria-label="Mô tả ngắn / tình huống" value={week.description} disabled={readOnly} onChange={(event) => update(week.weekNumber, "description", event.target.value)} placeholder="VD: Tự giới thiệu trong buổi họp đầu với khách, nói về vai trò và dự án đang làm" /></label>
        <div className="week-topic-columns">
          <label>Mục tiêu học<textarea aria-label="Mục tiêu học" value={week.objectives} disabled={readOnly} onChange={(event) => update(week.weekNumber, "objectives", event.target.value)} placeholder="VD: Nói được 5 câu về công việc; dùng present simple" /></label>
          <label>Gợi ý từ khoá (tuỳ chọn)<textarea aria-label="Gợi ý từ khoá (tuỳ chọn)" value={week.keyVocabHint} disabled={readOnly} onChange={(event) => update(week.weekNumber, "keyVocabHint", event.target.value)} placeholder="VD: role, responsible for, in charge of, deadline" /></label>
        </div>
        {suggesting === source.weekNumber ? <section className="week-suggestion-panel operator-card operator-card--soft" aria-label={`Gợi ý tuần ${source.weekNumber}`}><div className="operator-row operator-row--between"><b>Gợi ý cho tuần {source.weekNumber}</b><button className="operator-button--small" type="button" onClick={() => setSuggesting(null)}>Bỏ gợi ý</button></div><div className="week-suggestion-list">{(suggestions[source.weekNumber] ?? []).map((option, optionIndex) => <article className="operator-card operator-card--flat" key={`${option.topic}-${optionIndex}`}><div className="operator-row operator-row--between"><div><span>{optionIndex + 1}. </span><strong>{option.topic}</strong><p>{option.description}</p><small>{option.keyVocabHint}</small></div><button className="button--primary operator-button--small" type="button" disabled={readOnly} onClick={() => void applySuggestion(source.weekNumber, option)}>Xác nhận phương án này</button></div><p className="week-suggestion-objective"><b>Mục tiêu:</b> {option.objectives}</p></article>)}</div>{!suggestions[source.weekNumber] ? <span>Đang sinh gợi ý…</span> : null}</section> : null}
      </section>;
    })}</div>
    <div className="content-footer-actions"><button className="button--primary" type="button" disabled={readOnly} onClick={() => void onSave(weeks)}>Lưu khung chủ đề</button><Link className="button-link" to="/op/lessons">Đi tới sinh bài →</Link></div>
  </main>;
}

type WeekSuggestion = Omit<ContentWeekInput, "weekNumber">;

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}
