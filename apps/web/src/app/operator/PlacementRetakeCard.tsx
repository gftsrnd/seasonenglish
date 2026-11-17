import type { AssessmentLevelFormSlotView, AssessmentLevelFormView } from "@e4s/contracts";
import { Badge, Button } from "./primitives.js";
import { operatorDateTime } from "./adapters.js";
import type { LevelFormActionKey } from "./types.js";
import { OPERATOR_TIPS } from "./section-tips.js";
import { SectionTip } from "../shared/CompactUi.js";

export interface PlacementRetakeCardActions {
  onGenerate(): void;
  onCreateManual?(): void;
  onView(versionId: string): void;
  /** `fromPublished` copies the published version into a new draft before editing. */
  onEdit?(versionId: string, fromPublished: boolean): void;
  onDelete(versionId: string): void;
}

type PlacementRetakeCardProps = {
  /** The "placement-retake" slot, or null when the server has none yet. */
  slot: AssessmentLevelFormSlotView | null;
  aiConnected: boolean;
  generating: boolean;
  readOnly?: boolean;
  unavailable?: Partial<Record<LevelFormActionKey, string>>;
  actions: PlacementRetakeCardActions;
};

export function PlacementRetakeCard({ slot, aiConnected, generating, readOnly = false, unavailable = {}, actions }: PlacementRetakeCardProps) {
  const readOnlyReason = readOnly ? "Quản lý đang xem ở chế độ chỉ đọc" : undefined;
  const draft = slot?.draftForm ?? null;
  const published = slot?.publishedForm ?? null;
  const versions = [draft, published].filter((form): form is AssessmentLevelFormView => Boolean(form));
  const generateBlocked = unavailable.generate || readOnlyReason || (!aiConnected ? "AI hệ thống tạm chưa sẵn sàng" : undefined);
  const status = published ? <Badge tone="ok">Đã phát hành</Badge> : draft ? <Badge tone="warn">Bản nháp</Badge> : <Badge tone="warn">Chưa có đề</Badge>;

  return <section className="card operator-assessment-form-list operator-placement-retake-card" aria-label="Đề thi lại">
    <div className="row between operator-card-header">
      <div>
        <p className="xs muted">BÀI ĐẦU VÀO</p>
        <h2>Đề thi lại<SectionTip text={OPERATOR_TIPS.retake} label="Đề thi lại là gì?" /></h2>
        <p className="xs muted operator-level-retake-note">Một đề thi lại duy nhất, cùng cấu trúc và cách tính điểm với đề đầu vào gốc (Nghe 15 câu · Đọc 40 · Viết 2 · Nói 4); độ khó trộn A1–C1, không lặp câu của đề gốc. Học viên chỉ làm khi Vận hành duyệt thi lại.</p>
      </div>
      <div className="row operator-level-form-actions">
        {status}
        {!versions.length ? <>
          <Button small disabled={Boolean(readOnlyReason) || generating || !actions.onCreateManual} title={readOnlyReason} onClick={() => actions.onCreateManual?.()}>Soạn tay</Button>
          <Button small primary busy={generating} disabled={Boolean(generateBlocked) || generating} title={generateBlocked || (generating ? "Đang sinh đề" : undefined)} onClick={actions.onGenerate}>{generating ? "Đang sinh…" : "Sinh đề bằng AI"}</Button>
        </> : null}
      </div>
    </div>
    {!aiConnected && !versions.length ? <p className="xs muted">AI hệ thống tạm chưa sẵn sàng; chưa thể sinh đề thi lại.</p> : null}
    {versions.length ? <div className="stack">{versions.map(form => {
      const isPublished = form.status === "published";
      // A published version is edited through a new draft, so only offer that while no draft exists.
      const editReason = unavailable.edit || readOnlyReason || (isPublished && draft ? "Đã có bản nháp mới; hãy sửa bản nháp" : undefined);
      const deleteReason = unavailable.delete || readOnlyReason || (isPublished ? "Chỉ xoá được bản nháp" : undefined) || (form.attemptCount ? "Đề này đã có bài thi nên không xoá được" : undefined);
      return <article className="item operator-assessment-form-row" key={form.versionId}>
        <div className="operator-assessment-form-info">
          <b>{form.title}</b>
          <p className="small muted">Phiên bản {form.version} · {isPublished ? `Đã phát hành${form.publishedAt ? ` ${operatorDateTime(form.publishedAt)}` : ""}` : "Bản nháp"} · {form.listeningTaskCount} câu nghe · {form.readingTaskCount} câu đọc · {form.attemptCount} lượt thi</p>
          {!isPublished && form.publicationReady === false ? <p className="xs muted">Chờ hoàn thiện {form.publicationBlockerCount ?? "các"} mục trước khi phát hành.</p> : null}
        </div>
        <div className="row operator-level-form-actions">
          <Button small disabled={Boolean(unavailable.view) || generating} aria-label={`Xem ${form.title}`} onClick={() => actions.onView(form.versionId)}>Xem</Button>
          <Button small primary={!isPublished} disabled={!actions.onEdit || Boolean(editReason) || generating} title={editReason} onClick={() => actions.onEdit?.(form.versionId, isPublished)}>{isPublished ? "Chỉnh sửa" : "Sửa & phát hành"}</Button>
          {!isPublished ? <Button small danger disabled={Boolean(deleteReason) || generating} title={deleteReason} onClick={() => actions.onDelete(form.versionId)}>Xoá</Button> : null}
        </div>
      </article>;
    })}</div> : <p className="small muted operator-level-empty">Chưa có đề thi lại. Soạn tay hoặc sinh bằng AI để tạo bản nháp; chỉ bản nháp hoàn chỉnh mới phát hành được.</p>}
  </section>;
}
