import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, LockKeyhole, Mic, RotateCcw, Square, Upload, Volume2 } from "lucide-react";
import type {
  LessonPart,
  LessonPartAttemptEvidenceInput,
  LessonPartCode,
  LessonVocabularyItem,
  LessonVocabularyLexicalDetail,
  PartEvidence
} from "@e4s/contracts";
import type { LearnerCallbacks, LessonView, LessonSpeechOptions, LessonSpeechStatus, MicroView } from "./contracts.js";
import { ErrorText, Notice, PageTitle, AppLink } from "./ui.js";
import { ContentImage } from "../shared/media/ContentImage.js";

const studyCodes: LessonPartCode[] = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"];
const practiceCodes: LessonPartCode[] = ["listening", "reading", "writing", "word_class", "word_use", "speaking"];
const listenButtonStyle = { display: "inline-flex", alignItems: "center", gap: 6 } as const;

type VocabularyModalState =
  | { kind: "family"; item: LessonVocabularyItem }
  | { kind: "synonyms"; item: LessonVocabularyItem }
  | { kind: "umbrella"; item: LessonVocabularyItem }
  | { kind: "lexical"; item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail };

export function LearnerLesson({ view, actions }: { view: LessonView; actions: LearnerCallbacks }) {
  const lesson = view.lesson;
  const [tab, setTab] = useState<"study" | "practice">("study");
  const [studyComplete, setStudyComplete] = useState(() => lessonStudyIsComplete(lesson));
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(view.lesson.progress.evidence).map(([code, evidence]) => [code, evidence?.answer ?? ""])
  ));
  const [localEvidence, setLocalEvidence] = useState(view.lesson.progress.evidence);
  const [mediaArtifacts, setMediaArtifacts] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(view.lesson.progress.evidence)
      .filter(([, evidence]) => Boolean(evidence?.artifactKey))
      .map(([code, evidence]) => [code, evidence!.artifactKey!])
  ));
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busyActionRef = useRef<string | null>(null);
  const lessonIdRef = useRef(lesson.id);
  const [completedLocally, setCompletedLocally] = useState(false);
  const [vocabularyModal, setVocabularyModal] = useState<VocabularyModalState | null>(null);
  useEffect(() => {
    const isNewLesson = lessonIdRef.current !== lesson.id;
    lessonIdRef.current = lesson.id;
    const serverAnswers = Object.fromEntries(Object.entries(lesson.progress.evidence).map(([code, evidence]) => [code, evidence?.answer ?? ""]));
    setLocalEvidence(lesson.progress.evidence);
    setMediaArtifacts(Object.fromEntries(
      Object.entries(lesson.progress.evidence)
      .filter(([, evidence]) => Boolean(evidence?.artifactKey))
      .map(([code, evidence]) => [code, evidence!.artifactKey!])
    ));
    setAnswers((current) => isNewLesson ? serverAnswers : { ...serverAnswers, ...current });
    if (isNewLesson) {
      setTab("study");
      setError("");
      setCompletedLocally(false);
      busyActionRef.current = null;
      setBusyAction(null);
    }
  }, [lesson.id, lesson.progress.evidence]);
  useEffect(() => {
    const complete = lessonStudyIsComplete(lesson);
    setStudyComplete(complete);
    if (!complete) setTab("study");
  }, [lesson.id, lesson.progress.completedPartCodes, lesson.progress.status]);
  if (view.lock) {
    const prior = view.lock.reason === "prior";
    const openDate = view.lock.opensAt ? formatLessonDate(view.lock.opensAt) : null;
    return <div className="app-learner-page"><div className="card"><div className="row" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ flex: 1 }}><div className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><LockKeyhole size={16} aria-hidden="true" /> Bài {view.lesson.dayNumber}/{view.lock.totalLessons} · {prior ? "chưa mở" : "chưa đến ngày"}</div><h3>{prior ? "Học bù bài trước đã nhé" : openDate ? `Bài này mở vào ${openDate}` : "Bài này chưa mở"}</h3><p className="small">{view.lock.message}</p><div className="row">{prior && view.lock.blocker ? <AppLink className="btn btn-primary" href={`/lesson/${view.lock.blocker.id}`} navigate={actions.navigate}>Học bài {lessonDayLabel(view.lock.blocker.dayNumber)} ngay</AppLink> : <AppLink className="btn btn-primary" href="/coach" navigate={actions.navigate}>Luyện với Season</AppLink>}<AppLink className="btn" href="/home" navigate={actions.navigate}>← Về trang chủ</AppLink></div></div></div></div></div>;
  }
  const startAction = (action: string) => {
    if (busyActionRef.current) return false;
    busyActionRef.current = action;
    setBusyAction(action);
    return true;
  };
  const stopAction = () => {
    busyActionRef.current = null;
    setBusyAction(null);
  };
  const save = async (part: LessonPart, evidenceInput: LessonPartAttemptEvidenceInput = { answer: answers[part.code] ?? "" }) => {
    if (busyActionRef.current) return;
    setError("");
    const artifactKey = evidenceInput.artifactKey ?? mediaArtifacts[part.code];
    if (part.code === "speaking" && !artifactKey) {
      setError("Hãy ghi âm hoặc tải file ghi âm lên trước khi kiểm tra phần Nói.");
      return;
    }
    const submittedEvidence: LessonPartAttemptEvidenceInput = {
      ...evidenceInput,
      ...(artifactKey ? { artifactKey } : {})
    };
    if (!startAction(part.code)) return;
    if (actions.submitLessonPartAttempt) {
      try {
        const result = await actions.submitLessonPartAttempt(part.code, submittedEvidence);
        setLocalEvidence(result.progress.evidence);
        if (result.evidence.artifactKey) setMediaArtifacts((current) => ({ ...current, [part.code]: result.evidence.artifactKey! }));
      } catch {
        setError("Chưa lưu được câu trả lời. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại.");
      } finally {
        stopAction();
      }
      return;
    }
    try {
      const answer = submittedEvidence.answer ?? "";
      const completed = Array.from(new Set([...lesson.progress.completedPartCodes, part.code]));
      const nextProgress: typeof lesson.progress = { ...lesson.progress, status: completed.length === lesson.content.parts.length ? "completed" : "in_progress", completedPartCodes: completed, evidence: { ...lesson.progress.evidence, [part.code]: { attempts: (lesson.progress.evidence[part.code]?.attempts ?? 0) + 1, answer, ...(artifactKey ? { artifactKey } : {}) } } };
      await actions.saveLessonProgress(nextProgress);
      setLocalEvidence(nextProgress.evidence);
    } catch {
      setError("Chưa lưu được câu trả lời. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại.");
    } finally {
      stopAction();
    }
  };
  const appeal = async (partCode: LessonPartCode) => {
    if (!actions.appealLessonPart || busyActionRef.current || !startAction(`appeal:${partCode}`)) return;
    setError("");
    try {
      const result = await actions.appealLessonPart(partCode, "Tôi muốn được xem lại đáp án và phản hồi của phần này.");
      setLocalEvidence(result.progress.evidence);
    } catch {
      setError("Chưa gửi được kháng nghị. Bạn có thể thử lại.");
    } finally {
      stopAction();
    }
  };
  const finishStudy = async () => {
    if (!startAction("study")) return;
    setError("");
    const completedPartCodes = Array.from(new Set([
      ...lesson.progress.completedPartCodes,
      ...lesson.content.parts.map((part) => part.code).filter((code) => studyCodes.includes(code))
    ]));
    try {
      await actions.saveLessonProgress({
        ...lesson.progress,
        status: lesson.progress.status === "completed" ? "completed" : "in_progress",
        completedPartCodes
      });
      setStudyComplete(true);
      setTab("practice");
    } catch {
      setError("Chưa ghi nhận được phần Học. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      stopAction();
    }
  };
  const completeLesson = async () => {
    if (!startAction("complete")) return;
    setError("");
    try {
      const completedPartCodes = Array.from(new Set([
        ...lesson.progress.completedPartCodes,
        ...lesson.content.parts
          .filter((part) => studyCodes.includes(part.code) || (practiceCodes.includes(part.code) && partIsDone(localEvidence[part.code], false)))
          .map((part) => part.code)
      ]));
      await actions.saveLessonProgress({ ...lesson.progress, status: "completed", completedPartCodes, evidence: localEvidence });
      setCompletedLocally(true);
    } catch {
      setError("Chưa ghi nhận được bài học. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      stopAction();
    }
  };
  const visible = lesson.content.parts.filter((part) => (tab === "study" ? studyCodes : practiceCodes).includes(part.code));
  const evidence = localEvidence;
  const requiredPracticeCodes = lesson.content.parts.map((part) => part.code).filter((code) => practiceCodes.includes(code));
  const completedPracticeCount = requiredPracticeCodes.filter((code) => partIsDone(evidence[code], lesson.progress.completedPartCodes.includes(code))).length;
  const allPracticeComplete = requiredPracticeCodes.length === 0 || completedPracticeCount === requiredPracticeCodes.length;
  const completed = lesson.progress.status === "completed" || completedLocally;
  return <div className="app-learner-page lesson-page" style={{ display: "grid", gap: 16, width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
    <AppLink className="lesson-back" href="/home" navigate={actions.navigate}>‹ <span>Quay lại</span></AppLink>
    <PageTitle
      eyebrow={`Bài ${lesson.dayNumber}/5 · ${lesson.cefr} · ${lesson.durationMinutes} phút`}
      title={lesson.title}
      aside={<span className={`badge${completed ? " ok" : ""}`}>{completed ? "Đã hoàn thành" : lesson.progress.status === "in_progress" ? "Đang học" : "Chưa học"}</span>}
    />
    <section className="lesson-surface" aria-label="Bài học" style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div className="lesson-skill-map" aria-label="Kỹ năng trong bài">
        {lesson.content.parts.filter((part) => part.code !== "objective" && part.code !== "instruction").map((part) => <span data-kind={practiceCodes.includes(part.code) ? "practice" : "study"} key={part.code}>{part.title}</span>)}
      </div>
      <div className="ltabs" role="tablist" aria-label="Các bước trong bài học">
        <button className={tab === "study" ? "active" : ""} role="tab" aria-selected={tab === "study"} type="button" onClick={() => setTab("study")}>1. Học {studyComplete ? <CheckCircle2 className="status-icon" aria-label="Đã học" /> : null}</button>
        <button className={tab === "practice" ? "active" : ""} role="tab" aria-selected={tab === "practice"} type="button" disabled={!studyComplete} title={studyComplete ? undefined : "Bấm Đã học xong ở bước Học trước"} onClick={() => setTab("practice")}>2. Bài tập {studyComplete ? `${completedPracticeCount}/${requiredPracticeCodes.length}` : <><LockKeyhole className="status-icon" aria-hidden="true" /><span className="sr-only">Chưa mở</span></>}</button>
      </div>
      {Object.values(evidence).some((item) => item?.status && item.status !== "correct") ? <section className="stack lesson-status" aria-label="Trạng thái bài tập">{Object.entries(evidence).filter(([, item]) => item?.status && item.status !== "correct").map(([code, item]) => <Notice key={code} tone={item?.status === "appealed" ? "info" : "warn"}>{partOutcomeLabel(item?.status)} · {code}</Notice>)}</section> : null}
      {tab === "practice" ? <PracticeOverview parts={lesson.content.parts} evidence={evidence} completedPartCodes={lesson.progress.completedPartCodes} /> : null}
      <ErrorText message={error} />
      <ol className="stack lesson-parts" aria-label="Nội dung bài học" style={{ gap: 16, listStyle: "none", margin: 0, padding: 0 }}>{visible.map((part, index) => {
        const partEvidence = evidence[part.code];
        const done = partIsDone(partEvidence, lesson.progress.completedPartCodes.includes(part.code));
        return <li className={`card lesson-part lesson-part--${part.code}`} data-part={part.code} data-testid="app-lesson-part" key={part.code} style={{ boxSizing: "border-box", minWidth: 0, display: "grid", gap: 12, padding: 18 }}>
          <PartContent sectionNumber={index + 1} part={part} speak={actions.speak} openVocabularyModal={setVocabularyModal} resolveVocabularyImage={actions.resolveLessonVocabularyImage} />
          {practiceCodes.includes(part.code) ? <div className="stack lesson-answer" aria-busy={busyAction === part.code || undefined} style={{ gap: 12, minWidth: 0 }}>
            {part.code === "speaking" ? <SpeakingEvidenceControls artifactKey={mediaArtifacts[part.code]} onUploaded={(artifactKey) => setMediaArtifacts((current) => ({ ...current, [part.code]: artifactKey }))} uploadAudio={actions.uploadAssessmentAudio} getAudioReadUrl={actions.getAssessmentAudioReadUrl} /> : null}
            <LessonAnswerControl part={part} value={answers[part.code] ?? ""} disabled={done || Boolean(busyAction)} onChange={(value) => setAnswers((current) => ({ ...current, [part.code]: value }))} />
            <button className="btn-primary" type="button" aria-busy={busyAction === part.code || undefined} disabled={done || Boolean(busyAction) || !hasLessonAnswer(part, answers[part.code], mediaArtifacts[part.code])} style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => void save(part)}>{busyAction === part.code ? "Đang lưu…" : done ? "Đã xong" : "Nộp bài"}</button>
            {partEvidence?.status === "wrong_exhausted" || partEvidence?.status === "wrong_retry" ? <div className="row" style={{ flexWrap: "wrap", gap: 8 }}><button className="btn-sm btn-ghost" type="button" disabled={Boolean(busyAction)} onClick={() => void save(part, { answer: answers[part.code] ?? "", translated: true })}>Xem bản dịch</button>{partEvidence.status === "wrong_exhausted" && actions.appealLessonPart ? <button className="btn-sm btn-ghost" type="button" aria-busy={busyAction === `appeal:${part.code}` || undefined} disabled={Boolean(busyAction)} onClick={() => void appeal(part.code)}>{busyAction === `appeal:${part.code}` ? "Đang gửi…" : "Gửi kháng nghị"}</button> : null}</div> : null}
            {partEvidence?.feedback ? <Notice tone={partEvidence.status === "correct" ? "ok" : partEvidence.status === "appealed" ? "info" : "warn"}>{partEvidence.feedback}</Notice> : null}
          </div> : null}
        </li>;
      })}</ol>
      {tab === "study" ? <section className="card lesson-study-cta"><div><strong>{studyComplete ? "Bạn đã học xong phần này" : "Học xong 3 mục trên chưa?"}</strong><p className="small">Bước 2 có {requiredPracticeCodes.length} phần bài tập: {requiredPracticeCodes.map(partLabel).join(" → ")}.</p></div><button className="btn-primary btn-lg" type="button" disabled={Boolean(busyAction)} onClick={() => studyComplete ? setTab("practice") : void finishStudy()}>{busyAction === "study" ? "Đang lưu…" : studyComplete ? "Sang bài tập →" : <><CheckCircle2 size={18} aria-hidden="true" /> Đã học xong → Làm bài tập</>}</button></section> : null}
    </section>
    <section className="card lesson-completion" aria-label="Hoàn thành bài học"><div><strong>{completed ? "Bạn đã học bài này rồi, ôn lại thoải mái!" : allPracticeComplete ? "Đủ các phần rồi! Bấm Hoàn thành để mở bài tiếp theo." : `Đã xong ${completedPracticeCount}/${requiredPracticeCodes.length} phần. Làm nốt rồi bấm Hoàn thành nhé.`}</strong></div><div className="row"><button className="btn-primary btn-lg" type="button" disabled={Boolean(busyAction) || (!completed && !allPracticeComplete)} title={!completed && !allPracticeComplete ? `Làm xong ${requiredPracticeCodes.length} phần bài tập trước` : undefined} onClick={() => void completeLesson()}>{busyAction === "complete" ? "Đang lưu…" : completed ? "Lưu lần ôn này" : "Hoàn thành bài"}</button><AppLink className="btn btn-ghost" href="/coach" navigate={actions.navigate}>Luyện với Season</AppLink></div></section>
    {vocabularyModal ? <VocabularyModal state={vocabularyModal} speak={actions.speak} close={() => setVocabularyModal(null)} /> : null}
  </div>;
}

function lessonStudyIsComplete(lesson: LessonView["lesson"]): boolean {
  if (lesson.progress.status === "completed") return true;
  const studyPartCodes = lesson.content.parts.map((part) => part.code).filter((code) => studyCodes.includes(code));
  const hasTerminalPractice = lesson.content.parts.some((part) => practiceCodes.includes(part.code) && partIsDone(
    lesson.progress.evidence[part.code], lesson.progress.completedPartCodes.includes(part.code)
  ));
  return hasTerminalPractice || (studyPartCodes.length > 0 && studyPartCodes.every((code) => lesson.progress.completedPartCodes.includes(code)));
}

function partLabel(code: LessonPartCode): string {
  const labels: Partial<Record<LessonPartCode, string>> = {
    listening: "Nghe", reading: "Đọc", writing: "Viết", word_class: "Từ loại", word_use: "Dùng từ", speaking: "Nói"
  };
  return labels[code] ?? code;
}

function PracticeOverview({
  parts,
  evidence,
  completedPartCodes
}: {
  parts: readonly LessonPart[];
  evidence: LessonView["lesson"]["progress"]["evidence"];
  completedPartCodes: readonly LessonPartCode[];
}) {
  const practiceParts = parts.filter((part) => practiceCodes.includes(part.code));
  if (!practiceParts.length) return null;
  return <section className="lesson-practice-overview" aria-labelledby="lesson-practice-overview-title" style={{ display: "grid", gap: 10, padding: 14, border: "1px solid var(--primary-line)", borderRadius: 12, background: "var(--primary-soft)" }}>
    <div><h2 id="lesson-practice-overview-title" style={{ margin: 0, fontSize: ".9rem" }}>6 phần bài tập</h2><p className="small muted" style={{ margin: "4px 0 0" }}>Làm lần lượt từng kỹ năng, xem phản hồi rồi làm lại nếu cần.</p></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 10 }}>
      {practiceParts.map((part, index) => {
        const done = partIsDone(evidence[part.code], completedPartCodes.includes(part.code));
        return <div key={part.code} data-practice-part={part.code} style={{ display: "grid", gap: 4, minWidth: 0, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }}>
          <div className="row" style={{ justifyContent: "flex-start", gap: 6 }}><span className="badge" aria-label={`Phần ${index + 1}`}>{index + 1}</span><strong>{partLabel(part.code)}</strong></div>
          <span className="xs muted">{practiceFocus(part.code)}</span>
          <span className={`badge ${done ? "ok" : ""}`} style={{ justifySelf: "start", marginTop: 2 }}>{done ? "Đã xong" : "Chưa làm"}</span>
        </div>;
      })}
    </div>
  </section>;
}

