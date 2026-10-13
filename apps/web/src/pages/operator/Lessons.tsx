import { Link } from "react-router";
import type { ContentLessonMatrixView } from "@e4s/contracts";

const stateLabels = { missing: "Chưa có", draft: "Bản nháp", review: "Chờ duyệt", published: "Đã duyệt", retired: "Đã thu hồi" } as const;

export function Lessons({ view, aiAvailable }: { view: ContentLessonMatrixView; aiAvailable: boolean }) {
  return <main className="operator-page content-lessons-page">
    <header className="operator-heading operator-heading--stack"><div><h1>Sinh & duyệt bài học</h1><p>Mỗi ô trong bảng là một bộ 5 bài (T2–T6) của một tuần. Cách làm: bấm Sinh (AI soạn) hoặc Soạn tay (điền form từng ngày ngay trên trang) → mở bộ bài để đọc → bấm Duyệt. Học viên chỉ thấy bộ đã duyệt.</p></div></header>
    <div className="level-column-actions"><select aria-label="Mức CEFR cần thêm" defaultValue="C1"><option>C1</option></select><button type="button">Thêm cột mức</button></div>
    {!aiAvailable ? <p className="operator-warning">⚠️ Chưa có API key nên không sinh bài được. Vào <a href="/settings">Cài đặt</a> để nhập key. Bạn vẫn có thể bấm Soạn tay để tự điền bài theo form.</p> : null}
    <p className="content-help">Vì sao có các cột “Mức”? Mỗi cột là một mức CEFR đang có học viên (số trong ngoặc). Cùng một chủ đề nhưng mỗi mức cần bộ bài riêng, vì độ khó và ngôn ngữ giải thích khác nhau, và học viên chỉ nhận bộ bài đúng mức của mình.</p>
    <div className="lesson-matrix-wrap"><table className="lesson-matrix"><thead><tr><th>Tuần ↓ · Mức CEFR →</th>{view.levels.map((level) => <th key={level.cefr}>{level.cefr} ({level.learnerCount} học viên)</th>)}</tr></thead><tbody>{view.weeks.map((week) => <tr key={week.weekNumber}><th><strong>Tuần {week.weekNumber}</strong><span>{week.topic}</span></th>{week.cells.map((cell) => <td key={cell.cefr}>
      <span className={`content-state content-state--${cell.status}`}>{stateLabels[cell.status]}</span>
      {cell.status === "missing" ? <div className="matrix-actions"><button type="button" disabled={!aiAvailable}>Sinh</button><Link className="button-link button-link--small" to={`/op/lessons/${week.weekNumber}/${cell.cefr}?edit=1`}>Soạn tay</Link></div> : <><p className="matrix-meta">{cell.lessons.length} bài{cell.updatedAt ? ` · ${formatDate(cell.updatedAt)}` : ""}</p><Link to={`/op/lessons/${week.weekNumber}/${cell.cefr}`}>Xem / duyệt</Link></>}
      <ol className="matrix-lesson-list">{[1, 2, 3, 4, 5].map((day) => { const lesson = cell.lessons.find((item) => item.dayNumber === day); return <li key={day}>T{day + 1} {lesson?.title ?? "—"}</li>; })}</ol>
    </td>)}</tr>)}</tbody></table></div>
  </main>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
