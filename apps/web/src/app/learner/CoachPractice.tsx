import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { LockKeyhole, Mic } from "lucide-react";
import type { ChallengeView, CoachView, LearnerCallbacks, PracticeView } from "./contracts.js";
import { ErrorText, Notice, PageTitle, Progress, AppLink } from "./ui.js";

type SpeechRecognitionResultEvent = { readonly results: ArrayLike<ArrayLike<{ readonly transcript: string }>> };
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function appendTranscript(current: string, event: SpeechRecognitionResultEvent): string {
  const transcript = event.results[0]?.[0]?.transcript.trim() ?? "";
  if (!transcript) return current;
  const draft = current.trim();
  return `${draft}${draft ? " " : ""}${transcript}`;
}

export function LearnerCoach({ view, actions }: { view: CoachView; actions: LearnerCallbacks }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [sendError, setSendError] = useState("");
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const clearChatButtonRef = useRef<HTMLButtonElement>(null);
  const clearDialogTitleId = useId();
  const clearDialogDescriptionId = useId();
  const clearChatWasOpen = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechSupported = speechRecognitionConstructor() !== null;

  useEffect(() => {
    if (clearChatOpen) {
      clearChatWasOpen.current = true;
    } else if (clearChatWasOpen.current) {
      clearChatButtonRef.current?.focus();
    }
  }, [clearChatOpen]);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try { recognition.stop(); } catch { /* Recognition may already be closed by the browser. */ }
    }
  }, []);

  const stopListening = () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setRecording(false);
    if (recognition) {
      try { recognition.stop(); } catch { /* Recognition may already be closed by the browser. */ }
    }
  };

  const startListening = () => {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) return;
    let recognition: SpeechRecognitionInstance;
    try { recognition = new Constructor(); } catch {
      setSpeechError("Không mở được micro. Hãy cho phép micro rồi thử lại.");
      return;
    }
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => setMessage((current) => appendTranscript(current, event));
    recognition.onerror = () => {
      setRecording(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setSpeechError("Không nghe được giọng nói. Hãy cho phép micro rồi thử lại.");
    };
    recognition.onend = () => {
      setRecording(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
    setSpeechError("");
    setRecording(true);
    try {
      recognition.start();
    } catch {
      setRecording(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setSpeechError("Không mở được micro. Hãy cho phép micro rồi thử lại.");
    }
  };

  if (view.levelApproved === false) return <div className="app-learner-page"><PageTitle title="Luyện với Season" /><Notice tone="warn">Bạn cần được duyệt trình độ trước khi luyện với Season.</Notice><AppLink className="btn btn-primary" href="/home" navigate={actions.navigate}>Về trang chủ</AppLink></div>;
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || view.thinking || sending) return;
    setSending(true);
    setSendError("");
    setMessage("");
    try {
      await actions.sendCoachMessage(trimmed);
    } catch {
      setMessage(trimmed);
      setSendError("Chưa gửi được tin nhắn. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      setSending(false);
    }
  };
  const persona = view.persona === "formal" ? "formal" : "informal";
  const capped = view.daily.used >= view.daily.limit;
  const coachError = sendError || speechError || view.error;
  const pageStyle: CSSProperties = { width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" };
  const composeStyle: CSSProperties = { display: "flex", flexWrap: "nowrap", alignItems: "stretch", gap: 8, margin: "16px 16px 16px", paddingTop: 12, borderTop: "1px solid var(--line)" };
  const composeInputStyle: CSSProperties = { flex: "1 1 10rem", minWidth: 0, minHeight: 52, lineHeight: 1.45, resize: "vertical", boxSizing: "border-box" };
  const composeActionsStyle: CSSProperties = { display: "flex", alignItems: "stretch", gap: 8, flex: "0 0 auto" };
  const targetStyle: CSSProperties = { minWidth: 44, minHeight: 52, height: "100%", alignSelf: "stretch", boxSizing: "border-box" };
  const chatStyle: CSSProperties = { gap: 12, maxHeight: "min(48vh, 420px)", minHeight: view.messages.length === 0 ? 0 : 180, overflowY: "auto", padding: "8px 6px", boxSizing: "border-box" };
  return <div className="app-learner-page coach-page" style={pageStyle}><div className="card coach-surface"><PageTitle title="Season" detail={`${view.topic || "Trò chuyện tự do"} · ${view.cefr}`} aside={<div className="row coach-actions"><div className="coach-persona" role="group" aria-label="Phong cách của Season"><button className={`btn-sm ${persona === "informal" ? "btn-primary" : ""}`} type="button" disabled={view.thinking || sending} aria-pressed={persona === "informal"} onClick={() => void actions.changeCoachPersona("informal")}>Informal</button><button className={`btn-sm ${persona === "formal" ? "btn-primary" : ""}`} type="button" disabled={view.thinking || sending} aria-pressed={persona === "formal"} onClick={() => void actions.changeCoachPersona("formal")}>Formal</button></div><button ref={clearChatButtonRef} className="btn-sm btn-x" type="button" disabled={view.thinking || sending} title="Xoá đoạn chat này và bắt đầu hội thoại mới" onClick={() => setClearChatOpen(true)}>Xoá chat</button></div>} />{!view.aiAvailable ? <Notice tone="warn">AI chưa kết nối nên Season chưa trả lời. Báo người vận hành nhập API key trong Cài đặt.</Notice> : null}<div className="row between"><span className="row"><span className={`badge ${capped ? "danger" : view.daily.used >= view.daily.limit * .8 ? "warn" : "primary"}`}>Hôm nay {view.daily.used}/{view.daily.limit} lượt</span><span className={`badge ${view.weekly.turns >= view.weekly.target ? "ok" : ""}`}>Tuần này {view.weekly.turns} lượt{view.weekly.turns >= view.weekly.target ? " ✓" : ` · mục tiêu ≥${view.weekly.target}`}</span></span><details className="xs"><summary>Giới hạn chat hoạt động thế nào?</summary><div className="muted">1 lượt = 1 tin nhắn bạn gửi và Season trả lời kèm chấm điểm. Tối đa <b>{view.daily.limit} lượt/ngày</b>; bộ đếm về 0 lúc 0 giờ. Xoá chat không trả lại lượt. Tin nhắn lỗi mạng không tính lượt. Mục tiêu: ít nhất {view.weekly.target} lượt/tuần; không có giới hạn theo tuần.</div></details></div>{capped ? <Notice tone="warn"><b>Đã dùng hết {view.daily.limit} lượt chat hôm nay.</b> Ô nhập mở lại ngày mai; bạn có thể ôn bài tuần này.</Notice> : null}<section className="chat" aria-label="Cuộc trò chuyện với Season" aria-busy={view.thinking || sending || undefined} style={chatStyle}>{view.messages.length === 0 ? <div className="msg ai"><p>Chào bạn! Hôm nay mình luyện một tình huống thật nhé.</p></div> : view.messages.map((item) => <article className={`msg ${item.speaker === "coach" ? "ai" : "user"}`} key={item.id}><div className="eyebrow">{item.speaker === "coach" ? "Season" : "Bạn"}</div><p>{item.text}</p>{item.feedback ? <div className="correction"><b>{item.feedback.relevant ? "Phản hồi" : "Hãy quay lại chủ đề nhé"}</b><p>{item.feedback.relevanceNote}</p><div className="rubric"><span>Ý nghĩa {item.feedback.rubric.meaning}/5</span><span>Từ vựng {item.feedback.rubric.vocabulary}/5</span><span>Ngữ pháp {item.feedback.rubric.grammar}/5</span></div>{item.feedback.suggestions.map((suggestion, index) => <p key={`${suggestion.original}-${suggestion.corrected}-${index}`}><del>{suggestion.original}</del> → <b>{suggestion.corrected}</b> · {suggestion.explanation}</p>)}</div> : null}</article>)}{view.thinking ? <div className="msg ai" role="status">Season đang nghĩ…</div> : null}</section><ErrorText id={coachError ? "coach-error" : undefined} message={coachError} />
    <section className="card" style={{ marginTop: 16, padding: 16, minWidth: 0 }}><h2 style={{ marginTop: 0 }}>Từ bí mật</h2><div className="row" style={{ gap: 10, alignItems: "stretch" }}>{view.vocabulary.map((item, index) => <button className="word-card" type="button" key={`${item.word}-${index}`} aria-label={item.opened ? item.word : "Mở từ bí mật"} onClick={() => item.opened ? actions.speak(item.word) : void actions.unlockCoachVocabulary?.(item.word)}>{item.opened ? <><b>{item.word}</b><small>{item.meaning}</small></> : <><LockKeyhole className="status-icon" aria-hidden="true" /><span className="sr-only">🔒</span><small>Mở từ</small></>}</button>)}</div></section>
    <form className="chat-compose" aria-busy={view.thinking || sending || undefined} onSubmit={send} style={composeStyle}><textarea aria-label="Tin nhắn cho Season" aria-describedby={coachError ? "coach-error" : undefined} value={message} disabled={view.thinking || sending || !view.aiAvailable || capped} onChange={(event) => setMessage(event.target.value)} placeholder={view.thinking || sending ? "Season đang trả lời…" : view.cefr === "A1" || view.cefr === "A2" ? "Viết câu trả lời bằng tiếng Anh…" : "Type your reply in English…"} style={composeInputStyle} /> <div style={composeActionsStyle}>{speechSupported ? <button className={`coach-mic ${recording ? "is-recording" : ""}`} style={targetStyle} type="button" aria-label={recording ? "Đang nghe" : "Nói"} aria-pressed={recording} title={recording ? "Dừng nghe" : "Nói"} disabled={view.thinking || sending || (!recording && (!view.aiAvailable || capped))} onClick={recording ? stopListening : startListening}><MicIcon /></button> : null}<button className="btn-primary btn-lg" style={targetStyle} type="submit" disabled={view.thinking || sending || !view.aiAvailable || capped || !message.trim() || recording}>{view.thinking || sending ? "Đang gửi…" : "Gửi"}</button></div></form></div>
    <p className="xs muted">Mỗi lượt Season trả lời và chấm 3 tiêu chí (đúng ý · từ vựng · ngữ pháp), gợi ý tối đa 3 chỗ sửa. Mục tiêu: ≥{view.weekly.target} lượt/tuần.</p>
    {clearChatOpen ? <ClearChatDialog titleId={clearDialogTitleId} descriptionId={clearDialogDescriptionId} onCancel={() => setClearChatOpen(false)} onConfirm={() => { setClearChatOpen(false); void actions.startNewCoachChat(); }} /> : null}
  </div>;
}

function ClearChatDialog({ titleId, descriptionId, onCancel, onConfirm }: { titleId: string; descriptionId: string; onCancel: () => void; onConfirm: () => void }) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"));
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className="modal-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onKeyDown={handleKeyDown}><h2 id={titleId}>Xoá đoạn chat này?</h2><p id={descriptionId}>Tin nhắn và ô từ đã mở sẽ biến mất, không khôi phục lại được. Số lượt luyện tuần này vẫn tính.</p><div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button ref={cancelButtonRef} style={{ minWidth: 44, minHeight: 44 }} type="button" onClick={onCancel}>Huỷ</button><button className="btn-danger" style={{ minWidth: 44, minHeight: 44 }} type="button" onClick={onConfirm}>Xoá chat</button></div></section></div>;
}

export function LearnerChallenge({ view, actions }: { view: ChallengeView; actions: LearnerCallbacks }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const complete = view.phase === "complete" || Boolean(view.result) || view.progress.complete;
  const passed = view.result?.passed ?? view.progress.passed;
  const pendingRequest = view.request?.status === "pending";
  const approvedRequest = view.request?.status === "approved";
  const rejectedRequest = view.request?.status === "rejected";
  const retakeAvailable = Boolean(view.retakePlan) || passed === false;
  const capped = view.daily.used >= view.daily.limit;
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError("");
    try {
      await actions.sendChallengeMessage(trimmed);
      setMessage("");
    } catch {
      setSendError("Chưa gửi được lượt này. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      setSending(false);
    }
  };
  const challengeError = sendError || view.error;
  const challengeComposeStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8, marginTop: 16 };
  const challengeChatStyle: CSSProperties = { gap: 12, ...(view.messages.length === 0 ? { minHeight: 0, padding: 0 } : {}) };
  return <div className="app-learner-page"><PageTitle eyebrow={`Season nói ở mức ${view.targetLevel} · lượt ${view.progress.completedTurns}/${view.progress.requiredTurns}`} title={`Thử thách lên mức ${view.targetLevel}`} aside={<span className={`badge ${view.progress.average >= 3.5 && view.progress.offTopic <= 1 ? "ok" : "warn"}`}>TB {view.progress.average.toFixed(1)}/5 · lạc đề {view.progress.offTopic}</span>} /><Notice>Đạt khi điểm trung bình (ý · từ · ngữ pháp) ≥ <b>3.5/5</b> sau {view.progress.requiredTurns} lượt, tối đa <b>1</b> lượt lạc đề. Trả lời đủ ý bằng tiếng Anh, đúng câu hỏi. Các lượt tính vào giới hạn {view.daily.limit} lượt/ngày (hôm nay {view.daily.used}/{view.daily.limit}), nhưng không tính điểm thưởng hay mục tiêu tuần.</Notice>{!view.aiAvailable ? <Notice tone="warn">AI chưa kết nối nên Season chưa trả lời. Báo người vận hành nhập API key trong Cài đặt.</Notice> : null}{capped && !complete ? <Notice tone="warn"><b>Đã dùng hết {view.daily.limit} lượt chat hôm nay.</b> Thử thách được lưu, mai làm tiếp.</Notice> : null}<section className="chat" aria-label="Cuộc trò chuyện thử thách" aria-busy={sending || undefined} style={challengeChatStyle}>{view.messages.map((item) => <article className={`msg ${item.speaker === "coach" ? "ai" : "user"}`} key={item.id}><b>{item.speaker === "coach" ? "Season" : "Bạn"}</b><p>{item.text}</p>{item.feedback ? <p className="small muted">{item.feedback.relevanceNote}</p> : null}</article>)}</section>{complete ? <Notice tone={passed && !rejectedRequest ? "ok" : "warn"}>{pendingRequest ? "Bạn đã vượt qua thử thách. Yêu cầu lên mức đã được gửi để duyệt." : approvedRequest ? "Yêu cầu lên mức đã được duyệt." : rejectedRequest ? "Yêu cầu lên mức chưa được duyệt; Season đã tạo kế hoạch luyện lại cho bạn." : retakeAvailable ? "Chưa đạt lần này. Season đã tạo kế hoạch luyện lại cho bạn." : passed ? "Bạn đã vượt qua thử thách." : "Kết quả thử thách đã được lưu."}</Notice> : <form className="chat-compose" aria-busy={sending || undefined} style={challengeComposeStyle} onSubmit={send}><textarea aria-label="Câu trả lời thử thách" aria-describedby={challengeError ? "challenge-error" : undefined} value={message} disabled={!view.aiAvailable || capped || sending} onChange={(event) => setMessage(event.target.value)} placeholder="Answer in English…" style={{ flex: "1 1 16rem", minWidth: 0, minHeight: 48 }} /><button className="btn-primary" style={{ minWidth: 44, minHeight: 44 }} type="submit" disabled={!view.aiAvailable || capped || sending || !message.trim()}>Gửi lượt này</button></form>}<ErrorText id={challengeError ? "challenge-error" : undefined} message={challengeError} /><p className="xs muted"><AppLink href="/home" navigate={actions.navigate}>← Trang chủ</AppLink> · Thử thách được lưu: thoát ra rồi vào làm tiếp.</p></div>;
}

