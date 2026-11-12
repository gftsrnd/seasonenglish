/**
 * Status of the automatic Edge TTS run after AI generation
 * (`audioSynthesis` on a listening stimulus, lesson part or review item).
 * Only a failure without any audio is shown; a generated file needs no note.
 */
export function failedAudioSynthesisCode(mark: unknown, hasAudio: boolean): string | null {
  if (hasAudio || !mark || typeof mark !== "object") return null;
  const { status, code } = mark as { status?: unknown; code?: unknown };
  if (status !== "failed") return null;
  return typeof code === "string" && code.trim() ? code.trim() : "EDGE_TTS_FAILED";
}

export function AudioSynthesisNotice({ mark, hasAudio, retry }: { mark: unknown; hasAudio: boolean; retry?: string | undefined }) {
  const code = failedAudioSynthesisCode(mark, hasAudio);
  if (!code) return null;
  return <div className="banner warn operator-audio-synthesis-notice" role="status"><div className="body small">Chưa tạo được audio tự động (mã {code}) — {retry ?? "bấm Sinh audio Edge TTS để thử lại"}.</div></div>;
}

/** "Hệ thống đã tự sửa: …" — what the generation fixed before the draft was shown. */
export function AutoFixedNote({ notes }: { notes: readonly string[] | undefined }) {
  if (!notes?.length) return null;
  return <div className="banner ok operator-auto-fixed-note" role="status" aria-label="Hệ thống đã tự sửa"><div className="body small"><b>Hệ thống đã tự sửa:</b>{notes.length === 1 ? <> {notes[0]}</> : <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>}</div></div>;
}
