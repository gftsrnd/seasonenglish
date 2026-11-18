import { ArenaError, ArenaRepository } from "@e4s/database";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { assessmentInProgress } from "../assessment/active-attempt.js";
import { gameResultInput, gameResultValidationError } from "../engagement/result-input.js";
import { createRoleGuard } from "../identity/policy.js";

const gameKey = z.enum(["scramble", "crossword", "eggs", "mario", "sort", "typing"]);
const setKind = z.enum(["curriculum", "personal"]).default("curriculum");
const matchParams = z.object({ matchId: z.uuid() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

/**
 * Arena phase 2 API (THIET-KE-DAU-TRUONG, DOT 2). The retired `/api/v1/engagement/arena`
 * and `/duels` URLs keep answering 410 ARENA_RETIRED; the new arena lives here.
 */
export function registerArenaRoutes(app: FastifyInstance, pool: Pool): void {
  const arena = new ArenaRepository(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);
  const managerOnly = createRoleGuard(pool, ["manager"]);

  const handle = async <T>(reply: FastifyReply, work: () => Promise<T>, status = 200): Promise<unknown> => {
    try {
      const value = await work();
      return status === 200 ? value : reply.code(status).send(value);
    } catch (error) {
      if (error instanceof ArenaError) return reply.code(error.status).send({ code: error.code, ...(error.details ?? {}) });
      throw error;
    }
  };

  app.get("/api/v1/arena", { preHandler: learnerOnly }, async (request, reply) => {
    const view = await arena.view(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "ARENA_CONTEXT_NOT_FOUND" });
  });

  app.get("/api/v1/arena/challenges", { preHandler: learnerOnly }, async (request, reply) =>
    handle(reply, async () => ({ challenges: await arena.openChallenges(request.e4sSession!.user.id) })));

  app.post("/api/v1/arena/challenges", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({ requestId: z.uuid(), game: gameKey, setKind }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ARENA_CHALLENGE" });
    return handle(reply, () => arena.postChallenge(request.e4sSession!.user.id, parsed.data), 201);
  });

  app.post("/api/v1/arena/challenges/:matchId/accept", { preHandler: learnerOnly }, async (request, reply) => {
    const params = matchParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ARENA_MATCH" });
    return handle(reply, () => arena.acceptChallenge(request.e4sSession!.user.id, params.data.matchId));
  });

  app.post("/api/v1/arena/quick-match", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({ requestId: z.uuid(), game: gameKey, setKind: z.enum(["curriculum", "personal"]).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ARENA_CHALLENGE" });
    return handle(reply, () => arena.quickMatch(request.e4sSession!.user.id, parsed.data));
  });

  app.post("/api/v1/arena/friendly", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({ requestId: z.uuid(), opponentId: z.uuid(), game: gameKey, setKind: z.enum(["curriculum", "personal"]).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ARENA_INVITE" });
    return handle(reply, () => arena.inviteFriendly(request.e4sSession!.user.id, parsed.data), 201);
  });

  for (const answer of ["accept", "decline"] as const) {
    app.post(`/api/v1/arena/friendly/:matchId/${answer}`, { preHandler: learnerOnly }, async (request, reply) => {
      const params = matchParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "INVALID_ARENA_MATCH" });
      return handle(reply, () => arena.answerFriendly(request.e4sSession!.user.id, params.data.matchId, answer));
    });
  }

  app.get("/api/v1/arena/matches/:matchId", { preHandler: learnerOnly }, async (request, reply) => {
    const params = matchParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ARENA_MATCH" });
    const view = await arena.match(request.e4sSession!.user.id, params.data.matchId);
    return view ?? reply.code(404).send({ code: "ARENA_MATCH_NOT_FOUND" });
  });

  app.post("/api/v1/arena/matches/:matchId/start", { preHandler: learnerOnly }, async (request, reply) => {
    const params = matchParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ARENA_MATCH" });
    const learnerId = request.e4sSession!.user.id;
    if (await assessmentInProgress(pool, learnerId)) return reply.code(409).send({ code: "MINIGAME_LOCKED_DURING_ASSESSMENT" });
    return handle(reply, () => arena.start(learnerId, params.data.matchId));
  });

  app.post("/api/v1/arena/matches/:matchId/result", { preHandler: learnerOnly }, async (request, reply) => {
    const params = matchParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ARENA_MATCH" });
    const body = gameResultInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send(gameResultValidationError(body.error));
    const learnerId = request.e4sSession!.user.id;
    if (await assessmentInProgress(pool, learnerId)) return reply.code(409).send({ code: "MINIGAME_LOCKED_DURING_ASSESSMENT" });
    return handle(reply, () => arena.submit(learnerId, params.data.matchId, {
      requestId: body.data.requestId, answers: body.data.answers, events: body.data.events
    }));
  });

  app.post("/api/v1/arena/matches/:matchId/forfeit", { preHandler: learnerOnly }, async (request, reply) => {
    const params = matchParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ARENA_MATCH" });
    return handle(reply, () => arena.forfeit(request.e4sSession!.user.id, params.data.matchId));
  });

  app.get("/api/v1/arena/leaderboard", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({
      level: z.enum(["B1", "B2", "C1"]).optional(), game: z.union([gameKey, z.literal("total")]).optional(), season: z.uuid().optional()
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ARENA_LEADERBOARD" });
    return handle(reply, () => arena.leaderboard(request.e4sSession!.user.id, {
      level: parsed.data.level, game: parsed.data.game, seasonId: parsed.data.season
    }));
  });

  app.get("/api/v1/manager/arena-season", { preHandler: managerOnly }, async (request, reply) =>
    handle(reply, () => arena.seasonSetting(request.e4sSession!.user.id)));

  app.put("/api/v1/manager/arena-season", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = z.object({ startsOn: isoDate, confirm: z.boolean().optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ARENA_SEASON" });
    return handle(reply, () => arena.saveSeasonStart(request.e4sSession!.user.id, parsed.data));
  });
}
