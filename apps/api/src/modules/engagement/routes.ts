import type { GameDescriptor, GameKey } from "@e4s/contracts";
import { vocabularyOutputSchema, weeklyPracticeOutputSchema } from "@e4s/ai";
import { arenaEligible, scoreGameAttempt } from "@e4s/domain/engagement";
import { createRepositories } from "@e4s/database";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { AiTaskRunner } from "../coach/index.js";

const gameKey = z.enum(["scramble", "crossword", "eggs", "mario", "sort", "typing"]);
const answer = z.object({
  wordId: z.string().min(1), answer: z.string().max(200), attempts: z.number().int().min(1).max(20).optional(),
  usedHint: z.boolean().optional(), combo: z.number().int().min(1).max(5).optional()
});
const resultInput = z.object({
  requestId: z.uuid(), claimedScore: z.number().optional(), hintsUsed: z.number().int().min(0).max(100).optional(),
  answers: z.array(answer).min(1).max(30)
});

const GAME_DESCRIPTORS: ReadonlyArray<Omit<GameDescriptor, "best">> = [
  { key: "scramble", icon: "🔤", name: "Word scramble", description: "Các chữ cái bị xáo trộn, xếp lại thành đúng từ", goal: "Xếp đúng càng nhiều từ càng tốt (8 từ).", instructions: ["Đọc gợi ý (nghĩa tiếng Việt / định nghĩa) và các ô chữ cái bị xáo trộn.", "Bấm từng chữ cái theo đúng thứ tự (hoặc gõ phím) để xếp vào ô trống; ⌫ để bỏ chữ cuối.", "Xếp đủ chữ mà sai thì ô rung và xoá để xếp lại; mỗi từ được 2 lần sai.", "Bí quá thì bấm Gợi ý: mở chữ cái tiếp theo (trừ nửa điểm của từ đó)."], scoring: "+2 điểm mỗi từ xếp đúng ngay, +1 nếu dùng gợi ý hoặc sai một lần." },
  { key: "crossword", icon: "🧩", name: "Crosswords", description: "Điền lưới ô chữ theo gợi ý dọc / ngang", goal: "Điền đúng toàn bộ lưới ô chữ.", instructions: ["Mỗi số trên lưới ứng với một gợi ý Ngang → hoặc Dọc ↓ bên dưới.", "Bấm vào ô và gõ chữ; gõ xong tự nhảy sang ô kế, phím mũi tên để di chuyển.", "Bấm Kiểm tra: ô đúng xanh, ô sai đỏ, sửa rồi kiểm tra lại.", "Bí quá thì bấm Gợi ý 1 chữ (mỗi lần trừ 1 điểm)."], scoring: "Điểm = số từ trong lưới trừ số gợi ý đã dùng." },
  { key: "eggs", icon: "🧺", name: "Season catch", description: "Đưa rổ hứng vật phẩm theo mùa mang đúng từ: lá (thu), hoa (xuân), kem (hè), tuyết (đông), lì xì (Tết), quà (Giáng sinh)", goal: "Hứng đúng vật phẩm khớp với gợi ý, 10 lượt.", instructions: ["Gợi ý (nghĩa / định nghĩa) hiện to ở phía trên màn chơi.", "4 vật phẩm của mùa mang 4 từ rơi xuống; kéo chuột / chạm để di chuyển nhân vật (hoặc phím ← →) và đặt rổ dưới vật phẩm đúng.", "Hứng đúng: +1 điểm, lượt mới. Hứng nhầm: mất 1 ❤️ (tim vỡ); hết mạng thì khủng long xuất hiện. Tốc độ rơi theo mức CEFR: A1 ×1, mỗi mức cao hơn cộng thêm ×0,5 (C1 ×3).", "Để vật phẩm đúng rơi xuống đất cũng mất 1 ❤️. Hết 3 ❤️ là kết thúc."], scoring: "+1 điểm mỗi vật phẩm hứng đúng, tối đa 10." },
  { key: "mario", icon: "🍄", name: "Season-rio", description: "Qua từng cổng hộp quà (chắn kín, không nhảy qua được), ăn hết món khoái khẩu khổng lồ trong 10 giây rồi lấy cờ! Nhân vật đổi theo mùa: thỏ, dế, sóc, cánh cụt, én, tuần lộc", goal: "Trả lời đủ 8 hộp quà chắn đường, ăn hết món khổng lồ trong 10 giây và chạm cờ.", instructions: ["Chạy bằng phím ← →, nhảy bằng Space hoặc ↑ (điện thoại: 3 nút dưới màn hình).", "Mỗi hộp quà ? đứng trên một cột gỗ chắn ngang đường: chạm vào hộp hoặc cột → câu hỏi từ vựng, chọn 1 trong 4. Đúng: 🍄 (+1). Sai: mất 1 ❤️. Trả lời xong (đúng hay sai) cổng mới mở, nên không bỏ qua hộp nào được.", "Đường khúc khuỷu: có hộp đặt trên bục gỗ, có hộp trên bục cao phải leo bậc. Cuối màn là món ăn khoái khẩu KHỔNG LỒ của nhân vật: chạm vào là đồng hồ 10 giây chạy; mỗi câu đúng ăn 1 miếng (3 miếng), sai mất 1 ❤️; quá 10 giây món ăn bị hỏng → thua.", "Ăn hết món khổng lồ rồi chạm cờ để về đích. Hết 3 ❤️ hoặc để món ăn hỏng là thua."], scoring: "+1 điểm mỗi hộp quà đúng, +1 mỗi miếng ăn đúng ở Boss (tối đa 11)." },
  { key: "sort", icon: "🗂️", name: "Word sort", description: "Xếp từng từ vào đúng nhóm từ loại", goal: "Phân loại đúng càng nhiều từ càng tốt.", instructions: ["Mỗi lượt hiện một từ (kèm nghĩa) và các nhóm: Noun, Verb, Adjective, Adverb, Preposition, Phrase…", "Bấm vào nhóm bạn cho là đúng từ loại của từ đó.", "Đúng: +1 và chuỗi tăng; sai: app hiện nhóm đúng, chuỗi về 0.", "Mẹo: nhìn hậu tố (-tion → noun, -ly → adverb) và cách dùng trong cụm từ."], scoring: "+1 điểm mỗi từ đúng; chuỗi đúng liên tiếp dài nhất được ghi lại." },
  { key: "typing", icon: "⌨️", name: "Typing race", description: "Type đúng từ trước khi thanh thời gian cạn!", goal: "Gõ đúng 10 từ thật nhanh, giữ chuỗi combo càng dài càng nhiều điểm.", instructions: ["Mỗi từ có gợi ý: nghĩa tiếng Việt, định nghĩa tiếng Anh và hình minh hoạ (nếu có).", "Thanh thời gian chạy rất nhanh – gõ từ bằng bàn phím ảo (hoặc bàn phím thật) rồi bấm ↵; phím vừa gõ sáng lên.", "Đúng: +10 điểm × combo (combo tăng mỗi từ đúng liên tiếp, tối đa ×5). Sai hoặc hết giờ: combo về 1.", "Chữ đã gõ đúng hiện xanh, sai hiện đỏ – sửa ngay bằng ⌫."], scoring: "10 điểm × combo cho mỗi từ đúng; tối đa 10 từ." }
];

