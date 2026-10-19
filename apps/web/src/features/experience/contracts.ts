export type LessonSpeechStatus = "started" | "ended" | "error" | "unsupported";

export interface LessonSpeechOptions {
  onStatus?: (status: LessonSpeechStatus) => void;
}
