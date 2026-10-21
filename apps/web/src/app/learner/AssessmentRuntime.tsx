import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type {
  AssessmentSectionCode,
  AssessmentSubmitReason,
  AssessmentViolationReason,
  SaveAssessmentResponseInput
} from "@e4s/contracts";
import { useExperience } from "../../features/experience/Experience.js";
import { Clock3, Mic, Play, Square, TriangleAlert, Upload } from "lucide-react";
import type { AssessmentView, LearnerCallbacks } from "./contracts.js";
import { Notice, Toast } from "./ui.js";

export interface AssessmentRuntimeState {
  remainingSeconds: number | null;
  formattedTime: string;
  warning: "five_minutes" | "one_minute" | null;
  violationCount: number;
  violationLimit: number;
}

interface AssessmentRuntimeProps {
  view: AssessmentView;
  actions: LearnerCallbacks;
  children: (state: AssessmentRuntimeState) => ReactNode;
}

type ViolationDialog = {
  count: number;
  limit: number;
  reason: AssessmentViolationReason;
} | null;

// The native file picker temporarily blurs the page. Keep that OS transition
// out of the integrity signal without changing the actual assessment flow.
let filePickerGraceUntil = 0;

/**
 * The app presentation owns only local affordances. Counts, attempt status,
 * and the final decision are always taken from the runtime snapshot returned by
 * the API; the local clock is only a display between server snapshots.
 */
