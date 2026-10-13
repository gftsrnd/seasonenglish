import { useState } from "react";
import { Link } from "react-router";
import type { ContentWeekFrameView, ContentWeekInput } from "@e4s/contracts";

export function Weeks({ view, readOnly, onSave }: {
  view: ContentWeekFrameView;
  readOnly: boolean;
  onSave: (weeks: ContentWeekInput[]) => void | Promise<void>;
}) {
  const [weeks, setWeeks] = useState<ContentWeekInput[]>(view.weeks.map(({ weekNumber, topic, description, objectives, keyVocabHint }) => ({
    weekNumber, topic, description, objectives, keyVocabHint
  })));
  const update = (weekNumber: number, field: keyof Omit<ContentWeekInput, "weekNumber">, value: string) => {
    setWeeks((current) => current.map((week) => week.weekNumber === weekNumber ? { ...week, [field]: value } : week));
  };
  return <main className="operator-page content-weeks-page">
    <header className="operator-heading"><div><h1>Khung chủ đề tuần</h1><p>Mỗi tuần một chủ đề chung cho cả nhóm; AI sinh bài theo chủ đề này cho từng mức. Pilot: {view.pilot.weekCount} tuần, bắt đầu {shortDate(view.pilot.startDate)}.</p></div></header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem ở chế độ chỉ đọc.</p> : null}
    <button type="button" disabled>Gợi ý các tuần còn trống</button>
    <p className="content-help">Bấm Gợi ý: 3 phương án hiện ngay dưới ô chủ đề, mỗi phương án có kế hoạch đủ 5 ngày T2–T6 cho từng mức; kế hoạch được dùng khi sinh bài. Bấm Xác nhận ở phương án bạn chọn để điền và lưu tuần đó tại chỗ; sau đó vẫn sửa tay được rồi bấm Lưu khung chủ đề.</p>
    <div className="week-card-list">{view.weeks.map((source, index) => {
      const week = weeks[index]!;
      return <section className="week-topic-card" key={source.id}>
        <div className="week-topic-heading"><h3>Tuần {source.weekNumber} <small>({shortDate(source.startDate)} – {shortDate(source.endDate)})</small></h3><div>{source.current ? <span className="week-current">Tuần hiện tại</span> : null}<button type="button" disabled>Gợi ý</button></div></div>
        <label>Chủ đề *<input aria-label="Chủ đề *" value={week.topic} disabled={readOnly} onChange={(event) => update(week.weekNumber, "topic", event.target.value)} placeholder="VD: Giới thiệu bản thân & công việc" /></label>
        <label>Mô tả ngắn / tình huống<textarea aria-label="Mô tả ngắn / tình huống" value={week.description} disabled={readOnly} onChange={(event) => update(week.weekNumber, "description", event.target.value)} placeholder="VD: Tự giới thiệu trong buổi họp đầu với khách, nói về vai trò và dự án đang làm" /></label>
        <div className="week-topic-columns">
          <label>Mục tiêu học<textarea aria-label="Mục tiêu học" value={week.objectives} disabled={readOnly} onChange={(event) => update(week.weekNumber, "objectives", event.target.value)} placeholder="VD: Nói được 5 câu về công việc; dùng present simple" /></label>
          <label>Gợi ý từ khoá (tuỳ chọn)<textarea aria-label="Gợi ý từ khoá (tuỳ chọn)" value={week.keyVocabHint} disabled={readOnly} onChange={(event) => update(week.weekNumber, "keyVocabHint", event.target.value)} placeholder="VD: role, responsible for, deadline" /></label>
        </div>
      </section>;
    })}</div>
    <div className="content-footer-actions"><button className="button--primary" type="button" disabled={readOnly} onClick={() => void onSave(weeks)}>Lưu khung chủ đề</button><Link className="button-link" to="/op/lessons">Đi tới sinh bài →</Link></div>
  </main>;
}

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}
