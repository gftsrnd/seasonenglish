import { randomUUID } from "node:crypto";
import { migrateDatabase, resetPublicSchema } from "@e4s/database";
import { issueSessionToken, sessionTokenHash } from "@e4s/domain/identity";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
if (new URL(databaseUrl).pathname !== "/e4s_test") throw new Error("Expected a disposable test database.");
const pool = new Pool({ connectionString: databaseUrl });
const app = buildApi({ pool, secureCookies: false });
const managerPath = "/api/v1/manager/monthly-surveys";
const learnerPath = "/api/v1/learner/monthly-surveys";
const organization = randomUUID();
const otherOrganization = randomUUID();
const cookies = { manager: "", learner: "", peer: "", operator: "", purgeLearner: "", otherManager: "", otherLearner: "" };

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await resetPublicSchema(client);
    await migrateDatabase(client);
  } finally {
    client.release();
  }
  await pool.query(
    "insert into organizations (id, name, slug) values ($1, 'Survey org', 'survey-test'), ($2, 'Other org', 'survey-other')",
    [organization, otherOrganization]
  );
  await pool.query(
    "insert into organization_settings (organization_id, configuration) values ($1, '{\"simulatedSystemDate\":\"2030-03-10\"}'::jsonb)",
    [organization]
  );
  for (const [actor, org, role] of [
    ["manager", organization, "manager"], ["learner", organization, "learner"], ["peer", organization, "learner"],
    ["operator", organization, "operator"], ["purgeLearner", organization, "learner"],
    ["otherManager", otherOrganization, "manager"], ["otherLearner", otherOrganization, "learner"]
  ] as const) {
    const userId = randomUUID();
    const token = issueSessionToken();
    await pool.query("insert into users (id, organization_id, role, display_name) values ($1, $2, $3, $4)", [userId, org, role, actor]);
    await pool.query("insert into sessions (id, user_id, token_hash, expires_at) values ($1, $2, $3, now() + interval '1 hour')", [
      randomUUID(), userId, sessionTokenHash(token)
    ]);
    cookies[actor] = `e4s_session=${token}`;
  }
}, 30_000);

