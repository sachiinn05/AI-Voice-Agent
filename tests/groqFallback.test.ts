import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const CANDIDATES = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

// Regression test for the bug where a 429 (rate limit) on one Groq model
// aborted the whole request instead of trying the other free models. Groq's
// free-tier rate limits are per-model ("Rate limit reached for model
// `openai/gpt-oss-120b`..."), so the other candidates in MODEL_CANDIDATES
// should still be usable in the same call.
describe("groqChat model rotation on 429", () => {
  let calls: Array<{ url: string; model?: string }> = [];

  beforeEach(() => {
    calls = [];
    // groqChat() only proceeds if GROQ_API_KEY is set. fetch is fully
    // mocked below, so a dummy key is enough — this keeps the test
    // independent of a real .env / CI secret.
    process.env.GROQ_API_KEY = "test-dummy-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        calls.push({ url, model: body.model });

        if (url === GROQ_MODELS_URL) {
          return new Response(JSON.stringify({ data: CANDIDATES.map((id) => ({ id })) }), { status: 200 });
        }

        if (url === GROQ_URL) {
          if (body.model === "openai/gpt-oss-120b") {
            return new Response(
              JSON.stringify({
                error: { message: "Rate limit reached for model `openai/gpt-oss-120b` on requests per minute (RPM)" },
              }),
              { status: 429 },
            );
          }
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "acknowledge" } }] }),
            { status: 200 },
          );
        }

        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls through to the next free model instead of throwing on 429", async () => {
    const { groqChat } = await import("../src/llm/groq.js");
    const text = await groqChat([{ role: "user", content: "hi" }]);

    expect(text).toBe("acknowledge");
    const chatAttempts = calls.filter((c) => c.url === GROQ_URL);
    expect(chatAttempts[0]?.model).toBe("openai/gpt-oss-120b");
    expect(chatAttempts.some((c) => c.model !== "openai/gpt-oss-120b")).toBe(true);
  });
});
