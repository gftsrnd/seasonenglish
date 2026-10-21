export type LessonSpeechStatus = "started" | "ended" | "error" | "unsupported" | "no_voice";

export interface LessonSpeechOptions {
  onStatus?: (status: LessonSpeechStatus) => void;
  audioSrc?: string;
}
