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

function notEnough(language: PreferredLanguage): string {
  if (language === "hi-IN-hinglish") {
    return "Is point ki exact detail mere company documents mein nahi hai, isliye main guess nahi karunga. Main aapko team se connect kar sakta hoon.";
  }
  return "I don't have enough information on that in our company documents, so I won't guess. I can connect you with a teammate who can help.";
}

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
    if (spoken.length < 12) {
      return {
        answer: firstSentences(strong[0]?.chunkText ?? empty.answer),
        sources: toSources(strong),
        grounded: true,
      };
    }

    const refused = /do not have enough information|documents mein nahi|guess nahi karunga/i.test(spoken);
    if (refused) {
      return {
        answer: firstSentences(strong[0]?.chunkText ?? empty.answer),
        sources: toSources(strong),
        grounded: true,
      };
    }
    return {
      answer: spoken,
      sources: toSources(strong),
      grounded: true,
    };
  } catch (error) {
    console.warn("RAG LLM failed:", error instanceof Error ? error.message : error);
    return {
      answer: firstSentences(strong[0]?.chunkText ?? empty.answer),
      sources: toSources(strong),
      grounded: true,
    };
  }
}