function practiceFocus(code: LessonPartCode): string {
  switch (code) {
    case "listening": return "Nghe và chọn đáp án";
    case "reading": return "Đọc và hiểu ý chính";
    case "writing": return "Viết câu trả lời";
    case "word_class": return "Nhận diện từ loại";
    case "word_use": return "Chọn cách dùng đúng";
    case "speaking": return "Ghi âm câu trả lời";
    default: return "Luyện tập";
  }
}

function LessonAnswerControl({ part, value, disabled, onChange }: {
  part: LessonPart;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const content = part.content as { options?: unknown };
  const options = Array.isArray(content.options)
    ? content.options.filter((option): option is string => typeof option === "string" && Boolean(option.trim()))
    : [];
  if (options.length) {
    return <fieldset className="stack" aria-label={`Câu trả lời ${part.code}`} disabled={disabled}>
      <legend>Bài làm của bạn <span className="badge">trắc nghiệm</span></legend>
      {options.map((option, index) => <label className={`opt${value === option ? " sel" : ""}`} key={option}>
        <input type="radio" name={`lesson-${part.code}`} value={option} checked={value === option} onChange={() => onChange(option)} />
        <span><b>{String.fromCharCode(65 + index)}.</b> {option}</span>
      </label>)}
    </fieldset>;
  }
  return <label>Bài làm của bạn<textarea aria-label={`Câu trả lời ${part.code}`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function partIsDone(evidence: PartEvidence | undefined, completed: boolean): boolean {
  if (evidence?.status) return ["correct", "wrong_exhausted", "translated", "appealed"].includes(evidence.status);
  return completed;
}

function hasLessonAnswer(part: LessonPart, answer: string | undefined, artifactKey: string | undefined): boolean {
  return Boolean(answer?.trim()) && (part.code !== "speaking" || Boolean(artifactKey));
}

function partOutcomeLabel(status: PartEvidence["status"]): string {
  switch (status) {
    case "wrong_retry": return "Chưa đúng · còn lượt thử";
    case "wrong_exhausted": return "Đã hết lượt thử";
    case "translated": return "Đã xem bản dịch";
    case "appealed": return "Đã gửi kháng nghị";
    case "correct": return "Đúng";
    default: return "Chưa trả lời";
  }
}

function lessonDayLabel(dayNumber: number): string {
  return (["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const)[dayNumber - 1] ?? `Bài ${dayNumber}`;
}

function formatLessonDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10);
  const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(parsed);
  const date = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parsed);
  return `${weekday} ${date}`;
}

type LessonAudioSource = { text?: string; src?: string };

function SpeechButton({ text, label, speak }: { text: string; label: string; speak: LearnerCallbacks["speak"] }) {
  const [status, setStatus] = useState<LessonSpeechStatus | "idle">("idle");
  const play = () => {
    if (status === "started") return;
    if (!text.trim()) {
      setStatus("error");
      return;
    }
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setStatus("unsupported");
      return;
    }
    setStatus("started");
    const options: LessonSpeechOptions = { onStatus: setStatus };
    try {
      speak(text, "en-US", options);
    } catch {
      setStatus("error");
    }
  };
  const message = status === "unsupported"
    ? "Trình duyệt không hỗ trợ đọc văn bản. Bạn vẫn có thể đọc nội dung trên màn hình."
    : status === "error"
      ? "Không phát được âm thanh. Bạn có thể thử lại."
      : status === "ended"
        ? "Đã phát xong."
        : status === "started"
          ? "Đang phát…"
          : "";
  const playing = status === "started";
  return <div className="stack" role="group" aria-label={label} aria-live="polite">
    <button className="btn-sm btn-ghost" type="button" aria-busy={playing || undefined} disabled={playing} style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={play}>{status === "error" ? <><RotateCcw size={16} aria-hidden="true" /> Thử lại {label.toLowerCase()}</> : playing ? <><LoaderCircle className="spinner" size={16} aria-hidden="true" /> Đang phát…</> : <><Volume2 size={16} aria-hidden="true" /> {label}</>}</button>
    {message ? <Notice tone={status === "error" || status === "unsupported" ? "warn" : "info"}>{message}</Notice> : null}
  </div>;
}

function LessonAudioControl({ source, speak }: { source: LessonAudioSource; speak: LearnerCallbacks["speak"] }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!source.src && !source.text) return <Notice tone="warn">Chưa có nội dung âm thanh cho phần Nghe.</Notice>;
  if (source.src) return <div className="stack" aria-label="Audio bài nghe">
    <audio key={`${source.src}-${attempt}`} controls preload="metadata" src={source.src} aria-label="Phát đoạn nghe" style={{ maxWidth: "100%", width: "100%" }} onError={() => setFailed(true)} />
    {failed ? <><Notice tone="warn">Không phát được file âm thanh. Bạn có thể thử lại.</Notice><button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Thử lại audio</button></> : null}
  </div>;
  return <SpeechButton text={source.text!} label="Nghe đoạn nghe" speak={speak} />;
}

