import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AssessmentResponseView, AssessmentSectionCode, AssessmentTaskView, SaveAssessmentResponseInput } from "@e4s/contracts";
import type { AssessmentView, LearnerCallbacks } from "./contracts.js";
import { AssessmentRecorder, AssessmentRuntime, type AssessmentRuntimeState } from "./AssessmentRuntime.js";
import { ErrorText, Notice, PageTitle, Progress, AppLink } from "./ui.js";

const sectionOrder: AssessmentSectionCode[] = ["listening", "reading", "writing", "speaking"];

export function LearnerAssessment({ view, actions }: { view: AssessmentView; actions: LearnerCallbacks }) {
  const [local, setLocal] = useState<Record<string, string>>(() => Object.fromEntries((view.attempt?.responses ?? []).map((item) => [item.taskKey, item.value])));
  const [busy, setBusy] = useState(false);
  const [savingCount, setSavingCount] = useState(0);
  const savingCountRef = useRef(0);
  const [starting, setStarting] = useState(false);
  const [checkingMicrophone, setCheckingMicrophone] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [equipment, setEquipment] = useState({ sound: "chưa thử", microphone: "chưa thử" });
  const definition = view.definition;
  const targetLevel = assessmentTargetLevel(view);
  const microphoneSupported = view.microphoneSupported ?? view.runtime?.deviceEvidence.microphoneSupported ?? view.attempt?.runtime?.deviceEvidence.microphoneSupported;

  const checkSound = () => {
    setLocalError(undefined);
    actions.speak("Đây là câu kiểm tra âm thanh. Nếu nghe rõ, tai nghe đã sẵn sàng.");
    setEquipment((current) => ({ ...current, sound: "Đã phát câu mẫu ✓" }));
  };

  const checkMicrophoneForTest = async () => {
    if (checkingMicrophone) return;
    setLocalError(undefined);
    setCheckingMicrophone(true);
    setEquipment((current) => ({ ...current, microphone: "đang kiểm tra…" }));
    try {
      const ok = await checkMicrophone(setLocalError);
      setEquipment((current) => ({ ...current, microphone: ok ? "Micro sẵn sàng ✓" : "Chưa kiểm tra được" }));
    } finally {
      setCheckingMicrophone(false);
    }
  };

  const start = async () => {
    if (starting || checkingMicrophone) return;
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
      <div className="table-wrap"><table aria-label="Cấu trúc bài test" style={{ width: "100%", tableLayout: "fixed" }}><colgroup><col style={{ width: "20%" }} /><col style={{ width: "24%" }} /><col style={{ width: "18%" }} /><col style={{ width: "38%" }} /></colgroup><thead><tr><th style={{ padding: "8px 6px", whiteSpace: "normal", overflowWrap: "normal", wordBreak: "normal" }}>Phần</th><th style={{ padding: "8px 6px", whiteSpace: "normal", overflowWrap: "normal", wordBreak: "normal" }}>Thời gian</th><th style={{ padding: "8px 6px", whiteSpace: "normal", overflowWrap: "normal", wordBreak: "normal" }}>Điểm</th><th style={{ padding: "8px 6px", whiteSpace: "normal", overflowWrap: "normal", wordBreak: "normal" }}>Nội dung</th></tr></thead><tbody>{definition.sections.map((section) => <tr key={section.code}><td style={{ padding: "8px 6px", overflowWrap: "anywhere" }}>{section.title}</td><td style={{ padding: "8px 6px", overflowWrap: "anywhere" }}>{view.timed === false ? "—" : `${section.durationMinutes} phút`}</td><td style={{ padding: "8px 6px" }}>{section.maxScore}</td><td style={{ padding: "8px 6px", overflowWrap: "anywhere" }}>{section.instructions.join(" · ")}</td></tr>)}</tbody></table></div>
      {definition.kind === "level-up" && targetLevel ? <Notice>Đề ngắn ở mức <b>{targetLevel}</b>. Đạt khi tổng ≥70/100 và mỗi kỹ năng ≥50%; sau đó hoàn thành <b>6 lượt thử thách với Season</b> để gửi yêu cầu duyệt. Nếu chưa đạt, bạn có thể thử lại sau <b>14 ngày</b>.</Notice> : targetLevel ? <Notice>Đề ngắn ở mức <b>{targetLevel}</b>. Đạt khi tổng ≥70/100 và mỗi kỹ năng ≥50%.</Notice> : null}
      <h3>Quy định làm bài – đọc trước khi bắt đầu</h3>
      <div className="grid cols-3"><Rule title="✅ Bắt buộc" tone="var(--mint)" lines={["Làm một mạch từ đầu đến cuối, theo thứ tự Nghe → Đọc → Viết → Nói.", "Có tai nghe (hoặc loa) và micro; thử cả hai bằng nút bên dưới.", "Ở lại đúng trang này cho đến khi nộp bài.", "Phần Nói nộp bằng file ghi âm (ghi ngay trên trang hoặc tải lên)."]} /><Rule title="⛔ Không được phép" tone="var(--peach)" lines={["Mở tab, cửa sổ, ứng dụng hoặc pop-up khác.", "Sao chép, dán, dùng công cụ dịch hay AI.", "Quay lại phần đã nộp.", "Nghe mỗi đoạn audio quá 2 lần."]} /><Rule title="Lưu ý" tone="var(--butter)" lines={[`Bấm Bắt đầu là không lưu tạm hay tạm dừng được: đồng hồ ${view.timed === false ? "không giới hạn" : "chạy liên tục, kể cả khi bạn thoát ra"}.`, view.timed === false ? "Không tính giờ, nhưng nộp phần nào là khoá phần đó." : "Mỗi phần tính giờ riêng; hết giờ tự chuyển phần, hết phần Nói tự nộp.", `Rời màn hình bị cảnh báo tối đa ${view.warningLimit ?? view.runtime?.violationLimit ?? 3} lần; lần kế tiếp bài tự nộp.`, "Mọi lần tự nộp đều đếm ngược 5 giây."]} /></div>
      {definition.kind === "placement" ? <Notice><b>Vì sao cần bước này?</b> Kết quả test quyết định mức bài bạn nhận: quá dễ thì chán, quá khó thì nản. Không cần ôn trước, làm đúng sức là tốt nhất.</Notice> : null}
      <div className="row prep" role="group" aria-label="Cần chuẩn bị: tai nghe hoặc loa, và micro"><span title="Tai nghe hoặc loa">🎧 Tai nghe</span><span title="Micro">🎙 Micro</span><div className="stack prep-checks"><div className="row prep-check"><button className="btn-sm" type="button" onClick={checkSound}>Thử tai nghe</button><span className="xs muted" role="status" aria-live="polite">{equipment.sound}</span></div>{microphoneSupported === false ? <span className="xs muted">Trình duyệt này không ghi âm được: bạn sẽ nộp phần Nói bằng cách tải file lên.</span> : <div className="row prep-check"><button className="btn-sm" type="button" onClick={() => void checkMicrophoneForTest()}>Thử micro (3 giây)</button><span className="xs muted" role="status" aria-live="polite">{equipment.microphone}</span></div>}</div></div>
      <p className="small muted" style={{ marginTop: 10 }}>Thang điểm (tổng /100): A1 0–24 · A2 25–44 · B1 45–64 · B2 65–84 · C1 85–100.</p>
      <ErrorText id="assessment-start-error" message={localError} />
      <div className="row"><button className="btn-primary btn-lg" type="button" aria-label={view.attempt ? "Tiếp tục bài đang làm" : "Bắt đầu phần Nghe"} aria-describedby={localError ? "assessment-start-error" : undefined} aria-busy={starting || undefined} disabled={starting || checkingMicrophone} onClick={() => void start()}>{starting ? <><span className="spinner" aria-hidden="true" /> Đang bắt đầu…</> : view.attempt ? "Tiếp tục bài đang làm" : "Bắt đầu phần Nghe"}</button></div>
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
    if (savingCountRef.current > 0) return;
    setBusy(true); setLocalError(undefined);
    try {
      if (section.code === "speaking") await actions.submitAssessment();
      else await actions.completeAssessmentSection(section.code);
    }
    catch { setLocalError("Không thể nộp phần này lúc này. Hãy kiểm tra kết nối rồi thử lại."); }
    finally { setBusy(false); }
  };
  return <AssessmentRuntime view={view} actions={actions}>{(runtime) => <>
    <ActiveAssessment
    view={view} actions={actions} section={section} sectionIndex={sectionIndex} runtime={runtime} local={local} busy={busy} savingCount={savingCount}
    error={view.submitError ?? localError} onSave={(task, input) => void save(task, input)} onComplete={() => void complete()}
    />
  </>}</AssessmentRuntime>;
}

