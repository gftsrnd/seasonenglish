import type { GameDescriptor, GameKey, GameTopicModeration } from "@e4s/contracts";
import { randomUUID } from "node:crypto";
import { vocabularyOutputSchema, weeklyPracticeOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { arenaEligible, scoreGameAttempt } from "@e4s/domain/engagement";
import { validateWeeklyPractice } from "@e4s/domain/progression";
import { createRepositories } from "@e4s/database";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { ContentMediaService } from "../media/index.js";

const gameKey = z.enum(["scramble", "crossword", "eggs", "mario", "sort", "typing"]);
const answer = z.object({
  wordId: z.string().min(1), answer: z.string().max(200), attempts: z.number().int().min(1).max(20).optional(),
  usedHint: z.boolean().optional(), combo: z.number().int().min(1).max(5).optional()
});
const gameEvent = z.object({
  type: z.enum(["wrong_catch", "timeout"]), wordId: z.string().min(1), answer: z.string().max(200)
});
const resultInput = z.object({
  requestId: z.uuid(), hintsUsed: z.number().int().min(0).max(100).optional(),
  answers: z.array(answer).min(1).max(30), events: z.array(gameEvent).max(60).optional()
});
const practiceAppealParams = z.object({ submissionId: z.uuid() });
const practiceAppealInput = z.object({ reason: z.string().trim().min(5).max(2_000) });

const GAME_DESCRIPTORS: ReadonlyArray<Omit<GameDescriptor, "best">> = [
  { key: "scramble", icon: "🔤", name: "Word scramble", description: "Các chữ cái bị xáo trộn, xếp lại thành đúng từ", goal: "Xếp đúng càng nhiều từ càng tốt (8 từ).", instructions: ["Đọc gợi ý (nghĩa tiếng Việt / định nghĩa) và các ô chữ cái bị xáo trộn.", "Bấm từng chữ cái theo đúng thứ tự (hoặc gõ phím) để xếp vào ô trống; ⌫ để bỏ chữ cuối.", "Xếp đủ chữ mà sai thì ô rung và xoá để xếp lại; mỗi từ được 2 lần sai.", "Bí quá thì bấm Gợi ý: mở chữ cái tiếp theo (trừ nửa điểm của từ đó)."], scoring: "+2 điểm mỗi từ xếp đúng ngay, +1 nếu dùng gợi ý hoặc sai một lần." },
  { key: "crossword", icon: "🧩", name: "Crosswords", description: "Điền lưới ô chữ theo gợi ý dọc / ngang", goal: "Điền đúng toàn bộ lưới ô chữ.", instructions: ["Mỗi số trên lưới ứng với một gợi ý Ngang → hoặc Dọc ↓ bên dưới.", "Bấm vào ô và gõ chữ; gõ xong tự nhảy sang ô kế, phím mũi tên để di chuyển.", "Bấm Kiểm tra: ô đúng xanh, ô sai đỏ, sửa rồi kiểm tra lại.", "Bí quá thì bấm Gợi ý 1 chữ (mỗi lần trừ 1 điểm)."], scoring: "Điểm = số từ trong lưới trừ số gợi ý đã dùng." },
  { key: "eggs", icon: "🧺", name: "Season catch", description: "Đưa rổ hứng vật phẩm theo mùa mang đúng từ: lá (thu), hoa (xuân), kem (hè), tuyết (đông), lì xì (Tết), quà (Giáng sinh)", goal: "Hứng đúng vật phẩm khớp với gợi ý, 10 lượt.", instructions: ["Gợi ý (nghĩa / định nghĩa) hiện to ở phía trên màn chơi.", "4 vật phẩm của mùa mang 4 từ rơi xuống; kéo chuột / chạm để di chuyển nhân vật (hoặc phím ← →) và đặt rổ dưới vật phẩm đúng.", "Hứng đúng: +1 điểm, lượt mới. Hứng nhầm: mất 1 ❤️ (tim vỡ); hết mạng thì khủng long xuất hiện. Tốc độ rơi theo mức CEFR: A1 ×1, mỗi mức cao hơn cộng thêm ×0,5 (C1 ×3).", "Để vật phẩm đúng rơi xuống đất cũng mất 1 ❤️. Hết 3 ❤️ là kết thúc."], scoring: "+1 điểm mỗi vật phẩm hứng đúng, tối đa 10." },
  { key: "mario", icon: "🍄", name: "Season-rio", description: "Qua từng cổng hộp quà (chắn kín, không nhảy qua được), ăn hết món khoái khẩu khổng lồ trong 10 giây rồi lấy cờ! Nhân vật đổi theo mùa: thỏ, dế, sóc, cánh cụt, én, tuần lộc", goal: "Trả lời đủ 8 hộp quà chắn đường, ăn hết món khổng lồ trong 10 giây và chạm cờ.", instructions: ["Chạy bằng phím ← →, nhảy bằng Space hoặc ↑ (điện thoại: 3 nút dưới màn hình).", "Mỗi hộp quà ? đứng trên một cột gỗ chắn ngang đường: chạm vào hộp hoặc cột → câu hỏi từ vựng, chọn 1 trong 4. Đúng: 🍄 (+1). Sai: mất 1 ❤️. Trả lời xong (đúng hay sai) cổng mới mở, nên không bỏ qua hộp nào được.", "Đường khúc khuỷu: có hộp đặt trên bục gỗ, có hộp trên bục cao phải leo bậc. Cuối màn là món ăn khoái khẩu KHỔNG LỒ của nhân vật: chạm vào là đồng hồ 10 giây chạy; mỗi câu đúng ăn 1 miếng (3 miếng), sai mất 1 ❤️; quá 10 giây món ăn bị hỏng → thua.", "Ăn hết món khổng lồ rồi chạm cờ để về đích. Hết 3 ❤️ hoặc để món ăn hỏng là thua."], scoring: "+1 điểm mỗi hộp quà đúng, +1 mỗi miếng ăn đúng ở Boss (tối đa 11)." },
  { key: "sort", icon: "🗂️", name: "Word sort", description: "Xếp từng từ vào đúng nhóm từ loại", goal: "Phân loại đúng càng nhiều từ càng tốt.", instructions: ["Mỗi lượt hiện một từ (kèm nghĩa) và các nhóm: Noun, Verb, Adjective, Adverb, Preposition, Phrase…", "Bấm vào nhóm bạn cho là đúng từ loại của từ đó.", "Đúng: +1 và chuỗi tăng; sai: app hiện nhóm đúng, chuỗi về 0.", "Mẹo: nhìn hậu tố (-tion → noun, -ly → adverb) và cách dùng trong cụm từ."], scoring: "+1 điểm mỗi từ đúng; chuỗi đúng liên tiếp dài nhất được ghi lại." },
  { key: "typing", icon: "⌨️", name: "Typing race", description: "Type đúng từ trước khi thanh thời gian cạn!", goal: "Gõ đúng 10 từ thật nhanh, giữ chuỗi combo càng dài càng nhiều điểm.", instructions: ["Mỗi từ có gợi ý: nghĩa tiếng Việt, định nghĩa tiếng Anh và hình minh hoạ (nếu có).", "Thanh thời gian chạy rất nhanh – gõ từ bằng bàn phím ảo (hoặc bàn phím thật) rồi bấm ↵; phím vừa gõ sáng lên.", "Đúng: +10 điểm × combo (combo tăng mỗi từ đúng liên tiếp, tối đa ×5). Sai hoặc hết giờ: combo về 1.", "Chữ đã gõ đúng hiện xanh, sai hiện đỏ – sửa ngay bằng ⌫."], scoring: "10 điểm × combo cho mỗi từ đúng; tối đa 10 từ." }
];

export function registerEngagementRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  mediaService?: ContentMediaService
): void {
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
    const requirements = await repositories.engagement.weeklyPracticeRequirements(learnerId);
    if (!requirements) return reply.code(409).send({ code: "PRACTICE_LOCKED" });
    const validation = validateWeeklyPractice({
      cefr: requirements.cefr,
      text: parsed.data.text,
      weeklyVocabulary: requirements.vocabulary
    });
    if (!validation.valid) return reply.code(422).send({ code: "PRACTICE_FORMAT_INVALID", errors: validation.errors });
    const view = await repositories.engagement.submitWeeklyPractice({ learnerId, ...parsed.data });
    if (!view) return reply.code(409).send({ code: "PRACTICE_LOCKED" });
    if (!aiRunner || await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "weekly_practice_grading")) return view;
    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "weekly_practice_grading");
    if (!task) return view;
    try {
      const result = await aiRunner.runTask("weekly_practice_grading", {
        text: parsed.data.text, cefr: requirements.cefr,
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

  app.post("/api/v1/engagement/practice/:submissionId/appeals", { preHandler: learnerOnly }, async (request, reply) => {
    const params = practiceAppealParams.safeParse(request.params);
    const body = practiceAppealInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_PRACTICE_APPEAL" });
    try {
      const view = await repositories.engagement.appealWeeklyPractice({
        learnerId: request.e4sSession!.user.id,
        submissionId: params.data.submissionId,
        reason: body.data.reason
      });
      return view ?? reply.code(409).send({ code: "PRACTICE_APPEAL_NOT_AVAILABLE" });
    } catch (error) {
      if (error instanceof Error && error.message === "PRACTICE_APPEAL_EXISTS") {
        return reply.code(409).send({ code: "PRACTICE_APPEAL_EXISTS" });
      }
      throw error;
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
    const learnerId = request.e4sSession!.user.id;
    const recentStrikes = await pool.query<{ count: string; blocked_until: Date | null }>(
      `select count(*)::text as count, max(created_at + interval '30 minutes') as blocked_until
       from topic_strikes where learner_id = $1 and created_at > now() - interval '30 minutes'`,
      [learnerId]
    );
    const strikeCount = Number(recentStrikes.rows[0]?.count ?? 0);
    if (strikeCount >= 3) return reply.code(429).send({
      code: "TOPIC_CREATION_TEMPORARILY_LOCKED",
      moderation: { state: "reported", strike: 3, message: "Tạo bộ từ được mở lại sau 30 phút; người vận hành đã nhận được báo cáo." } satisfies GameTopicModeration
    });
    const topicValidation = validateVocabularyTopic(parsed.data.topic);
    if (topicValidation) {
      if (!topicValidation.strike) {
        return reply.code(422).send({
          code: "VOCABULARY_TOPIC_REJECTED",
          strikes: strikeCount,
          moderation: { state: "invalid", message: topicValidation.message } satisfies GameTopicModeration
        });
      }
      const nextStrike = strikeCount + 1;
      await pool.query(
        "insert into topic_strikes (id, learner_id, topic, reason) values ($1, $2, $3, $4)",
        [randomUUID(), learnerId, parsed.data.topic, topicValidation.message]
      );
      let reportId: string | undefined;
      if (nextStrike >= 3) {
        const report = await pool.query<{ id: string }>(
        `insert into topic_reports (id, learner_id, topic, reason, strike_count)
         values ($1, $2, $3, $4, $5) returning id`,
          [randomUUID(), learnerId, parsed.data.topic, topicValidation.message, nextStrike]
        );
        reportId = report.rows[0]?.id;
      }
      const moderation: GameTopicModeration = nextStrike >= 3
        ? { state: "reported", strike: 3, ...(reportId ? { reportId } : {}), message: "Đã báo người vận hành sau ba lần vi phạm." }
        : isUnsafeTopic(parsed.data.topic)
          ? { state: "unsafe", strike: Math.min(3, nextStrike) as 1 | 2 | 3, message: topicValidation.message }
          : { state: "invalid", message: topicValidation.message };
      return reply.code(422).send({ code: "VOCABULARY_TOPIC_REJECTED", strikes: nextStrike, moderation });
    }
    if (!aiRunner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    if (await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "vocabulary_generation")) {
      return await gameHubView(repositories, learnerId, true);
    }
    const current = await repositories.engagement.gameHub(learnerId);
    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "vocabulary_generation");
    if (!current || !task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await aiRunner.runTask("vocabulary_generation", {
        topic: parsed.data.topic, cefr: current.cefr, count: 20
      }, { systemPrompt: task.prompt });
      const output = vocabularyOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID", moderation: { state: "ai_rejected", message: "AI không trả về được bộ từ hợp lệ." } satisfies GameTopicModeration });
      await repositories.engagement.saveGeneratedWordSet({
        learnerId, requestId: parsed.data.requestId, taskId: task.taskId, promptVersionId: task.promptVersionId,
        output: {
          topic: output.data.topic,
          words: output.data.words.map(({ imageQuery, ...word }) => ({ ...word, ...(imageQuery ? { imageQuery } : {}) })),
          distractors: output.data.distractors.map(({ imageQuery, ...word }) => ({ ...word, ...(imageQuery ? { imageQuery } : {}) }))
        },
        metadata: result.metadata
      });
      return { ...(await gameHubView(repositories, learnerId, true)), topicModeration: { state: "success", topic: output.data.topic } satisfies GameTopicModeration };
    } catch (error) {
      request.log.warn({ code: safeAiErrorCode(error) }, "Vocabulary generation failed");
      return reply.code(aiErrorStatus(error)).send({ code: safeAiErrorCode(error), moderation: { state: "error", message: "Không tạo được bộ từ. Vui lòng thử lại." } satisfies GameTopicModeration });
    }
  });

  app.delete("/api/v1/engagement/games/word-set", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    await repositories.engagement.retireGeneratedWordSet(learnerId);
    return await gameHubView(repositories, learnerId, Boolean(aiRunner))
      ?? reply.code(404).send({ code: "GAME_SET_NOT_FOUND" });
  });

  app.get("/api/v1/engagement/game-sets/:setId/words/:wordId/image", {
    preHandler: learnerOnly, config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const params = z.object({ setId: z.uuid(), wordId: z.string().min(1).max(160) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_GAME_WORD" });
    const learnerId = request.e4sSession!.user.id;
    const word = await repositories.engagement.gameWord(learnerId, params.data.setId, params.data.wordId);
    if (!word) return reply.code(404).send({ code: "GAME_WORD_NOT_FOUND" });
    if (!mediaService) return { status: "unavailable" };
    try {
      return await mediaService.resolveForUser(learnerId, {
        term: word.english,
        partOfSpeech: word.partOfSpeech,
        ...(word.imageQuery ? { imageQuery: word.imageQuery } : {}),
        ...(word.imageUrl ? { explicitImageUrl: word.imageUrl } : {}),
        ...(word.imageAttribution ? { explicitAttribution: word.imageAttribution } : {})
      });
    } catch {
      return { status: "unavailable" };
    }
  });

  app.post("/api/v1/engagement/games/:game/results", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ game: gameKey }).safeParse(request.params);
    const body = resultInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_GAME_RESULT" });
    const learnerId = request.e4sSession!.user.id;
    const duplicate = await repositories.engagement.findGameResult(learnerId, body.data.requestId);
    if (duplicate) return duplicate;
    const hub = await repositories.engagement.gameHub(learnerId);
    if (!hub?.wordSet) return reply.code(404).send({ code: "GAME_SET_NOT_FOUND" });
    const scored = scoreGameAttempt(params.data.game, hub.wordSet.words, body.data.answers, { hintsUsed: body.data.hintsUsed });
    return repositories.engagement.saveGameResult({
      learnerId, setId: hub.wordSet.id, game: params.data.game, requestId: body.data.requestId,
      ...scored, details: {
        hintsUsed: body.data.hintsUsed,
        answers: body.data.answers.map(({ wordId, attempts, usedHint, combo }) => ({ wordId, attempts, usedHint, combo })),
        events: gameEvidence(hub.wordSet.words, body.data.answers, body.data.events ?? [])
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
      wordSetTopic: hub?.wordSet?.topic ?? null,
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
    const body = resultInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_DUEL_RESULT" });
    const learnerId = request.e4sSession!.user.id;
    const duel = await repositories.engagement.duel(learnerId, params.data.duelId);
    if (!duel) return reply.code(404).send({ code: "DUEL_NOT_FOUND" });
    const duplicate = await pool.query<{ duel_id: string | null }>(
      "select duel_id from game_results where learner_id = $1 and request_key = $2 limit 1",
      [learnerId, body.data.requestId]
    );
    if (duplicate.rows[0]) {
      if (duplicate.rows[0].duel_id !== params.data.duelId) return reply.code(409).send({ code: "DUEL_REQUEST_ID_REUSED" });
      const result = await repositories.engagement.findGameResult(learnerId, body.data.requestId);
      return result ? { ...duel, result } : reply.code(409).send({ code: "DUEL_RESULT_NOT_AVAILABLE" });
    }
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

function validateVocabularyTopic(topic: string): { message: string; strike: boolean } | null {
  const normalized = topic.normalize("NFKC").trim();
  const letters = normalized.match(/\p{L}/gu)?.join("") ?? "";
  if (normalized.length > 70) return { message: "Chủ đề tối đa 70 ký tự.", strike: false };
  if (normalized.split(/\s+/u).filter(Boolean).length > 7) return { message: "Chủ đề tối đa 7 từ.", strike: false };
  if (letters.length < 2) return { message: "Chủ đề không có đủ từ có nghĩa.", strike: false };
  if (/[^\p{L}\p{N}\s&+,'’().\-/]/u.test(normalized)) return { message: "Chủ đề chứa ký tự không phù hợp.", strike: false };
  const protectedGroup = /\b(?:người đồng tính|người chuyển giới|người khuyết tật|dân tộc|tôn giáo|gay|lesbian|transgender|disabled people|ethnic group|religious group)\b/iu;
  if (protectedGroup.test(normalized)) {
    return { message: "Hãy chọn một chủ đề học tập hoặc công việc cụ thể hơn.", strike: false };
  }
  if (/(.)\1{5,}/iu.test(normalized)
    || /(?:asdf|qwer|zxcv|hjkl)/iu.test(normalized)
    || !/[aeiouyàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữự]/iu.test(letters)) {
    return { message: "Chủ đề có dấu hiệu là chuỗi vô nghĩa.", strike: true };
  }
  const blocked = /\b(?:porn|sex|nude|kill|murder|suicide|ma túy|thuốc phiện|khiêu dâm|giết người)\b/iu;
  if (blocked.test(normalized)) return { message: "Chủ đề không phù hợp với môi trường học tập.", strike: true };
  return null;
}

function isUnsafeTopic(topic: string): boolean {
  return /\b(?:porn|sex|nude|kill|murder|suicide|ma túy|thuốc phiện|khiêu dâm|giết người)\b/iu.test(topic.normalize("NFKC").trim());
}

function gameEvidence(
  words: ReadonlyArray<{ id: string; english: string }>,
  answers: ReadonlyArray<{ wordId: string; answer: string; attempts?: number | undefined; usedHint?: boolean | undefined; combo?: number | undefined }>,
  events: ReadonlyArray<{ type: "wrong_catch" | "timeout"; wordId: string; answer: string }>
) {
  const knownWordIds = new Set(words.map((word) => word.id));
  const observed = events.filter((event) => knownWordIds.has(event.wordId));
  const scored = answers
    .filter((answer) => knownWordIds.has(answer.wordId))
    .map(({ wordId, answer, attempts, usedHint, combo }) => ({ type: "scored_answer" as const, wordId, answer, attempts, usedHint, combo }));
  return [...observed, ...scored];
}

async function gameHubView(repositories: ReturnType<typeof createRepositories>, learnerId: string, aiAvailable: boolean) {
  const [hub, arena] = await Promise.all([repositories.engagement.gameHub(learnerId), repositories.engagement.arena(learnerId)]);
  if (!hub) return null;
  const own = arena?.leaderboard.find((item) => item.learnerId === learnerId);
  return {
    cefr: hub.cefr, aiAvailable, topicModeration: { state: "empty" } satisfies GameTopicModeration, wordSet: hub.wordSet,
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
