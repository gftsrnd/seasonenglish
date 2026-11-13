import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMonthlyContentRoutes } from "./monthly-routes.js";

const repository = vi.hoisted(() => ({ approveMonthlyDay: vi.fn(), getFrameworkContract: vi.fn(), getOverview: vi.fn() }));
const session = vi.hoisted(() => ({ role: "operator" }));
vi.mock("@e4s/database", () => ({ createRepositories: () => ({ monthlyContent: repository, aiRuns: {} }) }));
vi.mock("../identity/policy.js", () => ({
  createRoleGuard: () => async (request: { e4sSession?: unknown }) => { request.e4sSession = { user: { id: "operator-1" }, role: session.role }; }
}));

const FRAMEWORK = "8d8f4a4e-1f0a-4c55-9a43-0d6c2e0b7a11";
const choice = { prompt: "Chọn đáp án đúng: What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost" };
const playable = [
  { code: "objective", content: { text: "Talk about costs." } }, { code: "instruction", content: { steps: ["Đọc."] } },
  { code: "vocabulary", content: { items: [{ word: "cost" }] } }, { code: "grammar", content: { formula: "S + V" } }, { code: "pronunciation", content: { focus: "/k/" } },
  { code: "listening", content: { script: "The cost is high.", ...choice } }, { code: "reading", content: { text: "The cost is high.", ...choice } },
  { code: "writing", content: { prompt: "Viết.", answer: "The cost is high." } }, { code: "word_class", content: choice }, { code: "word_use", content: choice },
  { code: "speaking", content: { prompt: "Nói.", sample: "The cost is high." } }
];

async function api() {
  const app = Fastify();
  registerMonthlyContentRoutes(app, {} as never);
  await app.ready();
  return app;
}

describe("POST /days/:dayNumber/approve with acknowledgeSevereFindings (13/11)", () => {
  beforeEach(() => {
    session.role = "operator";
    repository.approveMonthlyDay.mockReset().mockResolvedValue(undefined);
    repository.getFrameworkContract.mockReset().mockResolvedValue({ cefr: "B2", daySpecs: [{ lessonNumber: 23, kind: "new" }, { lessonNumber: 24, kind: "review" }] });
  });

  it("keeps the ordinary approval unchanged without the flag", async () => {
    const app = await api();
    const response = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${FRAMEWORK}/days/23/approve`, payload: {} });
    expect(response.statusCode, response.body).toBe(204);
    expect(repository.approveMonthlyDay).toHaveBeenCalledWith("operator-1", FRAMEWORK, 23);
    expect(repository.getFrameworkContract).not.toHaveBeenCalled();
  });

  it("passes the override with a structural check of the day's kind", async () => {
    const app = await api();
    const response = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${FRAMEWORK}/days/23/approve`, payload: { acknowledgeSevereFindings: true } });
    expect(response.statusCode, response.body).toBe(204);
    const [actor, framework, day, options] = repository.approveMonthlyDay.mock.calls[0]!;
    expect([actor, framework, day, options.acknowledgeSevereFindings]).toEqual(["operator-1", FRAMEWORK, 23, true]);
    expect(options.integrityIssues(playable)).toEqual([]);
    expect(options.integrityIssues(playable.filter((part) => part.code !== "speaking"))).toEqual(["Nói: thiếu phần này"]);
  });

  it("refuses the override from any other role", async () => {
    session.role = "learner";
    const app = await api();
    const response = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${FRAMEWORK}/days/23/approve`, payload: { acknowledgeSevereFindings: true } });
    expect(response.statusCode).toBe(403);
    expect(repository.approveMonthlyDay).not.toHaveBeenCalled();
  });

  it("answers a refused override with each structural problem, not only a code (4175 A1 day 13)", async () => {
    const broken = playable.map((part) => part.code === "grammar" ? { ...part, content: { formula: "S + V", items: [
      { prompt: "Whose detail is this? It is ____ detail.", options: ["my", "mine", "me", "I"], answer: "his", explanation: "his + noun" }
    ] } } : part);
    repository.approveMonthlyDay.mockImplementation(async (_actor, _framework, _day, options: { integrityIssues(parts: unknown): string[] }) => {
      const issues = options.integrityIssues(broken);
      throw Object.assign(new Error(`Không thể duyệt: ${issues.join("; ")}.`), { statusCode: 409, code: "MONTHLY_DAY_INTEGRITY_BLOCKED" });
    });
    const app = await api();
    const response = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${FRAMEWORK}/days/23/approve`, payload: { acknowledgeSevereFindings: true } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "MONTHLY_DAY_INTEGRITY_BLOCKED", issues: [{ component: "grammar", item: 1, message: "Ngữ pháp: câu luyện 1 có đáp án không nằm trong các lựa chọn" }] });
  });

  it("lists the structural problems of saved drafts in the month overview", async () => {
    const broken = playable.map((part) => part.code === "reading" ? { ...part, content: { ...part.content, answer: "The budget" } } : part);
    repository.getOverview.mockResolvedValue({ frameworks: [{ lessons: [{ lessonNumber: 13, kind: "new", status: "failed", content: { parts: broken } }, { lessonNumber: 14, kind: "new", status: "draft", content: { parts: playable } }] }] });
    const app = await api();
    const response = await app.inject({ method: "GET", url: "/api/v1/content/months/2026-12" });
    expect(response.statusCode, response.body).toBe(200);
    const [blocked, fine] = response.json().frameworks[0].lessons;
    expect(blocked.integrityIssues).toEqual([{ component: "reading", message: "Đọc: có đáp án không nằm trong các lựa chọn" }]);
    expect(fine.integrityIssues).toBeUndefined();
  });
});
