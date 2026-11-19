import { useEffect, useState } from "react";
import type { ArenaApiClient, ArenaRoundWords } from "../../../api/arena.js";

/** The words of a match's round as chips (english – vietnamese), to revise before playing (owner, 19/11). */
export function ArenaWords({ matchId, client }: { matchId: string; client: Pick<ArenaApiClient, "words"> }) {
  const [data, setData] = useState<ArenaRoundWords | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    client.words(matchId).then((next) => { if (live) setData(next); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [client, matchId]);
  if (failed) return <p className="small muted">Không tải được bộ từ.</p>;
  if (!data) return <p className="small muted" aria-live="polite">Đang tải từ…</p>;
  return <div className="arena-words">
    <p className="small muted">{data.topic} · {data.words.length} từ trong ván</p>
    <ul className="arena-word-chips" aria-label={`Từ của bộ ${data.topic}`}>{data.words.map((word) => <li key={word.id}><b>{word.english}</b> · {word.vietnamese}</li>)}</ul>
  </div>;
}
