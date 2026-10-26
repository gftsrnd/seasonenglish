import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blueprint = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
const [apiService = "", webService = ""] = blueprint.split(/\r?\n\s*- type: web\r?\n/).slice(1);

describe("Render blueprint secrets", () => {
  it("configures provider and email secrets only on the API service", () => {
    expect(apiService).toMatch(/- key: AI_PROVIDER\s+value: anthropic/);
    expect(apiService).toMatch(/- key: ANTHROPIC_API_KEY\s+sync: false/);
    expect(apiService).toMatch(/- key: ANTHROPIC_MODEL\s+value: claude-haiku-5-5/);
    expect(apiService).toMatch(/- key: PIXABAY_API_KEY\s+sync: false/);
    expect(apiService).toMatch(/- key: RESEND_API_KEY\s+sync: false/);
    expect(apiService).toMatch(/- key: RESEND_FROM_EMAIL\s+sync: false/);

    expect(webService).not.toMatch(/ANTHROPIC_API_KEY|PIXABAY_API_KEY|RESEND_API_KEY|RESEND_FROM_EMAIL/);
  });

  it("does not seed or validate scenario accounts during production startup", () => {
    expect(apiService).not.toMatch(/prepare-local|E4S_SEED_SCENARIOS|E4S_ALLOW_REMOTE_SCENARIOS/);
    expect(apiService).toMatch(/startCommand:.*@e4s\/api start/);
  });
});
