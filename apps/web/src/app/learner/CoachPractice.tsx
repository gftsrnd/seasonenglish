import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, LockKeyhole, MessageCircle, Send, SpellCheck2, Volume2 } from "lucide-react";
import type { ChallengeView, CoachView, LearnerCallbacks, PracticeView } from "./contracts.js";
import { ErrorText, Notice, PageTitle, Progress, AppLink } from "./ui.js";
import { SeasonMark } from "../shared/SeasonMark.js";
import { AudioCaptureControl } from "./AudioCaptureControl.js";
import type { AudioEvidence } from "../shared/media/audio-evidence.js";

type SpeechRecognitionConstructor = new () => { start: () => void };

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function LearnerCoach({ view, actions }: { view: CoachView; actions: LearnerCallbacks }) {
  const [message, setMessage] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [audioEvidence, setAudioEvidence] = useState<AudioEvidence>();
  const [sendError, setSendError] = useState("");
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const clearChatButtonRef = useRef<HTMLButtonElement>(null);
  const clearDialogTitleId = useId();
  const clearDialogDescriptionId = useId();
  const clearChatWasOpen = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (clearChatOpen) {
      clearChatWasOpen.current = true;
    } else if (clearChatWasOpen.current) {
      clearChatButtonRef.current?.focus();
    }
  }, [clearChatOpen]);

  if (view.levelApproved === false) return <div className="app-learner-page"><PageTitle title="Luyện với Season" /><Notice tone="warn">Bạn cần được duyệt trình độ trước khi luyện với Season.</Notice><AppLink className="btn btn-primary" href="/home" navigate={actions.navigate}>Về trang chủ</AppLink></div>;
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || view.thinking || sending) return;
    setSending(true);
    setSendError("");
    setPendingMessage(trimmed);
    try {
      if (audioEvidence) await actions.sendCoachMessage(trimmed, audioEvidence);
      else await actions.sendCoachMessage(trimmed);
      setMessage("");
      setAudioEvidence(undefined);
      window.requestAnimationFrame(() => resizeCoachComposer(composerRef.current));
    } catch {
      setSendError("Chưa gửi được tin nhắn. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      setPendingMessage("");
      setSending(false);
    }
  };
  const persona = view.persona === "formal" ? "formal" : "informal";
  const vocabulary = uniqueCoachVocabulary(view.vocabulary);
  const capped = view.daily.used >= view.daily.limit;
  const coachError = sendError || view.error;
  const pageStyle: CSSProperties = { width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" };
  const composeStyle: CSSProperties = { display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 8, margin: 16, paddingTop: 12, borderTop: "1px solid var(--line)" };
  const composeInputStyle: CSSProperties = { flex: "1 1 10rem", minWidth: 0, height: 42, minHeight: 42, maxHeight: 132, overflowY: "hidden", lineHeight: 1.35, resize: "none", boxSizing: "border-box" };
  const composeActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" };
  const chatStyle: CSSProperties = { gap: 12, maxHeight: "min(58vh, 560px)", minHeight: 320, overflowY: "auto", padding: "8px 6px", boxSizing: "border-box" };
  return <div className="app-learner-page coach-page" style={pageStyle}><div className="card coach-surface">
    <div className="coach-header"><span className="coach-brand-icon" aria-hidden="true"><SeasonMark className="coach-season-mark" /></span><PageTitle title="Season" detail={`${view.topic || "Trò chuyện tự do"} · ${view.cefr}`} aside={<div className="row coach-actions"><button className={`coach-persona-toggle is-${persona}`} type="button" role="switch" aria-label="Phong cách của Season" aria-checked={persona === "formal"} disabled={view.thinking || sending} onClick={() => void actions.changeCoachPersona(persona === "informal" ? "formal" : "informal")}><span className={persona === "informal" ? "active" : ""}>Informal</span><span className={persona === "formal" ? "active" : ""}>Formal</span></button><button ref={clearChatButtonRef} className="btn-sm btn-danger" type="button" disabled={view.thinking || sending} title="Xoá đoạn chat này và bắt đầu hội thoại mới" onClick={() => setClearChatOpen(true)}>Xoá chat</button></div>} /></div>
    {!view.aiAvailable ? <Notice tone="warn">AI chưa kết nối nên Season chưa trả lời. Báo người vận hành nhập API key trong Cài đặt.</Notice> : null}
    <div className="coach-limit-row"><span className="row coach-counters"><span className={`badge ${capped ? "danger" : view.daily.used >= view.daily.limit * .8 ? "warn" : "primary"}`}>Hôm nay {view.daily.used}/{view.daily.limit} lượt</span><span className={`badge ${view.weekly.turns >= view.weekly.target ? "ok" : ""}`}>Tuần này {view.weekly.turns} lượt{view.weekly.turns >= view.weekly.target ? " ✓" : ` · mục tiêu ≥${view.weekly.target}`}</span></span><details className="xs coach-limit-details"><summary>Giới hạn chat hoạt động thế nào?</summary><div className="muted coach-limit-copy coach-limit-copy--full coach-limit-copy--plain">1 lượt = 1 tin nhắn bạn gửi và Season trả lời kèm chấm điểm. Tối đa <b>{view.daily.limit} lượt/ngày</b>; bộ đếm về 0 lúc 0 giờ. Xoá chat không trả lại lượt. Tin nhắn lỗi mạng không tính lượt. Mục tiêu: ít nhất {view.weekly.target} lượt/tuần; không có giới hạn theo tuần.</div></details></div>
    {capped ? <Notice tone="warn"><b>Đã dùng hết {view.daily.limit} lượt chat hôm nay.</b> Ô nhập mở lại ngày mai; bạn có thể ôn bài tuần này.</Notice> : null}
    <section className="chat" aria-label="Cuộc trò chuyện với Season" aria-busy={view.thinking || sending || undefined} style={chatStyle}>{view.messages.length === 0 ? <div className="msg ai"><p>Chào bạn! Hôm nay mình luyện một tình huống thật nhé.</p></div> : view.messages.map((item) => <article className={`msg ${item.speaker === "coach" ? "ai" : "user"}`} key={item.id}><div className="eyebrow">{item.speaker === "coach" ? "Season" : "Bạn"}</div>{item.feedback ? <CoachFeedback feedback={item.feedback} /> : <p>{item.text}</p>}{item.speaker === "coach" ? <button className="coach-turn-audio" type="button" aria-label="Nghe câu của Season" title="Nghe câu của Season" onClick={() => actions.speak(coachSpeechText(item), "en-US")}><Volume2 size={17} aria-hidden="true" /><span>Nghe</span></button> : null}</article>)}{sending && pendingMessage ? <article className="msg user coach-message-pending" aria-label="Tin nhắn đang gửi"><div className="eyebrow">Bạn</div><p>{pendingMessage}</p><span className="xs muted">Đang gửi…</span></article> : null}{view.thinking ? <div className="msg ai" role="status">Season đang nghĩ…</div> : null}</section>{coachError ? <div className="coach-error-row"><ErrorText id="coach-error" message={coachError} /></div> : null}
    <section className="card coach-vocabulary"><h2>Từ bí mật</h2><div className="row coach-word-list">{vocabulary.map((item, index) => item.opened ? <button className="word-card coach-word-chip is-opened" type="button" title={item.meaning} key={item.word.toLocaleLowerCase()} aria-label={`Nghe từ ${item.word}${item.meaning ? `: ${item.meaning}` : ""}`} onClick={() => actions.speak(item.word, "en-US")}><b>{item.word}</b></button> : <div className="word-card coach-word-chip is-locked" key={item.word.toLocaleLowerCase()} aria-label={`Từ bí mật ${index + 1} chưa mở`}><LockKeyhole className="status-icon" aria-hidden="true" /><span>Gợi ý: {item.meaning || `từ số ${index + 1}`}</span></div>)}</div></section>
    <form className="chat-compose" aria-busy={view.thinking || sending || undefined} onSubmit={send} style={composeStyle}><textarea ref={composerRef} rows={1} aria-label="Tin nhắn cho Season" aria-describedby={coachError ? "coach-error" : undefined} value={message} disabled={view.thinking || sending || !view.aiAvailable || capped} onChange={(event) => { setMessage(event.target.value); resizeCoachComposer(event.currentTarget); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={view.thinking || sending ? "Season đang trả lời…" : view.cefr === "A1" || view.cefr === "A2" ? "Viết câu trả lời bằng tiếng Anh…" : "Type your reply in English…"} style={composeInputStyle} /><div style={composeActionsStyle}><AudioCaptureControl label="Micro Season" value={audioEvidence} showMicrophone={speechRecognitionConstructor() !== null || (typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined")} transcript={message} disabled={view.thinking || sending || !view.aiAvailable || capped} uploadAudio={actions.uploadAssessmentAudio} getAudioReadUrl={actions.getAssessmentAudioReadUrl} onTranscript={setMessage} onAudioChange={setAudioEvidence} /><button className="btn-primary coach-compose-icon coach-send" type="submit" aria-label={view.thinking || sending ? "Đang gửi…" : "Gửi"} title={view.thinking || sending ? "Đang gửi…" : "Gửi"} disabled={view.thinking || sending || !view.aiAvailable || capped || !message.trim()}><Send size={20} aria-hidden="true" /></button></div></form></div>
    <p className="xs muted">Mỗi lượt Season trả lời và chấm 3 tiêu chí (đúng ý · từ vựng · ngữ pháp), gợi ý tối đa 3 chỗ sửa. Mục tiêu: ≥{view.weekly.target} lượt/tuần.</p>
    {clearChatOpen ? <ClearChatDialog titleId={clearDialogTitleId} descriptionId={clearDialogDescriptionId} onCancel={() => setClearChatOpen(false)} onConfirm={() => { setClearChatOpen(false); void actions.startNewCoachChat(); }} /> : null}
  </div>;
}

function resizeCoachComposer(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  const nextHeight = Math.min(132, Math.max(42, element.scrollHeight));
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = element.scrollHeight > 132 ? "auto" : "hidden";
}

function CoachFeedback({ feedback }: { feedback: NonNullable<CoachView["messages"][number]["feedback"]> }) {
  const scores = [
    { label: "Ý nghĩa", criterion: feedback.rubric.meaning, Icon: MessageCircle },
    { label: "Từ vựng", criterion: feedback.rubric.vocabulary, Icon: BookOpen },
    { label: "Ngữ pháp", criterion: feedback.rubric.grammar, Icon: SpellCheck2 }
  ] as const;
  const resultLabels = {
    correct: "Đúng",
    partially_correct: "Đúng một phần",
    missing_information: "Thiếu ý",
    off_topic: "Sai mục tiêu"
  } as const;
  const retryCurrentQuestion = feedback.evaluation.status !== "valid";
  const insufficient = feedback.evaluation.status === "insufficient";
  return <section className="coach-feedback coach-feedback-flat" role="region" aria-label="Phản hồi của Season">
    <div className="coach-feedback-section coach-season-reply" aria-label="Câu Season trả lời">
      <h4>Câu Season trả lời</h4>
      <p>{feedback.seasonReply}</p>
    </div>
    <div className="coach-feedback-summary">
      <div className="coach-evaluation" aria-label="Nhận xét câu trả lời của bạn"><h4>Nhận xét câu trả lời của bạn</h4><p className="coach-feedback-result">Kết quả: {resultLabels[feedback.evaluation.result]}</p><p className="coach-feedback-note">{feedback.evaluation.noteVi}</p></div>
      <div className="coach-feedback-scores" aria-label="Ba điểm đánh giá">{scores.map(({ label, criterion, Icon }) => <div className="coach-feedback-score" title={`${criterion.evidence} ${criterion.improvement}`} key={label}><Icon className="coach-feedback-score-icon" size={18} aria-hidden="true" /><span><b>{label}</b><strong aria-label={`${label}: ${criterion.score} trên 5 điểm`}>{criterion.score}/5</strong></span></div>)}</div>
    </div>
    <div className="coach-feedback-section coach-correction" aria-label="Câu sửa">
      <h4>Câu sửa</h4>{feedback.corrections.length ? feedback.corrections.map((item, index) => <div key={`${item.corrected}-${index}`}><p><del>{item.original}</del> → <strong>{item.corrected}</strong></p><p>{item.reason}</p><p className="coach-feedback-translation">{item.translation}</p></div>) : <p>Không có lỗi cần sửa trực tiếp. Xem gợi ý cải thiện trong phần giải thích.</p>}
      {feedback.correctedText ? <p><b>Câu hoàn chỉnh:</b> {feedback.correctedText}</p> : null}
    </div>
    <div className="coach-feedback-section coach-next-question" aria-label={retryCurrentQuestion ? "Câu cần trả lời lại" : "Câu bạn nên nói tiếp"}>
      <h4>{retryCurrentQuestion ? "Câu cần trả lời lại" : "Câu bạn nên nói tiếp"}</h4>
      {insufficient ? <p><strong>Hãy trả lời lại câu hỏi Season vừa hỏi bằng một câu tiếng Anh đầy đủ.</strong></p> : <><p><strong>{feedback.nextQuestion}</strong></p><p className="coach-feedback-translation">{feedback.nextQuestionTranslation}</p></>}
    </div>
    <div className="coach-feedback-disclosures">
      <details className="coach-feedback-disclosure">
        <summary>Xem giải thích và gợi ý</summary>
        <div className="coach-feedback-details">
          <div className="coach-feedback-translation-block"><b>Nghĩa câu Season trả lời</b><p className="coach-feedback-translation">{feedback.seasonReplyTranslation}</p></div>
          <div className="coach-feedback-criteria" aria-label="Giải thích điểm">{scores.map(({ label, criterion }) => <article className="coach-feedback-criterion-card" key={label}><div><b>{label}</b><strong>{criterion.score}/5</strong></div><p>{criterion.evidence}</p><p className="coach-feedback-improvement">Gợi ý: {criterion.improvement}</p></article>)}</div>
          <div className="coach-suggested-answer" aria-label="Gợi ý trả lời câu tiếp theo"><h4>Gợi ý trả lời câu tiếp theo</h4>{feedback.suggestedAnswer.text ? <><p><strong>{feedback.suggestedAnswer.text}</strong></p><p className="coach-feedback-translation">{feedback.suggestedAnswer.translation}</p></> : <p>Không có gợi ý cho lượt này.</p>}</div>
        </div>
      </details>
    </div>
  </section>;
}

function uniqueCoachVocabulary(items: CoachView["vocabulary"]): CoachView["vocabulary"] {
  const unique = new Map<string, CoachView["vocabulary"][number]>();
  for (const item of items) {
    const key = item.word.trim().toLocaleLowerCase();
    if (!isPlausibleCoachVocabulary(item.word)) continue;
    const existing = unique.get(key);
    if (!existing || item.opened) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 12);
}

function isPlausibleCoachVocabulary(word: string): boolean {
  const normalized = word.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 48) return false;
  return normalized.split(" ").length <= 5 && !/[.!?;:\n\r]/u.test(normalized);
}

function coachSpeechText(item: CoachView["messages"][number]): string {
  return item.feedback?.seasonReply.trim() || item.text.trim();
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

  return <div className="modal-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onKeyDown={handleKeyDown}><h2 id={titleId}>Xoá đoạn chat này?</h2><p id={descriptionId}>Toàn bộ tin nhắn trong đoạn chat hiện tại sẽ biến mất và không khôi phục lại được. Các từ đã mở vẫn được giữ; số lượt luyện tuần này vẫn tính.</p><div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button ref={cancelButtonRef} style={{ minWidth: 44, minHeight: 44 }} type="button" onClick={onCancel}>Huỷ</button><button className="btn-danger" style={{ minWidth: 44, minHeight: 44 }} type="button" onClick={onConfirm}>Xoá chat</button></div></section></div>;
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
  const [audioEvidence, setAudioEvidence] = useState<AudioEvidence>();
  const [recording, setRecording] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyAction, setBusyAction] = useState<"submit" | "appeal" | null>(null);
  const busyActionRef = useRef<"submit" | "appeal" | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const appealRef = useRef<HTMLTextAreaElement>(null);
  const canRecord = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
  const showMicrophone = canRecord || (view.speechSupported !== false && speechRecognitionConstructor() !== null);

  const inputMode = view.inputMode === "dialogue" ? "dialogue" : "write";
  const inputLabel = inputMode === "dialogue" ? "Câu trả lời hội thoại" : "Bài làm";
  const inputPlaceholder = inputMode === "dialogue" ? "Nhập câu trả lời hội thoại…" : "Viết bằng tiếng Anh…";
  const practiceWordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
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
    if (!answer || answer.split(/\s+/).length < 8 || recording || !beginAction("submit")) return;
    let focusOnFailure = false;
    try {
      if (audioEvidence) await actions.submitWeeklyPractice(text, audioEvidence);
      else await actions.submitWeeklyPractice(text);
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
    if (reason.length < 5 || !view.submission || !actions.appealWeeklyPractice || !beginAction("appeal")) return;
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
  if (view.state === "locked") {
    const requiredLessons = 5;
    const completedLessons = Math.min(view.completedLessons, requiredLessons);
    return <div className="app-learner-page" style={pageStyle}><PageTitle eyebrow={`Tuần ${view.weekNumber} · ${view.topic}`} title="Bài thực hành cuối tuần" /><Notice tone="danger"><b>Chưa mở.</b> Hoàn thành đủ 5 bài tuần để mở bài thực hành.</Notice><section className="card" style={cardStyle}><Progress value={completedLessons} max={requiredLessons} label="Tiến độ mở bài thực hành" /><p>{completedLessons}/{requiredLessons} bài đã hoàn thành</p><p className="small muted">Mỗi bài hoàn thành sẽ được cập nhật vào thanh tiến độ này.</p><AppLink className="btn btn-primary" href="/home" navigate={actions.navigate}>Về trang chủ học tiếp</AppLink></section></div>;
  }
  if (view.submission && ["submitted", "reviewed"].includes(view.submission.status)) {
    const graded = view.submission.status === "reviewed"
      || ["graded-ai", "graded-manual", "appeal-pending", "appeal-decided"].includes(view.submission.reviewState ?? "");
    const manuallyGraded = view.submission.gradingSource === "manual";
    return <div className="app-learner-page" style={pageStyle}><PageTitle eyebrow={`Tuần ${view.weekNumber} · ${view.topic}`} title="Bài thực hành cuối tuần" /><section className="card" style={cardStyle}><span className={`badge ${graded ? "ok" : "warn"}`}>{graded ? "Đã chấm" : "Chờ chấm"}</span><h2>Bài đã nộp</h2><p>{view.submission.text}</p>{view.submission.score ? <div className="grid cols-3"><div className="stat"><strong>{view.submission.score.rubric?.meaning ?? "—"}/5</strong><span>Ý nghĩa</span></div><div className="stat"><strong>{view.submission.score.rubric?.vocabulary ?? "—"}/5</strong><span>Từ vựng</span></div><div className="stat"><strong>{view.submission.score.rubric?.grammar ?? "—"}/5</strong><span>Ngữ pháp</span></div></div> : null}<p>{view.submission.feedback}</p>{view.submission.correctedText ? <div className="correction"><b>Bản gợi ý</b><p>{view.submission.correctedText}</p></div> : null}</section>{view.appeal ? <Notice tone={view.appeal.status === "pending" ? "info" : view.appeal.status === "accepted" ? "ok" : "warn"}>Kháng nghị: {view.appeal.status}{view.appeal.resolution ? ` · ${view.appeal.resolution}` : ""}</Notice> : manuallyGraded ? <Notice tone="info">Bài này đã được chấm tay nên không thể gửi kháng nghị.</Notice> : graded ? <form className="card" aria-busy={busyAction === "appeal" || undefined} onSubmit={(event) => void submitAppeal(event)} style={{ ...cardStyle, marginBottom: 16 }}><h3>Không đồng ý với kết quả?</h3><label>Lý do kháng nghị<textarea ref={appealRef} aria-label="Lý do kháng nghị" value={appealReason} disabled={Boolean(busyAction)} onChange={(event) => setAppealReason(event.target.value)} /></label><p className="small muted">Nhập ít nhất 5 ký tự.</p><ErrorText message={actionError} /><button type="submit" className="btn-primary" aria-busy={busyAction === "appeal" || undefined} disabled={appealReason.trim().length < 5 || Boolean(busyAction)} style={{ minHeight: 44, justifySelf: "start" }}>{busyAction === "appeal" ? "Đang gửi…" : "Gửi kháng nghị"}</button></form> : null}<PracticeHistory items={view.history} /></div>;
  }
  return <div className="app-learner-page" style={pageStyle}><PageTitle eyebrow={`Tuần ${view.weekNumber} · ${view.topic}`} title="Bài thực hành cuối tuần" /><form className="card" aria-busy={busyAction === "submit" || undefined} onSubmit={(event) => void submitPractice(event)} style={cardStyle}><h2>Nhiệm vụ</h2><p>{view.task}</p><p className="small muted">{view.guidance}</p>{view.aiAvailable === false ? <Notice tone="warn">AI chưa kết nối; bài vẫn lưu để vận hành chấm thủ công.</Notice> : null}<label>{inputLabel}<textarea ref={draftRef} aria-label={inputLabel} data-input-mode={inputMode} value={text} disabled={Boolean(busyAction)} onChange={(event) => setText(event.target.value)} placeholder={inputPlaceholder} rows={10} /></label><AudioCaptureControl label="Micro bài thực hành" value={audioEvidence} showMicrophone={showMicrophone} transcript={text} disabled={Boolean(busyAction)} uploadAudio={actions.uploadAssessmentAudio} getAudioReadUrl={actions.getAssessmentAudioReadUrl} onTranscript={setText} onAudioChange={setAudioEvidence} onRecordingChange={setRecording} /><ErrorText message={actionError} /><div className="row between" style={{ flexWrap: "wrap", gap: 12 }}><span className="small muted">{practiceWordCount}/8 từ tối thiểu</span><button className="btn-primary btn-lg" type="submit" aria-busy={busyAction === "submit" || undefined} disabled={practiceWordCount < 8 || recording || Boolean(busyAction)} style={{ minHeight: 44 }}>{busyAction === "submit" ? "Đang nộp…" : "Nộp bài"}</button></div></form><PracticeHistory items={view.history} /></div>;
}

function PracticeHistory({ items }: { items: PracticeView["history"] }) {
  if (!items?.length) return null;
  return <section className="card" aria-label="Lịch sử bài tuần">
    <h2>Lịch sử bài tuần</h2>
    <div className="stack">
      {items.map((item) => <article key={item.id} className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div><b>Tuần {item.weekNumber} · {item.topic}</b><p className="small muted">{item.task}</p></div>
        <span className="badge">{item.score ? `${item.score.total}/100` : "Chờ chấm"}</span>
      </article>)}
    </div>
  </section>;
}


