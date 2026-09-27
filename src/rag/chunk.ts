/**
 * Token-aware chunking for RAG ingestion. Uses the real cl100k_base BPE
 * tokenizer (same one OpenAI's embedding models are trained against) so a
 * "300 token" chunk actually means 300 embedding-model tokens, not 300 words.
 * Chunks overlap so an answer that straddles a chunk boundary in the source
 * PDF still lands whole inside at least one chunk.
 */
import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

export type Chunk = {
  id: string;
  text: string;
  tokenCount: number;
};

let encoder: Tiktoken | null = null;

function enc(): Tiktoken {
  encoder ??= new Tiktoken(cl100k_base);
  return encoder;
}

export function countTokens(text: string): number {
  return enc().encode(text).length;
}

/**
 * Split `text` into overlapping chunks of roughly `maxTokens` tokens, with
 * `overlapTokens` tokens repeated at the start of each chunk after the first.
 * Splits happen on paragraph/sentence boundaries where possible so a chunk
 * doesn't end mid-sentence.
 */
export function chunkText(
  text: string,
  { maxTokens = 300, overlapTokens = 60, source = "pdf" }: { maxTokens?: number; overlapTokens?: number; source?: string } = {},
): Chunk[] {
  const encoder_ = enc();
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [];

  // Split into sentence-ish units first, then pack them into token-budgeted
  // chunks. Cheaper and more predictable than sliding a token window blindly
  // through the encoded stream.
  const units = normalized
    .split(/(?<=[.!?।\n])\s+/)
    .map((u) => u.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (!current.length) return;
    const chunkStr = current.join(" ").trim();
    if (chunkStr) {
      chunks.push({ id: `${source}-${chunks.length}`, text: chunkStr, tokenCount: countTokens(chunkStr) });
    }
  };

  for (const unit of units) {
    const unitTokens = encoder_.encode(unit).length;

    if (unitTokens > maxTokens) {
      // A single unit (rare: a huge unbroken paragraph) longer than the
      // budget — flush what's pending, then hard-split this unit by tokens
      // so nothing is silently dropped.
      flush();
      current = [];
      currentTokens = 0;
      const ids = encoder_.encode(unit);
      for (let i = 0; i < ids.length; i += maxTokens) {
        const slice = ids.slice(i, i + maxTokens);
        chunks.push({ id: `${source}-${chunks.length}`, text: encoder_.decode(slice), tokenCount: slice.length });
      }
      continue;
    }

    if (currentTokens + unitTokens > maxTokens && current.length) {
      flush();
      // Carry the tail of the previous chunk forward as overlap.
      const overlapUnits: string[] = [];
      let overlapCount = 0;
      for (let i = current.length - 1; i >= 0 && overlapCount < overlapTokens; i -= 1) {
        const u = current[i] ?? "";
        overlapUnits.unshift(u);
        overlapCount += encoder_.encode(u).length;
      }
      current = overlapUnits;
      currentTokens = overlapCount;
    }

    current.push(unit);
    currentTokens += unitTokens;
  }
  flush();

  return chunks;
}