function SpeakingEvidenceControls({
  artifactKey,
  onUploaded,
  uploadAudio,
  getAudioReadUrl
}: {
  artifactKey?: string | undefined;
  onUploaded: (artifactKey: string) => void;
  uploadAudio: (file: Blob, filename: string) => Promise<string>;
  getAudioReadUrl?: ((artifactKey: string) => Promise<{ url: string; expiresAt: string }>) | undefined;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File>();
  const [audioUrl, setAudioUrl] = useState("");
  const [readBusy, setReadBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const canRecord = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  useEffect(() => () => {
    recorder.current?.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const loadPersistedAudio = async () => {
    if (!artifactKey || !getAudioReadUrl) return;
    setReadBusy(true);
    setReadError("");
    try {
      const signed = await getAudioReadUrl(artifactKey);
      setAudioUrl(signed.url);
    } catch {
      setReadError("Không tải được bản ghi âm đã lưu. Bạn có thể thử lại.");
    } finally {
      setReadBusy(false);
    }
  };

  useEffect(() => {
    if (!artifactKey || audioUrl || !getAudioReadUrl) return;
    void loadPersistedAudio();
  }, [artifactKey, audioUrl, getAudioReadUrl]);

  const send = async (file: File) => {
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)$/i.test(file.name)) {
      setPendingFile(file);
      setError("Hãy chọn file âm thanh (mp3, m4a, wav, webm…).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPendingFile(file);
      setError("File quá lớn (tối đa 20 MB). Bạn có thể chọn file khác rồi thử lại.");
      return;
    }
    setPendingFile(file);
    setBusy(true);
    setError("");
    try {
      const savedKey = await uploadAudio(file, file.name);
      setPendingFile(undefined);
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      onUploaded(savedKey);
    } catch {
      setError("Không tải được file ghi âm. Bạn có thể thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!canRecord) {
      setError("Trình duyệt này không ghi âm được: bạn sẽ nộp phần Nói bằng cách tải file lên.");
      return;
    }
    setError("");
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(acquired);
      stream.current = acquired;
      recorder.current = next;
      chunks.current = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onerror = () => {
        acquired.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        stream.current = null;
        setRecording(false);
        setError("Ghi âm bị gián đoạn. Bạn có thể thử lại hoặc tải file lên.");
      };
      next.onstop = () => {
        acquired.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        stream.current = null;
        setRecording(false);
        const mimeType = (next.mimeType || "audio/webm").split(";")[0] || "audio/webm";
        const extension = /mp4|aac/.test(mimeType) ? "m4a" : /ogg/.test(mimeType) ? "ogg" : "webm";
        void send(new File(chunks.current, `ghi-am-${Date.now()}.${extension}`, { type: mimeType }));
      };
      next.start();
      setRecording(true);
    } catch {
      setError("Không dùng được micro – hãy tải file ghi âm lên.");
    }
  };

  const stopRecording = () => {
    if (!recorder.current) return;
    recorder.current.stop();
    setRecording(false);
  };

  return <section className="stack" aria-label="Bằng chứng nói">
    {!canRecord ? <Notice tone="warn">Trình duyệt này không ghi âm được: bạn sẽ nộp phần Nói bằng cách tải file lên.</Notice> : null}
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <button className="btn-sm btn-ghost" type="button" aria-busy={busy || undefined} disabled={!canRecord || busy} style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <><Square size={15} aria-hidden="true" /> Dừng ghi</> : <><Mic size={16} aria-hidden="true" /> Ghi âm</>}</button>
      <label className="btn" htmlFor="lesson-speaking-audio" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }}><Upload size={16} aria-hidden="true" /> {busy ? "Đang tải…" : "Tải file ghi âm"}</label>
      <input id="lesson-speaking-audio" className="sr-only" type="file" accept="audio/*" aria-label="Tải file ghi âm speaking" disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void send(file);
      }} />
    </div>
    {busy ? <Notice>Đang tải file ghi âm…</Notice> : null}
    {readBusy ? <Notice>Đang tải bản ghi âm đã lưu…</Notice> : null}
    {readError ? <div className="stack"><Notice tone="warn">{readError}</Notice><button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => void loadPersistedAudio()}><RotateCcw size={16} aria-hidden="true" /> Thử lại nghe bản ghi</button></div> : null}
    {error ? <div className="stack"><Notice tone="warn">{error}</Notice>{pendingFile ? <button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => void send(pendingFile)}><RotateCcw size={16} aria-hidden="true" /> Thử lại tải file</button> : null}</div> : null}
    {audioUrl ? <><Notice tone="ok">Đã tải file ghi âm lên. Bấm Kiểm tra Nói để nộp.</Notice><audio controls preload="metadata" src={audioUrl} aria-label="Nghe lại file ghi âm" style={{ maxWidth: "100%", width: "100%" }} /></> : artifactKey ? <Notice tone="ok">Đã tải file ghi âm lên. Bấm Kiểm tra Nói để nộp.</Notice> : null}
  </section>;
}

