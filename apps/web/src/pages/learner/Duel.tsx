import type { DuelView, GameAnswerInput, GameDescriptor } from "@e4s/contracts";
import { Game } from "./Game.js";

export function Duel({ view, completion, descriptor, onFinish }: { view: DuelView; completion?: DuelView | undefined; descriptor: GameDescriptor; onFinish: (input: { answers: GameAnswerInput[] }) => void | Promise<void> }) {
  return <div className="duel-screen"><h1 className="duel-heading">⚔️ Thách đấu với {view.opponent.displayName}</h1><Game descriptor={descriptor} wordSet={view.wordSet} onFinish={onFinish} backHref="/arena" result={completion?.result} duelOutcome={completion?.outcome} /></div>;
}