export function registerEngagementRoutes(app: FastifyInstance, pool: Pool, aiRunner?: AiTaskRunner): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/engagement/practice", { preHandler: learnerOnly }, async (request, reply) => {
    const view = await repositories.engagement.weeklyPractice(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "PRACTICE_CONTEXT_NOT_FOUND" });
  });

  app.post("/api/v1/engagement/practice/submit", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({ requestId: z.uuid(), text: z.string().trim().min(8).max(10_000) }).safeParse(request.body);
    if (!parsed.success || parsed.data.text.split(/\s+/).length < 8) return reply.code(400).send({ code: "PRACTICE_TOO_SHORT" });
    const learnerId = request.e4sSession!.user.id;
    const view = await repositories.engagement.submitWeeklyPractice({ learnerId, ...parsed.data });
    if (!view) return reply.code(409).send({ code: "PRACTICE_LOCKED" });
    if (!aiRunner || await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "weekly_practice_grading")) return view;
    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "weekly_practice_grading");
    if (!task) return view;
    try {
      const result = await aiRunner.runTask("weekly_practice_grading", {
        text: parsed.data.text, cefr: (await repositories.engagement.gameHub(learnerId))?.cefr ?? "A2",
        topic: view.topic, rubric: ["meaning", "vocabulary", "grammar"]
      }, { systemPrompt: task.prompt });
      const output = weeklyPracticeOutputSchema.safeParse(result.output);
      if (!output.success) return view;
      return await repositories.engagement.saveWeeklyPracticeGrade({
        learnerId, requestId: parsed.data.requestId, taskId: task.taskId, promptVersionId: task.promptVersionId,
        output: output.data, metadata: result.metadata
      }) ?? view;
    } catch (error) {
      request.log.warn({ code: safeAiErrorCode(error) }, "Weekly practice AI grading failed");
      return view;
    }
  });

  app.get("/api/v1/engagement/games", { preHandler: learnerOnly }, async (request, reply) => {
    const view = await gameHubView(repositories, request.e4sSession!.user.id, Boolean(aiRunner));
    return view ?? reply.code(404).send({ code: "GAME_SET_NOT_FOUND" });
  });

  app.post("/api/v1/engagement/games/word-set", {
    preHandler: learnerOnly, config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = z.object({ requestId: z.uuid(), topic: z.string().trim().min(2).max(200) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_VOCABULARY_TOPIC" });
    if (!aiRunner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const learnerId = request.e4sSession!.user.id;
    if (await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "vocabulary_generation")) {
      return await gameHubView(repositories, learnerId, true);
    }
    const current = await repositories.engagement.gameHub(learnerId);
    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "vocabulary_generation");
    if (!current || !task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await aiRunner.runTask("vocabulary_generation", {
        topic: parsed.data.topic, cefr: current.cefr, count: 15
      }, { systemPrompt: task.prompt });
      const output = vocabularyOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      await repositories.engagement.saveGeneratedWordSet({
        learnerId, requestId: parsed.data.requestId, taskId: task.taskId, promptVersionId: task.promptVersionId,
        output: output.data, metadata: result.metadata
      });
      return await gameHubView(repositories, learnerId, true);
    } catch (error) {
      request.log.warn({ code: safeAiErrorCode(error) }, "Vocabulary generation failed");
      return reply.code(aiErrorStatus(error)).send({ code: safeAiErrorCode(error) });
    }
  });

  app.delete("/api/v1/engagement/games/word-set", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    await repositories.engagement.retireGeneratedWordSet(learnerId);
    return await gameHubView(repositories, learnerId, Boolean(aiRunner))
      ?? reply.code(404).send({ code: "GAME_SET_NOT_FOUND" });
  });

  app.post("/api/v1/engagement/games/:game/results", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ game: gameKey }).safeParse(request.params);
    const body = resultInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_GAME_RESULT" });
    const learnerId = request.e4sSession!.user.id;
    const duplicate = await repositories.engagement.findGameResult(learnerId, body.data.requestId);
    if (duplicate) return duplicate;
    const hub = await repositories.engagement.gameHub(learnerId);
    if (!hub) return reply.code(404).send({ code: "GAME_SET_NOT_FOUND" });
    const scored = scoreGameAttempt(params.data.game, hub.wordSet.words, body.data.answers, { hintsUsed: body.data.hintsUsed });
    return repositories.engagement.saveGameResult({
      learnerId, setId: hub.wordSet.id, game: params.data.game, requestId: body.data.requestId,
      ...scored, details: {
        hintsUsed: body.data.hintsUsed,
        answers: body.data.answers.map(({ wordId, attempts, usedHint, combo }) => ({ wordId, attempts, usedHint, combo }))
      }
    });
  });

  app.get("/api/v1/engagement/arena", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const [arena, hub] = await Promise.all([repositories.engagement.arena(learnerId), repositories.engagement.gameHub(learnerId)]);
    if (!arena) return reply.code(404).send({ code: "ARENA_CONTEXT_NOT_FOUND" });
    const eligible = arenaEligible(arena.cefr);
    const own = arena.leaderboard.find((item) => item.learnerId === learnerId);
    return {
      eligible, requiredLevel: "B1", currentLevel: arena.cefr, learnerId, points: own?.points ?? 0,
      wordSetTopic: hub?.wordSet.topic ?? null,
      leaderboard: eligible ? arena.leaderboard.map((item, index) => ({ rank: index + 1, ...item })) : [],
      opponents: eligible ? arena.opponents : [],
      duels: eligible ? arena.duels.map((duel) => duelSummary(duel, learnerId)) : []
    };
  });

  app.post("/api/v1/engagement/duels", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({ opponentId: z.uuid(), game: gameKey.exclude(["crossword"]) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_DUEL" });
    const learnerId = request.e4sSession!.user.id;
    const arena = await repositories.engagement.arena(learnerId);
    if (!arena || !arenaEligible(arena.cefr)) return reply.code(403).send({ code: "ARENA_LEVEL_REQUIRED" });
    const id = await repositories.engagement.createDuel(learnerId, parsed.data.opponentId, parsed.data.game);
    if (!id) return reply.code(400).send({ code: "DUEL_OPPONENT_NOT_ELIGIBLE" });
    const view = await repositories.engagement.duel(learnerId, id);
    return reply.code(201).send(view);
  });

  app.get("/api/v1/engagement/duels/:duelId", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({ duelId: z.uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_DUEL_ID" });
    const view = await repositories.engagement.duel(request.e4sSession!.user.id, parsed.data.duelId);
    return view ?? reply.code(404).send({ code: "DUEL_NOT_FOUND" });
  });

  app.post("/api/v1/engagement/duels/:duelId/result", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ duelId: z.uuid() }).safeParse(request.params);
    const body = resultInput.omit({ claimedScore: true }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_DUEL_RESULT" });
    const learnerId = request.e4sSession!.user.id;
    const duel = await repositories.engagement.duel(learnerId, params.data.duelId);
    if (!duel) return reply.code(404).send({ code: "DUEL_NOT_FOUND" });
    if (duel.myScore) return reply.code(409).send({ code: "DUEL_ALREADY_PLAYED" });
    const scored = scoreGameAttempt(duel.game, duel.wordSet.words, body.data.answers, { hintsUsed: body.data.hintsUsed });
    const result = await repositories.engagement.saveGameResult({
      learnerId, setId: duel.wordSet.id, game: duel.game, requestId: body.data.requestId,
      ...scored, duelId: duel.id, details: { duel: true }
    });
    const saved = await repositories.engagement.saveDuelScore({ learnerId, duelId: duel.id, result, requestId: body.data.requestId });
    if (saved === "already_played") return reply.code(409).send({ code: "DUEL_ALREADY_PLAYED" });
    return saved === null ? reply.code(404).send({ code: "DUEL_NOT_FOUND" }) : { ...saved, result };
  });

  app.get("/api/v1/engagement/rewards/:mode", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({ mode: z.enum(["preview", "done"]) }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_REWARD_MODE" });
    const view = await repositories.engagement.reward(request.e4sSession!.user.id, parsed.data.mode);
    return view ?? reply.code(403).send({ code: "REWARD_NOT_READY" });
  });

  app.get("/api/v1/engagement/survey", { preHandler: learnerOnly }, async (request) =>
    repositories.engagement.survey(request.e4sSession!.user.id));

  app.post("/api/v1/engagement/survey", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = z.object({
      rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2_000),
      studyTime: z.enum(["work", "outside", "both"])
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_SURVEY" });
    const view = await repositories.engagement.submitSurvey(request.e4sSession!.user.id, parsed.data);
    return view ?? reply.code(409).send({ code: "SURVEY_ALREADY_SUBMITTED" });
  });
}

