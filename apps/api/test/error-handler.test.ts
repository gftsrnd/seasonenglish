import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { GENERIC_SERVER_ERROR_MESSAGE, registerApiErrorHandler } from "../src/error-handler.js";

function appWith(log = vi.fn()) {
  const app = Fastify();
  registerApiErrorHandler(app, log);
  app.get("/crash", async () => { throw new Error("relation \"learners\" does not exist"); });
  app.get("/ai", async () => { throw Object.assign(new Error("Coach feedback output invalid"), { code: "AI_OUTPUT_INVALID" }); });
  app.get("/node", async () => { throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }); });
  app.get("/conflict", async () => { throw Object.assign(new Error("Bài đã được duyệt."), { statusCode: 409, code: "MONTHLY_DAY_ALREADY_APPROVED" }); });
  app.post("/validated", { schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } }, async () => ({ ok: true }));
  return { app, log };
}

describe("API error handler", () => {
  it("answers an unexpected 500 with { code, message }, the generic Vietnamese text, and logs the details", async () => {
    const { app, log } = appWith();
    const response = await app.inject({ method: "GET", url: "/crash" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: "INTERNAL_ERROR", message: GENERIC_SERVER_ERROR_MESSAGE });
    expect(response.body).not.toContain("learners");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", url: "/crash", status: 500, message: "relation \"learners\" does not exist" }));
  });

  it("keeps an application code on a 5xx but never its internal message", async () => {
    const { app } = appWith();
    expect((await app.inject({ method: "GET", url: "/ai" })).json()).toEqual({ code: "AI_OUTPUT_INVALID", message: GENERIC_SERVER_ERROR_MESSAGE });
    expect((await app.inject({ method: "GET", url: "/node" })).json()).toEqual({ code: "INTERNAL_ERROR", message: GENERIC_SERVER_ERROR_MESSAGE });
  });

  it("keeps a 4xx status, code and message", async () => {
    const { app, log } = appWith();
    const response = await app.inject({ method: "GET", url: "/conflict" });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: "MONTHLY_DAY_ALREADY_APPROVED", message: "Bài đã được duyệt." });
    expect(log).not.toHaveBeenCalled();
  });

  it("answers a schema validation failure with REQUEST_INVALID and Vietnamese text", async () => {
    const { app } = appWith();
    const response = await app.inject({ method: "POST", url: "/validated", payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "REQUEST_INVALID", message: expect.stringMatching(/Dữ liệu gửi lên chưa hợp lệ/u) });
  });

  it("answers a malformed JSON body with an HTTP code, not a Fastify one", async () => {
    const { app } = appWith();
    const response = await app.inject({ method: "POST", url: "/validated", payload: "{", headers: { "content-type": "application/json" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "HTTP_400" });
  });
});