beforeEach(async () => {
  await pool.query("truncate monthly_survey_submissions, monthly_survey_forms");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function request(method: "GET" | "POST" | "PUT" | "DELETE", url: string, actor?: keyof typeof cookies, payload?: object) {
  return app.inject({ method, url, ...(actor ? { headers: { cookie: cookies[actor] } } : {}), ...(payload ? { payload } : {}) });
}

const questions = [
  { kind: "rating", prompt: "Mức độ hữu ích?", required: true },
  { kind: "single_choice", prompt: "Bạn học khi nào?", required: true, options: ["Trong giờ", "Ngoài giờ"] },
  { kind: "text", prompt: "Góp ý thêm", required: false }
];
const answers = [
  { questionIndex: 0, value: 4 },
  { questionIndex: 1, value: "Ngoài giờ" },
  { questionIndex: 2, value: "Bài nghe hữu ích." }
];
const month = "2030-03";
const monthPath = `${managerPath}/${month}`;

async function publishInitial(title = "Phản hồi tháng 3") {
  const created = await request("PUT", `${monthPath}/draft`, "manager", { baseRevision: 0, version: null, title, questions });
  expect(created.statusCode).toBe(200);
  expect((await request("POST", `${monthPath}/publish`, "manager", { revision: 1, version: 1 })).statusCode).toBe(200);
}

it("notifies learners once when the current month's published survey opens", async () => {
  await publishInitial();
  const inboxPath = "/api/v1/me/notifications";
  for (const actor of ["learner", "learner", "otherLearner", "manager"] as const) {
    const response = await request("GET", inboxPath, actor);
    expect(response.statusCode).toBe(200);
    expect(response.json().items.filter((item: { kind: string }) => item.kind === "monthly_survey_open"))
      .toMatchObject(actor === "learner" ? [{ kind: "monthly_survey_open", context: month }] : []);
  }
});

it("keeps drafts private, rejects invalid publication, and guards concurrent updates", async () => {
  const initial = await request("GET", managerPath, "manager");
  expect(initial.statusCode).toBe(200);
  expect(initial.json()).toMatchObject({ currentMonth: month, month, draft: null, publishedForms: [], submissions: [] });

  const incomplete = await request("PUT", `${monthPath}/draft`, "manager", { baseRevision: 0, version: null, title: "", questions: [] });
  expect(incomplete.statusCode).toBe(200);
  expect(incomplete.json()).toMatchObject({ revision: 1, version: 1 });
  const invalid = await request("POST", `${monthPath}/publish`, "manager", { revision: 1, version: 1 });
  expect(invalid.statusCode).toBe(400);
  expect((await request("GET", learnerPath, "learner")).json().surveys).toEqual([]);

  const draft = { baseRevision: 0, version: 1, title: "Phản hồi tháng 3", questions };
  const concurrent = await Promise.all([
    request("PUT", `${monthPath}/draft`, "manager", draft),
    request("PUT", `${monthPath}/draft`, "manager", draft)
  ]);
  expect(concurrent.map(item => item.statusCode).sort()).toEqual([200, 409]);
  expect((await request("POST", `${monthPath}/publish`, "manager", { revision: 1, version: 1 })).statusCode).toBe(409);
  expect((await request("POST", `${monthPath}/publish`, "manager", { revision: 1, version: 2 })).statusCode).toBe(200);
  await expect(pool.query("update monthly_survey_forms set title = 'Rewritten' where organization_id = $1 and month = $2", [organization, month]))
    .rejects.toThrow("Published monthly survey revisions are immutable");
  expect((await request("GET", learnerPath, "learner")).json().surveys[0].form).toMatchObject({ month, revision: 1, title: "Phản hồi tháng 3", questions });
});

it("records a learner response once per month, validates choices, and preserves the original published questions", async () => {
  await publishInitial();
  const submitPath = `${learnerPath}/${month}/submissions`;
  for (const invalid of [
    [{ questionIndex: 0, value: 6 }, answers[1]],
    [answers[0], { questionIndex: 1, value: "Không có lựa chọn này" }],
    [answers[0], answers[0], answers[1]],
    [answers[0], answers[1], { questionIndex: 3, value: "Ngoài biểu mẫu" }],
    [answers[0]]
  ]) {
    expect((await request("POST", submitPath, "learner", { revision: 1, answers: invalid })).statusCode).toBe(400);
  }
  const submissions = await Promise.all([
    request("POST", submitPath, "learner", { revision: 1, answers }),
    request("POST", submitPath, "learner", { revision: 1, answers })
  ]);
  expect(submissions.map(item => item.statusCode).sort()).toEqual([201, 409]);

  const revisedQuestions = [{ ...questions[0], prompt: "Điểm cho trải nghiệm mới?" }, ...questions.slice(1)];
  expect((await request("PUT", `${monthPath}/draft`, "manager", { baseRevision: 1, version: null, title: "Câu hỏi đã sửa", questions: revisedQuestions })).statusCode).toBe(200);
  expect((await request("POST", `${monthPath}/publish`, "manager", { revision: 2, version: 1 })).statusCode).toBe(200);
  expect((await request("POST", submitPath, "peer", { revision: 1, answers })).json()).toMatchObject({ code: "MONTHLY_SURVEY_REVISION_CONFLICT" });
  expect((await request("POST", submitPath, "learner", { revision: 2, answers })).json()).toMatchObject({ code: "MONTHLY_SURVEY_ALREADY_SUBMITTED" });

  const history = (await request("GET", learnerPath, "learner")).json();
  expect(history.surveys).toEqual([{
    form: expect.objectContaining({ month, revision: 1, questions }),
    submission: expect.objectContaining({ revision: 1, answers, submittedAt: expect.any(String) })
  }]);
  const peer = (await request("GET", learnerPath, "peer")).json();
  expect(peer.surveys).toEqual([{ form: expect.objectContaining({ revision: 2, questions: revisedQuestions }), submission: null }]);
  const report = (await request("GET", `${managerPath}?month=${month}`, "manager")).json();
  expect(report.publishedForms).toMatchObject([{ revision: 2, questions: revisedQuestions }, { revision: 1, questions }]);
  expect(report.submissions).toMatchObject([{ learnerName: "learner", revision: 1, answers, submittedAt: expect.any(String) }]);
});

it("copies the latest earlier published form as a draft and scopes reads and writes to the actor organization", async () => {
  await publishInitial("Câu hỏi đã sửa");
  const april = `${managerPath}/2030-04`;
  const copy = await request("POST", `${april}/copy-previous`, "manager", { baseRevision: 0 });
  expect(copy.statusCode).toBe(200);
  expect(copy.json()).toMatchObject({ month: "2030-04", revision: 1, title: "Câu hỏi đã sửa" });
  expect((await request("POST", `${april}/copy-previous`, "manager", { baseRevision: 0 })).statusCode).toBe(409);
  expect((await request("POST", `${april}/publish`, "manager", { revision: 1, version: 1 })).statusCode).toBe(200);
  expect((await request("GET", learnerPath, "learner")).json().surveys.map((item: { form: { month: string } }) => item.form.month)).toEqual([month]);
  expect((await request("POST", `${learnerPath}/2030-04/submissions`, "learner", { revision: 1, answers })).statusCode).toBe(404);
  const other = (await request("GET", `${managerPath}?month=${month}`, "otherManager")).json();
  expect(other).toMatchObject({ publishedForms: [], draft: null, submissions: [] });
  expect((await request("GET", learnerPath, "otherLearner")).json().surveys).toEqual([]);
  expect((await request("POST", `${learnerPath}/${month}/submissions`, "otherLearner", { revision: 2, answers })).statusCode).toBe(404);
  expect((await request("GET", managerPath, "learner")).statusCode).toBe(403);
  expect((await request("GET", managerPath, "operator")).statusCode).toBe(403);
  expect((await request("POST", `${monthPath}/publish`, "operator", { revision: 1, version: 1 })).statusCode).toBe(403);
  expect((await request("GET", learnerPath)).statusCode).toBe(401);
  expect((await request("GET", `${managerPath}?month=2030-13`, "manager")).statusCode).toBe(400);
});


it("scrubs monthly answers on account purge while keeping the anonymized submission count", async () => {
  await publishInitial();
  expect((await request("POST", `${learnerPath}/${month}/submissions`, "purgeLearner", { revision: 1, answers })).statusCode).toBe(201);
  const deleted = await pool.query<{ id: string }>(
    "update users set status = 'deleted' where organization_id = $1 and display_name = 'purgeLearner' returning id",
    [organization]
  );
  const accountId = deleted.rows[0]!.id;
  const purgePath = `/api/v1/manager/trash/${accountId}`;
  const confirmation = await request("POST", `${purgePath}/purge-confirmation`, "manager", {});
  expect(confirmation.statusCode).toBe(200);
  expect((await request("DELETE", purgePath, "manager", {
    confirmationToken: confirmation.json().token, confirmationPhrase: confirmation.json().confirmationPhrase
  })).statusCode).toBe(204);

  const report = await request("GET", managerPath, "manager");
  expect(report.json().submissions).toEqual([
    expect.objectContaining({ learnerName: "Người học đã xoá", revision: 1, answers: [] })
  ]);
  expect((await request("GET", learnerPath, "purgeLearner")).statusCode).toBe(401);
});
