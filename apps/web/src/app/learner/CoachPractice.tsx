import { RequestEvidenceFields, requestEvidenceArgs, type RequestEvidenceDraft } from "../shared/RequestEvidence.js";
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, Info, LockKeyhole, MessageCircle, Send, SpellCheck2, Volume2 } from "lucide-react";
import type { ChallengeView, CoachView, LearnerCallbacks, PracticeView } from "./contracts.js";
import { ErrorText, Notice, PageTitle, Progress, AppLink } from "./ui.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { SeasonMark } from "../shared/SeasonMark.js";
import { AudioCaptureControl } from "./AudioCaptureControl.js";
import { AudioEvidencePanel } from "../shared/media/AudioEvidencePanel.js";
import { normalizeAudioEvidence, type AudioEvidence } from "../shared/media/audio-evidence.js";
import { formatScore, formatScoreOutOf } from "../shared/format-score.js";

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
  // Phones and tablets collapse the secret-word box to one line; desktop keeps it open.
  const compactVocabulary = useMediaQuery("(max-width: 1024px)");
  const phoneComposer = useMediaQuery("(max-width: 480px)");
  const [pendingMessage, setPendingMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [audioEvidence, setAudioEvidence] = useState<AudioEvidence>();
  const [sendError, setSendError] = useState("");
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [feedbackExpanded, setFeedbackExpanded] = useState(true);
  const [explanationExpanded, setExplanationExpanded] = useState(false);
  const clearChatButtonRef = useRef<HTMLButtonElement>(null);
  const clearDialogTitleId = useId();
  const clearDialogDescriptionId = useId();
  const clearChatWasOpen = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (clearChatOpen) {
      clearChatWasOpen.current = true;
    } else if (clearChatWasOpen.current) {
      clearChatButtonRef.current?.focus();
    }
  }, [clearChatOpen]);

  // Keep the newest Season reply in view after a learner submits. Scrolling is
  // confined to the chat log so it never jumps the surrounding page.
  useEffect(() => {
    const chat = chatRef.current;
    if (!chat) return;
    const frame = window.requestAnimationFrame(() => {
      chat.scrollTop = chat.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view.messages.length, view.thinking, sending]);

  if (view.levelApproved === false) return <div className="app-learner-page"><PageTitle title="Season AI Coach" /><Notice tone="warn">Bạn cần được duyệt trình độ trước khi luyện với Season AI Coach.</Notice><AppLink className="btn btn-primary" href="/home" navigate={actions.navigate}>Về trang chủ</AppLink></div>;
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if ((!trimmed && !audioEvidence?.artifactKey) || view.thinking || sending) return;
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
  const openedVocabularyCount = view.vocabularyProgress?.opened ?? vocabulary.filter((item) => item.opened).length;
  const totalVocabularyCount = view.vocabularyProgress?.total ?? vocabulary.length;
  const capped = view.daily.used >= view.daily.limit;
  const chatClosed = view.chatAvailability?.available === false;
  const period = view.monthly;
  const hasMonthlyTarget = period.target > 0;
  const coachError = sendError || view.error;
  const pageStyle: CSSProperties = { width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: 16 };
  const composeStyle: CSSProperties = { display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 8, margin: 16, paddingTop: 12, borderTop: "1px solid var(--line)" };
  const composeInputStyle: CSSProperties = { flex: "1 1 10rem", minWidth: 0, height: 42, minHeight: 42, maxHeight: 132, overflowY: "hidden", lineHeight: 1.35, resize: "none", boxSizing: "border-box" };
  const chatStyle: CSSProperties = { gap: 12, maxHeight: "min(58vh, 560px)", minHeight: 320, overflowY: "auto", padding: "8px 6px", boxSizing: "border-box" };
  return <div className="app-learner-page coach-page" style={pageStyle}>
    <PageTitle eyebrow="Season AI Coach" title="Luyện với Season" detail={`${period.label} · ${view.cefr}`} />
  <div className="card coach-surface">
    <div className="coach-header"><span className="coach-brand-icon" aria-hidden="true"><SeasonMark className="coach-season-mark" /></span><div className="row coach-actions"><button className={`coach-persona-toggle is-${persona}`} type="button" role="switch" aria-label="Phong cách của Season" aria-checked={persona === "formal"} disabled={view.thinking || sending} onClick={() => void actions.changeCoachPersona(persona === "informal" ? "formal" : "informal")}><span className={persona === "informal" ? "active" : ""}>Informal</span><span className={persona === "formal" ? "active" : ""}>Formal</span></button><button ref={clearChatButtonRef} className="btn-sm btn-danger" type="button" disabled={view.thinking || sending} title="Xoá đoạn chat này và bắt đầu hội thoại mới" onClick={() => setClearChatOpen(true)}>Xoá chat</button></div></div>
    {!view.aiAvailable ? <Notice tone="warn">Season tạm thời chưa chấm được. Bạn vẫn có thể gửi câu luyện tập.</Notice> : null}
    {chatClosed ? <Notice tone="warn">{view.chatAvailability?.reason === "monthly_exam_day" ? "Hôm nay là ngày thi tháng; Season tạm đóng." : "Season mở từ thứ Hai đến thứ Sáu."}</Notice> : null}
    <div className="coach-limit-row"><span className="row coach-counters"><span className={`badge ${capped ? "danger" : view.daily.used >= view.daily.limit * .8 ? "warn" : "primary"}`}>Hôm nay {view.daily.used}/{view.daily.limit}</span><span className={`badge ${hasMonthlyTarget && period.turns >= period.target ? "ok" : ""}`}>Tháng {period.turns}{hasMonthlyTarget ? `/${period.target}` : ""}{hasMonthlyTarget && period.turns >= period.target ? " ✓" : ""}</span><span className="coach-feedback-toggles" aria-label="Tùy chỉnh phản hồi"><span className="coach-feedback-toggles-title">Tự mở:</span><button className="coach-feedback-toggle" type="button" role="switch" aria-label="Tự mở nhận xét" aria-checked={feedbackExpanded} onClick={() => setFeedbackExpanded((expanded) => !expanded)}><span>Nhận xét</span><span className="coach-feedback-switch-track" aria-hidden="true"><span /></span></button><button className="coach-feedback-toggle" type="button" role="switch" aria-label="Tự mở giải thích" aria-checked={explanationExpanded} onClick={() => setExplanationExpanded((expanded) => !expanded)}><span>Giải thích</span><span className="coach-feedback-switch-track" aria-hidden="true"><span /></span></button></span></span><details className="xs coach-limit-details"><summary><Info className="coach-limit-icon" size={17} aria-hidden="true" /><span className="coach-limit-label">Giới hạn chat và tiến độ tháng</span></summary><div className="muted coach-limit-copy coach-limit-copy--full coach-limit-copy--plain">Lượt luyện tập phù hợp vẫn được tính nếu hệ thống xác nhận AI gặp sự cố. Tối đa <b>{view.daily.limit} lượt/ngày</b>; bộ đếm về 0 lúc 0 giờ. Xoá chat không trả lại lượt. Tin nhắn lỗi mạng không tính lượt.{hasMonthlyTarget ? <> Điều kiện Season của lộ trình tháng: ít nhất <b>{period.target} lượt</b>.</> : " Tháng này không đặt chỉ tiêu lượt Season."}</div></details></div>
    {capped ? <Notice tone="warn"><b>Đã dùng hết {view.daily.limit} lượt chat hôm nay.</b> Ô nhập mở lại ngày mai; bạn có thể ôn lại bài trong lộ trình hiện tại.</Notice> : null}
    <section ref={chatRef} className="chat" aria-label="Cuộc trò chuyện với Season" aria-busy={view.thinking || sending || undefined} style={chatStyle}><article className="msg ai coach-opening-message"><div role="heading" aria-level={2} className="eyebrow">Season</div><p>Chào bạn! Hôm nay mình luyện một tình huống thật nhé.</p></article>{view.messages.map((item) => <article className={`msg ${item.speaker === "coach" ? "ai" : "user"}`} key={item.id}><div className="coach-message-heading"><div className="eyebrow">{item.speaker === "coach" ? "Season" : "Bạn"}</div>{item.speaker === "coach" ? <button className="coach-turn-audio" type="button" aria-label="Nghe câu Season trả lời" title="Nghe câu Season trả lời" onClick={() => actions.speak(item.feedback?.seasonReply ?? coachSpeechText(item), "en-US")}><Volume2 size={17} aria-hidden="true" /><span>Nghe</span></button> : null}</div>{item.feedback ? <CoachFeedback feedback={item.feedback} feedbackExpanded={feedbackExpanded} explanationExpanded={explanationExpanded} onFeedbackExpandedChange={setFeedbackExpanded} onExplanationExpandedChange={setExplanationExpanded} /> : <p>{item.text}</p>}<ResponseAudio label="Bản ghi âm câu trả lời" value={item.audioArtifact} transcript={item.text} showTranscript={false} /></article>)}{sending && pendingMessage ? <article className="msg user coach-message-pending" aria-label="Tin nhắn đang gửi"><div className="eyebrow">Bạn</div><p>{pendingMessage}</p><span className="xs muted">Đang gửi…</span></article> : null}{view.thinking ? <div className="msg ai" role="status">Season đang nghĩ…</div> : null}</section>{coachError ? <div className="coach-error-row"><ErrorText id="coach-error" message={coachError} /></div> : null}
    <form className="chat-compose" aria-busy={view.thinking || sending || undefined} onSubmit={send} style={composeStyle}><textarea ref={composerRef} rows={1} aria-label="Tin nhắn cho Season" aria-describedby={coachError ? "coach-error" : undefined} value={message} disabled={view.thinking || sending || capped || chatClosed} onChange={(event) => { setMessage(event.target.value); resizeCoachComposer(event.currentTarget); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={view.thinking || sending ? "Season đang trả lời…" : view.cefr === "A1" || view.cefr === "A2" ? (phoneComposer ? "Trả lời bằng tiếng Anh…" : "Viết câu trả lời bằng tiếng Anh…") : (phoneComposer ? "Reply in English…" : "Type your reply in English…")} style={composeInputStyle} /><AudioCaptureControl label="Micro Season" value={audioEvidence} showMicrophone={speechRecognitionConstructor() !== null || (typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined")} transcript={message} disabled={view.thinking || sending || capped || chatClosed} uploadAudio={actions.uploadAssessmentAudio} getAudioReadUrl={actions.getAssessmentAudioReadUrl} onTranscript={setMessage} onAudioChange={setAudioEvidence} compactActions /><button className="btn-primary coach-compose-icon coach-send" type="submit" aria-label={view.thinking || sending ? "Đang gửi…" : "Gửi"} title={view.thinking || sending ? "Đang gửi…" : "Gửi"} disabled={view.thinking || sending || capped || chatClosed || (!message.trim() && !audioEvidence?.artifactKey)}><Send size={20} aria-hidden="true" /></button></form>
    {totalVocabularyCount ? <section className="card coach-vocabulary">{compactVocabulary ? <details className="coach-vocabulary-details"><summary className="row between"><h2>Từ bí mật</h2><span className="small muted" aria-live="polite">Đã mở {openedVocabularyCount}/{totalVocabularyCount} ô</span></summary>{vocabulary.length ? <div className="row coach-word-list">{vocabulary.map((item, index) => item.opened ? <button className="word-card coach-word-chip is-opened" type="button" title={item.meaning} key={item.word.toLocaleLowerCase()} aria-label={`Nghe từ ${item.word}${item.meaning ? `: ${item.meaning}` : ""}`} onClick={() => actions.speak(item.word, "en-US")}><b>{item.word}</b></button> : <div className="word-card coach-word-chip is-locked" key={item.word.toLocaleLowerCase()} aria-label={`Từ bí mật ${index + 1} chưa mở`}><LockKeyhole className="status-icon" aria-hidden="true" /><span>{item.meaning || `Từ số ${index + 1}`}</span></div>)}</div> : <p className="small muted">Hoàn thành bài học để mở các ô từ vựng của tháng.</p>}</details> : <><div className="row between"><h2>Từ bí mật</h2><span className="small muted" aria-live="polite">Đã mở {openedVocabularyCount}/{totalVocabularyCount} ô tháng này</span></div>{vocabulary.length ? <div className="row coach-word-list">{vocabulary.map((item, index) => item.opened ? <button className="word-card coach-word-chip is-opened" type="button" title={item.meaning} key={item.word.toLocaleLowerCase()} aria-label={`Nghe từ ${item.word}${item.meaning ? `: ${item.meaning}` : ""}`} onClick={() => actions.speak(item.word, "en-US")}><b>{item.word}</b></button> : <div className="word-card coach-word-chip is-locked" key={item.word.toLocaleLowerCase()} aria-label={`Từ bí mật ${index + 1} chưa mở`}><LockKeyhole className="status-icon" aria-hidden="true" /><span>{item.meaning || `Từ số ${index + 1}`}</span></div>)}</div> : <p className="small muted">Hoàn thành bài học để mở các ô từ vựng của tháng.</p>}</>}</section> : null}
  </div>
    <p className="xs muted">Mỗi lượt Season trả lời và chấm 3 tiêu chí (đúng ý · từ vựng · ngữ pháp), gợi ý tối đa 3 chỗ sửa.{hasMonthlyTarget ? <> Tiến độ điều kiện Season tháng này: <b>{period.turns}/{period.target} lượt</b>.</> : " Tháng này chưa đặt chỉ tiêu lượt Season."}</p>
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

const coachScoreFormat = { format: (value: number) => formatScore(value) };

function CoachFeedback({ feedback, feedbackExpanded, explanationExpanded, onFeedbackExpandedChange, onExplanationExpandedChange }: {
  feedback: NonNullable<CoachView["messages"][number]["feedback"]>;
  feedbackExpanded: boolean;
  explanationExpanded: boolean;
  onFeedbackExpandedChange: (expanded: boolean) => void;
  onExplanationExpandedChange: (expanded: boolean) => void;
}) {
  const scores = [
    { label: "Ý nghĩa", criterion: feedback.rubric.meaning, max: 2, Icon: MessageCircle },
    { label: "Từ vựng", criterion: feedback.rubric.vocabulary, max: 1.5, Icon: BookOpen },
    { label: "Ngữ pháp", criterion: feedback.rubric.grammar, max: 1.5, Icon: SpellCheck2 }
  ].map(item => ({ ...item, points: Math.round(item.criterion.score * item.max * 2 / 5) / 2 }));
  const total = coachScoreFormat.format(scores.reduce((sum, item) => sum + item.points, 0));
  const resultLabels = {
    correct: "Đúng",
    partially_correct: "Đúng một phần",
    missing_information: "Thiếu ý",
    off_topic: "Sai mục tiêu"
  } as const;
  // A clarification request or "I don't know" is not scored: show the note only.
  const feedbackUnavailable = feedback.feedbackStatus === "unavailable" || feedback.notScored === true;
  const retryCurrentQuestion = !feedbackUnavailable && feedback.evaluation.status !== "valid";
  // Current turns carry an answer IDEA (shown even when the question is asked
  // again); old turns hold an English sample answer and render as before.
  const answerIdea = feedback.suggestedAnswer.kind === "idea";
  const suggestedAnswer = feedback.suggestedAnswer.text.trim();
  const suggestedTranslation = feedback.suggestedAnswer.translation.trim();
  const seasonReplyTranslation = feedback.seasonReplyTranslation.trim();
  const hasCorrection = feedback.corrections.length > 0 || Boolean(feedback.correctedText.trim());
  const correctedTextNormalized = normalizeCoachText(feedback.correctedText);
  const correctedTextIsRedundant = feedback.corrections.length > 0 && feedback.corrections.every((item) => {
    const corrected = normalizeCoachText(item.corrected);
    return corrected && correctedTextNormalized.includes(corrected);
  });
  return <section className="coach-feedback coach-feedback-flat" role="region" aria-label="Phản hồi của Season">
    <div className="coach-feedback-section coach-season-reply" aria-label="Phản hồi của Season">
      <p className="coach-season-spoken"><SeasonReplyText reply={feedback.seasonReply} question={feedback.nextQuestion} /></p>
      {answerIdea && suggestedAnswer ? <div className="coach-next-question" aria-label="Gợi ý ý tưởng trả lời"><p><span>Gợi ý ý tưởng:</span> {suggestedAnswer}</p></div> : !answerIdea && !retryCurrentQuestion && suggestedAnswer ? <div className="coach-next-question" aria-label="Câu trả lời gợi ý"><p><span>You can say:</span> <q>{suggestedAnswer}</q></p></div> : null}
    </div>
    <div className="coach-feedback-disclosures">
      <details className="coach-feedback-disclosure" aria-label="Nhận xét câu trả lời của bạn" open={feedbackExpanded} onToggle={(event) => { if (event.currentTarget.open !== feedbackExpanded) onFeedbackExpandedChange(event.currentTarget.open); }}>
        <summary>Nhận xét câu trả lời của bạn</summary>
        <div className="coach-feedback-summary">
          <div className="coach-evaluation">{feedbackUnavailable ? <p className="coach-feedback-note" role="status">{feedback.evaluation.noteVi}</p> : <><p className="coach-feedback-result"><span>Kết quả: {resultLabels[feedback.evaluation.result]}</span> · <span aria-label={`Tổng điểm: ${total} trên 5`}>{total}/5</span></p><p className="coach-feedback-note">{feedback.evaluation.noteVi}</p></>}</div>
          {!feedbackUnavailable ? <div className="coach-feedback-scores" aria-label="Ba điểm đánh giá">{scores.map(({ label, criterion, points, max, Icon }) => <div className="coach-feedback-score" title={`${criterion.evidence} ${criterion.improvement}`} key={label}><Icon className="coach-feedback-score-icon" size={18} aria-hidden="true" /><span><b>{label}</b><strong aria-label={`${label}: ${coachScoreFormat.format(points)} trên ${coachScoreFormat.format(max)} điểm`}>{coachScoreFormat.format(points)}/{coachScoreFormat.format(max)}</strong></span></div>)}</div> : null}
        </div>
      </details>
    </div>
    {hasCorrection ? <div className="coach-feedback-section coach-correction" aria-label="Câu sửa">
      <h4>Câu sửa</h4>{feedback.corrections.map((item, index) => <div className="coach-next-question coach-correction-card" key={`${item.corrected}-${index}`}><p><del>{item.original}</del> → <strong>{item.corrected}</strong></p><p className="coach-correction-reason">{compactCoachCorrectionReason(item.reason)}</p>{hasCoachTranslation(item.translation) ? <p className="coach-feedback-translation">{item.translation}</p> : null}</div>)}
      {feedback.correctedText && !correctedTextIsRedundant ? <p><b>Câu hoàn chỉnh:</b> {feedback.correctedText}</p> : null}
    </div> : null}
    <div className="coach-feedback-disclosures">
      <details className="coach-feedback-disclosure" open={explanationExpanded} onToggle={(event) => { if (event.currentTarget.open !== explanationExpanded) onExplanationExpandedChange(event.currentTarget.open); }}>
        <summary>Xem giải thích và gợi ý</summary>
        <div className="coach-feedback-details">
          {hasCoachTranslation(seasonReplyTranslation) ? <div className="coach-feedback-translation-block"><h4>Nghĩa câu Season trả lời</h4><p className="coach-feedback-translation">{seasonReplyTranslation}</p></div> : null}
          {answerIdea && hasCoachTranslation(suggestedTranslation) ? <div className="coach-feedback-translation-block" aria-label="Nghĩa gợi ý ý tưởng"><h4>Nghĩa gợi ý ý tưởng</h4><p className="coach-feedback-translation">{suggestedTranslation}</p></div> : !answerIdea && !retryCurrentQuestion && hasCoachTranslation(suggestedTranslation) ? <div className="coach-feedback-translation-block" aria-label="Bản dịch gợi ý trả lời"><h4>Bản dịch gợi ý trả lời</h4><p className="coach-feedback-translation">{suggestedTranslation}</p></div> : null}
          {feedbackUnavailable ? <p className="coach-feedback-note" role="status">{feedback.notScored ? "Lượt này không chấm điểm." : "Chưa có điểm và gợi ý chi tiết cho lượt này."}</p> : <div className="coach-feedback-criteria" aria-label="Giải thích điểm">{scores.map(({ label, criterion, points, max }) => <article className="coach-feedback-criterion-card" key={label}><div><b>{label}</b><strong>{coachScoreFormat.format(points)}/{coachScoreFormat.format(max)}</strong></div><p>{criterion.evidence}</p>{hasActionableImprovement(criterion.improvement) ? <p className="coach-feedback-improvement">Gợi ý: {criterion.improvement}</p> : null}</article>)}</div>}
        </div>
      </details>
    </div>
  </section>;
}

function SeasonReplyText({ reply, question }: { reply: string; question: string }) {
  const anchor = question.trim();
  const exactIndex = anchor ? reply.lastIndexOf(anchor) : -1;
  if (exactIndex >= 0) {
    const before = reply.slice(0, exactIndex).trimEnd();
    return <>{before ? `${before} ` : null}<strong>{reply.slice(exactIndex, exactIndex + anchor.length)}</strong>{reply.slice(exactIndex + anchor.length)}</>;
  }
  const questionMark = reply.lastIndexOf("?");
  const requestMatch = questionMark < 0
    ? [...reply.matchAll(/(?:please\s+)?(?:could|can|would|will|tell me|let me know|share|confirm)\b[^.!?]*[.!?]/giu)].at(-1)
    : undefined;
  const end = questionMark >= 0 ? questionMark + 1 : requestMatch?.index === undefined ? -1 : requestMatch.index + requestMatch[0].length;
  if (end < 0) return <>{reply}</>;
  const sentenceStart = Math.max(reply.lastIndexOf(".", end - 2), reply.lastIndexOf("!", end - 2), reply.lastIndexOf("?", end - 2)) + 1;
  const start = requestMatch?.index ?? sentenceStart;
  const before = reply.slice(0, start).trimEnd();
  return <>{before ? `${before} ` : null}<strong>{reply.slice(start, end).trim()}</strong>{reply.slice(end)}</>;
}

function normalizeCoachText(value: string): string {
  return value.normalize("NFKC").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function compactCoachCorrectionReason(value: string): string {
  const firstSentence = value.trim().split(/(?<=[.!?])\s+/u)[0] ?? value.trim();
  const words = firstSentence.split(/\s+/u);
  return words.length > 14 ? `${words.slice(0, 13).join(" ")}…` : firstSentence;
}

function hasActionableImprovement(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && !/^(?:không cần thay đổi\.?|no change needed\.?)$/iu.test(normalized);
}

function hasCoachTranslation(value: string): boolean {
  return Boolean(value.trim()) && !/(?:sẽ được cập nhật|sẽ hiển thị|được hiển thị trong phần giải thích)/iu.test(value);
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

function ResponseAudio({ label, value, transcript, resultText, showTranscript = true }: { label: string; value: unknown; transcript: string; resultText?: string | null; showTranscript?: boolean }) {
  const evidence = normalizeAudioEvidence(value);
  if (!evidence) return null;
  const displayedEvidence = showTranscript ? { ...evidence, ...(evidence.transcript ? {} : { transcript }) } : { ...evidence, transcript: undefined };
  return <AudioEvidencePanel label={label} evidence={displayedEvidence} {...(resultText ? { resultText } : {})} />;
}

const CLEAR_CHAT_COUNTDOWN_SECONDS = 5;

function ClearChatDialog({ titleId, descriptionId, onCancel, onConfirm }: { titleId: string; descriptionId: string; onCancel: () => void; onConfirm: () => void }) {
  // B8-009: destructive confirm waits 5 seconds, like other delete confirms.
  const [remaining, setRemaining] = useState(CLEAR_CHAT_COUNTDOWN_SECONDS);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = window.setTimeout(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
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

  return <div className="modal-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onKeyDown={handleKeyDown}><h2 id={titleId}>Xoá đoạn chat này?</h2><p id={descriptionId}>Toàn bộ tin nhắn trong đoạn chat hiện tại sẽ biến mất và không khôi phục lại được. Các từ đã mở vẫn được giữ; số lượt luyện trong lộ trình hiện tại vẫn tính.</p><div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button ref={cancelButtonRef} style={{ minWidth: 44, minHeight: 44 }} type="button" onClick={onCancel}>Huỷ</button><button className="btn-danger" style={{ minWidth: 44, minHeight: 44 }} type="button" disabled={remaining > 0} onClick={() => { if (remaining <= 0) onConfirm(); }}>{remaining > 0 ? `Xoá chat (${remaining})` : "Xoá chat"}</button></div></section></div>;
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
  return <div className="app-learner-page"><PageTitle eyebrow={`Season nói ở mức ${view.targetLevel} · lượt ${view.progress.completedTurns}/${view.progress.requiredTurns}`} title={`Thử thách lên mức ${view.targetLevel}`} aside={<span className={`badge ${view.progress.average >= 3.5 && view.progress.offTopic <= 1 ? "ok" : "warn"}`}>TB {formatScoreOutOf(view.progress.average, 5)} · lạc đề {view.progress.offTopic}</span>} /><Notice>Đạt khi điểm trung bình (ý · từ · ngữ pháp) ≥ <b>3.5/5</b> sau {view.progress.requiredTurns} lượt, tối đa <b>1</b> lượt lạc đề. Trả lời đủ ý bằng tiếng Anh, đúng câu hỏi. Các lượt tính vào giới hạn {view.daily.limit} lượt/ngày (hôm nay {view.daily.used}/{view.daily.limit}), nhưng không tính điểm thưởng hay mục tiêu tuần.</Notice>{!view.aiAvailable ? <Notice tone="warn">AI chưa kết nối nên Season chưa trả lời. Báo người vận hành nhập API key trong Cài đặt.</Notice> : null}{capped && !complete ? <Notice tone="warn"><b>Đã dùng hết {view.daily.limit} lượt chat hôm nay.</b> Thử thách được lưu, mai làm tiếp.</Notice> : null}<section className="chat" aria-label="Cuộc trò chuyện thử thách" aria-busy={sending || undefined} style={challengeChatStyle}>{view.messages.map((item) => <article className={`msg ${item.speaker === "coach" ? "ai" : "user"}`} key={item.id}><b>{item.speaker === "coach" ? "Season" : "Bạn"}</b><p>{item.text}</p>{item.feedback ? <p className="small muted">{item.feedback.relevanceNote}</p> : null}</article>)}</section>{complete ? <Notice tone={passed && !rejectedRequest ? "ok" : "warn"}>{pendingRequest ? "Bạn đã vượt qua thử thách. Yêu cầu lên mức đã được gửi để duyệt." : approvedRequest ? "Yêu cầu lên mức đã được duyệt." : rejectedRequest ? "Yêu cầu lên mức chưa được duyệt; Season đã tạo kế hoạch luyện lại cho bạn." : retakeAvailable ? "Chưa đạt lần này. Season đã tạo kế hoạch luyện lại cho bạn." : passed ? "Bạn đã vượt qua thử thách." : "Kết quả thử thách đã được lưu."}</Notice> : <form className="chat-compose" aria-busy={sending || undefined} style={challengeComposeStyle} onSubmit={send}><textarea aria-label="Câu trả lời thử thách" aria-describedby={challengeError ? "challenge-error" : undefined} value={message} disabled={!view.aiAvailable || capped || sending} onChange={(event) => setMessage(event.target.value)} placeholder="Answer in English…" style={{ flex: "1 1 16rem", minWidth: 0, minHeight: 48 }} /><button className="btn-primary" style={{ minWidth: 44, minHeight: 44 }} type="submit" disabled={!view.aiAvailable || capped || sending || !message.trim()}>Gửi lượt này</button></form>}<ErrorText id={challengeError ? "challenge-error" : undefined} message={challengeError} /><p className="xs muted"><AppLink href="/home" navigate={actions.navigate}>← Trang chủ</AppLink> · Thử thách được lưu: thoát ra rồi vào làm tiếp.</p></div>;
}

export function LearnerPractice({ view, actions }: { view: PracticeView; actions: LearnerCallbacks }) {
  const [text, setText] = useState(view.submission?.text ?? "");
  const [appealEvidence, setAppealEvidence] = useState<RequestEvidenceDraft>({});
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
    if (reason.length < 5 || appealEvidence.blocked || !view.submission || !actions.appealWeeklyPractice || !beginAction("appeal")) return;
    let focusOnFailure = false;
    try {
      await actions.appealWeeklyPractice(view.submission.id, reason, ...requestEvidenceArgs(appealEvidence));
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
    return <div className="app-learner-page" style={pageStyle}><PageTitle eyebrow={`Tuần ${view.weekNumber} · ${view.topic}`} title="Bài thực hành cuối tuần" /><section className="card" style={cardStyle}><span className={`badge ${graded ? "ok" : "warn"}`}>{graded ? "Đã chấm" : "Chờ chấm"}</span><h2>Bài đã nộp</h2><p>{view.submission.text}</p><ResponseAudio label="Bản ghi âm bài thực hành" value={view.submission.audioArtifact} transcript={view.submission.text} resultText={view.submission.feedback} />{view.submission.score ? <><div className="stat"><strong>{formatScoreOutOf(view.submission.score.total, 100)}</strong><span>Tổng điểm</span></div><div className="grid cols-3"><div className="stat"><strong>{formatScoreOutOf(view.submission.score.rubric?.meaning, 5)}</strong><span>Ý nghĩa</span></div><div className="stat"><strong>{formatScoreOutOf(view.submission.score.rubric?.vocabulary, 5)}</strong><span>Từ vựng</span></div><div className="stat"><strong>{formatScoreOutOf(view.submission.score.rubric?.grammar, 5)}</strong><span>Ngữ pháp</span></div></div></> : null}{view.submission.audioArtifact ? null : <p>{view.submission.feedback}</p>}{view.submission.suggestions.length ? <div className="correction"><b>Gợi ý sửa</b>{view.submission.suggestions.map((item, index) => <div key={`${item.original}-${index}`}><p>{item.original} → {item.corrected}</p><p className="small muted">{item.explanation}</p></div>)}</div> : null}{view.submission.correctedText ? <div className="correction"><b>Bản gợi ý</b><p>{view.submission.correctedText}</p></div> : null}</section>{view.appeal ? <Notice tone={view.appeal.status === "pending" ? "info" : view.appeal.status === "accepted" ? "ok" : "warn"}>Kháng nghị: {view.appeal.status}{view.appeal.resolution ? ` · ${view.appeal.resolution}` : ""}</Notice> : manuallyGraded ? <Notice tone="info">Bài này đã được chấm tay nên không thể gửi kháng nghị.</Notice> : graded ? <form className="card" aria-busy={busyAction === "appeal" || undefined} onSubmit={(event) => void submitAppeal(event)} style={{ ...cardStyle, marginBottom: 16 }}><h3>Không đồng ý với kết quả?</h3><RequestEvidenceFields value={appealEvidence} onChange={setAppealEvidence} label="Tiêu chí hoặc nội dung cần xem lại" placeholder="Ví dụ: Điểm từ vựng" disabled={Boolean(busyAction)} /><label>Lý do kháng nghị<textarea ref={appealRef} aria-label="Lý do kháng nghị" value={appealReason} disabled={Boolean(busyAction)} onChange={(event) => setAppealReason(event.target.value)} /></label><p className="small muted">Nhập ít nhất 5 ký tự.</p><ErrorText message={actionError} /><button type="submit" className="btn-primary" aria-busy={busyAction === "appeal" || undefined} disabled={appealReason.trim().length < 5 || appealEvidence.blocked || Boolean(busyAction)} style={{ minHeight: 44, justifySelf: "start" }}>{busyAction === "appeal" ? "Đang gửi…" : "Gửi kháng nghị"}</button></form> : null}<PracticeHistory items={view.history} /></div>;
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
        <span className="badge">{item.score ? formatScoreOutOf(item.score.total, 100) : "Chờ chấm"}</span>
      </article>)}
    </div>
  </section>;
}


