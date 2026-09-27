/**
 * Ingest pipeline: PDF -> text -> token-aware chunks -> embeddings -> local
 * vector index on disk. Run with `npm run ingest` whenever the source PDF
 * changes; the call agent only ever reads the saved index at runtime.
 */
import path from "node:path";
import { config } from "../config.js";
import { chunkText } from "./chunk.js";
import { embedMany } from "./embeddings.js";
import { extractPdfText } from "./pdf.js";
import { saveIndex, type IndexedChunk } from "./store.js";

export type IngestResult = { chunks: number; source: string; indexPath: string };

export async function ingestPdf(pdfPath = config.ragPdfPath): Promise<IngestResult> {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY missing — set it in .env before running `npm run ingest`");

  const source = path.basename(pdfPath);
  const text = await extractPdfText(pdfPath);
  if (!text.trim()) throw new Error(`${pdfPath} produced no extractable text`);

  const chunks = chunkText(text, {
    maxTokens: config.ragChunkTokens,
    overlapTokens: config.ragChunkOverlap,
    source,
  });
  if (!chunks.length) throw new Error(`${pdfPath} produced no chunks`);

  const vectors = await embedMany(chunks.map((c) => c.text));

  const indexed: IndexedChunk[] = chunks.map((chunk, i) => ({
    id: chunk.id,
    text: chunk.text,
    vector: vectors[i] ?? [],
    source,
  }));

  await saveIndex({
    model: config.geminiEmbeddingModel,
    source,
    createdAt: new Date().toISOString(),
    chunks: indexed,
  });

  return { chunks: indexed.length, source, indexPath: config.ragIndexPath };
}