function PartContent({
  sectionNumber,
  part,
  speak,
  openVocabularyModal,
  resolveVocabularyImage
}: {
  sectionNumber: number;
  part: LessonPart;
  speak: LearnerCallbacks["speak"];
  openVocabularyModal: (state: VocabularyModalState) => void;
  resolveVocabularyImage?: LearnerCallbacks["resolveLessonVocabularyImage"];
}) {
  const content = part.content as {
    text?: string;
    script?: string;
    audio?: unknown;
    audioUrl?: string;
    prompt?: string;
    formula?: string;
    usage?: string;
    examples?: string[];
    focus?: string;
    instruction?: string;
    answer?: string;
    modelAnswer?: string;
    steps?: unknown;
    words?: string[];
    items?: LessonVocabularyItem[];
  };
  const words = content.items ?? [];
  const steps = Array.isArray(content.steps)
    ? content.steps.filter((step): step is string => typeof step === "string" && Boolean(step.trim()))
    : [];
  const guidanceSteps = part.code === "instruction" ? completeInstructionSteps(steps) : steps;
  const audioSource = part.code === "listening" ? lessonAudioSource(content) : undefined;
  const spokenStudyText = content.text ?? content.words?.join(", ") ?? words.map((item) => item.word).join(", ") ?? part.title;
  return <>
    <div className="row between"><h2>{sectionNumber}. {partHeading(part)}</h2>{part.code === "vocabulary" || part.code === "pronunciation" ? <SpeechButton text={spokenStudyText} label="Nghe" speak={speak} /> : null}</div>
    {content.text ? <p>{content.text}</p> : null}
    {content.prompt ? <p>{content.prompt}</p> : null}
    {guidanceSteps.length ? <ol className="lesson-instruction-list" aria-label="Các bước thực hiện">{guidanceSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol> : null}
    {audioSource ? <LessonAudioControl source={audioSource} speak={speak} /> : null}
    {content.formula ? <div className="card flat"><b>{content.formula}</b><p>{content.usage}</p></div> : null}
    {content.focus ? <p><b>{content.focus}</b> · {content.instruction}</p> : null}
    {part.code === "speaking" && (content.answer || content.modelAnswer) ? <div className="card flat" style={{ display: "grid", gap: 8, marginTop: 4, padding: 14, background: "var(--primary-soft)", border: "1px solid var(--primary-line)" }}><strong>{content.answer ?? content.modelAnswer}</strong><SpeechButton text={content.answer ?? content.modelAnswer ?? ""} label="Nghe câu mẫu" speak={speak} /></div> : null}
    {part.code === "pronunciation" && content.words?.length ? <div className="stack" aria-label="Luyện từ phát âm" style={{ gap: 8, marginTop: 10 }}><span className="small muted">Luyện từ mẫu</span><div className="row" style={{ flexWrap: "wrap", gap: 8 }}>{content.words.map((word) => <button className="btn-sm btn-ghost" style={listenButtonStyle} type="button" key={word} aria-label={`Nghe từ phát âm: ${word}`} title="Nghe từ phát âm" onClick={() => speak(word)}><Volume2 size={14} aria-hidden="true" />{word}</button>)}</div></div> : null}
    {part.code === "vocabulary" ? words.map((item, itemIndex) => <VocabularyCard key={item.word} item={item} itemIndex={itemIndex} speak={speak} openModal={openVocabularyModal} resolveImage={resolveVocabularyImage} />) : null}
    {part.code !== "vocabulary" ? content.items?.map((item) => <article className="word-card" key={item.word}><h3>{item.word}</h3><span className="ipa">{item.pronunciation}</span><p>{item.meaning}</p>{item.examples?.map((example) => <small key={example}>{example}</small>)}</article>) : null}
    {content.examples?.length ? <ul>{content.examples.map((example) => <li key={example}>{example}</li>)}</ul> : null}
  </>;
}

function partHeading(part: LessonPart): string {
  const english: Partial<Record<LessonPartCode, string>> = {
    listening: "Listening", reading: "Reading", writing: "Writing", word_class: "Word class", word_use: "Word use", speaking: "Speaking"
  };
  return english[part.code] ? `${part.title} · ${english[part.code]}` : part.title;
}

function completeInstructionSteps(steps: string[]): string[] {
  if (!steps.length || steps.length >= 5) return steps;
  return [
    ...steps,
    "Bấm “Đã học xong” để mở phần Bài tập.",
    "Xong hết các phần thì bấm Hoàn thành bài để mở bài tiếp theo."
  ].slice(0, 5);
}

function lessonAudioSource(content: { audio?: unknown; audioUrl?: string; script?: string; text?: string }): LessonAudioSource {
  const candidate = content.audioUrl ?? content.audio;
  if (typeof candidate === "string" && candidate.trim()) {
    return isAudioUrl(candidate) ? { src: candidate } : { text: candidate };
  }
  if (candidate && typeof candidate === "object") {
    const record = candidate as Record<string, unknown>;
    const src = typeof record.url === "string" ? record.url : typeof record.src === "string" ? record.src : undefined;
    const text = typeof record.text === "string" ? record.text : typeof record.script === "string" ? record.script : undefined;
    if (src || text) return { ...(src ? { src } : {}), ...(text ? { text } : {}) };
  }
  if (typeof content.script === "string" && content.script.trim()) return { text: content.script };
  return {};
}

function isAudioUrl(value: string): boolean {
  return /^(?:https?:|blob:|data:audio\/|\/)/i.test(value) || /\.(?:mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)(?:[?#].*)?$/i.test(value);
}

function VocabularyCard({
  item,
  itemIndex,
  speak,
  openModal,
  resolveImage
}: {
  item: LessonVocabularyItem;
  itemIndex: number;
  speak: (text: string) => void;
  openModal: (state: VocabularyModalState) => void;
  resolveImage?: LearnerCallbacks["resolveLessonVocabularyImage"];
}) {
  const phrases = item.examples?.slice(0, 3) ?? [];
  const lexicalDetails = item.lexicalDetails ?? [];
  const synonymDetail = lexicalDetails.find((detail) => detail.kind === "synonym");
  const antonymDetail = lexicalDetails.find((detail) => detail.kind === "antonym");
  const relatedDetails = lexicalDetails.filter((detail, index, details) => detail.kind !== "synonym" && detail.kind !== "antonym" && details.findIndex((candidate) => candidate.kind === detail.kind) === index);
  const loadImage = () => {
    if (resolveImage) return resolveImage(itemIndex);
    if (item.imageUrl?.trim() && item.imageAttribution) return Promise.resolve({ status: "available", imageUrl: item.imageUrl.trim(), alt: item.word, attribution: item.imageAttribution } as const);
    return Promise.resolve({ status: "unavailable" } as const);
  };
  return <article className="word-card" aria-label={item.word} style={{ display: "grid", gap: 10, minWidth: 0, padding: 16, marginTop: 10, boxSizing: "border-box" }}>
    <div className="vocabulary-card-heading">
      <ContentImage term={item.word} load={loadImage} />
      <div className="vocabulary-card-main">
        <div className="vocabulary-card-topline">
          <div className="vocabulary-card-word"><h3>{item.word}</h3>{item.type ? <span className="badge vocabulary-card-type" style={{ fontSize: ".72rem", padding: "2px 8px" }}>{item.type}</span> : null}</div>
          <SpeechButton text={item.word} label="Nghe từ" speak={speak} />
        </div>
        {item.pronunciation ? <span className="ipa vocabulary-card-pronunciation">{item.pronunciation}</span> : null}
      </div>
    </div>
    <p className="vocabulary-card-meaning">{item.meaning}</p>
    {phrases.length ? <div className="vocabulary-card-phrases"><span className="small muted">Cụm từ hay dùng</span><div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>{phrases.map((phrase) => <button className="btn-sm btn-ghost" style={listenButtonStyle} type="button" key={phrase} onClick={() => speak(phrase)} title="Nghe cụm từ"><Volume2 size={14} aria-hidden="true" />{phrase}</button>)}</div></div> : null}
    {item.examples?.slice(3).map((example) => <small key={example}>{example}</small>)}
    <div className="vocabulary-card-relations" aria-label="Các nhóm từ liên quan">
      {item.family?.length ? <button className="chip good" type="button" onClick={() => openModal({ kind: "family", item })}>Họ từ</button> : null}
      {item.synonyms?.length ? <button className="chip mid" type="button" onClick={() => openModal({ kind: "synonyms", item })}>Đồng nghĩa</button> : synonymDetail ? <button className="chip mid" type="button" onClick={() => openModal({ kind: "lexical", item, detail: synonymDetail })}>Đồng nghĩa</button> : null}
      {antonymDetail ? <button className="chip low" type="button" onClick={() => openModal({ kind: "lexical", item, detail: antonymDetail })}>Trái nghĩa</button> : null}
      {item.umbrella ? <button className="chip umb" type="button" onClick={() => openModal({ kind: "umbrella", item })}>Từ bao quát</button> : null}
      {relatedDetails.map((detail) => <button className="chip" type="button" key={detail.kind} onClick={() => openModal({ kind: "lexical", item, detail })}>{lexicalKindLabel(detail.kind)}</button>)}
    </div>
  </article>;
}

function VocabularyModal({
  state,
  speak,
  close
}: {
  state: VocabularyModalState;
  speak: (text: string) => void;
  close: () => void;
}) {
  const { item } = state;
  const labels = {
    family: "Họ từ",
    synonyms: "Đồng nghĩa",
    umbrella: "Từ bao quát",
    lexical: "Từ liên quan"
  } as const;
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog wide" role="dialog" aria-modal="true" aria-label={labels[state.kind]} data-testid={`modal.vocab-${state.kind === "synonyms" ? "all-synonyms" : state.kind === "lexical" ? "lexical-detail" : state.kind}`} data-modal={`vocab-${state.kind === "synonyms" ? "all-synonyms" : state.kind === "lexical" ? "lexical-detail" : state.kind}`}>
      <div className="row between"><div><div className="eyebrow">Từ vựng · {item.word}</div><h2>{labels[state.kind]}</h2></div><button type="button" aria-label="Đóng" onClick={close}>Đóng</button></div>
      {state.kind === "family" ? <FamilyModal item={item} speak={speak} /> : null}
      {state.kind === "synonyms" ? <SynonymsModal item={item} speak={speak} /> : null}
      {state.kind === "umbrella" ? <UmbrellaModal item={item} speak={speak} /> : null}
      {state.kind === "lexical" ? <LexicalModal item={item} {...(state.detail ? { detail: state.detail } : {})} speak={speak} /> : null}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="btn-primary" type="button" onClick={close}>Đóng</button></div>
    </section>
  </div>;
}

function FamilyModal({ item, speak }: { item: LessonVocabularyItem; speak: (text: string) => void }) {
  return <div className="stack" style={{ gap: 10 }} aria-label="Các từ cùng họ">{item.family?.map((word) => <article className="card flat" style={{ minWidth: 0 }} key={`${word.word}-${word.type ?? ""}`}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><b>{word.word}</b>{word.type ? <span className="small muted"> · {word.type}</span> : null}<p className="small">{word.meaning}</p></div><button type="button" style={listenButtonStyle} onClick={() => speak(word.word)}><Volume2 size={14} aria-hidden="true" />Nghe</button></div></article>)}</div>;
}

function SynonymsModal({ item, speak }: { item: LessonVocabularyItem; speak: (text: string) => void }) {
  return <div className="stack" style={{ gap: 10 }} aria-label="Các từ đồng nghĩa">{item.synonyms?.map((word) => <article className="card flat" style={{ minWidth: 0 }} key={word.word}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><b>{word.word}</b><span className="badge">{word.level}</span><p className="small">{word.note}</p></div><button type="button" style={listenButtonStyle} onClick={() => speak(word.word)}><Volume2 size={14} aria-hidden="true" />Nghe</button></div></article>)}</div>;
}

function UmbrellaModal({ item, speak }: { item: LessonVocabularyItem; speak: (text: string) => void }) {
  if (!item.umbrella) return null;
  return <div className="stack" style={{ gap: 12 }} aria-label="Từ bao quát"><article className="card flat"><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><div className="eyebrow">Từ bao quát</div><h3>{item.umbrella.word}</h3><p>{item.umbrella.meaning}</p></div><button type="button" style={listenButtonStyle} onClick={() => speak(item.umbrella!.word)}><Volume2 size={14} aria-hidden="true" />Nghe</button></div></article><div><div className="small muted">Từ hiện tại và các từ cùng nhóm</div><div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>{[item, ...item.umbrella.siblings].map((word) => <button type="button" style={listenButtonStyle} key={word.word} onClick={() => speak(word.word)}><Volume2 size={14} aria-hidden="true" />{word.word}{"meaning" in word && word.meaning ? ` · ${word.meaning}` : ""}</button>)}</div></div></div>;
}

function LexicalModal({ item, detail, speak }: { item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail; speak: (text: string) => void }) {
  const details = item.lexicalDetails ?? [];
  const [selected, setSelected] = useState<LessonVocabularyLexicalDetail | null>(detail ?? null);
  if (!details.length) return <Notice tone="info">Chưa có dữ liệu từ liên quan cho từ này.</Notice>;
  const active = selected ?? details[0]!;
  return <div className="stack" style={{ gap: 12 }}><div className="row" style={{ flexWrap: "wrap", gap: 8 }}>{details.map((candidate) => <button className={candidate === active ? "btn-primary" : ""} type="button" key={`${candidate.kind}-${candidate.word}`} onClick={() => { setSelected(candidate); speak(candidate.word); }}>{lexicalKindLabel(candidate.kind)} · {candidate.word}</button>)}</div><article className="card flat"><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><div className="eyebrow">{lexicalKindLabel(active.kind)}</div><h3>{active.word}</h3></div><button type="button" style={listenButtonStyle} onClick={() => speak(active.word)}><Volume2 size={14} aria-hidden="true" />Nghe</button></div>{active.definition ? <p><b>Định nghĩa:</b> {active.definition}</p> : null}{active.example ? <p><b>Ví dụ:</b> {active.example}</p> : null}{active.context ? <p><b>Ngữ cảnh:</b> {active.context}</p> : null}{active.note ? <p><b>Ghi chú:</b> {active.note}</p> : null}{active.source ? <p className="small muted">Nguồn: {active.source}</p> : null}</article></div>;
}

function lexicalKindLabel(kind: LessonVocabularyLexicalDetail["kind"]): string {
  return kind === "synonym" ? "Đồng nghĩa" : kind === "antonym" ? "Trái nghĩa" : kind === "slang" ? "Khẩu ngữ" : "Văn phong";
}

export function LearnerMicro({ view, actions }: { view: MicroView; actions: LearnerCallbacks }) {
  const [answer, setAnswer] = useState(view.attempt?.answer ?? "");
  const [busyAction, setBusyAction] = useState<"submit" | "complete" | "regenerate" | null>(null);
  const busyActionRef = useRef<"submit" | "complete" | "regenerate" | null>(null);
  const [actionError, setActionError] = useState("");
  useEffect(() => setAnswer(view.attempt?.answer ?? ""), [view.id, view.attempt?.answer]);
  const startAction = (action: "submit" | "complete" | "regenerate") => {
    if (busyActionRef.current) return false;
    busyActionRef.current = action;
    setBusyAction(action);
    return true;
  };
  const stopAction = () => {
    busyActionRef.current = null;
    setBusyAction(null);
  };
  const submit = async () => {
    const trimmed = answer.trim();
    if (!trimmed || !startAction("submit")) return;
    setActionError("");
    try {
      await actions.submitMicroAnswer(trimmed);
    } catch {
      setActionError("Chưa kiểm tra được câu trả lời. Bạn có thể thử lại.");
    } finally {
      stopAction();
    }
  };
  const complete = async () => {
    if (view.feedback?.status !== "ready" || !startAction("complete")) return;
    setActionError("");
    try {
      await actions.completeMicroLesson();
    } catch {
      setActionError("Chưa ghi nhận được bài siêu ngắn. Bạn có thể thử lại.");
    } finally {
      stopAction();
    }
  };
  const regenerate = async () => {
    if (view.regenerateAvailable !== true || !startAction("regenerate")) return;
    setActionError("");
    try {
      await actions.regenerateMicroLesson();
    } catch {
      setActionError("Chưa tạo được bài mới. Bạn có thể thử lại.");
    } finally {
      stopAction();
    }
  };
  if (view.completedAt) return <CompletedMicro view={view} actions={actions} />;
  return <div className="app-learner-page micro-page"><AppLink href="/home" navigate={actions.navigate}>← Quay lại</AppLink><PageTitle eyebrow={`Bài siêu ngắn · ${view.durationMinutes} phút · ${view.cefr}`} title={view.topic} /><section className="card micro-theory"><h2>Học nhanh</h2><p>{view.theory}</p><div className="row">{view.vocabulary.map((word) => <button className="badge" type="button" key={word} aria-label={`Nghe ${word}`} onClick={() => actions.speak(word)}><Volume2 size={16} aria-hidden="true" /> {word}</button>)}</div></section><form className="card micro-practice" onSubmit={(event) => { event.preventDefault(); void submit(); }}><h2>Luyện ngay</h2>{view.practice.type === "mcq" ? <fieldset className="stack" aria-label={view.practice.prompt} disabled={Boolean(busyAction)}><legend>{view.practice.prompt}</legend>{view.practice.options?.map((option) => <label className={`opt ${answer === option ? "sel" : ""}`} key={option}><input type="radio" name="micro-answer" checked={answer === option} onChange={() => setAnswer(option)} />{option}</label>)}</fieldset> : <><p>{view.practice.prompt}</p><textarea aria-label="Câu trả lời" value={answer} disabled={Boolean(busyAction)} onChange={(event) => setAnswer(event.target.value)} /></>}<button className="btn-primary" type="submit" aria-busy={busyAction === "submit" || undefined} disabled={!answer.trim() || Boolean(busyAction)}>{busyAction === "submit" ? "Đang kiểm tra…" : "Kiểm tra"}</button></form>{view.feedback ? <section className="card micro-feedback" aria-label="Phản hồi" aria-live="polite"><h2>Phản hồi</h2><Notice tone={view.feedback.status === "ready" ? "ok" : view.feedback.status === "error" ? "danger" : "info"}>{view.feedback.message}</Notice></section> : null}<ErrorText message={actionError || view.regenerateError} /><div className="row between micro-actions"><AppLink className="btn" href="/coach" navigate={actions.navigate}>Luyện thêm với Season</AppLink><div className="row"><button type="button" aria-busy={busyAction === "regenerate" || undefined} disabled={view.regenerateAvailable !== true || Boolean(busyAction)} onClick={() => void regenerate()}>{busyAction === "regenerate" ? "Đang tạo bài…" : "Tạo lại bài"}</button><button className="btn-primary btn-lg" type="button" aria-busy={busyAction === "complete" || undefined} disabled={view.feedback?.status !== "ready" || Boolean(busyAction)} onClick={() => void complete()}>{busyAction === "complete" ? "Đang lưu…" : "Hoàn thành"}</button></div></div></div>;
}

function CompletedMicro({ view, actions }: { view: MicroView; actions: LearnerCallbacks }) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const regenerate = async () => {
    if (view.regenerateAvailable !== true || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await actions.regenerateMicroLesson();
    } catch {
      setError("Chưa tạo được bài mới. Bạn có thể thử lại.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return <div className="app-learner-page micro-page"><AppLink href="/home" navigate={actions.navigate}>← Quay lại</AppLink><PageTitle eyebrow={`Bài siêu ngắn · ${view.durationMinutes} phút · ${view.cefr}`} title={view.topic} aside={<span className="badge ok">Đã hoàn thành</span>} /><section className="card micro-complete"><h2>Xong rồi!</h2><Notice tone="ok">Bài siêu ngắn này đã được ghi nhận. Bạn có thể ôn lại nội dung hoặc luyện thêm với Season.</Notice>{view.attempt?.score !== undefined ? <div className="stat"><strong>{view.attempt.score}</strong><span>Điểm bài</span></div> : null}{view.feedback ? <p className="small muted">{view.feedback.message}</p> : null}</section><ErrorText message={error || view.regenerateError} /><div className="row between micro-actions"><AppLink className="btn" href="/coach" navigate={actions.navigate}>Luyện thêm với Season</AppLink><button type="button" aria-busy={busy || undefined} disabled={view.regenerateAvailable !== true || busy} onClick={() => void regenerate()}>{busy ? "Đang tạo bài…" : "Tạo bài khác"}</button></div></div>;
}


