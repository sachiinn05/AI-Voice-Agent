/**
 * A local "vector DB": embedded chunks persisted as one JSON file
 * (data/rag-index.json), searched with brute-force cosine similarity. No
 * server, no account, no native build step — for the few hundred chunks a
 * single PDF produces this is fast (<10ms) and exact (no ANN recall loss),
 * which is what actually matters at this scale. Swap in a hosted vector DB
 * later by giving it the same load/search shape if the corpus grows past a
 * single-process, single-file fit.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export type IndexedChunk = {
  id: string;
  text: string;
  vector: number[];
  source: string;
};

export type RagIndex = {
  model: string;
  source: string;
  createdAt: string;
  chunks: IndexedChunk[];
};

export async function saveIndex(index: RagIndex, file = config.ragIndexPath): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(index), "utf8");
}

export async function loadIndex(file = config.ragIndexPath): Promise<RagIndex | null> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as RagIndex;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export type SearchHit = { chunk: IndexedChunk; score: number };

/** Brute-force top-k nearest neighbors by cosine similarity. */
export function search(index: RagIndex, queryVector: number[], k: number): SearchHit[] {
  return index.chunks
    .map((chunk) => ({ chunk, score: cosine(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
