import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { CefrLevel, ContentLessonMatrixView } from "@e4s/contracts";

const stateLabels = { missing: "Chưa có", draft: "Bản nháp", review: "Chờ duyệt", published: "Đã duyệt", retired: "Đã thu hồi" } as const;

export function Lessons({ view, aiAvailable, readOnly = false, error, onCreateStarter, onGenerate }: { view: ContentLessonMatrixView; aiAvailable: boolean; readOnly?: boolean; error?: string; onCreateStarter?: (weekNumber: number, cefr: ContentLessonMatrixView["levels"][number]["cefr"]) => void | Promise<void>; onGenerate?: (weekNumber: number, cefr: ContentLessonMatrixView["levels"][number]["cefr"]) => void | Promise<void> }) {
  const [addedLevels, setAddedLevels] = useState<CefrLevel[]>([]);
  const availableLevels = allLevels.filter((level) => !view.levels.some((item) => item.cefr === level) && !addedLevels.includes(level));
  const [selectedExtra, setSelectedExtra] = useState<CefrLevel>(availableLevels[0] ?? "A1");
  const levels = useMemo(() => [
    ...view.levels,
    ...addedLevels.map((cefr) => ({ cefr, learnerCount: 0 }))
  ], [view.levels, addedLevels]);
  const addLevel = () => {
    const next = availableLevels.includes(selectedExtra) ? selectedExtra : availableLevels[0];
    if (!next) return;
    setAddedLevels((current) => [...current, next]);
    setSelectedExtra(allLevels.find((level) => level !== next && !view.levels.some((item) => item.cefr === level) && !addedLevels.includes(level)) ?? "A1");
  };
  return <main className="operator-page content-lessons-page">
    <header className="operator-heading page-title"><div><h1>Sinh & duyệt bài học</h1><p>Mỗi ô trong bảng là một <b>bộ 5 bài (T2–T6)</b> của một tuần. Cách làm: bấm <b>Sinh</b> (AI soạn) hoặc <b>Soạn tay</b> (điền form từng ngày ngay trên trang) → mở bộ bài để đọc → bấm <b>Duyệt</b>. Học viên chỉ thấy bộ đã duyệt.</p></div>{availableLevels.length ? <div className="operator-row level-column-actions"><select aria-label="Mức CEFR cần thêm" value={availableLevels.includes(selectedExtra) ? selectedExtra : availableLevels[0]} disabled={readOnly} onChange={(event) => setSelectedExtra(event.target.value as CefrLevel)}>{availableLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select><button className="operator-button--small" type="button" disabled={readOnly} onClick={addLevel}>Thêm cột mức</button></div> : null}</header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem đúng màn hình của Người vận hành ở chế độ chỉ đọc.</p> : null}
    {!aiAvailable ? <div className="operator-banner operator-banner--warn" role="alert"><span>⚠️</span><div className="operator-banner__body">Chưa có API key nên không sinh bài được. Vào <a href="/settings">Cài đặt</a> để nhập key. Bạn vẫn có thể bấm Soạn tay để tự điền bài theo form.</div></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="operator-banner operator-banner--info lesson-level-help" role="note"><div className="operator-banner__body"><b>Vì sao có các cột “Mức”?</b> Mỗi cột là một mức CEFR đang có học viên (số trong ngoặc). Cùng một chủ đề nhưng mỗi mức cần bộ bài riêng, vì độ khó và ngôn ngữ giải thích khác nhau (A1–A2 tiếng Việt, B1 trở lên tiếng Anh), và học viên chỉ nhận bộ bài đúng mức của mình. Cột nào có người mà ô còn trống hoặc là bản nháp thì nhóm đó chưa có bài. “Thêm cột mức” để soạn trước cho mức chưa có ai.</div></div>
    <div className="operator-card lesson-matrix-card"><div className="lesson-matrix-wrap"><table className="lesson-matrix"><thead><tr><th>Tuần ↓ · Mức CEFR →</th>{levels.map((level) => <th key={level.cefr}><span className={`operator-badge level-${level.cefr}`}>{level.cefr}</span> <span className="muted">({level.learnerCount} học viên)</span></th>)}</tr></thead><tbody>{view.weeks.map((week) => <tr key={week.weekNumber}><th><strong>Tuần {week.weekNumber}</strong><span className={week.topic ? "" : "muted"}>{week.topic || "chưa có chủ đề"}</span></th>{levels.map((level) => {
      const cell = week.cells.find((item) => item.cefr === level.cefr) ?? { cefr: level.cefr, status: "missing" as const, versionId: null, version: null, updatedAt: null, lessons: [] };
      return <td key={cell.cefr}>
        <span className={`operator-badge ${cell.status === "published" ? "operator-badge--ok" : cell.status === "missing" ? "" : "operator-badge--warn"}`}>{stateLabels[cell.status]}</span>
        {cell.status === "missing" ? readOnly ? <p className="matrix-meta">Chưa có bộ bài</p> : <div className="matrix-actions"><button className="button--primary operator-button--small" type="button" disabled={!aiAvailable || !onGenerate || !week.topic} title={week.topic ? undefined : "Cần đặt chủ đề tuần trước"} onClick={() => void onGenerate?.(week.weekNumber, cell.cefr)}>Sinh</button><Link className={`button-link button-link--small${onCreateStarter ? "" : " is-disabled"}`} aria-disabled={!onCreateStarter} to={`/op/lessons/${week.weekNumber}/${cell.cefr}?edit=1`} onClick={(event) => { if (!onCreateStarter) return; event.preventDefault(); void onCreateStarter(week.weekNumber, cell.cefr); }}>Soạn tay</Link></div> : <><p className="matrix-meta">{cell.lessons.length} bài{cell.updatedAt ? ` · ${formatDate(cell.updatedAt)}` : ""}</p><Link className="button-link button-link--small" to={`/op/lessons/${week.weekNumber}/${cell.cefr}`}>{readOnly ? "Xem" : "Xem / duyệt"}</Link></>}
        <ol className="matrix-lesson-list">{[1, 2, 3, 4, 5].map((day) => { const lesson = cell.lessons.find((item) => item.dayNumber === day); return <li key={day}>T{day + 1} {lesson?.title ?? "—"}</li>; })}</ol>
      </td>;
    })}</tr>)}</tbody></table></div>{levels.length ? null : <p className="operator-empty">Chưa có người học nào được duyệt mức.</p>}</div>
  </main>;
}

const allLevels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

function formatDate(value: string): string {
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