function ActiveAssessment({ view, actions, section, sectionIndex, runtime, local, busy, savingCount, error, onSave, onComplete }: {
  view: AssessmentView;
  actions: LearnerCallbacks;
  section: AssessmentView["definition"]["sections"][number];
  sectionIndex: number;
  runtime: AssessmentRuntimeState;
  local: Record<string, string>;
  busy: boolean;
  savingCount: number;
  error: string | undefined;
  onSave: (task: AssessmentTaskView, input: SaveAssessmentResponseInput) => void;
  onComplete: () => void;
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
  const submitDisabled = busy || savingCount > 0 || submitCountdown !== null;
  const completionWarning = assessmentCompletionWarning(section, local, attempt.responses);
  return <>
  <div className="app-learner-page test-page">
    <PageTitle title={assessmentHeading(view)} detail="Thời gian vẫn chạy nếu bạn rời trang" />
    <section className="card flat" style={{ position: "sticky", top: 64, zIndex: 5, padding: "10px 14px", marginBottom: 10 }}>
      <div className="row between">
        <div className="row"><span className="badge">Phần {sectionIndex + 1}/4 · {section.title}</span><span className="badge primary" role="timer" aria-label="Thời gian còn lại">◷ {runtime.formattedTime}</span></div>
        <div className="row"><span className="xs muted">Cảnh báo {runtime.violationCount}/{runtime.violationLimit}</span><span className="badge warn" title="Bài test không lưu tạm hay tạm dừng được; đồng hồ chạy liên tục">Không lưu tạm</span><button className="btn-sm btn-primary" type="button" aria-label={section.code === "speaking" ? "Nộp bài" : `Nộp phần ${section.title}`} aria-busy={busy || undefined} disabled={submitDisabled} onClick={() => setSubmitConfirm(true)}>{busy ? "Đang nộp…" : section.code === "speaking" ? "Nộp bài" : "Nộp phần này →"}</button></div>
      </div>
      <Progress value={sectionIndex + 1} max={sectionOrder.length} label="Tiến độ bài thi" />
      <span className="sr-only" role="status" aria-live="polite">{savingCount > 0 ? "Đang lưu câu trả lời…" : "Các câu trả lời đã lưu"}</span>
    </section>
    {runtime.warning === "five_minutes" ? <Notice tone="warn">⏰ Còn 5 phút. Hãy kiểm tra lại câu trả lời trước khi nộp.</Notice> : null}
    {runtime.warning === "one_minute" ? <Notice tone="warn">⏰ Còn 1 phút! Hết giờ hệ thống sẽ tự chuyển phần.</Notice> : null}
    <ErrorText message={error} />
    <section className="card" style={{ marginTop: 10 }}>
      <h2>Phần {sectionIndex + 1} – {section.title} <span className="badge">{section.maxScore} điểm</span></h2>
      {section.instructions.length ? <p className="small muted">{section.instructions.join(" · ")}</p> : null}
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
    {section.groups.map((group) => <section className="card soft" style={{ marginTop: 0 }} key={group.key}>
      <h2>{group.title}</h2><p>{group.instruction}</p>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {group.stimulus ? <Stimulus stimulus={group.stimulus} maxPlays={group.maxPlays ?? 0} played={attempt.audioPlayCounts[`${section.code}:${group.key}`] ?? runtimeAudioCount(view, section.code, group.key)} onPlay={async (text) => {
          try { const result = await actions.recordAssessmentAudioPlay(section.code, group.key); actions.speak(text); return result.playCount; }
          catch { return null; }
        }} /> : null}
        {group.tasks.map((task, index) => <Task key={task.key} task={task} number={index + 1} value={local[task.key] ?? findResponse(attempt.responses, section.code, task.key)?.value ?? ""} view={view} actions={actions} section={section.code} onSave={(input) => onSave(task, input)} />)}
      </div>
    </section>)}
      </div>
    </section>
  </div>
  {submitConfirm ? <SubmitConfirm final={section.code === "speaking"} section={section.title} {...(completionWarning ? { warning: completionWarning } : {})} onCancel={() => setSubmitConfirm(false)} onAccept={() => { setSubmitConfirm(false); setSubmitCountdown(5); }} /> : null}
  {submitCountdown !== null ? <SubmitCountdown final={section.code === "speaking"} count={submitCountdown} onStop={() => setSubmitCountdown(null)} /> : null}
  </>;
}

function SubmitConfirm({ final, section, warning, onCancel, onAccept }: { final: boolean; section: string; warning?: string; onCancel: () => void; onAccept: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-submit-confirm-title" aria-describedby="assessment-submit-confirm-description" tabIndex={-1} onKeyDown={trapDialogFocus}>
    <h2 id="assessment-submit-confirm-title">{final ? "Nộp bài kiểm tra?" : `Nộp phần ${section} và chuyển tiếp?`}</h2>
    <p id="assessment-submit-confirm-description">{final ? "Bạn sẽ không thể quay lại bài kiểm tra. Đồng hồ vẫn chạy trong lúc đếm ngược." : "Bạn sẽ không quay lại phần này được. Đồng hồ vẫn chạy trong lúc đếm ngược."}</p>
    {warning ? <div id="assessment-submit-confirm-warning" className="banner warn" role="note" aria-atomic="true"><div className="body small">{warning}</div></div> : null}
    <div className="row" style={{ justifyContent: "flex-end" }}><button ref={cancelRef} className="btn-sm" type="button" onClick={onCancel}>Huỷ</button><button className="btn-sm btn-primary" type="button" onClick={onAccept}>{final ? "Nộp bài" : "Nộp phần này"}</button></div>
  </div></div>;
}

function SubmitCountdown({ final, count, onStop }: { final: boolean; count: number; onStop: () => void }) {
  const stopRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stopRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-submit-countdown-title" aria-describedby="assessment-submit-countdown-description" tabIndex={-1} onKeyDown={trapDialogFocus}>
    <h2 id="assessment-submit-countdown-title">{final ? "Nộp bài kiểm tra" : "Nộp phần này"} sau {count} giây…</h2>
    <p id="assessment-submit-countdown-description" className="small">Thao tác này không hoàn tác được. Bấm <b>Dừng lại</b> nếu bạn đổi ý.</p>
    <div className="assessment-auto-countdown" aria-live="assertive">{count}</div>
    <div className="row" style={{ justifyContent: "center" }}><button ref={stopRef} className="btn-sm btn-x" type="button" onClick={onStop}>Dừng lại</button></div>
  </div></div>;
}

function Rule({ title, tone, lines }: { title: string; tone: string; lines: string[] }) { return <article className="card flat" style={{ background: tone }}><div className="eyebrow" style={{ color: "var(--text)", marginBottom: 6 }}>{title}</div><ul className="small" style={{ margin: 0, paddingLeft: 18, fontWeight: 700, lineHeight: 1.5 }}>{lines.map((line) => <li key={line}>{line}</li>)}</ul></article>; }

function AssessmentResult({ attempt }: { attempt: NonNullable<AssessmentView["attempt"]> }) {
  const scores = sectionOrder.flatMap((code) => attempt.sectionScores?.[code] == null ? [] : [[code, attempt.sectionScores[code]!] as const]);
  return <div className="card flat" aria-label="Kết quả bài đánh giá">
    <div className="row between"><b>Tổng điểm</b><strong>{attempt.totalScore}/100{attempt.suggestedLevel ? ` · ${attempt.suggestedLevel}` : ""}</strong></div>
    {scores.length ? <div className="grid cols-2" style={{ marginTop: 10 }}>{scores.map(([code, score]) => <div className="row between" key={code}><span>{sectionLabel(code)}</span><b>{score}</b></div>)}</div> : null}
  </div>;
}

function Stimulus({ stimulus, maxPlays, played, onPlay }: { stimulus: AssessmentView["definition"]["sections"][number]["groups"][number]["stimulus"]; maxPlays: number; played: number; onPlay: (text: string) => Promise<number | null> }) {
  if (!stimulus) return null;
  const text = stimulus.text ?? stimulus.lines?.map((line) => `${line.speaker}: ${line.text}`).join("\n") ?? "";
  const remaining = Math.max(0, maxPlays - played);
  return <div className="card soft">{stimulus.type === "audio_script" ? <button className="btn-sm" type="button" disabled={maxPlays > 0 && remaining === 0} onClick={() => void onPlay(text)}>🔊 {maxPlays > 0 && remaining === 0 ? "Đã hết lượt nghe" : `Nghe${maxPlays > 0 ? ` (còn ${remaining} lần)` : " audio"}`}</button> : <p style={{ whiteSpace: "pre-line" }}>{text}</p>}</div>;
}

function Task({ task, number, value, view, actions, section, onSave }: { task: AssessmentTaskView; number: number; value: string; view: AssessmentView; actions: LearnerCallbacks; section: AssessmentSectionCode; onSave: (input: SaveAssessmentResponseInput) => void }) {
  const promptId = `assessment-task-${task.key}-prompt`;
  const hintId = `assessment-task-${task.key}-hint`;
  const answerHint = [task.minWords ? `Tối thiểu ${task.minWords} từ.` : null, task.maxWords ? `Tối đa ${task.maxWords} từ.` : null].filter(Boolean).join(" ");
  return <div className="card flat" style={{ marginTop: 0 }}><p id={promptId}><b>{number}.</b> {task.prompt} <span className="xs muted">({task.maxScore} điểm)</span></p>{task.responseType === "single_choice" ? <fieldset aria-labelledby={promptId} style={{ border: 0, margin: 0, padding: 0 }}><legend className="sr-only">Chọn một đáp án</legend>{task.options?.map((option) => <label className={`opt ${value === option.value ? "sel" : ""}`} key={option.value}><input type="radio" name={task.key} checked={value === option.value} aria-describedby={answerHint ? hintId : undefined} onChange={() => onSave({ value: option.value, evidenceType: "choice" })} /><span>{option.label}</span></label>)}</fieldset> : <label><span className="sr-only">Câu trả lời {task.key}</span><textarea aria-label={`Câu trả lời ${task.key}`} aria-labelledby={promptId} aria-describedby={answerHint ? hintId : undefined} value={value} minLength={task.minWords} onChange={(event) => onSave({ value: event.target.value, evidenceType: task.responseType === "speaking_evidence" ? "typed_proxy" : "text" })} placeholder={task.responseType === "speaking_evidence" ? "Lời chép từ file ghi âm hoặc nội dung bạn đã nói…" : "Nhập câu trả lời"} /></label>}{answerHint ? <span id={hintId} className="sr-only">{answerHint}</span> : null}{task.responseType === "speaking_evidence" ? <AssessmentRecorder taskKey={task.key} view={view} actions={actions} onEvidence={onSave} /> : null}</div>;
}

function findResponse(responses: AssessmentResponseView[], section: AssessmentSectionCode, taskKey: string) { return responses.find((item) => item.section === section && item.taskKey === taskKey); }

function assessmentCompletionWarning(section: AssessmentView["definition"]["sections"][number], local: Record<string, string>, responses: AssessmentResponseView[]) {
  const valueFor = (task: AssessmentTaskView) => local[task.key] ?? findResponse(responses, section.code, task.key)?.value ?? "";
  const tasks = section.groups.flatMap((group) => group.tasks);
  if (section.code === "listening" || section.code === "reading") {
    const missing = tasks.filter((task) => !valueFor(task).trim()).length;
    return missing ? `Còn ${missing} câu chưa trả lời.` : undefined;
  }
  if (section.code === "writing") {
    const short = tasks.filter((task) => task.minWords && wordCount(valueFor(task)) < task.minWords);
    if (!short.length) return undefined;
    return `${short.map((task) => `${task.title?.split(" – ")[0] ?? "Phần viết"}: mới ${wordCount(valueFor(task))} từ (yêu cầu ${task.minWords}–${task.maxWords ?? ""} từ)`).join("; ")}.`;
  }
  const empty = tasks.filter((task) => !wordCount(valueFor(task))).length;
  return empty ? `Còn ${empty} task chưa có câu trả lời.` : undefined;
}

function wordCount(value: string) { return value.trim() ? value.trim().split(/\s+/).length : 0; }

function runtimeAudioCount(view: AssessmentView, section: AssessmentSectionCode, groupKey: string) {
  return view.runtime?.audioPlayCounts[`${section}:${groupKey}`] ?? view.attempt?.runtime?.audioPlayCounts[`${section}:${groupKey}`] ?? 0;
}

async function checkMicrophone(setError: (message: string | undefined) => void): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) { setError("Trình duyệt không hỗ trợ kiểm tra micro."); return false; }
  setError(undefined);
  try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); return true; }
  catch { setError("Chưa truy cập được micro. Hãy cấp quyền rồi thử lại."); return false; }
}

function assessmentHeading(view: AssessmentView) {
  if (view.definition.kind === "placement") return "Test đầu vào";
  if (view.definition.kind === "final") return "Bài kiểm tra cuối kỳ";
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
  if (view.definition.kind === "final") {
    if (status === "approved") return { title: "Bài kiểm tra cuối kỳ đã có kết quả", detail: "Kết quả đã được ghi nhận trong tiến độ của bạn." };
    return { title: "Bài kiểm tra cuối kỳ đã được nộp", detail: "Kết quả cuối kỳ đang được tổng hợp; bạn có thể về trang chủ trong lúc chờ." };
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
