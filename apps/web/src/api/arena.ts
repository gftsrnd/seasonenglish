import type { CefrLevel, GameFinishInput, GameKey, GameWordSetView } from "@e4s/contracts";
import { request } from "./runtime.js";

/** Web-side shapes of the phase-2 arena API (`/api/v1/arena`, packages/database arena-repository). */
export type ArenaSetKind = "curriculum" | "personal";
export type ArenaMatchStatus = "open" | "invited" | "accepted" | "settled" | "expired" | "cancelled" | "declined";
export type ArenaBoardGame = GameKey | "total";

export interface ArenaSeason { id: string; startsOn: string; endsOn: string; status: "scheduled" | "active" | "closed" }

export interface ArenaMatch {
  id: string;
  mode: "ranked" | "friendly";
  game: GameKey;
  cefr: CefrLevel;
  status: ArenaMatchStatus;
  setKind: ArenaSetKind;
  setTopic: string;
  postedByMe: boolean;
  opponent: { id: string; displayName: string; cefr: CefrLevel | null } | null;
  createdAt: string;
  acceptDeadline: string;
  acceptedAt: string | null;
  playDeadline: string | null;
  settledAt: string | null;
  cancelReason: string | null;
  me: { started: boolean; played: boolean; score: number | null; gameplayMs: number | null };
  them: { played: boolean; score: number | null };
  result: null | {
    outcome: "win" | "lose" | "draw";
    decidedBy: "score" | "time" | "forfeit" | "timeout";
    rating: null | { before: number; after: number; change: number; base: number | null; decayPercent: number | null; meetingIndex: number | null };
  };
}

export interface ArenaHome {
  eligible: boolean;
  requiredLevel: "B1";
  level: CefrLevel | null;
  season: ArenaSeason | null;
  ratings: Record<GameKey, number>;
  total: number;
  /** Position on the level's total board this season; null until the learner has a rating row. */
  rank?: { position: number; of: number } | null;
  /** The word set a new challenge uses (the learner's current Mini game set). */
  set?: { topic: string; words: number; kind: ArenaSetKind } | null;
  openRanked: number;
  maxOpenRanked: number;
  matches: { open: ArenaMatch[]; active: ArenaMatch[]; done: ArenaMatch[] };
}

/** An open ranked challenge someone else posted: the poster stays hidden until accepted. */
export interface ArenaOpenChallenge { id: string; game: GameKey; setKind: ArenaSetKind; setTopic: string; acceptDeadline: string; createdAt: string }

export interface ArenaRound { match: ArenaMatch; wordSet: GameWordSetView; attemptSeed: number; unitIds: string[] }

export interface ArenaLeaderboard {
  level: CefrLevel;
  game: ArenaBoardGame;
  season: ArenaSeason | null;
  entries: Array<{ rank: number; learnerId: string; displayName: string; rating: number }>;
  me: { rank: number; of: number; rating: number } | null;
}

export interface ArenaSeasonSetting {
  firstSeasonStart: string | null;
  seasonMonths: number;
  current: ArenaSeason | null;
  next: ArenaSeason | null;
  hasMatches: boolean;
}

export interface ArenaApiClient {
  home(): Promise<ArenaHome>;
  quickMatch(input: { requestId: string; game: GameKey; setKind?: ArenaSetKind }): Promise<{ joined: boolean; match: ArenaMatch }>;
  challenges(): Promise<{ challenges: ArenaOpenChallenge[] }>;
  postChallenge(input: { requestId: string; game: GameKey }): Promise<ArenaMatch>;
  acceptChallenge(id: string): Promise<ArenaMatch>;
  match(id: string): Promise<ArenaMatch>;
  start(id: string): Promise<ArenaRound>;
  submit(id: string, input: GameFinishInput & { requestId: string }): Promise<{ match: ArenaMatch; result: { score: number; correct: number; total: number } }>;
  forfeit(id: string): Promise<ArenaMatch>;
  cancel(id: string): Promise<ArenaMatch>;
  leaderboard(input: { game?: ArenaBoardGame; level?: CefrLevel }): Promise<ArenaLeaderboard>;
  inviteFriendly(input: { requestId: string; opponentId: string; game: GameKey }): Promise<ArenaMatch>;
  answerFriendly(id: string, answer: "accept" | "decline"): Promise<ArenaMatch>;
  seasonSetting(): Promise<ArenaSeasonSetting>;
  saveSeasonStart(input: { startsOn: string; confirm?: boolean }): Promise<ArenaSeasonSetting>;
}

const post = (body: unknown = {}) => ({ method: "POST", body: JSON.stringify(body) });

export const arenaApiClient: ArenaApiClient = {
  home: () => request("/api/v1/arena"),
  quickMatch: (input) => request("/api/v1/arena/quick-match", post(input)),
  challenges: () => request("/api/v1/arena/challenges"),
  postChallenge: (input) => request("/api/v1/arena/challenges", post(input)),
  acceptChallenge: (id) => request(`/api/v1/arena/challenges/${encodeURIComponent(id)}/accept`, post()),
  match: (id) => request(`/api/v1/arena/matches/${encodeURIComponent(id)}`),
  start: (id) => request(`/api/v1/arena/matches/${encodeURIComponent(id)}/start`, post()),
  submit: (id, input) => request(`/api/v1/arena/matches/${encodeURIComponent(id)}/result`, post({
    requestId: input.requestId, answers: input.answers, ...(input.events?.length ? { events: input.events } : {})
  })),
  forfeit: (id) => request(`/api/v1/arena/matches/${encodeURIComponent(id)}/forfeit`, post()),
  cancel: (id) => request(`/api/v1/arena/matches/${encodeURIComponent(id)}/cancel`, post()),
  leaderboard: ({ game, level }) => {
    const query = new URLSearchParams();
    if (game) query.set("game", game);
    if (level) query.set("level", level);
    const suffix = query.toString();
    return request(`/api/v1/arena/leaderboard${suffix ? `?${suffix}` : ""}`);
  },
  inviteFriendly: (input) => request("/api/v1/arena/friendly", post(input)),
  answerFriendly: (id, answer) => request(`/api/v1/arena/friendly/${encodeURIComponent(id)}/${answer}`, post()),
  seasonSetting: () => request("/api/v1/manager/arena-season"),
  saveSeasonStart: (input) => request("/api/v1/manager/arena-season", { method: "PUT", body: JSON.stringify(input) })
};
