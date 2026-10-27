import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Ban, CheckCircle2, Clock3, Headphones, Mic, Sprout, Volume2 } from "lucide-react";
import type { AssessmentResponseView, AssessmentSectionCode, AssessmentTaskView, SaveAssessmentResponseInput } from "@e4s/contracts";
import type { AssessmentView, LearnerCallbacks } from "./contracts.js";
import { AssessmentRecorder, AssessmentRuntime, type AssessmentRuntimeState } from "./AssessmentRuntime.js";
import { Button, ErrorText, Modal, Notice, PageTitle, Progress, AppLink, Toast } from "./ui.js";
import { useExperience } from "../../features/experience/Experience.js";
import { cancelExclusiveAudio } from "../../features/experience/audio-precedence.js";

const sectionOrder: AssessmentSectionCode[] = ["listening", "reading", "writing", "speaking"];
const soundCheckText = "Đây là câu kiểm tra âm thanh. Nếu bạn nghe rõ câu này, tai nghe của bạn đã sẵn sàng.";

export function LearnerAssessment({ view, actions }: { view: AssessmentView; actions: LearnerCallbacks }) {
  const experience = useExperience();
  const holdMusicRef = useRef(experience.holdMusic);
  const [local, setLocal] = useState<Record<string, string>>(() => Object.fromEntries((view.attempt?.responses ?? []).map((item) => [item.taskKey, item.value])));
  const [busy, setBusy] = useState(false);
  const [savingCount, setSavingCount] = useState(0);
  const savingCountRef = useRef(0);
  const audioBusyTasksRef = useRef(new Set<string>());
  const [audioBusyCount, setAudioBusyCount] = useState(0);
  const latestInputsRef = useRef<Record<string, SaveAssessmentResponseInput>>(Object.fromEntries(
    (view.attempt?.responses ?? []).map((response) => [responseDraftKey(response.section, response.taskKey), responseInput(response)])
  ));
  const [starting, setStarting] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [checkingMicrophone, setCheckingMicrophone] = useState(false);
  const [microphoneSamples, setMicrophoneSamples] = useState<number[]>([]);
  const [microphoneCheck, setMicrophoneCheck] = useState<"unknown" | "ready" | "denied">("unknown");
  const [microphoneMessage, setMicrophoneMessage] = useState<string>();
  const [localError, setLocalError] = useState<string>();
  const [equipment, setEquipment] = useState({ sound: "chưa thử", microphone: "chưa thử" });
  const definition = view.definition;
  const targetLevel = assessmentTargetLevel(view);

  useEffect(() => { holdMusicRef.current = experience.holdMusic; }, [experience.holdMusic]);

  useEffect(() => {
    const assessmentInProgress = Boolean(view.attempt)
      && view.screenState !== "preparation"
      && view.screenState !== "pending"
      && view.screenState !== "submitting";
    holdMusicRef.current(assessmentInProgress);
    return () => holdMusicRef.current(false);
  }, [view.attempt, view.screenState]);

  useEffect(() => () => cancelExclusiveAudio("speech"), [view.attempt?.id, view.screenState]);

  useEffect(() => {
    setLocal(Object.fromEntries((view.attempt?.responses ?? []).map((item) => [item.taskKey, item.value])));
    latestInputsRef.current = Object.fromEntries(
      (view.attempt?.responses ?? []).map((response) => [responseDraftKey(response.section, response.taskKey), responseInput(response)])
    );
    setLocalError(undefined);
    setSavingCount(0);
    savingCountRef.current = 0;
    audioBusyTasksRef.current.clear();
    setAudioBusyCount(0);
  }, [view.attempt?.id]);

  const onAudioBusyChange = useCallback((taskKey: string, pending: boolean) => {
    if (pending) audioBusyTasksRef.current.add(taskKey);
    else audioBusyTasksRef.current.delete(taskKey);
    setAudioBusyCount(audioBusyTasksRef.current.size);
  }, []);

  const checkSound = () => {
    setLocalError(undefined);
    setEquipment((current) => ({ ...current, sound: "Đang phát…" }));
    actions.speak(soundCheckText, "vi-VN", {
      audioSrc: "/media/audio/sound-check-vi.mp3",
      onStatus: (status) => setEquipment((current) => ({ ...current, sound: soundCheckStatus(status) }))
    });
  };

  const checkMicrophoneForTest = async () => {
    if (checkingMicrophone) return;
    setLocalError(undefined);
    setMicrophoneMessage(undefined);
    setCheckingMicrophone(true);
    setMicrophoneSamples([]);
    setEquipment((current) => ({ ...current, microphone: "đang kiểm tra…" }));
    try {
      const result = await checkMicrophone((level) => {
        setMicrophoneSamples((current) => [...current, level].slice(-72));
      });
      setMicrophoneCheck(result.ok ? "ready" : "denied");
      setMicrophoneMessage(result.ok ? undefined : result.message);
      setEquipment((current) => ({ ...current, microphone: result.ok ? "Micro sẵn sàng ✓" : "Chưa kiểm tra được" }));
    } finally {
      setCheckingMicrophone(false);
    }
  };

  const start = async () => {
    if (starting || checkingMicrophone) return;
    setStartConfirmOpen(false);
    setStarting(true);
    setLocalError(undefined);
    try {
      await actions.startAssessment();
    } catch {
      setLocalError("Không thể bắt đầu bài test lúc này. Hãy kiểm tra kết nối rồi thử lại.");
    } finally {
      setStarting(false);
    }
  };

  if (view.screenState === "preparation" || !view.attempt) return <div className="app-learner-page test-page">
    <PageTitle title={assessmentHeading(view)} aside={<AppLink className="btn btn-sm" href="/home" navigate={actions.navigate}>Về trang chủ</AppLink>} />
    <section className="card">
      <h2>{definition.title}</h2>
      <div className="table-wrap"><table className="assessment-structure-table" aria-label="Cấu trúc bài test" style={{ width: "100%", tableLayout: "fixed" }}><colgroup><col style={{ width: "13%" }} /><col style={{ width: "18%" }} /><col style={{ width: "12%" }} /><col style={{ width: "57%" }} /></colgroup><thead><tr><th>Phần</th><th>Thời gian</th><th>Điểm</th><th>Nội dung</th></tr></thead><tbody>{definition.sections.map((section) => <tr key={section.code}><td>{sectionTableTitle(section.code)}</td><td>{view.timed === false ? "—" : `${section.durationMinutes} phút`}</td><td><b>{section.maxScore}</b></td><td>{sectionSummary(section.code)}</td></tr>)}</tbody></table></div>
      {definition.kind === "level-up" && targetLevel ? <Notice>Đề ngắn ở mức <b>{targetLevel}</b>. Đạt khi tổng ≥70/100 và mỗi kỹ năng ≥50%; sau đó hoàn thành <b>6 lượt thử thách với Season</b> để gửi yêu cầu duyệt. Nếu chưa đạt, bạn có thể thử lại sau <b>14 ngày</b>.</Notice> : targetLevel ? <Notice>Đề ngắn ở mức <b>{targetLevel}</b>. Đạt khi tổng ≥70/100 và mỗi kỹ năng ≥50%.</Notice> : null}
      <h3>Quy định làm bài – đọc trước khi bắt đầu</h3>
      <div className="grid cols-3 assessment-rules"><Rule title="Bắt buộc" icon={<CheckCircle2 size={17} aria-hidden="true" />} tone="var(--mint)" lines={["Làm một mạch theo thứ tự Nghe → Đọc → Viết → Nói.", "Chuẩn bị tai nghe/loa và micro; ở lại trang đến khi nộp.", "Phần Nói: ghi âm trực tiếp hoặc tải file."]} /><Rule title="Không được phép" icon={<Ban size={17} aria-hidden="true" />} tone="var(--peach)" lines={["Không mở tab/cửa sổ khác, không dịch/AI, không quay lại phần đã nộp.", "Mỗi đoạn nghe chỉ được phát tối đa 2 lần."]} /><Rule title="Lưu ý" icon={<Clock3 size={17} aria-hidden="true" />} tone="var(--butter)" lines={[`Câu trả lời được tự động lưu; đồng hồ ${view.timed === false ? "không giới hạn" : "chạy liên tục, kể cả khi bạn thoát ra và không thể tạm dừng"}.`, view.timed === false ? "Không tính giờ, nhưng nộp phần nào là khoá phần đó." : "Hết giờ tự chuyển phần; rời màn hình sẽ hiện cảnh báo để bạn quay lại.", "Vượt quá 3 cảnh báo sẽ tự động nộp bài."]} /></div>
      {definition.kind === "placement" ? <article className="card flat assessment-why" aria-label="Vì sao cần bài test"><div className="assessment-why-line"><Sprout size={18} aria-hidden="true" /><b>Vì sao cần bước này?</b><span>Bài test chọn mức vừa sức; hãy làm đúng khả năng, không cần ôn trước.</span></div></article> : null}
      <div className="row prep" role="group" aria-label="Cần chuẩn bị: tai nghe hoặc loa, và micro, kể cả mic trên tai nghe"><button type="button" aria-label="Thử tai nghe" data-equipment="sound" className={`prep-device ${equipment.sound === "Đã phát xong ✓" ? "is-ready" : ""}`} title="Tai nghe hoặc loa" onClick={checkSound}><Headphones size={18} aria-hidden="true" /> Tai nghe</button><button type="button" aria-label="Thử micro" data-equipment="microphone" className={`prep-device ${equipment.microphone === "Micro sẵn sàng ✓" ? "is-ready" : ""}`} title="Micro trên máy hoặc mic tai nghe" disabled={checkingMicrophone} onClick={() => void checkMicrophoneForTest()}><Mic size={18} aria-hidden="true" /> Micro</button><div className="stack prep-checks"><div className="row prep-check"><button className="btn-sm" type="button" onClick={checkSound}>Nghe thử</button><span className="xs muted" role="status" aria-label="Trạng thái âm thanh" aria-live="polite">{equipment.sound}</span></div><div className="row prep-check"><button className="btn-sm" type="button" disabled={checkingMicrophone} onClick={() => void checkMicrophoneForTest()}>Kiểm tra micro</button><span className="xs muted" role="status" aria-label="Trạng thái micro" aria-live="polite">{equipment.microphone}</span></div>{checkingMicrophone || microphoneSamples.length > 0 ? <MicrophoneWaveform samples={microphoneSamples} active={checkingMicrophone} /> : null}</div></div>
      <ScoreScale />
      {microphoneCheck === "denied" ? <p className="small form-error" role="alert">{microphoneMessage ?? "Chưa truy cập được micro. Hãy cấp quyền rồi thử lại."}</p> : null}
      <ErrorText id="assessment-start-error" message={localError} />
      <div className="row assessment-start-actions"><AppLink className="btn" href={definition.kind === "placement" ? "/onboard" : "/home"} navigate={actions.navigate}>← {definition.kind === "placement" ? "Quay lại hồ sơ" : "Quay lại"}</AppLink><button className="btn-primary assessment-start-button assessment-start-primary" type="button" aria-label={view.attempt ? "Tiếp tục bài đang làm" : "Bắt đầu phần Nghe"} aria-describedby={localError ? "assessment-start-error" : undefined} aria-busy={starting || undefined} disabled={starting || checkingMicrophone} onClick={() => setStartConfirmOpen(true)}>{starting ? <><span className="spinner" aria-hidden="true" /> Đang bắt đầu…</> : view.attempt ? "Tiếp tục bài đang làm" : "Bắt đầu phần Nghe"}</button></div>
      {startConfirmOpen ? <Modal
        className="assessment-start-dialog"
        title={view.attempt ? "Tiếp tục bài test?" : "Bắt đầu bài test?"}
        onClose={() => setStartConfirmOpen(false)}
        actions={<><Button onClick={() => setStartConfirmOpen(false)}>Hủy</Button><Button variant="primary" onClick={() => void start()}>Tôi đã sẵn sàng, bắt đầu</Button></>}
      >
        <p className="assessment-start-copy"><b className="assessment-start-keyword">Câu trả lời được tự động lưu</b>, nhưng bài thi <b className="assessment-start-keyword">không thể tạm dừng</b>. <b className="assessment-start-keyword">Đồng hồ chạy liên tục</b>, tối đa <b className="assessment-start-keyword">{definition.totalMinutes} phút</b>. Hãy chắc là bạn có đủ thời gian và đã thử tai nghe, micro trước khi bắt đầu.</p>
      </Modal> : null}
    </section>
  </div>;

  if (view.screenState === "pending" || view.screenState === "submitting" || view.attempt.status !== "in_progress") {
    const submitting = view.screenState === "submitting";
    const pendingCopy = assessmentPendingCopy(view);
    return <div className="app-learner-page test-page">
      <PageTitle title={assessmentHeading(view)} aside={<AppLink className="btn btn-sm" href="/home" navigate={actions.navigate}>Về trang chủ</AppLink>} />
      <section className="card" role="status" aria-live="polite" aria-busy={submitting || undefined}>
        <h2>{submitting ? <><span className="spinner" aria-hidden="true" /> Đang chấm bài…</> : pendingCopy.title}</h2>
        <p>{submitting ? "Season đang tổng hợp kết quả. Đừng đóng trang này nhé." : pendingCopy.detail}</p>
        {!submitting && view.attempt.totalScore != null ? <AssessmentResult attempt={view.attempt} /> : null}
        <ErrorText message={view.submitError ?? localError} />
      </section>
    </div>;
  }

  const section = definition.sections.find((item) => item.code === view.screenState);
  if (!section || !view.attempt.currentSection) return <div className="app-learner-page"><Notice tone="danger">Không tìm thấy phần thi.</Notice></div>;
  const sectionIndex = sectionOrder.indexOf(section.code);
  const save = async (task: AssessmentTaskView, input: SaveAssessmentResponseInput) => {
    setLocal((current) => ({ ...current, [task.key]: input.value }));
    latestInputsRef.current[responseDraftKey(section.code, task.key)] = input;
    setLocalError(undefined);
    savingCountRef.current += 1;
    setSavingCount(savingCountRef.current);
    try { await actions.saveAssessmentResponse(section.code, task.key, input); }
    catch { setLocalError("Không lưu được câu trả lời. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại."); }
    finally {
      savingCountRef.current = Math.max(0, savingCountRef.current - 1);
      setSavingCount(savingCountRef.current);
    }
  };
  const complete = async () => {
    if (busy) return;
    const deadline = Date.now() + 6_000;
    while ((savingCountRef.current > 0 || audioBusyTasksRef.current.size > 0) && Date.now() < deadline) await new Promise((resolve) => window.setTimeout(resolve, 50));
    if (savingCountRef.current > 0 || audioBusyTasksRef.current.size > 0) {
      setLocalError("Đang lưu câu trả lời hoặc file ghi âm. Hãy chờ một chút rồi nộp lại.");
      return;
    }
    setBusy(true); setLocalError(undefined);
    try {
      for (const task of section.groups.flatMap((group) => group.tasks)) {
        const input = latestInputsRef.current[responseDraftKey(section.code, task.key)];
        if (!input || !input.value.trim() && !input.artifactKey) continue;
        await actions.saveAssessmentResponse(section.code, task.key, input);
      }
    } catch {
      setLocalError("Không lưu đủ câu trả lời lên hệ thống. Bài vẫn ở phần này; hãy kiểm tra kết nối rồi nộp lại.");
      setBusy(false);
      return;
    }
    try {
      if (section.code === "speaking") await actions.submitAssessment();
      else await actions.completeAssessmentSection(section.code);
    }
    catch { setLocalError("Không thể nộp phần này lúc này. Hãy kiểm tra kết nối rồi thử lại."); }
    finally { setBusy(false); }
  };
  return <AssessmentRuntime view={view} actions={actions}>{(runtime) => <>
    <ActiveAssessment
    view={view} actions={actions} section={section} sectionIndex={sectionIndex} runtime={runtime} local={local} busy={busy} savingCount={savingCount} audioBusyCount={audioBusyCount}
    error={view.submitError ?? localError} onSave={(task, input) => void save(task, input)} onComplete={() => void complete()} onAudioBusyChange={onAudioBusyChange}
    />
  </>}</AssessmentRuntime>;
}

