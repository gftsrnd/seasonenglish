import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";

describe("browser CORS contract", () => {
  const pool = new Pool();
  const app = buildApi({
    pool,
    webOrigin: "https://e4s-web.onrender.com"
  });

  beforeAll(async () => { await app.ready(); });
  afterAll(async () => { await app.close(); await pool.end(); });

  it("allows credentialed profile updates from the deployed web origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/learner/profile",
      headers: {
        origin: "https://e4s-web.onrender.com",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://e4s-web.onrender.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(response.headers["access-control-allow-methods"]).split(/,\s*/)).toContain("PUT");
  });
});
