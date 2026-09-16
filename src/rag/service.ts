import { config } from "../config.js";
import { embeddingProvider } from "../embeddings/service.js";
import { groqChat, groqEnabled, stripReasoning } from "../llm/groq.js";
import type { KnowledgeSource, PreferredLanguage } from "../types.js";
import { searchKnowledge, type RetrievedChunk } from "./vectorStore.js";

export type RagAnswer = {
  answer: string;
  sources: KnowledgeSource[];
  grounded: boolean;
};

const GROUNDED_RULES = `You are the AI voice assistant for ${config.companyName}.

Answer company-specific questions using only the provided company knowledge.

If the retrieved company documents do not contain enough information to answer the question, do not invent an answer.
Say that you do not have enough information and offer to connect the customer with a human representative when appropriate.

Never invent:
- prices
- product features
- policies
- guarantees
- company facts
- discounts
- availability
- legal information

Use the retrieved context as the source of truth.
These uploaded documents are the official company knowledge. Use them as facts even if a document says it is a demo or fictional.
Keep answers short and natural because this is a live voice call. One or two spoken sentences. No lists, no markdown.`;

function minScore(): number {
  if (config.rag.minScore) return config.rag.minScore;
  return embeddingProvider() === "local" ? 0.12 : 0.5;
}

/**
 * Don't-know reply. Still refuses to guess (never invent facts) — but this is
 * a sales call, so pivot to the demo instead of "let me connect you to a
 * human", which in real transcripts read as the agent giving up mid-call.
 */
function notEnough(language: PreferredLanguage): string {
  const who = config.founderName || "our team";
  if (language === "hi-IN-hinglish") {
    return `Achha sawal hai — iska exact answer mere paas abhi nahi hai, aur main guess nahi karunga. Yeh exactly wahi cheez hai jo ${who} demo mein detail se batayenge.`;
  }
  return `Good question — I don't have the exact answer on that, and I won't guess. It's exactly the kind of thing ${who} walks through in the demo.`;
}

// Ways the model phrases "I don't know" that should be treated as a refusal,
// not spoken as-is. English + Hinglish, from real call transcripts.
const REFUSAL_RE =
  /do not have enough information|don'?t have (enough|the) (information|details)|not sure what you'?re referring|documents mein nahi|guess nahi karunga|jankari nahi|jaankari nahi|pata nahi|human representative|connect (you|aapko)|representative se|team se (jod|connect)/i;

function languageHint(language: PreferredLanguage): string {
  if (language === "hi-IN-hinglish") return "Speak simple spoken Hinglish only.";
  if (language === "en-IN") return "Speak spoken Indian English only.";
  return "Speak spoken US English only.";
}

function firstSentences(text: string, max = 2): string {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, max)
    .join(" ")
    .slice(0, 280);
}

function toSources(chunks: RetrievedChunk[]): KnowledgeSource[] {
  return chunks.map((chunk) => ({
    fileName: chunk.fileName,
    pageNumber: chunk.pageNumber,
    chunkIndex: chunk.chunkIndex,
    relevanceScore: Number(chunk.relevanceScore.toFixed(3)),
  }));
}

async function englishSearchQuery(question: string): Promise<string> {
  if (!groqEnabled()) return question;
  if (/^[a-z0-9 ?.,'"$-]+$/i.test(question.trim())) return question;
  try {
    const raw = await groqChat(
      [
        {
          role: "system",
          content:
            "Rewrite this as a short English search query for company PDFs. Output only the query, no quotes.",
        },
        { role: "user", content: question },
      ],
      { maxTokens: 40, temperature: 0 },
    );
    const cleaned = stripReasoning(raw).replace(/^["']|["']$/g, "");
    return cleaned.length > 3 ? cleaned : question;
  } catch {
    return question;
  }
}

export async function answerCompanyQuestion(input: {
  question: string;
  language: PreferredLanguage;
}): Promise<RagAnswer> {
  const empty: RagAnswer = { answer: notEnough(input.language), sources: [], grounded: false };

  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await searchKnowledge(input.question, config.rag.topK);
    if (!chunks.some((chunk) => chunk.chunkText.trim())) {
      const lookup = await englishSearchQuery(input.question);
      chunks = await searchKnowledge(lookup, config.rag.topK);
    }
  } catch (error) {
    console.warn("RAG search failed:", error instanceof Error ? error.message : error);
    return empty;
  }

  let strong = chunks.filter((chunk) => chunk.relevanceScore >= minScore() && chunk.chunkText.trim());
  if (!strong.length) {
    strong = chunks.filter((chunk) => chunk.chunkText.trim()).slice(0, Math.min(3, chunks.length));
  }
  if (!strong.length) return empty;

  const context = strong
    .map((chunk, i) => {
      const where = [chunk.fileName, chunk.pageNumber ? `p.${chunk.pageNumber}` : ""]
        .filter(Boolean)
        .join(" ");
      return `[${i + 1}] (${where})\n${chunk.chunkText}`;
    })
    .join("\n\n");

  if (!groqEnabled()) {
    return {
      answer: firstSentences(strong[0]?.chunkText ?? empty.answer),
      sources: toSources(strong),
      grounded: true,
    };
  }

  try {
    const raw = await groqChat(
      [
        {
          role: "system",
          content: `${GROUNDED_RULES}\n${languageHint(input.language)}\nOutput ONLY the spoken answer. No thinking, no tags, no labels.`,
        },
        {
          role: "user",
          content: `Company knowledge:\n${context}\n\nCustomer question: ${input.question}\n\nAnswer from the knowledge in 1-2 spoken sentences.`,
        },
      ],
      { maxTokens: 180, temperature: 0.1 },
    );

    const spoken = firstSentences(stripReasoning(raw).replace(/^["']|["']$/g, ""));

    // If the model couldn't answer from the context, say so and pivot —
    // do NOT read the top PDF chunk aloud instead. In real calls that
    // produced a DNC-policy paragraph in reply to "the calls we miss…".
    if (spoken.length < 12 || REFUSAL_RE.test(spoken)) {
      return { answer: notEnough(input.language), sources: toSources(strong), grounded: false };
    }
    return {
      answer: spoken,
      sources: toSources(strong),
      grounded: true,
    };
  } catch (error) {
    console.warn("RAG LLM failed:", error instanceof Error ? error.message : error);
    return { answer: notEnough(input.language), sources: toSources(strong), grounded: false };
  }
}