function ActiveAssessment({ view, actions, section, sectionIndex, runtime, local, busy, savingCount, audioBusyCount, error, onSave, onComplete, onAudioBusyChange }: {
  view: AssessmentView;
  actions: LearnerCallbacks;
  section: AssessmentView["definition"]["sections"][number];
  sectionIndex: number;
  runtime: AssessmentRuntimeState;
  local: Record<string, string>;
  busy: boolean;
  savingCount: number;
  audioBusyCount: number;
  error: string | undefined;
  onSave: (task: AssessmentTaskView, input: SaveAssessmentResponseInput) => void;
  onComplete: () => void;
  onAudioBusyChange: (taskKey: string, busy: boolean) => void;
}) {
  const attempt = view.attempt!;
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [submitCountdown, setSubmitCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (submitCountdown === null) return;
    if (submitCountdown <= 0) {
      setSubmitCountdown(null);
      onComplete();
      return;
    }
    const timer = window.setTimeout(() => setSubmitCountdown((current) => current === null ? null : current - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [onComplete, submitCountdown]);
  useEffect(() => {
    if (!submitConfirm && submitCountdown === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (submitCountdown !== null) setSubmitCountdown(null);
      else setSubmitConfirm(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitConfirm, submitCountdown]);
  const submitDisabled = busy || submitCountdown !== null || savingCount > 0 || audioBusyCount > 0;
  const completionWarning = assessmentCompletionWarning(section, local, attempt.responses);
  return <>
  <div className="app-learner-page test-page">
    <PageTitle title={assessmentHeading(view)} detail="Thời gian vẫn chạy nếu bạn rời trang" />
    <section className="card flat assessment-runtime-header" style={{ position: "sticky", top: 64, zIndex: 5 }}>
      <div className="row between">
        <div className="row"><span className="badge">Phần {sectionIndex + 1}/4 · {section.title}</span><span className="badge primary" role="timer" aria-label="Thời gian còn lại">◷ {runtime.formattedTime}</span></div>
        <div className="row"><span className="xs muted">Cảnh báo {runtime.violationCount}/{runtime.violationLimit}</span><span className="badge warn" title="Câu trả lời được tự động lưu; đồng hồ vẫn chạy liên tục">Tự động lưu</span><button className="btn-sm btn-primary" type="button" aria-label={section.code === "speaking" ? "Nộp bài" : `Nộp phần ${section.title}`} aria-busy={busy || undefined} disabled={submitDisabled} onClick={() => setSubmitConfirm(true)}>{busy ? "Đang nộp…" : section.code === "speaking" ? "Nộp bài" : "Nộp phần này →"}</button></div>
      </div>
      <Progress value={sectionIndex + 1} max={sectionOrder.length} label="Tiến độ bài thi" segmented />
      <span className="sr-only" role="status" aria-live="polite">{savingCount > 0 ? "Đang lưu câu trả lời…" : "Các câu trả lời đã lưu"}</span>
    </section>
    <section className="card assessment-content-card">
      <h2>Phần {sectionIndex + 1} – {section.title} <span className="badge">{section.maxScore} điểm</span></h2>
      {section.instructions.length ? <p className="small assessment-section-instructions">{section.instructions.join(" · ")}</p> : null}
      <div className="assessment-section-groups">
    {section.groups.map((group, groupIndex) => <section className={`card soft assessment-task-group assessment-task-group-${section.code}`} style={{ marginTop: 0 }} key={group.key}>
      <div className="assessment-task-group-heading"><h3 className="assessment-task-group-title">{group.title}</h3>{section.code === "writing" && group.tasks.length === 1 ? <span className="badge">{group.tasks[0]?.maxScore} điểm</span> : null}</div>
      <p className="assessment-task-group-instruction">{group.instruction}</p>
      <div className="assessment-task-content" style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {group.stimulus ? <Stimulus stimulus={group.stimulus} maxPlays={group.maxPlays ?? 0} played={attempt.audioPlayCounts[`${section.code}:${group.key}`] ?? runtimeAudioCount(view, section.code, group.key)} onPlay={async (text, audioSrc) => {
          let recordedPlayCount: number | null = null;
          try {
            const result = await actions.recordAssessmentAudioPlay(section.code, group.key);
            recordedPlayCount = result.playCount;
            if (!audioSrc) {
              await new Promise<void>((resolve, reject) => actions.speak(text, "en-GB", {
                rate: 0.86,
                onStatus: (status) => {
                  if (status === "ended") resolve();
                  if (status === "cancelled" || status === "error" || status === "unsupported" || status === "no_voice") reject(new Error(status));
                }
              }));
            } else {
              await new Promise<void>((resolve, reject) => {
                actions.speak(text, "en-GB", {
                  audioSrc,
                  onStatus: (status) => {
                    if (status === "ended") resolve();
                    if (status === "cancelled" || status === "error" || status === "unsupported" || status === "no_voice") reject(new Error(status));
                  }
                });
              });
            }
            return result.playCount;
          }
          catch (error) { return error instanceof Error && error.message === "cancelled" ? recordedPlayCount : null; }
        }} /> : null}
        {group.tasks.map((task, index) => {
          const response = findResponse(attempt.responses, section.code, task.key);
          const number = section.groups.slice(0, groupIndex).reduce((total, candidate) => total + candidate.tasks.length, 0) + index + 1;
          return <Task key={task.key} task={task} number={number} value={local[task.key] ?? response?.value ?? ""} response={response} view={view} actions={actions} section={section.code} showHeading={section.code !== "writing" && section.code !== "speaking"} onSave={(input) => onSave(task, input)} onAudioBusyChange={onAudioBusyChange} />;
        })}
      </div>
    </section>)}
      </div>
    </section>
  </div>
  {runtime.warning === "five_minutes" ? <Toast tone="warn"><Clock3 size={17} aria-hidden="true" /> Còn 5 phút. Hãy kiểm tra lại câu trả lời trước khi nộp.</Toast> : null}
  {runtime.warning === "one_minute" ? <Toast tone="warn"><Clock3 size={17} aria-hidden="true" /> Còn 1 phút! Hết giờ hệ thống sẽ tự chuyển phần.</Toast> : null}
  {error ? <Toast tone="danger">{error}</Toast> : null}
  {submitConfirm ? <SubmitConfirm final={section.code === "speaking"} section={section.title} warningTitle={section.code === "writing" ? "Chưa đủ số từ." : section.code === "speaking" ? "Chưa có nội dung trả lời." : "Chưa trả lời hết."} {...(completionWarning ? { warning: completionWarning } : {})} onCancel={() => setSubmitConfirm(false)} onAccept={() => { cancelExclusiveAudio("speech"); setSubmitConfirm(false); setSubmitCountdown(5); }} /> : null}
  {submitCountdown !== null ? <SubmitCountdown final={section.code === "speaking"} count={submitCountdown} onStop={() => setSubmitCountdown(null)} /> : null}
  </>;
}

function SubmitConfirm({ final, section, warning, warningTitle, onCancel, onAccept }: { final: boolean; section: string; warning?: string; warningTitle: string; onCancel: () => void; onAccept: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-submit-confirm-title" aria-describedby="assessment-submit-confirm-description" tabIndex={-1} onKeyDown={trapDialogFocus}>
    <h2 id="assessment-submit-confirm-title">{final ? "Nộp bài kiểm tra?" : `Nộp phần ${section} và chuyển tiếp?`}</h2>
    <p id="assessment-submit-confirm-description">{final ? "Bạn sẽ không thể quay lại bài kiểm tra. Đồng hồ vẫn chạy trong lúc đếm ngược." : "Bạn sẽ không quay lại phần này được. Đồng hồ vẫn chạy trong lúc đếm ngược."}</p>
    {warning ? <div id="assessment-submit-confirm-warning" className="assessment-submit-warning" role="note" aria-atomic="true"><strong>{warningTitle}</strong><span>{warning}</span></div> : null}
    <div className="row" style={{ justifyContent: "flex-end" }}><button ref={cancelRef} className="btn" type="button" onClick={onCancel}>Huỷ</button><button className="btn btn-primary" type="button" onClick={onAccept}>{final ? "Nộp bài" : "Nộp phần này"}</button></div>
  </div></div>;
}

function SubmitCountdown({ final, count, onStop }: { final: boolean; count: number; onStop: () => void }) {
  const stopRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stopRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" role="presentation"><div className="dialog assessment-submit-countdown-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-submit-countdown-title" aria-describedby="assessment-submit-countdown-description" tabIndex={-1} onKeyDown={trapDialogFocus}>
    <h2 id="assessment-submit-countdown-title">{final ? "Nộp bài kiểm tra" : "Nộp phần này"} sau {count} giây…</h2>
    <p id="assessment-submit-countdown-description" className="small">Thao tác này không hoàn tác được. Bấm <b>Dừng lại</b> nếu bạn đổi ý.</p>
    <div className="assessment-auto-countdown" aria-live="assertive">{count}</div>
    <div className="row" style={{ justifyContent: "center" }}><button ref={stopRef} className="btn-sm btn-x" type="button" onClick={onStop}>Dừng lại</button></div>
  </div></div>;
}

function Rule({ title, icon, tone, lines }: { title: string; icon: ReactNode; tone: string; lines: string[] }) { return <article className="card flat assessment-rule" style={{ background: tone }}><div className="eyebrow" style={{ color: "var(--text)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>{icon}<span>{title}</span></div><ul className="small assessment-rule-list">{lines.map((line) => <li key={line}>{line}</li>)}</ul></article>; }

function MicrophoneWaveform({ samples, active }: { samples: number[]; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    const center = height / 2;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ddd8d0";
    context.fillRect(0, center - 0.5, width, 1);
    context.fillStyle = "#b75c22";
    const barWidth = 3;
    const gap = 2;
    const visible = samples.slice(-Math.floor(width / (barWidth + gap)));
    visible.forEach((sample, index) => {
      const amplitude = Math.max(2, Math.round((Math.min(100, sample) / 100) * (height - 8)));
      context!.fillRect(index * (barWidth + gap), center - amplitude / 2, barWidth, amplitude);
    });
  }, [samples]);

  return <div className={`microphone-waveform${active ? " is-active" : ""}`}>
    <canvas ref={canvasRef} width={300} height={46} role="img" aria-label="Dạng sóng giọng nói khi kiểm tra micro" data-sample-count={samples.length} />
    <span className="xs muted">{active ? "Hãy nói một câu ngắn…" : "Đã nhận giọng nói"}</span>
  </div>;
}

function sectionSummary(code: AssessmentSectionCode) {
  return ({
    listening: "3 đoạn audio, 15 câu, mỗi đoạn nghe tối đa 2 lần",
    reading: "Đọc, ngữ pháp & từ vựng · 40 câu",
    writing: "2 task: 50–80 từ + 120–150 từ, chấm theo rubric 5 tiêu chí",
    speaking: "4 bài Nói; ghi âm trực tiếp hoặc tải file âm thanh"
  } as const)[code];
}

function sectionTableTitle(code: AssessmentSectionCode) {
  return ({ listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" } as const)[code];
}

function ScoreScale() {
  return <p className="assessment-score-line" role="note">Thang điểm /100: A1 0–24 · A2 25–44 · B1 45–64 · B2 65–84 · C1 85–100.</p>;
}

function soundCheckStatus(status: string) {
  if (status === "started") return "Đang phát…";
  if (status === "ended") return "Đã phát xong ✓";
  if (status === "unsupported") return "Trình duyệt không hỗ trợ âm thanh";
  if (status === "no_voice") return "Chưa có giọng Việt trên máy";
  return "Không phát được âm thanh";
}

function AssessmentResult({ attempt }: { attempt: NonNullable<AssessmentView["attempt"]> }) {
  const scores = sectionOrder.flatMap((code) => attempt.sectionScores?.[code] == null ? [] : [[code, attempt.sectionScores[code]!] as const]);
  return <div className="card flat" aria-label="Kết quả bài đánh giá">
    <div className="row between"><b>Tổng điểm</b><strong>{attempt.totalScore}/100{attempt.suggestedLevel ? ` · ${attempt.suggestedLevel}` : ""}</strong></div>
    {scores.length ? <div className="grid cols-2" style={{ marginTop: 10 }}>{scores.map(([code, score]) => <div className="row between" key={code}><span>{sectionLabel(code)}</span><b>{score}</b></div>)}</div> : null}
  </div>;
}

function Stimulus({ stimulus, maxPlays, played, onPlay }: { stimulus: AssessmentView["definition"]["sections"][number]["groups"][number]["stimulus"]; maxPlays: number; played: number; onPlay: (text: string, audioSrc?: string) => Promise<number | null> }) {
  const [playCount, setPlayCount] = useState(played);
  const [playError, setPlayError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [confirmLastPlay, setConfirmLastPlay] = useState(false);
  useEffect(() => {
    setPlayCount((current) => Math.max(current, played));
  }, [played]);
  if (!stimulus) return null;
  const text = stimulus.text ?? stimulus.lines?.map((line) => line.text).join(" ") ?? "";
  const remaining = Math.max(0, maxPlays - playCount);
  const play = async () => {
    setPlayError(false);
    setIsPlaying(true);
    try {
      const nextCount = await onPlay(text, stimulus.audioSrc);
      if (nextCount == null) {
        setPlayError(true);
        return;
      }
      setPlayCount((current) => Math.max(current, nextCount));
    } finally {
      setIsPlaying(false);
    }
  };
  const requestPlay = () => {
    if (maxPlays > 0 && remaining === 1) {
      setConfirmLastPlay(true);
      return;
    }
    void play();
  };
  return <>
    <div className="card soft assessment-stimulus-card">{stimulus.type === "audio_script" ? <div className="assessment-audio-player"><div className="assessment-audio-controls"><b>Đoạn nghe</b><button className="btn-sm" type="button" disabled={isPlaying || (maxPlays > 0 && remaining === 0)} onClick={requestPlay}><Volume2 size={16} aria-hidden="true" /> {maxPlays > 0 && remaining === 0 ? "Đã hết lượt nghe" : isPlaying ? "Đang phát…" : `Nghe${maxPlays > 0 ? ` (còn ${remaining} lần)` : " audio"}`}</button></div>{playError ? <p className="small form-error" role="alert">Không phát được audio lúc này. Hãy kiểm tra âm thanh rồi thử lại.</p> : null}</div> : stimulus.type === "table" ? <table className="assessment-speaking-table" aria-label="Dữ liệu khiếu nại theo quý"><thead><tr>{stimulus.headers?.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{stimulus.rows?.map((row, rowIndex) => <tr key={`${row[0] ?? "row"}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table> : <p style={{ whiteSpace: "pre-line" }}>{text}</p>}</div>
    {confirmLastPlay ? <Modal
      className="assessment-audio-confirm-dialog"
      title="Nghe lần cuối?"
      description="Bạn chỉ còn 1 lượt nghe cho đoạn này."
      onClose={() => setConfirmLastPlay(false)}
      actions={<><Button onClick={() => setConfirmLastPlay(false)}>Hủy</Button><Button variant="primary" onClick={() => { setConfirmLastPlay(false); void play(); }}>Nghe lần cuối</Button></>}
    >
      <p className="small muted">Sau lượt này, bạn sẽ không thể phát lại đoạn nghe.</p>
    </Modal> : null}
  </>;
}

function Task({ task, number, value, response, view, actions, section, showHeading = true, onSave, onAudioBusyChange }: { task: AssessmentTaskView; number: number; value: string; response: AssessmentResponseView | undefined; view: AssessmentView; actions: LearnerCallbacks; section: AssessmentSectionCode; showHeading?: boolean; onSave: (input: SaveAssessmentResponseInput) => void; onAudioBusyChange: (taskKey: string, busy: boolean) => void }) {
  const promptId = `assessment-task-${task.key}-prompt`;
  const hintId = `assessment-task-${task.key}-hint`;
  const answerHint = [task.minWords ? `Tối thiểu ${task.minWords} từ.` : null, task.maxWords ? `Tối đa ${task.maxWords} từ.` : null].filter(Boolean).join(" ");
  const wordTarget = task.minWords && task.maxWords ? `${task.minWords}–${task.maxWords}` : task.minWords ? `≥ ${task.minWords}` : task.maxWords ? `${task.maxWords}` : null;
  return <article className={`card flat assessment-task-card${showHeading ? "" : " assessment-task-response"}`} data-task-key={task.key}>
    {showHeading ? <div className="assessment-task-heading"><h4>{task.title ?? `Task ${number}`}</h4><span className="badge">{task.maxScore} điểm</span></div> : null}
    <p id={promptId} className="assessment-task-prompt" style={task.responseType === "speaking_evidence" ? { whiteSpace: "pre-line" } : undefined}>{renderAssessmentPrompt(task.prompt)}</p>
    {task.interaction ? <div className="card soft assessment-roleplay-brief" role="note">
      <b>Khách hàng mở đầu:</b>
      <p>{task.interaction.openingMessage}</p>
      <span className="small muted">Tối đa {task.interaction.maxLearnerTurns} lượt hoặc {Math.floor(task.interaction.durationSeconds / 60)} phút; kết thúc sớm khi khách hàng chấp nhận giải pháp. Nếu hệ thống không thể tạo lượt phản hồi, bản ghi một chiều vẫn được lưu và chuyển duyệt tay.</span>
    </div> : null}
    {task.hint ? <p className="small muted assessment-task-hint">{task.hint}</p> : null}
    {task.responseType === "single_choice" ? <fieldset aria-labelledby={promptId} style={{ border: 0, margin: 0, padding: 0 }}><legend className="sr-only">Chọn một đáp án</legend>{task.options?.map((option) => <label className={`opt assessment-choice ${value === option.value ? "sel" : ""}`} key={option.value}><input className="assessment-choice-input" type="radio" name={task.key} checked={value === option.value} aria-describedby={answerHint ? hintId : undefined} onChange={() => onSave({ value: option.value, evidenceType: "choice" })} /><span>{option.label}</span></label>)}</fieldset> : task.responseType === "speaking_evidence" ? null : <>
      <label><span className="sr-only">Câu trả lời {task.key}</span><textarea aria-label={`Câu trả lời ${task.key}`} aria-labelledby={promptId} aria-describedby={answerHint ? hintId : undefined} value={value} minLength={task.minWords} onChange={(event) => onSave({ value: limitWords(event.target.value, task.maxWords), evidenceType: "text" })} placeholder="Nhập câu trả lời" /></label>
      {wordTarget ? <div className="assessment-word-count" aria-live="polite">{wordCount(value)} / {wordTarget} từ</div> : null}
    </>}
    {answerHint ? <span id={hintId} className="sr-only">{answerHint}</span> : null}
    {task.responseType === "speaking_evidence" ? <AssessmentRecorder taskKey={task.key} view={view} actions={actions} onEvidence={onSave} onBusyChange={onAudioBusyChange} /> : null}
  </article>;
}

function renderAssessmentPrompt(prompt: string): ReactNode {
  const blankPattern = /((?:-\s*){3,}|(?:_\s*){3,})/gu;
  const blankPartPattern = /^(?:(?:-\s*){3,}|(?:_\s*){3,})$/u;
  return prompt.split(blankPattern).filter(Boolean).map((part, index) => blankPartPattern.test(part)
    ? <span className="assessment-blank-underline" role="img" aria-label="Ô trống cần điền" key={`blank-${index}`} />
    : <span key={`text-${index}`}>{part.replace(/\s{2,}/gu, " ")}</span>);
}

function findResponse(responses: AssessmentResponseView[], section: AssessmentSectionCode, taskKey: string) { return responses.find((item) => item.section === section && item.taskKey === taskKey); }

function responseDraftKey(section: AssessmentSectionCode, taskKey: string) { return `${section}:${taskKey}`; }

function responseInput(response: AssessmentResponseView): SaveAssessmentResponseInput {
  return {
    value: response.value,
    evidenceType: response.evidenceType,
    ...(response.artifactKey ? { artifactKey: response.artifactKey } : {})
  };
}

function assessmentCompletionWarning(section: AssessmentView["definition"]["sections"][number], local: Record<string, string>, responses: AssessmentResponseView[]) {
  const valueFor = (task: AssessmentTaskView) => local[task.key] ?? findResponse(responses, section.code, task.key)?.value ?? "";
  const tasks = section.groups.flatMap((group) => group.tasks);
  if (section.code === "listening" || section.code === "reading") {
    const missing = tasks.filter((task) => !valueFor(task).trim()).length;
    return missing ? `Còn ${missing} câu chưa trả lời.` : undefined;
  }
  if (section.code === "writing") {
    const short = tasks.flatMap((task, index) => task.minWords && wordCount(valueFor(task)) < task.minWords ? [{ task, index }] : []);
    if (!short.length) return undefined;
    return `${short.map(({ task, index }) => `Task ${index + 1}: ${wordCount(valueFor(task))}/${task.minWords}–${task.maxWords ?? ""} từ`).join(" · ")}.`;
  }
  const empty = tasks.filter((task) => !wordCount(valueFor(task))).length;
  return empty ? `Còn ${empty} task chưa có câu trả lời.` : undefined;
}

function wordCount(value: string) { return value.trim() ? value.trim().split(/\s+/).length : 0; }

function limitWords(value: string, maxWords?: number) {
  if (!maxWords || wordCount(value) <= maxWords) return value;
  return value.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

function runtimeAudioCount(view: AssessmentView, section: AssessmentSectionCode, groupKey: string) {
  return view.runtime?.audioPlayCounts[`${section}:${groupKey}`] ?? view.attempt?.runtime?.audioPlayCounts[`${section}:${groupKey}`] ?? 0;
}

async function checkMicrophone(onLevel: (level: number) => void): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, message: "Trình duyệt không hỗ trợ kiểm tra micro." };
  try {
    const stream = await openMicrophoneStream();
    const tracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : stream.getTracks();
    if (tracks.length) await sampleMicrophoneLevel(stream, onLevel);
    stream.getTracks().forEach((track) => track.stop());
    return tracks.length ? { ok: true } : { ok: false, message: "Chưa tìm thấy micro. Hãy kết nối hoặc chọn micro rồi thử lại." };
  } catch (error) {
    const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
    if (name === "NotAllowedError" || name === "SecurityError") return { ok: false, message: "Quyền micro đang bị chặn. Hãy cho phép micro cho trang này rồi bấm kiểm tra lại." };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { ok: false, message: "Chưa tìm thấy micro. Hãy kết nối hoặc chọn micro rồi thử lại." };
    return { ok: false, message: "Chưa truy cập được micro. Hãy cấp quyền rồi thử lại." };
  }
}

async function sampleMicrophoneLevel(stream: MediaStream, onLevel: (level: number) => void) {
  if (typeof window.AudioContext === "undefined") {
    onLevel(100);
    return;
  }
  const context = new window.AudioContext();
  const analyser = context.createAnalyser();
  const source = context.createMediaStreamSource(stream);
  const samples = new Uint8Array(analyser.fftSize);
  source.connect(analyser);
  const startedAt = performance.now();
  try {
    await new Promise<void>((resolve) => {
      const read = () => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
        onLevel(Math.min(100, Math.round(Math.sqrt(energy / samples.length) * 420)));
        if (performance.now() - startedAt >= 1600) resolve();
        else window.requestAnimationFrame(read);
      };
      read();
    });
  } finally {
    source.disconnect();
    await context.close();
  }
}

async function openMicrophoneStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (firstError) {
    const firstName = typeof firstError === "object" && firstError !== null && "name" in firstError ? String(firstError.name) : "";
    if (firstName !== "NotFoundError" && firstName !== "OverconstrainedError" || !navigator.mediaDevices.enumerateDevices) throw firstError;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === "audioinput" && device.deviceId);
    let lastError: unknown = firstError;
    for (const device of inputs) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: device.deviceId } } });
      } catch (error) {
        lastError = error;
        const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
        if (name === "NotAllowedError" || name === "SecurityError") throw error;
      }
    }
    throw lastError;
  }
}

function assessmentHeading(view: AssessmentView) {
  if (view.definition.kind === "placement") return "Test đầu vào";
  const targetLevel = assessmentTargetLevel(view);
  return targetLevel ? `Bài thi lên mức ${targetLevel}` : "Bài thi lên mức";
}

function assessmentPendingCopy(view: AssessmentView): { title: string; detail: string } {
  const status = view.attempt?.status;
  if (view.definition.kind === "level-up") {
    const target = assessmentTargetLevel(view);
    const label = target ? `Bài thi lên mức ${target}` : "Bài thi lên mức";
    if (status === "approved") return { title: `${label} đã được duyệt`, detail: "Bằng chứng đã được người vận hành duyệt. Hãy về trang chủ để xem bước tiếp theo." };
    return { title: `${label} đang chờ chấm`, detail: "Đã nộp bài. Sau khi chấm, bạn sẽ thấy trạng thái thử thách hoặc yêu cầu duyệt mức trên trang chủ." };
  }
  if (status === "approved") return { title: "Test đầu vào đã được duyệt", detail: "Mức học sẽ được mở theo hồ sơ của bạn ngay khi hệ thống cập nhật." };
  return { title: "Test đầu vào đã được nộp", detail: "Vận hành sẽ xem lại kết quả trước khi duyệt mức. Bạn không cần làm lại bài trong lúc chờ." };
}

function assessmentTargetLevel(view: AssessmentView) {
  return view.targetLevel ?? view.definition.title.match(/\b(A1|A2|B1|B2|C1)\b/)?.[1] ?? null;
}

function sectionLabel(section: AssessmentSectionCode) {
  return ({ listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" } as const)[section];
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
