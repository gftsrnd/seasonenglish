import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { ArrowDown, ArrowRight, ChevronDown } from "lucide-react";
import { buildCrosswordLayout, type CrosswordDirection, type CrosswordLayout, type CrosswordPlaced } from "@e4s/domain/engagement";
import { prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { GameHud, useGameClock, useRoundTally } from "./GameHud.js";
import { useExperience } from "../../features/experience/Experience.js";
import { GameFeedback } from "./GameFeedback.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Pager, usePaged } from "../shared/Pager.js";

type Direction = CrosswordDirection;
type Placed = CrosswordPlaced<GameWord>;
type Crossword = CrosswordLayout<GameWord>;

function distinctDefinition({ definition, vietnamese }: GameWord) {
  const text = definition?.trim();
  return text && text.toLowerCase() !== vietnamese.trim().toLowerCase() ? text : undefined;
}

export function crosswordEntryCount(words: readonly GameWord[]) {
  return buildCrosswordLayout(words).placed.length;
}

export function CrosswordGame({ words, onFinish, attemptSeed = 0 }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number }) {
  // Same layout the server rebuilds from the word set and seed: N = the words really placed.
  const crossword = useMemo(() => buildCrosswordLayout(prepareGameAttempt(words, attemptSeed)), [attemptSeed, words]);
  const units = useMemo(() => crossword.placed.map((entry) => entry.word), [crossword]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, "ok" | "bad">>({});
  // Per word: hints used on it, checks where it was filled in but wrong, active ms.
  const [hinted, setHinted] = useState<Record<string, true>>({});
  const [wrongChecks, setWrongChecks] = useState<Record<string, number>>({});
  const [solved, setSolved] = useState<GameAnswerInput[]>([]);
  const wordMs = useRef<Record<string, number>>({});
  const timedEntry = useRef<string | undefined>(undefined);
  const clock = useGameClock();
  const tally = useRoundTally("crossword", units, solved);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"info" | "success" | "error">("info");
  const [busy, setBusy] = useState(false);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("across");
  const { play } = useExperience();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Phones keep the selected clue beside the board and fold the full lists away.
  const compactClues = useMediaQuery("(max-width: 720px)");
  // Folded clue list on phones: one page of 5 clues (across first, then down) instead of a long scroll.
  const orderedClues = useMemo(() => crosswordClueOrder(crossword.placed), [crossword]);
  const cluePage = usePaged(orderedClues, { phone: 5, tablet: 5 });
  useEffect(() => { clock.start(); return () => clock.pause(); }, [clock]);
  if (crossword.placed.length < 3) return <p className="muted">Không đan được lưới từ bộ này — cần ít nhất 3 từ có chữ cái chung.</p>;
  const cellKey = (row: number, column: number) => `${row},${column}`;
  const focusCell = (key: string | undefined) => {
    if (!key) return;
    const input = inputRefs.current[key];
    if (!input) return;
    input.focus({ preventScroll: true });
  };
  const moveFocus = (row: number, column: number, key: string) => {
    const nextRow = row + (key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0);
    const nextColumn = column + (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0);
    if (nextRow < 0 || nextColumn < 0 || !crossword.cells[nextRow]?.[nextColumn]) return;
    const next = cellKey(nextRow, nextColumn);
    setActiveCell(next);
    focusCell(next);
  };
  const clue = (direction: Direction) => crossword.placed.filter((entry) => entry.direction === direction).sort((left, right) => (left.number ?? 0) - (right.number ?? 0));
  const entriesAt = (key: string) => crossword.placed.filter((entry) => {
    const [row, column] = key.split(",").map(Number);
    const rowStep = entry.direction === "down" ? 1 : 0;
    const columnStep = entry.direction === "across" ? 1 : 0;
    return entry.value.split("").some((_, index) => entry.row + rowStep * index === row && entry.column + columnStep * index === column);
  });
  const activeEntry = activeCell ? entriesAt(activeCell).find((entry) => entry.direction === direction) ?? entriesAt(activeCell)[0] : undefined;
  const activeDefinition = activeEntry && distinctDefinition(activeEntry.word);
  // Active time goes to the word being worked on (time before the first pick goes to the first word).
  const chargeTime = () => {
    const id = timedEntry.current ?? crossword.placed[0]?.word.id;
    if (id) wordMs.current[id] = (wordMs.current[id] ?? 0) + clock.lap();
  };
  const activeWordId = activeEntry?.word.id;
  if (activeWordId !== timedEntry.current && activeWordId) { chargeTime(); timedEntry.current = activeWordId; }
  const activeEntryCells = activeEntry ? activeEntry.value.split("").map((_, index) => cellKey(activeEntry.row + (activeEntry.direction === "down" ? index : 0), activeEntry.column + (activeEntry.direction === "across" ? index : 0))) : [];
  const selectClue = (entry: Placed) => {
    const key = cellKey(entry.row, entry.column);
    setActiveCell(key);
    setDirection(entry.direction);
    inputRefs.current[key]?.focus();
  };
  const toggleDirection = (key: string) => {
    const entries = entriesAt(key);
    if (entries.some((entry) => entry.direction !== direction)) setDirection((value) => value === "across" ? "down" : "across");
  };
  const selectCell = (key: string) => {
    const entries = entriesAt(key);
    if (!entries.length) return;
    if (activeCell === key && entries.length > 1) {
      toggleDirection(key);
    } else {
      setDirection(entries.find((entry) => entry.direction === direction)?.direction ?? entries[0]!.direction);
    }
    setActiveCell(key);
    focusCell(key);
  };
  const moveAlongActiveEntry = (key: string) => {
    const entry = entriesAt(key).find((candidate) => candidate.direction === direction) ?? entriesAt(key)[0];
    if (!entry) return;
    const cells = entry.value.split("").map((_, index) => cellKey(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0)));
    const next = cells[cells.indexOf(key) + 1];
    if (next) { setActiveCell(next); focusCell(next); }
  };
  const clearCell = (key: string) => {
    setValues((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setStates((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const previousInActiveEntry = (key: string) => {
    const entry = entriesAt(key).find((candidate) => candidate.direction === direction) ?? entriesAt(key)[0];
    if (!entry) return undefined;
    const cells = entry.value.split("").map((_, index) => cellKey(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0)));
    const previousIndex = cells.indexOf(key) - 1;
    return previousIndex >= 0 ? cells[previousIndex] : undefined;
  };
  const handleBackspace = (key: string) => {
    if (values[key]) {
      clearCell(key);
      return;
    }
    const previous = previousInActiveEntry(key);
    if (!previous) return;
    clearCell(previous);
    setActiveCell(previous);
    focusCell(previous);
  };
  const writeLetter = (key: string, letter: string) => {
    setValues((current) => ({ ...current, [key]: letter.toUpperCase() }));
    setStates((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    moveAlongActiveEntry(key);
  };
  const cellClueIds = (row: number, column: number) => crossword.placed
    .filter((entry) => {
      const rowStep = entry.direction === "down" ? 1 : 0;
      const columnStep = entry.direction === "across" ? 1 : 0;
      return entry.value.split("").some((_, index) => entry.row + rowStep * index === row && entry.column + columnStep * index === column);
    })
    .map((entry) => `crossword-clue-${entry.direction}-${entry.number}`)
    .join(" ");
  const readWord = (entry: Placed) => {
    const rowStep = entry.direction === "down" ? 1 : 0;
    const columnStep = entry.direction === "across" ? 1 : 0;
    return entry.value.split("").map((_, index) => values[cellKey(entry.row + rowStep * index, entry.column + columnStep * index)] ?? "").join("");
  };
  const check = async () => {
    if (busy) return;
    const nextStates: Record<string, "ok" | "bad"> = {};
    let correctCells = 0;
    crossword.cells.forEach((row, rowIndex) => row.forEach((wanted, columnIndex) => {
      if (!wanted) return;
      const key = cellKey(rowIndex, columnIndex);
      const correct = values[key]?.toUpperCase() === wanted;
      if (correct) correctCells += 1;
      if (values[key]) nextStates[key] = correct ? "ok" : "bad";
    }));
    setStates(nextStates);
    const correctEntries = crossword.placed.filter((entry) => readWord(entry) === entry.value);
    const correctWords = correctEntries.length;
    // A word counts as a wrong try only when it was completely filled in (typing is not an answer yet).
    const nextWrong = { ...wrongChecks };
    crossword.placed.forEach((entry) => {
      const written = readWord(entry);
      if (written.length === entry.value.length && written !== entry.value) nextWrong[entry.word.id] = (nextWrong[entry.word.id] ?? 0) + 1;
    });
    setWrongChecks(nextWrong);
    const answerFor = (entry: Placed): GameAnswerInput => ({
      wordId: entry.word.id, answer: entry.word.english, attempts: 1 + (nextWrong[entry.word.id] ?? 0),
      usedHint: Boolean(hinted[entry.word.id]), ms: Math.round(wordMs.current[entry.word.id] ?? 0)
    });
    setSolved(correctEntries.map(answerFor));
    if (correctCells !== crossword.cells.flat().filter(Boolean).length) {
      play("error");
      setNoticeTone("error");
      setNotice(`${correctWords}/${crossword.placed.length} từ đúng · ${correctCells} ô đúng.`);
      return;
    }
    play("success");
    setNoticeTone("success");
    chargeTime();
    clock.pause();
    const answers = crossword.placed.map(answerFor);
    setBusy(true);
    await onFinish({ answers });
  };
  const hint = () => {
    // A hint belongs to the selected answer, not to an arbitrary cell elsewhere
    // in the board. This is particularly important at intersections: the selected
    // direction tells the learner which word is being helped.
    const candidate = activeEntry?.value.split("").map((wanted, index) => {
      const key = cellKey(activeEntry.row + (activeEntry.direction === "down" ? index : 0), activeEntry.column + (activeEntry.direction === "across" ? index : 0));
      return values[key]?.toUpperCase() === wanted ? undefined : [key, wanted] as [string, string];
    }).find((value): value is [string, string] => Boolean(value));
    if (!candidate) return;
    setValues((current) => ({ ...current, [candidate[0]]: candidate[1] }));
    setStates((current) => ({ ...current, [candidate[0]]: "ok" }));
    setHinted((current) => ({ ...current, [activeEntry!.word.id]: true }));
  };
  return <div className="game-runner" aria-busy={busy || undefined}>
    <GameHud title={<h2>Đúng {solved.length}/{crossword.placed.length}</h2>} raw={tally.raw} combo={tally.combo} clock={clock} />
    <div className="crossword-scene">
      <div className="crossword-mode" role="status" aria-live="polite"><span>Đang đi <b>{direction === "across" ? "Ngang" : "Dọc"}</b></span><span className="crossword-mode-sep" aria-hidden="true">·</span><span>Từ <span className="crossword-mode-long">đang chọn </span><b>{activeEntry?.number ?? "—"}</b></span><button type="button" className="btn-sm" onClick={() => activeCell && toggleDirection(activeCell)} disabled={!activeCell || entriesAt(activeCell).length < 2}>Đổi hướng</button></div>
      {activeEntry ? <p className="crossword-active-clue"><b>{activeEntry.number}. {activeEntry.direction === "across" ? "Ngang" : "Dọc"}</b> · {activeEntry.word.vietnamese}{activeDefinition ? ` — ${activeDefinition}` : ""} <small>({activeEntry.value.length} chữ)</small></p> : <p className="crossword-active-clue is-empty">Chọn một ô để xem gợi ý của từ đó.</p>}
      <div className="crossword-grid" role="grid" aria-label="Lưới ô chữ" aria-readonly="false" aria-rowcount={crossword.cells.length} aria-colcount={crossword.cells[0]?.length ?? 0} style={{ "--crossword-columns": crossword.cells[0]?.length ?? 1 } as CSSProperties}>
        {crossword.cells.map((row, rowIndex) => <div role="row" aria-label={`Hàng ${rowIndex + 1}`} aria-rowindex={rowIndex + 1} key={`row-${rowIndex}`}>
          {row.map((wanted, columnIndex) => {
          const key = cellKey(rowIndex, columnIndex);
          if (!wanted) return <span className="crossword-block" aria-hidden="true" key={key} />;
          return <label role="gridcell" aria-label={`Ô chữ hàng ${rowIndex + 1} cột ${columnIndex + 1}`} aria-colindex={columnIndex + 1} aria-current={activeCell === key ? "true" : undefined} className={`crossword-cell ${states[key] ?? ""} ${activeEntryCells.includes(key) ? "is-active-entry" : ""} ${activeCell === key ? "is-active" : ""}`} key={key} onClick={() => selectCell(key)}>{crossword.numbers[key] ? <span className="crossword-cell-number" aria-hidden="true">{crossword.numbers[key]}</span> : null}<input ref={(element) => { inputRefs.current[key] = element; }} aria-label={`Ô chữ hàng ${rowIndex + 1} cột ${columnIndex + 1}`} aria-describedby={cellClueIds(rowIndex, columnIndex) || undefined} maxLength={1} value={values[key] ?? ""} disabled={busy} onFocus={() => {
            const entries = entriesAt(key);
            if (entries.length === 1) setDirection(entries[0]!.direction);
            setActiveCell(key);
          }} onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              setDirection(event.key === "ArrowUp" || event.key === "ArrowDown" ? "down" : "across");
              moveFocus(rowIndex, columnIndex, event.key);
              return;
            }
            if (event.key === "Backspace") {
              event.preventDefault();
              event.stopPropagation();
              handleBackspace(key);
              return;
            }
            if (event.key === "Delete") {
              event.preventDefault();
              event.stopPropagation();
              clearCell(key);
              return;
            }
            // Prevent native insertion. Letting the browser insert first and then
            // moving focus caused the first key to be replayed in the next cell on
            // some Chromium/IME paths.
            if (/^[a-z]$/i.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault();
              event.stopPropagation();
              writeLetter(key, event.key);
            }
          }} onPaste={(event) => {
            event.preventDefault();
            const letters = event.clipboardData.getData("text").replace(/[^a-z]/gi, "").toUpperCase().split("");
            if (!letters.length) return;
            let current = key;
            letters.forEach((letter) => {
              setValues((previous) => ({ ...previous, [current]: letter }));
              const next = activeEntryCells[activeEntryCells.indexOf(current) + 1];
              if (next) current = next;
            });
            setActiveCell(current);
            window.requestAnimationFrame(() => focusCell(current));
          }} onChange={() => {
            // Input is controlled by keydown/paste above. Keeping this handler
            // intentionally inert prevents a duplicate native onChange write.
          }} /></label>;
          })}
        </div>)}
      </div>
      <div className="crossword-actions"><button className="btn-primary" type="button" onClick={() => void check()} disabled={busy}>Kiểm tra</button><button className="btn-sm" type="button" onClick={hint} disabled={busy || !activeEntry} title={activeEntry ? `Gợi ý cho từ ${activeEntry.number} · từ này chỉ còn +5.` : "Chọn một từ trước khi dùng gợi ý."}>Gợi ý 1 chữ</button><span className="crossword-actions-note">{activeEntry ? `Gợi ý cho từ ${activeEntry.number} · từ này chỉ còn +5.` : "Chọn một từ trước khi dùng gợi ý."}</span></div>
      {(() => { const clueLists = <div className="crossword-clues">
        {([
          { direction: "across", label: "Ngang", Icon: ArrowRight },
          { direction: "down", label: "Dọc", Icon: ArrowDown },
        ] as const).map(({ direction, label, Icon }) => (
          (compactClues ? cluePage.visible.some((entry) => entry.direction === direction) : true) ? <section key={direction} className={activeEntry?.direction === direction ? "is-active" : ""} role="region" aria-label={`Gợi ý ${label.toLowerCase()}`}>
            <h3>{label} <Icon className="game-control-icon" size={12} strokeWidth={2} aria-hidden="true" /></h3>
            <ol>
              {(compactClues ? cluePage.visible.filter((entry) => entry.direction === direction) : clue(direction)).map((entry) => {
                const definition = distinctDefinition(entry.word);
                return (
                  <li id={`crossword-clue-${direction}-${entry.number}`} key={entry.word.id}>
                    <button type="button" aria-current={activeEntry === entry || undefined} onClick={() => selectClue(entry)}>
                      <b>{entry.number}.</b>
                      <span>{entry.word.vietnamese}{definition ? <span className="muted"> · {definition}</span> : null}</span>
                      <small>({entry.value.length})</small>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section> : null
        ))}
        {compactClues ? <Pager {...cluePage} label="gợi ý" /> : null}
      </div>;
        return compactClues ? <details className="crossword-clues-toggle"><summary>Xem tất cả gợi ý <small>({crossword.placed.length})</small><ChevronDown className="crossword-clues-chevron" size={18} strokeWidth={2} aria-hidden="true" /></summary>{clueLists}</details> : clueLists; })()}
      {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
      <GameFeedback message={notice} tone={noticeTone} />
    </div>
  </div>;
}

/** Clue order for the paged list: across clues by number, then down clues by number. */
export function crosswordClueOrder<T extends { direction: Direction; number?: number }>(placed: readonly T[]): T[] {
  const byNumber = (left: T, right: T) => (left.number ?? 0) - (right.number ?? 0);
  return [...placed.filter((entry) => entry.direction === "across").sort(byNumber), ...placed.filter((entry) => entry.direction === "down").sort(byNumber)];
}
