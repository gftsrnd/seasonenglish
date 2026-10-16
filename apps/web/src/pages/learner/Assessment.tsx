import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AssessmentEvidenceType,
  AssessmentResponseView,
  AssessmentSectionCode,
  AssessmentTaskGroupView,
  AssessmentView,
  SaveAssessmentResponseInput
} from "@e4s/contracts";
import { useExperience } from "../../features/experience/Experience.js";

interface AssessmentProps {
  view: AssessmentView;
  onStart: () => void | Promise<void>;
  onSaveResponse: (
    section: AssessmentSectionCode,
    taskKey: string,
    input: SaveAssessmentResponseInput
  ) => void | Promise<void>;
  onCompleteSection: (section: AssessmentSectionCode) => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
  onRecordAudioPlay: (
    section: AssessmentSectionCode,
    groupKey: string
  ) => Promise<{ playCount: number; remaining: number }>;
  onUploadAudio?: (file: Blob, filename: string) => Promise<string>;
  onAppeal?: ((reason: string) => Promise<void>) | undefined;
}

const sectionOrder: AssessmentSectionCode[] = ["listening", "reading", "writing", "speaking"];

export function Assessment({ view, onStart, onSaveResponse, onCompleteSection, onSubmit, onRecordAudioPlay, onUploadAudio, onAppeal }: AssessmentProps) {
  const { definition, attempt, screenState } = view;
  const isFinalAssessment = definition.kind === "final";
  const [equipment, setEquipment] = useState<{ sound?: string; mic?: string }>({});
  const [appealReason, setAppealReason] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
  const { speak } = useExperience();
  const testSound = () => {
    if (!("speechSynthesis" in window)) {
      setEquipment((current) => ({ ...current, sound: "Trình duyệt không hỗ trợ phát câu mẫu." }));
      return;
    }
    speak("Đây là câu kiểm tra âm thanh. Nếu bạn nghe rõ, tai nghe đã sẵn sàng.", "vi-VN");
    setEquipment((current) => ({ ...current, sound: "Đã phát câu mẫu. Nếu nghe rõ, tai nghe đã sẵn sàng ✓" }));
  };
  const testMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setEquipment((current) => ({ ...current, mic: "Trình duyệt không hỗ trợ kiểm tra micro." }));
      return;
    }
    setEquipment((current) => ({ ...current, mic: "Đang xin quyền dùng micro…" }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setEquipment((current) => ({ ...current, mic: "Micro đã được cấp quyền và sẵn sàng ✓" }));
    } catch {
      setEquipment((current) => ({ ...current, mic: "Chưa truy cập được micro. Hãy cấp quyền rồi thử lại." }));
    }
  };
  if (screenState === "preparation" || !attempt) {
    return <main className="learner-page assessment-page">
      <a className="back-link" href="/home">← Quay lại trang chủ</a>
      <header className="page-heading assessment-title">
        <p className="eyebrow">E4S · {isFinalAssessment ? "Bài test cuối kỳ" : "Bài test đầu vào"}</p>
        <h1>{definition.title}</h1>
        <p>{definition.totalMinutes} phút làm bài · {definition.totalScore} điểm · 4 kỹ năng</p>
      </header>

      <section className="assessment-intro" aria-labelledby="assessment-structure-heading">
        <div className="assessment-season-mark" aria-hidden="true"><span>✦</span></div>
        <div>
          <h2 id="assessment-structure-heading">Cấu trúc bài test</h2>
          <p>{isFinalAssessment
            ? "Dùng cùng rubric với bài đầu vào để nhìn thấy tiến bộ."
            : "Bài test giúp E4S xếp đúng mức học ban đầu. Bạn không cần ôn trước."}</p>
        </div>
        <div className="assessment-table-wrap">
          <table aria-label="Cấu trúc bài test">
            <thead><tr><th>Phần</th><th>Thời gian</th><th>Điểm</th></tr></thead>
            <tbody>{definition.sections.map((section) => <tr key={section.code}>
              <td><strong>{section.title}</strong></td>
              <td>{section.durationMinutes} phút</td>
              <td>{section.maxScore}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="assessment-ready" aria-labelledby="assessment-ready-heading">
        <h2 id="assessment-ready-heading">Chuẩn bị trước khi bắt đầu</h2>
        <ul>
          <li>Tai nghe và micro hoạt động ổn định.</li>
          <li>Mỗi phần có đồng hồ riêng; hết giờ hệ thống chuyển sang phần tiếp theo.</li>
          <li>Câu trả lời được lưu để bạn không mất bài khi tải lại trang, nhưng đồng hồ vẫn tiếp tục.</li>
        </ul>
        <div className="assessment-equipment" aria-label="Kiểm tra thiết bị">
          <div><button onClick={testSound}>🔊 Kiểm tra tai nghe</button><span role="status">{equipment.sound ?? "Phát một câu mẫu trước khi làm phần Nghe."}</span></div>
          <div><button onClick={() => void testMicrophone()}>🎙 Kiểm tra micro</button><span role="status">{equipment.mic ?? "Kiểm tra quyền micro trước phần Nói."}</span></div>
        </div>
        <button className="button--primary assessment-start" onClick={() => void onStart()}>Bắt đầu phần Nghe</button>
      </section>
    </main>;
  }

  if (screenState === "pending" || screenState === "submitting") {
    return <main className="learner-page assessment-page">
      <section className="assessment-pending" role="status">
        <div className="assessment-season-mark" aria-hidden="true"><span>✓</span></div>
        <h1>{screenState === "submitting" ? "Đang nộp bài" : "Bài đã được ghi nhận"}</h1>
        <p>Phần Nghe và Đọc được chấm tự động. Phần Viết và Nói chờ chấm theo rubric và bằng chứng đã nộp.</p>
        {attempt.status === "approved" || attempt.status === "needs_retry" ? <div className="assessment-result-summary">
          <strong>{attempt.status === "approved" ? `Kết quả đã duyệt${attempt.suggestedLevel ? ` · ${attempt.suggestedLevel}` : ""}` : "Cần thực hiện lại theo phản hồi"}</strong>
          {attempt.totalScore !== null && attempt.totalScore !== undefined ? <span>Tổng điểm: {attempt.totalScore}/100</span> : null}
        </div> : null}
        {view.appeal ? <div className="assessment-appeal-status"><strong>Kháng nghị: {view.appeal.status === "pending" ? "đang chờ xử lý" : view.appeal.status === "accepted" ? "đã chấp nhận" : "giữ nguyên kết quả"}</strong><p>{view.appeal.reason}</p>{view.appeal.resolution ? <p>Phản hồi: {view.appeal.resolution}</p> : null}</div>
          : attempt.status === "approved" || attempt.status === "needs_retry" ? <form className="assessment-appeal-form" onSubmit={(event) => {
            event.preventDefault(); setAppealBusy(true);
            if (!onAppeal) return; void onAppeal(appealReason).finally(() => setAppealBusy(false));
          }}><label>Thấy kết quả chưa đúng?<textarea required minLength={10} maxLength={2000} value={appealReason} onChange={(event) => setAppealReason(event.target.value)} placeholder="Nêu phần cần kiểm tra lại và lý do…" /></label><button type="submit" disabled={!onAppeal || appealBusy || appealReason.trim().length < 10}>{appealBusy ? "Đang gửi…" : "Gửi kháng nghị"}</button></form> : null}
        {definition.kind === "level-up" ? <a className="button button--primary" href="/challenge">Tiếp tục thử thách với Season</a> : <a className="button button--primary" href="/home">Về trang chủ</a>}
      </section>
    </main>;
  }

  const currentSection = definition.sections.find((section) => section.code === attempt.currentSection);
  if (!currentSection) return null;
  const sectionNumber = sectionOrder.indexOf(currentSection.code) + 1;

  return <main className="learner-page assessment-page">
    <header className="assessment-running-header">
      <div>
        <span className="status-chip">Phần {sectionNumber}/4 · {currentSection.title}</span>
        <h1>{definition.title}</h1>
      </div>
      <AssessmentTimer endsAt={attempt.sectionEndsAt} />
      <ol aria-label="Tiến độ bài test" className="assessment-steps">
        {definition.sections.map((section, index) => <li key={section.code} data-state={attempt.sectionStatuses[section.code]}>
          <span>{index + 1}</span><small>{section.title}</small>
        </li>)}
      </ol>
    </header>

    <section className="assessment-section" aria-labelledby="assessment-section-heading">
      <div className="section-heading">
        <div><p className="eyebrow">Phần {sectionNumber}</p><h2 id="assessment-section-heading">{currentSection.title}</h2></div>
        <strong>{currentSection.maxScore} điểm</strong>
      </div>
      {currentSection.instructions.length > 0 && <ul className="assessment-instructions">
        {currentSection.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
      </ul>}
      <div className="assessment-groups">
        {currentSection.groups.map((group) => <AssessmentGroup
          key={group.key}
          group={group}
          section={currentSection.code}
          responses={attempt.responses}
          initialPlayCount={attempt.audioPlayCounts[`${currentSection.code}:${group.key}`] ?? 0}
          onSaveResponse={onSaveResponse}
          onRecordAudioPlay={onRecordAudioPlay}
          onUploadAudio={onUploadAudio}
        />)}
      </div>
    </section>

    <footer className="assessment-actions">
      <p>Bạn sẽ không quay lại phần này sau khi nộp.</p>
      {currentSection.code === "speaking"
        ? <button className="button--primary" onClick={() => void onSubmit()}>Nộp toàn bộ bài test</button>
        : <button className="button--primary" onClick={() => void onCompleteSection(currentSection.code)}>Nộp phần {currentSection.title}</button>}
    </footer>
  </main>;
}

function AssessmentGroup({ group, section, responses, initialPlayCount, onSaveResponse, onRecordAudioPlay, onUploadAudio }: {
  group: AssessmentTaskGroupView;
  section: AssessmentSectionCode;
  responses: AssessmentResponseView[];
  initialPlayCount: number;
  onSaveResponse: AssessmentProps["onSaveResponse"];
  onRecordAudioPlay: AssessmentProps["onRecordAudioPlay"];
  onUploadAudio: AssessmentProps["onUploadAudio"];
}) {
  const { speak } = useExperience();
  const responseMap = useMemo(() => new Map(responses.map((response) => [response.taskKey, response])), [responses]);
  const [played, setPlayed] = useState(initialPlayCount);
  const [recordingPlay, setRecordingPlay] = useState(false);
  return <article className="assessment-group">
    <div className="assessment-group-heading">
      <div><h3>{group.title}</h3><p>{group.instruction}</p></div>
      {group.maxPlays && <button disabled={recordingPlay || played >= group.maxPlays} onClick={async () => {
        setRecordingPlay(true);
        try {
          const recorded = await onRecordAudioPlay(section, group.key);
          if (group.stimulus?.lines?.length && "speechSynthesis" in window) {
            const text = group.stimulus.lines.map((line) => `${line.speaker}: ${line.text}`).join(". ");
            speak(text);
          }
          setPlayed(recorded.playCount);
        } finally {
          setRecordingPlay(false);
        }
      }}>🔊 Nghe {played ? `(còn ${Math.max(0, group.maxPlays - played)} lần)` : "đoạn này"}</button>}
    </div>
    {group.stimulus?.type !== "audio_script" && group.stimulus?.text && <div className="assessment-stimulus">{group.stimulus.text}</div>}
    {group.stimulus?.type === "table" && <div className="assessment-table-wrap"><table>
      <thead><tr>{group.stimulus.headers?.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{group.stimulus.rows?.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
    </table></div>}
    <div className="assessment-tasks">{group.tasks.map((task, index) => {
      const saved = responseMap.get(task.key);
      const label = `${index + 1}. ${task.prompt}`;
      if (task.responseType === "single_choice") return <fieldset key={task.key} className="assessment-task">
        <legend>{label}</legend>
        {task.options?.map((option) => <label key={option.value}>
          <input type="radio" name={task.key} value={option.value} defaultChecked={saved?.value === option.value}
            onChange={() => void onSaveResponse(section, task.key, { value: option.value, evidenceType: "choice" })} />
          <span><strong>{option.value}.</strong> {option.label}</span>
        </label>)}
      </fieldset>;

      const evidenceType: AssessmentEvidenceType = task.responseType === "speaking_evidence" ? "typed_proxy" : "text";
      return <div key={task.key} className="assessment-task assessment-task--text">
        <label htmlFor={`assessment-${task.key}`}><strong>{label}</strong></label>
        {task.hint && <span>{task.hint}</span>}
        {task.responseType === "speaking_evidence" && <SpeakingEvidenceControls taskKey={task.key}
          {...(onUploadAudio ? { onUploadAudio } : {})}
          onEvidence={(input) => onSaveResponse(section, task.key, input)} />}
        <textarea id={`assessment-${task.key}`} defaultValue={saved?.value} rows={task.responseType === "speaking_evidence" ? 5 : 8}
          aria-describedby={task.responseType === "speaking_evidence" ? `assessment-${task.key}-evidence-note` : undefined}
          placeholder={task.responseType === "speaking_evidence" ? "Lời chép từ file ghi âm hoặc nội dung bạn đã nói…" : "Nhập câu trả lời…"}
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();
            if (value) void onSaveResponse(section, task.key, { value, evidenceType });
          }} />
        {task.responseType === "speaking_evidence" && <small id={`assessment-${task.key}-evidence-note`}>Lời chép giúp chấm nội dung; không được dùng để suy ra phát âm hoặc độ trôi chảy.</small>}
        {(task.minWords || task.maxWords) && <small>Yêu cầu {task.minWords}–{task.maxWords} từ</small>}
      </div>;
    })}</div>
  </article>;
}

function SpeakingEvidenceControls({ taskKey, onEvidence, onUploadAudio }: {
  taskKey: string;
  onEvidence: (input: SaveAssessmentResponseInput) => void | Promise<void>;
  onUploadAudio?: (file: Blob, filename: string) => Promise<string>;
}) {
  const [recording, setRecording] = useState(false);
  const [fileName, setFileName] = useState("Chưa có file ghi âm");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const canRecord = typeof navigator.mediaDevices !== "undefined" && typeof MediaRecorder !== "undefined";
  const { holdMusic } = useExperience();

  const submitAudio = async (file: Blob, name: string, value: string) => {
    if (!onUploadAudio) {
      setFileName("Chưa kết nối được nơi lưu file. Hãy thử lại sau.");
      return;
    }
    setFileName(`Đang lưu ${name}…`);
    try {
      const artifactKey = await onUploadAudio(file, name);
      await onEvidence({ value, evidenceType: "audio", artifactKey });
      setFileName(`Đã lưu ${name}`);
    } catch {
      setFileName(`Chưa lưu được ${name}. Hãy thử lại.`);
    }
  };

  const toggleRecording = async () => {
    if (recording && recorder.current) {
      recorder.current.stop();
      holdMusic(false);
      setRecording(false);
      return;
    }
    if (!canRecord) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const next = new MediaRecorder(stream);
    chunks.current = [];
    next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
    next.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      holdMusic(false);
      const name = `${taskKey}-${Date.now()}.webm`;
      void submitAudio(new Blob(chunks.current, { type: next.mimeType || "audio/webm" }), name, "Bản ghi âm đã nộp");
    };
    recorder.current = next;
    holdMusic(true);
    next.start();
    setRecording(true);
  };

  return <div className="speaking-evidence-controls">
    <button type="button" disabled={!canRecord} onClick={() => void toggleRecording()}>{recording ? "■ Dừng ghi" : "● Ghi âm"}</button>
    <label className="button" htmlFor={`audio-${taskKey}`}>Tải file ghi âm</label>
    <input id={`audio-${taskKey}`} className="sr-only" type="file" accept="audio/*" aria-label="Tải file ghi âm" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      void submitAudio(file, file.name, "File ghi âm đã nộp");
    }} />
    <span>{fileName}</span>
  </div>;
}

function AssessmentTimer({ endsAt }: { endsAt: string | null }) {
  const calculate = () => endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)) : 0;
  const [remaining, setRemaining] = useState(calculate);
  useEffect(() => {
    setRemaining(calculate());
    const timer = window.setInterval(() => setRemaining(calculate()), 1_000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  return <div className="assessment-timer" role="timer" aria-label="Thời gian còn lại"><span aria-hidden="true">◷</span>{minutes}:{seconds}</div>;
}
