import { describe, expect, it } from "vitest";
import { chunkText, countTokens } from "../src/rag/chunk.js";
import { cosine, search, type RagIndex } from "../src/rag/store.js";

// The parts of the RAG pipeline that don't need OPENAI_API_KEY / GROQ_API_KEY:
// token-aware chunking and vector search over a saved index. Embedding and
// grounded-generation (src/rag/embeddings.ts, src/rag/answer.ts) need a live
// OpenAI/Groq key and aren't exercised in CI, same as the Groq-dependent
// paths elsewhere in this suite.

describe("chunkText", () => {
  it("splits long text into chunks no larger than maxTokens", () => {
    const paragraph = "This is a sentence about pricing and plans. ".repeat(80);
    const chunks = chunkText(paragraph, { maxTokens: 50, overlapTokens: 10, source: "test" });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(50);
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps a short text as a single chunk", () => {
    const chunks = chunkText("This is a short handbook excerpt about our pricing.", { maxTokens: 300, source: "test" });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain("pricing");
  });

  it("returns nothing for empty input", () => {
    expect(chunkText("   ", { source: "test" })).toEqual([]);
  });

  it("consecutive chunks overlap so an answer near a boundary survives in one chunk", () => {
    const paragraph = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about the product.`).join(" ");
    const chunks = chunkText(paragraph, { maxTokens: 40, overlapTokens: 15, source: "test" });
    expect(chunks.length).toBeGreaterThan(1);
    const firstTail = chunks[0]?.text.slice(-30) ?? "";
    const firstWord = firstTail.split(" ").filter(Boolean).pop();
    if (firstWord) expect(chunks[1]?.text).toContain(firstWord);
  });
});

describe("countTokens", () => {
  it("counts more tokens for longer text", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
    expect(countTokens("hello world, this is a much longer sentence with many more words")).toBeGreaterThan(
      countTokens("hello world"),
    );
  });
});

describe("cosine", () => {
  it("is 1 for identical vectors and 0 for orthogonal ones", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("search", () => {
  const index: RagIndex = {
    model: "test-model",
    source: "test.pdf",
    createdAt: new Date().toISOString(),
    chunks: [
      { id: "a", text: "pricing info", vector: [1, 0, 0], source: "test.pdf" },
      { id: "b", text: "unrelated", vector: [0, 1, 0], source: "test.pdf" },
      { id: "c", text: "closely related to pricing", vector: [0.9, 0.1, 0], source: "test.pdf" },
    ],
  };

  it("ranks the nearest vectors first", () => {
    const hits = search(index, [1, 0, 0], 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.chunk.id).toBe("a");
    expect(hits[1]?.chunk.id).toBe("c");
  });
});
