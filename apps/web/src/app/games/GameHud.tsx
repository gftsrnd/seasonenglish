import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GameAnswerInput, GameEvidenceEventInput, GameKey } from "@e4s/contracts";
import { roundStreak, scoreGameRound } from "@e4s/domain/engagement";
import { Timer } from "lucide-react";
import type { GameWord } from "./types.js";

export interface GameClock {
  /** Starts (or resumes) counting active gameplay time. */
  start(): void;
  /** Stops counting: loading, feedback pauses and transitions are not gameplay. */
  pause(): void;
  /** Active ms since the previous lap: the time spent on the unit just answered. */
  lap(): number;
  /** Total active ms so far. */
  elapsed(): number;
}

/** Active gameplay clock shared by the six games (RULE A.5: no loading, countdown or transitions). */
export function useGameClock(): GameClock {
  const state = useRef({ total: 0, startedAt: null as number | null, lastLap: 0 });
  return useMemo(() => {
    const current = state.current;
    const elapsed = () => current.total + (current.startedAt === null ? 0 : performance.now() - current.startedAt);
    return {
      start() { if (current.startedAt === null) current.startedAt = performance.now(); },
      pause() {
        if (current.startedAt === null) return;
        current.total += performance.now() - current.startedAt;
        current.startedAt = null;
      },
      lap() {
        const now = elapsed();
        const ms = Math.max(0, Math.round(now - current.lastLap));
        current.lastLap = now;
        return ms;
      },
      elapsed
    };
  }, []);
}

/** Live round score (the shown whole-number points added up) and combo, with the same rule the server scores with. */
export function useRoundTally(game: GameKey, units: readonly GameWord[], answers: readonly GameAnswerInput[], events?: readonly GameEvidenceEventInput[]) {
  return useMemo(() => {
    const scored = scoreGameRound(game, units, answers.filter(Boolean), { units, events });
    return { raw: scored.score, combo: roundStreak(scored.outcomes.filter((outcome) => outcome !== "unanswered")) };
  }, [answers, events, game, units]);
}

/** Shown points a new answer adds to the round score (for the "+9" feedback). */
export function roundGain(game: GameKey, units: readonly GameWord[], before: readonly GameAnswerInput[], after: readonly GameAnswerInput[], events?: readonly GameEvidenceEventInput[]) {
  return scoreGameRound(game, units, after, { units, events }).score - scoreGameRound(game, units, before, { units, events }).score;
}

function clockText(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The shared game HUD (M04): progress (title), raw points, combo, active time, then lives/extras. */
export function GameHud({ title, raw, combo, clock, children }: { title: ReactNode; raw: number; combo: number; clock: GameClock; children?: ReactNode }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="game-hud">
    {title}
    <span data-hud="raw">Điểm <strong>{raw}</strong></span>
    <span data-hud="combo">Combo <strong>{combo}</strong></span>
    <span data-hud="time" aria-label="Thời gian chơi"><Timer size={14} strokeWidth={2} aria-hidden="true" /><strong>{clockText(clock.elapsed())}</strong></span>
    {children}
  </div>;
}
