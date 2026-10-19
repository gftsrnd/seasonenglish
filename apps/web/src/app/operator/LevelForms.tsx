import { useEffect, useRef } from "react";
import { Badge, Banner, Button, Empty, OperatorPage, PageTitle } from "./primitives.js";
import type { LevelFormActionKey, OperatorLevelFormsActions, OperatorLevelFormsView } from "./types.js";
import type { AssessmentLevelFormDetailView } from "@e4s/contracts";
import { operatorDateTime } from "./adapters.js";

type LevelFormsUiView = OperatorLevelFormsView & {
  loading?: boolean;
  loadState?: "idle" | "loading" | "success" | "error";
  mutationState?: "idle" | "loading";
  mutationMessage?: string | null;
  publishingId?: string | null;
  deletingId?: string | null;
};

type OperatorLevelFormsProps = {
  view: LevelFormsUiView;
  actions: OperatorLevelFormsActions;
  readOnly?: boolean;
  unavailable?: Partial<Record<LevelFormActionKey, string>>;
};

export function OperatorLevelForms({ view, actions, readOnly = false, unavailable = {} }: OperatorLevelFormsProps) {
  const blocked = (key: LevelFormActionKey) => unavailable[key];
  const generating = Boolean(view.generatingTarget) || view.generateState === "loading";
  const mutationBusy = view.mutationState === "loading";
  const loading = view.loading || view.loadState === "loading";
  const readOnlyReason = readOnly ? "Quản lý đang xem ở chế độ chỉ đọc" : undefined;
  const pageTitle = <PageTitle actions={!view.aiConnected ? <a className="badge warn" href="/settings" onClick={event => { event.preventDefault(); actions.onOpenSettings(); }}>Chưa có API key – không sinh đề được</a> : undefined}><a className="link-button small" href="/op" onClick={event => { event.preventDefault(); actions.onBack(); }}>← Duyệt trình độ</a><h1>Đề thi lên mức</h1><p className="muted">Mỗi mức đích cần một đề ngắn được duyệt: 1 đoạn nghe (5 câu × 5đ), 1 bài đọc (5 câu × 5đ), viết 80–120 từ, 1 task nói – tất cả ở mức đích. Học viên đủ tín hiệu thi đề của mức kế tiếp, thời gian mỗi phần bằng nửa bài đầu vào.</p></PageTitle>;

  return <OperatorPage title="Đề thi lên mức">{pageTitle}
    {readOnly && <Banner tone="info"><span className="small">Màn hình đang ở chế độ chỉ đọc.</span></Banner>}
    {!view.aiConnected && <Banner tone="warn"><span className="small"><b>AI chưa kết nối.</b> Chưa thể sinh đề mới; các đề đã có vẫn có thể xem. <a className="link-button" href="/settings" onClick={event => { event.preventDefault(); actions.onOpenSettings(); }}>Mở Cài đặt AI</a></span></Banner>}
    {view.generateError && <div className="banner warn" role="alert"><div className="body small">{view.generateError}</div></div>}
    {view.mutationMessage && <div className="small muted" aria-live="polite">{mutationBusy && <span className="spinner" aria-hidden="true" />} {view.mutationMessage}</div>}
    {loading ? <div className="card" role="status" aria-label="Đang tải đề thi lên mức"><div className="row"><span className="spinner" aria-hidden="true" /><p>Đang tải đề thi lên mức…</p></div></div> : !view.targets.length ? <div role="status" aria-label="Chưa có mức đích"><Empty><p className="small muted">Chưa có mức đích để hiển thị.</p></Empty></div> : view.targets.map(group => {
      const approved = group.forms.some(form => form.status === "approved");
      const generateBlocked = blocked("generate") || readOnlyReason || (!view.aiConnected ? "Chưa có API key – không sinh đề được" : undefined);
      const groupGenerating = view.generatingTarget === group.target || (view.generateState === "loading" && !view.generatingTarget);
      return <div className="card operator-level-group" key={group.target}><div className="row between operator-card-header"><h3 style={{ margin: 0 }}>Mức đích {group.target} {approved ? <Badge tone="ok">có đề đã duyệt</Badge> : <Badge tone="warn">chưa có đề duyệt</Badge>}</h3><Button small primary busy={groupGenerating} disabled={Boolean(generateBlocked) || generating || mutationBusy} title={generateBlocked || (generating ? "Đang sinh đề" : undefined)} onClick={() => actions.onGenerate(group.target)}>{groupGenerating ? "Đang sinh…" : "Sinh đề bằng AI"}</Button></div>
        {group.forms.length ? <div className="list" style={{ marginTop: 8 }}>{group.forms.map(form => {
          const isApproved = form.status === "approved";
          const publishBusy = view.publishingId === form.id;
          const deleteBusy = view.deletingId === form.id;
          const deleteReason = blocked("delete") || readOnlyReason || (isApproved ? "Chỉ xoá được bản nháp" : undefined) || (form.attempts ? "Đề này đã có bài thi nên không xoá được" : undefined);
          const actionBusy = mutationBusy || generating || publishBusy || deleteBusy;
          return <div className="item operator-level-form-item" key={form.id}><div className="body"><div className="title">{form.title} <Badge tone={isApproved ? "ok" : ""}>{isApproved ? "Đã duyệt" : "Bản nháp"}</Badge>{form.short && <Badge tone="warn">ngắn</Badge>}{form.inUse && <Badge tone="primary">đang dùng</Badge>}</div><div className="xs muted">{form.createdAt} · {form.byName || "—"} · {form.listeningQuestions} câu nghe · {form.readingQuestions} câu đọc · {form.attempts} lượt thi</div></div><Button small disabled={Boolean(blocked("view"))} title={blocked("view")} onClick={() => actions.onView(form.id)}>Xem</Button>{!isApproved && <Button small primary busy={publishBusy} disabled={Boolean(readOnlyReason) || actionBusy || Boolean(blocked("approve"))} title={blocked("approve") || readOnlyReason} onClick={() => actions.onApprove(form.id)}>{publishBusy ? "Đang duyệt…" : "Duyệt"}</Button>}<Button small danger busy={deleteBusy} disabled={Boolean(deleteReason) || actionBusy} title={deleteReason} onClick={() => actions.onDelete(form.id)}>{deleteBusy ? "Đang xoá…" : "Xoá"}</Button></div>;
        })}</div> : <p className="small muted" style={{ margin: "8px 0 0" }}>Chưa có đề.</p>}
      </div>;
    })}
  </OperatorPage>;
}

