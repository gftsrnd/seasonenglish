import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square, Upload } from "lucide-react";
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
  const transcript = Array.from(event.results).map((result) => result[0]?.transcript.trim() ?? "").filter(Boolean).join(" ");
  if (!transcript) return base;
  const draft = base.trim();
  return `${draft}${draft ? " " : ""}${transcript}`;
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
  onRecordingChange
}: {
  value?: LearnerAudioEvidence | null | undefined;
  transcript: string;
  label?: string;
  showMicrophone?: boolean;
  disabled?: boolean;
  uploadAudio?: (file: Blob, filename: string) => Promise<string | LearnerAudioEvidence>;
  getAudioReadUrl?: ((artifactKey: string) => Promise<{ url: string; expiresAt: string }>) | undefined;
  onTranscript: (value: string) => void;
  onAudioChange: (value: AudioEvidence) => void;
  onRecordingChange?: (recording: boolean) => void;
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

  return <section className="stack audio-capture-control" aria-label={label}>
    {!canRecord && !speechSupported ? <Notice tone="warn">Trình duyệt này không ghi âm được. Bạn vẫn có thể tải file ghi âm hoặc giữ nội dung đã nhập.</Notice> : null}
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      {showMicrophone ? <button className={`btn-sm coach-compose-icon ${recording ? "btn-danger" : "btn-ghost"}`} type="button" aria-pressed={recording} disabled={disabled || busy} onClick={recording ? stop : () => void start()}>{recording ? <><Square size={15} fill="currentColor" aria-hidden="true" /> Đang nghe</> : <><Mic size={16} aria-hidden="true" /> Nói</>}</button> : null}
      <label className="btn btn-sm" htmlFor={`${label.replace(/\W+/gu, "-").toLocaleLowerCase()}-audio-upload`}><Upload size={16} aria-hidden="true" /> {busy ? "Đang tải…" : "Tải file ghi âm"}</label>
      <input id={`${label.replace(/\W+/gu, "-").toLocaleLowerCase()}-audio-upload`} className="sr-only" type="file" accept="audio/*,.m4a" disabled={disabled || busy} aria-label="Tải file ghi âm" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; chooseFile(file); }} />
    </div>
    {busy ? <Notice>Đang lưu bản ghi âm…</Notice> : null}
    {audio && !busy ? <Notice tone="ok">Bản ghi âm đã lưu. Bạn có thể nghe lại trước khi gửi.</Notice> : null}
    {error ? <div className="stack"><p className="small" role="alert">{error}</p><button className="btn-sm btn-ghost" type="button" onClick={() => setError("")}><RotateCcw size={15} aria-hidden="true" /> Đóng thông báo</button></div> : null}
    {audio ? <AudioEvidencePanel label="Bản ghi âm" evidence={{ ...audio, transcript: transcript || audio.transcript }} /> : null}
  </section>;
}
