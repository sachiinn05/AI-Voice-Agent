import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getCollection, mongoConfigured } from "../db/mongo.js";
import { cosineSimilarity, embedText } from "../embeddings/service.js";
import type { TextChunk } from "../documents/chunker.js";
import type { EmbeddingResult } from "../embeddings/service.js";

export type KnowledgeChunk = {
  companyId: string;
  documentId: string;
  fileName: string;
  chunkText: string;
  chunkIndex: number;
  embedding: number[];
  embeddingModel: string;
  pageNumber?: number;
  metadata: {
    sectionTitle?: string;
    uploadedAt: string;
  };
};

export type KnowledgeDocument = {
  documentId: string;
  companyId: string;
  fileName: string;
  pageCount: number;
  chunkCount: number;
  embeddingModel: string;
  uploadedAt: string;
  status: "ready" | "failed";
};

export type RetrievedChunk = {
  chunkText: string;
  fileName: string;
  pageNumber?: number;
  chunkIndex: number;
  documentId: string;
  relevanceScore: number;
};

function keywordBoost(query: string, text: string): number {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 3);
  if (!terms.length) return 0;
  const hay = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (hay.includes(term)) hits += 1;
  }
  return (hits / terms.length) * 0.18;
}

export async function replaceDocumentChunks(input: {
  fileName: string;
  chunks: TextChunk[];
  embeddings: EmbeddingResult[];
  pageCount: number;
}): Promise<KnowledgeDocument> {
  if (!mongoConfigured()) throw new Error("MONGODB_URI is not set");

  const chunksCol = await getCollection<KnowledgeChunk>("knowledge_chunks");
  const docsCol = await getCollection<KnowledgeDocument>("knowledge_documents");
  const uploadedAt = new Date().toISOString();
  const documentId = randomUUID();

  await chunksCol.deleteMany({ companyId: config.companyId, fileName: input.fileName });
  await docsCol.deleteMany({ companyId: config.companyId, fileName: input.fileName });

  const rows: KnowledgeChunk[] = input.chunks.map((chunk, i) => ({
    companyId: config.companyId,
    documentId,
    fileName: input.fileName,
    chunkText: chunk.text,
    chunkIndex: chunk.chunkIndex,
    embedding: input.embeddings[i]?.vector ?? [],
    embeddingModel: input.embeddings[i]?.model ?? "",
    pageNumber: chunk.pageNumber,
    metadata: {
      sectionTitle: chunk.sectionTitle,
      uploadedAt,
    },
  }));

  if (rows.length) await chunksCol.insertMany(rows);

  const doc: KnowledgeDocument = {
    documentId,
    companyId: config.companyId,
    fileName: input.fileName,
    pageCount: input.pageCount,
    chunkCount: rows.length,
    embeddingModel: input.embeddings[0]?.model ?? "",
    uploadedAt,
    status: "ready",
  };
  await docsCol.insertOne(doc);
  return doc;
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  if (!mongoConfigured()) return [];
  const docsCol = await getCollection<KnowledgeDocument>("knowledge_documents");
  return docsCol.find({ companyId: config.companyId }).sort({ uploadedAt: -1 }).toArray();
}

export async function deleteDocument(documentId: string): Promise<void> {
  if (!mongoConfigured()) throw new Error("MONGODB_URI is not set");
  const chunksCol = await getCollection<KnowledgeChunk>("knowledge_chunks");
  const docsCol = await getCollection<KnowledgeDocument>("knowledge_documents");
  await chunksCol.deleteMany({ companyId: config.companyId, documentId });
  await docsCol.deleteOne({ companyId: config.companyId, documentId });
}

export async function countChunks(): Promise<number> {
  if (!mongoConfigured()) return 0;
  const chunksCol = await getCollection<KnowledgeChunk>("knowledge_chunks");
  return chunksCol.countDocuments({ companyId: config.companyId });
}

async function atlasSearch(queryVector: number[], topK: number): Promise<RetrievedChunk[]> {
  const chunksCol = await getCollection<KnowledgeChunk>("knowledge_chunks");
  const hits = await chunksCol
    .aggregate<RetrievedChunk>([
      {
        $vectorSearch: {
          index: config.vectorIndexName,
          path: "embedding",
          queryVector,
          numCandidates: Math.max(40, topK * 10),
          limit: topK,
          filter: { companyId: { $eq: config.companyId } },
        },
      },
      {
        $project: {
          chunkText: 1,
          fileName: 1,
          pageNumber: 1,
          chunkIndex: 1,
          documentId: 1,
          relevanceScore: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
  return hits;
}

async function cosineSearch(queryVector: number[], topK: number, query: string): Promise<RetrievedChunk[]> {
  const chunksCol = await getCollection<KnowledgeChunk>("knowledge_chunks");
  const rows = await chunksCol
    .find({ companyId: config.companyId })
    .project({ chunkText: 1, fileName: 1, pageNumber: 1, chunkIndex: 1, documentId: 1, embedding: 1 })
    .toArray();

  return rows
    .map((row) => ({
      chunkText: row.chunkText,
      fileName: row.fileName,
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      documentId: row.documentId,
      relevanceScore: cosineSimilarity(queryVector, row.embedding ?? []) + keywordBoost(query, row.chunkText),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK);
}

export async function searchKnowledge(question: string, topK = config.rag.topK): Promise<RetrievedChunk[]> {
  if (!mongoConfigured()) return [];
  const embedded = await embedText(question);
  let atlas: RetrievedChunk[] = [];
  try {
    atlas = await atlasSearch(embedded.vector, topK);
  } catch (error) {
    console.warn(
      "Atlas $vectorSearch unavailable, using in-process cosine:",
      error instanceof Error ? error.message : error,
    );
  }
  const local = await cosineSearch(embedded.vector, topK, question);
  const merged = new Map<string, RetrievedChunk>();
  for (const hit of [...atlas, ...local]) {
    const key = `${hit.documentId}:${hit.chunkIndex}`;
    const prev = merged.get(key);
    if (!prev || hit.relevanceScore > prev.relevanceScore) merged.set(key, hit);
  }
  return [...merged.values()].sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, topK);
}
