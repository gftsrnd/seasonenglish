import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";
import { buildIllustrationPrompt, createIllustrationProviderFromEnvironment, createOpenAiIllustrationProvider, downscalePng, runMonthlyIllustrationJob } from "./monthly-illustrations.js";

function solidPng(size: number): Buffer {
  const png = new PNG({ width: size, height: size });
  for (let index = 0; index < png.data.length; index += 4) { png.data[index] = 200; png.data[index + 1] = 100; png.data[index + 2] = 50; png.data[index + 3] = 255; }
  return PNG.sync.write(png);
}

const context = { frameworkId: "f1", month: "2026-11", cefr: "A1", locked: false, theme: { title: "Client feedback meetings", context: "Office" }, coreTerms: [] };

describe("monthly illustrations", () => {
  it("asks for one on-theme picture with no text, using the Vietnamese meaning and an optional note", () => {
    const prompt = buildIllustrationPrompt(context, { word: "clear", meaning: "rõ ràng", type: "adjective" }, "vẽ cảnh họp");
    expect(prompt).toContain("rõ ràng");
    expect(prompt).toContain("Client feedback meetings");
    expect(prompt).toContain("not a neighbouring word");
    expect(prompt).toContain("Simple but complete");
    expect(prompt).toContain("64x64 thumbnail");
    expect(prompt).toContain("Operator note: vẽ cảnh họp");
    expect(prompt).toMatch(/no text/i);
  });

  it("downscales a square PNG to 256x256 and keeps the colour", () => {
    const out = downscalePng(solidPng(1024));
    const decoded = PNG.sync.read(out.body);
    expect(out.mimeType).toBe("image/png");
    expect([decoded.width, decoded.height]).toEqual([256, 256]);
    expect(Array.from(decoded.data.subarray(0, 4))).toEqual([200, 100, 50, 255]);
  });

  it("reads the key and model only from the environment", () => {
    expect(createIllustrationProviderFromEnvironment({})).toBeUndefined();
    expect(createIllustrationProviderFromEnvironment({ OPENAI_API_KEY: "k" })).toBeUndefined();
    expect(createIllustrationProviderFromEnvironment({ OPENAI_API_KEY: "k", OPENAI_IMAGE_MODEL: "image-model" })?.model).toBe("image-model");
  });

  it("calls the images endpoint with the configured model and decodes base64 output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: solidPng(8).toString("base64") }] }), { status: 200 }));
    const provider = createOpenAiIllustrationProvider({ apiKey: "secret", model: "image-model", fetchImpl: fetchImpl as unknown as typeof fetch });
    const image = await provider.generate("draw");
    expect(image.mimeType).toBe("image/png");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ model: "image-model", prompt: "draw", n: 1 });
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer secret" });
  });

  it("stores each generated picture and records failures per word", async () => {
    const saves: Array<{ word: string; status: string }> = [];
    const repositories = {
      monthlyContent: { saveFrameworkIllustration: vi.fn(async (input: { word: string; status: string }) => { saves.push({ word: input.word, status: input.status }); return true; }) },
      files: { createForOwner: vi.fn(async () => ({ id: "file" })) }
    };
    const storage = { putObject: vi.fn(async () => undefined), deleteObject: vi.fn() };
    const provider = { model: "m", generate: vi.fn(async (prompt: string) => { if (prompt.includes("broken")) throw new Error("refused"); return { body: solidPng(512), mimeType: "image/png" }; }) };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const result = await runMonthlyIllustrationJob({
      repositories: repositories as never, storage: storage as never, provider, context, actorId: "user-1", concurrency: 2,
      words: [{ word: "client", meaning: "khách hàng", type: "noun" }, { word: "broken", meaning: "hỏng", type: "adjective" }]
    });
    vi.useRealTimers();
    expect(result).toEqual({ ready: 1, failed: 1 });
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(saves.filter((save) => save.word === "client").map((save) => save.status)).toEqual(["pending", "generating", "ready"]);
    expect(saves.filter((save) => save.word === "broken").map((save) => save.status)).toEqual(["pending", "generating", "failed"]);
  });
});

describe("monthly illustrations via the Responses API", () => {
  it("switches to the image_generation tool when the configured model is not an image model", async () => {
    const png = solidPng(8).toString("base64");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "The model 'gpt-6-luna' does not exist.", code: "invalid_value" } }), { status: 400 }))
      .mockImplementation(async () => new Response(JSON.stringify({ output: [{ type: "message" }, { type: "image_generation_call", status: "completed", result: png }] }), { status: 200 }));
    const provider = createOpenAiIllustrationProvider({ apiKey: "k", model: "gpt-6-luna", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await provider.generate("draw")).mimeType).toBe("image/png");
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ model: "gpt-6-luna", input: "draw", tools: [{ type: "image_generation" }] });
    await provider.generate("again");
    expect(fetchImpl.mock.calls[2]![0]).toBe("https://api.openai.com/v1/responses");
  });
});