async function gameHubView(repositories: ReturnType<typeof createRepositories>, learnerId: string, aiAvailable: boolean) {
  const [hub, arena] = await Promise.all([repositories.engagement.gameHub(learnerId), repositories.engagement.arena(learnerId)]);
  if (!hub) return null;
  const own = arena?.leaderboard.find((item) => item.learnerId === learnerId);
  return {
    cefr: hub.cefr, aiAvailable, wordSet: hub.wordSet,
    games: GAME_DESCRIPTORS.map((game) => ({ ...game, best: hub.best[game.key] ?? null })),
    arena: { eligible: arenaEligible(hub.cefr), requiredLevel: "B1" as const, points: own?.points ?? 0,
      pendingDuels: arena?.duels.filter((duel) => duel.state === "open" && !duel.scores[learnerId]).length ?? 0 }
  };
}

function safeAiErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && error.code.startsWith("AI_")) return error.code;
  return "AI_PROVIDER_FAILED";
}

function aiErrorStatus(error: unknown): 429 | 502 | 503 | 504 {
  const code = safeAiErrorCode(error);
  if (code === "AI_PROVIDER_RATE_LIMIT") return 429;
  if (code === "AI_TIMEOUT") return 504;
  if (code === "AI_PROVIDER_NOT_CONFIGURED" || code === "AI_PROMPT_NOT_FOUND") return 503;
  return 502;
}

function duelSummary(duel: {
  id: string; game: GameKey; challengerId: string; opponentId: string; challengerName: string; opponentName: string;
  state: string; wordSetTopic: string; scores: Record<string, { score: number; maxScore: number }>; createdAt: Date;
}, learnerId: string) {
  const opponentId = duel.challengerId === learnerId ? duel.opponentId : duel.challengerId;
  const opponentName = duel.challengerId === learnerId ? duel.opponentName : duel.challengerName;
  const myScore = duel.scores[learnerId] ?? null;
  const opponentScore = duel.scores[opponentId] ?? null;
  const outcome = !myScore ? "play" : !opponentScore ? "waiting"
    : myScore.score / Math.max(1, myScore.maxScore) === opponentScore.score / Math.max(1, opponentScore.maxScore) ? "draw"
      : myScore.score / Math.max(1, myScore.maxScore) > opponentScore.score / Math.max(1, opponentScore.maxScore) ? "win" : "lose";
  return { id: duel.id, game: duel.game, opponent: { id: opponentId, displayName: opponentName }, state: duel.state,
    myScore, opponentScore, outcome, challengedByMe: duel.challengerId === learnerId,
    wordSetTopic: duel.wordSetTopic, createdAt: duel.createdAt.toISOString() };
}
