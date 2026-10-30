import { useEffect, useRef, useState } from "react";
import { Mic, Play, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import type { LearnerAudioEvidence } from "./contracts.js";
import { AudioEvidencePanel } from "../shared/media/AudioEvidencePanel.js";
import { normalizeAudioEvidence, type AudioEvidence } from "../shared/media/audio-evidence.js";
import { Notice } from "./ui.js";

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
  const speechWindow = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function recognitionDraft(base: string, event: SpeechRecognitionResultEvent): string {
  const segments = Array.from(event.results).map((result) => result[0]?.transcript.trim() ?? "").filter(Boolean);
  const transcript = segments.reduce((merged, segment) => mergeRecognitionSegment(merged, segment), "");
  if (!transcript) return base;
  const draft = base.trim();
  return `${draft}${draft ? " " : ""}${transcript}`;
}

function mergeRecognitionSegment(current: string, next: string): string {
  if (!current) return next;
  const currentWords = current.split(/\s+/u);
  const nextWords = next.split(/\s+/u);
  const comparable = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  const maximumOverlap = Math.min(currentWords.length, nextWords.length);
  let overlap = 0;
  for (let size = maximumOverlap; size > 0; size -= 1) {
    const suffix = currentWords.slice(-size).map(comparable);
    const prefix = nextWords.slice(0, size).map(comparable);
    if (suffix.every((word, index) => word === prefix[index])) {
      overlap = size;
      break;
    }
  }
  return [...currentWords, ...nextWords.slice(overlap)].join(" ");
}

function localAudioEvidence(file: Blob, url: string | undefined): AudioEvidence {
  return {
    ...(url ? { signedUrl: url } : {}),
    createdAt: new Date().toISOString(),
    mimeType: file.type || "audio/webm",
    sizeBytes: file.size
  };
}

export function AudioCaptureControl({
  value,
  transcript,
  label = "Bằng chứng âm thanh",
  showMicrophone = true,
  disabled = false,
  uploadAudio,
  getAudioReadUrl,
  onTranscript,
  onAudioChange,
  onRecordingChange,
  compactActions = false
}: {
  value?: LearnerAudioEvidence | null | undefined;
  transcript: string;
  label?: string;
  showMicrophone?: boolean;
  disabled?: boolean;
  uploadAudio?: (file: Blob, filename: string) => Promise<string | LearnerAudioEvidence>;
  getAudioReadUrl?: ((artifactKey: string) => Promise<{ url: string; expiresAt: string }>) | undefined;
  onTranscript: (value: string) => void;
  onAudioChange: (value: AudioEvidence | undefined) => void;
  onRecordingChange?: (recording: boolean) => void;
  compactActions?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audio, setAudio] = useState<AudioEvidence | null>(() => normalizeAudioEvidence(value));
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recognition = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef(transcript);
  const uploadAudioRef = useRef(uploadAudio);
  const getAudioReadUrlRef = useRef(getAudioReadUrl);
  const audioUrlRef = useRef<string | undefined>(undefined);
  const previewRef = useRef<HTMLAudioElement>(null);
  transcriptRef.current = transcript;
  uploadAudioRef.current = uploadAudio;
  getAudioReadUrlRef.current = getAudioReadUrl;
  const canRecord = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
  const speechSupported = speechRecognitionConstructor() !== null;

  useEffect(() => {
    const next = normalizeAudioEvidence(value);
    setAudio(next);
    audioUrlRef.current = next?.signedUrl;
  }, [value]);

  useEffect(() => {
    audioUrlRef.current = audio?.signedUrl;
  }, [audio?.signedUrl]);

  useEffect(() => () => {
    try { recognition.current?.stop(); } catch { /* Browser may already have closed recognition. */ }
    if (recorder.current && recorder.current.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (audioUrlRef.current?.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  const setRecordingState = (next: boolean) => {
    setRecording(next);
    onRecordingChange?.(next);
  };

  const startRecognition = () => {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) return;
    try {
      const next = new Constructor();
      recognition.current = next;
      const base = transcriptRef.current.trim();
      next.lang = "en-US";
      next.interimResults = false;
      next.maxAlternatives = 1;
      next.onresult = (event) => {
        const nextText = recognitionDraft(base, event);
        transcriptRef.current = nextText;
        onTranscript(nextText);
      };
      next.onerror = () => setError("Không chép được lời nói. Bản ghi âm và nội dung hiện có vẫn được giữ.");
      next.onend = () => { if (recognition.current === next) recognition.current = null; };
      next.start();
    } catch {
      setError("Không mở được phần nhận giọng nói. Bản ghi âm vẫn có thể được lưu.");
    }
  };

  const stopRecognition = () => {
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      try { current.stop(); } catch { /* Recognition may already be closed. */ }
    }
  };

  const saveAudio = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const localUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined;
      const uploaded = uploadAudioRef.current ? await uploadAudioRef.current(file, file.name) : undefined;
      let uploadedEvidence = typeof uploaded === "string" ? { artifactKey: uploaded } : uploaded;
      if (uploadedEvidence?.artifactKey && !uploadedEvidence.signedUrl && getAudioReadUrlRef.current) {
        try {
          const playback = await getAudioReadUrlRef.current(uploadedEvidence.artifactKey);
          uploadedEvidence = { ...uploadedEvidence, signedUrl: playback.url, expiresAt: playback.expiresAt };
        } catch {
          // Keep the local recording playable when the short-lived read URL is unavailable.
        }
      }
      const next = {
        ...localAudioEvidence(file, localUrl),
        ...(uploadedEvidence ?? {}),
        transcript: transcriptRef.current
      } satisfies AudioEvidence;
      setAudio(next);
      audioUrlRef.current = next.signedUrl;
      onAudioChange(next);
    } catch {
      setError("Không lưu được bản ghi âm. Nội dung hiện có vẫn được giữ để bạn thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setError("");
    if (!canRecord) {
      if (!speechSupported) {
        setError("Trình duyệt này không ghi âm được. Hãy tải file ghi âm lên hoặc giữ nội dung đã nhập.");
        return;
      }
      setRecordingState(true);
      startRecognition();
      return;
    }
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(acquired);
      stream.current = acquired;
      recorder.current = next;
      chunks.current = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onerror = () => {
        stopRecognition();
        acquired.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        setRecordingState(false);
        setError("Ghi âm bị gián đoạn. Nội dung hiện có vẫn được giữ để bạn thử lại.");
      };
      next.onstop = () => {
        acquired.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        setRecordingState(false);
        const mimeType = (next.mimeType || "audio/webm").split(";")[0] || "audio/webm";
        const extension = /mp4|aac/.test(mimeType) ? "m4a" : /ogg/.test(mimeType) ? "ogg" : "webm";
        void saveAudio(new File(chunks.current, `ghi-am-${Date.now()}.${extension}`, { type: mimeType }));
      };
      next.start();
      setRecordingState(true);
      startRecognition();
    } catch {
      stopRecognition();
      setRecordingState(false);
      setError("Không dùng được micro. Hãy cho phép micro, tải file ghi âm lên hoặc giữ nội dung đã nhập.");
    }
  };

  const stop = () => {
    stopRecognition();
    if (recorder.current) {
      recorder.current.stop();
      return;
    }
    setRecordingState(false);
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)$/i.test(file.name)) {
      setError("Hãy chọn file âm thanh (mp3, m4a, wav, webm…).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File quá lớn (tối đa 20 MB). Nội dung hiện có vẫn được giữ.");
      return;
    }
    void saveAudio(file);
  };

  const clearAudio = () => {
    if (audioUrlRef.current?.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = undefined;
    setAudio(null);
    onAudioChange(undefined);
  };

  const replayAudio = () => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.currentTime = 0;
    void preview.play().catch(() => setError("Không phát lại được bản ghi âm."));
  };

  const uploadId = `${label.replace(/\W+/gu, "-").toLocaleLowerCase()}-audio-upload`;
  const captureActions = <>
    {showMicrophone ? <button className={`btn-sm coach-compose-icon ${recording ? "btn-danger" : "btn-ghost"}`} type="button" aria-label={compactActions ? recording ? "Dừng ghi âm" : "Nói" : undefined} title={compactActions ? recording ? "Dừng ghi âm" : "Nói" : undefined} aria-pressed={recording} disabled={disabled || busy} onClick={recording ? stop : () => void start()}>{recording ? <><Square size={15} fill="currentColor" aria-hidden="true" /><span className={compactActions ? "sr-only" : undefined}>Đang nghe</span></> : <><Mic size={16} aria-hidden="true" /><span className={compactActions ? "sr-only" : undefined}>Nói</span></>}</button> : null}
    <label className={`btn btn-sm${compactActions ? " coach-compose-icon" : ""}`} htmlFor={uploadId} aria-hidden={compactActions || undefined} title={busy ? "Đang tải file ghi âm" : "Tải file ghi âm"}><Upload size={16} aria-hidden="true" /><span className={compactActions ? "sr-only" : undefined}>{busy ? "Đang tải…" : "Tải file ghi âm"}</span></label>
    <input id={uploadId} className="sr-only" type="file" accept="audio/*,.m4a" disabled={disabled || busy} aria-label="Tải file ghi âm" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; chooseFile(file); }} />
  </>;

  if (compactActions) return <section className="audio-capture-control audio-capture-control--compact" aria-label={label}>
    <div className="audio-capture-toolbar">
      {captureActions}
      {busy ? <span className="audio-capture-status" role="status">Đang tải…</span> : null}
      {audio && !busy ? <span className="audio-capture-preview">
        {audio.signedUrl ? <audio ref={previewRef} preload="metadata" src={audio.signedUrl} aria-label="Bản ghi âm đang chờ gửi" /> : null}
        <button className="btn-sm btn-ghost audio-capture-replay" type="button" aria-label="Nghe lại bản ghi âm" title="Nghe lại" disabled={!audio.signedUrl} onClick={replayAudio}><Play size={15} fill="currentColor" aria-hidden="true" /><span>Nghe lại</span></button>
        <button className="btn-sm btn-ghost audio-capture-remove" type="button" aria-label="Xóa bản ghi âm" title="Xóa bản ghi âm" onClick={clearAudio}><Trash2 size={15} aria-hidden="true" /></button>
      </span> : null}
      {error ? <button className="audio-capture-status audio-capture-status--error" type="button" role="alert" title={error} onClick={() => setError("")}>{error}</button> : null}
    </div>
  </section>;

  return <section className="stack audio-capture-control" aria-label={label}>
    {!canRecord && !speechSupported ? <Notice tone="warn">Trình duyệt này không ghi âm được. Bạn vẫn có thể tải file ghi âm hoặc giữ nội dung đã nhập.</Notice> : null}
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      {captureActions}
    </div>
    {busy ? <Notice>Đang lưu bản ghi âm…</Notice> : null}
    {audio && !busy ? <Notice tone="ok">Bản ghi âm đã lưu. Bạn có thể nghe lại trước khi gửi.</Notice> : null}
    {error ? <div className="stack"><p className="small" role="alert">{error}</p><button className="btn-sm btn-ghost" type="button" onClick={() => setError("")}><RotateCcw size={15} aria-hidden="true" /> Đóng thông báo</button></div> : null}
    {audio ? <AudioEvidencePanel label="Bản ghi âm" evidence={{ ...audio, transcript: transcript || audio.transcript }} /> : null}
  </section>;
}