export function LearnerPractice({ view, actions }: { view: PracticeView; actions: LearnerCallbacks }) {
  const [text, setText] = useState(view.submission?.text ?? "");
  const [appealReason, setAppealReason] = useState("");
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyAction, setBusyAction] = useState<"submit" | "appeal" | null>(null);
  const busyActionRef = useRef<"submit" | "appeal" | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const appealRef = useRef<HTMLTextAreaElement>(null);
  const speechSupported = view.speechSupported !== false && speechRecognitionConstructor() !== null;

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try { recognition.stop(); } catch { /* Recognition may already be closed by the browser. */ }
    }
  }, []);

  const stopListening = () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setRecording(false);
    if (recognition) {
      try { recognition.stop(); } catch { /* Recognition may already be closed by the browser. */ }
    }
  };

  const startListening = () => {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) return;
    let recognition: SpeechRecognitionInstance;
    try { recognition = new Constructor(); } catch {
      setSpeechError("Không mở được micro. Hãy cho phép micro rồi thử lại.");
      return;
    }
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => setText((current) => appendTranscript(current, event));
    recognition.onerror = () => {
      setRecording(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setSpeechError("Không nghe được giọng nói. Hãy cho phép micro rồi thử lại.");
    };
    recognition.onend = () => {
      setRecording(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
    setSpeechError("");
    setRecording(true);
    try {
      recognition.start();
    } catch {
      setRecording(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setSpeechError("Không mở được micro. Hãy cho phép micro rồi thử lại.");
    }
  };

  const inputMode = view.inputMode === "dialogue" ? "dialogue" : "write";
  const inputLabel = inputMode === "dialogue" ? "Câu trả lời hội thoại" : "Bài làm";
  const inputPlaceholder = inputMode === "dialogue" ? "Nhập câu trả lời hội thoại…" : "Viết bằng tiếng Anh…";
  const pageStyle: CSSProperties = { display: "grid", gap: 16, minWidth: 0, paddingBottom: "calc(88px + env(safe-area-inset-bottom))" };
  const cardStyle: CSSProperties = { display: "grid", gap: 12, minWidth: 0 };
  const beginAction = (action: "submit" | "appeal") => {
    if (busyActionRef.current) return false;
    busyActionRef.current = action;
    setBusyAction(action);
    setActionError("");
    return true;
  };
  const endAction = (focus: "draft" | "appeal" | null = null) => {
    busyActionRef.current = null;
    setBusyAction(null);
    if (focus) window.setTimeout(() => (focus === "draft" ? draftRef.current : appealRef.current)?.focus(), 0);
  };
  const submitPractice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = text.trim();
    if (!answer || recording || !beginAction("submit")) return;
    let focusOnFailure = false;
    try {
      await actions.submitWeeklyPractice(text);
    } catch {
      focusOnFailure = true;
      setActionError("Chưa nộp được bài. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      endAction(focusOnFailure ? "draft" : null);
    }
  };
  const submitAppeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = appealReason.trim();
    if (!reason || !view.submission || !actions.appealWeeklyPractice || !beginAction("appeal")) return;
    let focusOnFailure = false;
    try {
      await actions.appealWeeklyPractice(view.submission.id, reason);
    } catch {
      focusOnFailure = true;
      setActionError("Chưa gửi được kháng nghị. Lý do vẫn được giữ để bạn thử lại.");
    } finally {
      endAction(focusOnFailure ? "appeal" : null);
    }
  };
  if (view.state === "locked") return <div className="app-learner-page" style={pageStyle}><PageTitle eyebrow={`Tuần ${view.weekNumber} · ${view.topic}`} title="Bài thực hành cuối tuần" /><Notice tone="danger"><b>Chưa mở.</b> Hoàn thành đủ bài tuần để mở bài thực hành.</Notice><section className="card" style={cardStyle}><Progress value={view.completedLessons} max={view.totalLessons} label="Tiến độ mở bài thực hành" /><p>{view.completedLessons}/{view.totalLessons} bài đã hoàn thành</p><AppLink className="btn btn-primary" href="/home" navigate={actions.navigate}>Về trang chủ học tiếp</AppLink></section></div>;
  if (view.submission && ["submitted", "reviewed"].includes(view.submission.status)) {
    const graded = view.submission.status === "reviewed"
      || ["graded-ai", "graded-manual", "appeal-pending", "appeal-decided"].includes(view.submission.reviewState ?? "");
    return <div className="app-learner-page" style={pageStyle}><PageTitle eyebrow={`Tuần ${view.weekNumber} · ${view.topic}`} title="Bài thực hành cuối tuần" /><section className="card" style={cardStyle}><span className={`badge ${graded ? "ok" : "warn"}`}>{graded ? "Đã chấm" : "Chờ chấm"}</span><h2>Bài đã nộp</h2><p>{view.submission.text}</p>{view.submission.score ? <div className="grid cols-3"><div className="stat"><strong>{view.submission.score.rubric?.meaning ?? "—"}/5</strong><span>Ý nghĩa</span></div><div className="stat"><strong>{view.submission.score.rubric?.vocabulary ?? "—"}/5</strong><span>Từ vựng</span></div><div className="stat"><strong>{view.submission.score.rubric?.grammar ?? "—"}/5</strong><span>Ngữ pháp</span></div></div> : null}<p>{view.submission.feedback}</p>{view.submission.correctedText ? <div className="correction"><b>Bản gợi ý</b><p>{view.submission.correctedText}</p></div> : null}</section>{view.appeal ? <Notice tone={view.appeal.status === "pending" ? "info" : view.appeal.status === "accepted" ? "ok" : "warn"}>Kháng nghị: {view.appeal.status}{view.appeal.resolution ? ` · ${view.appeal.resolution}` : ""}</Notice> : graded ? <form className="card" aria-busy={busyAction === "appeal" || undefined} onSubmit={(event) => void submitAppeal(event)} style={{ ...cardStyle, marginBottom: 16 }}><h3>Không đồng ý với kết quả?</h3><label>Lý do kháng nghị<textarea ref={appealRef} aria-label="Lý do kháng nghị" value={appealReason} disabled={Boolean(busyAction)} onChange={(event) => setAppealReason(event.target.value)} /></label><ErrorText message={actionError} /><button type="submit" className="btn-primary" aria-busy={busyAction === "appeal" || undefined} disabled={!appealReason.trim() || Boolean(busyAction)} style={{ minHeight: 44, justifySelf: "start" }}>{busyAction === "appeal" ? "Đang gửi…" : "Gửi kháng nghị"}</button></form> : null}</div>;
  }
  return <div className="app-learner-page" style={pageStyle}><PageTitle eyebrow={`Tuần ${view.weekNumber} · ${view.topic}`} title="Bài thực hành cuối tuần" /><form className="card" aria-busy={busyAction === "submit" || undefined} onSubmit={(event) => void submitPractice(event)} style={cardStyle}><h2>Nhiệm vụ</h2><p>{view.task}</p><p className="small muted">{view.guidance}</p>{view.aiAvailable === false ? <Notice tone="warn">AI chưa kết nối; bài vẫn lưu để vận hành chấm thủ công.</Notice> : null}<label>{inputLabel}<textarea ref={draftRef} aria-label={inputLabel} data-input-mode={inputMode} value={text} disabled={Boolean(busyAction)} onChange={(event) => setText(event.target.value)} placeholder={inputPlaceholder} rows={10} /></label>{speechSupported ? <button className={`coach-mic ${recording ? "is-recording" : ""}`} type="button" aria-label={recording ? "Đang nghe" : "Nói"} title={recording ? "Dừng nghe" : "Nói"} disabled={Boolean(busyAction)} onClick={recording ? stopListening : startListening}><MicIcon /></button> : null}{speechError ? <ErrorText message={speechError} /> : null}<ErrorText message={actionError} /><div className="row between" style={{ flexWrap: "wrap", gap: 12 }}><span className="small muted">{text.trim() ? text.trim().split(/\s+/).length : 0} từ</span><button className="btn-primary btn-lg" type="submit" aria-busy={busyAction === "submit" || undefined} disabled={!text.trim() || recording || Boolean(busyAction)} style={{ minHeight: 44 }}>{busyAction === "submit" ? "Đang nộp…" : "Nộp bài"}</button></div></form></div>;
}

function MicIcon() {
  return <Mic size={24} strokeWidth={2.2} aria-hidden="true" focusable="false" />;
}