export function AssessmentRuntime({ view, actions, children }: AssessmentRuntimeProps) {
  const { play } = useExperience();
  const attempt = view.attempt;
  const serverRuntime = view.runtime ?? attempt?.runtime;
  const section = attempt?.currentSection ?? (isSection(view.screenState) ? view.screenState : null);
  const fallbackRemaining = useMemo(() => {
    if (!attempt?.sectionEndsAt || !attempt.currentSection) return null;
    return Math.max(0, Math.ceil((new Date(attempt.sectionEndsAt).getTime() - Date.now()) / 1000));
  }, [attempt?.id, attempt?.sectionEndsAt, attempt?.currentSection]);
  const initialRemaining = serverRuntime?.remainingSeconds ?? fallbackRemaining;
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(initialRemaining);
  const [violationDialog, setViolationDialog] = useState<ViolationDialog>(null);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const [autoSubmitReason, setAutoSubmitReason] = useState<AssessmentSubmitReason | null>(null);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const [failedViolationReason, setFailedViolationReason] = useState<AssessmentViolationReason | null>(null);
  const lastViolation = useRef<{ reason: AssessmentViolationReason; at: number } | undefined>(undefined);
  const finishedAfterCountdown = useRef(false);
  const runtimeDialogRef = useRef<HTMLDivElement | null>(null);
  const focusedBeforeRuntimeDialog = useRef<HTMLElement | null>(null);
  const runtimeDialogWasOpen = useRef(false);

  useEffect(() => {
    setRemainingSeconds(serverRuntime?.remainingSeconds ?? fallbackRemaining);
    finishedAfterCountdown.current = false;
  }, [attempt?.id, serverRuntime?.remainingSeconds, fallbackRemaining]);

  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => current === null ? null : Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [remainingSeconds]);

  const autoSubmit = serverRuntime?.autoSubmitted === true ||
    (serverRuntime?.status !== "in_progress" && serverRuntime?.submitReason === "violations");

  useEffect(() => {
    if (autoSubmit) {
      setRemainingSeconds(0);
      setAutoSubmitReason(serverRuntime?.submitReason ?? null);
      setAutoCountdown((current) => current ?? 5);
    }
  }, [autoSubmit, serverRuntime?.submitReason]);

  useEffect(() => {
    if (remainingSeconds !== 0 || autoCountdown !== null || finishedAfterCountdown.current || !attempt || !section || serverRuntime?.status !== "in_progress") return;
    setAutoCountdown(5);
  }, [attempt, autoCountdown, remainingSeconds, section, serverRuntime?.status]);

  useEffect(() => {
    if (autoCountdown === null) return;
    if (autoCountdown <= 0) {
      if (finishedAfterCountdown.current) return;
      finishedAfterCountdown.current = true;
      setAutoCountdown(null);
      void finishAttempt(section, actions).catch(() => {
        setAutoSubmitFailed(true);
        setRuntimeError("Không thể tự động nộp bài. Dữ liệu trên màn hình vẫn được giữ.");
      });
      return;
    }
    const timer = window.setTimeout(() => setAutoCountdown((current) => current === null ? null : current - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [actions, autoCountdown, section]);

  useEffect(() => {
    if (autoCountdown !== null && autoCountdown > 0) play("warning", { force: true });
  }, [autoCountdown, play]);

  useEffect(() => {
    if (remainingSeconds === 300 || remainingSeconds === 60) play("warning", { force: true });
  }, [play, remainingSeconds]);

  useEffect(() => {
    if (!violationDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setViolationDialog(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [violationDialog]);

  const runtimeDialogOpen = Boolean(violationDialog || autoCountdown !== null);
  useEffect(() => {
    if (runtimeDialogOpen && !runtimeDialogWasOpen.current) {
      focusedBeforeRuntimeDialog.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      runtimeDialogRef.current?.focus();
    } else if (!runtimeDialogOpen && runtimeDialogWasOpen.current) {
      focusedBeforeRuntimeDialog.current?.focus();
      focusedBeforeRuntimeDialog.current = null;
    }
    runtimeDialogWasOpen.current = runtimeDialogOpen;
  }, [runtimeDialogOpen]);

  const reportViolation = async (reason: AssessmentViolationReason) => {
    if (!attempt || !section || serverRuntime?.status !== "in_progress") return;
    const now = Date.now();
    const previous = lastViolation.current;
    if (previous?.reason === reason && now - previous.at < 1_000) return;
    lastViolation.current = { reason, at: now };
    const input = { requestId: requestId(), reason, occurredAt: new Date(now).toISOString() };
    play("warning", { force: true });
    const optimisticCount = (serverRuntime?.violationCount ?? 0) + 1;
    try {
      if (!actions.recordAssessmentViolation) {
        setViolationDialog({ count: optimisticCount, limit: serverRuntime?.violationLimit ?? view.warningLimit ?? 3, reason });
        return;
      }
      const next = await actions.recordAssessmentViolation(attempt.id, input);
      if (next.autoSubmitted || next.status !== "in_progress" || next.submitReason === "violations") {
        setFailedViolationReason(null);
        setAutoSubmitReason(next.submitReason ?? "violations");
        setAutoCountdown(5);
        setViolationDialog(null);
      } else {
        setViolationDialog({ count: next.violationCount, limit: next.violationLimit, reason });
      }
    } catch {
      setFailedViolationReason(reason);
      setRuntimeError("Không ghi nhận được cảnh báo. Hãy giữ nguyên trang và thử lại.");
    }
  };

  useEffect(() => {
    if (!attempt || !section || serverRuntime?.status !== "in_progress") return;
    const onVisibilityChange = () => {
      if (document.hidden) void reportViolation("visibility_hidden");
    };
    const onBlur = () => {
      if (Date.now() < filePickerGraceUntil) return;
      void reportViolation("window_blur");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
    };
  }, [attempt, section, serverRuntime?.status, serverRuntime?.violationCount, serverRuntime?.violationLimit, actions, play]);

  const runtimeState: AssessmentRuntimeState = {
    remainingSeconds,
    formattedTime: formatTime(remainingSeconds),
    warning: remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300
      ? "five_minutes"
      : remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 60 ? "one_minute" : null,
    violationCount: serverRuntime?.violationCount ?? 0,
    violationLimit: serverRuntime?.violationLimit ?? view.warningLimit ?? 3
  };

  const retryAutoSubmit = () => {
    setRuntimeError(undefined);
    setAutoSubmitFailed(false);
    finishedAfterCountdown.current = false;
    setAutoCountdown(5);
  };

  const retryRuntimeError = () => {
    if (autoSubmitFailed) {
      retryAutoSubmit();
      return;
    }
    if (!failedViolationReason) return;
    const reason = failedViolationReason;
    setFailedViolationReason(null);
    setRuntimeError(undefined);
    void reportViolation(reason);
  };

  return <>
    {children(runtimeState)}
    {runtimeError ? <Toast tone="danger">{runtimeError}{autoSubmitFailed || failedViolationReason ? <button className="btn-sm" type="button" onClick={retryRuntimeError}>Thử lại</button> : null}</Toast> : null}
    {violationDialog ? <div className="modal-backdrop" role="presentation"><div ref={runtimeDialogRef} className="dialog assessment-violation-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-violation-title" aria-describedby="assessment-violation-description" tabIndex={-1} onKeyDown={trapDialogFocus}>
      <h2 id="assessment-violation-title"><TriangleAlert size={22} aria-hidden="true" /><span>Cảnh báo {violationDialog.count}/{violationDialog.limit}</span></h2>
      <p id="assessment-violation-description">{violationDialog.reason === "visibility_hidden" ? "Bạn vừa rời khỏi màn hình bài thi." : "Cửa sổ bài thi vừa mất trạng thái tập trung."} Trong lúc thi, <strong>không được mở tab, cửa sổ hay pop-up khác</strong>.</p>
      <p className="small muted"><strong>Bài test vẫn tiếp tục</strong>; thời gian vẫn đang chạy.</p>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="btn-primary" type="button" onClick={() => setViolationDialog(null)}>Đã hiểu, tiếp tục</button></div>
    </div></div> : null}
    {autoCountdown !== null ? <div className="modal-backdrop" role="presentation"><div ref={runtimeDialogRef} className="dialog assessment-auto-submit-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-auto-submit-title" aria-describedby="assessment-auto-submit-description" tabIndex={-1} onKeyDown={trapDialogFocus}>
      <h2 id="assessment-auto-submit-title"><Clock3 size={22} aria-hidden="true" /> Tự động nộp bài</h2>
      <p id="assessment-auto-submit-description">{(autoSubmitReason ?? serverRuntime?.submitReason) === "violations" ? "Bạn đã vượt quá số lần cảnh báo cho phép." : "Hết giờ phần thi. Hệ thống sẽ tự động nộp."}</p>
      <p className="small muted">Tự thực hiện sau</p><strong className="assessment-auto-countdown" aria-live="assertive">{Math.max(0, autoCountdown)}</strong>
    </div></div> : null}
  </>;
}

export interface AssessmentRecorderProps {
  taskKey: string;
  view: AssessmentView;
  actions: LearnerCallbacks;
  onEvidence: (input: SaveAssessmentResponseInput) => void | Promise<void>;
}

/** Speaking evidence control shared by microphone recording and file upload. */
export function AssessmentRecorder({ taskKey, view, actions, onEvidence }: AssessmentRecorderProps) {
  const { holdMusic } = useExperience();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("Chưa có file ghi âm");
  const [error, setError] = useState<string>();
  const [audioUrl, setAudioUrl] = useState<string>();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const microphoneSupported = view.runtime?.deviceEvidence.microphoneSupported ?? view.attempt?.runtime?.deviceEvidence.microphoneSupported;
  const canRecord = microphoneSupported !== false && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  useEffect(() => () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    holdMusic(false);
  }, [audioUrl, holdMusic]);

  const submitAudio = async (file: Blob, name: string, value: string) => {
    setBusy(true); setError(undefined); setFileName(`Đang lưu ${name}…`);
    try {
      const artifactKey = await actions.uploadAssessmentAudio(file, name);
      await onEvidence({ value, evidenceType: "audio", artifactKey });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(file));
      setFileName(`Đã lưu ${name}`);
    } catch {
      setError("Chưa lưu được file ghi âm. Hãy thử lại.");
      setFileName("Chưa có file ghi âm");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!canRecord) return;
    setError(undefined); setBusy(true);
    let nextStream: MediaStream | undefined;
    try {
      const acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      nextStream = acquiredStream;
      const nextRecorder = new MediaRecorder(acquiredStream);
      stream.current = acquiredStream; recorder.current = nextRecorder; chunks.current = [];
      nextRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      nextRecorder.onstop = () => {
        acquiredStream.getTracks().forEach((track) => track.stop());
        stream.current = null; recorder.current = null; holdMusic(false);
        const blob = new Blob(chunks.current, { type: nextRecorder.mimeType || "audio/webm" });
        void submitAudio(blob, `${taskKey}-${Date.now()}.webm`, "Bản ghi âm đã nộp");
      };
      holdMusic(true); nextRecorder.start(); setRecording(true);
    } catch {
      nextStream?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      recorder.current = null;
      holdMusic(false);
      setError("Chưa truy cập được micro. Hãy cấp quyền rồi thử lại hoặc tải file ghi âm.");
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = () => {
    if (!recorder.current) return;
    recorder.current.stop(); setRecording(false); setBusy(true);
  };

  const replayAudio = async () => {
    if (!audioUrl || busy) return;
    setError(undefined);
    try {
      const audio = new Audio(audioUrl);
      await audio.play();
    } catch {
      setError("Không phát lại được file ghi âm. Hãy thử lại.");
    }
  };

  return <div className="speaking-evidence-controls">
    {!canRecord ? <Notice tone="warn">Trình duyệt này không ghi âm được. Bạn vẫn có thể tải file ghi âm.</Notice> : null}
    <div className="speaking-evidence-actions">
      <button className={`btn-sm ${recording ? "btn-danger" : ""}`} type="button" aria-pressed={recording} disabled={!canRecord || busy} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <><Square size={15} fill="currentColor" aria-hidden="true" /> Dừng ghi</> : <><Mic size={16} aria-hidden="true" /> Ghi âm</>}</button>
      {audioUrl ? <button className="btn-sm btn-ghost" type="button" disabled={busy} onClick={() => void replayAudio()}><Play size={16} fill="currentColor" aria-hidden="true" /> Nghe lại ghi âm</button> : null}
      <button className="btn btn-sm" type="button" disabled={busy} onClick={() => {
        filePickerGraceUntil = Date.now() + 2_000;
        fileInput.current?.click();
      }}><Upload size={16} aria-hidden="true" /> Tải file ghi âm</button>
    </div>
    <input ref={fileInput} id={`assessment-audio-${taskKey}`} className="sr-only" type="file" accept="audio/*" aria-label="Tải file ghi âm" tabIndex={-1} disabled={busy} onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void submitAudio(file, file.name, "File ghi âm đã nộp");
    }} />
    <div className="speaking-evidence-status">
      <span aria-live="polite">{fileName}</span>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  </div>;
}

function ErrorMessage({ children }: { children: ReactNode }) { return <span className="form-error" role="alert">{children}</span>; }

async function finishAttempt(section: AssessmentSectionCode | null, actions: LearnerCallbacks) {
  if (!section) return;
  if (section === "speaking") await actions.submitAssessment();
  else await actions.completeAssessmentSection(section);
}

function requestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `assessment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(seconds: number | null) {
  if (seconds === null) return "--:--";
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}

function isSection(value: AssessmentView["screenState"]): value is AssessmentSectionCode {
  return value === "listening" || value === "reading" || value === "writing" || value === "speaking";
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"));
  if (!focusable.length) { event.preventDefault(); event.currentTarget.focus(); return; }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
