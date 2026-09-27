/**
 * Real embeddings via Google's Gemini embeddings API (text-embedding-004 by
 * default, free tier) — used both to embed PDF chunks at ingest time and to
 * embed the caller's question at answer time, so retrieval is a genuine
 * vector-space nearest-neighbor search rather than the keyword/n-gram
 * matcher this replaces.
 */
import { config } from "../config.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// batchEmbedContents caps at 100 requests per call; stay under that.
const BATCH_SIZE = 90;

export function embeddingsEnabled(): boolean {
  return Boolean(config.geminiApiKey);
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const model = config.geminiEmbeddingModel;
  const url = `${API_BASE}/${model}:batchEmbedContents?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: inputs.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
  return (data.embeddings ?? []).map((e) => e.values);
}

/** Embed many texts, batching requests to stay under the API's per-request input limit. */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY missing");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    out.push(...(await embedBatch(batch)));
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embedMany([text]);
  if (!vec) throw new Error("Gemini embeddings returned no vector");
  return vec;
}
