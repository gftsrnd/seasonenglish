import { AI_TASKS, createAiService, createGroqProvider } from "@e4s/ai";
import { Pool } from "pg";
import { buildApi } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const aiRunner = process.env.GROQ_API_KEY
  ? createAiService({
      registry: AI_TASKS,
      provider: createGroqProvider({
        apiKey: process.env.GROQ_API_KEY,
        ...(process.env.GROQ_MODEL ? { model: process.env.GROQ_MODEL } : {})
      }),
      loadPrompt: async () => ""
    })
  : undefined;
const app = buildApi({
  pool,
  allowDemoLogin: process.env.ALLOW_DEMO_LOGIN === "true",
  secureCookies: process.env.COOKIE_SECURE === "true",
  ...(aiRunner ? { aiRunner } : {})
});
app.get("/api/health", async () => {
  await pool.query("select 1");
  return { status: "ok" };
});
const port = Number(process.env.PORT ?? 3001);
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port });
const stop = async () => { await app.close(); await pool.end(); process.exit(0); };
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
