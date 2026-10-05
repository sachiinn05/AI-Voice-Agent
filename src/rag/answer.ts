/**
 * Real RAG for mid-call questions: embed the caller's question, retrieve the
 * nearest chunks from the PDF's vector index (src/rag/store.ts), and have
 * Groq write the spoken answer grounded strictly in those chunks — replacing
 * the hand-written `faq:` block that used to be the only source of answers.
 *
 * Same contract the old script-FAQ matcher had: a clear no-answer ("NONE")
 * or a low retrieval score means "the source doesn't cover this" — the
 * caller hears the honest pivot line, never an invented fact.
 */
import { groqChat, groqEnabled, stripReasoning } from "../llm/groq.js";
import type { Lead, PreferredLanguage } from "../types.js";
import { embedOne, embeddingsEnabled } from "./embeddings.js";
import { loadIndex, search, type RagIndex } from "./store.js";

export type RagMatch = {
  id: string;
  answer: string;
  score: number;
  via: "rag";
};

// Cosine similarity on real embeddings sits in a different range than the
// old hashed n-gram matcher's. Below FLOOR the closest chunk isn't actually
// about the question; above it, it's worth spending a Groq call to write a
// grounded answer (Groq itself is the final judge — it can still say NONE).
const FLOOR = 0.2;
const TOP_K = 4;
const MAX_CONTEXT_CHARS = 6000;

let cachedIndex: RagIndex | null | undefined;

async function getIndex(): Promise<RagIndex | null> {
  if (cachedIndex === undefined) cachedIndex = await loadIndex();
  return cachedIndex;
}

/** Test hook: force a reload of the on-disk index. */
export function resetRagIndex(): void {
  cachedIndex = undefined;
}

function languageHint(language: PreferredLanguage): string {
  if (language === "hi-IN-hinglish") return "Reply in simple Hinglish only.";
  if (language === "en-IN") return "Reply in spoken Indian English only.";
  return "Reply in spoken US English only.";
}

function buildContext(hits: Array<{ chunk: { text: string } }>): string {
  let out = "";
  for (const { chunk } of hits) {
    if (out.length + chunk.text.length > MAX_CONTEXT_CHARS) break;
    out += (out ? "\n---\n" : "") + chunk.text;
  }
  return out;
}

/**
 * Find and phrase an answer to `question` from the ingested PDF, or null if
 * the source doesn't cover it (embeddings/Groq unavailable, no index built
 * yet, retrieval below the confidence floor, or Groq itself says NONE).
 */
export async function answerFromPdf(
  question: string,
  _lead: Lead,
  language: PreferredLanguage,
): Promise<RagMatch | null> {
  if (!embeddingsEnabled() || !groqEnabled()) return null;

  const index = await getIndex();
  if (!index || !index.chunks.length) return null;

  let qvec: number[];
  try {
    qvec = await embedOne(question);
  } catch {
    // A live call must never crash on a Gemini blip (rate limit, network) —
    // fall back to the honest "don't know" pivot, same as every other
    // failure mode here.
    return null;
  }
  const hits = search(index, qvec, TOP_K);
  const best = hits[0];
  if (!best || best.score < FLOOR) return null;

  const context = buildContext(hits);

  try {
    const raw = await groqChat(
      [
        {
          role: "system",
          content: `${languageHint(language)} You are answering a caller's question on a live phone call, using ONLY the reference material below. Reply with 1-2 short spoken sentences, no lists, no markdown. Do not add any fact not present in the material. If the material does not answer the question, reply with exactly: NONE`,
        },
        {
          role: "user",
          content: `Reference material:\n${context}\n\nCaller asked: "${question}"`,
        },
      ],
      { maxTokens: 220, temperature: 0.2 },
    );
    const cleaned = stripReasoning(raw).replace(/^["']|["']$/g, "").trim();
    if (!cleaned || /^none\.?$/i.test(cleaned)) return null;

    return { id: best.chunk.id, answer: cleaned, score: best.score, via: "rag" };
  } catch {
    return null;
  }
}
