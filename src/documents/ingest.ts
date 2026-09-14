import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { embedTexts } from "../embeddings/service.js";
import { mongoConfigured } from "../db/mongo.js";
import { deleteDocument, listDocuments, replaceDocumentChunks, type KnowledgeDocument } from "../rag/vectorStore.js";
import { chunkPages } from "./chunker.js";
import { extractPdfPages } from "./pdf.js";

export function safePdfName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export async function ensureKnowledgeDir(): Promise<string> {
  await mkdir(config.knowledgeDir, { recursive: true });
  return config.knowledgeDir;
}

export async function ingestPdfBuffer(fileName: string, buffer: Buffer): Promise<KnowledgeDocument> {
  if (!mongoConfigured()) {
    throw new Error("Set MONGODB_URI before ingesting company PDFs.");
  }

  const { pages, numPages } = await extractPdfPages(buffer);
  const chunks = chunkPages(pages);
  if (!chunks.length) {
    throw new Error(`${fileName} has no extractable text`);
  }

  const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
  if (embeddings.length !== chunks.length) {
    throw new Error("Embedding count did not match chunk count");
  }

  return replaceDocumentChunks({
    fileName,
    chunks,
    embeddings,
    pageCount: numPages,
  });
}

export async function ingestPdfFile(filePath: string): Promise<KnowledgeDocument> {
  const buffer = await readFile(filePath);
  return ingestPdfBuffer(path.basename(filePath), buffer);
}

export async function ingestKnowledgeFolder(): Promise<{
  ingested: KnowledgeDocument[];
  skipped: string[];
}> {
  const dir = await ensureKnowledgeDir();
  const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".pdf"));
  const ingested: KnowledgeDocument[] = [];
  const skipped: string[] = [];

  for (const name of names) {
    try {
      ingested.push(await ingestPdfFile(path.join(dir, name)));
    } catch (error) {
      skipped.push(`${name}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  return { ingested, skipped };
}

export async function saveUploadedPdf(originalName: string, buffer: Buffer): Promise<string> {
  const dir = await ensureKnowledgeDir();
  const name = safePdfName(originalName);
  const stamp = createHash("sha1").update(buffer).digest("hex").slice(0, 8);
  const unique = existsSync(path.join(dir, name))
    ? name.replace(/\.pdf$/i, `-${stamp}.pdf`)
    : name;
  const dest = path.join(dir, unique);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(dest, buffer);
  return dest;
}

export async function listKnowledgeFiles(): Promise<Array<{ fileName: string; path: string }>> {
  const dir = await ensureKnowledgeDir();
  const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".pdf"));
  return names.map((fileName) => ({ fileName, path: path.join(dir, fileName) }));
}

export async function removeKnowledgeDocument(documentId: string, fileName?: string): Promise<void> {
  await deleteDocument(documentId);
  if (!fileName) return;
  const filePath = path.join(config.knowledgeDir, fileName);
  if (existsSync(filePath)) await unlink(filePath);
}

export { listDocuments };
