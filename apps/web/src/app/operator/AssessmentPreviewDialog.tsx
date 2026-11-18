import { useRef, type ReactNode } from "react";
import type { AssessmentDefinitionView, AssessmentFormPreviewView } from "@e4s/contracts";
import { useDialog } from "../shared/ModalProvider.js";
import { AssessmentDefinitionPreview } from "../shared/AssessmentDefinitionPreview.js";
import { ScrollJumpButton, useScrollJump } from "../shared/ScrollJump.js";
import { ModalCloseButton } from "../shared/CompactUi.js";

export type AssessmentPreviewForm = Pick<AssessmentFormPreviewView,
  "versionId" | "kind" | "title" | "version" | "status" | "totalMinutes" | "totalScore" | "sections" | "audioConfigured" | "editable">;

function assessmentPreviewDefinition(form: AssessmentPreviewForm): AssessmentDefinitionView & { sections: AssessmentFormPreviewView["sections"] } {
  return {
    key: form.versionId,
    kind: form.kind === "level_up" ? "level-up" : form.kind === "pass_course" ? "pass-course" : form.kind,
    title: form.title,
    version: form.version,
    totalMinutes: form.totalMinutes,
    totalScore: form.totalScore,
    sections: form.sections
  };
}

export function AssessmentPreviewDialog({
  form,
  readOnly,
  onClose,
  onEdit,
  busy = false,
  children
}: {
  form: AssessmentPreviewForm;
  readOnly: boolean;
  onClose: () => void;
  onEdit?: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scroll = useScrollJump(true);
  useDialog(true, dialogRef, onClose, closeRef);
  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="dialog wide operator-detail-dialog operator-assessment-preview-dialog operator-level-view-dialog" role="dialog" aria-modal="true" aria-label={`Xem đề ${form.title}`} tabIndex={-1}>
    <div className="operator-level-form-dialog-header"><div className="operator-level-form-dialog-title"><span className="operator-level-kicker">Xem đề thi</span><h3>{form.title}</h3><p className="small muted">Phiên bản {form.version} · {form.status === "published" ? "Đã phát hành" : form.status === "draft" ? "Bản nháp" : "Đã lưu lịch sử"}</p></div><div className="row operator-level-form-dialog-actions">{!readOnly && form.editable && onEdit ? <button className="btn-sm btn-primary" type="button" disabled={busy} onClick={onEdit}>{busy ? "Đang mở…" : "Sửa đề"}</button> : null}<ModalCloseButton ref={closeRef} disabled={busy} onClick={onClose} /></div></div>
    <div className="operator-level-form-dialog-body">
      <div ref={scroll.start} className="app-scroll-edge" aria-hidden="true" />
      {children}
      <AssessmentDefinitionPreview definition={assessmentPreviewDefinition(form)} status={form.status} audioConfigured={form.audioConfigured} readOnly={readOnly} />
      <div ref={scroll.end} className="app-scroll-edge" aria-hidden="true" />
      {scroll.visible && <ScrollJumpButton atTop={scroll.atTop} onClick={scroll.jump} inExam />}
    </div>
  </section></div>;
}
