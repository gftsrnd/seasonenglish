import Fastify from "fastify";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { registerManagerRoutes } from "../src/modules/manager/routes.js";

it.each(["placement", "final"])("returns 404 for the retired %s exam change request", async (kind) => {
  const pool = new Pool();
  const app = Fastify();
  registerManagerRoutes(app, pool);
  try {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/operator/${kind}-test-change-request`,
      payload: { developerEmail: "dev@example.test", note: "Please change the exam." }
    });
    expect(response.statusCode).toBe(404);
  } finally {
    await app.close();
    await pool.end();
  }
});
