import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { apiUrl } from "../../api/runtime.js";
import { Button, Modal } from "./ui.js";
import { Eye } from "lucide-react";
import { OperatorReviewAssessmentDetail } from "../operator/Review.js";
import type { AssessmentPlacementRetakeRequestView, ContentReviewAssessmentDetailView } from "@e4s/contracts";
import { learnerApiClient, type LearnerApiClient } from "../../api/learner.js";

type RetakeApi = Pick<LearnerApiClient, "getPlacementRetakeRequest" | "createPlacementRetakeRequest">;

const dateTime = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

export function PlacementRetakeRequest({ api = learnerApiClient, onSent, onViewChange }: { api?: RetakeApi; onSent?: () => void; onViewChange?: (view: AssessmentPlacementRetakeRequestView) => void }) {
  const [view, setView] = useState<AssessmentPlacementRetakeRequestView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [originalOpen, setOriginalOpen] = useState(false);
  const reasonId = useId();

  useEffect(() => {
    let active = true;
    void api.getPlacementRetakeRequest?.().then((next) => { if (active) setView(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [api]);

  useEffect(() => { if (view) onViewChange?.(view); }, [view, onViewChange]);
  if (!view || view.request || (!view.target && !view.original && view.retake === "not_granted")) return null;

  const send = async () => {
    if (busy || !reason.trim() || !api.createPlacementRetakeRequest) return;
    setBusy(true);
    setError(false);
    try {
      setView(await api.createPlacementRetakeRequest(reason.trim()));
      setConfirming(false);
      onSent?.();
    } catch { setError(true); }
    finally { setBusy(false); }
  };

  return <section className="card learner-support-action" aria-labelledby="placement-retake-title">
    <div className="row between placement-retake-heading">
      <h2 id="placement-retake-title">Test đầu vào</h2>
      {view.original ? <Button size="sm" onClick={() => setOriginalOpen(true)}><Eye size={15} aria-hidden="true" /> Xem bài làm</Button> : null}
    </div>
    {view.original?.feedback ? <p className="small"><b>Phản hồi của Vận hành</b><br />{view.original.feedback}</p> : null}
    {view.original && originalOpen ? <OriginalPlacementModal submission={view.original} onClose={() => setOriginalOpen(false)} /> : null}
    {view.target ? <>
      <p>Bạn có thể xin thi lại bài đầu vào{view.target.availableUntil ? <> trước <b>{dateTime.format(new Date(view.target.availableUntil))}</b></> : null}.</p>
      <button type="button" className="btn-primary" onClick={() => setConfirming(true)}>Xin thi lại</button>
      {confirming ? <Modal
        title="Gửi yêu cầu thi lại?"
        description="Nếu yêu cầu được duyệt, Vận hành sẽ chốt xếp lớp sau khi bạn nộp bài thi lại."
        className="placement-retake-confirm"
        dismissOnBackdrop={!busy && !reason.trim()}
        onClose={() => { if (!busy) setConfirming(false); }}
        actions={<><Button disabled={busy} onClick={() => setConfirming(false)}>Hủy</Button><Button variant="primary" disabled={busy || !reason.trim()} onClick={() => void send()}>{busy ? "Đang gửi…" : "Gửi yêu cầu"}</Button></>}
      >
        <div className="placement-retake-reason">
          <label htmlFor={reasonId}>Lý do xin thi lại (bắt buộc)</label>
          <textarea id={reasonId} rows={2} required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
        </div>
        {error ? <p className="form-error" role="alert">Chưa gửi được yêu cầu. Hãy thử lại.</p> : null}
      </Modal> : null}
    </> : view.retake !== "not_granted" ? <p><Link className="btn btn-sm" to="/test/placement">Mở bài thi lại</Link></p> : null}
  </section>;
}


export function OriginalPlacementModal({ submission, onClose }: { submission: NonNullable<AssessmentPlacementRetakeRequestView["original"]>; onClose: () => void }) {
  const { attempt, definition, feedback } = submission;
  const detail: ContentReviewAssessmentDetailView = {
    attemptId: attempt.id,
    learnerId: "",
    learnerName: "",
    kind: "placement",
    title: definition.title,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: submission.submittedAt ?? null,
    totalScore: attempt.totalScore ?? null,
    answers: attempt.responses.map(({ artifactKey, ...response }) => ({
      ...response,
      ...(artifactKey ? { audioArtifact: {
        artifactKey,
        mimeType: null,
        sizeBytes: null,
        signedUrl: apiUrl(`/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`),
        expiresAt: null
      } } : {})
    })),
    sections: definition.sections.map((section) => ({
      section: section.code,
      label: section.title,
      maxScore: section.maxScore,
      durationMinutes: section.durationMinutes,
      score: attempt.sectionScores?.[section.code] ?? null,
      source: null,
      criteria: {},
      state: attempt.sectionScores?.[section.code] == null ? "not_scored" : "scored",
      groups: section.groups.map((group) => ({
        key: group.key,
        label: group.title,
        instruction: group.instruction,
        ...(group.stimulus ? { stimulus: group.stimulus } : {}),
        tasks: group.tasks.map(({ key, title, prompt, maxScore, minWords, maxWords, options }) => ({
          taskKey: key, prompt, maxScore, answer: null,
          ...(title ? { title } : {}),
          ...(minWords === undefined ? {} : { minWords }),
          ...(maxWords === undefined ? {} : { maxWords }),
          ...(options ? { options } : {})
        }))
      }))
    })),
    scores: [],
    integrityEvents: [],
    decision: null,
    appeal: null
  };
  return <OperatorReviewAssessmentDetail detail={detail} learnerFeedback={feedback} onClose={onClose} />;
}