export function OperatorLevelFormDetail({ detail, onClose }: { detail: AssessmentLevelFormDetailView; onClose(): void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], summary, [tabindex]:not([tabindex='-1'])")).filter(element => !element.hidden);
    (focusable()[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation"><section ref={dialogRef} className="dialog wide operator-detail-dialog" role="dialog" aria-modal="true" aria-label={`Chi tiết ${detail.title}`} tabIndex={-1}>
    <div className="row between"><div><h3>{detail.title} · v{detail.version}</h3><p className="small muted">Mức đích {detail.targetLevel} · {detail.status === "published" ? "Đã phát hành" : detail.status === "retired" ? "Đã lưu lịch sử" : "Bản nháp"}</p></div><button className="btn-sm" type="button" onClick={onClose}>Đóng</button></div>
    {detail.deleteReason && <div className="banner warn"><div className="body small">Không thể xoá: {detail.deleteReason}</div></div>}
    {detail.warnings.length ? <div className="card soft"><b>Cảnh báo kiểm tra đề</b><ul className="small">{detail.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><Badge tone={warning.severity === "error" ? "danger" : "warn"}>{warning.code}</Badge> {warning.message}</li>)}</ul></div> : <div className="banner ok"><div className="body small">Đề đủ cấu trúc hiện tại, chưa có cảnh báo.</div></div>}
    <h4>Chi tiết 4 phần</h4>
    <div className="list">{detail.sections.map(section => <details className="item" key={section.code} open><summary><b>{section.title}</b> · {section.groups.reduce((count, group) => count + group.tasks.length, 0)} câu · {section.durationMinutes} phút</summary><div className="small">{section.instructions.join(" · ")}</div>{section.groups.map(group => <div className="card flat" key={group.key}><b>{group.title}</b><p className="xs muted">{group.instruction}</p>{group.tasks.map(task => <div className="small" key={task.key}><b>{task.key}</b> {task.title ? `· ${task.title}` : ""}: {task.prompt}{task.correctAnswer ? <span className="muted"> · Đáp án: {task.correctAnswer}</span> : null}</div>)}</div>)}</details>)}</div>
    <h4>Lịch sử phiên bản</h4>
    {detail.versions.length ? <div className="table-wrap"><table><thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Số lượt thi</th><th>Phát hành</th></tr></thead><tbody>{detail.versions.map(version => <tr key={version.versionId}><td>v{version.version}</td><td>{version.status}</td><td>{version.attemptCount}</td><td>{operatorDateTime(version.publishedAt)}</td></tr>)}</tbody></table></div> : <p className="small muted">Chưa có phiên bản khác.</p>}
  </section></div>;
}
