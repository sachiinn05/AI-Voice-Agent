import { config } from "../config.js";

export type EmbeddingResult = {
  vector: number[];
  model: string;
  dimensions: number;
  provider: string;
};

function localDimensions(): number {
  return config.embedding.dimensions || 384;
}

function openaiDimensions(): number {
  if (config.embedding.dimensions) return config.embedding.dimensions;
  if (/large/i.test(config.embedding.model)) return 3072;
  return 1536;
}

function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic hashed n-gram embedding so ingest still works without an API key. */
export function localEmbedding(text: string, dimensions = localDimensions()): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);

  for (const token of tokens) {
    for (let n = 2; n <= Math.min(4, token.length); n += 1) {
      for (let i = 0; i <= token.length - n; i += 1) {
        const idx = hash32(token.slice(i, i + n)) % dimensions;
        vec[idx] = (vec[idx] ?? 0) + 1;
      }
    }
    const idx = hash32(token) % dimensions;
    vec[idx] = (vec[idx] ?? 0) + 1.5;
  }

  return l2Normalize(vec);
}

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

export function embeddingProvider(): "openai" | "local" {
  if (config.embedding.provider === "local") return "local";
  if (config.embedding.provider === "openai" && config.embedding.apiKey) return "openai";
  return config.embedding.apiKey ? "openai" : "local";
}

export function embeddingStatus() {
  const provider = embeddingProvider();
  return {
    provider,
    model: provider === "local" ? "local-ngram" : config.embedding.model,
    configured: provider === "local" || Boolean(config.embedding.apiKey),
  };
}

async function openaiEmbeddings(inputs: string[]): Promise<number[][]> {
  if (!config.embedding.apiKey) {
    throw new Error("EMBEDDING_API_KEY or OPENAI_API_KEY is missing");
  }

  const body: Record<string, unknown> = {
    model: config.embedding.model,
    input: inputs,
  };
  if (config.embedding.dimensions) body.dimensions = config.embedding.dimensions;

  const res = await fetch(`${config.embedding.baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.embedding.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 220)}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = [...(data.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return rows.map((row) => row.embedding ?? []);
}

export async function embedTexts(texts: string[]): Promise<EmbeddingResult[]> {
  const cleaned = texts.map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!cleaned.length) return [];

  const provider = embeddingProvider();
  if (provider === "local") {
    const model = "local-ngram";
    const dimensions = localDimensions();
    return cleaned.map((text) => ({
      vector: localEmbedding(text, dimensions),
      model,
      dimensions,
      provider,
    }));
  }

  const vectors: number[][] = [];
  const batchSize = 20;
  for (let i = 0; i < cleaned.length; i += batchSize) {
    const batch = cleaned.slice(i, i + batchSize);
    vectors.push(...(await openaiEmbeddings(batch)));
  }

  return cleaned.map((text, i) => {
    const vector = vectors[i] ?? [];
    if (!vector.length) throw new Error(`Embedding missing for chunk ${i}`);
    return {
      vector,
      model: config.embedding.model,
      dimensions: vector.length || openaiDimensions(),
      provider,
    };
  });
}

export async function embedText(text: string): Promise<EmbeddingResult> {
  const [result] = await embedTexts([text]);
  if (!result) throw new Error("Embedding failed");
  return result;
}
